import { Pressable, Text } from 'react-native';

import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '../theme/tokens';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  flex?: boolean;
};

export function Chip({ label, selected, onPress, flex }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: flex ? 1 : undefined,
          alignItems: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.primary : colors.surface,
          opacity: pressed ? 0.85 : 1,
        },
        !selected && shadows.cardSmall,
      ]}
    >
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: fontSizes.bodySm,
          color: selected ? colors.surface : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
