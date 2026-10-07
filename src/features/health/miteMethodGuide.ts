// 응애를 "어떻게 세고 어떻게 판단하는가" — 검사 방법별 안내. 사진 AI로 세지 않고 사용자가 직접
// 세어 입력하므로, 입력 화면에서 방법별로 무엇을 세고 어떤 기준으로 판단하는지 알려준다.
//
// 아래 내용은 농촌진흥청 자료에서 확인된 것만 적었다. 확인하지 못한 부분(예: '벌집판'의
// 구체적인 정의)은 모른다고 적는다 — 그럴듯한 설명을 지어내지 않는다.

export type MiteMethodGuide = {
  method: string;
  title: string;
  // 어떻게 세는지
  howToCount: string[];
  // 어떤 기준으로 판단하는지 (화면에 "기준" 라벨과 함께 보여준다)
  howToJudge: string[];
  // 한계·주의
  caveat?: string;
  official: boolean;
};

export const MITE_METHOD_GUIDES: Record<string, MiteMethodGuide> = {
  comb_count: {
    method: 'comb_count',
    title: '벌집판당 세기 (농진청 기준)',
    howToCount: ['벌집판 한 장에서 확인되는 응애 마릿수를 세어 입력해요.', '여러 장을 셌다면 한 장당 평균(또는 대표 한 장)을 입력해요.'],
    howToJudge: ['벌집판 한 장당 10마리 미만 → 검사 주기를 넓혀도 되는 단계', '10마리 이상 → 방제가 필요한 단계', '30마리 이상 → 집중 방제 단계'],
    caveat: "농진청 발표에서 '벌집판'을 어떤 판으로 보고 어떻게 세는지까지는 확인하지 못했어요. 세는 방법은 지역 농업기술센터·양봉협회 안내를 따라주세요.",
    official: true,
  },
  sugar_roll: {
    method: 'sugar_roll',
    title: '가루설탕법',
    howToCount: [
      '농진청 설명: 플라스틱 통에 가루설탕 약 15g과 일벌 100마리를 넣고 15초 정도 흔든 뒤, 떨어진 응애를 세요.',
      '검사한 벌 수를 함께 입력하면 벌 100마리당 응애 비율(%)로 계산해요.',
    ],
    howToJudge: ['농진청은 응애 감염률(벌 100마리당)을 10% 이하로 관리하도록 안내해요. 10% 이상이면 방제를 검토해요.'],
    official: true,
  },
  sticky_board: {
    method: 'sticky_board',
    title: '철망/끈끈이판',
    howToCount: ['바닥에 끈끈이판을 며칠 둔 뒤 떨어진 응애를 세요.', '설치한 일수를 함께 입력하면 하루 평균 낙하 수로 계산해요.'],
    howToJudge: ['이 방법은 국내 공식 기준을 확인하지 못했어요. 일반 참고값으로만 계산하고, 결과에 그렇게 표시해요.'],
    official: false,
  },
  alcohol_wash: {
    method: 'alcohol_wash',
    title: '알코올 워시',
    howToCount: ['벌을 알코올에 넣고 흔들어 떨어진 응애를 세요.', '검사한 벌 수를 함께 입력하면 벌 100마리당 응애 비율(%)로 계산해요.'],
    howToJudge: ['이 방법은 국내 공식 기준을 확인하지 못했어요. 일반 참고값으로만 계산하고, 결과에 그렇게 표시해요.'],
    official: false,
  },
  drone_brood: {
    method: 'drone_brood',
    title: '수벌방 검사',
    howToCount: ['수벌 번데기방을 열어 번데기에 붙은 응애를 확인해요.', '(농진청은 일벌 소방 30개 또는 100개를 핀셋으로 열어 확인하는 방법을 안내해요.)'],
    howToJudge: ['이 앱은 수벌방 검사의 위험도를 계산하지 않고 개수만 기록해요.'],
    official: false,
  },
};

export function getMiteMethodGuide(method: string | null | undefined): MiteMethodGuide | null {
  return method ? (MITE_METHOD_GUIDES[method] ?? null) : null;
}
