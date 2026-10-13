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

// 추이 그래프에서 같은 날 기록을 한 점으로 묶는 키 (벽시계 날짜 기준).
export function dayKey(at: number, tz?: number): string {
  const w = wallClock(at, tz);
  return `${w.year}-${w.month}-${w.day}`;
}

export type AnomalyDay = {
  // 그날 특이점이 기록된 가장 늦은 시각.
  at: number;
  // 무엇이 특이했는지 (중복 없이): 이상 징후 · 응애 주의/높음 · 말벌 · 여왕벌 없음.
  labels: string[];
};

const RISK_WORD: Record<string, string> = { low: '관찰', caution: '주의', high: '높음' };

// 봉군에서 "특이점이 있었던 날". 기록된 값에서만 뽑는다 — 새 판정은 없다:
//   · 빠른 내검에서 이상 징후를 "있음"으로 고른 기록
//   · 응애 검사에서 위험단계가 주의 이상(기준표·계산은 알림과 같다)
//   · 말벌을 봤거나 피해가 기록된 날
//   · 여왕벌을 "없음"으로 기록한 날
export function buildAnomalyDays(
  source: HealthSource,
  colonyId: string,
  period: TrendPeriod,
  abnormalSigns: { colonyId: string; at: number }[],
): AnomalyDay[] {
  const series = extractColonySeries(source, colonyId);
  const days = TREND_PERIOD_DAYS[period];
  const since = days === null ? -Infinity : source.now - days * DAY_MS;

  const flagged: { at: number; label: string }[] = [];
  for (const a of abnormalSigns) if (a.colonyId === colonyId) flagged.push({ at: a.at, label: '이상 징후' });
  for (const m of series.miteChecks) {
    if (m.riskLevel === 'caution' || m.riskLevel === 'high') flagged.push({ at: m.at, label: `응애 ${RISK_WORD[m.riskLevel]}` });
  }
  for (const h of series.hornetEvents) flagged.push({ at: h.at, label: `말벌 ${RISK_WORD[h.riskLevel] ?? '관찰'}` });
  for (const q of series.queen) if (!q.present) flagged.push({ at: q.at, label: '여왕벌 없음' });

  const byDay = new Map<string, AnomalyDay>();
  for (const f of flagged) {
    if (f.at < since) continue;
    const key = dayKey(f.at, source.tz);
    const day = byDay.get(key);
    if (!day) byDay.set(key, { at: f.at, labels: [f.label] });
    else {
      day.at = Math.max(day.at, f.at);
      if (!day.labels.includes(f.label)) day.labels.push(f.label);
    }
  }
  return [...byDay.values()].sort((a, b) => a.at - b.at);
}
