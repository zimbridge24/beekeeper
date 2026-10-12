import { Tabs } from 'expo-router';
import type { ComponentType } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeTabIcon, HoneycombTabIcon, ReportTabIcon, SearchTabIcon } from '../../components/icons';
import { isExpoGo } from '../../features/health/runtimeEnv';
import { colors, fontFamilies, fontSizes } from '../../theme/tokens';

// Expo Go(안드로이드)는 expo-notifications를 불러오기만 해도 에러를 던지므로, 푸시 관리자는 Expo Go에서
// 아예 불러오지 않는다 (위쪽 import로 두면 모듈이 로드되는 순간 앱 전체가 죽는다).
const PushNotificationManager: ComponentType | null = isExpoGo
  ? null
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../components/PushNotificationManager').PushNotificationManager;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // The default bottom-tab-bar inset handling still let the bar sit just
  // under Android's gesture nav bar on some devices — pad a bit past the
  // raw safe-area inset instead of relying on it exactly.
  const bottomPad = insets.bottom + 12;

  return (
    <>
      {PushNotificationManager && <PushNotificationManager />}
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 56 + bottomPad,
          paddingTop: 8,
          paddingBottom: bottomPad,
        },
        tabBarLabelStyle: { fontFamily: fontFamilies.bold, fontSize: fontSizes.xs },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: '홈', tabBarIcon: ({ color }) => <HomeTabIcon color={color as string} /> }}
      />
      <Tabs.Screen
        name="colonies"
        options={{ title: '봉군', tabBarIcon: ({ color }) => <HoneycombTabIcon color={color as string} /> }}
      />
      <Tabs.Screen
        name="report"
        options={{ title: '리포트', tabBarIcon: ({ color }) => <ReportTabIcon color={color as string} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: '기록찾기', tabBarIcon: ({ color }) => <SearchTabIcon color={color as string} /> }}
      />
      {/* 설정은 탭 바에서 빠졌지만 홈 우측 상단 마스코트로 계속 들어갈 수 있다 — 라우트는 그대로 둔다. */}
      <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </>
  );
}
