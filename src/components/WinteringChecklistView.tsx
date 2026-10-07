import { Text, View } from 'react-native';

import {
  CHECKLIST_STATUS_LABELS,
  ChecklistItem,
  ChecklistStatus,
  WinteringChecklist,
} from '../features/health/winteringReadiness';
import { colors, fontFamilies, fontSizes, radius, spacing, statusColors } from '../theme/tokens';

const STATUS_ICON: Record<ChecklistStatus, string> = { ok: '✅', improve: '🔶', unknown: '➖' };
const STATUS_TONE = { ok: statusColors.normal, improve: statusColors.caution, unknown: statusColors.observe } as const;

function StatusPill({ status }: { status: ChecklistStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: tone.bg }}>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: tone.text }}>{CHECKLIST_STATUS_LABELS[status]}</Text>
    </View>
  );
}

// "충족 4 · 보완하면 좋음 2 · 정보 없음 1" 한 줄 요약. 점수 대신 이것만 앞세운다.
export function ChecklistSummary({
  checklist,
  showTitle = true,
}: {
  checklist: Pick<WinteringChecklist, 'okCount' | 'improveCount' | 'unknownCount'>;
  showTitle?: boolean;
}) {
  const cells: { status: ChecklistStatus; count: number }[] = [
    { status: 'ok', count: checklist.okCount },
    { status: 'improve', count: checklist.improveCount },
    { status: 'unknown', count: checklist.unknownCount },
  ];
  return (
    <View style={{ gap: spacing.xs }}>
      {showTitle && <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>월동 점검 (현재 기록 기준)</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {cells.map((c) => (
          <View key={c.status} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StatusPill status={c.status} />
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>{c.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// 항목별 "✅ 봉군 세력 · 충족 / 🔶 응애 · 보완하면 좋음 / ➖ 여왕 · 정보 없음" 목록 + 근거 문장.
export function ChecklistItems({ items }: { items: ChecklistItem[] }) {
  return (
    <View style={{ gap: spacing.md }}>
      {items.map((item) => (
        <View key={item.key} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: fontSizes.bodyLg, lineHeight: 22 }}>{STATUS_ICON[item.status]}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{item.label}</Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 18 }}>{item.message}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// 보완하면 좋은 것과 확인이 필요한 항목 — "무엇을 하면 되는지"를 같이 보여준다.
export function ChecklistTodos({ items }: { items: ChecklistItem[] }) {
  const open = items.filter((i) => i.status !== 'ok');
  if (open.length === 0) return null;
  return (
    <View style={{ backgroundColor: colors.surfaceTint, borderRadius: 12, padding: spacing.md, gap: 6 }}>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>확인하면 좋은 항목</Text>
      {open.map((i) => (
        <Text key={i.key} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 18 }}>
          • {i.todo}
        </Text>
      ))}
    </View>
  );
}
