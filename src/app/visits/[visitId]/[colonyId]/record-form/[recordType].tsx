import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '../../../../../components/Button';
import { PhotoPicker, PickedPhoto } from '../../../../../components/PhotoPicker';
import { Screen } from '../../../../../components/Screen';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { TriState, TriStateField } from '../../../../../components/TriStateField';
import { RecordType } from '../../../../../db/schema';
import { getRecordTypeConfig } from '../../../../../features/records/recordTypesConfig';
import { useColony } from '../../../../../repositories/colonyRepository';
import { createQuickRecord, FieldValueState } from '../../../../../repositories/recordRepository';
import { upsertVisitColonyStatus } from '../../../../../repositories/visitRepository';
import { spacing } from '../../../../../theme/tokens';

export default function RecordFormScreen() {
  const { visitId, colonyId, recordType } = useLocalSearchParams<{
    visitId: string;
    colonyId: string;
    recordType: RecordType;
  }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];
  const config = getRecordTypeConfig(recordType);

  const [values, setValues] = useState<Record<string, TriState>>({});
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  const setField = (key: string, state: TriState) => setValues((prev) => ({ ...prev, [key]: state }));

  if (!config) {
    return (
      <Screen scroll={false} padded={false}>
        <ScreenHeader title="기록" onBack={() => router.back()} />
      </Screen>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await createQuickRecord({
        visitId,
        colonyId,
        recordType,
        fields: config.fields,
        values: values as Record<string, FieldValueState>,
        photos,
      });
      await upsertVisitColonyStatus(visitId, colonyId, 'done');
      router.replace({ pathname: '/visits/[visitId]/saved', params: { visitId, colonyId, recordTypeTitle: config.title } });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title={`${colony?.alias ?? ''} · ${config.title}`} onBack={() => router.back()} subdued />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
        <View style={{ gap: spacing.xl }}>
          {config.fields.map((field) => (
            <TriStateField key={field.key} label={field.label} value={values[field.key]} onChange={(v) => setField(field.key, v)} />
          ))}

          <PhotoPicker photos={photos} onChange={setPhotos} />
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={{ padding: spacing.xl }}>
        <Button label="저장하고 다음 봉군" onPress={handleSave} loading={saving} />
      </View>
    </Screen>
  );
}
