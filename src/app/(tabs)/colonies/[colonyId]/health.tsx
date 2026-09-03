import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Card } from '../../../../components/Card';
import { Screen } from '../../../../components/Screen';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { useColony } from '../../../../repositories/colonyRepository';
import { useFieldValuesForRecordIds, useRecordsForColony } from '../../../../repositories/recordRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../../theme/tokens';

const CHART_HEIGHT = 110;
const RECENT_LIMIT = 6;

export default function ColonyHealthScreen() {
  const { colonyId } = useLocalSearchParams<{ colonyId: string }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];
  const { data: allRecords } = useRecordsForColony(colonyId);

  const recentRecords = (allRecords ?? []).slice(0, RECENT_LIMIT).reverse(); // oldest -> newest, left to right
  const recordIds = recentRecords.map((r) => r.id);
  const { data: fieldValues } = useFieldValuesForRecordIds(recordIds);

  const bars = recentRecords.map((record) => {
    const problemCount =
      fieldValues?.filter((fv) => fv.recordId === record.id && fv.category === 'problem' && fv.valueState === 'present')
        .length ?? 0;
    return {
      date: new Date(record.occurredAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
      count: problemCount,
    };
  });

  const maxCount = Math.max(1, ...bars.map((b) => b.count));

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title={`${colony?.alias ?? ''} · 건강 변화`} onBack={() => router.back()} subdued />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
          최근 {bars.length}회 방문 · 문제 항목 발생 추이
        </Text>

        {bars.length === 0 ? (
          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              아직 방문 기록이 없어요.
            </Text>
          </Card>
        ) : (
          <Card size="large">
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: CHART_HEIGHT }}>
              {bars.map((bar, i) => (
                <View key={i} style={{ alignItems: 'center', gap: spacing.sm }}>
                  <View
                    style={{
                      width: 28,
                      height: Math.max(4, (bar.count / maxCount) * (CHART_HEIGHT - 24)),
                      borderRadius: 8,
                      backgroundColor: bar.count > 0 ? colors.accentActive : colors.primary,
                    }}
                  />
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>{bar.date}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <Card size="large" tint={colors.surfaceTint}>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textPrimary, lineHeight: 20 }}>
            막대는 방문마다 &quot;문제&quot; 항목에 &quot;있음&quot;으로 표시된 개수예요. 실제 건강 점수가 아니라, 문제로
            체크된 항목이 얼마나 반복되는지 보는 참고용 그래프입니다.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
