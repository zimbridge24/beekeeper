import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeTabIcon, HoneycombTabIcon } from '../../components/icons';
import { colors, fontFamilies, fontSizes } from '../../theme/tokens';

function SettingsTabIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: focused ? colors.primary : '#D8D4C4',
      }}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // The default bottom-tab-bar inset handling still let the bar sit just
  // under Android's gesture nav bar on some devices — pad a bit past the
  // raw safe-area inset instead of relying on it exactly.
  const bottomPad = insets.bottom + 12;

  return (
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
        name="settings"
        options={{ title: '설정', tabBarIcon: ({ focused }) => <SettingsTabIcon focused={focused} /> }}
      />
    </Tabs>
  );
}
