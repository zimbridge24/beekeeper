import { RecordType } from '../../db/schema';

export type FieldCategory = 'observation' | 'problem' | 'action' | 'result';

export type RecordTypeField = {
  key: string;
  label: string;
  category: FieldCategory;
};

export type RecordTypeConfig = {
  recordType: RecordType;
  title: string;
  fields: RecordTypeField[];
};

// The 빠른 수동 내검 screen's default fields — a general snapshot, always
// available regardless of which detail record type (if any) gets filled in
// afterward.
export const QUICK_CHECK_FIELDS: RecordTypeField[] = [
  { key: 'queen_status', label: '여왕벌 상태', category: 'observation' },
  { key: 'colony_strength', label: '봉세', category: 'observation' },
  { key: 'feed_status', label: '먹이 상태', category: 'observation' },
  { key: 'abnormal_signs', label: '이상 징후', category: 'problem' },
];

// One shared form template renders all six of these — see
// src/app/apiaries record-form screens — the field list is the only thing
// that changes per record_type.
export const DETAIL_RECORD_TYPES: RecordTypeConfig[] = [
  {
    recordType: 'pest_disease',
    title: '병해충',
    fields: [
      { key: 'mite_infestation', label: '응애 감염', category: 'problem' },
      { key: 'foulbrood_suspected', label: '부저병 의심', category: 'problem' },
      { key: 'other_disease_signs', label: '기타 질병 징후', category: 'problem' },
    ],
  },
  {
    recordType: 'feeding',
    title: '급이',
    fields: [
      { key: 'feeding_given', label: '급이 여부', category: 'action' },
      { key: 'stored_honey_status', label: '저장꿀 상태', category: 'observation' },
    ],
  },
  {
    recordType: 'treatment',
    title: '방제',
    fields: [
      { key: 'treatment_applied', label: '방제 여부', category: 'action' },
      { key: 'treatment_effect', label: '방제 효과', category: 'result' },
    ],
  },
  {
    recordType: 'honey_harvest',
    title: '채밀',
    fields: [
      { key: 'harvest_done', label: '채밀 여부', category: 'action' },
      { key: 'honey_quality', label: '벌꿀 상태', category: 'result' },
    ],
  },
  {
    recordType: 'swarm_split_requeen',
    title: '분봉·합봉·여왕교체',
    fields: [
      { key: 'swarm_signs', label: '분봉 징후', category: 'observation' },
      { key: 'merge_done', label: '합봉 여부', category: 'action' },
      { key: 'requeen_done', label: '여왕벌 교체 여부', category: 'action' },
    ],
  },
  {
    recordType: 'wintering_dissolution',
    title: '월동·폐군',
    fields: [
      { key: 'wintering_prep_status', label: '월동 준비 상태', category: 'observation' },
      { key: 'colony_lost', label: '폐군 여부', category: 'result' },
    ],
  },
];

export function getRecordTypeConfig(recordType: RecordType): RecordTypeConfig | undefined {
  return DETAIL_RECORD_TYPES.find((c) => c.recordType === recordType);
}

export function getFieldsForRecordType(recordType: RecordType): RecordTypeField[] {
  if (recordType === 'general_observation') return QUICK_CHECK_FIELDS;
  return getRecordTypeConfig(recordType)?.fields ?? [];
}

export function getFieldLabel(recordType: RecordType, fieldKey: string): string {
  return getFieldsForRecordType(recordType).find((f) => f.key === fieldKey)?.label ?? fieldKey;
}

export const VALUE_STATE_LABELS: Record<'present' | 'absent' | 'unknown' | 'unset', string> = {
  present: '있음',
  absent: '없음',
  unknown: '확인 안 함',
  unset: '미입력',
};

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  general_observation: '빠른 내검',
  pest_disease: '병해충',
  feeding: '급이',
  treatment: '방제',
  honey_harvest: '채밀',
  swarm_split_requeen: '분봉·합봉·여왕교체',
  wintering_dissolution: '월동·폐군',
};
