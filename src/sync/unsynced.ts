import { isNull, or, eq } from 'drizzle-orm';

import { db } from '../db/client';
import { outbox, photos } from '../db/schema';
import { listPendingCaptures } from '../features/voice/pendingCaptures';

export type UnsyncedSummary = {
  // 서버에 아직 못 올린 기록(방문 기록) 수 — 필드값 행이 아니라 기록 단위.
  records: number;
  // 양봉장·봉군 변경 수.
  apiariesAndColonies: number;
  photos: number;
  // 아직 검토·저장하지 않은 음성 녹음 수 — 서버가 아니라 "기록으로 저장하기 전" 단계라 동기화로는 해결되지 않는다.
  voiceCaptures: number;
  // 위에 안 잡히는 세부 행(필드값 등)까지 포함한 대기열 전체 행 수. 0이면 정말 다 올라간 상태.
  queued: number;
  // 동기화를 돌리면 줄어들 수 있는 것(대기열·사진)이 남아 있는지.
  needsSync: boolean;
  // 로그아웃하면 사라지는 것이 하나라도 있는지 (음성 녹음 포함).
  hasAny: boolean;
};

// 로그아웃·기기 초기화 같은 "로컬 DB를 비우는 동작" 전에 사용자에게 얼마나 잃는지 보여주기 위한 집계.
// "동기화 대기 N개"의 N은 내부 행 수라서(한 번 녹음에 수십 개) 사용자에게는 이 단위로 보여준다.
export async function getUnsyncedSummary(): Promise<UnsyncedSummary> {
  const queuedRows = await db.select({ entityTable: outbox.entityTable, entityId: outbox.entityId }).from(outbox);
  const unsyncedPhotos = await db
    .select({ id: photos.id })
    .from(photos)
    .where(or(isNull(photos.remotePath), eq(photos.syncStatus, '동기화 실패')));

  const recordIds = new Set<string>();
  const structureIds = new Set<string>();
  for (const row of queuedRows) {
    if (row.entityTable === 'records') recordIds.add(row.entityId);
    else if (row.entityTable === 'apiaries' || row.entityTable === 'colonies') structureIds.add(row.entityId);
  }

  const voiceCaptures = (await listPendingCaptures()).length;
  const queued = queuedRows.length;
  const needsSync = queued > 0 || unsyncedPhotos.length > 0;
  return {
    records: recordIds.size,
    apiariesAndColonies: structureIds.size,
    photos: unsyncedPhotos.length,
    voiceCaptures,
    queued,
    needsSync,
    hasAny: needsSync || voiceCaptures > 0,
  };
}

export function describeUnsynced(s: UnsyncedSummary): string {
  const parts: string[] = [];
  if (s.records > 0) parts.push(`기록 ${s.records}건`);
  if (s.apiariesAndColonies > 0) parts.push(`양봉장·봉군 변경 ${s.apiariesAndColonies}건`);
  if (s.photos > 0) parts.push(`사진 ${s.photos}장`);
  if (s.voiceCaptures > 0) parts.push(`저장하지 않은 음성 녹음 ${s.voiceCaptures}건`);
  return parts.length > 0 ? parts.join(', ') : '일부 변경 내용';
}
