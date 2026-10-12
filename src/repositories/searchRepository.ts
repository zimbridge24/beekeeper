import { inArray, isNotNull, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '../db/client';
import { colonies, recordFieldValues, records, recordTranscripts } from '../db/schema';
import { ANALYSIS_FIELD_KEYS } from '../features/health/facts';
import { useNow } from '../features/health/useNow';
import type { SearchSource } from '../features/search/recordSearch';

// 기록 찾기가 읽는 필드: 봉세·응애 같은 분석 필드(월동 비교의 "결과 전 마지막 상태")에,
// 방제 제품·용량·월동 결과를 더한 것. 나머지 필드값은 메모리에 올리지 않는다.
const SEARCH_FIELD_KEYS = [
  ...ANALYSIS_FIELD_KEYS,
  'treatment_product',
  'treatment_dose',
  'treatment_method',
  'wintering_result',
  'colony_lost',
];

// 삭제되지 않은 모든 기록을 읽는다 — 보관(archived)된 봉군도 포함한다. 폐사한 봉군은 보관해
// 두는 경우가 많고, 월동 결과 비교에는 바로 그 봉군이 필요하다.
export function useSearchSource(): SearchSource | undefined {
  const now = useNow();

  const { data: colonyRows } = useLiveQuery(
    db
      .select({
        id: colonies.id,
        apiaryId: colonies.apiaryId,
        alias: colonies.alias,
        species: colonies.species,
        createdAt: colonies.createdAt,
        isArchived: colonies.isArchived,
      })
      .from(colonies)
      .where(isNull(colonies.deletedAt)),
  );
  const { data: recordRows } = useLiveQuery(
    db
      .select({
        id: records.id,
        colonyId: records.colonyId,
        recordType: records.recordType,
        occurredAt: records.occurredAt,
        notes: records.notes,
      })
      .from(records)
      .where(isNull(records.deletedAt)),
  );
  const { data: fieldValueRows } = useLiveQuery(
    db
      .select({
        recordId: recordFieldValues.recordId,
        fieldKey: recordFieldValues.fieldKey,
        valueState: recordFieldValues.valueState,
        valueNumber: recordFieldValues.valueNumber,
        valueText: recordFieldValues.valueText,
      })
      .from(recordFieldValues)
      .where(inArray(recordFieldValues.fieldKey, SEARCH_FIELD_KEYS)),
  );
  const { data: transcriptRows } = useLiveQuery(
    db
      .select({ recordId: recordTranscripts.recordId, rawTranscript: recordTranscripts.rawTranscript })
      .from(recordTranscripts)
      .where(isNotNull(recordTranscripts.rawTranscript)),
  );

  return useMemo(() => {
    if (!colonyRows || !recordRows || !fieldValueRows || !transcriptRows) return undefined;
    return {
      now,
      colonies: colonyRows,
      records: recordRows,
      fieldValues: fieldValueRows,
      transcripts: transcriptRows,
    };
  }, [now, colonyRows, recordRows, fieldValueRows, transcriptRows]);
}
