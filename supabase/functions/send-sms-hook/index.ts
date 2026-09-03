// Supabase Auth "Send SMS Hook" target: Supabase calls this function every
// time it needs to send an OTP SMS (signInWithOtp / phone signup), instead
// of using one of its built-in providers (Twilio/Vonage/MessageBird). This
// function verifies the request really came from Supabase, then sends the
// OTP via NCP SENS.
//
// Deploy: supabase functions deploy send-sms-hook
// Required secrets (supabase secrets set ...):
//   SEND_SMS_HOOK_SECRET   — from Supabase Dashboard → Authentication → Hooks →
//                            Send SMS hook, after pointing it at this function's
//                            URL (looks like "v1,whsec_...")
//   NCP_ACCESS_KEY         — NCP Sub Account / API Access Key
//   NCP_SECRET_KEY         — matching Secret Key
//   NCP_SENS_SERVICE_ID    — SENS SMS project's Service ID (from the SENS console)
//   NCP_SENS_SENDER_NUMBER — the pre-registered 발신번호, digits only (e.g. "01012345678")

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

interface SendSmsHookPayload {
  user: { id: string; phone?: string; email?: string };
  sms: { otp: string };
}

// Supabase requires the hook response body to be valid JSON with an
// explicit application/json Content-Type — Deno's Response defaults to
// text/plain, which Supabase rejects with hook_payload_invalid_content_type.
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const hookSecret = (Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '').replace('v1,whsec_', '');

  let data: SendSmsHookPayload;
  try {
    const wh = new Webhook(hookSecret);
    data = wh.verify(payload, headers) as SendSmsHookPayload;
  } catch {
    return jsonResponse({ error: 'invalid webhook signature' }, 401);
  }

  const phone = data.user.phone;
  const otp = data.sms.otp;
  if (!phone || !otp) {
    return jsonResponse({ error: 'missing phone or otp in payload' }, 400);
  }

  try {
    await sendSensSms(toDomesticDigits(phone), `[비히어로] 인증번호는 ${otp} 입니다.`);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }

  return jsonResponse({}, 200);
});

// Supabase stores phone numbers as E.164 ("+821012345678"); SENS expects
// domestic digits only ("01012345678").
function toDomesticDigits(e164Phone: string): string {
  const withoutPlus82 = e164Phone.startsWith('+82') ? `0${e164Phone.slice(3)}` : e164Phone;
  return withoutPlus82.replace(/\D/g, '');
}

async function sendSensSms(toDigits: string, content: string): Promise<void> {
  const accessKey = Deno.env.get('NCP_ACCESS_KEY')!;
  const secretKey = Deno.env.get('NCP_SECRET_KEY')!;
  const serviceId = Deno.env.get('NCP_SENS_SERVICE_ID')!;
  const from = Deno.env.get('NCP_SENS_SENDER_NUMBER')!;

  const timestamp = Date.now().toString();
  const method = 'POST';
  const uri = `/sms/v2/services/${serviceId}/messages`;
  const signature = await makeSensSignature(method, uri, timestamp, accessKey, secretKey);

  const res = await fetch(`https://sens.apigw.ntruss.com${uri}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-ncp-apigw-timestamp': timestamp,
      'x-ncp-iam-access-key': accessKey,
      'x-ncp-apigw-signature-v2': signature,
    },
    body: JSON.stringify({
      type: 'SMS',
      contentType: 'COMM',
      countryCode: '82',
      from,
      content,
      messages: [{ to: toDigits }],
    }),
  });

  if (!res.ok) {
    throw new Error(`SENS send failed: ${res.status} ${await res.text()}`);
  }
}

// NCP API Gateway signature v2: HMAC-SHA256("{METHOD} {URI}\n{timestamp}\n{accessKey}", secretKey), base64-encoded.
async function makeSensSignature(
  method: string,
  uri: string,
  timestamp: string,
  accessKey: string,
  secretKey: string,
): Promise<string> {
  const message = `${method} ${uri}\n${timestamp}\n${accessKey}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signed)));
}
