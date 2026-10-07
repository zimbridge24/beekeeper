import { Text, View } from 'react-native';

import { ReadinessBand, ReadinessStatus } from '../features/health/winteringReadiness';
import { colors, fontFamilies, fontSizes, spacing, statusColors } from '../theme/tokens';
import { StatusBadge } from './StatusBadge';

export const STATUS_ICON: Record<ReadinessStatus, string> = { good: '✅', warn: '⚠️', bad: '❌', unknown: '➖' };

export const BAND_TONE = { good: 'normal', fair: 'caution', poor: 'danger', insufficient: 'observe' } as const;

export type ReadinessItemView = { key: string; label: string; status: ReadinessStatus; message: string };

// 월동 준비도 한 건의 항목별 판정 목록 — "✅ 봉군 세력 양호 / ⚠️ 응애 검사 45일 경과" 형태.
export function ReadinessItems({ items }: { items: ReadinessItemView[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item) => (
        <View key={item.key} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: fontSizes.bodyLg, lineHeight: 20 }}>{STATUS_ICON[item.status]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{item.label}</Text>
            <Text
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: fontSizes.sm,
                color: item.status === 'bad' ? statusColors.danger.text : colors.textSecondary,
                marginTop: 1,
              }}
            >
              {item.message}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// 부족한 근거와 보완하면 좋은 항목 — 점수만 던지지 않고 "무엇을 해야 하는지"를 같이 보여준다.
export function ReadinessTodos({ items }: { items: (ReadinessItemView & { todo: string })[] }) {
  const open = items.filter((i) => i.status !== 'good');
  if (open.length === 0) return null;
  return (
    <View style={{ backgroundColor: colors.surfaceTint, borderRadius: 12, padding: spacing.md, gap: 6 }}>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>보완하면 좋은 항목</Text>
      {open.map((i) => (
        <Text key={i.key} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 18 }}>
          • {i.todo} — {i.message}
        </Text>
      ))}
    </View>
  );
}

// "월동 준비도 78/100 · 보완 필요". 정보가 모자라면 점수 대신 "정보 부족"을 앞세운다.
// 이 점수는 월동 성공 확률이 아니라 "현재 기록 기준의 준비도"다.
export function ReadinessHeadline({
  score,
  band,
  bandLabel,
  knownCount,
  knownTotal,
}: {
  score: number;
  band: ReadinessBand;
  bandLabel: string;
  knownCount: number;
  knownTotal: number;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>월동 준비도 (현재 기록 기준)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        {band === 'insufficient' ? (
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display3, color: colors.textPrimary }}>점검 항목이 부족해요</Text>
        ) : (
          <>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: 40, lineHeight: 44, color: colors.textPrimary }}>{score}</Text>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xl, color: colors.textMuted, marginBottom: 4 }}>/ 100</Text>
          </>
        )}
        <View style={{ marginBottom: 6 }}>
          <StatusBadge tone={BAND_TONE[band]} label={bandLabel} />
        </View>
      </View>
      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>
        기록된 항목 {knownCount}/{knownTotal}
        {band === 'insufficient' ? ' · 항목을 더 입력하면 점수를 계산해요' : ''}
      </Text>
    </View>
  );
}
