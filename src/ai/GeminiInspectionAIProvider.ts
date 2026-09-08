import { RecordType } from '../db/schema';
import { invokeEdgeFunction } from '../supabase/edgeFunctionClient';
import { ColonyRef, InspectionAIProvider, StructuringResult } from './InspectionAIProvider';

// 전사문 구조화(+ 언급된 봉군 매칭)를 Supabase Edge Function(structure-inspection)에
// 위임한다. Gemini API 키는 클라이언트에 절대 두지 않고 Edge Function 환경변수로만
// 보관한다.
export class GeminiInspectionAIProvider implements InspectionAIProvider {
  async structureInspection(transcript: string, context?: { colonies: ColonyRef[] }): Promise<StructuringResult> {
    const result = await invokeEdgeFunction<StructuringResult>('structure-inspection', {
      transcript,
      colonies: context?.colonies ?? [],
    });
    if (!result?.recordType) throw new Error('AI가 구조화 결과를 반환하지 않았습니다.');

    return {
      recordType: result.recordType as RecordType,
      values: result.values ?? {},
      notes: result.notes ?? null,
      confidenceScore: result.confidenceScore ?? 0,
      colonyId: result.colonyId ?? null,
    };
  }
}
