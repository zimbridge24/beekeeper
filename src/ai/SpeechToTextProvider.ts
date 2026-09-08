export type AudioInput = {
  uri: string;
  durationSec: number;
};

export type TranscriptionResult = {
  transcript: string;
  audioDurationSec: number;
};

export interface SpeechToTextProvider {
  transcribe(audio: AudioInput): Promise<TranscriptionResult>;
}

// 업체 계약 확정 전이나 자격증명이 없는 환경에서도 화면을 검증할 수 있도록 두는
// mock. 실제 오디오는 읽지 않고 고정된 예시 문장을 돌려준다.
const MOCK_TRANSCRIPT =
  '여왕벌은 확인했고 산란 상태 정상입니다. 봉세는 강군이고 먹이는 충분해 보였습니다. 특별한 이상 징후는 없었습니다.';

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(audio: AudioInput): Promise<TranscriptionResult> {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { transcript: MOCK_TRANSCRIPT, audioDurationSec: audio.durationSec };
  }
}
