import type { RiskLevel } from '../../db/schema';

// recordTypesConfig의 wasp_species 값과 같은 토큰을 쓴다.
export type HornetSpecies = 'asian_hornet' | 'giant_hornet' | 'other' | 'unknown_species';

export const HORNET_SPECIES_OPTIONS: { value: HornetSpecies; label: string }[] = [
  { value: 'asian_hornet', label: '등검은말벌' },
  { value: 'giant_hornet', label: '장수말벌' },
  { value: 'other', label: '기타 말벌' },
  { value: 'unknown_species', label: '모름' },
];

export function getHornetSpeciesLabel(species: string | null | undefined): string {
  return HORNET_SPECIES_OPTIONS.find((s) => s.value === species)?.label ?? '말벌';
}

// 개체수 구간 (recordTypesConfig의 wasp_count_bucket과 같은 경계).
export function hornetCountBucket(count: number): 'none' | 'few_1_5' | 'several_6_20' | 'many_20_plus' {
  if (count <= 0) return 'none';
  if (count <= 5) return 'few_1_5';
  if (count <= 20) return 'several_6_20';
  return 'many_20_plus';
}

// 장수말벌은 몇 마리만 와도 한 봉군이 단시간에 무너질 수 있어 기준을 더
// 낮게 잡는다. 등검은말벌은 입구 앞에서 일벌을 사냥하며 서서히 소모시키는
// 형태라 마릿수 기준을 조금 높게 둔다.
export function assessHornetRisk(species: HornetSpecies | string, count: number): RiskLevel {
  if (count <= 0) return 'low';
  if (species === 'giant_hornet') return count >= 3 ? 'high' : 'caution';
  if (species === 'asian_hornet') {
    if (count >= 6) return 'high';
    if (count >= 3) return 'caution';
    return 'low';
  }
  if (count >= 20) return 'high';
  if (count >= 6) return 'caution';
  return 'low';
}
