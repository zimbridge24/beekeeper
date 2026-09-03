import { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/tokens';

type Props = {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  dark?: boolean;
};

export function Screen({ children, footer, scroll = true, padded = true, dark = false }: Props) {
  const bg = dark ? colors.primaryDark : colors.background;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: padded ? spacing.xl : 0,
            paddingTop: spacing.md,
            paddingBottom: spacing.xxxl,
            gap: spacing.xl,
          }}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: padded ? spacing.xl : 0 }}>{children}</View>
      )}
      {footer && (
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, backgroundColor: bg }}>
          {footer}
        </View>
      )}
    </SafeAreaView>
  );
}
