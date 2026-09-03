import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Card } from '../../../components/Card';
import { ForwardChevronIcon } from '../../../components/icons';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useApiaries } from '../../../repositories/apiaryRepository';
import { useRecentColoniesWithApiary } from '../../../repositories/colonyRepository';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../../../theme/tokens';

export default function ColoniesListScreen() {
  const { data: colonies } = useRecentColoniesWithApiary(500);
  const { data: apiaries } = useApiaries();

  const handleAddColony = () => {
    if (apiaries?.length === 1) {
      router.push({ pathname: '/apiaries/[apiaryId]/colonies/new', params: { apiaryId: apiaries[0].id } });
    } else {
      // Zero or multiple apiaries — let the user pick (or create) one first.
      router.push('/apiaries');
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="봉군 목록" />
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }}>
        {colonies?.length === 0 && (
          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              아직 등록된 봉군이 없어요.
            </Text>
          </Card>
        )}
        {colonies?.map(({ colony, apiaryName }) => (
          <Card
            key={colony.id}
            onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId: colony.id } })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>
                    {colony.alias}
                  </Text>
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
                    {colony.species === 'western' ? '서양벌' : '토종벌'}
                  </Text>
                </View>
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 6 }}>
                  {apiaryName ?? '소속 양봉장 없음'}
                </Text>
              </View>
              <ForwardChevronIcon />
            </View>
          </Card>
        ))}

        <Pressable onPress={handleAddColony}>
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
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.primary }}>+ 봉군 추가</Text>
          </View>
        </Pressable>
      </View>
    </Screen>
  );
}
