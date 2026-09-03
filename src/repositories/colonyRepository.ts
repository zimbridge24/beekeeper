import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { apiaries, colonies } from '../db/schema';
import { enqueueOutbox } from '../sync/outbox';
import { toColonyRemotePayload } from '../sync/tables';

export type ColonySpecies = 'western' | 'native';

export type ColonyInput = {
  apiaryId: string;
  alias: string;
  species: ColonySpecies;
};

export function useColonies(apiaryId: string | undefined, options: { includeArchived?: boolean } = {}) {
  // See the comment on useApiaries — deps must list everything the query
  // depends on, or a later change (e.g. apiaryId resolving after an async
  // parent query) is silently ignored.
  return useLiveQuery(
    db
      .select()
      .from(colonies)
      .where(
        and(
          isNull(colonies.deletedAt),
          apiaryId ? eq(colonies.apiaryId, apiaryId) : undefined,
          options.includeArchived ? undefined : eq(colonies.isArchived, false),
        ),
      )
      .orderBy(desc(colonies.createdAt)),
    [apiaryId, options.includeArchived],
  );
}

export function useColonyCount() {
  return useLiveQuery(
    db
      .select({ value: count() })
      .from(colonies)
      .where(and(isNull(colonies.deletedAt), eq(colonies.isArchived, false))),
  );
}

export function useRecentColoniesWithApiary(limit: number) {
  return useLiveQuery(
    db
      .select({ colony: colonies, apiaryName: apiaries.name })
      .from(colonies)
      .leftJoin(apiaries, eq(colonies.apiaryId, apiaries.id))
      .where(and(isNull(colonies.deletedAt), eq(colonies.isArchived, false)))
      .orderBy(desc(colonies.createdAt))
      .limit(limit),
    [limit],
  );
}

export function useColony(id: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(colonies)
      .where(eq(colonies.id, id ?? ''))
      .limit(1),
    [id],
  );
}

export async function createColony(input: ColonyInput): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  const userId = getCurrentUserId();

  return db.transaction(async (tx) => {
    const [{ value: existingCount }] = await tx
      .select({ value: count() })
      .from(colonies)
      .where(eq(colonies.apiaryId, input.apiaryId));
    const internalCode = String(existingCount + 1);

    await tx.insert(colonies).values({
      id,
      userId,
      apiaryId: input.apiaryId,
      internalCode,
      alias: input.alias,
      species: input.species,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [row] = await tx.select().from(colonies).where(eq(colonies.id, id)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'colonies', entityId: id, op: 'insert', payload: toColonyRemotePayload(row) });
    return id;
  });
}

export async function updateColony(
  id: string,
  input: Partial<Pick<ColonyInput, 'alias' | 'species'>>,
): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .update(colonies)
      .set({ ...input, updatedAt: now, syncStatus: '기기 내 저장' })
      .where(eq(colonies.id, id));
    const [row] = await tx.select().from(colonies).where(eq(colonies.id, id)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'colonies', entityId: id, op: 'update', payload: toColonyRemotePayload(row) });
  });
}

export async function setColonyArchived(id: string, archived: boolean): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .update(colonies)
      .set({ isArchived: archived, archivedAt: archived ? now : null, updatedAt: now, syncStatus: '기기 내 저장' })
      .where(eq(colonies.id, id));
    const [row] = await tx.select().from(colonies).where(eq(colonies.id, id)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'colonies', entityId: id, op: 'update', payload: toColonyRemotePayload(row) });
  });
}
