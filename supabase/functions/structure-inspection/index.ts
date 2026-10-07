// Structures a (CLOVA-transcribed) inspection transcript into structured record
// fields, using Gemini's structured-output mode. Called by the app via
// src/ai/GeminiInspectionAIProvider.ts. The result is always shown to the user
// for review/edit before anything is saved (voice-review.tsx) — it is never
// auto-confirmed; the app separately persists this AI draft permanently (never
// overwritten by later user edits) next to whatever the user ends up confirming.
//
// ONE UTTERANCE, MANY AREAS. A single recording can mention the queen, 봉세, a
// 응애 검사, 말벌, 급이 and 월동 준비 all at once, so the model scans every
// supported field of every record type and returns one value per field it heard
// about — each tagged with its record type. Anything the user did not say is left
// out (미입력); the model must never guess. Only content that fits NO field goes
// to `notes`.
//
// The field catalog is NOT defined here: it is the app's own catalog
// (src/features/records/recordTypesConfig.ts), copied to ../_shared by
// `npm run sync:ai-catalog`, so manual entry, voice and photo analysis can never
// drift apart.
//
// Deploy: npm run sync:ai-catalog && supabase functions deploy structure-inspection
// Required secrets (supabase secrets set ...):
//   GEMINI_API_KEY — Google AI Studio API key
//   GEMINI_MODEL   — optional, defaults to "gemini-3.5-flash-lite"

import {
  DETAIL_RECORD_TYPES,
  FIELD_KIND_OPTIONS,
  QUICK_CHECK_FIELDS,
  type RecordTypeField,
} from '../_shared/recordTypesConfig.ts';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type CatalogType = { recordType: string; title: string; fields: RecordTypeField[]; keywords: string[] };

const CATALOG: CatalogType[] = [
  // 빠른 상태는 어떤 발화에서도 나올 수 있어서 키워드 제한이 없다.
  { recordType: 'general_observation', title: '빠른 내검', fields: QUICK_CHECK_FIELDS, keywords: [] },
  ...DETAIL_RECORD_TYPES.map((c) => ({ recordType: c.recordType, title: c.title, fields: c.fields, keywords: c.keywords })),
];
const RECORD_TYPE_VALUES = CATALOG.map((t) => t.recordType);


type ColonyRef = { id: string; label: string };

function describeField(f: RecordTypeField): string {
  if (f.kind === 'number') {
    return `${f.key}(${f.label}) [숫자${f.unit ? `, 단위 ${f.unit}` : ''}, 0~${f.max ?? 1000}${f.hint ? `, ${f.hint}` : ''}]`;
  }
  if (f.kind === 'text') {
    return `${f.key}(${f.label}) [텍스트${f.hint ? `, ${f.hint}` : ''}]`;
  }
  const options = FIELD_KIND_OPTIONS[f.kind].map((o) => `${o.value}(${o.label})`).join('/');
  const dep = f.visibleWhen ? ` — ${f.visibleWhen.fieldKey}가 ${f.visibleWhen.in.join('/')}일 때만 의미 있음` : '';
  return `${f.key}(${f.label}) [가능한 값: ${options}]${dep}`;
}

function buildPrompt(transcript: string, colonies: ColonyRef[]): string {
  const catalog = CATALOG.map(
    (t) => `■ ${t.recordType} (${t.title})\n${t.fields.map((f) => `  - ${describeField(f)}`).join('\n')}`,
  ).join('\n');

  const colonySection =
    colonies.length > 0
      ? `\n이 양봉장에 등록된 봉군 목록입니다. 전사문에서 봉군 이름이나 번호가 언급됐다면
가장 잘 맞는 봉군의 id를 colonyId로 반환하세요. 언급이 없거나 어느 봉군인지 확실하지
않으면 colonyId를 빈 문자열("")로 두세요. 목록에 없는 id를 만들어내지 마세요.

봉군 목록:
${colonies.map((c) => `- id: ${c.id}, 이름: ${c.label}`).join('\n')}
`
      : '\ncolonyId는 항상 빈 문자열("")로 반환하세요.\n';

  return `당신은 한국 양봉가의 봉군 내검 음성 전사문을 구조화하는 도우미입니다.

전사문:
"""
${transcript}
"""

규칙:
1. 전사문에는 여러 영역(여왕·봉세·먹이, 응애, 말벌, 급이, 방제, 월동 준비 …)이 한꺼번에 담겨 있을 수 있습니다. 응답은 기록 유형(영역)별 객체이고, 모든 필드가 들어 있습니다. "모든" 영역의 "모든" 필드를 하나씩 살펴서, 전사문에 근거가 있으면 값을 채우고 근거가 없으면 null로 두세요. 한 영역에서 값을 찾았다고 다른 영역을 건너뛰지 마세요.
2. 전사문에서 말하지 않은 필드는 반드시 null입니다(미입력으로 남깁니다). "안 했다/없다/검사 안 함" 같은 부정 값도 사용자가 그렇게 말했을 때만 넣으세요. 언급하지 않은 영역의 필드를 "안 함", "검사 안 함", "확인 안 함"으로 채우는 것은 틀린 답입니다 — 그 영역은 전부 null이어야 합니다. "확인 안 함(unknown)" 값은 쓰지 마세요. 추측하거나 "아마 이럴 것"으로 채우지 마세요. 단, 직접 말하지 않았어도 의미가 분명한 경우(예: "응애 7마리 나왔다" → 응애 검사 결과 검출)는 채워도 됩니다.
3. 각 필드는 표시된 "가능한 값" 중 하나만 쓰세요. 다른 필드의 값을 쓰면 안 됩니다. 숫자 필드는 구체적인 숫자가 말해졌을 때만 숫자를 채우세요("봉판 일곱 장" → 7, "한 리터" → 1). "많다/적다"처럼 막연한 표현은 숫자로 바꾸지 마세요. "열 마리쯤"처럼 개략적인 숫자는 말한 숫자를 그대로 쓰세요.
4. 빠른 상태(여왕·봉세·먹이·이상 징후)는 general_observation으로 넣습니다. 사용자가 "월동 준비/월동 점검"을 하는 맥락에서 말한 봉세·먹이·여왕만 wintering_prep으로 넣으세요. 말벌 종류/수량이 있으면 hornet, 응애 검사·방법·결과는 mite, 급이는 feeding, 방제는 treatment, 보온재·벌통 상태는 wintering_prep입니다.
5. 전사문에 봉군이 두 개 이상 언급되어 있다면(예: "1번은 ..., 2번은 ..."), 반드시 가장 먼저 언급된 봉군 하나만 기준으로 colonyId와 fieldValues를 판단하세요. 다른 봉군에 대한 내용은 완전히 무시하세요 — 여러 봉군의 내용을 섞으면 안 됩니다.
6. 이상 징후(abnormal_signs)는 사용자가 이상·문제·증상을 직접 말했을 때만 채우고, 말벌 피해는 hornet의 wasp_damage에만 넣으세요(이상 징후에 중복으로 넣지 마세요).
7. notes에는 위 필드 어디에도 담기지 않는 내용(관찰 소감, 특이사항 등)만 한국어로 간단히 쓰세요. 이미 필드로 구조화한 내용을 notes에 반복하지 마세요. 그런 내용이 없으면 빈 문자열("")로 두세요.
8. confidenceScore에는 판단 확신도를 0과 1 사이 숫자로 넣으세요.

기록 유형/필드 목록:
${catalog}
${colonySection}`;
}

// 필드마다 자기 종류에 맞는 허용값(enum)을 가진 속성을 만들고, 영역(record type)별 객체로
// 묶는다. 모든 속성을 required + nullable로 두어서 모델이 필드를 하나씩 훑으며 "말했으면
// 값, 안 말했으면 null"로 답하게 한다 — "해당하는 것만 나열해라" 방식은 모델이 첫 한두 개만
// 찾고 멈추는 경향이 있어서(실제 발화로 확인) 이 구조로 바꿨다.
function fieldSchema(f: RecordTypeField): Record<string, unknown> {
  if (f.kind === 'number') return { type: 'number', nullable: true, description: `${f.label}${f.unit ? ` (${f.unit})` : ''} — 구체적인 숫자가 말해졌을 때만` };
  if (f.kind === 'text') return { type: 'string', nullable: true, description: `${f.label} — 말한 내용 그대로 짧게` };
  return {
    type: 'string',
    nullable: true,
    enum: FIELD_KIND_OPTIONS[f.kind].map((o) => o.value),
    description: `${f.label}: ${FIELD_KIND_OPTIONS[f.kind].map((o) => `${o.value}=${o.label}`).join(', ')}`,
  };
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    ...Object.fromEntries(
      CATALOG.map((t) => [
        t.recordType,
        {
          type: 'object',
          description: t.title,
          properties: Object.fromEntries(t.fields.map((f) => [f.key, fieldSchema(f)])),
          required: t.fields.map((f) => f.key),
        },
      ]),
    ),
    notes: { type: 'string' },
    confidenceScore: { type: 'number' },
    colonyId: { type: 'string' },
  },
  required: [...RECORD_TYPE_VALUES, 'notes', 'confidenceScore', 'colonyId'],
};

type AreaValues = Record<string, string | number | null | undefined>;
interface GeminiStructuredResult {
  notes: string;
  confidenceScore: number;
  colonyId: string;
  [recordType: string]: unknown;
}

type Draft = {
  recordType: string;
  values: Record<string, string>;
  numberValues: Record<string, number>;
  textValues: Record<string, string>;
};

function bucketForCount(count: number): string {
  if (count <= 5) return 'few_1_5';
  if (count <= 20) return 'several_6_20';
  return 'many_20_plus';
}

// 모델 응답은 영역별 객체({ mite: { mite_count: 7, mite_method: null, ... }, ... }). Gemini는 가끔
// 허용되지 않는 값을 주거나 필드 종류와 안 맞는 값을 줄 수 있으므로 모두 방어적으로
// 걸러낸다 — 그 필드의 종류가 허용하는 값일 때만 남기고, null/빈 값은 "말하지 않음"이다.
export function buildDrafts(structured: Record<string, unknown>, transcript: string): Draft[] {
  const drafts: Draft[] = [];

  for (const type of CATALOG) {
    const area = structured[type.recordType];
    if (!area || typeof area !== 'object') continue;
    const raw = area as AreaValues;

    // 모든 필드에 답해야 하는 스키마라서 모델이 말하지 않은 영역을 "안 함/검사 안 함"으로
    // 채우는 일이 있다. 전사문에 그 영역을 언급한 흔적이 없으면 영역째로 버린다.
    if (type.keywords.length > 0 && !type.keywords.some((k) => transcript.includes(k))) continue;

    const draft: Draft = { recordType: type.recordType, values: {}, numberValues: {}, textValues: {} };
    for (const field of type.fields) {
      const v = raw[field.key];
      if (v === null || v === undefined || v === '') continue;
      // "확인 안 함/판단 어려움"(unknown)은 미입력과 같은 뜻이다 — AI가 추측으로 내는 일이
      // 많아서 받지 않고, 사용자가 직접 고르게 한다.
      if (v === 'unknown') continue;

      if (field.kind === 'number') {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= (field.max ?? 1000)) draft.numberValues[field.key] = v;
      } else if (field.kind === 'text') {
        const text = typeof v === 'string' ? v.trim().slice(0, 200) : '';
        if (text) draft.textValues[field.key] = text;
      } else if (typeof v === 'string' && FIELD_KIND_OPTIONS[field.kind].some((o) => o.value === v)) {
        draft.values[field.key] = v;
      }
    }

    // 부모가 "아니다"로 명시된 세부 항목은 버린다 (예: 말벌 관찰 없음인데 말벌 종류).
    // 부모가 비어 있으면 그대로 둔다 — 화면이 값이 있는 세부 항목은 항상 보여준다.
    for (const field of type.fields) {
      if (!field.visibleWhen) continue;
      const parent = draft.values[field.visibleWhen.fieldKey];
      if (parent !== undefined && !field.visibleWhen.in.includes(parent)) {
        delete draft.values[field.key];
        delete draft.numberValues[field.key];
        delete draft.textValues[field.key];
      }
    }

    // 마릿수만 말하고 구간을 안 고른 경우 구간을 채워준다.
    const exact = draft.numberValues['wasp_count_number'];
    if (exact !== undefined && exact > 0 && draft.values['wasp_count'] === undefined) {
      draft.values['wasp_count'] = bucketForCount(exact);
    }
    drafts.push(draft);
  }

  // 빠른 상태(봉세·먹이·여왕)는 월동 점검과 같은 필드 키를 쓴다. 모델이 두 영역에 똑같이
  // 채웠다면 빠른 상태에만 남기고, 월동 점검은 월동을 실제로 언급했을 때만 유지한다.
  const general = drafts.find((d) => d.recordType === 'general_observation');
  const wintering = drafts.find((d) => d.recordType === 'wintering_prep');
  if (wintering) {
    const mentionsWintering = /월동|겨울|동절/.test(transcript);
    for (const key of ['colony_strength', 'feed_status', 'queen_status']) {
      if (!mentionsWintering || (general && general.values[key] !== undefined)) delete wintering.values[key];
    }
    if (!mentionsWintering) {
      delete wintering.values['winter_insulation'];
      delete wintering.values['winter_hive_condition'];
    }
  }

  return drafts.filter(
    (d) => Object.keys(d.values).length + Object.keys(d.numberValues).length + Object.keys(d.textValues).length > 0,
  );
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
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.1 },
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

  // 목록에 없는 id를 만들어냈을 경우를 대비한 방어적 검증.
  const validColonyIds = new Set(colonies.map((c) => c.id));
  const colonyId = structured.colonyId && validColonyIds.has(structured.colonyId) ? structured.colonyId : null;

  return jsonResponse(
    {
      drafts: buildDrafts(structured, transcript),
      notes: structured.notes?.trim() ? structured.notes.trim() : null,
      confidenceScore: structured.confidenceScore ?? 0,
      colonyId,
    },
    200,
  );
});
