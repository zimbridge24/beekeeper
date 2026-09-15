import type { User } from '@supabase/supabase-js';

import { setAuthenticatedSignal } from './authSignal';
import { setCurrentUserId } from './currentUser';
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
  // Set synchronously here rather than waiting for AuthProvider's
  // useLiveQuery to notice the write — that only happens once expo-sqlite's
  // native change-listener callback fires and re-runs the query, which
  // isn't synchronous with this insert. Code that awaits a login call and
  // immediately navigates needs isAuthenticated to already be correct.
  setCurrentUserId(user.id);
  setAuthenticatedSignal(true);
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
  // Local wipe must happen even if the network call fails (offline, an
  // already-expired/invalid token, etc.) — the user's intent is to be
  // signed out on this device *now*, not contingent on reachability.
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[auth] supabase.auth.signOut() failed, clearing local session anyway', err);
  }
  await resetLocalDatabase();
  setCurrentUserId(null);
  setAuthenticatedSignal(false);
}

// Permanently deletes the account server-side (see
// supabase/functions/delete-account) — the client SDK has no self-delete
// call, so this goes through an Edge Function that verifies the caller's own
// JWT and uses the service role key to delete just that user. Irreversible.
export async function deleteAccount(): Promise<void> {
  await invokeEdgeFunction('delete-account', {});
  // The account is already gone server-side at this point, so local
  // cleanup must proceed even if this now-pointless signOut() call itself
  // errors (e.g. the just-deleted user's token is rejected as invalid).
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[auth] post-delete supabase.auth.signOut() failed, clearing local session anyway', err);
  }
  await resetLocalDatabase();
  setCurrentUserId(null);
  setAuthenticatedSignal(false);
}
