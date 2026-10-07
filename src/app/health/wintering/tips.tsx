import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { StatusBadge } from '../../../components/StatusBadge';
import { WINTERING_TIP_GROUPS, WINTERING_TIPS_DISCLAIMER } from '../../../features/health/winteringTips';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

// 월동 준비 팁 — 알림을 눌렀을 때와 월동 점검 화면에서 들어오는 "한 번 훑어보는" 화면.
export default function WinteringTipsScreen() {
  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="월동 준비 팁" onBack={() => router.back()} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }}
      >
        <Card size="medium" tint={colors.surfaceTint}>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>월동 준비를 마치셨나요?</Text>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4, lineHeight: 20 }}>
            겨울을 나기 전에 아래 항목을 한 번 훑어보세요. 봉군별 점검은 &quot;월동 점검&quot;에서 기록할 수 있어요.
          </Text>
        </Card>

        {WINTERING_TIP_GROUPS.map((group) => (
          <View key={group.id} style={{ gap: spacing.sm }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
              {group.emoji} {group.title}
            </Text>
            {group.tips.map((tip) => (
              <Card key={tip.id} size="medium">
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{tip.title}</Text>
                    {tip.source === 'rda' && <StatusBadge tone="normal" label="농진청 자료" />}
                  </View>
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 19 }}>{tip.body}</Text>
                </View>
              </Card>
            ))}
          </View>
        ))}

        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 16 }}>{WINTERING_TIPS_DISCLAIMER}</Text>

        <Button label="❄️ 봉군별 월동 점검하러 가기" onPress={() => router.replace('/health/wintering')} />
      </ScrollView>
    </Screen>
  );
}
