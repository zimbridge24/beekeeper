import { extractColonySeries, HealthSource, LevelPoint, MiteCheckPoint } from './facts';
import { DAY_MS, wallClock } from './time';

// 리포트 화면이 읽는 집계. 새 저장소도, AI 판정도 없다 — 전부 기록된 값에서
// extractColonySeries가 뽑은 시계열을 그대로 정리해서 보여주기만 한다.

export const FOOD_LABEL: Record<number, string> = { 3: '충분', 2: '보통', 1: '부족' };

export type ColonyStatusRow = {
  colonyId: string;
  apiaryId: string;
  alias: string;
  // 이 봉군에 남은 가장 최근 기록 시각 (기록 종류와 상관없이). 없으면 null.
  lastRecordAt: number | null;
  // 각 항목은 "가장 최근에 기록한 값"과 그 시점이다 — 지금 상태를 확인한 값이 아닐 수 있다.
  strength: { at: number; rank: 1 | 2 | 3; trend: 'up' | 'down' | 'same' | null } | null;
  food: { at: number; rank: 1 | 2 | 3 } | null;
  queen: { at: number; present: boolean } | null;
  mite: MiteCheckPoint | null;
};

function last<T>(items: T[]): T | null {
  return items.length ? items[items.length - 1] : null;
}

export function buildColonyStatusRows(source: HealthSource): ColonyStatusRow[] {
  const lastRecordByColony = new Map<string, number>();
  for (const r of source.records) {
    const prev = lastRecordByColony.get(r.colonyId);
    if (prev === undefined || r.occurredAt > prev) lastRecordByColony.set(r.colonyId, r.occurredAt);
  }

  const rows = source.colonies.map((colony): ColonyStatusRow => {
    const series = extractColonySeries(source, colony.id);

    const lastStrength = last(series.strength);
    const prevStrength = series.strength.length >= 2 ? series.strength[series.strength.length - 2] : null;
    let trend: 'up' | 'down' | 'same' | null = null;
    if (lastStrength && prevStrength) {
      trend = lastStrength.rank > prevStrength.rank ? 'up' : lastStrength.rank < prevStrength.rank ? 'down' : 'same';
    }

    return {
      colonyId: colony.id,
      apiaryId: colony.apiaryId,
      alias: colony.alias,
      lastRecordAt: lastRecordByColony.get(colony.id) ?? null,
      strength: lastStrength ? { ...lastStrength, trend } : null,
      food: last(series.food),
      queen: last(series.queen),
      // 판정 불가는 "검사한 기록"으로 세지 않는다 — 알림 규칙과 같은 기준.
      mite: last(series.miteChecks.filter((m) => m.result !== 'indeterminate')),
    };
  });

  // 마지막 기록이 가장 오래된(또는 기록이 아예 없는) 봉군이 위로 온다.
  return rows.sort((a, b) => {
    const diff = (a.lastRecordAt ?? Number.MIN_SAFE_INTEGER) - (b.lastRecordAt ?? Number.MIN_SAFE_INTEGER);
    return diff !== 0 ? diff : a.alias.localeCompare(b.alias, 'ko');
  });
}

export type TrendPeriod = '3m' | '1y' | 'all';

export const TREND_PERIOD_DAYS: Record<TrendPeriod, number | null> = { '3m': 90, '1y': 365, all: null };

// 하루에 여러 번 기록해도 그래프에는 그날의 마지막 값 하나만 올린다 (같은 날 점이 겹쳐
// 보이는 걸 막는다).
export function buildStrengthTrend(source: HealthSource, colonyId: string, period: TrendPeriod): LevelPoint[] {
  const all = extractColonySeries(source, colonyId).strength;
  const days = TREND_PERIOD_DAYS[period];
  const since = days === null ? -Infinity : source.now - days * DAY_MS;

  const byDay = new Map<string, LevelPoint>();
  for (const p of all) {
    if (p.at < since) continue;
    const w = wallClock(p.at, source.tz);
    byDay.set(`${w.year}-${w.month}-${w.day}`, p);
  }
  return [...byDay.values()].sort((a, b) => a.at - b.at);
}
