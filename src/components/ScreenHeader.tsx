import { Pressable, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { BackChevronIcon } from './icons';

type Props = {
  title: string;
  onBack?: () => void;
  subdued?: boolean;
};

export function ScreenHeader({ title, onBack, subdued }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
      {onBack && (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <BackChevronIcon />
        </Pressable>
      )}
      <Text
        style={{
          fontFamily: subdued ? fontFamilies.semibold : fontFamilies.bold,
          fontSize: subdued ? fontSizes.bodyLg : fontSizes.xl,
          color: subdued ? colors.textSecondary : colors.textPrimary,
        }}
      >
        {title}
      </Text>
    </View>
  );
}
