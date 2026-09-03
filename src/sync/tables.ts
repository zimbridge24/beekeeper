import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { apiaries, colonies, records, recordFieldValues, SyncStatus, visitColonies, visits } from '../db/schema';
import { DbOrTx } from './outbox';
import { toIso } from './timestamps';

type RemoteRow = Record<string, unknown>;

// FK-safe order: parents before children.
export const SYNCABLE_TABLE_NAMES = ['apiaries', 'colonies', 'visits', 'visit_colonies', 'records', 'record_field_values'] as const;
export type SyncableTableName = (typeof SYNCABLE_TABLE_NAMES)[number];

function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const ms = new Date(value as string).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// A per-table adapter, each closed over ONE concrete Drizzle table. Storing
// these in a plain Record<SyncableTableName, EntityAdapter> (rather than
// storing table references themselves and dispatching generic .insert()/
// .update() calls against a union type) keeps every Drizzle call inside a
// closure that only ever sees a single concrete table — calling Drizzle's
// heavily-generic methods with an argument typed as a union of table types
// makes the TS checker's job dramatically more expensive (this is what made
// `tsc --noEmit` hang during development of the first two tables).
type EntityAdapter = {
  fromRemoteRow: (row: RemoteRow) => Record<string, unknown>;
  // Raw remote row (snake_case) -> maps internally -> inserts. For the pull
  // path, which always hands over an unmapped Supabase row.
  upsertLocalRow: (tx: DbOrTx, row: RemoteRow) => Promise<void>;
  // Already-mapped local values (camelCase) -> inserts directly, no mapping.
  // For conflict resolution, which needs to compute the mapped values itself
  // first (to override syncStatus) — calling upsertLocalRow with that
  // already-mapped object would re-run fromRemoteRow on camelCase keys and
  // silently produce all-undefined fields (this was a real bug: see git
  // history for the "colonies.user_id NOT NULL" incident).
  upsertLocalValues: (tx: DbOrTx, values: Record<string, unknown>) => Promise<void>;
  buildCurrentPushPayload: (id: string) => Promise<Record<string, unknown> | null>;
  setSyncStatus: (id: string, status: SyncStatus, lastSyncedAt?: number) => Promise<void>;
};

function makeAdapter<TTable extends { id: unknown; syncStatus: unknown; lastSyncedAt: unknown }>(
  table: TTable,
  fromRemoteRow: (row: RemoteRow) => Record<string, unknown>,
  toRemotePayload: (row: never) => Record<string, unknown>,
): EntityAdapter {
  const upsertLocalValues = async (tx: DbOrTx, values: Record<string, unknown>) => {
    await tx
      .insert(table as never)
      .values(values as never)
      .onConflictDoUpdate({ target: table.id as never, set: values as never });
  };
  return {
    fromRemoteRow,
    upsertLocalRow: async (tx, row) => upsertLocalValues(tx, fromRemoteRow(row)),
    upsertLocalValues,
    buildCurrentPushPayload: async (id) => {
      const [row] = await db
        .select()
        .from(table as never)
        .where(eq(table.id as never, id))
        .limit(1);
      return row ? toRemotePayload(row) : null;
    },
    setSyncStatus: async (id, status, lastSyncedAt) => {
      await db
        .update(table as never)
        .set({ syncStatus: status, ...(lastSyncedAt ? { lastSyncedAt } : {}) } as never)
        .where(eq(table.id as never, id));
    },
  };
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

function fromVisitRemoteRow(row: RemoteRow) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    apiaryId: row.apiary_id as string,
    startedAt: toEpochMs(row.started_at) ?? Date.now(),
    endedAt: toEpochMs(row.ended_at),
    status: row.status as string,
    latitude: (row.latitude as number) ?? null,
    longitude: (row.longitude as number) ?? null,
    deletedAt: toEpochMs(row.deleted_at),
    createdAt: toEpochMs(row.created_at) ?? Date.now(),
    updatedAt: toEpochMs(row.updated_at) ?? Date.now(),
    syncStatus: '동기화 완료' as SyncStatus,
    lastSyncedAt: Date.now() as number | null,
  };
}

export function toVisitRemotePayload(row: typeof visits.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    apiary_id: row.apiaryId,
    started_at: toIso(row.startedAt),
    ended_at: toIso(row.endedAt),
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    deleted_at: toIso(row.deletedAt),
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

function fromVisitColonyRemoteRow(row: RemoteRow) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    visitId: row.visit_id as string,
    colonyId: row.colony_id as string,
    sequenceOrder: row.sequence_order as number,
    status: row.status as string,
    createdAt: toEpochMs(row.created_at) ?? Date.now(),
    updatedAt: toEpochMs(row.updated_at) ?? Date.now(),
    syncStatus: '동기화 완료' as SyncStatus,
    lastSyncedAt: Date.now() as number | null,
  };
}

export function toVisitColonyRemotePayload(row: typeof visitColonies.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    visit_id: row.visitId,
    colony_id: row.colonyId,
    sequence_order: row.sequenceOrder,
    status: row.status,
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

function fromRecordRemoteRow(row: RemoteRow) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    visitId: row.visit_id as string,
    colonyId: row.colony_id as string,
    inputMethod: row.input_method as string,
    recordType: row.record_type as string,
    confirmationStatus: row.confirmation_status as string,
    notes: (row.notes as string) ?? null,
    occurredAt: toEpochMs(row.occurred_at) ?? Date.now(),
    deletedAt: toEpochMs(row.deleted_at),
    createdAt: toEpochMs(row.created_at) ?? Date.now(),
    updatedAt: toEpochMs(row.updated_at) ?? Date.now(),
    syncStatus: '동기화 완료' as SyncStatus,
    lastSyncedAt: Date.now() as number | null,
  };
}

export function toRecordRemotePayload(row: typeof records.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    visit_id: row.visitId,
    colony_id: row.colonyId,
    input_method: row.inputMethod,
    record_type: row.recordType,
    confirmation_status: row.confirmationStatus,
    notes: row.notes,
    occurred_at: toIso(row.occurredAt),
    deleted_at: toIso(row.deletedAt),
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

function fromRecordFieldValueRemoteRow(row: RemoteRow) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    recordId: row.record_id as string,
    category: row.category as string,
    fieldKey: row.field_key as string,
    valueState: row.value_state as string,
    valueText: (row.value_text as string) ?? null,
    valueNumber: (row.value_number as number) ?? null,
    createdAt: toEpochMs(row.created_at) ?? Date.now(),
    updatedAt: toEpochMs(row.updated_at) ?? Date.now(),
    syncStatus: '동기화 완료' as SyncStatus,
    lastSyncedAt: Date.now() as number | null,
  };
}

export function toRecordFieldValueRemotePayload(row: typeof recordFieldValues.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    record_id: row.recordId,
    category: row.category,
    field_key: row.fieldKey,
    value_state: row.valueState,
    value_text: row.valueText,
    value_number: row.valueNumber,
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

const ENTITY_ADAPTERS: Record<SyncableTableName, EntityAdapter> = {
  apiaries: makeAdapter(apiaries, fromApiaryRemoteRow, toApiaryRemotePayload as never),
  colonies: makeAdapter(colonies, fromColonyRemoteRow, toColonyRemotePayload as never),
  visits: makeAdapter(visits, fromVisitRemoteRow, toVisitRemotePayload as never),
  visit_colonies: makeAdapter(visitColonies, fromVisitColonyRemoteRow, toVisitColonyRemotePayload as never),
  records: makeAdapter(records, fromRecordRemoteRow, toRecordRemotePayload as never),
  record_field_values: makeAdapter(recordFieldValues, fromRecordFieldValueRemoteRow, toRecordFieldValueRemotePayload as never),
};

// Maps a Supabase row (snake_case, timestamptz strings) to a Drizzle insert
// value object (camelCase, epoch-ms).
export function fromRemoteRow(tableName: SyncableTableName, row: RemoteRow): Record<string, unknown> {
  return ENTITY_ADAPTERS[tableName].fromRemoteRow(row);
}

// row must be a RAW remote row (snake_case) — the adapter maps it
// internally. Used by pull.ts.
export async function upsertLocalRow(tx: DbOrTx, tableName: SyncableTableName, row: RemoteRow): Promise<void> {
  await ENTITY_ADAPTERS[tableName].upsertLocalRow(tx, row);
}

// values must already be mapped (camelCase) — no further mapping is
// applied. Used by conflicts.ts, which computes the mapped values itself
// first so it can override syncStatus.
export async function upsertLocalValues(
  tx: DbOrTx,
  tableName: SyncableTableName,
  values: Record<string, unknown>,
): Promise<void> {
  await ENTITY_ADAPTERS[tableName].upsertLocalValues(tx, values);
}

// Rebuilds the push payload from the CURRENT local row rather than trusting
// a JSON snapshot captured at enqueue time — see git history for why: a
// payload-shape bugfix must apply retroactively to everything still queued,
// or every pre-fix row replays its stale (broken) snapshot on every retry
// forever. Returns null if the row no longer exists locally.
export async function buildCurrentPushPayload(
  tableName: SyncableTableName,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  return ENTITY_ADAPTERS[tableName].buildCurrentPushPayload(entityId);
}

export async function setLocalSyncStatus(
  tableName: SyncableTableName,
  id: string,
  status: SyncStatus,
  lastSyncedAt?: number,
): Promise<void> {
  await ENTITY_ADAPTERS[tableName].setSyncStatus(id, status, lastSyncedAt);
}
