import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { apiaries, colonies, visitColonies, visits } from '../db/schema';
import { getDeviceLocation } from '../location/getDeviceLocation';
import { enqueueOutbox } from '../sync/outbox';
import { toVisitColonyRemotePayload, toVisitRemotePayload } from '../sync/tables';
import { weatherProvider } from '../weather';

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

  // Fire-and-forget: GPS + weather capture shouldn't delay navigation into
  // the recording screen. Best-effort only — see captureVisitContext. Always
  // runs (not gated on `location` being absent) — weather must be captured
  // regardless of whether the caller already supplied a location, since the
  // two used to be wrongly conflated here (a caller-supplied location would
  // have skipped weather capture entirely).
  void captureVisitContext(visitId, apiaryId, location);

  return visitId;
}

// Runs once per newly-created visit to fill in the location/weather columns
// that startVisit couldn't populate synchronously. Location: the caller-
// supplied location if given, else live GPS, else the apiary's registered
// coordinates. Weather: a single snapshot fetched right now and stored
// permanently — never re-fetched or looked up later, so it reflects
// conditions AT inspection time even if the provider's historical data
// later becomes unavailable.
async function captureVisitContext(
  visitId: string,
  apiaryId: string,
  knownLocation?: { latitude: number; longitude: number },
): Promise<void> {
  try {
    let location = knownLocation ?? (await getDeviceLocation());
    if (!location) {
      const [apiary] = await db.select().from(apiaries).where(eq(apiaries.id, apiaryId)).limit(1);
      if (apiary?.latitude != null && apiary?.longitude != null) {
        location = { latitude: apiary.latitude, longitude: apiary.longitude };
      }
    }
    if (!location) {
      console.warn('[weather] no device location and apiary has no registered coordinates — skipping capture');
      return;
    }
    const resolvedLocation = location;

    const snapshot = await weatherProvider
      .fetchSnapshot(resolvedLocation.latitude, resolvedLocation.longitude)
      .catch((err) => {
        console.warn('[weather] fetchSnapshot failed:', err instanceof Error ? err.message : JSON.stringify(err));
        return null;
      });

    await db.transaction(async (tx) => {
      await tx
        .update(visits)
        .set({
          latitude: resolvedLocation.latitude,
          longitude: resolvedLocation.longitude,
          ...(snapshot
            ? {
                weatherObservedAt: snapshot.observedAt,
                temperatureC: snapshot.temperatureC,
                humidityPercent: snapshot.humidityPercent,
                precipitationMm: snapshot.precipitationMm,
                windSpeedMs: snapshot.windSpeedMs,
                weatherCode: snapshot.weatherCode,
                weatherSource: snapshot.source,
              }
            : {}),
          updatedAt: Date.now(),
          syncStatus: '기기 내 저장',
        })
        .where(eq(visits.id, visitId));
      const [row] = await tx.select().from(visits).where(eq(visits.id, visitId)).limit(1);
      await enqueueOutbox(tx, { entityTable: 'visits', entityId: visitId, op: 'update', payload: toVisitRemotePayload(row) });
    });
  } catch (err) {
    // GPS 거부, 오프라인, 업체 응답 실패 등 무엇이든 방문 생성 자체를 막거나
    // 사용자에게 노출되어서는 안 된다 — best-effort 캡처. 그래도 콘솔에는
    // 남겨서 디버깅은 가능하게 한다.
    console.warn('[weather] captureVisitContext failed:', err instanceof Error ? err.message : JSON.stringify(err));
  }
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
