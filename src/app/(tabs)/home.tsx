import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { getLocalUser } from '../../auth/session';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { HamburgerIcon } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { useApiaries } from '../../repositories/apiaryRepository';
import { useColonyCount, useRecentColoniesWithApiary } from '../../repositories/colonyRepository';
import { ensureActiveVisit } from '../../repositories/visitRepository';
import { useSyncSummary } from '../../sync/useSyncSummary';
import { colors, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

export default function HomeScreen() {
  const { userId } = useAuth();
  const [email, setEmail] = useState<string | null>(null);
  const { data: apiaries } = useApiaries();
  const { data: recentColonies } = useRecentColoniesWithApiary(5);
  const { data: colonyCountRows } = useColonyCount();
  const { pendingCount, conflictCount } = useSyncSummary();
  const [startingVisit, setStartingVisit] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getLocalUser().then((user) => setEmail(user?.email ?? null));
  }, [userId]);

  const displayName = email ? email.split('@')[0] : '양봉가';
  const totalColonies = colonyCountRows?.[0]?.value;

  const handleStartVisit = async () => {
    if (!apiaries || apiaries.length === 0) return;
    if (apiaries.length > 1) {
      router.push('/apiaries');
      return;
    }
    setStartingVisit(true);
    try {
      const visitId = await ensureActiveVisit(apiaries[0].id);
      router.push({ pathname: '/visits/[visitId]/progress', params: { visitId } });
    } finally {
      setStartingVisit(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.push('/apiaries')}>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
            {apiaries?.[0]?.name ?? '내 양봉장'} {apiaries && apiaries.length > 1 ? `외 ${apiaries.length - 1}곳` : ''} ›
          </Text>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display4, color: colors.textPrimary, marginTop: 2 }}>
            안녕하세요, {displayName}님
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => router.push('/sync/status')}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HamburgerIcon />
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/settings')}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTint }} />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Card size="large" style={{ flex: 1 }}>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>전체 봉군</Text>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display3, color: colors.textPrimary, marginTop: 2 }}>
            {totalColonies === undefined ? '–' : `${totalColonies}개`}
          </Text>
        </Card>
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/sync/status')}>
          <Card size="large" tint="#FBEED9" style={{ flex: 1 }}>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: '#8A5A0F' }}>동기화 대기</Text>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display3, color: '#8A5A0F', marginTop: 2 }}>
              {pendingCount + conflictCount}개
            </Text>
          </Card>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
          최근 등록된 봉군
        </Text>
        <Pressable onPress={() => router.push('/(tabs)/colonies')}>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.primary }}>전체보기</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.md }}>
        {recentColonies?.length === 0 && (
          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              아직 등록된 봉군이 없어요. 양봉장에서 봉군을 추가해보세요.
            </Text>
          </Card>
        )}
        {recentColonies?.map(({ colony, apiaryName }) => (
          <Card key={colony.id} onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId: colony.id } })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>{colony.alias}</Text>
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
                  {apiaryName ?? ''} · {colony.species === 'western' ? '서양벌' : '토종벌'}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </View>

      {totalColonies !== undefined && totalColonies > 0 && (
        <Button label="오늘 내검 시작하기" onPress={handleStartVisit} loading={startingVisit} />
      )}
      <Button label="양봉장·봉군 관리" variant="surface" onPress={() => router.push('/apiaries')} />
    </Screen>
  );
}
