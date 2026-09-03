import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useApiaries } from '../../repositories/apiaryRepository';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../../theme/tokens';

export default function ApiariesListScreen() {
  const { data: apiaries } = useApiaries();

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="양봉장 목록" onBack={() => router.back()} />
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }}>
        {apiaries?.map((apiary) => (
          <Card key={apiary.id} onPress={() => router.push({ pathname: '/apiaries/[apiaryId]/edit', params: { apiaryId: apiary.id } })}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.lg, color: colors.textPrimary }}>{apiary.name}</Text>
            {apiary.address && (
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
                {apiary.address}
              </Text>
            )}
          </Card>
        ))}

        <Pressable onPress={() => router.push('/apiaries/new')}>
          <View
            style={{
              borderRadius: radius.cardLarge,
              borderWidth: 1.5,
              borderColor: '#C4CFC2',
              borderStyle: 'dashed',
              padding: spacing.xxl,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.primary }}>+ 양봉장 추가</Text>
          </View>
        </Pressable>
      </View>
    </Screen>
  );
}
