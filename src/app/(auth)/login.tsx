import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Text, useWindowDimensions, View } from 'react-native';

import { sendPhoneOtp, verifyPhoneOtp } from '../../auth/phoneAuth';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../../theme/tokens';

type Mode = 'phone_enter' | 'phone_otp';

// Actual pixel size of assets/beehero-banner.jpg — used to size it to the
// screen width at its native aspect ratio (a literal width/height, not
// `width:'100%' + aspectRatio`, which renders at the wrong scale in a flex
// column — see SplashView.tsx for the same fix).
const BANNER_ASPECT_RATIO = 1794 / 877;

function ErrorText({ children }: { children: string }) {
  return <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: '#C1443A' }}>{children}</Text>;
}

export default function LoginScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const bannerWidth = screenWidth - spacing.xl * 2;
  const bannerHeight = bannerWidth / BANNER_ASPECT_RATIO;

  const [mode, setMode] = useState<Mode>('phone_enter');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // Supabase's raw auth error messages are English and easy to miss inside
  // the small ErrorText — translate the ones users actually hit here.
  const describeAuthError = (err: unknown): string => {
    const message = err instanceof Error ? err.message : String(err);
    if (/expired or is invalid/i.test(message)) {
      return '인증번호가 만료되었거나 올바르지 않아요. "번호 다시 입력"을 눌러 인증번호를 새로 받아주세요.';
    }
    if (/security purposes/i.test(message) || /rate limit/i.test(message)) {
      return '인증번호를 너무 자주 요청했어요. 잠시 후 다시 시도해주세요.';
    }
    return message;
  };

  const withLoading = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = () => withLoading(async () => {
    await sendPhoneOtp(phone);
    setMode('phone_otp');
  });

  const handleVerifyOtp = () => withLoading(async () => {
    try {
      await verifyPhoneOtp(phone, otp);
    } catch (err) {
      // Clear the stale code so a failed attempt can't be blindly
      // resubmitted unchanged — each failed/re-sent OTP invalidates the
      // previous one, so re-tapping "확인" with the same digits always
      // fails again with the same confusing error.
      setOtp('');
      throw err;
    }
    // Stack.Protected re-guards reactively, but don't rely on that alone —
    // send the user to "/" explicitly so index.tsx's routing runs right
    // away instead of leaving them stranded on this screen.
    router.replace('/');
  });

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: spacing.xxxl }}>
        <Image source={require('../../../assets/beehero-face.png')} style={{ width: 56, height: 56 }} resizeMode="contain" />
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display4, color: colors.textPrimary, marginTop: spacing.xxl }}>
          로그인하고 시작하기
        </Text>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
          봉군 기록을 안전하게 보관해요
        </Text>
      </View>

      <View style={{ gap: spacing.md, marginTop: spacing.xxl }}>
        {mode === 'phone_enter' && (
          <View style={{ gap: spacing.lg }}>
            <TextField
              label="휴대폰 번호"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="010-1234-5678"
            />
            {error && <ErrorText>{error}</ErrorText>}
            <Button
              label="인증번호 받기"
              onPress={handleSendOtp}
              loading={loading}
              disabled={phone.replace(/\D/g, '').length < 10}
            />
          </View>
        )}

        {mode === 'phone_otp' && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              {phone}로 보낸 인증번호 6자리를 입력해주세요
            </Text>
            <TextField
              label="인증번호"
              value={otp}
              onChangeText={setOtp}
              onChange={(e) => setOtp(e.nativeEvent.text)}
              keyboardType="number-pad"
              placeholder="123456"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
            />
            {error && <ErrorText>{error}</ErrorText>}
            <Button label="확인" onPress={handleVerifyOtp} loading={loading} disabled={otp.trim().length === 0} />
            <Button
              label="번호 다시 입력"
              variant="ghost"
              onPress={() => {
                setMode('phone_enter');
                setOtp('');
                setError(null);
              }}
            />
          </View>
        )}
      </View>

      <Text
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: fontSizes.xs,
          color: colors.textMuted,
          textAlign: 'center',
          marginTop: spacing.xxl,
        }}
      >
        계속하면 이용약관 및 개인정보 처리방침에 동의합니다
      </Text>

      <Image
        source={require('../../../assets/beehero-banner.jpg')}
        style={{ width: bannerWidth, height: bannerHeight, borderRadius: radius.cardLarge, marginTop: spacing.xxl }}
        resizeMode="cover"
      />
    </Screen>
  );
}
