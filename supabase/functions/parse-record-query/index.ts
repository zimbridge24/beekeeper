// "기록 찾기"의 질문 해석기. 사용자의 질문 문장을 검색 조건 JSON으로 "바꿔주기만" 한다 —
// 질문에 답하지 않고, 사용자의 기록도 받지 않는다. 받는 것은 질문 문장과 봉군 이름 목록뿐이고,
// 실제 검색과 결과 표시는 앱이 기기 안의 기록으로 한다. 그래서 이 함수가 틀려도 결과에는
// 기록에 적힌 값만 나온다 (잘못 해석했다면 앱이 "이렇게 이해했어요"로 조건을 보여주고
// 사용자가 바꿀 수 있다).
//
// Deploy: supabase functions deploy parse-record-query
// Required secrets (structure-inspection과 같다):
//   GEMINI_API_KEY — Google AI Studio API key
//   GEMINI_MODEL   — optional, defaults to "gemini-3.5-flash-lite"

import { FIELD_KIND_OPTIONS } from '../_shared/recordTypesConfig.ts';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const INTENTS = ['treatment', 'wintering', 'text'] as const;
const YEARS = ['this', 'last', 'all'] as const;
const INGREDIENTS = FIELD_KIND_OPTIONS.treatment_ingredient.map((o) => o.value);

function buildPrompt(question: string, colonyAliases: string[]): string {
  return `당신은 양봉 기록 앱의 "검색 조건 변환기"입니다. 사용자의 질문에 답하지 마세요. 질문을 아래 검색 조건으로만 바꿔주세요. 당신은 사용자의 기록을 볼 수 없습니다.

질문:
"""
${question}
"""

규칙:
1. intent
   - treatment: 방제·약품·약제·성분·용량·응애 퇴치 처치 등 "무슨 약을 어떻게 썼는지"를 묻는 질문
   - wintering: 월동 결과(성공/실패/폐사)나 월동 준비 상태의 비교를 묻는 질문
   - text: 그 밖에 기록(메모·음성 원문) 속에서 특정 내용을 찾는 질문
2. year: "작년/지난해" → last, "올해/이번 시즌" → this, 언급이 없으면 all
3. ingredient: 질문에 약제 성분이 직접 나왔을 때만 (${INGREDIENTS.join(', ')}). 아니면 null
4. keywords: text 검색에서 기록 본문에 들어 있을 만한 핵심 단어(명사) 최대 5개. 반드시 질문에 실제로 나온 단어만, 조사는 빼세요. text가 아니면 빈 배열
5. colonyAlias: 아래 봉군 목록 중 질문에서 언급된 것 하나(목록에 있는 이름 그대로). 없으면 null
6. 질문에 없는 내용을 지어내지 마세요.

봉군 목록: ${colonyAliases.length > 0 ? colonyAliases.join(', ') : '(없음)'}`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...INTENTS] },
    year: { type: 'string', enum: [...YEARS] },
    ingredient: { type: 'string', nullable: true, enum: [...INGREDIENTS] },
    keywords: { type: 'array', items: { type: 'string' } },
    colonyAlias: { type: 'string', nullable: true },
  },
  required: ['intent', 'year', 'ingredient', 'keywords', 'colonyAlias'],
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';

  let question = '';
  let colonyAliases: string[] = [];
  try {
    const body = await req.json();
    question = typeof body.question === 'string' ? body.question.trim().slice(0, 300) : '';
    colonyAliases = Array.isArray(body.colonies)
      ? body.colonies.filter((c: unknown): c is string => typeof c === 'string').slice(0, 200)
      : [];
  } catch {
    return jsonResponse({ error: 'expected JSON body { question: string, colonies?: string[] }' }, 400);
  }
  if (!question) return jsonResponse({ error: 'missing question' }, 400);

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(question, colonyAliases) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
      }),
    },
  );
  if (!geminiRes.ok) {
    return jsonResponse({ error: `Gemini request failed: ${geminiRes.status} ${await geminiRes.text()}` }, 502);
  }

  const geminiBody = await geminiRes.json();
  const rawText: string | undefined = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return jsonResponse({ error: 'Gemini returned no structured output' }, 502);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: 'Gemini returned invalid JSON' }, 502);
  }

  // 모델 응답을 그대로 믿지 않는다 — 허용된 값만 통과시키고, 질문에 없는 단어·목록에 없는 봉군은 버린다.
  const intent = INTENTS.find((v) => v === parsed.intent) ?? 'text';
  const year = YEARS.find((v) => v === parsed.year) ?? 'all';
  const ingredient = typeof parsed.ingredient === 'string' && INGREDIENTS.includes(parsed.ingredient) ? parsed.ingredient : null;
  const keywords =
    intent === 'text' && Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((k: unknown): k is string => typeof k === 'string')
          .map((k) => k.trim())
          .filter((k) => k.length >= 2 && k.length <= 20 && question.includes(k))
          .slice(0, 5)
      : [];
  const colonyAlias =
    typeof parsed.colonyAlias === 'string' && colonyAliases.includes(parsed.colonyAlias) ? parsed.colonyAlias : null;

  return jsonResponse({ intent, year, ingredient, keywords, colonyAlias }, 200);
});
