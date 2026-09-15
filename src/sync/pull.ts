import { and, eq } from 'drizzle-orm';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { outbox, syncCursors } from '../db/schema';
import { supabase } from '../supabase/client';
import { recordConflict } from './conflicts';
import { getCursorValue, setCursorValue } from './cursors';
import { DbOrTx } from './outbox';
import { SyncableTableName, SYNCABLE_TABLE_NAMES, upsertLocalRow } from './tables';

const PAGE_SIZE = 200;

// Lets the UI know the *apiaries* pull specifically has been attempted —
// index.tsx waits on this (not the full runSync completion in
// useHasAttemptedSync) before deciding "this account has no apiaries, send
// them to setup". Waiting on the whole sync cycle meant that on an account
// with a lot of accumulated data, the colonies/records/photos pulls after
// apiaries could easily push past the setup-redirect timeout, so a
// returning user with real apiaries would flash through to "register your
// first apiary" before their existing one had a chance to land. Apiaries is
// pulled first (see SYNCABLE_TABLE_NAMES), so this fires much sooner.
let hasAttemptedApiariesPull = false;
const apiariesPullListeners = new Set<() => void>();

export function getHasAttemptedApiariesPull() {
  return hasAttemptedApiariesPull;
}

export function subscribeApiariesPullAttempt(listener: () => void): () => void {
  apiariesPullListeners.add(listener);
  return () => apiariesPullListeners.delete(listener);
}

export async function pullAll(): Promise<void> {
  for (const tableName of SYNCABLE_TABLE_NAMES) {
    try {
      await pullTable(tableName);
    } finally {
      if (tableName === 'apiaries' && !hasAttemptedApiariesPull) {
        hasAttemptedApiariesPull = true;
        apiariesPullListeners.forEach((listener) => listener());
      }
    }
  }
}

async function pullTable(tableName: SyncableTableName): Promise<void> {
  const userId = getCurrentUserId();
  let cursor = await getCursorValue(tableName);
  await setCursorValue(tableName, cursor, 'running');

  try {
    for (;;) {
      const { data: rows, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('user_id', userId)
        .gt('updated_at', new Date(cursor).toISOString())
        .order('updated_at', { ascending: true })
        .limit(PAGE_SIZE);

      if (error) throw error;
      if (!rows || rows.length === 0) break;

      // Cursor advancement is committed in the same transaction as the row
      // upserts for this page, so a kill mid-page can never leave the
      // cursor ahead of rows that were never actually written.
      const lastRow = rows[rows.length - 1] as Record<string, unknown>;
      const pageCursor = new Date(lastRow.updated_at as string).getTime();

      await db.transaction(async (tx) => {
        for (const row of rows as Record<string, unknown>[]) {
          await applyRemoteRow(tx, tableName, row);
        }
        await tx
          .insert(syncCursors)
          .values({ tableName, lastPulledAt: pageCursor, lastPullStatus: 'running', lastError: null })
          .onConflictDoUpdate({
            target: syncCursors.tableName,
            set: { lastPulledAt: pageCursor, lastPullStatus: 'running', lastError: null },
          });
      });

      cursor = pageCursor;
      if (rows.length < PAGE_SIZE) break;
    }
    await setCursorValue(tableName, cursor, 'idle');
  } catch (err) {
    await setCursorValue(tableName, cursor, 'error', String(err));
    throw err;
  }
}

async function applyRemoteRow(tx: DbOrTx, tableName: SyncableTableName, row: Record<string, unknown>): Promise<void> {
  const entityId = row.id as string;
  const [pendingOutbox] = await tx
    .select()
    .from(outbox)
    .where(and(eq(outbox.entityTable, tableName), eq(outbox.entityId, entityId)))
    .limit(1);

  const remoteUpdatedMs = new Date(row.updated_at as string).getTime();

  if (pendingOutbox && remoteUpdatedMs > pendingOutbox.watermarkAtEnqueue) {
    // Local has an unsynced change queued against an older server state than
    // this — don't silently overwrite it, surface a conflict instead.
    await recordConflict(tx, tableName, entityId, JSON.parse(pendingOutbox.payloadJson), row);
    return;
  }

  // upsertLocalRow does its own snake_case -> camelCase mapping internally
  // (via each table's fromRemoteRow) — row here must stay the raw remote
  // row, not pre-mapped, or every field name gets read from the wrong
  // (already-camelCase) shape and comes back undefined.
  await upsertLocalRow(tx, tableName, row);
}
