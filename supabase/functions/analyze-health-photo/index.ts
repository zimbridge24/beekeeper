// Reads a beekeeping health-check photo (응애 검사 샘플 / 말벌 / 월동 전 소비) with
// Gemini's vision input and returns a structured estimate. Called by the app via
// src/ai/GeminiHealthPhotoAIProvider.ts.
//
// IMPORTANT — what this is and is not. The model's output is an ESTIMATE the
// user reviews and can correct before anything is saved; it is never the final
// record. Risk levels (낮음/주의/높음) and the 월동 준비도 score are NOT decided
// here — the app computes those from the confirmed numbers with plain rules
// (src/features/health/*), so they stay explainable and reproducible. Small-object
// counting (mites) is the weakest thing a general vision model does, so this
// function deliberately (a) asks the model to be conservative, and (b) caps the
// reported confidence server-side regardless of what the model claims.
//
// Photos are NOT sent in the request body. The app uploads them to the private
// `inspection-photos` bucket under `${userId}/ai-analysis/` and sends only the
// paths; this function downloads them with the CALLER's JWT (so Storage RLS
// still applies — it can only ever read the caller's own files), sends them to
// Gemini inline, and deletes the temporary files afterwards.
//
// Deploy: supabase functions deploy analyze-health-photo
// Required secrets (supabase secrets set ...):
//   GEMINI_API_KEY      — Google AI Studio API key (shared with structure-inspection)
//   GEMINI_VISION_MODEL — optional; falls back to GEMINI_MODEL, then to
//                         "gemini-3.5-flash-lite". Counting tiny mites benefits from a
//                         larger/stronger model than the voice-structuring one, so set
//                         this to a stronger vision-capable model if accuracy matters.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

const STORAGE_BUCKET = 'inspection-photos';
const MAX_PHOTOS = 4;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Kind = 'mite' | 'hornet' | 'wintering';
type Confidence = 'low' | 'medium' | 'high';
type Quality = 'good' | 'fair' | 'poor';

const CONFIDENCE_VALUES: Confidence[] = ['low', 'medium', 'high'];
const QUALITY_VALUES: Quality[] = ['good', 'fair', 'poor'];

const COMMON_PROPERTIES = {
  confidence: { type: 'string', enum: CONFIDENCE_VALUES },
  photoQuality: { type: 'string', enum: QUALITY_VALUES },
  retakeNeeded: { type: 'boolean' },
  retakeReasons: { type: 'array', items: { type: 'string' } },
  notes: { type: 'string' },
};
const COMMON_REQUIRED = ['confidence', 'photoQuality', 'retakeNeeded', 'retakeReasons', 'notes'];

const SCHEMAS: Record<Kind, unknown> = {
  mite: {
    type: 'object',
    properties: {
      perPhotoCounts: { type: 'array', items: { type: 'integer' } },
      countRangeLow: { type: 'integer' },
      countRangeHigh: { type: 'integer' },
      ...COMMON_PROPERTIES,
    },
    required: ['perPhotoCounts', 'countRangeLow', 'countRangeHigh', ...COMMON_REQUIRED],
  },
  hornet: {
    type: 'object',
    properties: {
      species: { type: 'string', enum: ['asian_hornet', 'giant_hornet', 'other', 'unknown_species', 'none'] },
      estimatedCount: { type: 'integer' },
      nestVisible: { type: 'boolean' },
      ...COMMON_PROPERTIES,
    },
    required: ['species', 'estimatedCount', 'nestVisible', ...COMMON_REQUIRED],
  },
  wintering: {
    type: 'object',
    properties: {
      strength: { type: 'string', enum: ['strong', 'normal', 'weak', 'unknown'] },
      food: { type: 'string', enum: ['enough', 'normal', 'low', 'unknown'] },
      broodVisible: { type: 'boolean', nullable: true },
      ...COMMON_PROPERTIES,
    },
    required: ['strength', 'food', 'broodVisible', ...COMMON_REQUIRED],
  },
};

const SHARED_RULES = `공통 규칙:
- 사진에서 실제로 보이는 것만 판단하세요. 확신이 없으면 숫자를 지어내지 말고 confidence를 "low"로 하세요.
- photoQuality: 초점·조명·해상도·촬영 각도가 판독에 충분하면 "good", 겨우 가능하면 "fair", 판독하기 어려우면 "poor".
- photoQuality가 "poor"이거나 대상이 일부 잘렸거나 흐리면 retakeNeeded를 true로 하고, retakeReasons에 사용자가 바로 따라 할 수 있는 구체적인 재촬영 요령을 한국어 짧은 문장으로 넣으세요(예: "흰 종이 위에 놓고 위에서 수직으로 촬영해주세요").
- notes에는 판독 근거와 불확실한 점을 한국어 1~2문장으로 쓰세요.`;

function buildPrompt(kind: Kind, photoCount: number, context: Record<string, unknown>): string {
  if (kind === 'mite') {
    const method = typeof context.method === 'string' ? context.method : 'unknown';
    const methodDesc =
      method === 'sticky_board'
        ? '바닥에 깔아둔 끈끈이판(응애 낙하 확인용)'
        : method === 'sugar_roll'
          ? '설탕가루를 뿌려 벌에서 떨어뜨린 응애를 모아 놓은 것'
          : method === 'alcohol_wash'
            ? '알코올 세척으로 벌에서 분리된 응애를 모아 놓은 것'
            : '꿀벌 응애 검사 샘플';
    return `당신은 한국 양봉가의 꿀벌응애(Varroa destructor) 검사 사진을 판독하는 도우미입니다.

검사 방법: ${methodDesc}
사진 수: ${photoCount}장 (같은 검사 샘플을 구역별로 나눠 찍은 것일 수 있습니다. 서로 겹치지 않는 구역이라고 보고, 사진마다 응애 수를 따로 세어 perPhotoCounts에 사진 순서대로 넣으세요.)

꿀벌응애는 길이 약 1.1~1.6mm의 납작한 타원형이고 적갈색~갈색입니다. 아래는 응애로 세지 마세요:
- 벌 몸 조각, 다리, 날개, 밀랍 부스러기, 꽃가루 알갱이, 먼지, 개미 같은 다른 곤충, 끈끈이판의 격자선.
확실히 응애로 보이는 것만 세고, 애매한 것은 countRangeHigh에만 반영하세요. countRangeLow ≤ (perPhotoCounts의 합) ≤ countRangeHigh 이어야 합니다.
응애가 하나도 안 보이면 perPhotoCounts를 모두 0으로 하세요(검사가 제대로 된 사진일 때만 의미가 있으니, 사진이 판독에 부적합하면 retakeNeeded를 true로 하세요).
응애 수가 많아 정확히 세기 어렵다면 confidence를 "low"로 하고 범위를 넓게 잡으세요.

${SHARED_RULES}`;
  }

  if (kind === 'hornet') {
    return `당신은 한국 양봉가가 찍은 말벌 사진에서 종류와 마릿수를 판독하는 도우미입니다.

species는 다음 중 하나로 고르세요:
- "giant_hornet" (장수말벌, Vespa mandarinia): 매우 큼(약 3.5~5.5cm), 머리가 크고 주황~황색, 가슴은 짙은 갈색, 배에 갈색/황색 굵은 줄무늬.
- "asian_hornet" (등검은말벌, Vespa velutina): 비교적 작음(약 2~3.5cm), 가슴이 검고, 배는 대부분 어둡고 4번째 마디만 넓은 주황색 띠, 다리 끝은 노란색.
- "other": 위 두 종이 아닌 말벌/벌류(쌍살벌, 털보말벌, 호박벌 등).
- "unknown_species": 말벌처럼 보이지만 사진이 불분명해 종을 가릴 수 없음.
- "none": 사진에 말벌이 없음(꿀벌만 있거나 다른 대상).
두 종을 구별할 근거(머리색·가슴색·배 무늬)가 사진에서 안 보이면 억지로 고르지 말고 "unknown_species"로 하세요.
estimatedCount는 사진에 보이는 말벌(성충) 마릿수입니다. 포획틀 안에 쌓인 개체도 센다면 "대략 몇 마리"로 보수적으로 세고, 세기 어려우면 confidence를 낮추세요. species가 "none"이면 0입니다.
nestVisible: 사진에 말벌집(둥지)이 보이면 true.

${SHARED_RULES}`;
  }

  const species = context.species === 'native' ? '토종벌' : '서양벌';
  return `당신은 한국 양봉가가 월동 전에 찍은 벌통/소비(벌집 프레임) 사진을 보고 군세와 먹이 저장량을 어림하는 도우미입니다.

대상 봉군: ${species}
사진 수: ${photoCount}장
- strength(봉세): 사진에서 벌이 프레임을 덮고 있는 정도. "strong"(대부분의 프레임을 빽빽이 덮음), "normal"(절반쯤), "weak"(드문드문, 일부만 덮음). 사진으로 판단할 수 없으면 "unknown".
- food(먹이 저장): 저장된 꿀(밀랍으로 덮인 꿀 포함)과 화분의 양. "enough"(프레임 가장자리·위쪽에 넉넉히 채워짐), "normal"(어느 정도), "low"(거의 없음). 판단할 수 없으면 "unknown".
- broodVisible: 알·유충·번데기 봉아가 보이는지. 판단할 수 없으면 null.
사진 몇 장만으로 벌통 전체를 알 수는 없으므로 이 값은 어디까지나 대략적인 추정입니다. 보이는 범위를 벗어나 추측하지 말고, 애매하면 "unknown"으로 하세요.

${SHARED_RULES}`;
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(max, Math.max(min, n));
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function lowerConfidence(c: Confidence, cap: Confidence): Confidence {
  return CONFIDENCE_VALUES.indexOf(c) > CONFIDENCE_VALUES.indexOf(cap) ? cap : c;
}

// 모델이 스스로 매긴 확신도를 그대로 믿지 않고, 사진 품질과 개체 수에 따라
// 서버에서 상한을 건다 — 작은 대상 계수는 특히 과신하기 쉽다.
function sanitizeCommon(raw: Record<string, unknown>, confidenceCap: Confidence, extraCapCondition: boolean) {
  const photoQuality = asEnum(raw.photoQuality, QUALITY_VALUES, 'poor');
  let confidence = asEnum(raw.confidence, CONFIDENCE_VALUES, 'low');
  confidence = lowerConfidence(confidence, confidenceCap);
  if (extraCapCondition) confidence = lowerConfidence(confidence, 'medium');
  if (photoQuality === 'poor') confidence = 'low';
  else if (photoQuality === 'fair') confidence = lowerConfidence(confidence, 'medium');

  const retakeReasons = Array.isArray(raw.retakeReasons)
    ? raw.retakeReasons.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).slice(0, 4)
    : [];
  const retakeNeeded = photoQuality === 'poor' || raw.retakeNeeded === true;
  if (retakeNeeded && retakeReasons.length === 0) retakeReasons.push('더 선명하게, 대상이 화면에 꽉 차도록 다시 촬영해주세요.');

  return {
    confidence,
    photoQuality,
    retakeNeeded,
    retakeReasons,
    notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : null,
  };
}

function sanitize(kind: Kind, raw: Record<string, unknown>, photoCount: number) {
  if (kind === 'mite') {
    let per = Array.isArray(raw.perPhotoCounts) ? raw.perPhotoCounts.map((n) => clampInt(n, 0, 500)) : [];
    // 모델이 사진 수와 다른 길이로 답하면 합계만 살려서 한 칸에 넣는다.
    if (per.length !== photoCount) per = [per.reduce((a, b) => a + b, 0)];
    const estimatedCount = per.reduce((a, b) => a + b, 0);
    const low = Math.min(clampInt(raw.countRangeLow, 0, 500), estimatedCount);
    const high = Math.max(clampInt(raw.countRangeHigh, 0, 500), estimatedCount);
    // 작은 대상 계수는 특히 과신하기 쉬워서 'high'는 아예 허용하지 않고, 개수가
    // 많을수록 신뢰도를 더 깎는다.
    const common = sanitizeCommon(raw, 'medium', estimatedCount > 30);
    return { perPhotoCounts: per, estimatedCount, countRangeLow: low, countRangeHigh: high, ...common };
  }

  if (kind === 'hornet') {
    const speciesRaw = asEnum(raw.species, ['asian_hornet', 'giant_hornet', 'other', 'unknown_species', 'none'] as const, 'unknown_species');
    const count = speciesRaw === 'none' ? 0 : clampInt(raw.estimatedCount, 0, 200);
    const common = sanitizeCommon(raw, 'high', count > 15);
    return {
      species: speciesRaw === 'none' ? 'unknown_species' : speciesRaw,
      estimatedCount: count,
      nestVisible: raw.nestVisible === true,
      ...common,
    };
  }

  // 소수의 사진으로 벌통 전체를 알 수는 없으므로 확신도는 최대 'medium'.
  const common = sanitizeCommon(raw, 'medium', false);
  return {
    strength: asEnum(raw.strength, ['strong', 'normal', 'weak', 'unknown'] as const, 'unknown'),
    food: asEnum(raw.food, ['enough', 'normal', 'low', 'unknown'] as const, 'unknown'),
    broodVisible: typeof raw.broodVisible === 'boolean' ? raw.broodVisible : null,
    ...common,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'missing Authorization header' }, 401);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
  const model = Deno.env.get('GEMINI_VISION_MODEL') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';

  let kind: Kind;
  let paths: string[];
  let context: Record<string, unknown> = {};
  try {
    const body = await req.json();
    if (body.kind !== 'mite' && body.kind !== 'hornet' && body.kind !== 'wintering') throw new Error('bad kind');
    kind = body.kind;
    paths = Array.isArray(body.paths) ? body.paths.filter((p: unknown): p is string => typeof p === 'string') : [];
    context = body.context && typeof body.context === 'object' ? body.context : {};
  } catch {
    return jsonResponse({ error: "expected JSON body { kind: 'mite'|'hornet'|'wintering', paths: string[], context?: object }" }, 400);
  }
  if (paths.length === 0 || paths.length > MAX_PHOTOS) return jsonResponse({ error: `paths must contain 1-${MAX_PHOTOS} items` }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'invalid session' }, 401);

  // 호출자 본인 폴더의 임시 분석 파일만 허용 (Storage RLS가 한 번 더 막는다).
  const allowedPrefix = `${user.id}/ai-analysis/`;
  if (!paths.every((p) => p.startsWith(allowedPrefix) && !p.includes('..'))) {
    return jsonResponse({ error: 'invalid photo path' }, 403);
  }

  try {
    const imageParts: unknown[] = [];
    for (const path of paths) {
      const { data: blob, error: downloadError } = await supabase.storage.from(STORAGE_BUCKET).download(path);
      if (downloadError || !blob) return jsonResponse({ error: `photo download failed: ${downloadError?.message ?? 'empty'}` }, 502);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      imageParts.push({ inline_data: { mime_type: 'image/jpeg', data: encodeBase64(bytes) } });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(kind, paths.length, context) }, ...imageParts] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMAS[kind], temperature: 0.1 },
        }),
      },
    );
    if (!geminiRes.ok) {
      return jsonResponse({ error: `Gemini request failed: ${geminiRes.status} ${await geminiRes.text()}` }, 502);
    }

    const geminiBody = await geminiRes.json();
    const rawText: string | undefined = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return jsonResponse({ error: 'Gemini returned no structured output' }, 502);

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return jsonResponse({ error: 'Gemini returned invalid JSON' }, 502);
    }

    return jsonResponse({ ...sanitize(kind, raw, paths.length), model }, 200);
  } finally {
    // 분석이 끝났으면 임시 파일은 바로 지운다 (실패해도 응답에는 영향 없음).
    await supabase.storage.from(STORAGE_BUCKET).remove(paths).catch(() => undefined);
  }
});
