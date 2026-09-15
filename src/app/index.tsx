import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { SplashView } from '../components/SplashView';
import { useAppMetaValue } from '../repositories/appMetaRepository';
import { useApiaries } from '../repositories/apiaryRepository';
import { useHasAttemptedApiariesPull } from '../sync/useHasAttemptedApiariesPull';

// On a new device with an existing account, the local apiaries table starts
// empty until the first pull lands — without this wait, a returning user
// would flash through the "create your first apiary" setup flow. Offline
// users must not be stuck waiting forever, so this is bounded by a timeout.
const SYNC_WAIT_TIMEOUT_MS = 3000;

// Module-level, not component state: logging in/out replaces this screen
// with "/(auth)/login" or the tabs, which unmounts Index — a fresh mount's
// local state would reset `tapped` to false, showing the splash screen
// again every time login.tsx/account.tsx navigate back to "/" after a
// successful sign-in or sign-out. This should only ever show once per app
// launch, so the flag lives outside the component and survives remounts.
let hasShownSplash = false;

export default function Index() {
  const { isAuthenticated } = useAuth();
  const [tapped, setTapped] = useState(hasShownSplash);
  const { data: apiaries } = useApiaries({ includeArchived: true });
  const hasAttemptedApiariesPull = useHasAttemptedApiariesPull();
  const setupSkipped = useAppMetaValue('setup_skipped');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => setTimedOut(true), SYNC_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  if (!tapped) {
    return (
      <SplashView
        onStart={() => {
          hasShownSplash = true;
          setTapped(true);
        }}
      />
    );
  }
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (apiaries === undefined || setupSkipped === undefined) return null;
  if (apiaries.length === 0 && setupSkipped !== 'true' && !hasAttemptedApiariesPull && !timedOut) return null;
  if (apiaries.length === 0 && setupSkipped !== 'true') return <Redirect href="/(setup)/first-apiary" />;
  return <Redirect href="/(tabs)/home" />;
}
