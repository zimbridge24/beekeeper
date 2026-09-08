import type { User } from '@supabase/supabase-js';

import { db, resetLocalDatabase } from '../db/client';
import { users } from '../db/schema';
import { supabase } from '../supabase/client';
import { invokeEdgeFunction } from '../supabase/edgeFunctionClient';

export async function upsertLocalUser(user: User) {
  const now = Date.now();
  const displayName = (user.user_metadata?.display_name as string | undefined) ?? null;

  await db
    .insert(users)
    .values({ id: user.id, email: user.email ?? null, displayName, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email ?? null, displayName, updatedAt: now },
    });
}

export async function getLocalUser() {
  const rows = await db.select().from(users).limit(1);
  return rows[0] ?? null;
}

// Local SQLite is a per-device cache for the *currently signed-in user*.
// Signing out clears it entirely rather than tagging every row with
// user_id, so a second person signing into the same device never sees a
// previous user's offline data.
export async function signOut() {
  await supabase.auth.signOut();
  await resetLocalDatabase();
}

// Permanently deletes the account server-side (see
// supabase/functions/delete-account) — the client SDK has no self-delete
// call, so this goes through an Edge Function that verifies the caller's own
// JWT and uses the service role key to delete just that user. Irreversible.
export async function deleteAccount(): Promise<void> {
  await invokeEdgeFunction('delete-account', {});
  // The account is already gone server-side at this point; signOut() here
  // just clears the now-stale local session token cache.
  await supabase.auth.signOut();
  await resetLocalDatabase();
}
