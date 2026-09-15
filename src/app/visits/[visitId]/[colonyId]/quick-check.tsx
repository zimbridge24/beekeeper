import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../../../components/Button';
import { Card } from '../../../../components/Card';
import { FieldStateSelector } from '../../../../components/FieldStateSelector';
import { ForwardChevronIcon } from '../../../../components/icons';
import { PhotoPicker, PickedPhoto } from '../../../../components/PhotoPicker';
import { Screen } from '../../../../components/Screen';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { TextField } from '../../../../components/TextField';
import { DETAIL_RECORD_TYPES, QUICK_CHECK_FIELDS } from '../../../../features/records/recordTypesConfig';
import { useColony } from '../../../../repositories/colonyRepository';
import { createQuickRecord } from '../../../../repositories/recordRepository';
import { upsertVisitColonyStatus } from '../../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../../theme/tokens';

export default function QuickCheckScreen() {
  const { visitId, colonyId } = useLocalSearchParams<{ visitId: string; colonyId: string }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];

  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  const setField = (key: string, state: string) => setValues((prev) => ({ ...prev, [key]: state }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await createQuickRecord({
        visitId,
        colonyId,
        recordType: 'general_observation',
        fields: QUICK_CHECK_FIELDS,
        values,
        notes: notes.trim() || null,
        photos,
      });
      await upsertVisitColonyStatus(visitId, colonyId, 'done');
      router.replace({ pathname: '/visits/[visitId]/saved', params: { visitId, colonyId } });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title={`${colony?.alias ?? ''} · 빠른 상태 선택`} onBack={() => router.back()} subdued />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
        <View style={{ gap: spacing.xl }}>
          {QUICK_CHECK_FIELDS.map((field) => (
            <FieldStateSelector
              key={field.key}
              label={field.label}
              kind={field.kind}
              value={values[field.key]}
              onChange={(v) => setField(field.key, v)}
            />
          ))}

          <TextField label="자유메모 (선택)" value={notes} onChangeText={setNotes} placeholder="추가로 남길 내용" multiline />

          <PhotoPicker photos={photos} onChange={setPhotos} />

          <View>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
              기록 유형 선택 (선택)
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {DETAIL_RECORD_TYPES.map((rt) => (
                <Card
                  key={rt.recordType}
                  size="medium"
                  onPress={() =>
                    router.push({
                      pathname: '/visits/[visitId]/[colonyId]/record-form/[recordType]',
                      params: { visitId, colonyId, recordType: rt.recordType },
                    })
                  }
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                      {rt.title}
                    </Text>
                    <ForwardChevronIcon />
                  </View>
                </Card>
              ))}
            </View>
          </View>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={{ padding: spacing.xl }}>
        <Button label="저장하고 다음 봉군" onPress={handleSave} loading={saving} />
      </View>
    </Screen>
  );
}
