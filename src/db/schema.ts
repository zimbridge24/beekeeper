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

export const visits = sqliteTable(
  'visits',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    apiaryId: text('apiary_id')
      .notNull()
      .references(() => apiaries.id),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    status: text('status').notNull().default('in_progress'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    // 방문 생성 시점에 한 번 캡처하는 날씨 스냅샷 — 나중에 다시 조회하지 않고
    // 그 순간의 관측값을 그대로 보존한다. 전부 nullable: GPS 거부/오프라인/
    // 업체 응답 실패 시에도 방문 생성 자체는 막지 않는 best-effort 캡처.
    weatherObservedAt: integer('weather_observed_at'),
    temperatureC: real('temperature_c'),
    humidityPercent: real('humidity_percent'),
    precipitationMm: real('precipitation_mm'),
    windSpeedMs: real('wind_speed_ms'),
    weatherCode: text('weather_code'),
    weatherSource: text('weather_source'),
    deletedAt: integer('deleted_at'),
    ...syncColumns(),
  },
  (t) => [
    index('visits_apiary_idx').on(t.apiaryId, t.startedAt),
    check('visits_status_check', sql`${t.status} IN ('in_progress','completed')`),
    check('visits_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
  ],
);

// Junction driving the multi-colony visit queue/progress: a visit walks a
// planned, ordered set of colonies, not just an ad-hoc list.
export const visitColonies = sqliteTable(
  'visit_colonies',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    visitId: text('visit_id')
      .notNull()
      .references(() => visits.id),
    colonyId: text('colony_id')
      .notNull()
      .references(() => colonies.id),
    sequenceOrder: integer('sequence_order').notNull(),
    status: text('status').notNull().default('pending'),
    ...syncColumns(),
  },
  (t) => [
    index('visit_colonies_visit_idx').on(t.visitId, t.sequenceOrder),
    uniqueIndex('visit_colonies_unique').on(t.visitId, t.colonyId),
    check('visit_colonies_status_check', sql`${t.status} IN ('pending','in_progress','done','skipped')`),
    check('visit_colonies_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
  ],
);

export const RECORD_TYPE_VALUES = [
  'general_observation',
  'pest_disease',
  'feeding',
  'treatment',
  'honey_harvest',
  'swarm_split_requeen',
  'wintering_dissolution',
] as const;
export type RecordType = (typeof RECORD_TYPE_VALUES)[number];

export const records = sqliteTable(
  'records',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    visitId: text('visit_id')
      .notNull()
      .references(() => visits.id),
    colonyId: text('colony_id')
      .notNull()
      .references(() => colonies.id),
    inputMethod: text('input_method').notNull(),
    recordType: text('record_type').notNull(),
    confirmationStatus: text('confirmation_status').notNull().default('confirmed'),
    notes: text('notes'),
    occurredAt: integer('occurred_at').notNull(),
    deletedAt: integer('deleted_at'),
    ...syncColumns(),
  },
  (t) => [
    index('records_colony_idx').on(t.colonyId, t.occurredAt),
    index('records_visit_idx').on(t.visitId),
    check('records_input_method_check', sql`${t.inputMethod} IN ('voice_ai','quick_select')`),
    check(
      'records_record_type_check',
      sql`${t.recordType} IN ('general_observation','pest_disease','feeding','treatment','honey_harvest','swarm_split_requeen','wintering_dissolution')`,
    ),
    check('records_confirmation_status_check', sql`${t.confirmationStatus} IN ('draft','confirmed')`),
    check('records_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
  ],
);

// One row per config-defined field per record — lets field sets differ per
// record_type without schema changes, and makes the tri-state distinction
// (있음/없음/확인하지 않음 vs 미입력) explicit: every field for a record_type
// is inserted as 'unset' at creation time, so a missing row is never
// possible and can't be confused with an explicit "확인하지 않음" answer.
export const recordFieldValues = sqliteTable(
  'record_field_values',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    recordId: text('record_id')
      .notNull()
      .references(() => records.id),
    category: text('category').notNull(),
    fieldKey: text('field_key').notNull(),
    valueState: text('value_state').notNull().default('unset'),
    valueText: text('value_text'),
    valueNumber: real('value_number'),
    ...syncColumns(),
  },
  (t) => [
    uniqueIndex('record_field_values_unique').on(t.recordId, t.fieldKey),
    check('record_field_values_category_check', sql`${t.category} IN ('observation','problem','action','result')`),
    check('record_field_values_state_check', sql`${t.valueState} IN ('present','absent','unknown','unset')`),
    check(
      'record_field_values_sync_status_check',
      sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`,
    ),
  ],
);

// 1:1 with a voice_ai record. audioLocalUri is nullable because it's a
// local-only device file path, never mirrored to Supabase (see toXRemotePayload
// in src/sync/tables.ts).
export const recordTranscripts = sqliteTable(
  'record_transcripts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    recordId: text('record_id')
      .notNull()
      .references(() => records.id),
    audioLocalUri: text('audio_local_uri'),
    audioRemotePath: text('audio_remote_path'),
    audioDurationSec: real('audio_duration_sec'),
    rawTranscript: text('raw_transcript'),
    structuringStatus: text('structuring_status').notNull().default('pending_transcription'),
    aiConfidenceScore: real('ai_confidence_score'),
    ...syncColumns(),
  },
  (t) => [
    uniqueIndex('record_transcripts_record_unique').on(t.recordId),
    check(
      'record_transcripts_status_check',
      sql`${t.structuringStatus} IN ('pending_transcription','transcribing','pending_structuring','structuring','structured','failed')`,
    ),
    check(
      'record_transcripts_sync_status_check',
      sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`,
    ),
  ],
);

// 1:N with a record. 사진 실제 데이터는 outbox/JSON upsert 경로로 동기화하지
// 않는다 — Supabase Storage로 직접 업로드하는 별도 경로를 쓴다 (src/sync/photos.ts).
// remotePath는 업로드가 끝나야 채워지고, 그때까지 syncStatus는 '기기 내 저장'에
// 머무른다.
export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    recordId: text('record_id')
      .notNull()
      .references(() => records.id),
    localUri: text('local_uri').notNull(),
    remotePath: text('remote_path'),
    width: integer('width'),
    height: integer('height'),
    ...syncColumns(),
  },
  (t) => [
    index('photos_record_idx').on(t.recordId),
    check('photos_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
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
