import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useNotificationSettings } from '../features/health/notificationSettings';
import {
  cancelLegacyLocalReminders,
  ensureAndroidChannel,
  openReminderTarget,
  registerForPush,
  requestNotificationPermission,
  targetFromResponse,
} from '../features/health/pushNotifications';
import { useColonyCount } from '../repositories/colonyRepository';

// 로그인한 동안 화면 뒤에서 도는 푸시 알림 관리자 (보이는 UI는 없다). 알림을 "보낼지"는 서버가 판단하고,
// 앱은 아래 일만 한다.
//   1) 처음 한 번 알림 동의를 묻는다 — 동의가 서버에 granted로 저장되기 전에는 서버가 아무것도 보내지 않는다.
//   2) 동의한 기기의 푸시 토큰을 서버에 등록·갱신한다 (시작, 포그라운드 복귀, 토큰 변경 때).
//   3) 알림을 누르면 해당 봉군의 점검 화면으로 이동한다.
//   4) 이전 버전이 예약해 둔 로컬 알림이 서버 알림과 겹치지 않게 한 번 지운다.
export function PushNotificationManager() {
  const { settings, loaded, refresh, update } = useNotificationSettings();
  const { data: colonyCountRows } = useColonyCount();
  const colonyCount = colonyCountRows?.[0]?.value ?? 0;

  // 서버 설정을 실제로 받아온 뒤에만 동의를 묻는다 — 오프라인이거나 서버를 못 읽은 상태에서 묻고 저장하면
  // 서버에 이미 있는 선택을 덮어쓸 수 있다.
  const [synced, setSynced] = useState(false);
  const syncNow = useCallback(() => {
    void refresh().then((ok) => {
      if (ok) setSynced(true);
    });
  }, [refresh]);

  useEffect(() => {
    void cancelLegacyLocalReminders();
    void ensureAndroidChannel();
  }, []);

  useEffect(() => {
    if (loaded) syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const consent = settings.consent;
  const register = useCallback(() => {
    if (consent === 'granted') void registerForPush();
  }, [consent]);

  // 동의했거나 설정이 바뀌면 토큰을 (재)등록한다.
  useEffect(() => {
    register();
  }, [register]);

  // 앱이 다시 포그라운드로 오면: 다른 기기에서 바꾼 설정을 받아오고 토큰도 갱신한다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      syncNow();
      register();
    });
    return () => sub.remove();
  }, [syncNow, register]);

  // OS가 기기 푸시 토큰을 바꾸면(재설치·복원·갱신) Expo 토큰도 새로 등록한다.
  useEffect(() => {
    const sub = Notifications.addPushTokenListener(() => register());
    return () => sub.remove();
  }, [register]);

  // 첫 동의 — 봉군이 하나라도 있고, 서버에서 "아직 한 번도 안 물어봄"을 확인했을 때 한 번만.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !synced || consent !== null || colonyCount === 0) return;
    asked.current = true;
    Alert.alert(
      '알림을 받을까요?',
      '중요한 봉군 점검 시기를 놓치지 않도록 알림을 받을까요?\n\n응애 재검사, 방제 후 확인, 월동 준비, 봉세 감소처럼 기록이 해당 조건에 맞을 때만 알려드려요. 앱을 열지 않아도 받을 수 있고, 설정에서 항목별로 켜고 끌 수 있어요.',
      [
        {
          text: '나중에',
          style: 'cancel',
          onPress: () => void update({ ...settings, consent: 'declined' }).catch((err) => console.warn('[notifications] save failed', err)),
        },
        {
          text: '받을게요',
          onPress: () => {
            void (async () => {
              const granted = await requestNotificationPermission();
              await update({ ...settings, consent: granted ? 'granted' : 'declined' });
            })().catch((err) => console.warn('[notifications] consent failed', err));
          },
        },
      ],
      { cancelable: false },
    );
  }, [synced, consent, colonyCount, settings, update]);

  // 알림 탭 → 행동 화면. 앱이 꺼져 있다가 알림으로 열린 경우(lastResponse)와 켜져 있을 때 모두.
  const handled = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    handled.current = id;
    const target = targetFromResponse(lastResponse);
    if (target) setTimeout(() => openReminderTarget(target), 300);
  }, [lastResponse]);

  return null;
}
