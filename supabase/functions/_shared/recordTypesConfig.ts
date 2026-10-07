// AUTO-GENERATED — 직접 수정하지 마세요.
// 원본: src/features/records/recordTypesConfig.ts  (npm run sync:ai-catalog 로 갱신)

type RecordType = string;

// 이 파일은 비히어로 기록의 "단일 필드 카탈로그"다. 수동 입력 폼, AI 음성 구조화,
// 사진 AI 분석, 분석 로직(응애 추이·월동 준비도)이 전부 이 카탈로그의 같은 필드
// 키로 저장하고 읽는다 — 입력 경로가 달라도 데이터 구조는 하나.
//
// 이 파일은 Supabase Edge Function(structure-inspection)도 그대로 가져다 쓴다:
//   npm run sync:ai-catalog   →  supabase/functions/_shared/recordTypesConfig.ts 에 복사
// 그래서 React Native나 앱 내부 모듈에 의존하면 안 된다 (타입 import만 허용).

export type FieldCategory = 'observation' | 'problem' | 'action' | 'result';

// Each kind carries its own vocabulary of value_state tokens — the whole
// point is that "확인하지 않음"(never checked) and "확인했는데 없음"(checked,
// found nothing) must never collapse into the same stored value.
//   presence_observation — 있음/없음/확인 안 함 (여왕벌 상태, 이상 징후, 말벌 관찰 ...)
//   damage_observation   — 같은 토큰, 라벨만 "있음/없음/판단 어려움" (말벌 피해)
//   pest_test            — 검사형: 검사 안 함/미검출/검출/판정 불가 (응애, 부저병 ...)
//   action_done          — 했음/안 함 (급이·방제·합봉 ...)
//   strength_level       — 봉세: 강함/보통/약함/확인 안 함 (있음/없음이 아니라 "정도")
//   food_level           — 먹이: 충분/보통/부족/확인 안 함
//   prep_level           — 완료/일부 완료/미완료 (월동 보온 준비)
//   hive_condition       — 양호/확인 필요 (환기·벌통 상태)
//   mite_method / feed_type / feed_unit / wintering_result — 선택형
//   wasp_species / wasp_count_bucket — 말벌 종류/수량 구간
//   number — 측정값. value_number에 저장, value_state는 입력되면 'present'.
//   text   — 짧은 자유 텍스트(약제·방법). value_text에 저장, value_state는 입력되면 'present'.
export type FieldKind =
  | 'presence_observation'
  | 'damage_observation'
  | 'pest_test'
  | 'action_done'
  | 'strength_level'
  | 'food_level'
  | 'prep_level'
  | 'hive_condition'
  | 'mite_method'
  | 'feed_type'
  | 'feed_unit'
  | 'wintering_result'
  | 'wasp_species'
  | 'wasp_count_bucket'
  | 'number'
  | 'text';

// 'unset' (미입력, the field was never touched) is valid for every kind and
// deliberately left out of each kind's own option list below — it's not a
// user-selectable chip, it's the row's default before anyone answers.
export const UNSET_STATE = 'unset';

const PRESENCE_OPTIONS = [
  { value: 'present', label: '있음' },
  { value: 'absent', label: '없음' },
  { value: 'unknown', label: '확인 안 함' },
];

export const FIELD_KIND_OPTIONS: Record<FieldKind, { value: string; label: string }[]> = {
  presence_observation: PRESENCE_OPTIONS,
  damage_observation: [
    { value: 'present', label: '있음' },
    { value: 'absent', label: '없음' },
    { value: 'unknown', label: '판단 어려움' },
  ],
  pest_test: [
    { value: 'not_tested', label: '검사 안 함' },
    { value: 'tested_negative', label: '미검출' },
    { value: 'tested_positive', label: '검출' },
    { value: 'indeterminate', label: '판정 불가' },
  ],
  action_done: [
    { value: 'done', label: '했음' },
    { value: 'not_done', label: '안 함' },
  ],
  strength_level: [
    { value: 'strong', label: '강함' },
    { value: 'normal', label: '보통' },
    { value: 'weak', label: '약함' },
    { value: 'unknown', label: '확인 안 함' },
  ],
  food_level: [
    { value: 'enough', label: '충분' },
    { value: 'normal', label: '보통' },
    { value: 'low', label: '부족' },
    { value: 'unknown', label: '확인 안 함' },
  ],
  prep_level: [
    { value: 'done', label: '완료' },
    { value: 'partial', label: '일부 완료' },
    { value: 'not_done', label: '미완료' },
  ],
  hive_condition: [
    { value: 'good', label: '양호' },
    { value: 'needs_check', label: '확인 필요' },
  ],
  mite_method: [
    { value: 'sugar_roll', label: '가루설탕법' },
    { value: 'sticky_board', label: '철망/끈끈이판' },
    { value: 'drone_brood', label: '수벌방 검사' },
    { value: 'alcohol_wash', label: '알코올 워시' },
    { value: 'visual', label: '육안 확인' },
    { value: 'other_method', label: '기타' },
  ],
  feed_type: [
    { value: 'sugar_syrup', label: '설탕물' },
    { value: 'pollen_cake', label: '화분떡' },
    { value: 'honey_feed', label: '꿀' },
    { value: 'other_feed', label: '기타' },
  ],
  feed_unit: [
    { value: 'kg', label: 'kg' },
    { value: 'liter', label: 'L' },
  ],
  wintering_result: [
    { value: 'survived', label: '월동 성공' },
    { value: 'weak_survived', label: '약세로 월동' },
    { value: 'lost', label: '폐사' },
  ],
  wasp_species: [
    { value: 'asian_hornet', label: '등검은말벌' },
    { value: 'giant_hornet', label: '장수말벌' },
    { value: 'other', label: '기타' },
    { value: 'unknown_species', label: '모름' },
  ],
  wasp_count_bucket: [
    { value: 'few_1_5', label: '1~5마리' },
    { value: 'several_6_20', label: '6~20마리' },
    { value: 'many_20_plus', label: '20마리 이상' },
  ],
  // 숫자·텍스트는 칩이 아니라 입력칸으로 받는다 — 선택지 없음.
  number: [],
  text: [],
};

// 예전 기록(봉세·먹이를 있음/없음으로 저장하던 시절)의 값도 읽을 수 있게 하는 대체 라벨.
export function getValueStateLabel(kind: FieldKind, value: string): string {
  if (value === UNSET_STATE) return '미입력';
  return (
    FIELD_KIND_OPTIONS[kind].find((opt) => opt.value === value)?.label ??
    PRESENCE_OPTIONS.find((opt) => opt.value === value)?.label ??
    value
  );
}

// 수치형 필드는 상태 라벨 대신 "6마리" 같은 값 자체를 보여준다.
export function formatNumberValue(field: Pick<RecordTypeField, 'unit'> | undefined, value: number | null | undefined): string {
  if (value === null || value === undefined) return '미입력';
  return `${value}${field?.unit ?? ''}`;
}

// A kind's "problem detected" token, for screens that need to count/flag
// problems generically across kinds (see health.tsx) without hardcoding
// 'present'. 측정값·선택형처럼 문제/정상이 없는 종류는 false.
export function isProblemValueState(kind: FieldKind, value: string): boolean {
  if (kind === 'presence_observation' || kind === 'damage_observation') return value === 'present';
  if (kind === 'pest_test') return value === 'tested_positive';
  return false;
}

export type RecordTypeField = {
  key: string;
  label: string;
  category: FieldCategory;
  kind: FieldKind;
  // kind === 'number' 일 때만 사용.
  unit?: string;
  max?: number;
  step?: number;
  // 한 줄 안내 (입력 화면 힌트 + AI 프롬프트 공용).
  hint?: string;
  // 다른 필드의 값에 따라 열리는 세부 항목 — 빠른 기록 화면을 짧게 유지하려고
  // "응애 검사함"을 고른 뒤에야 방법·결과 칸을 보여준다. 이 필드 자신에 값이
  // 있으면(예: 음성에서 이미 채워짐) 조건과 상관없이 보인다.
  visibleWhen?: { fieldKey: string; in: string[] };
};

export type RecordTypeGroup = 'status' | 'problem' | 'action' | 'season';

export type RecordTypeConfig = {
  recordType: RecordType;
  title: string;
  emoji: string;
  group: RecordTypeGroup;
  // 응애·말벌·월동 준비처럼 비히어로의 핵심 영역은 추가 기록 목록에서 크게 보여준다.
  highlight?: boolean;
  // AI 음성 구조화용: 전사문에 이 영역을 언급한 흔적이 하나도 없으면 AI가 채운 이 영역은
  // 버린다. 모델이 모든 필드에 답을 채우려다 말하지 않은 영역을 "안 함/검사 안 함"으로
  // 만들어 내는 것을 서버에서 결정적으로 막는 안전장치.
  keywords: string[];
  fields: RecordTypeField[];
};

const TESTED = ['tested_negative', 'tested_positive', 'indeterminate'];

// 빠른 내검 — 가장 자주 보는 4가지만. 현장에서 한 손으로 끝나는 기록이 비히어로의
// 기본이라서 여기에 항목을 더 늘리지 않는다 (세부 항목은 아래 "추가 기록").
export const QUICK_CHECK_FIELDS: RecordTypeField[] = [
  { key: 'queen_status', label: '여왕벌 상태', category: 'observation', kind: 'presence_observation' },
  { key: 'colony_strength', label: '봉세', category: 'observation', kind: 'strength_level' },
  { key: 'feed_status', label: '먹이 상태', category: 'observation', kind: 'food_level' },
  { key: 'abnormal_signs', label: '이상 징후', category: 'problem', kind: 'presence_observation' },
];

export const DETAIL_RECORD_TYPES: RecordTypeConfig[] = [
  {
    recordType: 'mite',
    title: '응애',
    emoji: '🕷',
    group: 'problem',
    highlight: true,
    keywords: ['응애', '설탕', '가루', '끈끈이', '철망', '알코올', '수벌방', '검사'],
    fields: [
      { key: 'mite_infestation', label: '응애 검사', category: 'problem', kind: 'pest_test' },
      { key: 'mite_method', label: '검사 방법', category: 'observation', kind: 'mite_method', visibleWhen: { fieldKey: 'mite_infestation', in: TESTED } },
      {
        key: 'mite_count',
        label: '응애 수',
        category: 'observation',
        kind: 'number',
        unit: '마리',
        max: 500,
        hint: '검사에서 나온 응애 마릿수',
        visibleWhen: { fieldKey: 'mite_infestation', in: TESTED },
      },
      {
        key: 'mite_sample_bees',
        label: '검사한 벌 수',
        category: 'observation',
        kind: 'number',
        unit: '마리',
        max: 1000,
        step: 50,
        hint: '보통 1/2컵(약 300마리) — 벌 100마리당 응애 수를 계산해요',
        visibleWhen: { fieldKey: 'mite_method', in: ['sugar_roll', 'alcohol_wash'] },
      },
      {
        key: 'mite_observation_days',
        label: '끈끈이판 설치 기간',
        category: 'observation',
        kind: 'number',
        unit: '일',
        max: 30,
        hint: '하루 평균 낙하 수를 계산해요',
        visibleWhen: { fieldKey: 'mite_method', in: ['sticky_board'] },
      },
    ],
  },
  {
    recordType: 'hornet',
    title: '말벌',
    emoji: '🐝',
    group: 'problem',
    highlight: true,
    keywords: ['말벌'],
    fields: [
      { key: 'wasp_observed', label: '말벌 관찰', category: 'problem', kind: 'presence_observation' },
      { key: 'wasp_species', label: '종류', category: 'observation', kind: 'wasp_species', visibleWhen: { fieldKey: 'wasp_observed', in: ['present'] } },
      { key: 'wasp_count', label: '수량', category: 'observation', kind: 'wasp_count_bucket', visibleWhen: { fieldKey: 'wasp_observed', in: ['present'] } },
      {
        key: 'wasp_count_number',
        label: '정확한 마릿수 (선택)',
        category: 'observation',
        kind: 'number',
        unit: '마리',
        max: 200,
        visibleWhen: { fieldKey: 'wasp_observed', in: ['present'] },
      },
      { key: 'wasp_damage', label: '피해', category: 'problem', kind: 'damage_observation', visibleWhen: { fieldKey: 'wasp_observed', in: ['present'] } },
    ],
  },
  {
    recordType: 'treatment',
    title: '방제',
    emoji: '💊',
    group: 'action',
    keywords: ['방제', '약제', '옥살산', '개미산', '훈증', '약 ', '약을', '처리'],
    fields: [
      { key: 'treatment_applied', label: '방제', category: 'action', kind: 'action_done' },
      {
        key: 'treatment_method',
        label: '약제·방법',
        category: 'action',
        kind: 'text',
        hint: '사용한 약제나 방법',
        visibleWhen: { fieldKey: 'treatment_applied', in: ['done'] },
      },
    ],
  },
  {
    recordType: 'feeding',
    title: '급이',
    emoji: '🥣',
    group: 'action',
    keywords: ['급이', '설탕물', '시럽', '화분떡', '먹이', '먹였', '먹임'],
    fields: [
      { key: 'feeding_given', label: '급이', category: 'action', kind: 'action_done' },
      { key: 'feed_type', label: '먹이 종류', category: 'action', kind: 'feed_type', visibleWhen: { fieldKey: 'feeding_given', in: ['done'] } },
      {
        key: 'feed_amount',
        label: '급이량',
        category: 'action',
        kind: 'number',
        max: 100,
        step: 0.5,
        visibleWhen: { fieldKey: 'feeding_given', in: ['done'] },
      },
      { key: 'feed_unit', label: '단위', category: 'action', kind: 'feed_unit', visibleWhen: { fieldKey: 'feeding_given', in: ['done'] } },
    ],
  },
  {
    recordType: 'wintering_prep',
    title: '월동 준비',
    emoji: '❄️',
    group: 'season',
    highlight: true,
    // 봉세·먹이·여왕은 빠른 내검과 같은 필드 키를 그대로 쓴다 — 월동 점검에서 입력한
    // 값과 평소 내검 값이 한 시계열로 이어져야 "봉세가 계속 감소" 같은 추세가 나온다.
    keywords: ['월동', '겨울', '동절', '보온', '단열'],
    fields: [
      { key: 'colony_strength', label: '봉세', category: 'observation', kind: 'strength_level' },
      { key: 'feed_status', label: '먹이 저장', category: 'observation', kind: 'food_level' },
      { key: 'queen_status', label: '여왕벌 상태', category: 'observation', kind: 'presence_observation' },
      { key: 'winter_insulation', label: '보온 준비', category: 'action', kind: 'prep_level' },
      { key: 'winter_hive_condition', label: '환기·벌통 상태', category: 'observation', kind: 'hive_condition' },
    ],
  },
  {
    recordType: 'honey_harvest',
    title: '채밀',
    emoji: '🍯',
    group: 'season',
    keywords: ['채밀', '꿀', '벌꿀'],
    fields: [
      { key: 'harvest_done', label: '채밀', category: 'action', kind: 'action_done' },
      {
        key: 'harvest_amount_kg',
        label: '채밀량',
        category: 'result',
        kind: 'number',
        unit: 'kg',
        max: 200,
        step: 0.5,
        visibleWhen: { fieldKey: 'harvest_done', in: ['done'] },
      },
    ],
  },
  {
    recordType: 'swarm_split_requeen',
    title: '분봉·합봉·여왕교체',
    emoji: '🔄',
    group: 'action',
    keywords: ['분봉', '분할', '합봉', '여왕 교체', '여왕교체', '왕대', '새 여왕'],
    fields: [
      { key: 'swarm_signs', label: '분봉 징후', category: 'observation', kind: 'presence_observation' },
      { key: 'merge_done', label: '합봉', category: 'action', kind: 'action_done' },
      { key: 'requeen_done', label: '여왕벌 교체', category: 'action', kind: 'action_done' },
    ],
  },
  {
    recordType: 'wintering_dissolution',
    title: '월동 결과·폐군',
    emoji: '🌱',
    group: 'season',
    keywords: ['월동', '폐군', '폐사', '죽'],
    fields: [{ key: 'wintering_result', label: '월동 결과', category: 'result', kind: 'wintering_result' }],
  },
  {
    recordType: 'pest_disease',
    title: '질병·증상',
    emoji: '🩺',
    group: 'problem',
    keywords: ['부저병', '질병', '병 ', '증상', '곰팡이', '석고병', '낭충봉아'],
    fields: [
      { key: 'foulbrood_suspected', label: '부저병 의심', category: 'problem', kind: 'pest_test' },
      { key: 'other_disease_signs', label: '기타 질병 징후', category: 'problem', kind: 'pest_test' },
    ],
  },
];

// 예전 버전이 저장한 필드들 — 새 폼에는 없지만 이미 저장된 기록을 계속 읽고 보여주기
// 위해 키·종류만 남겨둔다 (삭제하면 타임라인에서 라벨이 키 문자열로 깨진다).
const LEGACY_FIELDS: RecordTypeField[] = [
  { key: 'stored_honey_status', label: '저장꿀 상태', category: 'observation', kind: 'presence_observation' },
  { key: 'treatment_effect', label: '방제 효과', category: 'result', kind: 'presence_observation' },
  { key: 'honey_quality', label: '벌꿀 상태', category: 'result', kind: 'presence_observation' },
  { key: 'wintering_prep_status', label: '월동 준비 상태', category: 'observation', kind: 'presence_observation' },
  { key: 'colony_lost', label: '폐군 여부', category: 'result', kind: 'action_done' },
];

const ALL_FIELDS: RecordTypeField[] = [...QUICK_CHECK_FIELDS, ...DETAIL_RECORD_TYPES.flatMap((c) => c.fields), ...LEGACY_FIELDS];
const FIELDS_BY_KEY = new Map<string, RecordTypeField>();
for (const field of ALL_FIELDS) if (!FIELDS_BY_KEY.has(field.key)) FIELDS_BY_KEY.set(field.key, field);

export const GENERAL_RECORD_TITLE = '빠른 내검';

export function getRecordTypeConfig(recordType: RecordType): RecordTypeConfig | undefined {
  return DETAIL_RECORD_TYPES.find((c) => c.recordType === recordType);
}

export function getFieldsForRecordType(recordType: RecordType): RecordTypeField[] {
  if (recordType === 'general_observation') return QUICK_CHECK_FIELDS;
  return getRecordTypeConfig(recordType)?.fields ?? [];
}

// 같은 키는 어느 기록 유형에서나 같은 라벨·종류이므로 키만으로 찾는다 — 예전에
// pest_disease에 저장된 응애·말벌 필드도 그대로 해석된다.
export function getFieldByKey(fieldKey: string): RecordTypeField | undefined {
  return FIELDS_BY_KEY.get(fieldKey);
}

export function getFieldLabel(_recordType: RecordType, fieldKey: string): string {
  return FIELDS_BY_KEY.get(fieldKey)?.label ?? fieldKey;
}

export function getFieldKindByKey(fieldKey: string): FieldKind | undefined {
  return FIELDS_BY_KEY.get(fieldKey)?.kind;
}

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  general_observation: GENERAL_RECORD_TITLE,
  ...(Object.fromEntries(DETAIL_RECORD_TYPES.map((c) => [c.recordType, c.title])) as Record<
    Exclude<RecordType, 'general_observation'>,
    string
  >),
};

// ---- 입력 상태(폼) 헬퍼 -----------------------------------------------------

// 한 기록 폼의 입력 상태. 칩 값/숫자/텍스트를 필드 키로 따로 들고 있다가 저장할 때
// 하나의 record_field_values 행 집합으로 합친다.
export type FieldInputState = {
  values: Record<string, string>;
  numbers: Record<string, number | undefined>;
  texts: Record<string, string | undefined>;
};

export const EMPTY_INPUT_STATE: FieldInputState = { values: {}, numbers: {}, texts: {} };

export function hasFieldValue(field: RecordTypeField, state: FieldInputState): boolean {
  if (field.kind === 'number') return state.numbers[field.key] !== undefined;
  if (field.kind === 'text') return !!state.texts[field.key]?.trim();
  const v = state.values[field.key];
  return v !== undefined && v !== UNSET_STATE;
}

export function isFieldVisible(field: RecordTypeField, state: FieldInputState): boolean {
  if (!field.visibleWhen) return true;
  if (hasFieldValue(field, state)) return true;
  const parent = state.values[field.visibleWhen.fieldKey];
  return parent !== undefined && field.visibleWhen.in.includes(parent);
}

export function getVisibleFields(fields: RecordTypeField[], state: FieldInputState): RecordTypeField[] {
  return fields.filter((f) => isFieldVisible(f, state));
}

// 보이지 않는 세부 항목의 값은 저장하지 않는다 (부모를 "검사 안 함"으로 바꿨는데
// 이전에 입력한 응애 수가 남아 저장되는 일을 막는다).
export function pruneHiddenValues(fields: RecordTypeField[], state: FieldInputState): FieldInputState {
  const visibleKeys = new Set(getVisibleFields(fields, state).map((f) => f.key));
  const values: FieldInputState['values'] = {};
  const numbers: FieldInputState['numbers'] = {};
  const texts: FieldInputState['texts'] = {};
  for (const f of fields) {
    if (!visibleKeys.has(f.key)) continue;
    if (f.kind === 'number') numbers[f.key] = state.numbers[f.key];
    else if (f.kind === 'text') texts[f.key] = state.texts[f.key]?.trim() || undefined;
    else if (state.values[f.key] !== undefined) values[f.key] = state.values[f.key];
  }
  return { values, numbers, texts };
}

// 입력된 값이 하나라도 있는지 (빈 영역은 기록으로 만들지 않기 위해).
export function hasAnyValue(fields: RecordTypeField[], state: FieldInputState): boolean {
  return fields.some((f) => hasFieldValue(f, state));
}
