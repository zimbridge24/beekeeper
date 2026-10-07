import { and, eq, inArray, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '../db/client';
import { colonies, recordFieldValues, records } from '../db/schema';
import { ANALYSIS_FIELD_KEYS, HealthSource } from '../features/health/facts';
import { useNow } from '../features/health/useNow';

// 봉군 기억장치(놓치고 있는 것)와 월동 준비도가 읽는 재료를 한꺼번에 모은다. 별도의
// 분석용 저장소는 없다 — 전부 기록(records)과 구조화 필드(record_field_values)에서
// 읽는다. 그래서 수동 입력·AI 음성·사진 AI 중 어떤 방법으로 남긴 기록이든 똑같이 반영된다.
//
// 하나라도 아직 로딩 중이면 undefined — 호출한 화면은 그동안 아무것도 보여주지 않으면 된다.
export function useHealthSource(): HealthSource | undefined {
  const now = useNow();

  const { data: colonyRows } = useLiveQuery(
    db
      .select({
        id: colonies.id,
        apiaryId: colonies.apiaryId,
        alias: colonies.alias,
        species: colonies.species,
        createdAt: colonies.createdAt,
      })
      .from(colonies)
      .where(and(isNull(colonies.deletedAt), eq(colonies.isArchived, false))),
  );
  const { data: recordRows } = useLiveQuery(
    db
      .select({
        id: records.id,
        colonyId: records.colonyId,
        recordType: records.recordType,
        occurredAt: records.occurredAt,
      })
      .from(records)
      .where(isNull(records.deletedAt)),
  );
  // 분석에 쓰는 필드 키만 읽어서 전체 record_field_values를 메모리에 올리지 않는다.
  const { data: fieldValueRows } = useLiveQuery(
    db
      .select({
        recordId: recordFieldValues.recordId,
        fieldKey: recordFieldValues.fieldKey,
        valueState: recordFieldValues.valueState,
        valueNumber: recordFieldValues.valueNumber,
      })
      .from(recordFieldValues)
      .where(inArray(recordFieldValues.fieldKey, ANALYSIS_FIELD_KEYS)),
  );

  return useMemo(() => {
    if (!colonyRows || !recordRows || !fieldValueRows) return undefined;
    return { now, colonies: colonyRows, records: recordRows, fieldValues: fieldValueRows };
  }, [now, colonyRows, recordRows, fieldValueRows]);
}
