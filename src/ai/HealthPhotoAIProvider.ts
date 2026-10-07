import type { HornetSpecies } from '../features/health/hornetRisk';
import type { MiteMethod } from '../features/health/miteRisk';

export type AnalysisConfidence = 'low' | 'medium' | 'high';
export type PhotoQuality = 'good' | 'fair' | 'poor';

type AnalysisBase = {
  confidence: AnalysisConfidence;
  photoQuality: PhotoQuality;
  retakeNeeded: boolean;
  // 재촬영이 필요하거나 품질이 아쉬울 때 사용자에게 보여줄 구체적인 이유/요령.
  retakeReasons: string[];
  notes: string | null;
  // 가상 판독(mock)일 때만 true — 화면이 "테스트 데이터"임을 분명히 표시한다.
  isMock?: boolean;
  // 이 결과가 어디서 왔는지 — 개발 환경에서 가짜(mock)와 실제 AI 응답을 한눈에 구분하는 용도.
  provider?: 'mock' | 'gemini';
  model?: string;
  // 사진 업로드 + Edge Function + 모델 응답까지 걸린 시간.
  elapsedMs?: number;
};

export type MitePhotoAnalysis = AnalysisBase & {
  estimatedCount: number;
  countRangeLow: number;
  countRangeHigh: number;
  // 사진이 여러 장일 때 장별 추정치 (합이 estimatedCount).
  perPhotoCounts: number[];
};

export type HornetPhotoAnalysis = AnalysisBase & {
  species: HornetSpecies;
  estimatedCount: number;
  // 사진에 벌집(둥지)이 보이는지 — 보이면 직접 제거하지 말고 신고하도록 안내한다.
  nestVisible: boolean;
};

// 봉세·먹이는 폼 필드(colony_strength / feed_status)와 같은 토큰으로 돌려준다 —
// 'unknown'은 사진으로 판단할 수 없다는 뜻이라 폼에 채우지 않는다.
export type WinteringPhotoAnalysis = AnalysisBase & {
  strength: 'strong' | 'normal' | 'weak' | 'unknown';
  food: 'enough' | 'normal' | 'low' | 'unknown';
  broodVisible: boolean | null;
};

export interface HealthPhotoAIProvider {
  analyzeMitePhotos(photoUris: string[], context: { method: MiteMethod }): Promise<MitePhotoAnalysis>;
  analyzeHornetPhotos(photoUris: string[]): Promise<HornetPhotoAnalysis>;
  analyzeWinteringPhotos(photoUris: string[], context: { species: 'western' | 'native' }): Promise<WinteringPhotoAnalysis>;
}

const MOCK_NOTE = '실제 AI 판독이 아닌 화면 테스트용 가상 결과예요.';

// 업체 연동 전/자격증명 없는 환경에서도 화면 흐름을 검증할 수 있게 두는 mock.
// 사진을 실제로 분석하지 않고 항상 같은 값을 돌려주며, isMock으로 화면에서
// 가짜 결과임을 숨기지 못하게 한다.
export class MockHealthPhotoAIProvider implements HealthPhotoAIProvider {
  private async delay() {
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  async analyzeMitePhotos(photoUris: string[]): Promise<MitePhotoAnalysis> {
    await this.delay();
    const per = photoUris.map(() => 6);
    return {
      estimatedCount: per.reduce((a, b) => a + b, 0),
      countRangeLow: 4 * photoUris.length,
      countRangeHigh: 8 * photoUris.length,
      perPhotoCounts: per,
      confidence: 'low',
      photoQuality: 'fair',
      retakeNeeded: false,
      retakeReasons: [],
      notes: MOCK_NOTE,
      isMock: true,
      provider: 'mock',
    };
  }

  async analyzeHornetPhotos(): Promise<HornetPhotoAnalysis> {
    await this.delay();
    return {
      species: 'asian_hornet',
      estimatedCount: 3,
      nestVisible: false,
      confidence: 'low',
      photoQuality: 'fair',
      retakeNeeded: false,
      retakeReasons: [],
      notes: MOCK_NOTE,
      isMock: true,
      provider: 'mock',
    };
  }

  async analyzeWinteringPhotos(): Promise<WinteringPhotoAnalysis> {
    await this.delay();
    return {
      strength: 'normal',
      food: 'normal',
      broodVisible: false,
      confidence: 'low',
      photoQuality: 'fair',
      retakeNeeded: false,
      retakeReasons: [],
      notes: MOCK_NOTE,
      isMock: true,
      provider: 'mock',
    };
  }
}
