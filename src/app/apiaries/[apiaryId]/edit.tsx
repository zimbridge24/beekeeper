import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ApiaryForm, ApiaryFormValues } from '../../../components/ApiaryForm';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { setApiaryArchived, updateApiary, useApiary } from '../../../repositories/apiaryRepository';
import { useColonies } from '../../../repositories/colonyRepository';
import { ensureActiveVisit } from '../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../../../theme/tokens';

export default function ApiaryEditScreen() {
  const { apiaryId, intent } = useLocalSearchParams<{ apiaryId: string; intent?: string }>();
  const { data: apiaryRows } = useApiary(apiaryId);
  const apiary = apiaryRows?.[0];
  const { data: colonies } = useColonies(apiaryId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingVoiceColonyId, setStartingVoiceColonyId] = useState<string | null>(null);

  // Reached from home's "AI 음성으로 내검하기" when there's more than one
  // apiary — picking a colony here should jump straight into recording for
  // it, not the colony's normal detail/management screen.
  const handleColonyPress = async (colonyId: string) => {
    if (intent !== 'voice-check') {
      router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId } });
      return;
    }
    setStartingVoiceColonyId(colonyId);
    try {
      const visitId = await ensureActiveVisit(apiaryId);
      router.push({ pathname: '/visits/[visitId]/voice-record', params: { visitId, colonyId } });
    } finally {
      setStartingVoiceColonyId(null);
    }
  };

  if (!apiary) {
    return (
      <Screen scroll={false} padded={false}>
        <ScreenHeader title="양봉장" onBack={() => router.back()} />
      </Screen>
    );
  }

  const handleSave = async (values: ApiaryFormValues) => {
    setSaving(true);
    try {
      await updateApiary(apiary.id, values);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded>
      <ScreenHeader title={`${apiary.name} 양봉장`} onBack={() => router.back()} />

      {editing ? (
        <ApiaryForm
          initial={{ name: apiary.name, address: apiary.address, latitude: apiary.latitude, longitude: apiary.longitude }}
          submitLabel="저장"
          saving={saving}
          onSubmit={handleSave}
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>봉군</Text>
          </View>

          <View style={{ gap: spacing.md }}>
            {colonies?.map((colony) => (
              <Card key={colony.id} onPress={() => handleColonyPress(colony.id)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>{colony.alias}</Text>
                  {startingVoiceColonyId === colony.id && <ActivityIndicator color={colors.primary} />}
                </View>
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 4 }}>
                  {colony.species === 'western' ? '서양벌' : '토종벌'}
                </Text>
              </Card>
            ))}

            <Pressable onPress={() => router.push({ pathname: '/apiaries/[apiaryId]/colonies/new', params: { apiaryId: apiary.id } })}>
              <View
                style={{
                  borderRadius: radius.cardMedium,
                  borderWidth: 1.5,
                  borderColor: '#C4CFC2',
                  borderStyle: 'dashed',
                  padding: spacing.lg,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>+ 봉군 추가</Text>
              </View>
            </Pressable>
          </View>

          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display4, color: colors.textPrimary }}>{apiary.name}</Text>
            {apiary.address && (
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
                {apiary.address}
              </Text>
            )}
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: spacing.md }}>
              동기화 상태: {apiary.syncStatus}
              {apiary.isArchived ? ' · 보관됨' : ''}
            </Text>
          </Card>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button label="정보 수정" variant="surface" onPress={() => setEditing(true)} />
          </View>
          <Button
            label={apiary.isArchived ? '보관 해제' : '보관하기'}
            variant="ghost"
            onPress={() => setApiaryArchived(apiary.id, !apiary.isArchived)}
          />
        </>
      )}
    </Screen>
  );
}
