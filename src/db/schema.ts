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

// colonies.apiaryId/internalCode stay as a denormalized "current location"
// cache for the many screens/queries that just want "which apiary is this
// colony in right now" without a join — kept in sync whenever the colony's
// active hive assignment changes (see reassignColonyToHive in
// colonyRepository.ts). The authoritative, historical record of where a
// colony has physically lived is `hives` + `colonyHiveAssignments` below —
// Colony (생물학적 봉군) and Hive (물리적 벌통) are separate entities on
// purpose, so a colony's full record survives it moving boxes, and a hive
// keeps its own history as colonies come and go.
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

// The physical box. Independent identity from `colonies` — a hive can sit
// empty, get a fresh colony after the old one dies out, or a colony can be
// moved to a different hive, all without losing either side's history.
export const hives = sqliteTable(
  'hives',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    apiaryId: text('apiary_id')
      .notNull()
      .references(() => apiaries.id),
    code: text('code').notNull(),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at'),
    deletedAt: integer('deleted_at'),
    ...syncColumns(),
  },
  (t) => [
    index('hives_apiary_idx').on(t.apiaryId, t.isArchived),
    uniqueIndex('hives_apiary_code_unique').on(t.apiaryId, t.code),
    check('hives_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
  ],
);

// One open (endedAt IS NULL) row per colony and per hive at a time — the
// history of which colony has lived in which hive, and when. MVP screens
// don't expose hive management yet; today every colony gets exactly one
// hive auto-created alongside it (see createColony), but the structure
// already supports a colony moving hives or a hive getting a new colony
// later without a schema change.
export const colonyHiveAssignments = sqliteTable(
  'colony_hive_assignments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    colonyId: text('colony_id')
      .notNull()
      .references(() => colonies.id),
    hiveId: text('hive_id')
      .notNull()
      .references(() => hives.id),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    ...syncColumns(),
  },
  (t) => [
    index('cha_colony_idx').on(t.colonyId, t.startedAt),
    index('cha_hive_idx').on(t.hiveId, t.startedAt),
    uniqueIndex('cha_colony_open_unique').on(t.colonyId).where(sql`${t.endedAt} IS NULL`),
    uniqueIndex('cha_hive_open_unique').on(t.hiveId).where(sql`${t.endedAt} IS NULL`),
    check('cha_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
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

// 수동 입력·AI 음성·AI 사진 분석이 모두 같은 record_type / 같은 필드 구조를 쓴다.
//   general_observation  빠른 상태 (여왕·봉세·먹이·이상징후)
//   mite / hornet        문제: 응애 · 말벌
//   pest_disease         문제: 그 밖의 질병·증상 (예전 기록의 응애·말벌 필드도 여기 남아 있다)
//   treatment / feeding / swarm_split_requeen   조치
//   wintering_prep / wintering_dissolution       계절관리: 월동 준비 점검 · 월동 결과/폐군
//   honey_harvest                                 계절관리: 채밀
export const RECORD_TYPE_VALUES = [
  'general_observation',
  'mite',
  'hornet',
  'pest_disease',
  'treatment',
  'feeding',
  'swarm_split_requeen',
  'wintering_prep',
  'wintering_dissolution',
  'honey_harvest',
] as const;
export type RecordType = (typeof RECORD_TYPE_VALUES)[number];

// record_field_values.value_state가 가질 수 있는 모든 토큰 — 필드 종류(kind)마다 이
// 중 일부만 쓴다 (src/features/records/recordTypesConfig.ts의 FIELD_KIND_OPTIONS).
// 아래 CHECK 제약과 Supabase 마이그레이션이 이 목록을 그대로 따른다.
export const FIELD_VALUE_STATE_VALUES = [
  // 관찰형 / 검사형 / 행동형
  'present',
  'absent',
  'unknown',
  'not_tested',
  'tested_negative',
  'tested_positive',
  'indeterminate',
  'done',
  'not_done',
  // 말벌
  'asian_hornet',
  'giant_hornet',
  'other',
  'unknown_species',
  'none',
  'few_1_5',
  'several_6_20',
  'many_20_plus',
  // 봉세 · 먹이 · 월동 준비 정도
  'strong',
  'normal',
  'weak',
  'enough',
  'low',
  'partial',
  'good',
  'needs_check',
  // 월동 결과
  'survived',
  'weak_survived',
  'lost',
  // 응애 검사 방법
  'comb_count',
  'sugar_roll',
  'alcohol_wash',
  'sticky_board',
  'drone_brood',
  'visual',
  'other_method',
  // 방제 약제 성분
  'amitraz',
  'coumaphos',
  'formic_acid',
  'oxalic_acid',
  'other_ingredient',
  'unknown_ingredient',
  // 급이 종류 · 단위
  'sugar_syrup',
  'pollen_cake',
  'honey_feed',
  'other_feed',
  'kg',
  'liter',
  // 미입력
  'unset',
] as const;
const FIELD_VALUE_STATE_SQL = sql.raw(FIELD_VALUE_STATE_VALUES.map((v) => `'${v}'`).join(','));
const RECORD_TYPE_SQL = sql.raw(RECORD_TYPE_VALUES.map((v) => `'${v}'`).join(','));

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
    // 음성 한 번으로 여러 영역(상태·응애·말벌·급이…)이 구조화되면 영역마다 기록이
    // 하나씩 생긴다. 같은 발화에서 나온 기록들은 대표 기록의 id를 여기에 공유한다
    // (대표 기록이 원문 전사 record_transcripts를 가진다). 단일 입력이면 null.
    captureGroupId: text('capture_group_id'),
    occurredAt: integer('occurred_at').notNull(),
    deletedAt: integer('deleted_at'),
    ...syncColumns(),
  },
  (t) => [
    index('records_colony_idx').on(t.colonyId, t.occurredAt),
    index('records_capture_group_idx').on(t.captureGroupId),
    index('records_visit_idx').on(t.visitId),
    check('records_input_method_check', sql`${t.inputMethod} IN ('voice_ai','quick_select','photo_ai')`),
    check(
      'records_record_type_check',
      sql`${t.recordType} IN (${RECORD_TYPE_SQL})`,
    ),
    check('records_confirmation_status_check', sql`${t.confirmationStatus} IN ('draft','confirmed')`),
    check('records_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
  ],
);

// One row per config-defined field per record — lets field sets differ per
// record_type without schema changes. Every field for a record_type is
// inserted as 'unset' at creation time, so a missing row is never possible.
//
// value_state's valid tokens depend on the field's *kind* (see FieldKind /
// FIELD_KIND_OPTIONS in src/features/records/recordTypesConfig.ts) — a
// 검사형 field like 응애 감염 uses not_tested/tested_negative/
// tested_positive/indeterminate, while a 관찰형 field like 여왕벌 상태 uses
// present/absent/unknown. The CHECK below only guards against garbage
// values (the union of every kind's tokens) — which subset applies to a
// given field_key is an application-layer concern, since SQLite has no
// clean way to make a CHECK conditional on another column's value. The one
// invariant every kind shares is 'unset' (미입력, never touched) — it must
// never be confused with a kind's own "checked, nothing found" token (e.g.
// absent, tested_negative), which is the whole point of splitting kinds out.
//
// aiDraftValueState holds the AI's original (pre-edit) guess for voice_ai
// records — set once at insert time and never overwritten by later edits to
// valueState, so "what did the AI say vs what did the user correct it to"
// stays answerable for accuracy/edit-rate analysis later. Always null for
// quick_select records (no AI involved).
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
    aiDraftValueState: text('ai_draft_value_state'),
    valueText: text('value_text'),
    valueNumber: real('value_number'),
    // 수치형(kind === 'number') 필드에서 AI가 처음 제안한 숫자 — aiDraftValueState와
    // 같은 이유로, 사용자가 valueNumber를 고쳐도 덮어쓰지 않는다.
    aiDraftValueNumber: real('ai_draft_value_number'),
    // 텍스트형(약제·방법 등) 필드의 AI 초안.
    aiDraftValueText: text('ai_draft_value_text'),
    ...syncColumns(),
  },
  (t) => [
    uniqueIndex('record_field_values_unique').on(t.recordId, t.fieldKey),
    check('record_field_values_category_check', sql`${t.category} IN ('observation','problem','action','result')`),
    check(
      'record_field_values_state_check',
      sql`${t.valueState} IN (${FIELD_VALUE_STATE_SQL})`,
    ),
    check(
      'record_field_values_ai_draft_state_check',
      sql`${t.aiDraftValueState} IS NULL OR ${t.aiDraftValueState} IN (${FIELD_VALUE_STATE_SQL})`,
    ),
    check(
      'record_field_values_sync_status_check',
      sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`,
    ),
  ],
);

// 1:1 with a voice_ai record. audioLocalUri is nullable because it's a
// local-only device file path, never mirrored to Supabase (see toXRemotePayload
// in src/sync/tables.ts).
//
// aiDraftRecordType/aiDraftColonyId/aiDraftNotes preserve exactly what the
// AI originally proposed (recordType never changes after that in the review
// screen, so it's captured here rather than duplicated per-field; colonyId
// and notes can be edited by the user before saving, so the AI's original
// guess would otherwise be lost). Together with record_field_values.
// aiDraftValueState, this keeps 원본 음성 → STT → AI 초안 → 사용자 확정값 as
// four genuinely separate, permanently-retained pieces of data.
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
    aiDraftRecordType: text('ai_draft_record_type'),
    aiDraftColonyId: text('ai_draft_colony_id'),
    aiDraftNotes: text('ai_draft_notes'),
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

// 사진 AI 판독의 "출처" 기록. 판독 결과로 채워진 값 자체는 수동/음성 입력과 똑같이
// records + record_field_values에 저장되고(그 필드의 ai_draft_*가 AI 최초 제안),
// 여기에는 필드로 표현되지 않는 판독 메타데이터 — 신뢰도 · 사진 품질 · 재촬영 필요
// 여부 · 원본 응답 — 만 따로 남긴다. 사용자가 값을 고쳐도 이 행은 바뀌지 않는다.
export const AI_ANALYSIS_KIND_VALUES = ['mite_photo', 'hornet_photo', 'wintering_photo'] as const;
export type AiAnalysisKind = (typeof AI_ANALYSIS_KIND_VALUES)[number];

export const aiAnalyses = sqliteTable(
  'ai_analyses',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    recordId: text('record_id')
      .notNull()
      .references(() => records.id),
    kind: text('kind').notNull(),
    confidence: text('confidence'),
    photoQuality: text('photo_quality'),
    retakeNeeded: integer('retake_needed', { mode: 'boolean' }).notNull().default(false),
    resultJson: text('result_json').notNull(),
    ...syncColumns(),
  },
  (t) => [
    index('ai_analyses_record_idx').on(t.recordId),
    check('ai_analyses_kind_check', sql`${t.kind} IN ('mite_photo','hornet_photo','wintering_photo')`),
    check('ai_analyses_confidence_check', sql`${t.confidence} IS NULL OR ${t.confidence} IN ('low','medium','high')`),
    check('ai_analyses_photo_quality_check', sql`${t.photoQuality} IS NULL OR ${t.photoQuality} IN ('good','fair','poor')`),
    check('ai_analyses_sync_status_check', sql`${t.syncStatus} IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')`),
  ],
);

// 위험단계 — 저장하지 않고 필드 값에서 매번 계산한다 (src/features/health).
export const RISK_LEVEL_VALUES = ['low', 'caution', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVEL_VALUES)[number];

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
