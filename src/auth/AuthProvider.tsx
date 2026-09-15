import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, ReactNode, useContext, useEffect, useSyncExternalStore } from 'react';

import { db, resetLocalDatabase } from '../db/client';
import { users } from '../db/schema';
import { supabase } from '../supabase/client';
import { getAuthenticatedSignal, setAuthenticatedSignal, subscribeAuthenticatedSignal } from './authSignal';
import { setCurrentUserId } from './currentUser';
import { deleteAccount as deleteAccountSession, signOut as signOutSession, upsertLocalUser } from './session';

type AuthContextValue = {
  isReady: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Local `users` row is the offline bootstrap source of truth: if it's
  // present, the app treats itself as logged in immediately, with zero
  // network dependency. supabase.auth below only confirms/refreshes this in
  // the background — a network failure here must never force a sign-out.
  const { data: localUsers } = useLiveQuery(db.select().from(users).limit(1));

  // isAuthenticated is read from authSignal (via useSyncExternalStore), not
  // directly from localUsers — session.ts's signOut/deleteAccount/
  // upsertLocalUser set that signal synchronously the instant they know the
  // outcome, so code that awaits one of those calls and immediately
  // navigates sees the correct value right away. useLiveQuery's own update
  // only lands once expo-sqlite's native change-listener callback fires and
  // re-runs the query, which is not synchronous with the write that caused
  // it — relying on it alone caused post-logout navigation to briefly read
  // stale (still-authenticated) state and land on the wrong screen.
  const authSignal = useSyncExternalStore(subscribeAuthenticatedSignal, getAuthenticatedSignal);

  useEffect(() => {
    if (localUsers === undefined) return;
    const id = localUsers[0]?.id ?? null;
    setCurrentUserId(id);
    // Only backfills the signal on cold start / background DB changes that
    // didn't go through an explicit auth action (those already set it
    // synchronously above). Safe to call redundantly either way.
    setAuthenticatedSignal(localUsers.length > 0);
  }, [localUsers]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        upsertLocalUser(data.session.user).catch((err) => console.warn('[auth] upsertLocalUser failed', err));
      }
      // A failed/empty getSession() (e.g. offline) intentionally does
      // nothing further — the local `users` row, if any, keeps driving
      // isAuthenticated until an explicit SIGNED_OUT event arrives.
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        resetLocalDatabase()
          .then(() => {
            setCurrentUserId(null);
            setAuthenticatedSignal(false);
          })
          .catch((err) => console.warn('[auth] resetLocalDatabase failed', err));
        return;
      }
      if (session?.user) {
        upsertLocalUser(session.user).catch((err) => console.warn('[auth] upsertLocalUser failed', err));
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    isReady: authSignal !== null,
    isAuthenticated: authSignal === true,
    userId: localUsers?.[0]?.id ?? null,
    signOut: signOutSession,
    deleteAccount: deleteAccountSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
