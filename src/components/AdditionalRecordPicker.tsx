import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { RecordType } from '../db/schema';
import { DETAIL_RECORD_TYPES } from '../features/records/recordTypesConfig';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing, statusColors } from '../theme/tokens';
import { Card } from './Card';

const HIGHLIGHT_TONE: Partial<Record<RecordType, string>> = {
  mite: statusColors.danger.bg,
  hornet: statusColors.caution.bg,
  wintering_prep: statusColors.observe.bg,
};

// 빠른 내검 아래의 "추가 기록". 빠른 기록 화면은 4가지만 두고, 응애·말벌·월동 준비처럼
// 핵심 영역은 눈에 띄는 큰 타일로, 나머지는 작은 버튼으로 둔다 — 필요한 영역만 열어서
// 쓰므로 현장 기록이 느려지지 않는다.
export function AdditionalRecordPicker({ visitId, colonyId }: { visitId: string; colonyId: string }) {
  const open = (recordType: RecordType) =>
    router.push({ pathname: '/visits/[visitId]/[colonyId]/record-form/[recordType]', params: { visitId, colonyId, recordType } });

  const highlighted = DETAIL_RECORD_TYPES.filter((t) => t.highlight);
  const others = DETAIL_RECORD_TYPES.filter((t) => !t.highlight);

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>추가 기록</Text>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {highlighted.map((t) => (
          <Pressable key={t.recordType} style={{ flex: 1 }} onPress={() => open(t.recordType)}>
            <Card size="large" tint={HIGHLIGHT_TONE[t.recordType]} style={{ alignItems: 'center', gap: 4, paddingHorizontal: spacing.xs }}>
              <Text style={{ fontSize: 28 }}>{t.emoji}</Text>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{t.title}</Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {others.map((t) => (
          <Pressable
            key={t.recordType}
            onPress={() => open(t.recordType)}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.85 : 1,
              },
              shadows.cardSmall,
            ]}
          >
            <Text style={{ fontSize: fontSizes.body }}>{t.emoji}</Text>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{t.title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
