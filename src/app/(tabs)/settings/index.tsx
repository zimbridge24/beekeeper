import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card } from '../../../components/Card';
import { ForwardChevronIcon } from '../../../components/icons';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

const MENU_ITEMS: {
  label: string;
  href: '/(tabs)/settings/account' | '/(tabs)/settings/notifications' | '/(tabs)/settings/permissions' | '/(tabs)/settings/data-usage' | '/sync/status';
}[] = [
  { label: '계정', href: '/(tabs)/settings/account' },
  { label: '점검 알림', href: '/(tabs)/settings/notifications' },
  { label: '권한', href: '/(tabs)/settings/permissions' },
  { label: '동기화 상태', href: '/sync/status' },
  { label: '데이터 이용 안내', href: '/(tabs)/settings/data-usage' },
];

export default function SettingsScreen() {
  return (
    <Screen>
      <ScreenHeader title="설정" />
      <View style={{ gap: spacing.sm }}>
        {MENU_ITEMS.map((item) => (
          <Card key={item.href} size="medium" onPress={() => router.push(item.href)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{item.label}</Text>
              <ForwardChevronIcon />
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
