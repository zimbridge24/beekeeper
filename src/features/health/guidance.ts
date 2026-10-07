import type { RiskLevel } from '../../db/schema';
import { hornetCountBucket } from './hornetRisk';

export type Guidance = { headline: string; actions: string[]; recheckInDays: number | null };

// 이 안내문은 "참고 기준으로 계산한 결과"에 대한 제안이지 진단이나 처방이 아니다.
// 그래서 문장은 단정("~입니다/~하세요")보다 "~로 나타났어요/~해 보세요"로 쓴다.
// 약제 이름/용량은 일부러 적지 않는다 — 국내 등록 약제와 사용 기준은 지역·시기마다
// 다르므로 농업기술센터/양봉협회 지침을 따르도록 안내만 한다.
export function getMiteGuidance(risk: RiskLevel | null): Guidance {
  switch (risk) {
    case 'high':
      return {
        headline: '응애 수치가 참고 기준보다 높게 나타났어요. 방제를 검토해 보세요.',
        actions: [
          '방제가 필요한지 지역 농업기술센터나 양봉협회 지침과 함께 확인해 보세요 (약제·시기는 지역마다 달라요).',
          '방제를 했다면 1~2주 뒤에 같은 방법으로 다시 검사해서 변화를 확인해 보세요.',
          '월동 전이라면 월동 준비도에서 봉세·먹이와 함께 살펴보세요.',
        ],
        recheckInDays: 14,
      };
    case 'caution':
      return {
        headline: '응애 수치가 참고 기준에 가까워지고 있어요. 가까운 시일 안에 다시 검사해 보세요.',
        actions: ['1~2주 안에 같은 방법으로 다시 검사해서 늘고 있는지 확인해 보세요.', '수치가 계속 오른다면 방제를 준비해 볼 수 있어요.'],
        recheckInDays: 10,
      };
    case 'low':
      return {
        headline: '응애 수치가 참고 기준보다 낮게 나타났어요.',
        actions: ['활동기에는 월 1회 정도 정기적으로 검사해 보세요.', '다른 봉군과 같은 방법으로 검사하면 비교하기 좋아요.'],
        recheckInDays: 30,
      };
    default:
      return {
        headline: '위험단계를 계산하려면 입력이 더 필요해요.',
        actions: ['검사 방법에 맞는 값(벌 수 또는 설치 일수)을 입력해 주세요.'],
        recheckInDays: null,
      };
  }
}

const NEST_NOTE = '벌집(둥지)을 발견했다면 직접 제거하지 말고 119 또는 지자체에 문의해 보세요. 직접 제거는 위험할 수 있어요.';

export function getHornetGuidance(species: string, count: number): Guidance {
  const bucket = hornetCountBucket(count);

  if (bucket === 'none') {
    return {
      headline: '이번 사진에서는 말벌이 확인되지 않았어요.',
      actions: ['말벌이 자주 오는 시간대(오전~오후)에 입구 주변을 다시 살펴보세요.'],
      recheckInDays: 7,
    };
  }

  if (species === 'giant_hornet') {
    return {
      headline: '장수말벌은 적은 수로도 봉군에 큰 피해를 줄 수 있어서, 빠른 대응을 권해요.',
      actions: [
        '벌통 입구를 최대한 좁히거나 말벌 방지 입구망(입구 축소기)을 설치해 보세요.',
        '양봉장 주변에 말벌 포획틀을 설치하고 매일 확인해 보세요.',
        count >= 3
          ? '피해가 이어진다면 약한 봉군은 합봉하거나 안전한 곳으로 옮기는 것도 검토해 보세요.'
          : '2~3일 동안 매일 입구 주변을 다시 살펴보세요.',
        NEST_NOTE,
      ],
      recheckInDays: 1,
    };
  }

  if (species === 'asian_hornet') {
    const actions = ['벌통 입구를 좁혀 말벌이 들어오기 어렵게 해 보세요.', '양봉장 주변에 말벌 포획틀을 설치하고 정기적으로 비워 주세요.'];
    if (bucket === 'several_6_20' || bucket === 'many_20_plus') {
      actions.push('입구 앞 사냥이 계속되면 봉군이 빠르게 약해질 수 있어요. 약한 봉군은 합봉도 검토해 보세요.');
    } else {
      actions.push('며칠간 개체수가 늘어나는지 지켜보세요.');
    }
    actions.push(NEST_NOTE);
    return {
      headline:
        bucket === 'few_1_5'
          ? '등검은말벌이 소수 보여요. 입구를 좁히고 경과를 지켜보세요.'
          : '등검은말벌 개체수가 많은 편이에요. 적극적인 대응을 권해요.',
      actions,
      recheckInDays: bucket === 'few_1_5' ? 3 : 1,
    };
  }

  return {
    headline: '말벌 종류를 정확히 알기 어려워요. 더 선명한 사진으로 다시 확인해 보세요.',
    actions: [
      '말벌의 몸 전체(머리·가슴·배 무늬)가 보이게 가까이서 다시 촬영해 보세요.',
      '우선 벌통 입구를 좁히고 포획틀을 설치해 두면 도움이 될 수 있어요.',
      NEST_NOTE,
    ],
    recheckInDays: 3,
  };
}
