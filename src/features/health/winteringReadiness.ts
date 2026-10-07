import { STRENGTH_LABEL, WinteringFacts } from './facts';
import { daysBetween } from './time';

// 월동 점검 체크리스트 — 점수 대신 항목별로 "충족 / 보완하면 좋음 / 정보 없음"만 보여준다.
// 예전 100점 점수는 항목별 배점에 근거가 없었고 "73점" 같은 숫자가 정확해 보이는 착각을 줘서
// 없앴다. 각 항목은 현재 기록에서 읽은 사실과 그 근거 문장만 갖는다.
export type ChecklistStatus = 'ok' | 'improve' | 'unknown';

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  ok: '충족',
  improve: '보완하면 좋음',
  unknown: '정보 없음',
};

// 사용자가 이 항목을 확인·개선하려면 어디로 가야 하는지.
export type ChecklistAction = 'record_mite' | 'record_wintering' | 'record_hornet' | 'none';

export type ChecklistItem = {
  key: 'strength' | 'food' | 'mite' | 'queen' | 'trend' | 'hive' | 'hornet';
  label: string;
  // "가장 먼저 확인할 것: ○○"에 들어가는 짧은 할 일 이름.
  todo: string;
  status: ChecklistStatus;
  message: string;
  action: ChecklistAction;
};

export type WinteringChecklist = {
  items: ChecklistItem[];
  okCount: number;
  improveCount: number;
  unknownCount: number;
  // 가장 먼저 손볼 것 (보완 > 정보 없음 순). 없으면 null.
  firstAction: ChecklistItem | null;
};

// 오래된 기록은 아무리 좋아도 '충족'으로 보지 않는다 — 지금 상태라고 보장할 수 없어서.
export const STALE_DAYS = 45;

type ItemBase = Pick<ChecklistItem, 'key' | 'label' | 'todo' | 'action'>;

const item = (base: ItemBase, status: ChecklistStatus, message: string): ChecklistItem => ({ ...base, status, message });

const ageNote = (ageDays: number) => (ageDays > STALE_DAYS ? ` · ${ageDays}일 전 기록이라 다시 확인하면 좋아요` : '');

// 최근 기록이 아니면 '충족'을 '보완하면 좋음'으로 낮춘다.
const withStale = (status: ChecklistStatus, ageDays: number): ChecklistStatus => (status === 'ok' && ageDays > STALE_DAYS ? 'improve' : status);

export function computeWinteringChecklist(facts: WinteringFacts): WinteringChecklist {
  const { now } = facts;
  const items: ChecklistItem[] = [];

  // 봉군 세력
  {
    const base: ItemBase = { key: 'strength', label: '봉군 세력', todo: '봉세 확인', action: 'record_wintering' };
    if (!facts.strength) {
      items.push(item(base, 'unknown', '봉세 기록이 없어요'));
    } else {
      const age = daysBetween(facts.strength.at, now);
      const rank = facts.strength.rank;
      const status = withStale(rank === 1 ? 'improve' : 'ok', age);
      items.push(item(base, status, `봉세 ${STRENGTH_LABEL[rank]}${rank === 1 ? ' · 월동 중 소모될 수 있어요' : ''}${ageNote(age)}`));
    }
  }

  // 먹이 저장
  {
    const base: ItemBase = { key: 'food', label: '먹이 저장량', todo: '먹이 저장량 확인', action: 'record_wintering' };
    if (!facts.food) {
      items.push(item(base, 'unknown', '먹이 저장 기록이 없어요'));
    } else {
      const age = daysBetween(facts.food.at, now);
      const rank = facts.food.rank;
      const status = withStale(rank === 3 ? 'ok' : 'improve', age);
      const label = rank === 3 ? '먹이 충분' : rank === 2 ? '먹이 보통 · 보충을 고려해 보세요' : '먹이 부족 · 보충을 고려해 보세요';
      items.push(item(base, status, `${label}${ageNote(age)}`));
    }
  }

  // 응애
  {
    const base: ItemBase = { key: 'mite', label: '응애', todo: '응애 검사', action: 'record_mite' };
    if (!facts.mite) {
      items.push(item(base, 'unknown', '응애 검사 기록이 없어요'));
    } else {
      const age = daysBetween(facts.mite.at, now);
      if (age > STALE_DAYS) {
        items.push(item(base, 'improve', `마지막 응애 검사가 ${age}일 전이라 월동 전에 다시 확인하면 좋아요`));
      } else if (facts.mite.riskLevel === 'high' || facts.mite.riskLevel === 'caution') {
        items.push(item(base, 'improve', `응애 수치가 참고 기준 ${facts.mite.riskLevel === 'high' ? '보다 높게' : '에 가깝게'} 나타났어요 · ${age}일 전 검사`));
      } else {
        items.push(item(base, 'ok', `응애 수치가 참고 기준보다 낮아요 · ${age}일 전 검사`));
      }
    }
  }

  // 여왕
  {
    const base: ItemBase = { key: 'queen', label: '여왕 상태', todo: '여왕 확인', action: 'record_wintering' };
    if (!facts.queen) {
      items.push(item(base, 'unknown', '여왕벌 기록이 없어요'));
    } else if (!facts.queen.present) {
      items.push(item(base, 'improve', '여왕벌이 확인되지 않았다고 기록돼 있어요'));
    } else {
      const age = daysBetween(facts.queen.at, now);
      items.push(item(base, withStale('ok', age), `여왕 확인됨${ageNote(age)}`));
    }
  }

  // 최근 봉세 변화
  {
    const base: ItemBase = { key: 'trend', label: '최근 봉세 변화', todo: '봉세 변화 확인', action: 'record_wintering' };
    const history = facts.strengthHistory.slice(-3).map((p) => p.rank);
    if (history.length < 2) {
      items.push(item(base, 'unknown', '봉세 변화를 보려면 내검 기록이 2회 이상 필요해요'));
    } else {
      const nonIncreasing = history.every((v, i) => i === 0 || v <= history[i - 1]);
      const net = history[history.length - 1] - history[0];
      const lastDown = history[history.length - 1] < history[history.length - 2];
      if (history.length >= 3 && nonIncreasing && net < 0) items.push(item(base, 'improve', `최근 ${history.length}회 내검에서 봉세가 계속 줄었어요`));
      else if (lastDown) items.push(item(base, 'improve', '직전 내검보다 봉세가 줄었어요'));
      else items.push(item(base, 'ok', '봉세 유지 또는 증가'));
    }
  }

  // 보온·벌통 상태
  {
    const base: ItemBase = { key: 'hive', label: '보온·벌통 상태', todo: '보온 준비 점검', action: 'record_wintering' };
    const ins = facts.insulation?.value ?? null;
    const hive = facts.hiveCondition?.value ?? null;
    if (!ins && !hive) {
      items.push(item(base, 'unknown', '보온·벌통 점검 기록이 없어요'));
    } else if (ins === 'done' && hive === 'good') {
      items.push(item(base, 'ok', '보온 완료 · 벌통 양호'));
    } else {
      const parts = [
        ins ? `보온 ${ins === 'done' ? '완료' : ins === 'partial' ? '일부 완료' : '미완료'}` : '보온 미확인',
        hive ? `벌통 ${hive === 'good' ? '양호' : '확인 필요'}` : '벌통 미확인',
      ];
      // 한쪽만 확인한 상태에서 확인된 쪽이 문제없다면 '정보 없음'이 아니라 '보완하면 좋음'(나머지 확인)으로 본다.
      items.push(item(base, 'improve', parts.join(' · ')));
    }
  }

  // 말벌 피해 — 기록이 없으면 "피해 없음"으로 본다.
  {
    const base: ItemBase = { key: 'hornet', label: '말벌 피해', todo: '말벌 대응', action: 'record_hornet' };
    if (!facts.hornetTrouble) {
      items.push(item(base, 'ok', '최근 말벌 피해 기록 없음'));
    } else {
      const age = daysBetween(facts.hornetTrouble.at, now);
      items.push(item(base, 'improve', `${age}일 전 말벌이 ${facts.hornetTrouble.riskLevel === 'high' ? '참고 기준으로 높은 수준으로 ' : ''}관찰됐어요`));
    }
  }

  // 가장 먼저 손볼 것: 보완 > 정보 없음, 같은 단계에서는 목록 순서(봉세·먹이·응애…)대로.
  const order: Record<ChecklistStatus, number> = { improve: 0, unknown: 1, ok: 99 };
  const firstAction = [...items].filter((i) => i.status !== 'ok').sort((a, b) => order[a.status] - order[b.status])[0] ?? null;

  return {
    items,
    okCount: items.filter((i) => i.status === 'ok').length,
    improveCount: items.filter((i) => i.status === 'improve').length,
    unknownCount: items.filter((i) => i.status === 'unknown').length,
    firstAction,
  };
}
