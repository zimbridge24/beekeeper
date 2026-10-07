import type { HornetPhotoAnalysis, MitePhotoAnalysis, WinteringPhotoAnalysis } from '../../ai/HealthPhotoAIProvider';
import type { FieldInputState } from '../records/recordTypesConfig';
import { hornetCountBucket } from './hornetRisk';
import type { MiteMethod } from './miteRisk';

// 사진 AI 판독 결과를 수동 입력·음성과 "같은 필드"에 채울 초안으로 바꾼다. 결과는
// 폼에 그대로 채워지고(AI 추정 표시), 사용자가 확인·수정한 값이 저장된다 — AI가 처음
// 제안한 값은 record_field_values.ai_draft_*에 따로 남는다.
//
// 반환값에 들어 있지 않은 필드는 AI가 판단하지 못한 것이므로 미입력으로 둔다.

export function miteDraftFromPhoto(analysis: MitePhotoAnalysis, method: MiteMethod): FieldInputState {
  return {
    values: {
      mite_infestation: analysis.estimatedCount > 0 ? 'tested_positive' : 'tested_negative',
      mite_method: method,
    },
    numbers: { mite_count: analysis.estimatedCount },
    texts: {},
  };
}

export function hornetDraftFromPhoto(analysis: HornetPhotoAnalysis): FieldInputState {
  if (analysis.estimatedCount <= 0) {
    return { values: { wasp_observed: 'absent' }, numbers: {}, texts: {} };
  }
  return {
    values: {
      wasp_observed: 'present',
      wasp_species: analysis.species,
      wasp_count: hornetCountBucket(analysis.estimatedCount),
    },
    numbers: { wasp_count_number: analysis.estimatedCount },
    texts: {},
  };
}

export function winteringDraftFromPhoto(analysis: WinteringPhotoAnalysis): FieldInputState {
  const values: Record<string, string> = {};
  if (analysis.strength !== 'unknown') values.colony_strength = analysis.strength;
  if (analysis.food !== 'unknown') values.feed_status = analysis.food;
  return { values, numbers: {}, texts: {} };
}
