import { RecordType } from '../db/schema';

export type ColonyRef = { id: string; label: string };

// 한 기록 유형(영역)에 대해 AI가 구조화한 값. 칩 값/숫자/텍스트를 필드 키로 따로
// 들고 있고, 수동 입력 폼의 FieldInputState와 같은 모양이라 그대로 폼에 채울 수 있다.
export type StructuredRecordDraft = {
  recordType: RecordType;
  values: Record<string, string>;
  numberValues: Record<string, number>;
  textValues: Record<string, string>;
};

export type StructuringResult = {
  // 한 번의 발화에서 찾아낸 영역별 초안. 말하지 않은 필드는 들어 있지 않다(미입력).
  drafts: StructuredRecordDraft[];
  // 어떤 필드에도 담기지 않은 내용만.
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
      drafts: [
        {
          recordType: 'general_observation',
          values: { queen_status: 'present', colony_strength: 'normal' },
          numberValues: {},
          textValues: {},
        },
        {
          recordType: 'hornet',
          values: { wasp_observed: 'present', wasp_species: 'asian_hornet', wasp_count: 'few_1_5' },
          numberValues: { wasp_count_number: 3 },
          textValues: {},
        },
      ],
      notes: transcript,
      confidenceScore: 0.74,
      colonyId: context?.colonies?.[0]?.id ?? null,
    };
  }
}
