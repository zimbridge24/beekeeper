import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { useAuth } from '../../../auth/AuthProvider';
import { getLocalUser } from '../../../auth/session';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

export default function SettingsScreen() {
  const { signOut, userId } = useAuth();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getLocalUser().then((user) => setEmail(user?.email ?? null));
  }, [userId]);

  const handleSignOut = () => {
    Alert.alert('로그아웃', '로그아웃하시겠어요? 기기에 저장된 데이터는 삭제되고, 다시 로그인하면 서버와 동기화됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader title="설정" />
      <Card size="large">
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>계정</Text>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary, marginTop: 4 }}>
          {email ?? '—'}
        </Text>
      </Card>

      <View style={{ gap: spacing.md }}>
        <Button label="로그아웃" variant="surface" onPress={handleSignOut} loading={signingOut} />
      </View>
    </Screen>
  );
}
