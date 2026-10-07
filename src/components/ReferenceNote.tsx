import { Text } from 'react-native';

import { colors, fontFamilies, fontSizes } from '../theme/tokens';

export type ReferenceNoteKind = 'mite' | 'hornet' | 'readiness' | 'general';

// 위험단계(낮음/주의/높음)나 월동 점검 체크리스트가 보이는 모든 화면에 똑같이 붙는 안내 문구.
// 이 값들은 "현재 입력된 기록과 참고 기준으로 계산한 값"이지 공식 진단·확정 판정이 아니라는
// 점을 한 곳에서 관리해서, 화면마다 말이 달라지거나 빠지지 않게 한다.
const MESSAGES: Record<ReferenceNoteKind, string> = {
  mite: '현재 입력된 기록과 참고 기준을 바탕으로 계산한 값이에요. 공식 진단이나 확정 판정이 아니며, 검사 방법·계절·지역에 따라 실제 판단은 달라질 수 있어요.',
  hornet: '입력한 종류와 마릿수를 참고 기준에 맞춰 분류한 값이에요. 공식 진단이나 확정 판정이 아니며, 현장 상황에 따라 달라질 수 있어요.',
  readiness:
    '현재 입력된 기록을 기준으로 정리한 월동 점검 목록이에요. 월동 성공 여부를 예측하는 것이 아니며, 지역·품종·기상 조건에 따라 실제 월동 결과는 달라질 수 있어요.',
  general: '위험도와 점검 결과는 현재 입력된 기록과 참고 기준을 바탕으로 정리한 값이에요. 공식 진단이나 확정 판정이 아니에요.',
};

type Props = {
  kind: ReferenceNoteKind;
  // 계산에 쓴 기준의 이름/버전 (예: "일반 참고 기준 v1") — 있으면 문구 뒤에 덧붙인다.
  basis?: string | null;
};

export function ReferenceNote({ kind, basis }: Props) {
  return (
    <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 16 }}>
      {MESSAGES[kind]}
      {basis ? ` (기준: ${basis})` : ''}
    </Text>
  );
}
