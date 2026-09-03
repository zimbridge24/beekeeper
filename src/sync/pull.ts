import { and, eq } from 'drizzle-orm';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { outbox, syncCursors } from '../db/schema';
import { supabase } from '../supabase/client';
import { recordConflict } from './conflicts';
import { getCursorValue, setCursorValue } from './cursors';
import { DbOrTx } from './outbox';
import { fromRemoteRow, SyncableTableName, SYNCABLE_TABLE_NAMES, upsertLocalRow } from './tables';

const PAGE_SIZE = 200;

export async function pullAll(): Promise<void> {
  for (const tableName of SYNCABLE_TABLE_NAMES) {
    await pullTable(tableName);
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

  await upsertLocalRow(tx, tableName, fromRemoteRow(tableName, row));
}
