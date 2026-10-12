import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useOpenConflicts } from '../../../sync/conflicts';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

const TABLE_LABELS: Record<string, string> = {
  apiaries: '양봉장',
  colonies: '봉군',
};

export default function ConflictsListScreen() {
  const { data: conflicts } = useOpenConflicts();

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="겹친 수정 확인" onBack={() => router.back()} />
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }}>
        {conflicts?.length === 0 && (
          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              확인할 항목이 없어요.
            </Text>
          </Card>
        )}
        {conflicts?.map((conflict) => {
          const local = JSON.parse(conflict.localPayloadJson);
          const label = TABLE_LABELS[conflict.entityTable] ?? conflict.entityTable;
          return (
            <Card key={conflict.id} onPress={() => router.push({ pathname: '/sync/conflicts/[conflictId]', params: { conflictId: conflict.id } })}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>
                {label} · {local.name ?? local.alias ?? conflict.entityId}
              </Text>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
                이 기기와 다른 기기에서 서로 다르게 고쳤어요
              </Text>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
