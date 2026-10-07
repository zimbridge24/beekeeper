import { STRENGTH_LABEL, WinteringFacts } from './facts';
import { daysBetween } from './time';

export type ReadinessStatus = 'good' | 'warn' | 'bad' | 'unknown';

// 사용자가 이 항목을 개선하려면 어디로 가야 하는지.
export type ReadinessAction = 'record_mite' | 'record_wintering' | 'record_hornet' | 'none';

export type ReadinessItem = {
  key: 'strength' | 'food' | 'mite' | 'queen' | 'trend' | 'hive' | 'hornet';
  label: string;
  // "가장 먼저 확인할 것: ○○"에 들어가는 짧은 할 일 이름.
  todo: string;
  weight: number;
  earned: number;
  status: ReadinessStatus;
  message: string;
  action: ReadinessAction;
};

export type ReadinessBand = 'good' | 'fair' | 'poor' | 'insufficient';

export type WinteringReadiness = {
  score: number;
  band: ReadinessBand;
  bandLabel: string;
  items: ReadinessItem[];
  // 점수 계산에 쓸 실제 근거가 있는 항목 수 (말벌처럼 "기록 없음 = 문제 없음"인
  // 항목은 제외).
  knownCount: number;
  knownTotal: number;
  firstAction: ReadinessItem | null;
};

// 오래된 기록은 아무리 좋아도 'good'을 줄 수 없다 — 지금 상태라고 보장할 수 없어서.
export const STALE_DAYS = 45;

type ItemBase = Pick<ReadinessItem, 'key' | 'label' | 'todo' | 'weight' | 'action'>;

function makeItem(base: ItemBase, status: ReadinessStatus, fraction: number, message: string): ReadinessItem {
  return { ...base, status, message, earned: Math.round(base.weight * fraction * 10) / 10 };
}

// 최근 기록이 아니면 좋은 평가를 한 단계 낮춘다.
function applyStale(status: ReadinessStatus, fraction: number, ageDays: number): { status: ReadinessStatus; fraction: number } {
  if (ageDays > STALE_DAYS && status === 'good') return { status: 'warn', fraction: Math.min(fraction, 0.5) };
  return { status, fraction };
}

const ageNote = (ageDays: number) => (ageDays > STALE_DAYS ? ` · ${ageDays}일 전 기록` : '');

export function computeWinteringReadiness(facts: WinteringFacts): WinteringReadiness {
  const { now } = facts;
  const items: ReadinessItem[] = [];

  // 봉군 세력 (25)
  {
    const base: ItemBase = { key: 'strength', label: '봉군 세력', todo: '봉세 확인', weight: 25, action: 'record_wintering' };
    if (!facts.strength) {
      items.push(makeItem(base, 'unknown', 0, '봉세 기록이 없어요'));
    } else {
      const age = daysBetween(facts.strength.at, now);
      const rank = facts.strength.rank;
      const raw = rank === 3 ? { s: 'good' as const, f: 1 } : rank === 2 ? { s: 'good' as const, f: 0.75 } : { s: 'bad' as const, f: 0.15 };
      const { status, fraction } = applyStale(raw.s, raw.f, age);
      const note = rank === 1 ? ' · 월동 중 소모될 수 있어요' : '';
      items.push(makeItem(base, status, fraction, `봉세 ${STRENGTH_LABEL[rank]}${note}${ageNote(age)}`));
    }
  }

  // 먹이 저장 (25)
  {
    const base: ItemBase = { key: 'food', label: '먹이 저장량', todo: '먹이 저장량 확인', weight: 25, action: 'record_wintering' };
    if (!facts.food) {
      items.push(makeItem(base, 'unknown', 0, '먹이 저장 기록이 없어요'));
    } else {
      const age = daysBetween(facts.food.at, now);
      const rank = facts.food.rank;
      const raw = rank === 3 ? { s: 'good' as const, f: 1 } : rank === 2 ? { s: 'warn' as const, f: 0.6 } : { s: 'bad' as const, f: 0.1 };
      const { status, fraction } = applyStale(raw.s, raw.f, age);
      const label = rank === 3 ? '먹이 충분' : rank === 2 ? '먹이 보통 · 보충을 고려해 보세요' : '먹이 부족';
      items.push(makeItem(base, status, fraction, `${label}${ageNote(age)}`));
    }
  }

  // 응애 위험 (15)
  {
    const base: ItemBase = { key: 'mite', label: '응애 위험', todo: '응애 검사', weight: 15, action: 'record_mite' };
    if (!facts.mite) {
      items.push(makeItem(base, 'unknown', 0, '응애 검사 기록이 없어요'));
    } else {
      const age = daysBetween(facts.mite.at, now);
      if (age > STALE_DAYS) {
        items.push(makeItem(base, 'warn', 0.5, `최근 응애 검사 ${age}일 경과`));
      } else if (facts.mite.riskLevel === 'high') {
        items.push(makeItem(base, 'bad', 0.1, `응애 수치가 참고 기준보다 높게 나타났어요 · ${age}일 전 검사`));
      } else if (facts.mite.riskLevel === 'caution') {
        items.push(makeItem(base, 'warn', 0.5, `응애 수치가 참고 기준에 가까워요 · ${age}일 전 검사`));
      } else {
        items.push(makeItem(base, 'good', 1, `응애 수치가 참고 기준보다 낮아요 · ${age}일 전 검사`));
      }
    }
  }

  // 여왕·산란 (10)
  {
    const base: ItemBase = { key: 'queen', label: '여왕 상태', todo: '여왕 확인', weight: 10, action: 'record_wintering' };
    if (!facts.queen) {
      items.push(makeItem(base, 'unknown', 0, '여왕벌 기록이 없어요'));
    } else if (!facts.queen.present) {
      items.push(makeItem(base, 'bad', 0, '여왕벌이 확인되지 않았다고 기록돼 있어요'));
    } else {
      const age = daysBetween(facts.queen.at, now);
      const { status, fraction } = applyStale('good', 1, age);
      items.push(makeItem(base, status, fraction, `여왕 확인됨${ageNote(age)}`));
    }
  }

  // 최근 봉세 변화 (10)
  {
    const base: ItemBase = { key: 'trend', label: '최근 봉세 변화', todo: '봉세 변화 확인', weight: 10, action: 'record_wintering' };
    const history = facts.strengthHistory.slice(-3).map((p) => p.rank);
    if (history.length < 2) {
      items.push(makeItem(base, 'unknown', 0, '봉세 변화를 보려면 내검 기록이 2회 이상 필요해요'));
    } else {
      const nonIncreasing = history.every((v, i) => i === 0 || v <= history[i - 1]);
      const net = history[history.length - 1] - history[0];
      const lastDown = history[history.length - 1] < history[history.length - 2];
      if (history.length >= 3 && nonIncreasing && net < 0) {
        items.push(makeItem(base, 'bad', 0.1, `최근 ${history.length}회 내검에서 봉세 계속 감소`));
      } else if (lastDown) {
        items.push(makeItem(base, 'warn', 0.5, '직전 내검보다 봉세 감소'));
      } else {
        items.push(makeItem(base, 'good', 1, '봉세 유지 또는 증가'));
      }
    }
  }

  // 보온·벌통 상태 (10) = 보온 준비 6 + 환기·벌통 4
  {
    const base: ItemBase = { key: 'hive', label: '보온·벌통 상태', todo: '보온 준비 점검', weight: 10, action: 'record_wintering' };
    const ins = facts.insulation?.value ?? null;
    const hive = facts.hiveCondition?.value ?? null;
    if (!ins && !hive) {
      items.push(makeItem(base, 'unknown', 0, '보온·벌통 점검 기록이 없어요'));
    } else {
      const insPoints = ins === 'done' ? 6 : ins === 'partial' ? 3 : 0;
      const hivePoints = hive === 'good' ? 4 : hive === 'needs_check' ? 1.5 : 0;
      const total = insPoints + hivePoints;
      const status: ReadinessStatus = total >= 9 ? 'good' : total >= 5 ? 'warn' : 'bad';
      const parts = [
        ins ? `보온 ${ins === 'done' ? '완료' : ins === 'partial' ? '일부 완료' : '미완료'}` : '보온 미확인',
        hive ? `벌통 ${hive === 'good' ? '양호' : '확인 필요'}` : '벌통 미확인',
      ];
      items.push(makeItem(base, status, total / 10, status === 'good' ? '보온·벌통 상태 양호' : parts.join(' · ')));
    }
  }

  // 말벌 피해 (5) — 기록이 없으면 "피해 없음"으로 본다.
  {
    const base: ItemBase = { key: 'hornet', label: '말벌 피해', todo: '말벌 대응', weight: 5, action: 'record_hornet' };
    if (!facts.hornetTrouble) {
      items.push(makeItem(base, 'good', 1, '최근 말벌 피해 기록 없음'));
    } else {
      const age = daysBetween(facts.hornetTrouble.at, now);
      const high = facts.hornetTrouble.riskLevel === 'high';
      items.push(makeItem(base, high ? 'bad' : 'warn', high ? 0 : 0.5, `${age}일 전 말벌이 ${high ? '참고 기준으로 높은 수준' : ''} 관찰됐어요`));
    }
  }

  const score = Math.round(items.reduce((sum, i) => sum + i.earned, 0));
  const coreItems = items.filter((i) => i.key !== 'hornet');
  const knownCount = coreItems.filter((i) => i.status !== 'unknown').length;

  let band: ReadinessBand;
  let bandLabel: string;
  if (knownCount < 3) {
    band = 'insufficient';
    bandLabel = '정보 부족';
  } else if (score >= 80) {
    band = 'good';
    bandLabel = '양호';
  } else if (score >= 60) {
    band = 'fair';
    bandLabel = '보완 필요';
  } else {
    band = 'poor';
    bandLabel = '보완 많이 필요';
  }

  // 가장 먼저 손볼 것: 나쁜 것 > 모르는 것 > 애매한 것, 같은 단계에서는 배점이 큰 것부터.
  const severity: Record<ReadinessStatus, number> = { bad: 0, unknown: 1, warn: 2, good: 99 };
  const firstAction =
    [...items]
      .filter((i) => i.status !== 'good')
      .sort((a, b) => severity[a.status] - severity[b.status] || b.weight - a.weight)[0] ?? null;

  return { score, band, bandLabel, items, knownCount, knownTotal: coreItems.length, firstAction };
}
