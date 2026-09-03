import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const SYNC_STATUS_VALUES = ['기기 내 저장', '동기화 중', '동기화 완료', '동기화 실패'] as const;
export type SyncStatus = (typeof SYNC_STATUS_VALUES)[number];

function syncColumns() {
  return {
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    syncStatus: text('sync_status').notNull().default('기기 내 저장'),
    lastSyncedAt: integer('last_synced_at'),
  };
}

export const apiaries = sqliteTable(
  'apiaries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    memo: text('memo'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at'),
    deletedAt: integer('deleted_at'),
    ...syncColumns(),
  },
  (t) => [
    index('apiaries_user_idx').on(t.userId, t.isArchived),
    check('apiaries_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
  ],
);

export const colonies = sqliteTable(
  'colonies',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    apiaryId: text('apiary_id')
      .notNull()
      .references(() => apiaries.id),
    internalCode: text('internal_code').notNull(),
    alias: text('alias').notNull(),
    species: text('species').notNull().default('western'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at'),
    deletedAt: integer('deleted_at'),
    ...syncColumns(),
  },
  (t) => [
    index('colonies_apiary_idx').on(t.apiaryId, t.isArchived),
    uniqueIndex('colonies_apiary_code_unique').on(t.apiaryId, t.internalCode),
    check('colonies_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
    check('colonies_species_check', sql`${t.species} IN ('western','native')`),
  ],
);

// --- Local-only sync bookkeeping (never pushed to Supabase) ---

export const outbox = sqliteTable(
  'outbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityTable: text('entity_table').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op').notNull(),
    payloadJson: text('payload_json').notNull(),
    watermarkAtEnqueue: integer('watermark_at_enqueue').notNull(),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('outbox_status_idx').on(t.status, t.id),
    index('outbox_entity_idx').on(t.entityTable, t.entityId),
    check('outbox_op_check', sql`${t.op} IN ('insert','update','delete')`),
    check('outbox_status_check', sql`${t.status} IN ('pending','in_flight','failed')`),
  ],
);

export const syncCursors = sqliteTable('sync_cursors', {
  tableName: text('table_name').primaryKey(),
  lastPulledAt: integer('last_pulled_at').notNull().default(0),
  lastPullStatus: text('last_pull_status').notNull().default('idle'),
  lastError: text('last_error'),
});

export const syncConflicts = sqliteTable(
  'sync_conflicts',
  {
    id: text('id').primaryKey(),
    entityTable: text('entity_table').notNull(),
    entityId: text('entity_id').notNull(),
    localPayloadJson: text('local_payload_json').notNull(),
    remotePayloadJson: text('remote_payload_json').notNull(),
    detectedAt: integer('detected_at').notNull(),
    resolvedAt: integer('resolved_at'),
    resolution: text('resolution'),
  },
  (t) => [
    uniqueIndex('sync_conflicts_open_unique')
      .on(t.entityTable, t.entityId)
      .where(sql`${t.resolvedAt} IS NULL`),
  ],
);

// --- Local session cache / app metadata (not synced) ---

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  displayName: text('display_name'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
});
