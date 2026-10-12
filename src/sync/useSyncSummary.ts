import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../db/client';
import { appMeta, outbox } from '../db/schema';
import { useOpenConflicts } from './conflicts';

export function useSyncSummary() {
  const { data: queuedRows } = useLiveQuery(db.select({ entityTable: outbox.entityTable, entityId: outbox.entityId }).from(outbox));
  const { data: lastSyncRows } = useLiveQuery(db.select().from(appMeta).where(eq(appMeta.key, 'last_sync_completed_at')));
  const { data: failedRows } = useLiveQuery(
    db
      .select({ entityTable: outbox.entityTable, lastError: outbox.lastError, attemptCount: outbox.attemptCount })
      .from(outbox)
      .where(eq(outbox.status, 'failed')),
  );
  const { data: conflicts } = useOpenConflicts();

  const lastSyncedAt = lastSyncRows?.[0]?.value ? Number(lastSyncRows[0].value) : null;

  // 대기열의 행 수(pendingCount)는 한 번 녹음에도 수십 개라서 사용자에게는 의미가 없다. 사용자가
  // 알아보는 단위(기록·양봉장·봉군)로 센 값을 따로 둔다.
  const queued = queuedRows ?? [];
  const items = new Set<string>();
  for (const row of queued) {
    if (row.entityTable === 'records' || row.entityTable === 'apiaries' || row.entityTable === 'colonies') {
      items.add(`${row.entityTable}:${row.entityId}`);
    }
  }
  const pendingItems = items.size > 0 ? items.size : queued.length > 0 ? 1 : 0;

  return {
    pendingCount: queued.length,
    pendingItems,
    conflictCount: conflicts?.length ?? 0,
    lastSyncedAt,
    // 서버가 거절했거나 보내다 실패한 항목 — "대기"가 안 줄어드는 이유를 화면에서 볼 수 있게 한다.
    failedItems: failedRows ?? [],
  };
}
