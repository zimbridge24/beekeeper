import { Pressable, Text, TextInput, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '../theme/tokens';

type Props = {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  // AI가 채운 값이면 "AI 추정" 표시를 붙여 사용자가 확인하게 한다.
  aiSuggested?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// 소수 한 자리까지만 — 0.1 + 0.2 같은 부동소수 찌꺼기가 화면에 보이지 않게.
function round1(value: number) {
  return Math.round(value * 10) / 10;
}

// 비어 있는 상태(미입력)가 0과 구분돼야 해서 value는 undefined를 허용한다 —
// 칩 입력(FieldStateSelector)과 같은 원칙: 건드리지 않은 필드는 빈칸으로 둔다.
export function NumberField({ label, value, onChange, unit, min = 0, max = 1000, step = 1, hint, aiSuggested }: Props) {
  const bump = (delta: number) => onChange(clamp(round1((value ?? 0) + delta), min, max));

  const handleText = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    if (cleaned === '') return onChange(undefined);
    const parsed = Number(cleaned);
    if (Number.isNaN(parsed)) return;
    onChange(clamp(parsed, min, max));
  };

  const stepButton = (symbol: string, delta: number) => (
    <Pressable
      onPress={() => bump(delta)}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surfaceTint,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xl, color: colors.primary, lineHeight: 22 }}>{symbol}</Text>
    </Pressable>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{label}</Text>
        {aiSuggested && (
          <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: '#E3EDF3' }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: '#3B6E90' }}>AI 추정</Text>
          </View>
        )}
      </View>
      {hint && (
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 }}>{hint}</Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs }}>
        {stepButton('−', -step)}
        <View
          style={[
            {
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
              borderRadius: radius.cardMedium,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.xl,
              gap: 4,
            },
            shadows.cardSmall,
          ]}
        >
          <TextInput
            value={value === undefined ? '' : String(value)}
            onChangeText={handleText}
            placeholder="미입력"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={{
              minWidth: 56,
              textAlign: 'center',
              fontFamily: fontFamilies.bold,
              fontSize: fontSizes.lg,
              color: colors.textPrimary,
              padding: 0,
            }}
          />
          {unit && value !== undefined && (
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.body, color: colors.textSecondary }}>{unit}</Text>
          )}
        </View>
        {stepButton('+', step)}
      </View>
    </View>
  );
}
