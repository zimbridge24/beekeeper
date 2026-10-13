type Row = {
  colony: { id: string; internalCode: string };
  visitColony: { status: string } | null;
};

// internalCode는 문자열이라 DB 정렬로는 "10"이 "2"보다 앞에 온다 — 봉군 번호 순서는 숫자로 비교한다.
function byNumber(a: Row, b: Row): number {
  const na = Number(a.colony.internalCode);
  const nb = Number(b.colony.internalCode);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.colony.internalCode.localeCompare(b.colony.internalCode);
}

// "다음도 음성으로 기록하기"가 열어 줄 봉군: 이번 방문에서 아직 안 한 봉군 중, 방금 기록한 봉군의 다음
// 번호부터 순서대로 찾고 끝까지 없으면 처음으로 돌아간다. 전부 끝났으면 null.
export function pickNextColony<T extends Row>(rows: T[], justSavedColonyId?: string): T | null {
  const sorted = [...rows].sort(byNumber);
  const candidates = sorted.filter((r) => r.visitColony?.status !== 'done' && r.colony.id !== justSavedColonyId);
  if (candidates.length === 0) return null;

  const savedIndex = sorted.findIndex((r) => r.colony.id === justSavedColonyId);
  if (savedIndex >= 0) {
    const after = candidates.find((r) => sorted.indexOf(r) > savedIndex);
    if (after) return after;
  }
  return candidates[0];
}
