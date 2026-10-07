// AUTO-GENERATED — 직접 수정하지 마세요.
// 원본: src/features/health/miteRisk.ts  (npm run sync:ai-catalog 로 갱신)

type RiskLevel = 'low' | 'caution' | 'high';
import { FIELD_KIND_OPTIONS } from './recordTypesConfig.ts';
import {
  METRIC_BY_METHOD,
  MiteMetricUnit,
  MiteThresholdProfile,
  resolveMiteThreshold,
  Species,
  ThresholdRef,
  toThresholdRef,
} from './miteThresholds.ts';
import type { Season } from './time.ts';

export type { MiteMetricUnit } from './miteThresholds.ts';

// recordTypesConfig의 mite_method 토큰과 같다. 위험단계 수치를 계산할 수 있는 방법은
// 아래 셋뿐이고(사진으로 응애를 셀 수 있는 방법도 이 셋), 수벌방 검사·육안 확인·기타는
// 개수만 기록하고 위험단계는 계산하지 않는다.
export type MiteMethod = 'sticky_board' | 'sugar_roll' | 'alcohol_wash';

export const PHOTO_MITE_METHODS: { value: MiteMethod; label: string }[] = [
  { value: 'sugar_roll', label: '가루설탕법' },
  { value: 'sticky_board', label: '철망/끈끈이판' },
  { value: 'alcohol_wash', label: '알코올 워시' },
];

export function getMiteMethodLabel(method: string | null | undefined): string {
  return FIELD_KIND_OPTIONS.mite_method.find((m) => m.value === method)?.label ?? '응애 검사';
}

// 벌 샘플 검사(설탕가루/알코올)에서 흔히 쓰는 샘플 크기 — 1/2컵(약 300마리).
export const DEFAULT_SAMPLE_BEES = 300;

export type MiteAssessment = {
  riskLevel: RiskLevel | null;
  metricValue: number | null;
  metricUnit: MiteMetricUnit | null;
  // 위험단계를 가른 기준의 출처·버전 — 화면에 보여주고 나중에 기록과 함께 저장할 수 있다.
  threshold: ThresholdRef | null;
  // riskLevel을 못 구했을 때 사용자에게 알려줄 이유 (예: "벌 샘플 수 필요").
  missing: string | null;
};

export type MiteAssessmentInput = {
  method: string | null | undefined;
  miteCount: number;
  // 검사 분모/관찰기간
  sampleBees?: number | null;
  observationDays?: number | null;
  // 기준 선택에 쓰는 맥락 — 전용 기준이 없으면 쓰이지 않고 generic 기준으로 계산된다.
  season?: Season | null;
  species?: Species | null;
  // 테스트·향후 확장용: 기준 목록을 바꿔서 선택 규칙을 확인할 수 있다.
  profiles?: readonly MiteThresholdProfile[];
};

const NONE = { riskLevel: null, metricValue: null, metricUnit: null, threshold: null } as const;

function levelFromThresholds(value: number, t: { caution: number; high: number }): RiskLevel {
  if (value >= t.high) return 'high';
  if (value >= t.caution) return 'caution';
  return 'low';
}

export function assessMite(input: MiteAssessmentInput): MiteAssessment {
  const { method, miteCount, sampleBees, observationDays, season, species, profiles } = input;

  const metric = method ? METRIC_BY_METHOD[method] : undefined;
  if (!method || !metric) {
    return {
      ...NONE,
      missing: method ? '이 검사 방법은 위험도를 계산하지 않고 개수만 기록해요.' : '검사 방법을 선택해주세요.',
    };
  }

  // 검사 분모(벌 수) 또는 관찰 기간 — 방법이 정한 단위로 응애 수를 환산한다.
  let metricValue: number;
  if (metric === 'per_day') {
    if (!observationDays || observationDays <= 0) return { ...NONE, missing: '끈끈이판을 며칠 둔 건지 입력해주세요.' };
    metricValue = Math.round((miteCount / observationDays) * 10) / 10;
  } else {
    if (!sampleBees || sampleBees <= 0) return { ...NONE, missing: '검사한 벌 수를 입력해주세요.' };
    metricValue = Math.round((miteCount / sampleBees) * 1000) / 10;
  }

  const profile = resolveMiteThreshold({ method, metric, season, species }, profiles);
  if (!profile) return { ...NONE, metricValue, metricUnit: metric, missing: '이 검사에 맞는 참고 기준이 아직 없어요.' };

  return {
    riskLevel: levelFromThresholds(metricValue, profile),
    metricValue,
    metricUnit: metric,
    threshold: toThresholdRef(profile),
    missing: null,
  };
}

export function formatMiteMetric(value: number | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (unit === 'per_day') return `하루 ${value}마리`;
  if (unit === 'percent_bees') return `벌 100마리당 ${value}마리`;
  return String(value);
}

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: '낮음',
  caution: '주의',
  high: '높음',
};

export const RISK_LEVEL_TONES: Record<RiskLevel, 'normal' | 'caution' | 'danger'> = {
  low: 'normal',
  caution: 'caution',
  high: 'danger',
};
