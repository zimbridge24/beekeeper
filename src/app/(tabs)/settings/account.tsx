import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { useAuth } from '../../../auth/AuthProvider';
import { fromE164Korea } from '../../../auth/phoneAuth';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { runSync } from '../../../sync/runSync';
import { describeUnsynced, getUnsyncedSummary, UnsyncedSummary } from '../../../sync/unsynced';
import { supabase } from '../../../supabase/client';
import { colors, fontFamilies, fontSizes } from '../../../theme/tokens';

const SYNC_BEFORE_SIGNOUT_TIMEOUT_MS = 15_000;

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

  const performSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      // Stack.Protected re-guards on state change, but don't rely on
      // that alone to fire promptly from deep inside nested (tabs)
      // navigators — send the user back to "/" explicitly so
      // index.tsx's own routing logic re-runs immediately.
      router.replace('/');
    } catch (err) {
      Alert.alert('로그아웃 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setSigningOut(false);
    }
  };

  // 로그아웃은 이 기기의 로컬 DB를 통째로 비운다. 아직 서버에 못 올라간 기록이 있으면 그대로
  // 사라지므로, 먼저 올려 보고 그래도 남으면 얼마나 잃는지 알려준 뒤 다시 확인받는다.
  const handleSignOut = async () => {
    setSigningOut(true);
    let unsynced: UnsyncedSummary | null = null;
    try {
      unsynced = await getUnsyncedSummary();
      if (unsynced.needsSync) {
        // 신호가 약하면 요청이 오래 걸릴 수 있어서 기다리는 시간에 상한을 둔다.
        await Promise.race([runSync().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, SYNC_BEFORE_SIGNOUT_TIMEOUT_MS))]);
        unsynced = await getUnsyncedSummary();
      }
    } catch (err) {
      // 대기열을 못 읽어도 로그아웃 자체는 막지 않는다 — 기본 확인창으로 진행.
      console.warn('[account] 로그아웃 전 대기열 확인 실패', err);
      unsynced = null;
    } finally {
      setSigningOut(false);
    }

    if (!unsynced || !unsynced.hasAny) {
      Alert.alert('로그아웃', '로그아웃하시겠어요? 기기에 저장된 데이터는 삭제되고, 다시 로그인하면 서버와 동기화됩니다.', [
        { text: '취소', style: 'cancel' },
        { text: '로그아웃', style: 'destructive', onPress: () => void performSignOut() },
      ]);
      return;
    }

    Alert.alert(
      '아직 저장이 끝나지 않은 기록이 있어요',
      `${describeUnsynced(unsynced)}이(가) 이 기기에만 있어요. 지금 로그아웃하면 사라지고 되돌릴 수 없어요.\n\n${
        unsynced.voiceCaptures > 0
          ? '음성 녹음은 홈에서 검토하고 저장한 뒤, 인터넷에 연결된 곳에서 잠시 기다렸다가 다시 시도하는 걸 권해요.'
          : '인터넷에 연결된 곳에서 잠시 기다린 뒤 다시 시도하는 걸 권해요.'
      }`,
      [
        { text: '취소', style: 'cancel' },
        { text: '그래도 로그아웃', style: 'destructive', onPress: () => void performSignOut() },
      ],
    );
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
              router.replace('/');
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
