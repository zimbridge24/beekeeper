import { View, Text } from 'react-native';

import { fontFamilies, fontSizes, radius, statusColors, StatusTone } from '../theme/tokens';

export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const c = statusColors[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 3,
        paddingHorizontal: 9,
        borderRadius: radius.pill,
        backgroundColor: c.bg,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.text }} />
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: c.text }}>{label}</Text>
    </View>
  );
}
