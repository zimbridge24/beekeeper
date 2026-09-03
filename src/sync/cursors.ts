import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { syncCursors } from '../db/schema';

export async function getCursorValue(tableName: string): Promise<number> {
  const rows = await db.select().from(syncCursors).where(eq(syncCursors.tableName, tableName)).limit(1);
  return rows[0]?.lastPulledAt ?? 0;
}

export async function setCursorValue(
  tableName: string,
  value: number,
  status: 'idle' | 'running' | 'error' = 'idle',
  error?: string,
): Promise<void> {
  await db
    .insert(syncCursors)
    .values({ tableName, lastPulledAt: value, lastPullStatus: status, lastError: error ?? null })
    .onConflictDoUpdate({
      target: syncCursors.tableName,
      set: { lastPulledAt: value, lastPullStatus: status, lastError: error ?? null },
    });
}
