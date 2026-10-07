import { Pressable, Text, View } from 'react-native';

import { Insight, insightHeadline } from '../features/health/colonyInsights';
import { openRecordForm } from '../features/records/openRecordForm';
import { colors, fontFamilies, fontSizes, radius, spacing, statusColors } from '../theme/tokens';
import { Card } from './Card';

const SEVERITY_TONE = { danger: statusColors.danger, caution: statusColors.caution, info: statusColors.observe } as const;

export function InsightCard({ insight, showColonyName = true }: { insight: Insight; showColonyName?: boolean }) {
  const tone = SEVERITY_TONE[insight.severity];
  return (
    <Card size="medium" tint={tone.bg}>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary, lineHeight: 20 }}>
          {showColonyName ? insightHeadline(insight) : insight.message}
        </Text>
        <Pressable
          onPress={() =>
            openRecordForm({ apiaryId: insight.apiaryId, colonyId: insight.action.colonyId, recordType: insight.action.recordType })
          }
          hitSlop={8}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: tone.text }}>{insight.actionLabel} ›</Text>
        </Pressable>
      </View>
    </Card>
  );
}
