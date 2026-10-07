import { RecordType } from '../db/schema';
import { invokeEdgeFunction } from '../supabase/edgeFunctionClient';
import { ColonyRef, InspectionAIProvider, StructuredRecordDraft, StructuringResult } from './InspectionAIProvider';

type RawResult = {
  drafts?: Partial<StructuredRecordDraft>[];
  notes?: string | null;
  confidenceScore?: number;
  colonyId?: string | null;
};

// 전사문 구조화(+ 언급된 봉군 매칭)를 Supabase Edge Function(structure-inspection)에
// 위임한다. Gemini API 키는 클라이언트에 절대 두지 않고 Edge Function 환경변수로만
// 보관한다.
export class GeminiInspectionAIProvider implements InspectionAIProvider {
  async structureInspection(transcript: string, context?: { colonies: ColonyRef[] }): Promise<StructuringResult> {
    const result = await invokeEdgeFunction<RawResult>('structure-inspection', {
      transcript,
      colonies: context?.colonies ?? [],
    });
    if (!Array.isArray(result?.drafts)) throw new Error('AI가 구조화 결과를 반환하지 않았습니다.');

    return {
      drafts: result.drafts.map((d) => ({
        recordType: d.recordType as RecordType,
        values: d.values ?? {},
        numberValues: d.numberValues ?? {},
        textValues: d.textValues ?? {},
      })),
      notes: result.notes ?? null,
      confidenceScore: result.confidenceScore ?? 0,
      colonyId: result.colonyId ?? null,
    };
  }
}
