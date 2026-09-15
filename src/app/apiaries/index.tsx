import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { deleteApiary, useApiaries } from '../../repositories/apiaryRepository';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../../theme/tokens';

export default function ApiariesListScreen() {
  const { data: apiaries } = useApiaries();
  const { intent } = useLocalSearchParams<{ intent?: string }>();

  const handleDelete = (apiaryId: string, name: string) => {
    Alert.alert('양봉장 삭제', `"${name}"을(를) 삭제할까요? 소속된 봉군도 함께 삭제되며, 되돌릴 수 없습니다.`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => deleteApiary(apiaryId) },
    ]);
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="양봉장 목록" onBack={() => router.back()} />
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }}>
        {apiaries?.map((apiary) => (
          <Card
            key={apiary.id}
            onPress={() => router.push({ pathname: '/apiaries/[apiaryId]/edit', params: { apiaryId: apiary.id, intent } })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.lg, color: colors.textPrimary }}>{apiary.name}</Text>
                {apiary.address && (
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
                    {apiary.address}
                  </Text>
                )}
              </View>
              <Pressable onPress={() => handleDelete(apiary.id, apiary.name)} hitSlop={12}>
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: '#C1443A' }}>삭제</Text>
              </Pressable>
            </View>
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
