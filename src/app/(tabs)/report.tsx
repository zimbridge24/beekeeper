import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ForwardChevronIcon } from '../../components/icons';
import { ReferenceNote } from '../../components/ReferenceNote';
import { RiskBadge } from '../../components/RiskBadge';
import { Screen } from '../../components/Screen';
import { StrengthTrendChart } from '../../components/StrengthTrendChart';
import { STRENGTH_LABEL } from '../../features/health/facts';
import { buildColonyStatusRows, buildStrengthTrend, ColonyStatusRow, FOOD_LABEL, TrendPeriod } from '../../features/health/report';
import { daysBetween } from '../../features/health/time';
import { useApiaries } from '../../repositories/apiaryRepository';
import { useHealthSource } from '../../repositories/healthRepository';
import { colors, fontFamilies, fontSizes, spacing, statusColors } from '../../theme/tokens';

const PERIOD_OPTIONS: { value: TrendPeriod; label: string }[] = [
  { value: '3m', label: '최근 3개월' },
  { value: '1y', label: '최근 1년' },
  { value: 'all', label: '전체' },
];

function ago(at: number, now: number): string {
  const days = daysBetween(at, now);
  return days <= 0 ? '오늘' : `${days}일 전`;
}

function StatusCell({ label, value, sub, warn }: { label: string; value: string | null; sub?: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>{label}</Text>
      {value ? (
        <>
          <Text
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: fontSizes.md,
              color: warn ? statusColors.caution.text : colors.textPrimary,
            }}
          >
            {value}
          </Text>
          {sub ? <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>{sub}</Text> : null}
        </>
      ) : (
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>기록 없음</Text>
      )}
    </View>
  );
}

export default function ReportScreen() {
  const source = useHealthSource();
  const { data: apiaries } = useApiaries({ includeArchived: true });
  const scrollRef = useRef<ScrollView>(null);
  const [chartY, setChartY] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [period, setPeriod] = useState<TrendPeriod>('all');

  const rows = useMemo(() => (source ? buildColonyStatusRows(source) : null), [source]);

  // 처음엔 봉세 기록이 가장 많은 봉군을 보여준다 — 빈 그래프로 시작하지 않게.
  const defaultId = useMemo(() => {
    if (!source || !rows || rows.length === 0) return null;
    let best = rows[0].colonyId;
    let bestCount = -1;
    for (const row of rows) {
      const count = buildStrengthTrend(source, row.colonyId, 'all').length;
      if (count > bestCount) {
        best = row.colonyId;
        bestCount = count;
      }
    }
    return best;
  }, [source, rows]);

  const activeId = rows?.some((r) => r.colonyId === selectedId) ? selectedId : defaultId;
  const points = useMemo(
    () => (source && activeId ? buildStrengthTrend(source, activeId, period) : []),
    [source, activeId, period],
  );

  const apiaryName = (id: string) => apiaries?.find((a) => a.id === id)?.name ?? '';
  const multiApiary = new Set(rows?.map((r) => r.apiaryId)).size > 1;
  const labelCounts = new Map<string, number>();
  for (const r of rows ?? []) labelCounts.set(r.alias, (labelCounts.get(r.alias) ?? 0) + 1);
  const chipLabel = (r: ColonyStatusRow) => ((labelCounts.get(r.alias) ?? 0) > 1 ? `${apiaryName(r.apiaryId)} ${r.alias}` : r.alias);

  const selectColony = (colonyId: string) => {
    setSelectedId(colonyId);
    scrollRef.current?.scrollTo({ y: Math.max(0, chartY - spacing.lg), animated: true });
  };

  const now = source?.now ?? 0;
  const activeRow = rows?.find((r) => r.colonyId === activeId) ?? null;
  const recentPoints = [...points].reverse().slice(0, 5);

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display4, color: colors.textPrimary }}>리포트</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
      >
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>봉군별 현재 상태</Text>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 18 }}>
            각 값은 가장 최근에 기록한 내용이고, 아래 작은 글씨는 기록한 지 며칠 됐는지예요. 마지막 기록이 오래된 봉군이 위에
            와요. 봉군을 누르면 아래 봉세 추이가 그 봉군으로 바뀌어요.
          </Text>
        </View>

        {rows && rows.length === 0 && (
          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              등록된 봉군이 없어요. 봉군을 등록하고 내검을 기록하면 여기에 정리돼요.
            </Text>
          </Card>
        )}

        {rows?.map((row) => (
          <Card key={row.colonyId} onPress={() => selectColony(row.colonyId)}>
            <View style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>{row.alias}</Text>
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
                    {multiApiary ? `${apiaryName(row.apiaryId)} · ` : ''}
                    {row.lastRecordAt ? `마지막 기록 ${ago(row.lastRecordAt, now)}` : '아직 기록 없음'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId: row.colonyId } })}
                  hitSlop={10}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.primary }}>상세</Text>
                  <ForwardChevronIcon color={colors.primary} />
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <StatusCell
                  label="봉세"
                  value={
                    row.strength
                      ? `${STRENGTH_LABEL[row.strength.rank]}${row.strength.trend === 'up' ? ' ▲' : row.strength.trend === 'down' ? ' ▼' : ''}`
                      : null
                  }
                  sub={row.strength ? ago(row.strength.at, now) : undefined}
                  warn={row.strength?.rank === 1 || row.strength?.trend === 'down'}
                />
                <StatusCell
                  label="먹이"
                  value={row.food ? FOOD_LABEL[row.food.rank] : null}
                  sub={row.food ? ago(row.food.at, now) : undefined}
                  warn={row.food?.rank === 1}
                />
                <StatusCell
                  label="여왕벌"
                  value={row.queen ? (row.queen.present ? '있음' : '없음') : null}
                  sub={row.queen ? ago(row.queen.at, now) : undefined}
                  warn={row.queen ? !row.queen.present : false}
                />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>응애</Text>
                {row.mite ? (
                  <>
                    <RiskBadge level={row.mite.riskLevel} />
                    <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>
                      {ago(row.mite.at, now)}
                      {row.mite.threshold ? ` · ${row.mite.threshold.label}` : ''}
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>검사 기록 없음</Text>
                )}
              </View>
            </View>
          </Card>
        ))}

        {rows && rows.length > 0 && <ReferenceNote kind="mite" />}

        {rows && rows.length > 0 && (
          <View onLayout={(e) => setChartY(e.nativeEvent.layout.y)} style={{ gap: spacing.md, marginTop: spacing.lg }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>봉세 추이</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
              {rows.map((row) => (
                <Chip key={row.colonyId} label={chipLabel(row)} selected={row.colonyId === activeId} onPress={() => setSelectedId(row.colonyId)} />
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {PERIOD_OPTIONS.map((opt) => (
                <Chip key={opt.value} label={opt.label} selected={period === opt.value} onPress={() => setPeriod(opt.value)} />
              ))}
            </View>

            <Card size="large">
              <View style={{ gap: spacing.md }}>
                {activeRow && (
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.textPrimary }}>{activeRow.alias}</Text>
                )}

                {points.length === 0 ? (
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                    이 기간에 봉세를 기록한 내용이 없어요. 내검에서 봉세를 고르면 여기에 쌓여요.
                  </Text>
                ) : (
                  <>
                    <StrengthTrendChart points={points} />
                    <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary }}>
                      {points.length === 1
                        ? '기록이 2번 이상 쌓이면 변화가 선으로 이어져요.'
                        : `${points.length}번 기록 · 처음 ${STRENGTH_LABEL[points[0].rank]} → 최근 ${STRENGTH_LABEL[points[points.length - 1].rank]}`}
                    </Text>
                    <View style={{ gap: 4 }}>
                      {recentPoints.map((p) => (
                        <Text key={p.at} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
                          {new Date(p.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} · {STRENGTH_LABEL[p.rank]}
                        </Text>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </Card>

            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 16 }}>
              봉세를 기록한 날의 값만 그려요 (하루에 여러 번이면 마지막 값). 기록하지 않은 기간은 선으로 이어 보여줄 뿐 그 사이의
              상태를 알려주는 건 아니에요.
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
