import { and, desc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { apiaries } from '../db/schema';
import { enqueueOutbox } from '../sync/outbox';
import { toApiaryRemotePayload } from '../sync/tables';

export type ApiaryInput = {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  memo?: string | null;
};

export function useApiaries(options: { includeArchived?: boolean } = {}) {
  // useLiveQuery defaults deps to [] (run the query builder once, at mount) —
  // any value the query depends on must be passed explicitly here, or a
  // change to that value after mount is silently ignored and the query
  // keeps running against its original (stale) criteria forever.
  return useLiveQuery(
    db
      .select()
      .from(apiaries)
      .where(
        options.includeArchived
          ? isNull(apiaries.deletedAt)
          : and(isNull(apiaries.deletedAt), eq(apiaries.isArchived, false)),
      )
      .orderBy(desc(apiaries.createdAt)),
    [options.includeArchived],
  );
}

export function useApiary(id: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(apiaries)
      .where(eq(apiaries.id, id ?? ''))
      .limit(1),
    [id],
  );
}

export async function createApiary(input: ApiaryInput): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    await tx.insert(apiaries).values({
      id,
      userId,
      name: input.name,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      memo: input.memo ?? null,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [row] = await tx.select().from(apiaries).where(eq(apiaries.id, id)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'apiaries', entityId: id, op: 'insert', payload: toApiaryRemotePayload(row) });
  });

  return id;
}

export async function updateApiary(id: string, input: Partial<ApiaryInput>): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .update(apiaries)
      .set({ ...input, updatedAt: now, syncStatus: '기기 내 저장' })
      .where(eq(apiaries.id, id));
    const [row] = await tx.select().from(apiaries).where(eq(apiaries.id, id)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'apiaries', entityId: id, op: 'update', payload: toApiaryRemotePayload(row) });
  });
}

export async function setApiaryArchived(id: string, archived: boolean): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .update(apiaries)
      .set({ isArchived: archived, archivedAt: archived ? now : null, updatedAt: now, syncStatus: '기기 내 저장' })
      .where(eq(apiaries.id, id));
    const [row] = await tx.select().from(apiaries).where(eq(apiaries.id, id)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'apiaries', entityId: id, op: 'update', payload: toApiaryRemotePayload(row) });
  });
}
