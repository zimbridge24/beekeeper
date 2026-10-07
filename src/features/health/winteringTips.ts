// 월동 준비 팁 — 월동 점검 전에 한 번 훑어보는 체크 포인트 모음. 점수나 판정이 아니라 "이런 걸
// 확인해 보세요"라는 참고 안내다.
//
// source: 'rda'는 농촌진흥청 자료에서 확인한 내용, 'general'은 양봉에서 일반적으로 통용되는
// 점검 항목이다. 구체적인 숫자(먹이 양, 온도, 날짜)는 지역·품종·해마다 달라서 일부러 적지 않았다 —
// 시기와 약제는 지역 농업기술센터·양봉협회 안내를 따르도록 한다.

export type TipSource = 'rda' | 'general';

export type WinteringTip = { id: string; title: string; body: string; source: TipSource };
export type WinteringTipGroup = { id: string; emoji: string; title: string; tips: WinteringTip[] };

export const WINTERING_TIP_GROUPS: WinteringTipGroup[] = [
  {
    id: 'mite',
    emoji: '🕷',
    title: '응애 마무리',
    tips: [
      {
        id: 'mite-last-check',
        title: '월동 전에 마지막 응애 검사',
        body: '농진청은 월동 산란이 끝나는 10~11월을 방제 적기 중 하나로 안내해요. 월동 전에 검사해서 응애가 많다면 방제를 마무리해 두세요.',
        source: 'rda',
      },
      {
        id: 'mite-recheck',
        title: '방제했다면 다시 세어 확인',
        body: '방제 1~2주 뒤에 같은 방법으로 다시 검사하면 효과를 알 수 있어요.',
        source: 'general',
      },
      {
        id: 'mite-rotate',
        title: '약제 성분은 바꿔가며',
        body: '같은 성분을 연속해서 쓰면 내성이 생기기 쉬워서 교차 사용이 권고돼요. 방제 기록에 성분을 남겨 두면 앱이 직전 성분과 비교해 줘요.',
        source: 'general',
      },
    ],
  },
  {
    id: 'food',
    emoji: '🍯',
    title: '먹이',
    tips: [
      {
        id: 'food-stock',
        title: '저장 먹이가 충분한지 확인',
        body: '겨울 동안 먹을 꿀·먹이가 넉넉한지 살펴보세요. 부족해 보이면 보충을 고려해요 (시기와 양은 지역 안내를 따르세요).',
        source: 'general',
      },
    ],
  },
  {
    id: 'colony',
    emoji: '🐝',
    title: '군세와 여왕',
    tips: [
      {
        id: 'colony-strength',
        title: '벌 수(군세) 확인',
        body: '벌이 너무 적은 군은 겨울을 나기 어려울 수 있어요. 약한 군은 합봉을 검토해 볼 수 있어요.',
        source: 'general',
      },
      {
        id: 'colony-queen',
        title: '여왕벌 확인',
        body: '여왕이 있는지, 산란한 흔적이 있는지 월동 전에 확인해 보세요.',
        source: 'general',
      },
    ],
  },
  {
    id: 'hive',
    emoji: '🏠',
    title: '벌통 환경',
    tips: [
      {
        id: 'hive-moisture',
        title: '습기와 환기',
        body: '벌통 안에 습기가 차거나 환기가 막히지 않았는지 살펴보세요.',
        source: 'general',
      },
      {
        id: 'hive-gaps',
        title: '틈과 파손 점검',
        body: '틈이 벌어지거나 깨진 곳이 없는지 확인하고, 찬바람이 들어오는 곳은 보수해 두세요.',
        source: 'general',
      },
      {
        id: 'hive-insulation',
        title: '보온 준비',
        body: '보온재나 덮개 등 보온 준비가 끝났는지 점검해 보세요.',
        source: 'general',
      },
    ],
  },
  {
    id: 'threat',
    emoji: '🛡',
    title: '외부 위협',
    tips: [
      {
        id: 'threat-entrance',
        title: '입구 좁히기',
        body: '말벌이나 쥐가 들어오기 어렵게 벌통 입구를 좁혀 두는 방법이 있어요.',
        source: 'general',
      },
    ],
  },
  {
    id: 'weather',
    emoji: '🌡',
    title: '날씨',
    tips: [
      {
        id: 'weather-swing',
        title: '기온이 급변하는 날은 개봉 자제',
        body: '농진청 연구에서 월동 성패에 평균 기온보다 기온 변동이 더 영향을 준다고 보고된 바 있어요. 기온이 크게 오르내리는 날에는 불필요한 개봉과 내검을 줄여 보세요.',
        source: 'rda',
      },
    ],
  },
];

export const WINTERING_TIPS_DISCLAIMER =
  '지역·품종·해마다 상황이 달라 참고용 점검 항목이에요. 방제 시기와 약제는 지역 농업기술센터나 양봉협회 안내를 따라주세요.';

export function countWinteringTips(): number {
  return WINTERING_TIP_GROUPS.reduce((n, g) => n + g.tips.length, 0);
}
