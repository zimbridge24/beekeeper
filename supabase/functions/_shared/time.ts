// AUTO-GENERATED — 직접 수정하지 마세요.
// 원본: src/features/health/time.ts  (npm run sync:ai-catalog 로 갱신)

export const DAY_MS = 86_400_000;

// 날짜·월·시각 계산에 쓰는 시간대. 분 단위 UTC 오프셋(Asia/Seoul = 540)이고, 생략하면
// 이 코드가 도는 기기의 로컬 시간대를 쓴다. 앱 화면은 생략(기기 시간대)하고, 서버(UTC)에서
// 알림 규칙을 돌릴 때는 사용자 시간대(기본 Asia/Seoul)를 명시해서 "오전 9시", "9월 15일"이
// 사용자 기준으로 계산되게 한다. 서머타임이 있는 시간대는 서버가 날짜마다 오프셋을 구해 넘긴다.
export type TzOffsetMin = number | undefined;

export function wallClock(ts: number, tz?: TzOffsetMin): { year: number; month: number; day: number; hour: number } {
  if (tz === undefined) {
    const d = new Date(ts);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours() };
  }
  const d = new Date(ts + tz * 60_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours() };
}

// 해당 시간대의 벽시계 시각(year-month-day hour:00)을 epoch ms로. day가 월말을 넘어가도 정규화된다.
export function wallToTs(year: number, month: number, day: number, hour: number, tz?: TzOffsetMin): number {
  if (tz === undefined) return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
  return Date.UTC(year, month - 1, day, hour, 0, 0, 0) - tz * 60_000;
}

export function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY_MS);
}

export function formatMonthDay(ts: number, tz?: TzOffsetMin): string {
  const w = wallClock(ts, tz);
  return `${w.month}월 ${w.day}일`;
}

// 응애 검사/방제가 실제로 의미 있는 활동기 (3~11월). 한겨울에는 "검사 안 한 지
// N일" 같은 독촉을 하지 않는다.
export function isActiveBeekeepingSeason(now: number, tz?: TzOffsetMin): boolean {
  const month = wallClock(now, tz).month;
  return month >= 3 && month <= 11;
}

// 정부가 정한 꿀벌응애 집중 방제 기간 (6~10월). 이 기간에는 달마다 한 번 시즌 알림을 보낸다.
export const TREATMENT_SEASON_MONTHS = { from: 6, to: 10 };

export function isTreatmentSeason(now: number, tz?: TzOffsetMin): boolean {
  const month = wallClock(now, tz).month;
  return month >= TREATMENT_SEASON_MONTHS.from && month <= TREATMENT_SEASON_MONTHS.to;
}

// 월동 준비 점검을 권하는 시기 (9월 중순 ~ 11월). 한국 양봉은 보통 이 무렵
// 마지막 방제 · 먹이 보충 · 합봉을 마무리한다.
export function isWinteringPrepSeason(now: number, tz?: TzOffsetMin): boolean {
  const { month, day } = wallClock(now, tz);
  return (month === 9 && day >= 15) || month === 10 || month === 11;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// 달력 기준 단순 구분 (봄 3~5 · 여름 6~8 · 가을 9~11 · 겨울 12~2). 계절별 응애 기준이
// 검증돼서 추가될 때 쓰는 입력이다 — 지금 들어 있는 기준은 계절을 구분하지 않는다.
export function seasonOf(ts: number, tz?: TzOffsetMin): Season {
  const month = wallClock(ts, tz).month;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}
