import { ReactNode } from 'react';
import { Pressable, View, ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '../theme/tokens';

type Size = 'large' | 'medium';

type Props = {
  children: ReactNode;
  size?: Size;
  onPress?: () => void;
  style?: ViewStyle;
  tint?: string;
};

export function Card({ children, size = 'large', onPress, style, tint }: Props) {
  const content = (
    <View
      style={[
        {
          backgroundColor: tint ?? colors.surface,
          borderRadius: size === 'large' ? radius.cardLarge : radius.cardMedium,
          padding: size === 'large' ? spacing.lg : spacing.md,
          ...(tint ? {} : size === 'large' ? shadows.cardLarge : shadows.cardSmall),
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {content}
    </Pressable>
  );
}
