import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { appMeta } from '../db/schema';
import { pullAll } from './pull';
import { pushPhotos } from './photos';
import { pushOutbox } from './push';

const LAST_SYNC_KEY = 'last_sync_completed_at';

let syncInFlight: Promise<void> | null = null;
// 동기화가 도는 중에 또 요청이 오면(방금 저장한 기록 등) 이미 시작된 사이클은 그 변경을 못 볼 수 있어서,
// 끝난 직후 한 번 더 돈다. 요청이 여러 번 와도 추가 사이클은 한 번뿐이다.
let rerunRequested = false;

// Lets the UI know a sync cycle has at least been *attempted* (regardless of
// outcome) once per app session — used to avoid deciding "this user has no
// apiaries, send them to setup" before an initial pull on a new device has
// had a chance to land. See src/sync/useHasAttemptedSync.ts.
let hasAttemptedSync = false;
const attemptListeners = new Set<() => void>();

export function getHasAttemptedSync() {
  return hasAttemptedSync;
}

export function subscribeSyncAttempt(listener: () => void): () => void {
  attemptListeners.add(listener);
  return () => attemptListeners.delete(listener);
}

// Push before pull: getting local changes onto the server first minimizes
// the chance of a device immediately conflicting against its own edits.
export async function runSync(): Promise<void> {
  if (syncInFlight) {
    rerunRequested = true;
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      do {
        rerunRequested = false;
        await pushOutbox();
        await pushPhotos();
        await pullAll();
      } while (rerunRequested);
      await db
        .insert(appMeta)
        .values({ key: LAST_SYNC_KEY, value: String(Date.now()) })
        .onConflictDoUpdate({ target: appMeta.key, set: { value: String(Date.now()) } });
    } finally {
      syncInFlight = null;
      hasAttemptedSync = true;
      attemptListeners.forEach((listener) => listener());
    }
  })();

  return syncInFlight;
}

export async function getLastSyncCompletedAt(): Promise<number | null> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, LAST_SYNC_KEY)).limit(1);
  return row?.value ? Number(row.value) : null;
}
