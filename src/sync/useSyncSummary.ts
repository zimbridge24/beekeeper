import { count, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../db/client';
import { appMeta, outbox } from '../db/schema';
import { useOpenConflicts } from './conflicts';

export function useSyncSummary() {
  const { data: pendingRows } = useLiveQuery(db.select({ value: count() }).from(outbox));
  const { data: lastSyncRows } = useLiveQuery(db.select().from(appMeta).where(eq(appMeta.key, 'last_sync_completed_at')));
  const { data: failedRows } = useLiveQuery(
    db
      .select({ entityTable: outbox.entityTable, lastError: outbox.lastError, attemptCount: outbox.attemptCount })
      .from(outbox)
      .where(eq(outbox.status, 'failed')),
  );
  const { data: conflicts } = useOpenConflicts();

  const lastSyncedAt = lastSyncRows?.[0]?.value ? Number(lastSyncRows[0].value) : null;

  return {
    pendingCount: pendingRows?.[0]?.value ?? 0,
    conflictCount: conflicts?.length ?? 0,
    lastSyncedAt,
    // 서버가 거절했거나 보내다 실패한 항목 — "대기"가 안 줄어드는 이유를 화면에서 볼 수 있게 한다.
    failedItems: failedRows ?? [],
  };
}
