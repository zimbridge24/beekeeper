// 말한 내용에서 "아직 등록하지 않은 봉군 번호"를 찾는다 — 검토 화면의 봉군 선택 단계에서
// "N번 봉군을 새로 만들까요?"를 제안하는 데 쓴다. AI 판정이 아니라 문자열 규칙이라 사용자가 항상
// 확인하고 누르게 하고, 흔한 오탐("응애 3번 검사")을 피하려고 아래 두 모양만 인정한다:
//   · "12번 봉군 / 12번 통 / 12번 벌통"처럼 번호 뒤에 봉군을 가리키는 말이 붙은 경우
//   · 문장 맨 앞의 "12번 …"
const WITH_NOUN = /(\d{1,4})\s*번\s*(?:봉군|벌통|통)/g;
const AT_START = /^\s*(\d{1,4})\s*번/;

function isRegistered(aliases: string[], n: number): boolean {
  // "112번 봉군"이 "12번"으로 잘못 걸리지 않게 앞이 숫자가 아닌 경우만 같은 번호로 본다.
  const pattern = new RegExp(`(^|\\D)${n}\\s*번`);
  return aliases.some((alias) => pattern.test(alias));
}

export function findUnregisteredColonyNumber(transcript: string, aliases: string[]): number | null {
  const candidates: number[] = [];

  const start = AT_START.exec(transcript);
  if (start) candidates.push(Number(start[1]));
  for (const m of transcript.matchAll(WITH_NOUN)) candidates.push(Number(m[1]));

  for (const n of candidates) {
    if (n >= 1 && !isRegistered(aliases, n)) return n;
  }
  return null;
}
