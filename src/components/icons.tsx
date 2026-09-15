import { View } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';

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

export function HomeTabIcon({ color = colors.textMuted, size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3L2 12H5V20H10V14H14V20H19V12H22L12 3Z" fill={color} />
    </Svg>
  );
}

// Three touching pointy-top hexagons (honeycomb cluster) — one plain
// polygon per cell rather than one combined path, since that's far easier
// to get the shared edges to line up exactly right.
export function HoneycombTabIcon({ color = colors.textMuted, size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="8.1,4.1 12,6.35 12,10.85 8.1,13.1 4.2,10.85 4.2,6.35" fill={color} />
      <Polygon points="15.9,4.1 19.8,6.35 19.8,10.85 15.9,13.1 12,10.85 12,6.35" fill={color} />
      <Polygon points="12,10.85 15.9,13.1 15.9,17.6 12,19.85 8.1,17.6 8.1,13.1" fill={color} />
    </Svg>
  );
}
