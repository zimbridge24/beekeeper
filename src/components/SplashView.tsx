import { Pressable, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes } from '../theme/tokens';

export function SplashView({ onStart }: { onStart: () => void }) {
  return (
    <Pressable
      onPress={onStart}
      style={{
        flex: 1,
        backgroundColor: colors.primaryDark,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <View
        style={{
          width: 76,
          height: 76,
          backgroundColor: colors.accent,
          borderRadius: 20,
        }}
      />
      <Text style={{ fontSize: fontSizes.display3, fontFamily: fontFamilies.bold, color: '#FFFFFF' }}>비히어로</Text>
      <Text style={{ fontSize: fontSizes.bodySm, fontFamily: fontFamilies.semibold, color: '#9CA396' }}>
        한국 양봉가를 위한 AI 양봉일지
      </Text>
      <Text style={{ marginTop: 24, fontSize: fontSizes.bodySm, fontFamily: fontFamilies.bold, color: colors.accent }}>
        탭하여 시작하기
      </Text>
    </Pressable>
  );
}
