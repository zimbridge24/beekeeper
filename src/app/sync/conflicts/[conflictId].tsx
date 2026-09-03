import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { resolveConflict, useConflict } from '../../../sync/conflicts';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

const FIELD_LABELS: Record<string, string> = {
  name: '이름',
  alias: '이름/번호',
  address: '주소',
  species: '벌 종류',
  memo: '메모',
  is_archived: '보관 여부',
};

const IGNORED_FIELDS = new Set(['id', 'user_id', 'created_at', 'updated_at', 'apiary_id']);

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '(없음)';
  if (key === 'is_archived') return value ? '보관됨' : '보관 안 됨';
  if (key === 'species') return value === 'western' ? '서양벌' : '토종벌';
  return String(value);
}

export default function ConflictDetailScreen() {
  const { conflictId } = useLocalSearchParams<{ conflictId: string }>();
  const { data: conflictRows } = useConflict(conflictId);
  const conflict = conflictRows?.[0];
  const [resolving, setResolving] = useState(false);

  if (!conflict) {
    return (
      <Screen scroll={false} padded={false}>
        <ScreenHeader title="충돌 해결" onBack={() => router.back()} />
      </Screen>
    );
  }

  const local = JSON.parse(conflict.localPayloadJson) as Record<string, unknown>;
  const remote = JSON.parse(conflict.remotePayloadJson) as Record<string, unknown>;
  const diffKeys = Object.keys(local).filter((key) => !IGNORED_FIELDS.has(key) && JSON.stringify(local[key]) !== JSON.stringify(remote[key]));

  const handleResolve = async (resolution: 'kept_local' | 'kept_remote') => {
    setResolving(true);
    try {
      await resolveConflict(conflict.id, resolution);
      router.back();
    } finally {
      setResolving(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="충돌 해결" onBack={() => router.back()} />
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }}>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
          이 기기와 서버에서 서로 다른 값으로 수정되었어요. 어느 쪽을 유지할지 선택해주세요.
        </Text>

        {diffKeys.map((key) => (
          <Card key={key} size="large">
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>
              {FIELD_LABELS[key] ?? key}
            </Text>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.body, color: colors.textPrimary }}>
                내 기기: {formatValue(key, local[key])}
              </Text>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.body, color: colors.textSecondary }}>
                서버: {formatValue(key, remote[key])}
              </Text>
            </View>
          </Card>
        ))}
      </View>

      <View style={{ padding: spacing.xl, gap: spacing.sm }}>
        <Button label="내 기기 값 사용" onPress={() => handleResolve('kept_local')} loading={resolving} />
        <Button label="서버 값 사용" variant="surface" onPress={() => handleResolve('kept_remote')} loading={resolving} />
      </View>
    </Screen>
  );
}
