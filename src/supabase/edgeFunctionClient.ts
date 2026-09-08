import { supabase } from '../supabase/client';

const FUNCTIONS_BASE_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

// supabase-js's functions.invoke() throws before any HTTP response comes
// back ("failed to send a request to the Edge Functions") in some React
// Native setups. Calling fetch directly against the function's URL
// sidesteps the SDK's body-serialization layer. Only used for JSON bodies —
// file uploads go through expo-file-system's upload task instead (see
// ClovaSpeechToTextProvider), since Expo's global fetch doesn't support
// FormData file parts (https://github.com/expo/expo/issues/33134).
export async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('로그인이 필요합니다.');

  const res = await fetch(`${FUNCTIONS_BASE_URL}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? `${name} 요청 실패: ${res.status}`);
  }
  return json as T;
}
