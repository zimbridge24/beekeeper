import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { runSync } from './runSync';

const MIN_INTERVAL_MS = 30_000;

// Wires the three sync triggers from the architecture: offline→online
// transition, app-foreground resume (throttled), and (elsewhere) a manual
// retry button that calls runSync() directly.
export function useSyncTriggers() {
  const { isAuthenticated } = useAuth();
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    const maybeSync = () => {
      const now = Date.now();
      if (now - lastRunRef.current < MIN_INTERVAL_MS) return;
      lastRunRef.current = now;
      runSync().catch((err) => console.warn('[sync] sync cycle failed', err));
    };

    maybeSync();

    const netSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        maybeSync();
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') maybeSync();
    });

    return () => {
      netSubscription();
      appStateSubscription.remove();
    };
  }, [isAuthenticated]);
}
