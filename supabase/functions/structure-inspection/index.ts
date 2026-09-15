// Structures a (CLOVA-transcribed) inspection transcript into a record type
// + per-field state values, using Gemini's structured-output mode. Called by
// the app via supabase.functions.invoke('structure-inspection', { body }) —
// see src/ai/GeminiInspectionAIProvider.ts. The result is always shown to
// the user for review/edit before anything is saved (voice-review.tsx) — it
// is never auto-confirmed; the app separately persists this AI draft
// permanently (never overwritten by later user edits) alongside whatever the
// user ends up confirming.
//
// Deploy: supabase functions deploy structure-inspection
// Required secrets (supabase secrets set ...):
//   GEMINI_API_KEY — Google AI Studio API key
//   GEMINI_MODEL   — optional, defaults to "gemini-3.5-flash-lite" (cheap/fast
//                    model tier; override if that model is later retired)
//
// The RECORD_TYPES/FIELD_KIND_OPTIONS catalogs below must be kept in sync
// with src/features/records/recordTypesConfig.ts — each field's `kind`
// determines which value_state tokens are valid for it (a 검사형 field like
// 응애 감염 uses not_tested/tested_negative/tested_positive/indeterminate,
// while a 관찰형 field like 여왕벌 상태 uses present/absent/unknown). This is
// the same split the app enforces, applied to what we ask Gemini for.

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type FieldKind = 'presence_observation' | 'pest_test' | 'action_done' | 'wasp_species' | 'wasp_count_bucket';

const FIELD_KIND_OPTIONS: Record<FieldKind, { value: string; label: string }[]> = {
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

const ALL_STATE_VALUES = Array.from(new Set(Object.values(FIELD_KIND_OPTIONS).flatMap((opts) => opts.map((o) => o.value))));

type FieldDef = { key: string; label: string; kind: FieldKind };
type RecordTypeDef = { recordType: string; title: string; fields: FieldDef[] };

const RECORD_TYPES: RecordTypeDef[] = [
  {
    recordType: 'general_observation',
    title: '빠른 내검',
    fields: [
      { key: 'queen_status', label: '여왕벌 상태', kind: 'presence_observation' },
      { key: 'colony_strength', label: '봉세', kind: 'presence_observation' },
      { key: 'feed_status', label: '먹이 상태', kind: 'presence_observation' },
      { key: 'abnormal_signs', label: '이상 징후', kind: 'presence_observation' },
    ],
  },
  {
    recordType: 'pest_disease',
    title: '병해충',
    fields: [
      { key: 'mite_infestation', label: '응애 감염', kind: 'pest_test' },
      { key: 'foulbrood_suspected', label: '부저병 의심', kind: 'pest_test' },
      { key: 'other_disease_signs', label: '기타 질병 징후', kind: 'pest_test' },
      { key: 'wasp_observed', label: '말벌 관찰 여부', kind: 'presence_observation' },
      { key: 'wasp_damage', label: '말벌 피해 여부', kind: 'presence_observation' },
      { key: 'wasp_species', label: '말벌 종류', kind: 'wasp_species' },
      { key: 'wasp_count', label: '말벌 관찰 수량', kind: 'wasp_count_bucket' },
    ],
  },
  {
    recordType: 'feeding',
    title: '급이',
    fields: [
      { key: 'feeding_given', label: '급이 여부', kind: 'action_done' },
      { key: 'stored_honey_status', label: '저장꿀 상태', kind: 'presence_observation' },
    ],
  },
  {
    recordType: 'treatment',
    title: '방제',
    fields: [
      { key: 'treatment_applied', label: '방제 여부', kind: 'action_done' },
      { key: 'treatment_effect', label: '방제 효과', kind: 'presence_observation' },
    ],
  },
  {
    recordType: 'honey_harvest',
    title: '채밀',
    fields: [
      { key: 'harvest_done', label: '채밀 여부', kind: 'action_done' },
      { key: 'honey_quality', label: '벌꿀 상태', kind: 'presence_observation' },
    ],
  },
  {
    recordType: 'swarm_split_requeen',
    title: '분봉·합봉·여왕교체',
    fields: [
      { key: 'swarm_signs', label: '분봉 징후', kind: 'presence_observation' },
      { key: 'merge_done', label: '합봉 여부', kind: 'action_done' },
      { key: 'requeen_done', label: '여왕벌 교체 여부', kind: 'action_done' },
    ],
  },
  {
    recordType: 'wintering_dissolution',
    title: '월동·폐군',
    fields: [
      { key: 'wintering_prep_status', label: '월동 준비 상태', kind: 'presence_observation' },
      { key: 'colony_lost', label: '폐군 여부', kind: 'action_done' },
    ],
  },
];

const RECORD_TYPE_VALUES = RECORD_TYPES.map((t) => t.recordType);

type ColonyRef = { id: string; label: string };

function buildPrompt(transcript: string, colonies: ColonyRef[]): string {
  const catalog = RECORD_TYPES.map((t) => {
    const fieldLines = t.fields
      .map((f) => {
        const options = FIELD_KIND_OPTIONS[f.kind].map((o) => `${o.value}(${o.label})`).join('/');
        return `${f.key}(${f.label}) [가능한 값: ${options}]`;
      })
      .join(', ');
    return `- ${t.recordType} (${t.title}): ${fieldLines}`;
  }).join('\n');

  const colonySection =
    colonies.length > 0
      ? `\n이 양봉장에 등록된 봉군 목록입니다. 전사문에서 봉군 이름이나 번호가 언급됐다면
가장 잘 맞는 봉군의 id를 colonyId로 반환하세요. 언급이 없거나 어느 봉군인지 확실하지
않으면 colonyId를 빈 문자열("")로 두세요. 목록에 없는 id를 만들어내지 마세요.

봉군 목록:
${colonies.map((c) => `- id: ${c.id}, 이름: ${c.label}`).join('\n')}
`
      : '\ncolonyId는 항상 빈 문자열("")로 반환하세요.\n';

  const multiColonyGuard =
    '\n전사문에 봉군이 두 개 이상 언급되어 있다면(예: "1번은 ..., 2번은 ..."), 반드시 가장' +
    ' 먼저 언급된 봉군 하나만 기준으로 colonyId와 fieldValues를 판단하세요. 다른 봉군에 대한' +
    ' 내용은 완전히 무시하세요 — 여러 봉군의 내용을 섞어서 fieldValues에 반영하면 안 됩니다.\n';

  return `당신은 한국 양봉가의 봉군 내검 음성 전사문을 구조화하는 도우미입니다.

전사문:
"""
${transcript}
"""

아래 기록 유형 중 전사문 내용과 가장 잘 맞는 유형 하나를 recordType으로 고르세요.
그 유형에 속한 필드에 대해서만, 전사문에 명확한 근거가 있는 경우 그 필드에 표시된
"가능한 값" 중 하나를 fieldValues에 넣으세요 — 필드마다 가능한 값의 종류가 다르니
반드시 그 필드에 적힌 값만 쓰세요(다른 필드의 값을 쓰면 안 됩니다). 전사문에서 아예
언급되지 않은 필드는 fieldValues에 포함하지 마세요. 말벌이 언급되지 않았다면
wasp_* 필드도 전부 포함하지 마세요.
${multiColonyGuard}
기록 유형/필드 목록:
${catalog}
${colonySection}
notes에는 전사문 핵심 내용을 한국어로 자연스럽게 정리해 넣으세요.
confidenceScore에는 당신의 판단 확신도를 0과 1 사이 숫자로 넣으세요.`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    recordType: { type: 'string', enum: RECORD_TYPE_VALUES },
    fieldValues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fieldKey: { type: 'string' },
          // Constrained to the union of every kind's tokens (not
          // field-specific — Gemini's schema can't express "this enum
          // depends on that other field's value"). Which subset actually
          // applies to a given fieldKey is validated server-side below.
          valueState: { type: 'string', enum: ALL_STATE_VALUES },
        },
        required: ['fieldKey', 'valueState'],
      },
    },
    notes: { type: 'string' },
    confidenceScore: { type: 'number' },
    colonyId: { type: 'string' },
  },
  required: ['recordType', 'fieldValues', 'notes', 'confidenceScore', 'colonyId'],
};

interface GeminiFieldValue {
  fieldKey: string;
  valueState: string;
}
interface GeminiStructuredResult {
  recordType: string;
  fieldValues: GeminiFieldValue[];
  notes: string;
  confidenceScore: number;
  colonyId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';

  let transcript: string | undefined;
  let colonies: ColonyRef[] = [];
  try {
    const body = await req.json();
    transcript = body.transcript;
    colonies = Array.isArray(body.colonies) ? body.colonies : [];
  } catch {
    return jsonResponse({ error: 'expected JSON body { transcript: string, colonies?: {id,label}[] }' }, 400);
  }
  if (!transcript || !transcript.trim()) return jsonResponse({ error: 'missing transcript' }, 400);

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(transcript, colonies) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    },
  );

  if (!geminiRes.ok) {
    return jsonResponse({ error: `Gemini request failed: ${geminiRes.status} ${await geminiRes.text()}` }, 502);
  }

  const geminiBody = await geminiRes.json();
  const rawText: string | undefined = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return jsonResponse({ error: 'Gemini returned no structured output' }, 502);

  let structured: GeminiStructuredResult;
  try {
    structured = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: 'Gemini returned invalid JSON' }, 502);
  }

  const typeDef = RECORD_TYPES.find((t) => t.recordType === structured.recordType);
  const fieldsByKey = new Map((typeDef ?? RECORD_TYPES[0]).fields.map((f) => [f.key, f]));

  // Gemini는 가끔 스키마에 없는 필드 키를 만들어내거나, 그 필드의 kind와
  // 안 맞는 값을 줄 수 있으므로 둘 다 방어적으로 걸러낸다 — 선택된
  // record_type에 실제로 속한 필드이면서, 그 필드의 kind가 허용하는 값일
  // 때만 남긴다. 나머지는 화면에서 어차피 미입력(unset)으로 처리된다.
  const values: Record<string, string> = {};
  for (const fv of structured.fieldValues ?? []) {
    const field = fieldsByKey.get(fv.fieldKey);
    if (!field) continue;
    const validValues = new Set(FIELD_KIND_OPTIONS[field.kind].map((o) => o.value));
    if (validValues.has(fv.valueState)) values[fv.fieldKey] = fv.valueState;
  }

  // 목록에 없는 id를 만들어냈을 경우를 대비한 방어적 검증.
  const validColonyIds = new Set(colonies.map((c) => c.id));
  const colonyId = structured.colonyId && validColonyIds.has(structured.colonyId) ? structured.colonyId : null;

  return jsonResponse(
    {
      recordType: typeDef ? structured.recordType : RECORD_TYPES[0].recordType,
      values,
      notes: structured.notes ?? null,
      confidenceScore: structured.confidenceScore ?? 0,
      colonyId,
    },
    200,
  );
});
