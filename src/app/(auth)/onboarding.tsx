import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { colors, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

const STEPS = [
  { title: '음성으로 빠르게 기록하세요', desc: '장갑을 낀 채로도 말만 하면\n관찰·문제·조치가 정리돼요' },
  { title: '봉군별로 이력이 쌓여요', desc: '모든 기록이 벌통과 연결되어\n변화와 패턴을 한눈에 볼 수 있어요' },
  { title: '오프라인에서도 안전하게', desc: '네트워크가 없어도 기록은 저장되고\n연결되면 자동으로 동기화돼요' },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const goNext = () => {
    if (isLast) router.replace('/(auth)/login');
    else setStep((s) => s + 1);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.xl }}>
        <Pressable onPress={() => router.replace('/(auth)/login')}>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>
            건너뛰기
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxl, paddingHorizontal: spacing.xxxl }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surfaceTint }} />
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display2, color: colors.textPrimary, textAlign: 'center' }}>
          {STEPS[step].title}
        </Text>
        <Text
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: fontSizes.body,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 22,
          }}
        >
          {STEPS[step].desc}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: spacing.xxl }}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === step ? 20 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === step ? colors.primary : colors.border,
            }}
          />
        ))}
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }}>
        <Button label={isLast ? '시작하기' : '다음'} onPress={goNext} />
      </View>
    </SafeAreaView>
  );
}
