import { desc, eq, inArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { RecordType, recordFieldValues, records } from '../db/schema';
import { RecordTypeField } from '../features/records/recordTypesConfig';
import { enqueueOutbox } from '../sync/outbox';
import { toRecordFieldValueRemotePayload, toRecordRemotePayload } from '../sync/tables';

export type FieldValueState = 'present' | 'absent' | 'unknown' | 'unset';

export type CreateQuickRecordInput = {
  visitId: string;
  colonyId: string;
  recordType: RecordType;
  fields: RecordTypeField[];
  values: Record<string, FieldValueState>;
  notes?: string | null;
};

export async function createQuickRecord(input: CreateQuickRecordInput): Promise<string> {
  const recordId = randomUUID();
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    await tx.insert(records).values({
      id: recordId,
      userId,
      visitId: input.visitId,
      colonyId: input.colonyId,
      inputMethod: 'quick_select',
      recordType: input.recordType,
      confirmationStatus: 'confirmed',
      notes: input.notes ?? null,
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

    // One row per config field, always — even fields the user never touched
    // get an explicit 'unset' (미입력) row, so "no row" is never possible
    // and can't be confused with an explicit 확인하지 않음 answer.
    for (const field of input.fields) {
      const fieldValueId = randomUUID();
      const valueState = input.values[field.key] ?? 'unset';
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
