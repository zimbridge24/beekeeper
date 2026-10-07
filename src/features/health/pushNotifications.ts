import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { getAppMetaValue, setAppMetaValue } from '../../repositories/appMetaRepository';
import { supabase } from '../../supabase/client';
import { openRecordForm } from '../records/openRecordForm';
import type { ReminderTarget } from './reminders';

// 점검 알림은 서버가 판단하고 Expo Push로 보낸다 (supabase/functions/send-reminders). 이 파일은 앱 쪽
// 몫만 맡는다: 알림 채널·표시 방식, 푸시 토큰을 서버에 등록/해제, 알림을 눌렀을 때 이동.
// 규칙 판단이나 알림 예약은 앱에서 하지 않는다.

export const CHANNEL_ID = 'reminders';
const PUSH_TOKEN_KEY = 'push_token';

// 앱이 켜져 있을 때 도착한 알림도 배너로 보여준다. 소리·배지는 쓰지 않는다 (조용한 점검 알림).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// 서버가 보내는 푸시의 channelId가 가리키는 채널 — 알림이 오기 전에 만들어져 있어야 한다.
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '점검 알림',
    description: '응애 재검사, 방제 후 확인, 월동 준비, 봉세 변화 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (await hasNotificationPermission()) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// 이전 버전은 규칙 알림을 기기에 직접 예약했다. 지금은 서버 푸시가 유일한 발송 경로라서, 예전에
// 예약돼 남아 있는 로컬 알림이 서버 알림과 겹쳐 울리지 않도록 업데이트 후 실행 때 모두 지운다
// (예약된 로컬 알림은 앱 업데이트 후에도 OS에 남는다).
export async function cancelLegacyLocalReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'not_device' | 'no_permission' | 'no_project' }
  | { status: 'error'; message: string };

// Expo 푸시 토큰을 받아 서버(push_devices)에 등록한다. 토큰이 바뀌었거나(재설치·OS 갱신) 다른 계정으로
// 로그인했으면 같은 호출로 갱신·이전된다 (서버 RPC가 토큰 기준으로 upsert). 앱 시작·포그라운드·
// 동의 변경 때마다 불러도 안전하다.
export async function registerForPush(): Promise<PushRegistration> {
  // 시뮬레이터/에뮬레이터에서는 푸시 토큰을 받을 수 없다.
  if (!Device.isDevice) return { status: 'not_device' };
  try {
    if (!(await hasNotificationPermission())) return { status: 'no_permission' };
    await ensureAndroidChannel();

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { status: 'no_project' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : null,
    });
    if (error) throw new Error(error.message);

    await setAppMetaValue(PUSH_TOKEN_KEY, token);
    return { status: 'registered', token };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[push] registration failed:', message);
    return { status: 'error', message };
  }
}

// 로그아웃할 때 이 기기의 토큰을 서버에서 지워서, 이 기기가 이전 계정의 알림을 계속 받지 않게 한다.
// 네트워크가 없어도 로그아웃은 막지 않는다 (실패해도 같은 기기에서 다른 계정이 토큰을 등록하면 서버가
// 그 계정으로 옮긴다).
export async function unregisterPush(): Promise<void> {
  try {
    const token = await getAppMetaValue(PUSH_TOKEN_KEY);
    if (!token) return;
    const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
    if (error) console.warn('[push] unregister failed:', error.message);
  } catch (err) {
    console.warn('[push] unregister failed:', err instanceof Error ? err.message : err);
  }
}

// 알림을 눌렀을 때 — 단순 안내가 아니라 바로 그 봉군의 점검 화면으로 들어간다. (서버 푸시도 로컬
// 알림 때와 같은 target 모양을 보내므로 이 이동 규칙은 그대로다.)
export function openReminderTarget(target: ReminderTarget): void {
  switch (target.kind) {
    case 'record':
      void openRecordForm({ apiaryId: target.apiaryId, colonyId: target.colonyId, recordType: target.recordType });
      return;
    case 'pick_colony':
      router.push({ pathname: '/health/pick-colony', params: { recordType: target.recordType } });
      return;
    case 'colony':
      router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId: target.colonyId } });
      return;
    case 'colonies':
      router.push('/(tabs)/colonies');
      return;
    case 'wintering':
      router.push('/health/wintering');
      return;
  }
}

export function targetFromResponse(response: Notifications.NotificationResponse): ReminderTarget | null {
  const data = response.notification.request.content.data as { target?: ReminderTarget } | undefined;
  return data?.target ?? null;
}
