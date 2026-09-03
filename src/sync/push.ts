import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import { outbox } from '../db/schema';
import { supabase } from '../supabase/client';
import { recordConflict } from './conflicts';
import { buildCurrentPushPayload, setLocalSyncStatus, SyncableTableName, SYNCABLE_TABLE_NAMES } from './tables';

export type PushSummary = { pushed: number; conflicts: number; failed: number };

// Supabase/PostgREST errors are plain objects ({message, details, hint,
// code}), not Error instances — String(err) on those gives "[object
// Object]", hiding the actual reason.
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function pushOutbox(): Promise<PushSummary> {
  const summary: PushSummary = { pushed: 0, conflicts: 0, failed: 0 };

  for (const tableName of SYNCABLE_TABLE_NAMES) {
    const rows = await db
      .select()
      .from(outbox)
      .where(and(eq(outbox.entityTable, tableName), inArray(outbox.status, ['pending', 'failed'])))
      .orderBy(outbox.id);

    // Coalesce: multiple queued edits for the same entity while offline
    // collapse into one push using the most recent payload.
    const latestByEntity = new Map<string, (typeof rows)[number]>();
    for (const row of rows) latestByEntity.set(row.entityId, row);

    for (const outboxRow of latestByEntity.values()) {
      const outcome = await pushEntity(tableName, outboxRow);
      summary[outcome]++;
    }
  }

  return summary;
}

async function pushEntity(
  tableName: SyncableTableName,
  outboxRow: typeof outbox.$inferSelect,
): Promise<'pushed' | 'conflicts' | 'failed'> {
  // Rebuilt from the current local row, not JSON.parse(outboxRow.payloadJson)
  // — see buildCurrentPushPayload's comment: this makes payload-shape
  // bugfixes apply retroactively to anything still queued, instead of every
  // pre-fix row replaying its stale broken snapshot forever.
  const payload = await buildCurrentPushPayload(tableName, outboxRow.entityId);
  if (!payload) {
    // Row no longer exists locally (e.g. deleted after being queued) —
    // nothing to push, just clear the stale queue entries.
    await db.delete(outbox).where(and(eq(outbox.entityTable, tableName), eq(outbox.entityId, outboxRow.entityId)));
    return 'pushed';
  }

  try {
    const { data: remoteRow, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', outboxRow.entityId)
      .maybeSingle();
    if (fetchError) throw fetchError;

    if (remoteRow) {
      const remoteUpdatedMs = new Date(remoteRow.updated_at as string).getTime();
      if (remoteUpdatedMs > outboxRow.watermarkAtEnqueue) {
        await recordConflict(db, tableName, outboxRow.entityId, payload, remoteRow as Record<string, unknown>);
        await setLocalSyncStatus(tableName, outboxRow.entityId, '동기화 실패');
        return 'conflicts';
      }
    }

    const { error: upsertError } = await supabase.from(tableName).upsert(payload, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    await db.delete(outbox).where(and(eq(outbox.entityTable, tableName), eq(outbox.entityId, outboxRow.entityId)));
    await setLocalSyncStatus(tableName, outboxRow.entityId, '동기화 완료', Date.now());
    return 'pushed';
  } catch (err) {
    const message = describeError(err);
    console.warn(`[sync] push failed for ${tableName}/${outboxRow.entityId}:`, message);
    await db
      .update(outbox)
      .set({ status: 'failed', attemptCount: outboxRow.attemptCount + 1, lastError: message })
      .where(eq(outbox.id, outboxRow.id));
    await setLocalSyncStatus(tableName, outboxRow.entityId, '동기화 실패');
    return 'failed';
  }
}
