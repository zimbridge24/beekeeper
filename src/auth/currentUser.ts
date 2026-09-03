// Repositories are plain functions (not hooks) but still need the current
// user id synchronously to stamp rows on write. AuthProvider keeps this in
// sync with the local `users` table via setCurrentUserId whenever its
// useLiveQuery result changes, so repositories never need their own async
// DB round-trip just to find out who's logged in.
let cachedUserId: string | null = null;

export function setCurrentUserId(id: string | null) {
  cachedUserId = id;
}

export function getCurrentUserId(): string {
  if (!cachedUserId) {
    throw new Error('No authenticated user — repository call made before sign-in');
  }
  return cachedUserId;
}
