// 이름칸에 "1~20", "1-20", "1번~20번", "1번 봉군~20번 봉군"처럼 범위를 쓴 경우를 알아본다.
// 이 모양은 봉군 이름으로 쓸 일이 거의 없고, 한 번에 여러 개를 만들려는 뜻이라서 일괄 등록으로 이어 준다.
const RANGE = /^(\d{1,4})\s*번?\s*(?:봉군)?\s*[~\-–—]\s*(\d{1,4})\s*번?\s*(?:봉군)?$/;

export function parseColonyRange(text: string): { start: number; end: number } | null {
  const m = RANGE.exec(text.trim());
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start < 1 || end < start) return null;
  return { start, end };
}
