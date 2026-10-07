import { FIELD_KIND_OPTIONS } from '../records/recordTypesConfig';
import { formatMonthDay } from './time';

// 방제 약제는 같은 "성분"을 연속해서 쓰지 않고 바꿔가며(교차) 쓰는 것이 권고된다 — 같은 성분을
// 계속 쓰면 응애가 내성을 갖기 쉽기 때문이다. 이 파일은 방제 기록의 약제 성분 이력에서 "직전
// 방제와 같은 성분인가"만 판단한다 (제품명이 달라도 성분이 같으면 같은 것).
//
// 판단할 수 없는 경우(성분 미기록 · 기타 성분 · 성분 모름)는 같다/다르다를 추측하지 않고
// 비교 불가로 돌려준다. 권고 문구는 참고용이며 처방이 아니다.

export type TreatmentHistoryItem = { at: number; ingredient: string | null };

export type RotationCheck =
  | { status: 'no_history' }
  | { status: 'rotated'; previous: TreatmentHistoryItem }
  | { status: 'same_as_last'; previous: TreatmentHistoryItem }
  | { status: 'cannot_compare'; reason: 'selected_unclear' | 'previous_unclear'; previous: TreatmentHistoryItem };

const COMPARABLE = new Set(['amitraz', 'coumaphos', 'formic_acid', 'oxalic_acid']);

export function getIngredientLabel(ingredient: string | null | undefined): string {
  if (!ingredient) return '성분 미기록';
  return FIELD_KIND_OPTIONS.treatment_ingredient.find((o) => o.value === ingredient)?.label ?? ingredient;
}

// history: 같은 봉군의 방제 기록(시간 오름차순). selected: 이번에 고른 성분(아직 안 골랐으면 null).
export function checkIngredientRotation(history: TreatmentHistoryItem[], selected: string | null): RotationCheck | null {
  if (!selected) return null;
  const previous = history[history.length - 1];
  if (!previous) return { status: 'no_history' };
  if (!COMPARABLE.has(selected)) return { status: 'cannot_compare', reason: 'selected_unclear', previous };
  if (!previous.ingredient || !COMPARABLE.has(previous.ingredient)) return { status: 'cannot_compare', reason: 'previous_unclear', previous };
  return previous.ingredient === selected ? { status: 'same_as_last', previous } : { status: 'rotated', previous };
}

// 가장 최근 두 번의 방제가 같은 (비교 가능한) 성분인지 — 홈의 "놓치고 있는 것"에 쓴다.
export function consecutiveSameIngredient(history: TreatmentHistoryItem[]): { ingredient: string; latest: TreatmentHistoryItem; before: TreatmentHistoryItem } | null {
  const latest = history[history.length - 1];
  const before = history[history.length - 2];
  if (!latest?.ingredient || !before?.ingredient) return null;
  if (!COMPARABLE.has(latest.ingredient) || latest.ingredient !== before.ingredient) return null;
  return { ingredient: latest.ingredient, latest, before };
}

export function rotationNotice(check: RotationCheck | null): { tone: 'warning' | 'info'; text: string } | null {
  if (!check || check.status === 'no_history') return null;
  const when = formatMonthDay(check.previous.at);
  switch (check.status) {
    case 'same_as_last':
      return {
        tone: 'warning',
        text: `직전 방제(${when})도 같은 ${getIngredientLabel(check.previous.ingredient)} 성분이에요. 같은 성분을 연속해서 쓰면 내성이 생기기 쉬워, 성분을 바꿔가며 쓰는 것이 권고돼요. 다른 성분이 있는지 확인해 보세요.`,
      };
    case 'rotated':
      return { tone: 'info', text: `직전 방제(${when})는 ${getIngredientLabel(check.previous.ingredient)}였어요. 성분이 바뀌었네요.` };
    case 'cannot_compare':
      return {
        tone: 'info',
        text:
          check.reason === 'previous_unclear'
            ? `직전 방제(${when})의 약제 성분이 기록돼 있지 않아 같은 성분인지 비교할 수 없어요.`
            : '선택한 성분으로는 직전 방제와 같은 성분인지 비교할 수 없어요. 제품 겉면의 유효 성분을 확인해 보세요.',
      };
  }
}
