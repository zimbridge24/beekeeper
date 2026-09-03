import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { endVisit, useApiaryColoniesWithVisitStatus, useVisit } from '../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

export default function VisitProgressScreen() {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const { data: visitRows } = useVisit(visitId);
  const visit = visitRows?.[0];
  const { data: colonyRows } = useApiaryColoniesWithVisitStatus(visit?.apiaryId, visitId);
  const [ending, setEnding] = useState(false);

  const total = colonyRows?.length ?? 0;
  const done = colonyRows?.filter((r) => r.visitColony?.status === 'done').length ?? 0;

  const handleEnd = () => {
    Alert.alert('내검 종료', '방문을 종료할까요? 완료하지 못한 봉군은 다음에 이어서 기록할 수 있어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '종료',
        onPress: async () => {
          setEnding(true);
          try {
            await endVisit(visitId);
            router.replace('/(tabs)/home');
          } finally {
            setEnding(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="연속 내검 현황" onBack={() => router.back()} />
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }}>
        <Card size="large">
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
            {done} / {total} 완료
          </Text>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
            계속해서 다음 봉군을 점검해주세요
          </Text>
          <View style={{ marginTop: spacing.md, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View
              style={{
                height: '100%',
                borderRadius: 3,
                backgroundColor: colors.primary,
                width: total > 0 ? `${(done / total) * 100}%` : '0%',
              }}
            />
          </View>
        </Card>

        <View style={{ gap: spacing.sm }}>
          {colonyRows?.map(({ colony, visitColony }) => {
            const isDone = visitColony?.status === 'done';
            return (
              <Card
                key={colony.id}
                size="medium"
                onPress={() =>
                  router.push({ pathname: '/visits/[visitId]/[colonyId]/quick-check', params: { visitId, colonyId: colony.id } })
                }
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.textPrimary }}>
                    {colony.alias}
                  </Text>
                  <Text
                    style={{
                      fontFamily: fontFamilies.bold,
                      fontSize: fontSizes.sm,
                      color: isDone ? '#2C7A57' : colors.textMuted,
                    }}
                  >
                    {isDone ? '✓ 완료' : '대기'}
                  </Text>
                </View>
              </Card>
            );
          })}
        </View>
      </View>

      <View style={{ padding: spacing.xl }}>
        <Button label="내검 종료하기" variant="surface" onPress={handleEnd} loading={ending} />
      </View>
    </Screen>
  );
}
