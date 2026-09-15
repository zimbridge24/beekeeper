import { useSyncExternalStore } from 'react';

import { getHasAttemptedApiariesPull, subscribeApiariesPullAttempt } from './pull';

export function useHasAttemptedApiariesPull(): boolean {
  return useSyncExternalStore(subscribeApiariesPullAttempt, getHasAttemptedApiariesPull, getHasAttemptedApiariesPull);
}
