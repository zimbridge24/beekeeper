import type { RecordType } from '../../db/schema';
import { extractColonySeries, HealthSource, STRENGTH_LABEL } from './facts';
import { getHornetSpeciesLabel } from './hornetRisk';
import { formatMiteMetric } from './miteRisk';
import { consecutiveSameIngredient, getIngredientLabel } from './treatmentRotation';
import { MITE_OVERDUE_DAYS, MITE_VERY_OVERDUE_DAYS, TREATMENT_FOLLOWUP_DAYS } from './ruleConstants';
import { DAY_MS, daysBetween, formatMonthDay, isActiveBeekeepingSeason } from './time';

// "봉군 기억장치" — 사용자가 놓치고 있는 것을 기록에서 찾아 먼저 말해준다.
// 모든 규칙은 기록의 구조화 필드에서 결정적으로 계산되며 AI가 만들어낸 문구가
// 아니다. 같은 기록이면 항상 같은 알림이 나오고, 왜 이 알림이 떴는지 기록을 열어
// 그대로 확인할 수 있다.

export type InsightSeverity = 'info' | 'caution' | 'danger';

// 알림이 가리키는 "다음 행동" = 그 봉군에 어떤 종류의 기록을 남길지.
export type InsightAction = { kind: 'record'; recordType: RecordType; colonyId: string };

export type Insight = {
  id: string;
  severity: InsightSeverity;
  apiaryId: string;
  colonyId: string;
  colonyAlias: string;
  // 봉군 이름을 뺀 본문 — 봉군 상세 화면에서는 이것만, 홈에서는 앞에 이름을 붙여 쓴다.
  message: string;
  actionLabel: string;
  action: InsightAction;
  // 정렬용: 문제가 된 사건의 시각.
  at: number;
};

export function insightHeadline(insight: Insight): string {
  return `${insight.colonyAlias}, ${insight.message}`;
}

export { MITE_OVERDUE_DAYS, MITE_VERY_OVERDUE_DAYS, TREATMENT_FOLLOWUP_DAYS };
const NEW_COLONY_GRACE_DAYS = 14;
const STRENGTH_TREND_WINDOW_DAYS = 60;
const HORNET_RECENT_HIGH_DAYS = 14;
const HORNET_REPEAT_WINDOW_DAYS = 30;
// 같은 성분 연속 사용 안내는 마지막 방제로부터 이 기간 동안만 띄운다 (한 해가 지나면 새 시즌).
const TREATMENT_ROTATION_WINDOW_DAYS = 120;

const SEVERITY_RANK: Record<InsightSeverity, number> = { danger: 0, caution: 1, info: 2 };

export function computeInsights(source: HealthSource): Insight[] {
  const { now } = source;
  const insights: Insight[] = [];

  for (const colony of source.colonies) {
    const series = extractColonySeries(source, colony.id);
    const base = { apiaryId: colony.apiaryId, colonyId: colony.id, colonyAlias: colony.alias };
    const action = (recordType: RecordType): InsightAction => ({ kind: 'record', recordType, colonyId: colony.id });
    const measured = series.miteChecks.filter((c) => c.result !== 'indeterminate');
    const lastMite = measured[measured.length - 1] ?? null;
    const lastTreatment = series.treatments[series.treatments.length - 1] ?? null;

    // 1) 응애 위험 '높음'인데 그 뒤 방제 기록이 없음
    if (lastMite && lastMite.riskLevel === 'high' && !(lastTreatment !== null && lastTreatment > lastMite.at)) {
      const metric = formatMiteMetric(lastMite.metricValue, lastMite.metricUnit);
      insights.push({
        ...base,
        id: `${colony.id}:mite-high-untreated`,
        severity: 'danger',
        message: `${formatMonthDay(lastMite.at)} 응애 검사가 참고 기준으로 '높음'${metric ? `(${metric})` : ''}으로 나타났는데 이후 방제 기록이 없어요.`,
        actionLabel: '방제 기록하기',
        action: action('treatment'),
        at: lastMite.at,
      });
    }

    if (lastTreatment !== null) {
      const checksAfter = measured.filter((c) => c.at > lastTreatment);
      const treatedDaysAgo = daysBetween(lastTreatment, now);

      // 2) 방제했는데 효과 확인 검사가 없음
      if (checksAfter.length === 0 && treatedDaysAgo >= TREATMENT_FOLLOWUP_DAYS) {
        insights.push({
          ...base,
          id: `${colony.id}:treatment-no-followup`,
          severity: 'caution',
          message: `${formatMonthDay(lastTreatment)} 방제 후 변화를 확인하는 응애 검사 기록이 아직 없어요.`,
          actionLabel: '응애 검사하기',
          action: action('mite'),
          at: lastTreatment,
        });
      }

      // 3) 방제 후 응애는 줄었는데 봉세 회복은 확인된 적 없음
      const before = [...measured].reverse().find((c) => c.at < lastTreatment && c.metricValue !== null);
      const after = checksAfter.filter((c) => c.metricValue !== null).pop();
      if (before && after && before.metricUnit === after.metricUnit && after.metricValue! < before.metricValue!) {
        const strengthAfter = series.strength.some((p) => p.at > after.at);
        if (!strengthAfter) {
          insights.push({
            ...base,
            id: `${colony.id}:treatment-no-recovery`,
            severity: 'caution',
            message: `${formatMonthDay(lastTreatment)} 방제 후 응애 기록은 감소했지만 봉세 회복 기록은 없어요.`,
            actionLabel: '봉세 기록하기',
            action: action('general_observation'),
            at: after.at,
          });
        }
      }
    }

    // 3-1) 최근 두 번의 방제가 같은 성분 — 성분을 바꿔가며 쓰는 것이 권고된다
    const sameIngredient = consecutiveSameIngredient(series.treatmentDetails);
    if (sameIngredient && now - sameIngredient.latest.at <= TREATMENT_ROTATION_WINDOW_DAYS * DAY_MS) {
      insights.push({
        ...base,
        id: `${colony.id}:treatment-same-ingredient`,
        severity: 'caution',
        message: `최근 두 번의 방제가 모두 ${getIngredientLabel(sameIngredient.ingredient)} 성분이에요. 같은 성분을 연속해서 쓰면 내성이 생기기 쉬워, 다음에는 성분을 바꿔 쓰는 것이 권고돼요.`,
        actionLabel: '방제 기록 보기',
        action: action('treatment'),
        at: sameIngredient.latest.at,
      });
    }

    // 4) 최근 3회 봉세 연속 감소
    const lastThree = series.strength.slice(-3);
    if (
      lastThree.length === 3 &&
      lastThree[2].rank <= lastThree[1].rank &&
      lastThree[1].rank <= lastThree[0].rank &&
      lastThree[2].rank < lastThree[0].rank &&
      now - lastThree[2].at <= STRENGTH_TREND_WINDOW_DAYS * DAY_MS
    ) {
      insights.push({
        ...base,
        id: `${colony.id}:strength-decline`,
        severity: 'caution',
        message: `최근 3회 내검에서 봉세가 계속 줄었어요. (${lastThree.map((p) => STRENGTH_LABEL[p.rank]).join(' → ')})`,
        actionLabel: '내검하기',
        action: action('general_observation'),
        at: lastThree[2].at,
      });
    }

    // 5) 응애 검사 오래됨 / 한 번도 안 함 (활동기에만, 막 만든 봉군은 유예)
    if (isActiveBeekeepingSeason(now) && daysBetween(colony.createdAt, now) >= NEW_COLONY_GRACE_DAYS) {
      if (!lastMite) {
        insights.push({
          ...base,
          id: `${colony.id}:mite-never`,
          severity: 'caution',
          message: '아직 응애 검사 기록이 없어요.',
          actionLabel: '응애 검사하기',
          action: action('mite'),
          at: colony.createdAt,
        });
      } else {
        const days = daysBetween(lastMite.at, now);
        // 이미 "높음인데 방제 안 함"이나 "방제 후 재검사 없음"으로 더 구체적인 알림이
        // 떠 있으면 같은 말을 또 하지 않는다.
        const alreadyCovered = insights.some(
          (i) => i.colonyId === colony.id && (i.id.endsWith('mite-high-untreated') || i.id.endsWith('treatment-no-followup')),
        );
        if (days > MITE_OVERDUE_DAYS && !alreadyCovered) {
          insights.push({
            ...base,
            id: `${colony.id}:mite-overdue`,
            severity: days > MITE_VERY_OVERDUE_DAYS ? 'danger' : 'caution',
            message: `마지막 응애 검사는 ${days}일 전이에요.`,
            actionLabel: '응애 검사하기',
            action: action('mite'),
            at: lastMite.at,
          });
        }
      }
    }

    // 6) 말벌 — 최근 위험이 높았거나, 같은 봉군에서 반복되고 있음
    const latestHornet = series.hornetEvents[series.hornetEvents.length - 1];
    if (latestHornet) {
      const days = daysBetween(latestHornet.at, now);
      const species = getHornetSpeciesLabel(latestHornet.species);
      if (latestHornet.riskLevel === 'high' && days <= HORNET_RECENT_HIGH_DAYS) {
        insights.push({
          ...base,
          id: `${colony.id}:hornet-recent-high`,
          severity: 'danger',
          message: `${days === 0 ? '오늘' : `${days}일 전`} ${species}${latestHornet.count !== null ? ` ${latestHornet.count}마리` : ''}가 확인돼 참고 기준으로 말벌 위험이 '높음'으로 나타났어요. 입구 축소·포획틀 상태를 확인해 보세요.`,
          actionLabel: '말벌 기록하기',
          action: action('hornet'),
          at: latestHornet.at,
        });
      } else {
        const recent = series.hornetEvents.filter((e) => now - e.at <= HORNET_REPEAT_WINDOW_DAYS * DAY_MS);
        if (recent.length >= 2) {
          const damageCount = recent.filter((e) => e.damage).length;
          insights.push({
            ...base,
            id: `${colony.id}:hornet-repeat`,
            severity: damageCount > 0 ? 'danger' : 'caution',
            message: `최근 ${HORNET_REPEAT_WINDOW_DAYS}일 동안 말벌이 ${recent.length}회 관찰됐고${damageCount > 0 ? ` 그중 ${damageCount}회는 피해가 있었어요` : ''}. 같은 봉군에서 반복되고 있는 것으로 보여요.`,
            actionLabel: '말벌 기록하기',
            action: action('hornet'),
            at: latestHornet.at,
          });
        }
      }
    }
  }

  return insights.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.at - a.at);
}

export function insightsForColony(insights: Insight[], colonyId: string): Insight[] {
  return insights.filter((i) => i.colonyId === colonyId);
}
