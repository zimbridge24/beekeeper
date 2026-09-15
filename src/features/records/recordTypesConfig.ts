import { RecordType } from '../../db/schema';

export type FieldCategory = 'observation' | 'problem' | 'action' | 'result';

// Each kind carries its own vocabulary of value_state tokens — the whole
// point is that "확인하지 않음"(never checked) and "확인했는데 없음"(checked,
// found nothing) must never collapse into the same stored value, and what
// counts as "checked but found nothing" differs by what's actually being
// recorded:
//   presence_observation — a general 있음/없음 read on something that's
//     always "there" in some state (여왕벌 상태, 봉세, 먹이 상태, ...).
//   pest_test — a specific pest/disease check with a real test-like result
//     (응애 감염, 부저병 의심, ...).
//   action_done — did the beekeeper do X or not (급이/방제/채밀/합봉/여왕교체/
//     폐군 여부) — no "확인 안 함" state, since the beekeeper IS the one who
//     did or didn't do it, not observing something external.
//   wasp_species / wasp_count_bucket — categorical detail fields for the
//     dedicated 말벌 observation (see PEST_DISEASE fields below).
export type FieldKind = 'presence_observation' | 'pest_test' | 'action_done' | 'wasp_species' | 'wasp_count_bucket';

// 'unset' (미입력, the field was never touched) is valid for every kind and
// deliberately left out of each kind's own option list below — it's not a
// user-selectable chip, it's the row's default before anyone answers.
export const UNSET_STATE = 'unset';

export const FIELD_KIND_OPTIONS: Record<FieldKind, { value: string; label: string }[]> = {
  presence_observation: [
    { value: 'present', label: '있음' },
    { value: 'absent', label: '없음' },
    { value: 'unknown', label: '확인 안 함' },
  ],
  pest_test: [
    { value: 'tested_negative', label: '검사 음성(없음)' },
    { value: 'tested_positive', label: '검사 양성(있음)' },
    { value: 'indeterminate', label: '판정 불가' },
    { value: 'not_tested', label: '검사 안 함' },
  ],
  action_done: [
    { value: 'done', label: '했음' },
    { value: 'not_done', label: '안 함' },
  ],
  wasp_species: [
    { value: 'asian_hornet', label: '등검은말벌' },
    { value: 'giant_hornet', label: '장수말벌' },
    { value: 'other', label: '기타' },
    { value: 'unknown_species', label: '모름' },
  ],
  wasp_count_bucket: [
    { value: 'none', label: '없음' },
    { value: 'few_1_5', label: '1~5마리' },
    { value: 'several_6_20', label: '6~20마리' },
    { value: 'many_20_plus', label: '20마리 이상' },
  ],
};

export function getValueStateLabel(kind: FieldKind, value: string): string {
  if (value === UNSET_STATE) return '미입력';
  return FIELD_KIND_OPTIONS[kind].find((opt) => opt.value === value)?.label ?? value;
}

// A kind's "problem detected" token, for screens that need to count/flag
// problems generically across kinds (see health.tsx) without hardcoding
// 'present'. Kinds with no notion of a detected problem (action_done, the
// wasp detail fields) return null — they're never the thing counted, only
// presence_observation/pest_test fields (queen status, mite infestation,
// wasp damage, ...) represent an actual problem/no-problem read.
export function isProblemValueState(kind: FieldKind, value: string): boolean {
  if (kind === 'presence_observation') return value === 'present';
  if (kind === 'pest_test') return value === 'tested_positive';
  return false;
}

export type RecordTypeField = {
  key: string;
  label: string;
  category: FieldCategory;
  kind: FieldKind;
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
  { key: 'queen_status', label: '여왕벌 상태', category: 'observation', kind: 'presence_observation' },
  { key: 'colony_strength', label: '봉세', category: 'observation', kind: 'presence_observation' },
  { key: 'feed_status', label: '먹이 상태', category: 'observation', kind: 'presence_observation' },
  { key: 'abnormal_signs', label: '이상 징후', category: 'problem', kind: 'presence_observation' },
];

// One shared form template renders all six of these — see
// src/app/apiaries record-form screens — the field list is the only thing
// that changes per record_type.
export const DETAIL_RECORD_TYPES: RecordTypeConfig[] = [
  {
    recordType: 'pest_disease',
    title: '병해충',
    fields: [
      { key: 'mite_infestation', label: '응애 감염', category: 'problem', kind: 'pest_test' },
      { key: 'foulbrood_suspected', label: '부저병 의심', category: 'problem', kind: 'pest_test' },
      { key: 'other_disease_signs', label: '기타 질병 징후', category: 'problem', kind: 'pest_test' },
      // 말벌은 "기타 질병 징후"에 뭉뚱그리지 않고 별도 필드로 관리 — 관찰/피해
      // 여부는 이후 다른 병해충 항목과 같은 방식으로 집계되고(presence_observation),
      // 종류/개체수는 말벌 전용 세부 항목으로 분리해 나중에 "말벌 발생 →
      // 봉세 변화 → 조치 → 월동 결과" 분석에 바로 쓸 수 있게 한다.
      { key: 'wasp_observed', label: '말벌 관찰 여부', category: 'problem', kind: 'presence_observation' },
      { key: 'wasp_damage', label: '말벌 피해 여부', category: 'problem', kind: 'presence_observation' },
      { key: 'wasp_species', label: '말벌 종류', category: 'observation', kind: 'wasp_species' },
      { key: 'wasp_count', label: '말벌 관찰 수량', category: 'observation', kind: 'wasp_count_bucket' },
    ],
  },
  {
    recordType: 'feeding',
    title: '급이',
    fields: [
      { key: 'feeding_given', label: '급이 여부', category: 'action', kind: 'action_done' },
      { key: 'stored_honey_status', label: '저장꿀 상태', category: 'observation', kind: 'presence_observation' },
    ],
  },
  {
    recordType: 'treatment',
    title: '방제',
    fields: [
      { key: 'treatment_applied', label: '방제 여부', category: 'action', kind: 'action_done' },
      { key: 'treatment_effect', label: '방제 효과', category: 'result', kind: 'presence_observation' },
    ],
  },
  {
    recordType: 'honey_harvest',
    title: '채밀',
    fields: [
      { key: 'harvest_done', label: '채밀 여부', category: 'action', kind: 'action_done' },
      { key: 'honey_quality', label: '벌꿀 상태', category: 'result', kind: 'presence_observation' },
    ],
  },
  {
    recordType: 'swarm_split_requeen',
    title: '분봉·합봉·여왕교체',
    fields: [
      { key: 'swarm_signs', label: '분봉 징후', category: 'observation', kind: 'presence_observation' },
      { key: 'merge_done', label: '합봉 여부', category: 'action', kind: 'action_done' },
      { key: 'requeen_done', label: '여왕벌 교체 여부', category: 'action', kind: 'action_done' },
    ],
  },
  {
    recordType: 'wintering_dissolution',
    title: '월동·폐군',
    fields: [
      { key: 'wintering_prep_status', label: '월동 준비 상태', category: 'observation', kind: 'presence_observation' },
      { key: 'colony_lost', label: '폐군 여부', category: 'result', kind: 'action_done' },
    ],
  },
];

const ALL_FIELDS: RecordTypeField[] = [...QUICK_CHECK_FIELDS, ...DETAIL_RECORD_TYPES.flatMap((c) => c.fields)];
const FIELDS_BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));

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

// Field keys are unique across every record type, so a bare field_key
// (as stored on record_field_values) is enough to look up its kind without
// also needing to know which record_type it belongs to.
export function getFieldKindByKey(fieldKey: string): FieldKind | undefined {
  return FIELDS_BY_KEY.get(fieldKey)?.kind;
}

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  general_observation: '빠른 내검',
  pest_disease: '병해충',
  feeding: '급이',
  treatment: '방제',
  honey_harvest: '채밀',
  swarm_split_requeen: '분봉·합봉·여왕교체',
  wintering_dissolution: '월동·폐군',
};
