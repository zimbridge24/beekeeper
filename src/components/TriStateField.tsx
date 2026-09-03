import { Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { Chip } from './Chip';

export type TriState = 'present' | 'absent' | 'unknown';

type Props = {
  label: string;
  value: TriState | undefined;
  onChange: (value: TriState) => void;
};

// Deliberately has no default selection — an untouched field stays
// visually blank (미입력) rather than looking like any of the three real
// answers, so 없음/확인하지 않음/미입력 never get confused with each other.
export function TriStateField({ label, value, onChange }: Props) {
  return (
    <View>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
        <Chip label="있음" selected={value === 'present'} onPress={() => onChange('present')} flex />
        <Chip label="없음" selected={value === 'absent'} onPress={() => onChange('absent')} flex />
        <Chip label="확인 안 함" selected={value === 'unknown'} onPress={() => onChange('unknown')} flex />
      </View>
    </View>
  );
}
