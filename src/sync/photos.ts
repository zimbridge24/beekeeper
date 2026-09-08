import { eq } from 'drizzle-orm';
import { File } from 'expo-file-system';

import { db } from '../db/client';
import { photos } from '../db/schema';
import { supabase } from '../supabase/client';
import { toIso } from './timestamps';

const STORAGE_BUCKET = 'inspection-photos';

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// Photos don't go through the generic outbox/JSON-upsert engine in
// src/sync/tables.ts — that path upserts plain rows into a Postgres table,
// but a photo is binary data that has to go to Supabase Storage. This runs
// its own small push: upload the file, then upsert a metadata row pointing
// at the resulting storage path. Called from runSync() alongside pushOutbox.
export async function pushPhotos(): Promise<{ pushed: number; failed: number }> {
  const allPhotos = await db.select().from(photos);
  const unsynced = allPhotos.filter((p) => !p.remotePath || p.syncStatus === '동기화 실패');

  let pushedCount = 0;
  let failedCount = 0;

  for (const photo of unsynced) {
    try {
      await db.update(photos).set({ syncStatus: '동기화 중' }).where(eq(photos.id, photo.id));

      const storagePath = `${photo.userId}/${photo.id}.jpg`;
      const file = new File(photo.localUri);
      const bytes = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { error: upsertError } = await supabase.from('photos').upsert(
        {
          id: photo.id,
          user_id: photo.userId,
          record_id: photo.recordId,
          storage_path: storagePath,
          width: photo.width,
          height: photo.height,
          created_at: toIso(photo.createdAt),
          updated_at: toIso(Date.now()),
        },
        { onConflict: 'id' },
      );
      if (upsertError) throw upsertError;

      await db
        .update(photos)
        .set({ remotePath: storagePath, syncStatus: '동기화 완료', lastSyncedAt: Date.now() })
        .where(eq(photos.id, photo.id));
      pushedCount++;
    } catch (err) {
      console.warn(`[sync] photo push failed for ${photo.id}:`, describeError(err));
      await db.update(photos).set({ syncStatus: '동기화 실패' }).where(eq(photos.id, photo.id));
      failedCount++;
    }
  }

  return { pushed: pushedCount, failed: failedCount };
}
