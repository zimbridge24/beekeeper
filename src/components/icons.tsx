import { View } from 'react-native';

import { colors } from '../theme/tokens';

// The design mockups use simple geometric shapes rather than an icon font —
// these components reproduce those shapes so the UI stays faithful to the
// Claude Design canvas without pulling in an icon library.

export function BackChevronIcon({ color = colors.textPrimary }: { color?: string }) {
  return (
    <View
      style={{
        width: 9,
        height: 9,
        borderLeftWidth: 2,
        borderBottomWidth: 2,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
      }}
    />
  );
}

export function ForwardChevronIcon({ color = colors.textMuted }: { color?: string }) {
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRightWidth: 2,
        borderTopWidth: 2,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
      }}
    />
  );
}

export function HamburgerIcon({ color = colors.textSecondary }: { color?: string }) {
  return (
    <View style={{ gap: 3 }}>
      <View style={{ width: 14, height: 2, backgroundColor: color }} />
      <View style={{ width: 14, height: 2, backgroundColor: color }} />
      <View style={{ width: 14, height: 2, backgroundColor: color }} />
    </View>
  );
}

export function MicIcon({ color = colors.surface, size = 26 }: { color?: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.5,
        borderBottomLeftRadius: size * 0.15,
        borderBottomRightRadius: size * 0.15,
        backgroundColor: color,
      }}
    />
  );
}

export function CheckIcon({ color = colors.surface, size = 26 }: { color?: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size * 0.55,
        borderLeftWidth: 4,
        borderBottomWidth: 4,
        borderColor: color,
        transform: [{ rotate: '-45deg' }, { translateY: -size * 0.1 }],
      }}
    />
  );
}
