import { Text, View } from 'react-native';

import { FIELD_KIND_OPTIONS, FieldKind } from '../features/records/recordTypesConfig';
import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { Chip } from './Chip';

type Props = {
  label: string;
  kind: FieldKind;
  value: string | undefined;
  onChange: (value: string) => void;
};

// Deliberately has no default selection — an untouched field stays visually
// blank (미입력) rather than looking like any of the kind's real answers, so
// "확인했는데 없음" and "확인 안 함"/미입력 never get confused with each
// other. Which chips render depends on the field's kind (검사형 vs 관찰형 vs
// 행동형 vs 말벌 세부 항목 — see FIELD_KIND_OPTIONS), not a single fixed
// 있음/없음/확인 안 함 set.
export function FieldStateSelector({ label, kind, value, onChange }: Props) {
  const options = FIELD_KIND_OPTIONS[kind];
  return (
    <View>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
        {options.map((opt) => (
          <Chip key={opt.value} label={opt.label} selected={value === opt.value} onPress={() => onChange(opt.value)} />
        ))}
      </View>
    </View>
  );
}
