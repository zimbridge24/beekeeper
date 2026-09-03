import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ApiaryForm, ApiaryFormValues } from '../../components/ApiaryForm';
import { Screen } from '../../components/Screen';
import { createApiary, updateApiary } from '../../repositories/apiaryRepository';
import { setAppMetaValue } from '../../repositories/appMetaRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

export default function FirstApiaryScreen() {
  const [saving, setSaving] = useState(false);
  // Set once this screen has already created the apiary — if the user comes
  // back here (from first-colony) to fix something and submits again, this
  // makes the resubmit an update instead of creating a second apiary.
  const [createdApiaryId, setCreatedApiaryId] = useState<string | null>(null);

  const handleSubmit = async (values: ApiaryFormValues) => {
    setSaving(true);
    try {
      const apiaryId = createdApiaryId
        ? await updateApiary(createdApiaryId, values).then(() => createdApiaryId)
        : await createApiary(values);
      setCreatedApiaryId(apiaryId);
      router.push({ pathname: '/(setup)/first-colony', params: { apiaryId } });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await setAppMetaValue('setup_skipped', 'true');
    router.replace('/(tabs)/home');
  };

  return (
    <Screen>
      <View style={{ marginTop: spacing.md }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>1 / 2 단계</Text>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display3, color: colors.textPrimary, marginTop: 6 }}>
          첫 양봉장을 등록해주세요
        </Text>
      </View>

      <ApiaryForm submitLabel="다음" onSubmit={handleSubmit} saving={saving} />

      <Pressable onPress={handleSkip} style={{ alignItems: 'center', paddingVertical: spacing.md }}>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>
          나중에 하기
        </Text>
      </Pressable>
    </Screen>
  );
}
