import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamilies, fontSizes, radius, spacing } from '../theme/tokens';

// The source art is 1024x1536 (2:3). `width:'100%' + aspectRatio` rendered
// it at a wildly oversized scale (a Yoga/RN quirk with that combo inside a
// flex column), so the width is computed explicitly from the actual screen
// width instead and applied as a literal pixel height.
const IMAGE_ASPECT_RATIO = 1024 / 1536;

export function SplashView({ onStart }: { onStart: () => void }) {
  const { width: screenWidth } = useWindowDimensions();
  const imageHeight = screenWidth / IMAGE_ASPECT_RATIO;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Image
          source={require('../../assets/beehero-splash-bg.jpg')}
          style={{ width: screenWidth, height: imageHeight, borderRadius: radius.cardLarge }}
          resizeMode="cover"
        />
      </View>
      <SafeAreaView edges={['bottom']}>
        <Pressable
          onPress={onStart}
          style={({ pressed }) => ({
            marginHorizontal: spacing.xxxl,
            marginTop: spacing.xl,
            marginBottom: spacing.xxxl * 2,
            height: 56,
            borderRadius: radius.pill,
            backgroundColor: '#FBC94D',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.lg, color: colors.textPrimary }}>
            시작하기 →
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
