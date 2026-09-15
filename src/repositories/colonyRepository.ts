import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { apiaries, colonies, colonyHiveAssignments, hives } from '../db/schema';
import { enqueueOutbox } from '../sync/outbox';
import { toColonyHiveAssignmentRemotePayload, toColonyRemotePayload, toHiveRemotePayload } from '../sync/tables';

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

// Also creates a matching `hives` row + an open `colony_hive_assignments`
// link — Colony(생물학적 봉군)와 Hive(물리적 벌통)는 별개 엔티티지만, MVP
// 화면에는 아직 벌통을 따로 관리하는 UI가 없어서 봉군 하나당 벌통 하나를
// 투명하게 같이 만들어준다. 나중에 봉군이 벌통을 옮기거나 벌통에 새 봉군이
// 들어오는 흐름을 붙일 때, reassignColonyToHive로 이 배정만 바꾸면 되고
// 스키마 변경은 필요 없다.
export async function createColony(input: ColonyInput): Promise<string> {
  const id = randomUUID();
  const hiveId = randomUUID();
  const assignmentId = randomUUID();
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
    const [colonyRow] = await tx.select().from(colonies).where(eq(colonies.id, id)).limit(1);
    await enqueueOutbox(tx, {
      entityTable: 'colonies',
      entityId: id,
      op: 'insert',
      payload: toColonyRemotePayload(colonyRow),
    });

    await tx.insert(hives).values({
      id: hiveId,
      userId,
      apiaryId: input.apiaryId,
      code: internalCode,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [hiveRow] = await tx.select().from(hives).where(eq(hives.id, hiveId)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'hives', entityId: hiveId, op: 'insert', payload: toHiveRemotePayload(hiveRow) });

    await tx.insert(colonyHiveAssignments).values({
      id: assignmentId,
      userId,
      colonyId: id,
      hiveId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [assignmentRow] = await tx
      .select()
      .from(colonyHiveAssignments)
      .where(eq(colonyHiveAssignments.id, assignmentId))
      .limit(1);
    await enqueueOutbox(tx, {
      entityTable: 'colony_hive_assignments',
      entityId: assignmentId,
      op: 'insert',
      payload: toColonyHiveAssignmentRemotePayload(assignmentRow),
    });

    return id;
  });
}

// Closes the colony's current hive assignment and opens a new one — e.g.
// moving a colony to a different physical box, or into a freshly-created
// hive after a swarm/split. Not wired into any screen yet (MVP keeps hive
// management out of the UI), but the data layer supports it so a future
// "move to another hive" screen doesn't need another migration.
export async function reassignColonyToHive(colonyId: string, newHiveId: string): Promise<void> {
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(colonyHiveAssignments)
      .where(and(eq(colonyHiveAssignments.colonyId, colonyId), isNull(colonyHiveAssignments.endedAt)))
      .limit(1);

    if (current) {
      await tx
        .update(colonyHiveAssignments)
        .set({ endedAt: now, updatedAt: now, syncStatus: '기기 내 저장' })
        .where(eq(colonyHiveAssignments.id, current.id));
      const [closedRow] = await tx.select().from(colonyHiveAssignments).where(eq(colonyHiveAssignments.id, current.id)).limit(1);
      await enqueueOutbox(tx, {
        entityTable: 'colony_hive_assignments',
        entityId: current.id,
        op: 'update',
        payload: toColonyHiveAssignmentRemotePayload(closedRow),
      });
    }

    const newAssignmentId = randomUUID();
    await tx.insert(colonyHiveAssignments).values({
      id: newAssignmentId,
      userId,
      colonyId,
      hiveId: newHiveId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [newRow] = await tx.select().from(colonyHiveAssignments).where(eq(colonyHiveAssignments.id, newAssignmentId)).limit(1);
    await enqueueOutbox(tx, {
      entityTable: 'colony_hive_assignments',
      entityId: newAssignmentId,
      op: 'insert',
      payload: toColonyHiveAssignmentRemotePayload(newRow),
    });

    // Keep the denormalized "current apiary" cache on colonies accurate.
    const [newHive] = await tx.select().from(hives).where(eq(hives.id, newHiveId)).limit(1);
    if (newHive) {
      await tx
        .update(colonies)
        .set({ apiaryId: newHive.apiaryId, updatedAt: now, syncStatus: '기기 내 저장' })
        .where(eq(colonies.id, colonyId));
      const [colonyRow] = await tx.select().from(colonies).where(eq(colonies.id, colonyId)).limit(1);
      await enqueueOutbox(tx, {
        entityTable: 'colonies',
        entityId: colonyId,
        op: 'update',
        payload: toColonyRemotePayload(colonyRow),
      });
    }
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

// Soft delete, same shape as deleteApiary — sets deletedAt so every
// isNull(deletedAt) query filters it out immediately, and the delete syncs
// to other devices via the normal update path.
export async function deleteColony(id: string): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.update(colonies).set({ deletedAt: now, updatedAt: now, syncStatus: '기기 내 저장' }).where(eq(colonies.id, id));
    const [row] = await tx.select().from(colonies).where(eq(colonies.id, id)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'colonies', entityId: id, op: 'update', payload: toColonyRemotePayload(row) });
  });
}
