import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { ChecklistSummary } from '../../../components/WinteringChecklistView';
import { Card } from '../../../components/Card';
import { ForwardChevronIcon } from '../../../components/icons';
import { ReferenceNote } from '../../../components/ReferenceNote';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { buildWinteringFacts, lastWinteringCheckAt } from '../../../features/health/facts';
import { openRecordForm } from '../../../features/records/openRecordForm';
import { daysBetween, isWinteringPrepSeason } from '../../../features/health/time';
import { computeWinteringChecklist } from '../../../features/health/winteringReadiness';
import { useApiaries } from '../../../repositories/apiaryRepository';
import { useHealthSource } from '../../../repositories/healthRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

export default function WinteringHubScreen() {
  const source = useHealthSource();
  const { data: apiaries } = useApiaries();

  const rows =
    source?.colonies.map((colony) => {
      const facts = buildWinteringFacts(source, colony.id);
      const checklist = facts ? computeWinteringChecklist(facts) : null;
      return { colony, checklist, lastCheckAt: lastWinteringCheckAt(source, colony.id) };
    }) ?? [];

  const apiaryName = (id: string) => apiaries?.find((a) => a.id === id)?.name ?? '';
  const season = source ? isWinteringPrepSeason(source.now) : false;
  // 보완할 항목·정보 없는 항목이 많은 봉군부터 — 가장 손이 필요한 봉군이 위로 온다.
  const need = (c: (typeof rows)[number]['checklist']) => (c ? c.improveCount * 2 + c.unknownCount : 99);
  const sorted = [...rows].sort((a, b) => need(b.checklist) - need(a.checklist));

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="월동 점검" onBack={() => router.back()} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
      >
        <Card size="medium" tint={season ? '#FBEED9' : colors.surfaceTint}>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: season ? '#8A5A0F' : colors.primary }}>
            {season ? '월동 준비를 점검할 시기예요' : '월동 전(9월 중순~11월)에 점검하면 가장 좋아요'}
          </Text>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
            지금까지 입력된 내검·응애·말벌 기록을 바탕으로 봉군별 점검 현황을 보여줘요. 봉군을 눌러 월동 준비를 점검하고 기록해 보세요.
          </Text>
          <View style={{ marginTop: spacing.sm }}>
            <ReferenceNote kind="readiness" />
          </View>
        </Card>

        <Button label="💡 월동 준비 팁 보기" variant="surface" onPress={() => router.push('/health/wintering/tips')} />

        {source && sorted.length === 0 && (
          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              점검할 봉군이 없어요. 먼저 봉군을 등록해주세요.
            </Text>
          </Card>
        )}

        {sorted.map(({ colony, checklist, lastCheckAt }) => (
          <Card
            key={colony.id}
            onPress={() => openRecordForm({ apiaryId: colony.apiaryId, colonyId: colony.id, recordType: 'wintering_prep' })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>{colony.alias}</Text>
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
                  {apiaryName(colony.apiaryId)}
                  {lastCheckAt && source ? ` · 마지막 점검 ${daysBetween(lastCheckAt, source.now)}일 전` : ' · 아직 점검 안 함'}
                </Text>
                {checklist && <ChecklistSummary checklist={checklist} showTitle={false} />}
                {checklist?.firstAction && (
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary }}>
                    가장 먼저 확인할 것: {checklist.firstAction.todo}
                  </Text>
                )}
              </View>
              <ForwardChevronIcon />
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
