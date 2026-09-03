import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { SplashView } from '../components/SplashView';
import { useAppMetaValue } from '../repositories/appMetaRepository';
import { useApiaries } from '../repositories/apiaryRepository';
import { useHasAttemptedSync } from '../sync/useHasAttemptedSync';

// On a new device with an existing account, the local apiaries table starts
// empty until the first pull lands — without this wait, a returning user
// would flash through the "create your first apiary" setup flow. Offline
// users must not be stuck waiting forever, so this is bounded by a timeout.
const SYNC_WAIT_TIMEOUT_MS = 3000;

export default function Index() {
  const { isAuthenticated } = useAuth();
  const [tapped, setTapped] = useState(false);
  const { data: apiaries } = useApiaries({ includeArchived: true });
  const hasAttemptedSync = useHasAttemptedSync();
  const setupSkipped = useAppMetaValue('setup_skipped');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => setTimedOut(true), SYNC_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  if (!tapped) return <SplashView onStart={() => setTapped(true)} />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (apiaries === undefined || setupSkipped === undefined) return null;
  if (apiaries.length === 0 && setupSkipped !== 'true' && !hasAttemptedSync && !timedOut) return null;
  if (apiaries.length === 0 && setupSkipped !== 'true') return <Redirect href="/(setup)/first-apiary" />;
  return <Redirect href="/(tabs)/home" />;
}
