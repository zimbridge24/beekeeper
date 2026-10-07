import { router } from 'expo-router';

import type { RecordType } from '../../db/schema';
import { ensureActiveVisit } from '../../repositories/visitRepository';

// 홈 타일·알림·월동 목록 등 어디서든 "이 봉군에 이런 기록 남기기"를 같은 방식으로
// 연다. 기록은 항상 방문(visit)에 속하므로 그 양봉장의 진행 중 방문을 먼저 확보한다.
export async function openRecordForm(params: { apiaryId: string; colonyId: string; recordType: RecordType }): Promise<void> {
  const { apiaryId, colonyId, recordType } = params;
  const visitId = await ensureActiveVisit(apiaryId);
  if (recordType === 'general_observation') {
    router.push({ pathname: '/visits/[visitId]/[colonyId]/quick-check', params: { visitId, colonyId } });
    return;
  }
  router.push({ pathname: '/visits/[visitId]/[colonyId]/record-form/[recordType]', params: { visitId, colonyId, recordType } });
}
