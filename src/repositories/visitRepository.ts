import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { colonies, visitColonies, visits } from '../db/schema';
import { enqueueOutbox } from '../sync/outbox';
import { toVisitColonyRemotePayload, toVisitRemotePayload } from '../sync/tables';

export function useActiveVisit(apiaryId: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(visits)
      .where(and(eq(visits.apiaryId, apiaryId ?? ''), eq(visits.status, 'in_progress'), isNull(visits.deletedAt)))
      .orderBy(desc(visits.startedAt))
      .limit(1),
    [apiaryId],
  );
}

export function useVisit(id: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(visits)
      .where(eq(visits.id, id ?? ''))
      .limit(1),
    [id],
  );
}

// Colonies belong to the visit's queue lazily: a colony with no
// visit_colonies row yet is simply "pending" (never visited this round) —
// selecting it to record creates the row on the spot. This matches the
// design flow (colonies are picked one at a time during the visit, not
// pre-selected in bulk when starting it).
export function useApiaryColoniesWithVisitStatus(apiaryId: string | undefined, visitId: string | undefined) {
  return useLiveQuery(
    db
      .select({ colony: colonies, visitColony: visitColonies })
      .from(colonies)
      .leftJoin(visitColonies, and(eq(visitColonies.colonyId, colonies.id), eq(visitColonies.visitId, visitId ?? '')))
      .where(and(eq(colonies.apiaryId, apiaryId ?? ''), eq(colonies.isArchived, false), isNull(colonies.deletedAt)))
      .orderBy(colonies.internalCode),
    [apiaryId, visitId],
  );
}

// Imperative (non-hook) lookup for entry points that need a visitId right
// now to navigate with — reuses today's in-progress visit for the apiary if
// one exists, otherwise starts a new one.
export async function ensureActiveVisit(apiaryId: string, location?: { latitude: number; longitude: number }): Promise<string> {
  const [existing] = await db
    .select()
    .from(visits)
    .where(and(eq(visits.apiaryId, apiaryId), eq(visits.status, 'in_progress'), isNull(visits.deletedAt)))
    .orderBy(desc(visits.startedAt))
    .limit(1);
  if (existing) return existing.id;
  return startVisit(apiaryId, location);
}

export async function startVisit(apiaryId: string, location?: { latitude: number; longitude: number }): Promise<string> {
  const visitId = randomUUID();
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    await tx.insert(visits).values({
      id: visitId,
      userId,
      apiaryId,
      startedAt: now,
      status: 'in_progress',
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
    const [visitRow] = await tx.select().from(visits).where(eq(visits.id, visitId)).limit(1);
    await enqueueOutbox(tx, {
      entityTable: 'visits',
      entityId: visitId,
      op: 'insert',
      payload: toVisitRemotePayload(visitRow),
    });
  });

  return visitId;
}

// Insert-or-update: the visit_colonies row may not exist yet the first time
// a colony is touched during a visit.
export async function upsertVisitColonyStatus(
  visitId: string,
  colonyId: string,
  status: 'pending' | 'in_progress' | 'done' | 'skipped',
): Promise<void> {
  const now = Date.now();
  const userId = getCurrentUserId();

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(visitColonies)
      .where(and(eq(visitColonies.visitId, visitId), eq(visitColonies.colonyId, colonyId)))
      .limit(1);

    let id = existing?.id;
    if (existing) {
      await tx
        .update(visitColonies)
        .set({ status, updatedAt: now, syncStatus: '기기 내 저장' })
        .where(eq(visitColonies.id, existing.id));
    } else {
      id = randomUUID();
      const [{ value: existingCount }] = await tx
        .select({ value: count() })
        .from(visitColonies)
        .where(eq(visitColonies.visitId, visitId));
      await tx.insert(visitColonies).values({
        id,
        userId,
        visitId,
        colonyId,
        sequenceOrder: existingCount,
        status,
        createdAt: now,
        updatedAt: now,
        syncStatus: '기기 내 저장',
      });
    }

    const [row] = await tx.select().from(visitColonies).where(eq(visitColonies.id, id!)).limit(1);
    await enqueueOutbox(tx, {
      entityTable: 'visit_colonies',
      entityId: row.id,
      op: existing ? 'update' : 'insert',
      payload: toVisitColonyRemotePayload(row),
    });
  });
}

export async function endVisit(id: string): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .update(visits)
      .set({ status: 'completed', endedAt: now, updatedAt: now, syncStatus: '기기 내 저장' })
      .where(eq(visits.id, id));
    const [row] = await tx.select().from(visits).where(eq(visits.id, id)).limit(1);
    await enqueueOutbox(tx, { entityTable: 'visits', entityId: id, op: 'update', payload: toVisitRemotePayload(row) });
  });
}
