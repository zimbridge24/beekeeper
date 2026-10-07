import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AdditionalRecordPicker } from '../../../../components/AdditionalRecordPicker';
import { Button } from '../../../../components/Button';
import { PhotoPicker, PickedPhoto } from '../../../../components/PhotoPicker';
import { RecordFieldsForm } from '../../../../components/RecordFieldsForm';
import { Screen } from '../../../../components/Screen';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { TextField } from '../../../../components/TextField';
import { EMPTY_INPUT_STATE, FieldInputState, QUICK_CHECK_FIELDS } from '../../../../features/records/recordTypesConfig';
import { useColony } from '../../../../repositories/colonyRepository';
import { createRecord } from '../../../../repositories/recordRepository';
import { upsertVisitColonyStatus } from '../../../../repositories/visitRepository';
import { spacing } from '../../../../theme/tokens';

// 기본 내검 — 가장 자주 보는 4가지만 바로 보여준다. 응애·말벌·월동 같은 세부 기록은
// 아래 "추가 기록"에서 필요한 것만 열어서 쓴다.
export default function QuickCheckScreen() {
  const { visitId, colonyId } = useLocalSearchParams<{ visitId: string; colonyId: string }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];

  const [state, setState] = useState<FieldInputState>(EMPTY_INPUT_STATE);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await createRecord({
        visitId,
        colonyId,
        recordType: 'general_observation',
        state,
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
          <RecordFieldsForm fields={QUICK_CHECK_FIELDS} state={state} onChange={setState} />

          <TextField label="자유메모 (선택)" value={notes} onChangeText={setNotes} placeholder="추가로 남길 내용" multiline />

          <PhotoPicker photos={photos} onChange={setPhotos} />

          <AdditionalRecordPicker visitId={visitId} colonyId={colonyId} />
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={{ padding: spacing.xl }}>
        <Button label="저장하고 다음 봉군" onPress={handleSave} loading={saving} />
      </View>
    </Screen>
  );
}
