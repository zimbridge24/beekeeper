import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ForwardChevronIcon } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { runSync } from '../../sync/runSync';
import { useSyncSummary } from '../../sync/useSyncSummary';
import { colors, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

function formatTime(ms: number | null): string {
  if (!ms) return '아직 동기화 안 됨';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return new Date(ms).toLocaleDateString('ko-KR');
}

export default function SyncStatusScreen() {
  const { pendingCount, conflictCount, lastSyncedAt } = useSyncSummary();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await runSync();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setSyncing(false);
    }
  };

  const allSynced = pendingCount === 0 && conflictCount === 0;

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="동기화 상태" onBack={() => router.back()} />
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }}>
        <Card size="large" tint={allSynced ? '#E1F1E8' : '#E3EDF3'}>
          <Text
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: fontSizes.bodySm,
              color: allSynced ? '#2C7A57' : '#3B6E90',
            }}
          >
            {allSynced ? '모든 기록이 동기화되었어요' : `${pendingCount}건 동기화 대기 중`}
          </Text>
        </Card>

        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>
          마지막 동기화: {formatTime(lastSyncedAt)}
        </Text>

        {syncError && (
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: '#C1443A' }}>{syncError}</Text>
        )}

        {conflictCount > 0 && (
          <Card size="large" tint="#FBEED9" onPress={() => router.push('/sync/conflicts')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: '#8A5A0F' }}>
                충돌 {conflictCount}건 해결 필요
              </Text>
              <ForwardChevronIcon color="#8A5A0F" />
            </View>
          </Card>
        )}
      </View>

      <View style={{ padding: spacing.xl }}>
        <Button label="지금 동기화" onPress={handleSync} loading={syncing} />
      </View>
    </Screen>
  );
}
