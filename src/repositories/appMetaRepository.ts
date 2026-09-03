import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../db/client';
import { appMeta } from '../db/schema';

export function useAppMetaValue(key: string): string | undefined | null {
  const { data } = useLiveQuery(db.select().from(appMeta).where(eq(appMeta.key, key)).limit(1), [key]);
  if (data === undefined) return undefined; // still loading
  return data[0]?.value ?? null;
}

export async function setAppMetaValue(key: string, value: string): Promise<void> {
  await db
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } });
}
