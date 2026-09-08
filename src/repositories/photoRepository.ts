import { desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { getCurrentUserId } from '../auth/currentUser';
import { db } from '../db/client';
import { photos } from '../db/schema';
import { DbOrTx } from '../sync/outbox';
import { PickedPhoto } from '../components/PhotoPicker';

// Called from within the same transaction that creates a record (see
// createQuickRecord/createVoiceRecord) — no outbox row here, since photos
// sync via src/sync/photos.ts's own upload loop, not the generic outbox
// engine.
export async function insertPhotosForRecord(tx: DbOrTx, recordId: string, picked: PickedPhoto[]): Promise<void> {
  if (picked.length === 0) return;
  const userId = getCurrentUserId();
  const now = Date.now();
  for (const photo of picked) {
    await tx.insert(photos).values({
      id: photo.id,
      userId,
      recordId,
      localUri: photo.uri,
      width: photo.width,
      height: photo.height,
      createdAt: now,
      updatedAt: now,
      syncStatus: '기기 내 저장',
    });
  }
}

export function usePhotosForRecord(recordId: string | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(photos)
      .where(eq(photos.recordId, recordId ?? ''))
      .orderBy(desc(photos.createdAt)),
    [recordId],
  );
}

