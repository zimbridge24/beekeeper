import {
  FieldInputState,
  formatNumberValue,
  getFieldKindByKey,
  getValueStateLabel,
  hasFieldValue,
  pruneHiddenValues,
  RecordTypeField,
  UNSET_STATE,
} from './recordTypesConfig';

type StoredFieldValue = { fieldKey: string; valueState: string; valueNumber: number | null; valueText: string | null };

// 저장된 record_field_values 행들을 입력 폼이 쓰는 상태로 되돌린다 (기록 수정 화면용).
// 저장할 때 insertRecordCore가 하는 변환의 반대 방향이다 — 칩 값은 value_state, 숫자는
// value_number, 글은 value_text. 입력하지 않은('unset') 항목은 비워 둔다.
export function fieldInputStateFromRows(rows: StoredFieldValue[]): FieldInputState {
  const state: FieldInputState = { values: {}, numbers: {}, texts: {} };
  for (const row of rows) {
    if (row.valueState === UNSET_STATE) continue;
    const kind = getFieldKindByKey(row.fieldKey);
    if (kind === 'number') {
      if (row.valueNumber !== null) state.numbers[row.fieldKey] = row.valueNumber;
    } else if (kind === 'text') {
      if (row.valueText) state.texts[row.fieldKey] = row.valueText;
    } else {
      state.values[row.fieldKey] = row.valueState;
    }
  }
  return state;
}

// 입력 상태에서 "값이 들어 있는 항목"만 사람이 읽는 줄(라벨: 값)로 풀어 준다 — 음성 검토 화면의 요약용.
// 저장 때와 같은 규칙(보이지 않는 세부 항목 제외)을 쓰므로, 요약에 보이는 것이 곧 저장되는 내용이다.
export function summarizeInputState(
  fields: RecordTypeField[],
  state: FieldInputState,
): { key: string; label: string; value: string }[] {
  const pruned = pruneHiddenValues(fields, state);
  return fields
    .filter((f) => hasFieldValue(f, pruned))
    .map((f) => ({
      key: f.key,
      label: f.label,
      value:
        f.kind === 'number'
          ? formatNumberValue(f, pruned.numbers[f.key])
          : f.kind === 'text'
            ? (pruned.texts[f.key] ?? '')
            : getValueStateLabel(f.kind, pruned.values[f.key]),
    }));
}
