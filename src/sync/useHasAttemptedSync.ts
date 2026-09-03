import { useSyncExternalStore } from 'react';

import { getHasAttemptedSync, subscribeSyncAttempt } from './runSync';

export function useHasAttemptedSync(): boolean {
  return useSyncExternalStore(subscribeSyncAttempt, getHasAttemptedSync, getHasAttemptedSync);
}
