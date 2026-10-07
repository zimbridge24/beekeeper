import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Card } from '../../components/Card';
import { ForwardChevronIcon } from '../../components/icons';
import { ReferenceNote } from '../../components/ReferenceNote';
import { RiskBadge } from '../../components/RiskBadge';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { extractColonySeries } from '../../features/health/facts';
import { getHornetSpeciesLabel } from '../../features/health/hornetRisk';
import { daysBetween } from '../../features/health/time';
import { openRecordForm } from '../../features/records/openRecordForm';
import { useApiaries } from '../../repositories/apiaryRepository';
import { useHealthSource } from '../../repositories/healthRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

// 응애/말벌 기록을 남길 봉군 고르기 — 각 봉군의 마지막 응애 검사·말벌 기록을 같이
// 보여줘서, 오래 안 한 봉군이나 반복되는 봉군을 한눈에 찾을 수 있다.
export default function PickColonyScreen() {
  const { recordType } = useLocalSearchParams<{ recordType?: string }>();
  const isHornet = recordType === 'hornet';
  const source = useHealthSource();
  const { data: apiaries } = useApiaries();

  const rows =
    source?.colonies.map((colony) => {
      const series = extractColonySeries(source, colony.id);
      const lastMite = series.miteChecks.filter((c) => c.result !== 'indeterminate').at(-1) ?? null;
      const lastHornet = series.hornetEvents.at(-1) ?? null;
      const last = isHornet ? lastHornet : lastMite;
      return {
        colony,
        days: last ? daysBetween(last.at, source.now) : null,
        risk: last?.riskLevel ?? null,
        detail: isHornet && lastHornet ? getHornetSpeciesLabel(lastHornet.species) : null,
      };
    }) ?? [];
  // 한 번도 안 한 봉군 → 오래된 순.
  rows.sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity));

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title={isHornet ? '어느 봉군에 말벌이 왔나요?' : '어느 봉군을 검사할까요?'} onBack={() => router.back()} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
      >
        {source && rows.length === 0 && (
          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              등록된 봉군이 없어요. 먼저 봉군을 등록해주세요.
            </Text>
          </Card>
        )}
        {rows.map(({ colony, days, risk, detail }) => (
          <Card
            key={colony.id}
            onPress={() => {
              openRecordForm({ apiaryId: colony.apiaryId, colonyId: colony.id, recordType: isHornet ? 'hornet' : 'mite' });
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>{colony.alias}</Text>
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
                  {apiaries?.find((a) => a.id === colony.apiaryId)?.name ?? ''}
                  {days === null
                    ? isHornet
                      ? ' · 말벌 기록 없음'
                      : ' · 응애 검사 기록 없음'
                    : ` · ${isHornet ? '마지막 말벌 기록' : '마지막 검사'} ${days}일 전${detail ? ` · ${detail}` : ''}`}
                </Text>
              </View>
              <RiskBadge level={risk} />
              <ForwardChevronIcon />
            </View>
          </Card>
        ))}
        {rows.length > 0 && <ReferenceNote kind="general" />}
      </ScrollView>
    </Screen>
  );
}
