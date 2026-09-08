import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

type Section = { title: string; body: string };

const SECTIONS: Section[] = [
  {
    title: '기기 내 저장',
    body: '양봉장, 봉군, 방문, 내검 기록은 우선 기기 안(로컬 저장소)에 저장돼요. 네트워크가 없어도 기록이 유실되지 않습니다.',
  },
  {
    title: '클라우드 동기화',
    body: '기기 내 기록은 Supabase 클라우드 서버로 자동 동기화되어 백업되고, 다른 기기에서도 로그인하면 같은 기록을 볼 수 있어요.',
  },
  {
    title: '음성 인식',
    body: '음성으로 내검을 기록하면, 녹음 파일이 네이버클라우드 CLOVA Speech로 전송되어 텍스트로 변환돼요.',
  },
  {
    title: 'AI 구조화',
    body: '변환된 텍스트는 Google Gemini로 전송되어 관찰/문제/조치 항목으로 구조화돼요. 구조화 결과는 항상 화면에서 검토·수정한 뒤에만 저장됩니다.',
  },
  {
    title: '날씨·위치',
    body: '내검을 시작하면 기기 위치(GPS, 거부 시 등록된 양봉장 위치)를 기상청 API에 전달해 그 시점의 날씨를 자동으로 기록해요.',
  },
  {
    title: '사진',
    body: '첨부한 사진은 Supabase Storage에 업로드되어 보관돼요.',
  },
  {
    title: '계정 삭제',
    body: '계정을 삭제하면 위 데이터(사진 포함) 전부가 서버에서 영구적으로 삭제됩니다. 설정 > 계정에서 언제든 요청할 수 있어요.',
  },
];

export default function DataUsageScreen() {
  return (
    <Screen>
      <ScreenHeader title="데이터 이용 안내" onBack={() => router.back()} />
      <View style={{ gap: spacing.md }}>
        {SECTIONS.map((section) => (
          <Card key={section.title} size="large">
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{section.title}</Text>
            <Text
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: fontSizes.bodySm,
                color: colors.textSecondary,
                marginTop: 4,
                lineHeight: 20,
              }}
            >
              {section.body}
            </Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
