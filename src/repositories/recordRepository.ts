import { desc, eq, inArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { getCurrentUserId } from '../auth/currentUser';
import { PickedPhoto } from '../components/PhotoPicker';
import { db } from '../db/client';
import { RecordType, recordFieldValues, recordTranscripts, records } from '../db/schema';
import { RecordTypeField } from '../features/records/recordTypesConfig';
import { insertPhotosForRecord } from './photoRepository';
import { DbOrTx, enqueueOutbox } from '../sync/outbox';
import { toRecordFieldValueRemotePayload, toRecordRemotePayload, toRecordTranscriptRemotePayload } from '../sync/tables';

export type FieldValueState = 'present' | 'absent' | 'unknown' | 'unset';

type InsertRecordCoreParams = {
  recordId: string;
  userId: string;
  visitId: string;
  colonyId: string;
  inputMethod: 'quick_select' | 'voice_ai';
  recordType: RecordType;
  notes: string | null;
  fields: RecordTypeField[];
  values: Record<string, FieldValueState>;
  photos: PickedPhoto[];
  now: number;
};

// Shared by createQuickRecord and createVoiceRecord: inserts the `records`
// row plus one `record_field_values` row per config field — always, even
// for fields the user never touched (an explicit 'unset' row so "no row" is
// never possible and can't be confused with an explicit 확인하지 않음 answer) —
// plus any attached photos.
async function insertRecordCore(tx: DbOrTx, params: InsertRecordCoreParams): Promise<void> {
  const { recordId, userId, visitId, colonyId, inputMethod, recordType, notes, fields, values, photos, now } = params;

  await tx.insert(records).values({
    id: recordId,
    userId,
    visitId,
    colonyId,
    inputMethod,
    recordType,
    confirmationStatus: 'confirmed',
    notes,
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

  for (const field of fields) {
    const fieldValueId = randomUUID();
    const valueState = values[field.key] ?? 'unset';
    await tx.insert(recordFieldValues).values({
      id: fieldValueId,
      userId,
      recordId,
      category: field.category,
      fieldKey: field.key,
      valueState,
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
}

export type CreateQuickRecordInput = {
  visitId: string;
  colonyId: string;
  recordType: RecordType;
  fields: RecordTypeField[];
  values: Record<string, FieldValueState>;
  notes?: string | null;
  photos?: PickedPhoto[];
};

export async function createQuickRecord(input: CreateQuickRecordInput): Promise<string> {
  const recordId = randomUUID();
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    await insertRecordCore(tx, {
      recordId,
      userId,
      visitId: input.visitId,
      colonyId: input.colonyId,
      inputMethod: 'quick_select',
      recordType: input.recordType,
      notes: input.notes ?? null,
      fields: input.fields,
      values: input.values,
      photos: input.photos ?? [],
      now,
    });
  });

  return recordId;
}

export type CreateVoiceRecordInput = {
  visitId: string;
  colonyId: string;
  recordType: RecordType;
  fields: RecordTypeField[];
  values: Record<string, FieldValueState>;
  notes?: string | null;
  rawTranscript: string;
  aiConfidenceScore: number;
  audioLocalUri?: string | null;
  audioDurationSec?: number | null;
  photos?: PickedPhoto[];
};

// Same as createQuickRecord, plus a 1:1 `record_transcripts` row holding the
// (mock) STT transcript and AI confidence score for the review screen.
export async function createVoiceRecord(input: CreateVoiceRecordInput): Promise<string> {
  const recordId = randomUUID();
  const transcriptId = randomUUID();
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    await insertRecordCore(tx, {
      recordId,
      userId,
      visitId: input.visitId,
      colonyId: input.colonyId,
      inputMethod: 'voice_ai',
      recordType: input.recordType,
      notes: input.notes ?? null,
      fields: input.fields,
      values: input.values,
      photos: input.photos ?? [],
      now,
    });

    await tx.insert(recordTranscripts).values({
      id: transcriptId,
      userId,
      recordId,
      audioLocalUri: input.audioLocalUri ?? null,
      audioDurationSec: input.audioDurationSec ?? null,
      rawTranscript: input.rawTranscript,
      structuringStatus: 'structured',
      aiConfidenceScore: input.aiConfidenceScore,
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

  return recordId;
}

export function useRecordsForColony(colonyId: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(records)
      .where(eq(records.colonyId, colonyId ?? ''))
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
