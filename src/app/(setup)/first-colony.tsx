import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ColonyForm, ColonyFormValues } from '../../components/ColonyForm';
import { Screen } from '../../components/Screen';
import { BackChevronIcon } from '../../components/icons';
import { createColony } from '../../repositories/colonyRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

export default function FirstColonyScreen() {
  const { apiaryId } = useLocalSearchParams<{ apiaryId: string }>();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: ColonyFormValues) => {
    if (!apiaryId) return;
    setSaving(true);
    try {
      await createColony({ apiaryId, ...values });
      router.replace('/(tabs)/home');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <BackChevronIcon />
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
          양봉장 정보 수정
        </Text>
      </Pressable>

      <View style={{ marginTop: spacing.sm }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>2 / 2 단계</Text>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display3, color: colors.textPrimary, marginTop: 6 }}>
          첫 봉군을 등록해주세요
        </Text>
      </View>

      <ColonyForm submitLabel="등록 완료" onSubmit={handleSubmit} saving={saving} />
    </Screen>
  );
}
