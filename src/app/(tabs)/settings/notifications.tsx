import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking, ScrollView, Switch, Text, View } from 'react-native';

import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useNotificationSettings } from '../../../features/health/notificationSettings';
import { hasNotificationPermission, registerForPush, requestNotificationPermission } from '../../../features/health/pushNotifications';
import { REMINDER_CATEGORIES, ReminderCategory } from '../../../features/health/reminders';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

function Row({ label, description, value, disabled, onChange }: { label: string; description?: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: disabled ? 0.45 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{label}</Text>
        {description && (
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 17 }}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: '#D8D4C4', true: colors.primary }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { settings, refresh, update } = useNotificationSettings();
  const enabled = settings.consent === 'granted';

  // 다른 기기에서 바꾼 설정이 있을 수 있어서 화면을 열 때 서버 값을 받아온다.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveFailed = (err: unknown) => {
    console.warn('[notifications] save failed', err);
    Alert.alert('설정을 저장하지 못했어요', '인터넷 연결을 확인하고 다시 시도해주세요. 알림 설정은 서버에 저장돼요.');
  };

  const openOsSettings = () =>
    Alert.alert('알림 권한이 꺼져 있어요', '기기 설정에서 비히어로의 알림을 허용해야 점검 알림을 받을 수 있어요.', [
      { text: '닫기', style: 'cancel' },
      { text: '설정 열기', onPress: () => void Linking.openSettings() },
    ]);

  const handleMaster = async (next: boolean) => {
    try {
      if (!next) {
        await update({ ...settings, consent: 'declined' });
        return;
      }
      const granted = await requestNotificationPermission();
      await update({ ...settings, consent: granted ? 'granted' : 'declined' });
      if (granted) void registerForPush();
      else openOsSettings();
    } catch (err) {
      saveFailed(err);
    }
  };

  const handleCategory = async (key: ReminderCategory, next: boolean) => {
    try {
      await update({ ...settings, categories: { ...settings.categories, [key]: next } });
      // OS 권한이 나중에 꺼진 경우를 알려준다.
      if (next && enabled && !(await hasNotificationPermission())) openOsSettings();
    } catch (err) {
      saveFailed(err);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="점검 알림" onBack={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }}>
        <Card size="large">
          <Row
            label="점검 알림 받기"
            description="중요한 봉군 점검 시기를 놓치지 않도록, 기록이 아래 조건에 맞을 때만 알려드려요. 같은 조건으로는 한 번만, 오전 9시에 보내요."
            value={enabled}
            onChange={handleMaster}
          />
        </Card>

        <Card size="large">
          <View style={{ gap: spacing.xl }}>
            {REMINDER_CATEGORIES.map((c) => (
              <Row
                key={c.key}
                label={c.label}
                description={c.description}
                value={settings.categories[c.key]}
                disabled={!enabled}
                onChange={(v) => handleCategory(c.key, v)}
              />
            ))}
          </View>
        </Card>

        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 16 }}>
          알림은 서버에 동기화된 기록을 바탕으로 판단하기 때문에, 앱을 열지 않아도 받을 수 있어요. 기록이 서버에 올라가야(동기화) 알림에 반영돼요. 알림을 누르면 해당 봉군의 점검 화면으로 바로 이동해요. 알림 문구의 기준은 참고용이며 공식 진단이 아니에요.
        </Text>
      </ScrollView>
    </Screen>
  );
}
