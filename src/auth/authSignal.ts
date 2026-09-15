// A synchronous, subscribable "am I authenticated" flag.
//
// AuthProvider's isAuthenticated used to be derived purely from
// useLiveQuery(db.select().from(users)...) — reactive, but only updated
// once expo-sqlite's native change-listener callback fires and re-runs the
// query, which is not synchronous with the write that caused it. Code that
// awaited signOut()/verifyPhoneOtp() and immediately navigated based on
// isAuthenticated could still read the pre-action (stale) value, landing on
// the wrong screen — e.g. logging out and landing on "register your first
// apiary" instead of the login screen, because isAuthenticated briefly read
// as still-true.
//
// Auth actions (signOut, deleteAccount, verifyPhoneOtp,
// signIn/signUpWithEmail) call setAuthenticatedSignal directly, the instant
// they know the outcome — before their own promise resolves — so any code
// awaiting them sees the correct value immediately. AuthProvider still syncs
// this from the local `users` table for cold-start bootstrap and any
// DB-driven change that didn't go through one of those actions (e.g. a
// forced sign-out from an expired refresh token).
type Listener = () => void;

let authenticated: boolean | null = null;
const listeners = new Set<Listener>();

export function setAuthenticatedSignal(value: boolean) {
  authenticated = value;
  listeners.forEach((listener) => listener());
}

export function getAuthenticatedSignal() {
  return authenticated;
}

export function subscribeAuthenticatedSignal(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
