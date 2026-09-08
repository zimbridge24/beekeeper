import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { useAuth } from '../../../auth/AuthProvider';
import { fromE164Korea } from '../../../auth/phoneAuth';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { supabase } from '../../../supabase/client';
import { colors, fontFamilies, fontSizes } from '../../../theme/tokens';

export default function AccountScreen() {
  const { signOut, deleteAccount } = useAuth();
  const [phone, setPhone] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const rawPhone = data.session?.user.phone;
      setPhone(rawPhone ? fromE164Korea(rawPhone) : null);
    });
  }, []);

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

  const confirmDeleteFinal = () => {
    Alert.alert(
      '정말 삭제할까요?',
      '이 작업은 되돌릴 수 없습니다. 지금 바로 계정과 모든 데이터가 영구적으로 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '영구 삭제',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
            } catch (err) {
              Alert.alert('삭제 실패', err instanceof Error ? err.message : String(err));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '계정 삭제',
      '계정을 삭제하면 양봉장, 봉군, 내검 기록, 사진 등 저장된 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '계속', style: 'destructive', onPress: confirmDeleteFinal },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader title="계정" onBack={() => router.back()} />
      <Card size="large">
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>휴대폰 번호</Text>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary, marginTop: 4 }}>
          {phone ?? '—'}
        </Text>
      </Card>

      <Button label="로그아웃" variant="surface" onPress={handleSignOut} loading={signingOut} />
      <Button label="계정 삭제" variant="ghost" onPress={handleDeleteAccount} loading={deleting} />
    </Screen>
  );
}
