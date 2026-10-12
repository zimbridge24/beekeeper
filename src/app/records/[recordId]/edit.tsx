import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { RecordFieldsForm } from '../../../components/RecordFieldsForm';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { TextField } from '../../../components/TextField';
import { RecordType } from '../../../db/schema';
import { fieldInputStateFromRows } from '../../../features/records/fieldState';
import {
  FieldInputState,
  getFieldsForRecordType,
  getMissingRequiredFields,
  GENERAL_RECORD_TITLE,
  RECORD_TYPE_LABELS,
} from '../../../features/records/recordTypesConfig';
import { useColony } from '../../../repositories/colonyRepository';
import { updateRecord, useRecord, useRecordFieldValues } from '../../../repositories/recordRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

// 저장한 기록의 값을 고친다. 같은 필드·같은 입력 컴포넌트(RecordFieldsForm)를 쓰므로 처음 입력할 때와
// 똑같이 보이고, 부모 값에 따라 열리는 세부 항목도 그대로 동작한다.
export default function EditRecordScreen() {
  const { recordId } = useLocalSearchParams<{ recordId: string }>();
  const { data: recordRows } = useRecord(recordId);
  const record = recordRows?.[0];
  const { data: fieldValues } = useRecordFieldValues(recordId);
  const { data: colonyRows } = useColony(record?.colonyId);
  const colony = colonyRows?.[0];

  const [state, setState] = useState<FieldInputState | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  // 저장된 값을 한 번만 폼 상태로 옮긴다 — 이후 live query가 갱신돼도 사용자가 고치던 내용을 덮어쓰지 않는다.
  useEffect(() => {
    if (initialized.current || !record || !fieldValues) return;
    initialized.current = true;
    setState(fieldInputStateFromRows(fieldValues));
    setNotes(record.notes ?? '');
  }, [record, fieldValues]);

  if (!record || !state) {
    return (
      <Screen scroll={false} padded={false}>
        <ScreenHeader title="기록 수정" onBack={() => router.back()} />
      </Screen>
    );
  }

  const recordType = record.recordType as RecordType;
  const fields = getFieldsForRecordType(recordType);
  const title = RECORD_TYPE_LABELS[recordType] ?? GENERAL_RECORD_TITLE;

  const handleSave = async () => {
    const missing = getMissingRequiredFields(fields, state);
    if (missing.length > 0) {
      Alert.alert(
        `${missing.map((f) => f.label).join(', ')}을(를) 골라주세요`,
        missing.map((f) => f.hint).filter(Boolean).join('\n') || undefined,
      );
      return;
    }
    setSaving(true);
    try {
      await updateRecord({ recordId: record.id, state, notes: notes.trim() || null });
      router.back();
    } catch (err) {
      Alert.alert('저장하지 못했어요', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded>
      <ScreenHeader title={`${colony?.alias ?? ''} · ${title} 수정`} onBack={() => router.back()} subdued />
      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
        {new Date(record.occurredAt).toLocaleString('ko-KR')}에 남긴 기록이에요. 고친 값만 저장돼요.
      </Text>

      <Card size="large">
        <RecordFieldsForm fields={fields} state={state} onChange={setState} />
      </Card>

      <TextField label="자유메모" value={notes} onChangeText={setNotes} placeholder="추가로 남길 내용" multiline />

      <View style={{ gap: spacing.sm }}>
        <Button label="수정 저장" onPress={handleSave} loading={saving} />
      </View>
    </Screen>
  );
}
