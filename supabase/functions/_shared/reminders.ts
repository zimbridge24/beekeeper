// AUTO-GENERATED — 직접 수정하지 마세요.
// 원본: src/features/health/reminders.ts  (npm run sync:ai-catalog 로 갱신)

type RecordType = string;
import { MITE_OVERDUE_DAYS } from './ruleConstants.ts';
import { extractColonySeries, HealthSource, STRENGTH_LABEL } from './facts.ts';
import { DAY_MS, daysBetween, isActiveBeekeepingSeason, isTreatmentSeason, isWinteringPrepSeason, TzOffsetMin, wallClock, wallToTs } from './time.ts';

// 점검 알림 "규칙 엔진". 앱이 알아서 아무 때나 보내는 게 아니라, 기록이 아래 규칙을
// 충족할 때만 알림을 계획한다. 이 파일은 순수 함수라서(시계·OS 알림 API에 의존하지 않음)
// 같은 기록이면 항상 같은 계획이 나오고, 그대로 테스트할 수 있다. 실제 예약은
// reminderScheduler.ts가 이 계획을 OS에 등록한다.
//
//   mite            마지막 응애 검사 후 일정 기간(30일) 경과
//   post_treatment  방제 기록 후 7~14일 뒤에도 재검사 기록이 없음
//   wintering       가을(9~11월)에 월동 준비 팁을 한 번 안내하고, 월동 준비 시즌에 이번 시즌 점검 기록이 없으면 주 1회씩
//   trend           최근 3회 내검에서 봉세가 계속 감소
//   treatment_season 집중 방제 기간(6~10월)에 달마다 한 번 시즌 안내 — 기록 조건과 상관없이 보낸다

export type ReminderCategory = 'mite' | 'post_treatment' | 'wintering' | 'trend' | 'treatment_season';

export const REMINDER_CATEGORIES: { key: ReminderCategory; label: string; description: string }[] = [
  { key: 'mite', label: '응애', description: '마지막 응애 검사 후 시간이 많이 지났을 때' },
  { key: 'post_treatment', label: '방제 후 재검사', description: '방제 기록 후 7~14일이 지났는데 재검사가 없을 때' },
  { key: 'wintering', label: '월동', description: '가을철 월동 준비 팁 안내, 아직 월동 점검 기록이 없을 때' },
  { key: 'trend', label: '봉군 상태 변화', description: '최근 3회 내검에서 봉세가 계속 줄었을 때' },
  { key: 'treatment_season', label: '집중 방제 기간', description: '6~10월 응애 집중 방제 기간에 달마다 한 번 안내' },
];

export type ReminderSettings = {
  // null = 아직 한 번도 안 물어봄 / granted = 동의함 / declined = 동의 안 함(설정에서 나중에 켤 수 있음).
  consent: 'granted' | 'declined' | null;
  categories: Record<ReminderCategory, boolean>;
};

// 동의하기 전에는 아무 알림도 계획되지 않는다. 동의 후에도 알림은 규칙이 충족된 경우에만,
// 같은 조건당 한 번(월동은 주 1회), 오전 9시에만 간다.
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  consent: null,
  categories: { mite: true, post_treatment: true, wintering: true, trend: true, treatment_season: true },
};

// 앱 안에서 알림을 눌렀을 때 이동할 곳 — 알림이 단순 안내가 아니라 행동 진입점이 되게.
export type ReminderTarget =
  | { kind: 'record'; recordType: RecordType; colonyId: string; apiaryId: string }
  | { kind: 'pick_colony'; recordType: 'mite' }
  | { kind: 'colony'; colonyId: string }
  | { kind: 'colonies' }
  | { kind: 'wintering' }
  | { kind: 'wintering_tips' };

export type PlannedReminder = {
  // OS에 등록할 때 쓰는 알림 식별자.
  key: string;
  // 이 알림이 대표하는 조건들의 키 (여러 봉군을 한 알림으로 묶으면 여러 개). 같은 조건이면 항상
  // 같은 키라서, 이미 보낸 조건을 다시 보내지 않는 기준이 된다.
  memberKeys: string[];
  category: ReminderCategory;
  fireAt: number;
  title: string;
  body: string;
  target: ReminderTarget;
};

// key -> 예약된 발송 시각. fireAt이 지났으면 이미 보낸 것으로 보고 다시 계획하지 않는다.
export type ReminderState = Record<string, number>;

const SEND_HOUR = 9;
const NEW_COLONY_GRACE_DAYS = 14;
// 한참 지난 봉군(폐군·방치)에 영영 알리지 않도록 상한을 둔다.
const MITE_REMINDER_MAX_AGE_DAYS = 120;
// 방제 기록 후 7일부터 14일까지가 "재검사를 권하는 구간"이다.
const POST_TREATMENT_START_DAYS = 7;
const POST_TREATMENT_WINDOW_DAYS = 14;
// 월동 알림은 주 1회, 한 시즌에 최대 3번까지만 — 월동 시즌(약 11주) 내내 같은 말을 반복하지 않는다.
const WINTERING_MAX_PER_SEASON = 3;
const STRENGTH_TREND_WINDOW_DAYS = 60;

// 사용자 시간대(tz, 생략하면 기기 로컬)의 해당 날짜 오전 9시. dayOffset=1이면 다음 날.
function nineAm(ts: number, tz: TzOffsetMin, dayOffset = 0): number {
  const w = wallClock(ts, tz);
  return wallToTs(w.year, w.month, w.day + dayOffset, SEND_HOUR, tz);
}

// 지금 이후 가장 가까운 오전 9시.
export function nextSlot(now: number, tz?: TzOffsetMin): number {
  const today = nineAm(now, tz);
  return today > now ? today : nineAm(now, tz, 1);
}

// ts 이후(같은 날 포함) 가장 가까운 오전 9시.
function slotOnOrAfter(ts: number, tz: TzOffsetMin): number {
  const day9 = nineAm(ts, tz);
  return day9 >= ts ? day9 : nineAm(ts, tz, 1);
}

// "12번 봉군은 / 2번 봉군은 / 봉군A는" — 받침에 따라 은/는.
export function eunNeun(word: string): string {
  const last = word.trim().slice(-1);
  if (!last) return '은';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '는' : '은';
  if (/[0-9]/.test(last)) return '0136780'.includes(last) ? '은' : '는';
  return '은';
}

type Candidate = {
  key: string;
  category: ReminderCategory;
  fireAt: number;
  colonyId: string;
  apiaryId: string;
  alias: string;
  // 개별 알림 문구에 쓰는 값
  days?: number;
  levels?: string;
};

const dayKey = (ts: number, tz: TzOffsetMin) => {
  const w = wallClock(ts, tz);
  return `${w.year}-${w.month}-${w.day}`;
};

export function planReminders(
  source: HealthSource,
  settings: ReminderSettings,
  state: ReminderState = {},
  now: number = source.now,
): PlannedReminder[] {
  if (settings.consent !== 'granted') return [];
  const tz = source.tz;

  const alreadySent = (key: string) => state[key] !== undefined && state[key] <= now;
  const candidates: Candidate[] = [];
  const planned: PlannedReminder[] = [];

  for (const colony of source.colonies) {
    if (daysBetween(colony.createdAt, now) < NEW_COLONY_GRACE_DAYS) continue;
    const series = extractColonySeries(source, colony.id);
    const base = { colonyId: colony.id, apiaryId: colony.apiaryId, alias: colony.alias };
    const measured = series.miteChecks.filter((c) => c.result !== 'indeterminate');
    const lastMite = measured[measured.length - 1] ?? null;
    const lastTreatment = series.treatments[series.treatments.length - 1] ?? null;
    // 방제 뒤에 재검사가 필요한 상태면 "방제 후 재검사" 규칙이 담당한다 — 같은 말을 두 번 하지 않는다.
    const awaitingFollowup = lastTreatment !== null && !measured.some((c) => c.at > lastTreatment);

    // 응애 재검사: 마지막 검사 후 30일 경과
    if (settings.categories.mite && lastMite && !awaitingFollowup && daysBetween(lastMite.at, now) <= MITE_REMINDER_MAX_AGE_DAYS) {
      const due = lastMite.at + MITE_OVERDUE_DAYS * DAY_MS;
      const fireAt = Math.max(slotOnOrAfter(due, tz), nextSlot(now, tz));
      const key = `mite:${colony.id}:${lastMite.at}`;
      if (isActiveBeekeepingSeason(fireAt, tz) && !alreadySent(key)) {
        candidates.push({ ...base, key, category: 'mite', fireAt, days: daysBetween(lastMite.at, fireAt) });
      }
    }

    // 방제 후 재확인: 방제 기록 7~14일 뒤에도 재검사가 없을 때
    if (settings.categories.post_treatment && lastTreatment !== null && awaitingFollowup) {
      const due = lastTreatment + POST_TREATMENT_START_DAYS * DAY_MS;
      const fireAt = Math.max(slotOnOrAfter(due, tz), nextSlot(now, tz));
      const key = `post_treatment:${colony.id}:${lastTreatment}`;
      if (fireAt <= lastTreatment + (POST_TREATMENT_WINDOW_DAYS + 1) * DAY_MS && !alreadySent(key)) {
        candidates.push({ ...base, key, category: 'post_treatment', fireAt, days: daysBetween(lastTreatment, fireAt) });
      }
    }

    // 봉세 이상 추세: 최근 3회 봉세가 계속 감소
    const lastThree = series.strength.slice(-3);
    if (
      settings.categories.trend &&
      lastThree.length === 3 &&
      lastThree[2].rank <= lastThree[1].rank &&
      lastThree[1].rank <= lastThree[0].rank &&
      lastThree[2].rank < lastThree[0].rank &&
      now - lastThree[2].at <= STRENGTH_TREND_WINDOW_DAYS * DAY_MS
    ) {
      const key = `trend:${colony.id}:${lastThree[2].at}`;
      if (!alreadySent(key)) {
        candidates.push({
          ...base,
          key,
          category: 'trend',
          fireAt: nextSlot(now, tz),
          levels: lastThree.map((p) => STRENGTH_LABEL[p.rank]).join(' → '),
        });
      }
    }
  }

  // 같은 종류가 같은 날 여러 봉군에 해당하면 알림 하나로 묶는다 (봉군이 많아도 알림이 쏟아지지 않게).
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const k = `${c.category}|${dayKey(c.fireAt, tz)}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const rest = group.length - 1;
    const keys = group.map((g) => g.key);
    if (rest === 0) {
      planned.push({ ...individual(first), memberKeys: keys });
    } else {
      planned.push({ ...grouped(first, rest), key: `${first.category}:group:${dayKey(first.fireAt, tz)}`, memberKeys: keys });
    }
  }

  // 월동 준비 팁 안내: 9월 1일부터 11월까지, 이번 시즌 월동 점검 기록이 없는 봉군이 있으면 시즌에 한 번.
  // "월동 준비를 마치셨나요?" — 눌러서 앱에 들어오면 팁 화면이 열린다. 아래 주간 점검 알림의 첫 번째 몫이라,
  // 이 알림이 나가는 날에는 주간 점검 알림을 따로 보내지 않는다.
  let tipsPending = false;
  if (settings.categories.wintering) {
    const fireAt = nextSlot(now, tz);
    const fw = wallClock(fireAt, tz);
    if (fw.month >= 9 && fw.month <= 11) {
      const tipsSeasonStart = wallToTs(fw.year, 9, 1, 0, tz);
      const checkedTips = new Set(source.records.filter((r) => r.recordType === 'wintering_prep' && r.occurredAt >= tipsSeasonStart).map((r) => r.colonyId));
      const needsCheck = source.colonies.some((c) => daysBetween(c.createdAt, now) >= NEW_COLONY_GRACE_DAYS && !checkedTips.has(c.id));
      // 키에 "몇 번째 주"를 넣어 둔다 — 아래 주간 점검 알림이 이 주(와 그 이전)는 건너뛰게 해서, 팁 안내 바로 다음 날
      // 점검 알림이 또 가지 않게 한다.
      const key = `wintering_tips:${fw.year}:${Math.floor((fireAt - tipsSeasonStart) / (7 * DAY_MS))}`;
      const tipsAlreadySent = Object.keys(state).some((k) => k.startsWith(`wintering_tips:${fw.year}:`) && state[k] <= now);
      if (needsCheck && !tipsAlreadySent) {
        tipsPending = true;
        planned.push({
          key,
          memberKeys: [key],
          category: 'wintering',
          fireAt,
          title: '월동 준비를 마치셨나요?',
          body: '겨울을 나기 전에 확인하면 좋은 월동 준비 팁을 모았어요. 눌러서 확인해 보세요.',
          target: { kind: 'wintering_tips' },
        });
      }
    }
  }

  // 월동 점검: 시즌 중 이번 시즌 월동 준비 기록이 없는 봉군이 있으면 주 1회, 최대 3주치.
  if (settings.categories.wintering && !tipsPending && isWinteringPrepSeason(now, tz)) {
    const seasonYear = wallClock(now, tz).year;
    const seasonStartTs = wallToTs(seasonYear, 9, 1, 0, tz); // 9월 1일 0시
    const checked = new Set(source.records.filter((r) => r.recordType === 'wintering_prep' && r.occurredAt >= seasonStartTs).map((r) => r.colonyId));
    const missing = source.colonies.filter((c) => daysBetween(c.createdAt, now) >= NEW_COLONY_GRACE_DAYS && !checked.has(c.id));

    if (missing.length > 0) {
      // 이번 시즌에 이미 보낸 월동 알림(팁 안내 포함) 수를 빼고, 남은 횟수만큼만 계획한다.
      const sentThisSeason = Object.keys(state).filter(
        (k) => (k.startsWith(`wintering:${seasonYear}:`) || k.startsWith(`wintering_tips:${seasonYear}:`)) && state[k] <= now,
      ).length;
      // 팁 안내가 나간 주(와 그 이전 주)의 점검 알림은 건너뛴다.
      const tipsWeek = Math.max(-1, ...Object.keys(state).filter((k) => k.startsWith(`wintering_tips:${seasonYear}:`) && state[k] <= now).map((k) => Number(k.split(':')[2])));
      const remaining = WINTERING_MAX_PER_SEASON - sentThisSeason;
      let plannedWintering = 0;
      for (let week = 0; week < 12 && plannedWintering < remaining; week++) {
        const fireAt = nextSlot(now, tz) + week * 7 * DAY_MS;
        if (!isWinteringPrepSeason(fireAt, tz)) continue;
        const weekIndex = Math.floor((fireAt - seasonStartTs) / (7 * DAY_MS));
        const key = `wintering:${seasonYear}:${weekIndex}`;
        if (alreadySent(key) || weekIndex <= tipsWeek) continue;
        plannedWintering++;
        const only = missing.length === 1 ? missing[0] : null;
        planned.push({
          key,
          memberKeys: [key],
          category: 'wintering',
          fireAt,
          title: '월동 준비를 점검해보세요',
          body: only
            ? `${only.alias}${eunNeun(only.alias)} 아직 이번 시즌 월동 준비 기록이 없어요.`
            : `${missing[0].alias} 외 ${missing.length - 1}개 봉군은 아직 이번 시즌 월동 준비 기록이 없어요.`,
          target: only ? { kind: 'record', recordType: 'wintering_prep', colonyId: only.id, apiaryId: only.apiaryId } : { kind: 'wintering' },
        });
      }
    }
  }

  // 집중 방제 기간(6~10월): 기록 조건과 상관없이 달마다 한 번. 이 시기에 응애 검사·방제를 놓치지
  // 않게 하는 시즌 안내라서, 봉군이 하나라도 있으면 보낸다.
  if (settings.categories.treatment_season && source.colonies.length > 0) {
    const fireAt = nextSlot(now, tz);
    if (isTreatmentSeason(fireAt, tz)) {
      const w = wallClock(fireAt, tz);
      const key = `treatment_season:${w.year}:${w.month}`;
      if (!alreadySent(key)) {
        const stale = source.colonies.filter((c) => {
          const last = extractColonySeries(source, c.id).miteChecks.filter((m) => m.result !== 'indeterminate').at(-1);
          return !last || daysBetween(last.at, now) > MITE_OVERDUE_DAYS;
        });
        const only = source.colonies.length === 1 ? source.colonies[0] : null;
        planned.push({
          key,
          memberKeys: [key],
          category: 'treatment_season',
          fireAt,
          ...seasonCopy(w.month, stale.length),
          target: only ? { kind: 'record', recordType: 'mite', colonyId: only.id, apiaryId: only.apiaryId } : { kind: 'colonies' },
        });
      }
    }
  }

  return planned.sort((a, b) => a.fireAt - b.fireAt);
}

function seasonCopy(month: number, staleCount: number): { title: string; body: string } {
  const staleLine = staleCount > 0 ? `${staleCount}개 봉군은 최근 ${MITE_OVERDUE_DAYS}일 안에 응애 검사 기록이 없어요.` : '응애 검사 기록을 최신으로 유지해 보세요.';
  if (month === 6) {
    return {
      title: '응애 집중 방제 기간이 시작됐어요',
      body: `6~10월은 꿀벌응애 집중 방제 기간이에요. ${staleLine} 방제할 때는 같은 성분을 연속해서 쓰지 않고 바꿔가며 쓰는 것이 권고돼요.`,
    };
  }
  if (month === 10) {
    return {
      title: '월동 전 마지막 방제 시기예요',
      body: `10월까지가 응애 집중 방제 기간이에요. ${staleLine} 월동 전에 응애 검사와 방제를 마무리했는지 확인해 보세요.`,
    };
  }
  return {
    title: '지금은 응애 집중 방제 기간이에요',
    body: `${month}월 · ${staleLine} 검사 결과에 맞춰 방제를 검토하고, 약제 성분은 교차해서 사용하세요.`,
  };
}

function individual(c: Candidate): Omit<PlannedReminder, 'memberKeys'> {
  switch (c.category) {
    case 'mite':
      return {
        key: c.key,
        category: 'mite',
        fireAt: c.fireAt,
        title: '응애 다시 확인할 시기예요',
        body: `${c.alias}의 마지막 응애 검사가 ${c.days}일 전이에요.`,
        target: { kind: 'record', recordType: 'mite', colonyId: c.colonyId, apiaryId: c.apiaryId },
      };
    case 'post_treatment':
      return {
        key: c.key,
        category: 'post_treatment',
        fireAt: c.fireAt,
        title: '방제 후 상태를 확인해보세요',
        body: `${c.alias} · ${c.days}일 전 응애 방제 기록이 있어요. 다시 검사해 변화가 있었는지 확인해보세요.`,
        target: { kind: 'record', recordType: 'mite', colonyId: c.colonyId, apiaryId: c.apiaryId },
      };
    default:
      return {
        key: c.key,
        category: 'trend',
        fireAt: c.fireAt,
        title: '봉세가 계속 감소하고 있어요',
        body: `${c.alias} · 최근 3회 기록에서 ${c.levels}(으)로 변했어요.`,
        target: { kind: 'colony', colonyId: c.colonyId },
      };
  }
}

function grouped(first: Candidate, rest: number): Omit<PlannedReminder, 'key' | 'memberKeys'> {
  const others = `${first.alias} 외 ${rest}개 봉군`;
  switch (first.category) {
    case 'mite':
      return {
        category: 'mite',
        fireAt: first.fireAt,
        title: '응애 다시 확인할 시기예요',
        body: `${others}의 마지막 응애 검사 후 시간이 많이 지났어요.`,
        target: { kind: 'pick_colony', recordType: 'mite' },
      };
    case 'post_treatment':
      return {
        category: 'post_treatment',
        fireAt: first.fireAt,
        title: '방제 후 상태를 확인해보세요',
        body: `${others}에 방제 기록이 있어요. 다시 검사해 변화가 있었는지 확인해보세요.`,
        target: { kind: 'pick_colony', recordType: 'mite' },
      };
    default:
      return {
        category: 'trend',
        fireAt: first.fireAt,
        title: '봉세가 계속 감소하고 있어요',
        body: `${others}에서 최근 3회 기록의 봉세가 계속 줄었어요.`,
        target: { kind: 'colonies' },
      };
  }
}
