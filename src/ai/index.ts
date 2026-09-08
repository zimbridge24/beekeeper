import { ClovaSpeechToTextProvider } from './ClovaSpeechToTextProvider';
import { GeminiInspectionAIProvider } from './GeminiInspectionAIProvider';
import { InspectionAIProvider, MockInspectionAIProvider } from './InspectionAIProvider';
import { MockSpeechToTextProvider, SpeechToTextProvider } from './SpeechToTextProvider';

// Provider는 환경변수만 바꾸면 교체된다 — 코드 변경 불필요. 값을 설정하지
// 않으면 안전하게 mock으로 동작하므로, STT/AI 자격증명이 없는 환경(로컬 개발,
// CI)에서도 화면이 깨지지 않는다.
//   EXPO_PUBLIC_STT_PROVIDER=clova            (기본값: mock)
//   EXPO_PUBLIC_INSPECTION_AI_PROVIDER=gemini (기본값: mock)
const STT_PROVIDER = process.env.EXPO_PUBLIC_STT_PROVIDER ?? 'mock';
const INSPECTION_AI_PROVIDER = process.env.EXPO_PUBLIC_INSPECTION_AI_PROVIDER ?? 'mock';

function createSpeechToTextProvider(): SpeechToTextProvider {
  switch (STT_PROVIDER) {
    case 'clova':
      return new ClovaSpeechToTextProvider();
    default:
      return new MockSpeechToTextProvider();
  }
}

function createInspectionAIProvider(): InspectionAIProvider {
  switch (INSPECTION_AI_PROVIDER) {
    case 'gemini':
      return new GeminiInspectionAIProvider();
    default:
      return new MockInspectionAIProvider();
  }
}

export const speechToTextProvider: SpeechToTextProvider = createSpeechToTextProvider();
export const inspectionAIProvider: InspectionAIProvider = createInspectionAIProvider();

export type { AudioInput, TranscriptionResult } from './SpeechToTextProvider';
export type { StructuringResult } from './InspectionAIProvider';
