import { eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { db } from '../db/client';
import { outbox, syncConflicts } from '../db/schema';
import { DbOrTx } from './outbox';
import { fromRemoteRow, SyncableTableName, SYNCABLE_TABLE_NAMES, upsertLocalValues } from './tables';

export async function recordConflict(
  tx: DbOrTx,
  entityTable: string,
  entityId: string,
  localPayload: Record<string, unknown>,
  remotePayload: Record<string, unknown>,
): Promise<void> {
  await tx
    .insert(syncConflicts)
    .values({
      id: randomUUID(),
      entityTable,
      entityId,
      localPayloadJson: JSON.stringify(localPayload),
      remotePayloadJson: JSON.stringify(remotePayload),
      detectedAt: Date.now(),
    })
    // The partial unique index (entityTable, entityId) WHERE resolvedAt IS
    // NULL keeps this idempotent — push and pull can both independently
    // detect the same conflict within one sync cycle.
    .onConflictDoNothing();
}

export function useOpenConflicts() {
  return useLiveQuery(db.select().from(syncConflicts).where(isNull(syncConflicts.resolvedAt)));
}

export function useConflict(id: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(syncConflicts)
      .where(eq(syncConflicts.id, id ?? ''))
      .limit(1),
    [id],
  );
}

export async function resolveConflict(
  conflictId: string,
  resolution: 'kept_local' | 'kept_remote' | 'merged',
  mergedPayload?: Record<string, unknown>,
): Promise<void> {
  const [conflict] = await db.select().from(syncConflicts).where(eq(syncConflicts.id, conflictId)).limit(1);
  if (!conflict) return;

  const localPayload = JSON.parse(conflict.localPayloadJson) as Record<string, unknown>;
  const remotePayload = JSON.parse(conflict.remotePayloadJson) as Record<string, unknown>;
  const finalPayload =
    resolution === 'kept_local' ? localPayload : resolution === 'kept_remote' ? remotePayload : (mergedPayload ?? localPayload);

  const isKnownTable = (SYNCABLE_TABLE_NAMES as readonly string[]).includes(conflict.entityTable);
  const remoteUpdatedMs = remotePayload.updated_at
    ? new Date(remotePayload.updated_at as string).getTime()
    : Date.now();

  await db.transaction(async (tx) => {
    // Apply the chosen values locally (so the UI reflects the resolution
    // immediately) if we recognize the table, then queue a fresh push using
    // the just-seen remote updated_at as the watermark, so this push doesn't
    // immediately re-detect the same conflict.
    if (isKnownTable) {
      const tableName = conflict.entityTable as SyncableTableName;
      const now = Date.now();
      const localColumns = {
        ...fromRemoteRow(tableName, { ...finalPayload, updated_at: new Date(now).toISOString() }),
        syncStatus: '기기 내 저장' as const,
      };
      await upsertLocalValues(tx, tableName, localColumns);
    }

    await tx.delete(outbox).where(eq(outbox.entityId, conflict.entityId));
    await enqueueOutboxAtWatermark(tx, conflict.entityTable, conflict.entityId, finalPayload, remoteUpdatedMs);

    await tx
      .update(syncConflicts)
      .set({ resolvedAt: Date.now(), resolution })
      .where(eq(syncConflicts.id, conflictId));
  });
}

async function enqueueOutboxAtWatermark(
  tx: DbOrTx,
  entityTable: string,
  entityId: string,
  payload: Record<string, unknown>,
  watermark: number,
) {
  await tx.insert(outbox).values({
    entityTable,
    entityId,
    op: 'update',
    payloadJson: JSON.stringify(payload),
    watermarkAtEnqueue: watermark,
    status: 'pending',
    attemptCount: 0,
    createdAt: Date.now(),
  });
}
