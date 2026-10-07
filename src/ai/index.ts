import { ClovaSpeechToTextProvider } from './ClovaSpeechToTextProvider';
import { GeminiHealthPhotoAIProvider } from './GeminiHealthPhotoAIProvider';
import { GeminiInspectionAIProvider } from './GeminiInspectionAIProvider';
import { HealthPhotoAIProvider, MockHealthPhotoAIProvider } from './HealthPhotoAIProvider';
import { InspectionAIProvider, MockInspectionAIProvider } from './InspectionAIProvider';
import { MockSpeechToTextProvider, SpeechToTextProvider } from './SpeechToTextProvider';

// Provider는 환경변수만 바꾸면 교체된다 — 코드 변경 불필요. 값을 설정하지
// 않으면 안전하게 mock으로 동작하므로, STT/AI 자격증명이 없는 환경(로컬 개발,
// CI)에서도 화면이 깨지지 않는다.
//   EXPO_PUBLIC_STT_PROVIDER=clova            (기본값: mock)
//   EXPO_PUBLIC_INSPECTION_AI_PROVIDER=gemini (기본값: mock)
//   EXPO_PUBLIC_HEALTH_AI_PROVIDER=gemini     (기본값: mock) — 응애/말벌/월동 사진 판독
const STT_PROVIDER = process.env.EXPO_PUBLIC_STT_PROVIDER ?? 'mock';
const INSPECTION_AI_PROVIDER = process.env.EXPO_PUBLIC_INSPECTION_AI_PROVIDER ?? 'mock';
const HEALTH_AI_PROVIDER = process.env.EXPO_PUBLIC_HEALTH_AI_PROVIDER ?? 'mock';

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

function createHealthPhotoAIProvider(): HealthPhotoAIProvider {
  switch (HEALTH_AI_PROVIDER) {
    case 'gemini':
      return new GeminiHealthPhotoAIProvider();
    default:
      return new MockHealthPhotoAIProvider();
  }
}

// 개발 중에 mock으로 돌고 있는지 실제 업체인지 Metro 로그에서 바로 확인할 수 있게 한다.
if (__DEV__) {
  console.log(`[ai] providers stt=${STT_PROVIDER} inspection=${INSPECTION_AI_PROVIDER} health-photo=${HEALTH_AI_PROVIDER}`);
}

export const speechToTextProvider: SpeechToTextProvider = createSpeechToTextProvider();
export const inspectionAIProvider: InspectionAIProvider = createInspectionAIProvider();
export const healthPhotoAIProvider: HealthPhotoAIProvider = createHealthPhotoAIProvider();

export type { AudioInput, TranscriptionResult } from './SpeechToTextProvider';
export type { StructuredRecordDraft, StructuringResult } from './InspectionAIProvider';
export type {
  AnalysisConfidence,
  HornetPhotoAnalysis,
  MitePhotoAnalysis,
  PhotoQuality,
  WinteringPhotoAnalysis,
} from './HealthPhotoAIProvider';
