import { RecordType } from '../db/schema';
import { FieldValueState } from '../repositories/recordRepository';

export type ColonyRef = { id: string; label: string };

export type StructuringResult = {
  recordType: RecordType;
  values: Record<string, FieldValueState>;
  notes: string | null;
  confidenceScore: number;
  // 전사문에서 언급된 봉군과 매칭된 id. context.colonies를 넘기지 않았거나,
  // 어느 봉군인지 확신할 수 없으면 null.
  colonyId: string | null;
};

export interface InspectionAIProvider {
  structureInspection(transcript: string, context?: { colonies: ColonyRef[] }): Promise<StructuringResult>;
}

// 업체 계약 확정 전이나 자격증명이 없는 환경에서도 화면을 검증할 수 있도록 두는
// mock. transcript 텍스트를 실제로 분석하지 않고 항상 같은 구조화 결과와 중간
// 정도의 확신도(검토 필요 배지가 뜨는 수준)를 돌려준다.
export class MockInspectionAIProvider implements InspectionAIProvider {
  async structureInspection(transcript: string, context?: { colonies: ColonyRef[] }): Promise<StructuringResult> {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return {
      recordType: 'general_observation',
      values: {
        queen_status: 'present',
        colony_strength: 'present',
        feed_status: 'present',
        abnormal_signs: 'absent',
      },
      notes: transcript,
      confidenceScore: 0.74,
      colonyId: context?.colonies?.[0]?.id ?? null,
    };
  }
}
