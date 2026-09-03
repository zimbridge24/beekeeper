import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radius, shadows } from '../theme/tokens';

type Variant = 'primary' | 'accent' | 'surface' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

const VARIANT_STYLES: Record<Variant, { bg: string; fg: string; height: number; shadow?: object }> = {
  primary: { bg: colors.primary, fg: colors.surface, height: 56 },
  accent: { bg: colors.accent, fg: colors.surface, height: 56 },
  surface: { bg: colors.surface, fg: colors.textPrimary, height: 52, shadow: shadows.cardSmall },
  ghost: { bg: 'transparent', fg: colors.textSecondary, height: 44 },
};

export function Button({ label, onPress, variant = 'primary', disabled, loading, icon }: Props) {
  const v = VARIANT_STYLES[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        v.shadow,
        {
          backgroundColor: v.bg,
          height: v.height,
          borderRadius: radius.pill,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: variant === 'ghost' ? fontSizes.body : fontSizes.lg,
              color: v.fg,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
