import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { ColonyForm, ColonyFormValues } from '../../../components/ColonyForm';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useApiary } from '../../../repositories/apiaryRepository';
import { setColonyArchived, updateColony, useColony } from '../../../repositories/colonyRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

export default function ColonyDetailScreen() {
  const { colonyId } = useLocalSearchParams<{ colonyId: string }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];
  const { data: apiaryRows } = useApiary(colony?.apiaryId);
  const apiary = apiaryRows?.[0];
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!colony) {
    return (
      <Screen>
        <ScreenHeader title="봉군 상세" onBack={() => router.back()} />
      </Screen>
    );
  }

  const handleSave = async (values: ColonyFormValues) => {
    setSaving(true);
    try {
      await updateColony(colony.id, values);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = () => setColonyArchived(colony.id, !colony.isArchived);

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="봉군 상세" onBack={() => router.back()} />
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.xl }}>
        {editing ? (
          <ColonyForm
            initial={{ alias: colony.alias, species: colony.species as 'western' | 'native' }}
            submitLabel="저장"
            saving={saving}
            onSubmit={handleSave}
          />
        ) : (
          <>
            <Card size="large">
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display4, color: colors.textPrimary }}>
                {colony.alias}
              </Text>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
                {colony.species === 'western' ? '서양벌' : '토종벌'} · {apiary?.name ?? '소속 양봉장 없음'}
              </Text>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: spacing.md }}>
                동기화 상태: {colony.syncStatus}
                {colony.isArchived ? ' · 보관됨' : ''}
              </Text>
            </Card>

            <Card size="large">
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                음성 내검, 빠른 상태 선택, 이력 조회 기능은 다음 업데이트에서 제공됩니다.
              </Text>
            </Card>

            <View style={{ gap: spacing.md }}>
              <Button label="정보 수정" variant="surface" onPress={() => setEditing(true)} />
              <Button
                label={colony.isArchived ? '보관 해제' : '보관하기'}
                variant="ghost"
                onPress={handleArchiveToggle}
              />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
