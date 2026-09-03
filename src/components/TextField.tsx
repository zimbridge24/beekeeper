import { Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '../theme/tokens';

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, style, ...inputProps }: Props) {
  return (
    <View>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>{label}</Text>
      <View
        style={[
          {
            marginTop: spacing.xs,
            backgroundColor: colors.surface,
            borderRadius: radius.cardMedium,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
          },
          shadows.cardSmall,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary, padding: 0 }, style]}
          {...inputProps}
        />
      </View>
      {error && (
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: '#C1443A', marginTop: 4 }}>
          {error}
        </Text>
      )}
    </View>
  );
}
