import { useState } from 'react';
import { Text, View } from 'react-native';

import { signInWithEmail, signUpWithEmail } from '../../auth/emailAuth';
import { sendPhoneOtp, verifyPhoneOtp } from '../../auth/phoneAuth';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { colors, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

type Mode = 'choose' | 'phone_enter' | 'phone_otp' | 'email';

function ErrorText({ children }: { children: string }) {
  return <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: '#C1443A' }}>{children}</Text>;
}

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const withLoading = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = () => withLoading(async () => {
    await sendPhoneOtp(phone);
    setMode('phone_otp');
  });

  const handleVerifyOtp = () => withLoading(async () => {
    await verifyPhoneOtp(phone, otp);
  });

  const handleEmailSubmit = () => withLoading(async () => {
    if (emailMode === 'signin') {
      await signInWithEmail(email.trim(), password);
    } else {
      await signUpWithEmail(email.trim(), password);
    }
  });

  const backToChoose = () => {
    setMode('choose');
    setError(null);
  };

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: spacing.xxxl }}>
        <View style={{ width: 56, height: 56, backgroundColor: colors.accent, borderRadius: 16 }} />
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display4, color: colors.textPrimary, marginTop: spacing.xxl }}>
          로그인하고 시작하기
        </Text>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
          봉군 기록을 안전하게 보관해요
        </Text>
      </View>

      <View style={{ gap: spacing.md, marginTop: spacing.xxl }}>
        {mode === 'choose' && (
          <>
            <Button label="휴대폰 번호로 계속하기" onPress={() => setMode('phone_enter')} />
            <Button label="이메일로 계속하기" variant="surface" onPress={() => setMode('email')} />
          </>
        )}

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
            <Button label="뒤로" variant="ghost" onPress={backToChoose} />
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

        {mode === 'email' && (
          <View style={{ gap: spacing.lg }}>
            <TextField
              label="이메일"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <TextField label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry placeholder="6자 이상" />
            {error && <ErrorText>{error}</ErrorText>}
            <Button
              label={emailMode === 'signin' ? '로그인' : '회원가입'}
              onPress={handleEmailSubmit}
              loading={loading}
              disabled={!email || !password}
            />
            <Button
              label={emailMode === 'signin' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
              variant="ghost"
              onPress={() => setEmailMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
            />
            <Button label="뒤로" variant="ghost" onPress={backToChoose} />
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
    </Screen>
  );
}
