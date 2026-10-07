// AUTO-GENERATED — 직접 수정하지 마세요.
// 원본: src/features/health/miteThresholds.ts  (npm run sync:ai-catalog 로 갱신)

import type { Season } from './time.ts';

// 응애 위험단계(낮음/주의/높음)를 가르는 "참고 기준" 저장소.
//
// 국내 공식 기준(농촌진흥청)을 우선한다:
//   - 벌집판 한 장당 10마리 미만 → 검사 주기 확대 / 10마리 이상 → 방제 / 30마리 이상 → 집중 방제
//     (농진청 AI 응애 분석 'BeeSion' 발표, 정책뉴스 2025)
//   - 가루설탕법 감염률(벌 100마리당 응애 %) 10% 이하 관리 (농진청 보도자료 '7월 제때 방제')
// 공식 자료에 없는 방법(알코올 워시·끈끈이판)은 일반 참고값(generic)으로만 계산하고, 화면에
// "국내 공식 기준이 아님"을 함께 보여준다. 품종·계절별 기준은 지어내지 않는다 — 나중에 검증된
// 기준을 이 배열에 "추가하기만 하면" 되도록 선택 규칙을 먼저 만들어 두었다:
//
//   1) 검사 방법   — method가 맞는(또는 method 제한이 없는) 프로필만 후보
//   2) 분모/관찰기간 — 방법이 정하는 측정 단위(벌 100마리당 % / 하루 평균)가 같은 것만 후보
//   3) 계절         — season이 지정된 프로필이 맞으면 우선
//   4) 품종         — species가 지정된 프로필이 맞으면 우선
//
// 후보 중에서는 위 순서대로 "더 구체적으로 맞는" 프로필이 이긴다(검사 방법 전용 > 계절 전용 >
// 품종 전용). 전용 기준이 하나도 없으면 generic 참고 기준으로 돌아간다(fallback).
// 프로필마다 id·version·source·status를 들고 있어서, 어떤 기준으로 계산했는지 나중에 기록에
// 함께 저장·표시할 수 있다.

export type MiteMetricUnit = 'percent_bees' | 'per_day' | 'per_comb';
export type Species = 'western' | 'native';

// generic_reference: 일반 참고값(검증 전)  /  validated: 전문가·공식 자료로 검증된 기준
export type ThresholdStatus = 'generic_reference' | 'validated';

export type MiteThresholdProfile = {
  id: string;
  version: string;
  // 기준의 출처 설명 (화면·기록에 그대로 보여줄 수 있는 문장).
  source: string;
  status: ThresholdStatus;
  label: string;
  // 이 프로필이 쓰는 측정 단위 — 검사 방법(분모/관찰기간)이 정한다.
  metric: MiteMetricUnit;
  // 적용 조건. 생략하면 "모두"에 적용되는 일반 기준이다.
  methods?: readonly string[];
  seasons?: readonly Season[];
  species?: readonly Species[];
  // 이 값 이상이면 각각 '주의' / '높음'.
  caution: number;
  high: number;
};

const GENERIC_SOURCE = '일반적으로 통용되는 참고값 — 국내 공식 기준이 아니에요';

export const MITE_THRESHOLD_PROFILES: readonly MiteThresholdProfile[] = [
  {
    id: 'rda.per_comb',
    version: '2025',
    source: '농촌진흥청 발표 기준: 벌집판 한 장당 10마리 미만 검사 주기 확대 · 10마리 이상 방제 · 30마리 이상 집중 방제',
    status: 'validated',
    label: '농진청 기준(벌집판당)',
    metric: 'per_comb',
    methods: ['comb_count'],
    caution: 10,
    high: 30,
  },
  {
    id: 'rda.percent_bees.sugar_roll',
    version: '2024',
    source: '농촌진흥청: 응애 감염률(벌 100마리당) 10% 이하 관리 — 10% 이상이면 방제를 권해요 (이 자료에는 그보다 높은 단계 기준이 없어요)',
    status: 'validated',
    label: '농진청 기준(감염률 10%)',
    metric: 'percent_bees',
    methods: ['sugar_roll'],
    caution: 10,
    high: Infinity,
  },
  {
    id: 'generic.percent_bees',
    version: '1',
    source: GENERIC_SOURCE,
    status: 'generic_reference',
    label: '일반 참고 기준(국내 공식 아님)',
    metric: 'percent_bees',
    methods: ['sugar_roll', 'alcohol_wash'],
    caution: 2,
    high: 3,
  },
  {
    id: 'generic.per_day',
    version: '1',
    source: GENERIC_SOURCE,
    status: 'generic_reference',
    label: '일반 참고 기준(국내 공식 아님)',
    metric: 'per_day',
    methods: ['sticky_board'],
    caution: 5,
    high: 10,
  },
];

// 검사 방법이 측정 단위(분모)를 정한다. 여기 없는 방법(수벌방 검사·육안 확인·기타)은 개수만
// 기록하고 위험단계는 계산하지 않는다.
export const METRIC_BY_METHOD: Readonly<Record<string, MiteMetricUnit>> = {
  comb_count: 'per_comb',
  sugar_roll: 'percent_bees',
  alcohol_wash: 'percent_bees',
  sticky_board: 'per_day',
};

export type MiteThresholdContext = {
  method: string;
  metric: MiteMetricUnit;
  season?: Season | null;
  species?: Species | null;
};

export function resolveMiteThreshold(
  ctx: MiteThresholdContext,
  profiles: readonly MiteThresholdProfile[] = MITE_THRESHOLD_PROFILES,
): MiteThresholdProfile | null {
  let best: { profile: MiteThresholdProfile; rank: [number, number, number] } | null = null;

  for (const profile of profiles) {
    // 1) 검사 방법  2) 분모/관찰기간(측정 단위): 안 맞으면 후보가 아니다.
    if (profile.metric !== ctx.metric) continue;
    if (profile.methods && !profile.methods.includes(ctx.method)) continue;
    // 3) 계절  4) 품종: 지정돼 있는데 안 맞으면 후보가 아니다.
    if (profile.seasons && (!ctx.season || !profile.seasons.includes(ctx.season))) continue;
    if (profile.species && (!ctx.species || !profile.species.includes(ctx.species))) continue;

    // 더 구체적으로 맞을수록 우선 — 방법 > 계절 > 품종 순으로 사전식 비교. 방법은 "하나만
    // 지정한 기준"이 "여러 방법을 함께 지정한 기준"보다, 그것이 "방법 제한 없는 기준"보다 구체적이다.
    const methodSpecificity = !profile.methods ? 0 : profile.methods.length === 1 ? 2 : 1;
    const rank: [number, number, number] = [methodSpecificity, profile.seasons ? 1 : 0, profile.species ? 1 : 0];
    if (!best || compareRank(rank, best.rank) > 0) best = { profile, rank };
  }
  return best?.profile ?? null;
}

function compareRank(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// 화면·기록에 남길 기준 출처 요약.
export type ThresholdRef = Pick<MiteThresholdProfile, 'id' | 'version' | 'source' | 'status' | 'label'>;

export function toThresholdRef(profile: MiteThresholdProfile): ThresholdRef {
  const { id, version, source, status, label } = profile;
  return { id, version, source, status, label };
}
