import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { apiaries, colonies, SyncStatus } from '../db/schema';
import { DbOrTx } from './outbox';
import { toIso } from './timestamps';

type RemoteRow = Record<string, unknown>;

// FK-safe order: apiaries before colonies.
export const SYNCABLE_TABLE_NAMES = ['apiaries', 'colonies'] as const;
export type SyncableTableName = (typeof SYNCABLE_TABLE_NAMES)[number];

function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const ms = new Date(value as string).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function fromApiaryRemoteRow(row: RemoteRow) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    address: (row.address as string) ?? null,
    latitude: (row.latitude as number) ?? null,
    longitude: (row.longitude as number) ?? null,
    memo: (row.memo as string) ?? null,
    isArchived: Boolean(row.is_archived),
    archivedAt: toEpochMs(row.archived_at),
    deletedAt: toEpochMs(row.deleted_at),
    createdAt: toEpochMs(row.created_at) ?? Date.now(),
    updatedAt: toEpochMs(row.updated_at) ?? Date.now(),
    syncStatus: '동기화 완료' as SyncStatus,
    lastSyncedAt: Date.now() as number | null,
  };
}

function fromColonyRemoteRow(row: RemoteRow) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    apiaryId: row.apiary_id as string,
    internalCode: row.internal_code as string,
    alias: row.alias as string,
    species: row.species as string,
    isArchived: Boolean(row.is_archived),
    archivedAt: toEpochMs(row.archived_at),
    deletedAt: toEpochMs(row.deleted_at),
    createdAt: toEpochMs(row.created_at) ?? Date.now(),
    updatedAt: toEpochMs(row.updated_at) ?? Date.now(),
    syncStatus: '동기화 완료' as SyncStatus,
    lastSyncedAt: Date.now() as number | null,
  };
}

// Maps a Supabase row (snake_case, timestamptz strings) to a Drizzle insert
// value object (camelCase, epoch-ms).
export function fromRemoteRow(tableName: SyncableTableName, row: RemoteRow): Record<string, unknown> {
  return tableName === 'apiaries' ? fromApiaryRemoteRow(row) : fromColonyRemoteRow(row);
}

export function toApiaryRemotePayload(row: typeof apiaries.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    memo: row.memo,
    is_archived: row.isArchived,
    archived_at: toIso(row.archivedAt),
    deleted_at: toIso(row.deletedAt),
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

export function toColonyRemotePayload(row: typeof colonies.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    apiary_id: row.apiaryId,
    internal_code: row.internalCode,
    alias: row.alias,
    species: row.species,
    is_archived: row.isArchived,
    archived_at: toIso(row.archivedAt),
    deleted_at: toIso(row.deletedAt),
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

// Rebuilds the push payload from the CURRENT local row rather than trusting
// the JSON snapshot captured in outbox.payload_json at enqueue time. This is
// what makes a payload-shape bugfix apply retroactively to everything still
// queued — otherwise every row enqueued before the fix keeps replaying its
// stale (broken) snapshot on every retry forever, since nothing else ever
// touches it again. Returns null if the row no longer exists locally (e.g.
// it was deleted after being enqueued).
export async function buildCurrentPushPayload(
  tableName: SyncableTableName,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  if (tableName === 'apiaries') {
    const [row] = await db.select().from(apiaries).where(eq(apiaries.id, entityId)).limit(1);
    return row ? toApiaryRemotePayload(row) : null;
  }
  const [row] = await db.select().from(colonies).where(eq(colonies.id, entityId)).limit(1);
  return row ? toColonyRemotePayload(row) : null;
}

// Deliberately branches on tableName rather than looking up a table
// reference from a generic map: calling Drizzle's .insert()/.update() with a
// table argument typed as `typeof apiaries | typeof colonies` forces the TS
// checker to solve those heavily-generic method signatures against a union,
// which is dramatically slower (this is what made `tsc --noEmit` hang during
// development). Each branch below only ever touches one concrete table.
export async function upsertLocalRow(tx: DbOrTx, tableName: SyncableTableName, values: Record<string, unknown>): Promise<void> {
  if (tableName === 'apiaries') {
    const v = values as ReturnType<typeof fromApiaryRemoteRow>;
    await tx.insert(apiaries).values(v).onConflictDoUpdate({ target: apiaries.id, set: v });
  } else {
    const v = values as ReturnType<typeof fromColonyRemoteRow>;
    await tx.insert(colonies).values(v).onConflictDoUpdate({ target: colonies.id, set: v });
  }
}

export async function setLocalSyncStatus(
  tableName: SyncableTableName,
  id: string,
  status: SyncStatus,
  lastSyncedAt?: number,
): Promise<void> {
  if (tableName === 'apiaries') {
    await db
      .update(apiaries)
      .set({ syncStatus: status, ...(lastSyncedAt ? { lastSyncedAt } : {}) })
      .where(eq(apiaries.id, id));
  } else {
    await db
      .update(colonies)
      .set({ syncStatus: status, ...(lastSyncedAt ? { lastSyncedAt } : {}) })
      .where(eq(colonies.id, id));
  }
}
