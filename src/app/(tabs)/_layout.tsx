import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { colors, fontFamilies, fontSizes } from '../../theme/tokens';

function TabIcon({ focused, shape }: { focused: boolean; shape: 'square' | 'circle' }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: shape === 'circle' ? 11 : 6,
        backgroundColor: focused ? colors.primary : '#D8D4C4',
      }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fontFamilies.bold, fontSize: fontSizes.xs },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: '홈', tabBarIcon: ({ focused }) => <TabIcon focused={focused} shape="square" /> }}
      />
      <Tabs.Screen
        name="colonies"
        options={{ title: '봉군', tabBarIcon: ({ focused }) => <TabIcon focused={focused} shape="square" /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정', tabBarIcon: ({ focused }) => <TabIcon focused={focused} shape="circle" /> }}
      />
    </Tabs>
  );
}
