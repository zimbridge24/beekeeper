import type { RiskLevel } from '../../db/schema';
import { assessHornetRisk } from './hornetRisk';
import { assessMite } from './miteRisk';
import type { Species, ThresholdRef } from './miteThresholds';
import { DAY_MS, seasonOf } from './time';

// 봉군 기억장치·월동 준비도가 읽는 "사실"은 전부 기록의 구조화 필드(record_field_values)
// 에서만 나온다. 수동 입력이든 음성이든 사진 AI든 같은 필드 키로 저장되므로, 입력 경로와
// 상관없이 같은 방식으로 읽힌다 — 별도의 분석 전용 저장소는 없다.
//
// 아래 구조 타입들은 DB 행에서 필요한 필드만 뽑아 쓰는 얇은 모양이라 Drizzle/React Native
// 없이도 이 파일과 이를 쓰는 계산 함수를 그대로 테스트할 수 있다.
export type ColonyLite = { id: string; apiaryId: string; alias: string; species: string; createdAt: number };
export type RecordLite = { id: string; colonyId: string; recordType: string; occurredAt: number };
export type FieldValueLite = { recordId: string; fieldKey: string; valueState: string; valueNumber: number | null };

export type HealthSource = {
  now: number;
  // 날짜·시즌 계산에 쓸 시간대(분 단위 UTC 오프셋). 생략하면 기기 로컬 — 서버는 사용자 시간대를 넘긴다.
  tz?: number;
  colonies: ColonyLite[];
  records: RecordLite[];
  fieldValues: FieldValueLite[];
};

// useHealthSource가 필드값 조회를 이 키들로 좁힌다.
export const ANALYSIS_FIELD_KEYS = [
  'colony_strength',
  'feed_status',
  'queen_status',
  'treatment_applied',
  'mite_infestation',
  'mite_method',
  'mite_count',
  'mite_sample_bees',
  'mite_observation_days',
  'wasp_observed',
  'wasp_species',
  'wasp_count',
  'wasp_count_number',
  'wasp_damage',
  'winter_insulation',
  'winter_hive_condition',
];

export type LevelPoint = { at: number; rank: 1 | 2 | 3 };

const STRENGTH_RANK: Record<string, 1 | 2 | 3> = { strong: 3, normal: 2, weak: 1 };
const FOOD_RANK: Record<string, 1 | 2 | 3> = { enough: 3, normal: 2, low: 1 };
export const STRENGTH_LABEL: Record<number, string> = { 3: '강함', 2: '보통', 1: '약함' };

export type MiteCheckPoint = {
  at: number;
  result: 'negative' | 'positive' | 'indeterminate';
  method: string | null;
  count: number | null;
  riskLevel: RiskLevel | null;
  metricValue: number | null;
  metricUnit: string | null;
  // 위험단계를 가른 참고 기준의 출처·버전 (수치로 계산하지 못했으면 null).
  threshold: ThresholdRef | null;
};

export type HornetEvent = {
  at: number;
  species: string | null;
  count: number | null;
  damage: boolean;
  riskLevel: RiskLevel;
};

export type WinteringCheckPoint = {
  at: number;
  insulation: 'done' | 'partial' | 'not_done' | null;
  hiveCondition: 'good' | 'needs_check' | null;
};

export type ColonySeries = {
  // 모두 시간 오름차순.
  strength: LevelPoint[];
  food: LevelPoint[];
  queen: { at: number; present: boolean }[];
  treatments: number[];
  miteChecks: MiteCheckPoint[];
  hornetEvents: HornetEvent[];
  winteringChecks: WinteringCheckPoint[];
};

type FieldMap = Map<string, { state: string; num: number | null }>;

const BUCKET_MIDPOINT: Record<string, number> = { few_1_5: 3, several_6_20: 10, many_20_plus: 25 };

function buildMiteCheck(at: number, f: FieldMap, species: Species | null, tz?: number): MiteCheckPoint | null {
  const state = f.get('mite_infestation')?.state;
  const count = f.get('mite_count')?.num ?? null;
  // "검사 안 함"은 검사 기록이 아니다. 결과를 안 골랐어도 응애 수가 있으면 그 수로 판단한다
  // (음성에서 "7마리 나왔다"만 말한 경우).
  let result: MiteCheckPoint['result'];
  if (state === 'tested_positive') result = 'positive';
  else if (state === 'tested_negative') result = 'negative';
  else if (state === 'indeterminate') result = 'indeterminate';
  else if (state === undefined && count !== null) result = count > 0 ? 'positive' : 'negative';
  else return null;

  const method = f.get('mite_method')?.state ?? null;
  let riskLevel: RiskLevel | null = null;
  let metricValue: number | null = null;
  let metricUnit: string | null = null;
  let threshold: ThresholdRef | null = null;

  if (result !== 'indeterminate' && count !== null) {
    const assessment = assessMite({
      method,
      miteCount: count,
      sampleBees: f.get('mite_sample_bees')?.num ?? null,
      observationDays: f.get('mite_observation_days')?.num ?? null,
      season: seasonOf(at, tz),
      species,
    });
    riskLevel = assessment.riskLevel;
    metricValue = assessment.metricValue;
    metricUnit = assessment.metricUnit;
    threshold = assessment.threshold;
  }
  // 수치를 못 구한 경우: 미검출이면 낮음, 검출이면 최소 주의.
  if (riskLevel === null) {
    if (result === 'negative') riskLevel = 'low';
    else if (result === 'positive') riskLevel = 'caution';
  }
  return { at, result, method, count, riskLevel, metricValue, metricUnit, threshold };
}

function buildHornetEvent(at: number, f: FieldMap): HornetEvent | null {
  const observed = f.get('wasp_observed')?.state;
  const damage = f.get('wasp_damage')?.state === 'present';
  if (observed === 'absent' && !damage) return null;
  if (observed !== 'present' && !damage) return null;

  const species = f.get('wasp_species')?.state ?? null;
  const exact = f.get('wasp_count_number')?.num ?? null;
  const bucket = f.get('wasp_count')?.state;
  const count = exact ?? (bucket ? (BUCKET_MIDPOINT[bucket] ?? null) : null);

  let riskLevel = assessHornetRisk(species ?? 'unknown_species', count ?? 1);
  // 실제 피해가 있었다면 마릿수가 적어도 최소 '주의'.
  if (damage && riskLevel === 'low') riskLevel = 'caution';
  return { at, species, count, damage, riskLevel };
}

// 기록 하나(타임라인 카드 등)의 위험단계 — 응애·말벌 기록만 해당. 같은 계산을 쓴다.
export function riskLevelForRecord(
  recordType: string,
  fieldValues: { fieldKey: string; valueState: string; valueNumber: number | null }[],
  context: { at: number; species: string | null | undefined } = { at: 0, species: null },
): RiskLevel | null {
  const f: FieldMap = new Map();
  for (const fv of fieldValues) if (fv.valueState !== 'unset') f.set(fv.fieldKey, { state: fv.valueState, num: fv.valueNumber });
  if (recordType === 'mite' || recordType === 'pest_disease') {
    return buildMiteCheck(context.at, f, context.species === 'native' ? 'native' : context.species === 'western' ? 'western' : null)?.riskLevel ?? null;
  }
  if (recordType === 'hornet') return buildHornetEvent(0, f)?.riskLevel ?? null;
  return null;
}

export function extractColonySeries(source: HealthSource, colonyId: string): ColonySeries {
  const colonySpecies = source.colonies.find((c) => c.id === colonyId)?.species;
  const species: Species | null = colonySpecies === 'native' ? 'native' : colonySpecies === 'western' ? 'western' : null;
  const recordsById = new Map<string, RecordLite>();
  for (const r of source.records) if (r.colonyId === colonyId) recordsById.set(r.id, r);

  const fieldsByRecord = new Map<string, FieldMap>();
  for (const fv of source.fieldValues) {
    if (!recordsById.has(fv.recordId) || fv.valueState === 'unset') continue;
    let m = fieldsByRecord.get(fv.recordId);
    if (!m) fieldsByRecord.set(fv.recordId, (m = new Map()));
    m.set(fv.fieldKey, { state: fv.valueState, num: fv.valueNumber });
  }

  const series: ColonySeries = {
    strength: [],
    food: [],
    queen: [],
    treatments: [],
    miteChecks: [],
    hornetEvents: [],
    winteringChecks: [],
  };

  for (const [recordId, f] of fieldsByRecord) {
    const record = recordsById.get(recordId)!;
    const at = record.occurredAt;

    const strength = STRENGTH_RANK[f.get('colony_strength')?.state ?? ''];
    if (strength) series.strength.push({ at, rank: strength });
    const food = FOOD_RANK[f.get('feed_status')?.state ?? ''];
    if (food) series.food.push({ at, rank: food });

    const queen = f.get('queen_status')?.state;
    if (queen === 'present') series.queen.push({ at, present: true });
    else if (queen === 'absent') series.queen.push({ at, present: false });

    if (f.get('treatment_applied')?.state === 'done') series.treatments.push(at);

    const mite = buildMiteCheck(at, f, species, source.tz);
    if (mite) series.miteChecks.push(mite);
    const hornet = buildHornetEvent(at, f);
    if (hornet) series.hornetEvents.push(hornet);

    if (record.recordType === 'wintering_prep') {
      const insulation = f.get('winter_insulation')?.state;
      const hive = f.get('winter_hive_condition')?.state;
      series.winteringChecks.push({
        at,
        insulation: insulation === 'done' || insulation === 'partial' || insulation === 'not_done' ? insulation : null,
        hiveCondition: hive === 'good' || hive === 'needs_check' ? hive : null,
      });
    }
  }

  // 월동 점검 기록 자체(값이 하나도 없어도)도 "점검한 날"로 센다.
  for (const r of recordsById.values()) {
    if (r.recordType === 'wintering_prep' && !series.winteringChecks.some((w) => w.at === r.occurredAt)) {
      series.winteringChecks.push({ at: r.occurredAt, insulation: null, hiveCondition: null });
    }
  }

  series.strength.sort((a, b) => a.at - b.at);
  series.food.sort((a, b) => a.at - b.at);
  series.queen.sort((a, b) => a.at - b.at);
  series.treatments.sort((a, b) => a - b);
  series.miteChecks.sort((a, b) => a.at - b.at);
  series.hornetEvents.sort((a, b) => a.at - b.at);
  series.winteringChecks.sort((a, b) => a.at - b.at);
  return series;
}

export const WINTERING_FACT_LOOKBACK_DAYS = 60;

export type StrengthToken = 'strong' | 'normal' | 'weak';
export type FoodToken = 'enough' | 'normal' | 'low';

export type WinteringFacts = {
  now: number;
  species: 'western' | 'native';
  strength: LevelPoint | null;
  strengthHistory: LevelPoint[];
  food: LevelPoint | null;
  queen: { at: number; present: boolean } | null;
  mite: MiteCheckPoint | null;
  hornetTrouble: { at: number; riskLevel: RiskLevel } | null;
  insulation: { at: number; value: 'done' | 'partial' | 'not_done' } | null;
  hiveCondition: { at: number; value: 'good' | 'needs_check' } | null;
};

// 월동 점검 화면에서 사용자가 "지금" 입력 중인 값. 기록된 값보다 우선하고 시점은 now로 본다.
export type WinteringOverrides = {
  strength?: string | null;
  food?: string | null;
  queenPresent?: boolean | null;
  insulation?: string | null;
  hiveCondition?: string | null;
};

// 월동 준비도 입력 재료를 기존 기록에서 모은다.
export function buildWinteringFacts(
  source: HealthSource,
  colonyId: string,
  overrides: WinteringOverrides = {},
): WinteringFacts | null {
  const colony = source.colonies.find((c) => c.id === colonyId);
  if (!colony) return null;
  const { now } = source;
  const series = extractColonySeries(source, colonyId);
  const last = <T>(items: T[]): T | null => (items.length ? items[items.length - 1] : null);

  const strengthHistory = [...series.strength];
  let strength = last(series.strength);
  const strengthOverride = STRENGTH_RANK[overrides.strength ?? ''];
  if (strengthOverride) {
    strength = { at: now, rank: strengthOverride };
    strengthHistory.push(strength);
  }

  let food = last(series.food);
  const foodOverride = FOOD_RANK[overrides.food ?? ''];
  if (foodOverride) food = { at: now, rank: foodOverride };

  let queen = last(series.queen);
  if (typeof overrides.queenPresent === 'boolean') queen = { at: now, present: overrides.queenPresent };

  // 말벌: 최근 60일 안의 사건 중 가장 심각한 것 (같은 위험도면 더 최근 것).
  const lookbackStart = now - WINTERING_FACT_LOOKBACK_DAYS * DAY_MS;
  let hornetTrouble: WinteringFacts['hornetTrouble'] = null;
  for (const e of series.hornetEvents) {
    if (e.at < lookbackStart || e.riskLevel === 'low') continue;
    if (!hornetTrouble || (e.riskLevel === 'high' && hornetTrouble.riskLevel !== 'high') || (e.riskLevel === hornetTrouble.riskLevel && e.at > hornetTrouble.at)) {
      hornetTrouble = { at: e.at, riskLevel: e.riskLevel };
    }
  }

  // 보온·벌통 상태는 월동 준비 점검에서만 입력되는 값 — 가장 최근 점검의 답을 이어받고,
  // 이번에 새로 고른 항목만 덮어쓴다.
  let insulation: WinteringFacts['insulation'] = null;
  let hiveCondition: WinteringFacts['hiveCondition'] = null;
  for (const c of series.winteringChecks) {
    if (c.insulation) insulation = { at: c.at, value: c.insulation };
    if (c.hiveCondition) hiveCondition = { at: c.at, value: c.hiveCondition };
  }
  if (overrides.insulation === 'done' || overrides.insulation === 'partial' || overrides.insulation === 'not_done') {
    insulation = { at: now, value: overrides.insulation };
  }
  if (overrides.hiveCondition === 'good' || overrides.hiveCondition === 'needs_check') {
    hiveCondition = { at: now, value: overrides.hiveCondition };
  }

  return {
    now,
    species: colony.species === 'native' ? 'native' : 'western',
    strength,
    strengthHistory,
    food,
    queen,
    mite: last(series.miteChecks.filter((m) => m.result !== 'indeterminate')),
    hornetTrouble,
    insulation,
    hiveCondition,
  };
}

export function lastWinteringCheckAt(source: HealthSource, colonyId: string): number | null {
  const series = extractColonySeries(source, colonyId);
  return series.winteringChecks.length ? series.winteringChecks[series.winteringChecks.length - 1].at : null;
}
