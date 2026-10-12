import { invokeEdgeFunction } from '../supabase/edgeFunctionClient';
import { cleanKeywords, type QueryIntent, type RecordQuery, type YearFilter } from '../features/search/recordSearch';

type RawQuery = {
  intent: QueryIntent;
  year: YearFilter;
  ingredient: string | null;
  keywords: string[];
  colonyAlias: string | null;
};

// 사용자의 질문 문장을 검색 조건(RecordQuery)으로 바꾼다. 서버(Edge Function → Gemini)에는 질문
// 문장과 봉군 이름 목록만 보낸다 — 기록 내용은 기기 밖으로 나가지 않고, 실제 검색은 항상
// 기기 안에서 이 조건으로 한다. AI는 질문에 "답하지" 않는다. 실패하면(오프라인·함수 미배포 등)
// 호출한 쪽이 규칙 기반 해석으로 대신한다.
export async function parseRecordQueryWithAI(
  question: string,
  colonies: { id: string; alias: string }[],
): Promise<RecordQuery> {
  const raw = await invokeEdgeFunction<RawQuery>('parse-record-query', {
    question,
    colonies: colonies.map((c) => c.alias),
  });
  const colonyId = raw.colonyAlias ? (colonies.find((c) => c.alias === raw.colonyAlias)?.id ?? null) : null;
  return {
    intent: raw.intent,
    year: raw.year,
    ingredient: raw.ingredient,
    keywords: Array.isArray(raw.keywords) ? cleanKeywords(raw.keywords) : [],
    colonyId,
  };
}
