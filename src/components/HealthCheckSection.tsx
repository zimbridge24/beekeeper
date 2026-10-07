import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { computeInsights } from '../features/health/colonyInsights';
import { isWinteringPrepSeason } from '../features/health/time';
import { openRecordForm } from '../features/records/openRecordForm';
import { useHealthSource } from '../repositories/healthRepository';
import { colors, fontFamilies, fontSizes, radius, spacing, statusColors } from '../theme/tokens';
import { Card } from './Card';
import { InsightCard } from './InsightCard';
import { ReferenceNote } from './ReferenceNote';

const MAX_HOME_INSIGHTS = 4;

type TileProps = { emoji: string; label: string; sub: string; highlight?: boolean; onPress: () => void };

function Tile({ emoji, label, sub, highlight, onPress }: TileProps) {
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress}>
      <Card size="large" tint={highlight ? statusColors.caution.bg : undefined} style={{ alignItems: 'center', gap: 4, paddingHorizontal: spacing.xs }}>
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{label}</Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: highlight ? statusColors.caution.text : colors.textMuted }}
        >
          {sub}
        </Text>
      </Card>
    </Pressable>
  );
}

// 홈의 "건강체크" 영역 — 응애 · 월동 점검 · 말벌 세 가지 진입점과, 기록에서
// 찾아낸 "놓치고 있는 것" 알림을 같이 보여준다.
export function HealthCheckSection() {
  const source = useHealthSource();
  const insights = useMemo(() => (source ? computeInsights(source) : []), [source]);
  const season = source ? isWinteringPrepSeason(source.now) : false;
  const colonyCount = source?.colonies.length ?? 0;

  // 봉군이 하나뿐이면 고를 필요 없이 바로 그 봉군의 기록 폼으로, 여럿이면 봉군 선택으로.
  const openFor = (recordType: 'mite' | 'hornet') => {
    if (source && source.colonies.length === 1) {
      const colony = source.colonies[0];
      openRecordForm({ apiaryId: colony.apiaryId, colonyId: colony.id, recordType });
      return;
    }
    router.push({ pathname: '/health/pick-colony', params: { recordType } });
  };

  const dangerCount = insights.filter((i) => i.severity === 'danger').length;

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>건강체크</Text>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Tile emoji="🔴" label="응애 체크" sub={dangerCount > 0 ? `확인 필요 ${dangerCount}건` : '세는 법·기준 안내'} onPress={() => openFor('mite')} />
        <Tile
          emoji="❄️"
          label="월동 점검"
          sub={season ? '점검할 시기예요' : '체크리스트·팁'}
          highlight={season}
          onPress={() => router.push('/health/wintering')}
        />
        <Tile emoji="🐝" label="말벌 체크" sub="종류·마릿수 기록" onPress={() => openFor('hornet')} />
      </View>

      {insights.length > 0 && (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>놓치고 있는 것</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: statusColors.danger.bg }}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: statusColors.danger.text }}>{insights.length}</Text>
            </View>
          </View>
          {insights.slice(0, MAX_HOME_INSIGHTS).map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
          <ReferenceNote kind="general" />
          {insights.length > MAX_HOME_INSIGHTS && (
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
              외 {insights.length - MAX_HOME_INSIGHTS}건 — 각 봉군 상세에서 확인할 수 있어요
            </Text>
          )}
        </View>
      )}

      {source && colonyCount > 0 && insights.length === 0 && (
        <Card size="medium" tint={statusColors.normal.bg}>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: statusColors.normal.text }}>
            지금 놓치고 있는 항목이 없어요. 기록이 쌓일수록 더 정확하게 알려드려요.
          </Text>
        </Card>
      )}
    </View>
  );
}
