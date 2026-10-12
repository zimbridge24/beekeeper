import { desc, eq, inArray, isNull, and } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { getCurrentUserId } from '../auth/currentUser';
import { PickedPhoto } from '../components/PhotoPicker';
import { db } from '../db/client';
import { AiAnalysisKind, aiAnalyses, RecordType, recordFieldValues, recordTranscripts, records } from '../db/schema';
import {
  FieldInputState,
  getFieldsForRecordType,
  hasFieldValue,
  pruneHiddenValues,
  RecordTypeField,
} from '../features/records/recordTypesConfig';
import { insertPhotosForRecord } from './photoRepository';
import { DbOrTx, enqueueOutbox } from '../sync/outbox';
import {
  toAiAnalysisRemotePayload,
  toRecordFieldValueRemotePayload,
  toRecordRemotePayload,
  toRecordTranscriptRemotePayload,
} from '../sync/tables';

// 수동 입력 · AI 음성 · 사진 AI가 전부 이 하나의 저장 경로를 쓴다 — 어떤 방법으로
// 입력했는지는 records.input_method로만 구분되고, 값은 똑같이 record_field_values의
// 같은 field_key 행으로 저장된다.
export type InputMethod = 'quick_select' | 'voice_ai' | 'photo_ai';

// 사진 AI 판독의 출처 메타데이터 (신뢰도·사진 품질·원본 응답). 값 자체는 필드에 저장된다.
export type AiAnalysisInput = {
  kind: AiAnalysisKind;
  confidence: string | null;
  photoQuality: string | null;
  retakeNeeded: boolean;
  result: unknown;
};

type InsertRecordCoreParams = {
  recordId: string;
  userId: string;
  visitId: string;
  colonyId: string;
  inputMethod: InputMethod;
  recordType: RecordType;
  notes: string | null;
  captureGroupId: string | null;
  fields: RecordTypeField[];
  // 사용자가 확정한 값.
  state: FieldInputState;
  // AI가 처음 제안한 값 (음성·사진 AI일 때만) — 이후 사용자가 고쳐도 그대로 남는다.
  aiDraft?: FieldInputState;
  photos: PickedPhoto[];
  aiAnalyses?: AiAnalysisInput[];
  now: number;
};

// 폼 입력 하나가 저장될 때의 열 값. 새로 저장(insertRecordCore)과 수정(updateRecord)이 같은 규칙을 쓴다.
function storedValueFor(field: RecordTypeField, final: FieldInputState) {
  const isNumber = field.kind === 'number';
  const isText = field.kind === 'text';
  return {
    valueNumber: isNumber ? (final.numbers[field.key] ?? null) : null,
    valueText: isText ? (final.texts[field.key] ?? null) : null,
    valueState: isNumber || isText ? (hasFieldValue(field, final) ? 'present' : 'unset') : (final.values[field.key] ?? 'unset'),
  };
}

// Inserts the `records` row plus one `record_field_values` row per config field —
// always, even for fields the user never touched (an explicit 'unset' row, so "no
// row" can't be confused with an explicit 확인하지 않음 answer) — plus photos and
// any AI-analysis provenance.
//   chip fields   -> value_state
//   number fields -> value_number, value_state 'present' when entered
//   text fields   -> value_text,   value_state 'present' when entered
async function insertRecordCore(tx: DbOrTx, params: InsertRecordCoreParams): Promise<void> {
  const { recordId, userId, visitId, colonyId, inputMethod, recordType, notes, captureGroupId, fields, state, aiDraft, photos, now } = params;

  await tx.insert(records).values({
    id: recordId,
    userId,
    visitId,
    colonyId,
    inputMethod,
    recordType,
    confirmationStatus: 'confirmed',
    notes,
    captureGroupId,
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
    syncStatus: '기기 내 저장',
  });
  const [recordRow] = await tx.select().from(records).where(eq(records.id, recordId)).limit(1);
  await enqueueOutbox(tx, {
    entityTable: 'records',
    entityId: recordId,
    op: 'insert',
    payload: toRecordRemotePayload(recordRow),
  });

  // 화면에서 보이지 않던 세부 항목(예: "검사 안 함"인데 남아 있는 응애 수)은 저장하지 않는다.
  const final = pruneHiddenValues(fields, state);

  for (const field of fields) {
    const fieldValueId = randomUUID();
    const isNumber = field.kind === 'number';
    const isText = field.kind === 'text';

    const { valueNumber: numberValue, valueText: textValue, valueState } = storedValueFor(field, final);

    const aiNumber = isNumber ? (aiDraft?.numbers[field.key] ?? null) : null;
    const aiText = isText ? (aiDraft?.texts[field.key] ?? null) : null;
    const aiState = aiDraft
      ? isNumber
        ? aiNumber !== null
          ? 'present'
          : null
        : isText
          ? aiText
            ? 'present'
            : null
          : (aiDraft.values[field.key] ?? null)
      : null;

    await tx.insert(recordFieldValues).values({
      id: fieldValueId,
      userId,
      recordId,
      category: field.category,
      fieldKey: field.key,
      valueState,
      valueNumber: numberValue,
      valueText: textValue,
      aiDraftValueState: aiState,
      aiDraftValueNumber: aiNumber,
      aiDraftValueText: aiText,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [fvRow] = await tx.select().from(recordFieldValues).where(eq(recordFieldValues.id, fieldValueId)).limit(1);
    await enqueueOutbox(tx, {
      entityTable: 'record_field_values',
      entityId: fieldValueId,
      op: 'insert',
      payload: toRecordFieldValueRemotePayload(fvRow),
    });
  }

  await insertPhotosForRecord(tx, recordId, photos);

  for (const analysis of params.aiAnalyses ?? []) {
    const analysisId = randomUUID();
    await tx.insert(aiAnalyses).values({
      id: analysisId,
      userId,
      recordId,
      kind: analysis.kind,
      confidence: analysis.confidence,
      photoQuality: analysis.photoQuality,
      retakeNeeded: analysis.retakeNeeded,
      resultJson: JSON.stringify(analysis.result ?? {}),
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [row] = await tx.select().from(aiAnalyses).where(eq(aiAnalyses.id, analysisId)).limit(1);
    await enqueueOutbox(tx, {
      entityTable: 'ai_analyses',
      entityId: analysisId,
      op: 'insert',
      payload: toAiAnalysisRemotePayload(row),
    });
  }
}

export type CreateRecordInput = {
  visitId: string;
  colonyId: string;
  recordType: RecordType;
  state: FieldInputState;
  notes?: string | null;
  photos?: PickedPhoto[];
  // 사진 AI로 채운 폼이면 'photo_ai' + 아래 두 값을 같이 넘긴다.
  inputMethod?: InputMethod;
  aiDraft?: FieldInputState;
  aiAnalyses?: AiAnalysisInput[];
};

// 한 영역(기록 유형) 하나를 저장한다 — 빠른 내검, 추가 기록 폼, 사진 AI 폼이 쓴다.
export async function createRecord(input: CreateRecordInput): Promise<string> {
  const recordId = randomUUID();
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    await insertRecordCore(tx, {
      recordId,
      userId,
      visitId: input.visitId,
      colonyId: input.colonyId,
      inputMethod: input.inputMethod ?? 'quick_select',
      recordType: input.recordType,
      notes: input.notes ?? null,
      captureGroupId: null,
      fields: getFieldsForRecordType(input.recordType),
      state: input.state,
      aiDraft: input.aiDraft,
      photos: input.photos ?? [],
      aiAnalyses: input.aiAnalyses,
      now,
    });
  });

  return recordId;
}

export type VoiceCaptureSection = {
  recordType: RecordType;
  // 사용자가 검토 후 확정한 값.
  state: FieldInputState;
  // AI가 처음 제안한 값 — 사용자가 고쳐도 그대로 보존한다.
  aiDraft: FieldInputState;
};

export type CreateVoiceCaptureInput = {
  visitId: string;
  colonyId: string;
  // 값이 하나라도 있는 영역만 넘긴다. 첫 번째가 대표 기록이 된다.
  sections: VoiceCaptureSection[];
  // 어떤 필드에도 담기지 않은 내용만.
  notes?: string | null;
  rawTranscript: string;
  aiConfidenceScore: number;
  audioLocalUri?: string | null;
  audioDurationSec?: number | null;
  photos?: PickedPhoto[];
  aiDraftColonyId?: string | null;
  aiDraftNotes?: string | null;
};

// 음성 한 번 = 영역별 기록 여러 개. 같은 발화에서 나온 기록들은 대표 기록의 id를
// captureGroupId로 공유하고, 원문 전사(record_transcripts)는 대표 기록에 붙는다.
// 사진과 자유 메모도 대표 기록에 붙는다.
export async function createVoiceCapture(input: CreateVoiceCaptureInput): Promise<string[]> {
  if (input.sections.length === 0) throw new Error('저장할 영역이 없습니다.');
  const now = Date.now();
  const userId = getCurrentUserId();
  const recordIds = input.sections.map(() => randomUUID());
  const primaryId = recordIds[0];
  const transcriptId = randomUUID();

  await db.transaction(async (tx) => {
    for (const [i, section] of input.sections.entries()) {
      const isPrimary = i === 0;
      await insertRecordCore(tx, {
        recordId: recordIds[i],
        userId,
        visitId: input.visitId,
        colonyId: input.colonyId,
        inputMethod: 'voice_ai',
        recordType: section.recordType,
        notes: isPrimary ? (input.notes ?? null) : null,
        captureGroupId: input.sections.length > 1 ? primaryId : null,
        fields: getFieldsForRecordType(section.recordType),
        state: section.state,
        aiDraft: section.aiDraft,
        photos: isPrimary ? (input.photos ?? []) : [],
        now,
      });
    }

    await tx.insert(recordTranscripts).values({
      id: transcriptId,
      userId,
      recordId: primaryId,
      audioLocalUri: input.audioLocalUri ?? null,
      audioDurationSec: input.audioDurationSec ?? null,
      rawTranscript: input.rawTranscript,
      structuringStatus: 'structured',
      aiConfidenceScore: input.aiConfidenceScore,
      aiDraftRecordType: input.sections[0].recordType,
      aiDraftColonyId: input.aiDraftColonyId ?? null,
      aiDraftNotes: input.aiDraftNotes ?? null,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [transcriptRow] = await tx.select().from(recordTranscripts).where(eq(recordTranscripts.id, transcriptId)).limit(1);
    await enqueueOutbox(tx, {
      entityTable: 'record_transcripts',
      entityId: transcriptId,
      op: 'insert',
      payload: toRecordTranscriptRemotePayload(transcriptRow),
    });
  });

  return recordIds;
}

// 기록 삭제 — 다른 곳과 같은 소프트 삭제(deletedAt)다. 타임라인·분석·검색·서버 알림이 전부 deletedAt이
// 있는 기록을 빼고 읽으므로 응애 추이나 알림에도 더 이상 반영되지 않고, 다른 기기에도 삭제가 전달된다.
export async function deleteRecord(recordId: string): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.update(records).set({ deletedAt: now, updatedAt: now, syncStatus: '기기 내 저장' }).where(eq(records.id, recordId));
    const [row] = await tx.select().from(records).where(eq(records.id, recordId)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'records', entityId: recordId, op: 'update', payload: toRecordRemotePayload(row) });
  });
}

export type UpdateRecordInput = {
  recordId: string;
  state: FieldInputState;
  notes: string | null;
};

// 저장된 기록의 값과 메모를 고친다. 바뀐 필드 행만 갱신해서 동기화 대기열에 올리고, 처음 저장 때
// 남긴 AI 초안(ai_draft_*)과 입력 방법·시각은 그대로 둔다 — "AI가 뭐라고 했고 사용자가 뭐로
// 고쳤는지"가 계속 남는다. 기록 이후에 카탈로그에 새로 생긴 필드는 행이 없을 수 있어서 그때만 새로 넣는다.
export async function updateRecord(input: UpdateRecordInput): Promise<void> {
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    const [record] = await tx.select().from(records).where(eq(records.id, input.recordId)).limit(1);
    if (!record) throw new Error('기록을 찾을 수 없어요.');

    const fields = getFieldsForRecordType(record.recordType as RecordType);
    const final = pruneHiddenValues(fields, input.state);
    const existing = await tx.select().from(recordFieldValues).where(eq(recordFieldValues.recordId, input.recordId));
    const byKey = new Map(existing.map((row) => [row.fieldKey, row]));

    for (const field of fields) {
      const next = storedValueFor(field, final);
      const current = byKey.get(field.key);

      if (!current) {
        // 아무것도 입력하지 않은 새 필드는 굳이 행을 만들지 않는다.
        if (next.valueState === 'unset') continue;
        const fieldValueId = randomUUID();
        await tx.insert(recordFieldValues).values({
          id: fieldValueId,
          userId,
          recordId: input.recordId,
          category: field.category,
          fieldKey: field.key,
          ...next,
          createdAt: now,
          updatedAt: now,
          syncStatus: '기기 내 저장',
        });
        const [row] = await tx.select().from(recordFieldValues).where(eq(recordFieldValues.id, fieldValueId)).limit(1);
        await enqueueOutbox(tx, { entityTable: 'record_field_values', entityId: fieldValueId, op: 'insert', payload: toRecordFieldValueRemotePayload(row) });
        continue;
      }

      if (current.valueState === next.valueState && current.valueNumber === next.valueNumber && current.valueText === next.valueText) continue;
      await tx
        .update(recordFieldValues)
        .set({ ...next, updatedAt: now, syncStatus: '기기 내 저장' })
        .where(eq(recordFieldValues.id, current.id));
      const [row] = await tx.select().from(recordFieldValues).where(eq(recordFieldValues.id, current.id)).limit(1);
      await enqueueOutbox(tx, { entityTable: 'record_field_values', entityId: current.id, op: 'update', payload: toRecordFieldValueRemotePayload(row) });
    }

    await tx.update(records).set({ notes: input.notes, updatedAt: now, syncStatus: '기기 내 저장' }).where(eq(records.id, input.recordId));
    const [recordRow] = await tx.select().from(records).where(eq(records.id, input.recordId)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'records', entityId: input.recordId, op: 'update', payload: toRecordRemotePayload(recordRow) });
  });
}

export function useRecord(recordId: string | undefined) {
  return useLiveQuery(db.select().from(records).where(eq(records.id, recordId ?? '')).limit(1), [recordId]);
}

export function useRecordsForColony(colonyId: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(records)
      .where(and(eq(records.colonyId, colonyId ?? ''), isNull(records.deletedAt)))
      .orderBy(desc(records.occurredAt)),
    [colonyId],
  );
}

export function useRecordFieldValues(recordId: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(recordFieldValues)
      .where(eq(recordFieldValues.recordId, recordId ?? '')),
    [recordId],
  );
}

// Fetches all field values for a known set of record ids in one query, so a
// screen that needs to aggregate across several records (e.g. a trend chart)
// doesn't have to call useRecordFieldValues once per record in a loop.
export function useFieldValuesForRecordIds(recordIds: string[]) {
  return useLiveQuery(
    db
      .select()
      .from(recordFieldValues)
      .where(recordIds.length > 0 ? inArray(recordFieldValues.recordId, recordIds) : eq(recordFieldValues.id, '')),
    [recordIds.join(',')],
  );
}
