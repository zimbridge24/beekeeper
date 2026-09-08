// Proxies a recorded inspection audio clip to NAVER CLOVA Speech (long
// sentence recognition) and returns the transcribed text. Called by the app
// via supabase.functions.invoke('stt-clova', { body: <FormData> }) — see
// src/ai/ClovaSpeechToTextProvider.ts. The CLOVA invoke URL/secret key stay
// server-side only; the client never sees them.
//
// Deploy: supabase functions deploy stt-clova
// Required secrets (supabase secrets set ...):
//   CLOVA_SPEECH_INVOKE_URL — Invoke URL from the CLOVA Speech domain
//                             (NCP console → AI·Application Service →
//                             CLOVA Speech → Domain), up to and including
//                             the app-id segment, e.g.
//                             "https://clovaspeech-gw.ncloud.com/external/v1/{domainId}/{appId}"
//   CLOVA_SPEECH_SECRET_KEY — Secret Key issued alongside that domain

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface ClovaSyncResponse {
  result?: string;
  text?: string;
  confidence?: number;
  message?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const invokeUrl = Deno.env.get('CLOVA_SPEECH_INVOKE_URL');
  const secretKey = Deno.env.get('CLOVA_SPEECH_SECRET_KEY');
  if (!invokeUrl || !secretKey) {
    return jsonResponse({ error: 'CLOVA_SPEECH_INVOKE_URL / CLOVA_SPEECH_SECRET_KEY not configured' }, 500);
  }

  let mediaFile: File | null;
  try {
    const form = await req.formData();
    const media = form.get('media');
    mediaFile = media instanceof File ? media : null;
  } catch {
    return jsonResponse({ error: 'expected multipart/form-data with a "media" file field' }, 400);
  }
  if (!mediaFile) return jsonResponse({ error: 'missing "media" audio file' }, 400);

  const clovaForm = new FormData();
  clovaForm.append('media', mediaFile, mediaFile.name || 'inspection.m4a');
  // diarization/sed는 도메인 생성 시 "화자 인식: 사용안함" / "이벤트 탐지: 사용안함"으로
  // 설정했으므로, 요청에서도 명시적으로 꺼줘야 한다 — 생략하면 API 기본값이 켜져
  // 있다고 가정해 도메인 설정과 불일치하는 "speaker detect is off" 에러가 난다.
  clovaForm.append(
    'params',
    JSON.stringify({
      language: 'ko-KR',
      completion: 'sync',
      fullText: true,
      diarization: { enable: false },
      sed: { enable: false },
    }),
  );
  clovaForm.append('type', 'application/json');

  const clovaRes = await fetch(`${invokeUrl}/recognizer/upload`, {
    method: 'POST',
    headers: { 'X-CLOVASPEECH-API-KEY': secretKey },
    body: clovaForm,
  });

  const body: ClovaSyncResponse = await clovaRes.json().catch(() => ({}));
  if (!clovaRes.ok || !body.text) {
    return jsonResponse({ error: body.message ?? `CLOVA Speech request failed: ${clovaRes.status}` }, 502);
  }

  return jsonResponse({ transcript: body.text, confidence: body.confidence ?? null }, 200);
});
