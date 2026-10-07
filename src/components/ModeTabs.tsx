import { Pressable, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '../theme/tokens';

export type InputMode = 'photo' | 'manual';

const TABS: { key: InputMode; label: string }[] = [
  { key: 'photo', label: '📷 사진으로' },
  { key: 'manual', label: '✍️ 직접 입력' },
];

// 같은 기록을 "사진으로 AI에게 맡기기"와 "직접 입력하기" 두 방법으로 쓸 수 있을 때, 두 방법이
// 한 화면에 섞여 보이지 않게 가르는 탭. 어느 탭에서 입력하든 같은 기록·같은 필드에 저장된다.
export function ModeTabs({ value, onChange, photoLabel }: { value: InputMode; onChange: (mode: InputMode) => void; photoLabel?: string }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.backgroundAlt, borderRadius: radius.pill, padding: 4, gap: 4 }}>
      {TABS.map((tab) => {
        const selected = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[
              {
                flex: 1,
                alignItems: 'center',
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.surface : 'transparent',
              },
              selected && shadows.cardSmall,
            ]}
          >
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: selected ? colors.primary : colors.textMuted }}>
              {tab.key === 'photo' && photoLabel ? photoLabel : tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
