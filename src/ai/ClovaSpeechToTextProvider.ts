import { File, UploadType } from 'expo-file-system';

import { supabase } from '../supabase/client';
import { AudioInput, SpeechToTextProvider, TranscriptionResult } from './SpeechToTextProvider';

const FUNCTIONS_BASE_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

function safeParseJson(text: string): { transcript?: string; error?: string } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 실제 오디오 파일을 Supabase Edge Function(stt-clova)으로 업로드해 NAVER CLOVA
// Speech(긴 문장 인식)로 전사한다. CLOVA invoke URL/secret key는 클라이언트에
// 절대 두지 않고 Edge Function 환경변수로만 보관한다 — send-sms-hook과 동일한
// 패턴.
//
// fetch()+FormData가 아니라 expo-file-system의 네이티브 업로드 태스크를 쓴다 —
// Expo SDK 57의 전역 fetch(expo/fetch)는 FormData의 로컬 파일 파트를 제대로
// 지원하지 않아 "Unsupported FormDataPart implementation" 에러로 실패한다
// (https://github.com/expo/expo/issues/33134, 미해결). createUploadTask는
// 이 문제를 완전히 우회한다.
export class ClovaSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(audio: AudioInput): Promise<TranscriptionResult> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다.');

    const file = new File(audio.uri);
    const task = file.createUploadTask(`${FUNCTIONS_BASE_URL}/stt-clova`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'media',
      mimeType: 'audio/m4a',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
    });

    const result = await task.uploadAsync();
    const parsed = result ? safeParseJson(result.body) : null;

    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(parsed?.error ?? `CLOVA Speech 업로드 실패: ${result?.status}`);
    }

    const transcript = parsed?.transcript;
    if (!transcript) throw new Error('CLOVA Speech가 전사 결과를 반환하지 않았습니다.');

    return { transcript, audioDurationSec: audio.durationSec };
  }
}
