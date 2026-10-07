// 점검 알림 서버 로직의 핵심. DB와 Expo Push는 아래 인터페이스 뒤에 숨겨 두어서(실제 구현은 index.ts)
// 이 파일은 Deno·네트워크 없이 그대로 테스트할 수 있다.
//
// 흐름 (사용자 한 명):
//   현지 오전 9시 이후 & 오늘 아직 평가 안 함 & 유효한 기기가 있음
//   → 서버 DB의 최신 기록으로 규칙 엔진(reminders.ts, 앱과 같은 코드)을 돌려 "오늘 보낼 알림"을 고름
//   → 조건 키를 선점(중복 방지) → Expo Push로 발송 → 발송 기록
//
// 규칙·문구·묶기·예외는 전부 앱과 같은 reminders.ts가 정한다. 여기서는 "언제 평가하고, 보낸 걸
// 어떻게 기록하며, 실패하면 어떻게 되돌리는가"만 책임진다.

import { HealthSource } from '../_shared/facts.ts';
import { planReminders, PlannedReminder, ReminderCategory, ReminderSettings, ReminderState } from '../_shared/reminders.ts';
import { wallClock, wallToTs } from '../_shared/time.ts';

export type SettingsRow = {
  user_id: string;
  consent: 'granted' | 'declined' | null;
  mite: boolean;
  post_treatment: boolean;
  wintering: boolean;
  trend: boolean;
  timezone: string;
  last_evaluated_on: string | null;
};

export type Device = { id: string; token: string };

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: string;
  sound: 'default';
  priority: 'high';
};

export type Ticket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };
export type Receipt = { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

export type DeliveryRecord = {
  id: string;
  user_id: string;
  category: ReminderCategory;
  title: string;
  body: string;
  target: unknown;
  condition_keys: string[];
};

export interface Store {
  listConsentedUsers(onlyUserId?: string): Promise<SettingsRow[]>;
  validDevices(userId: string): Promise<Device[]>;
  loadSource(userId: string, now: number, tz: number): Promise<HealthSource>;
  loadClaimedKeys(userId: string): Promise<string[]>;
  createDelivery(row: DeliveryRecord): Promise<void>;
  // 모든 키를 한 번에 선점한다. 하나라도 이미 선점돼 있으면 아무것도 선점하지 않고 false.
  claim(userId: string, keys: string[], deliveryId: string): Promise<boolean>;
  releaseClaims(userId: string, keys: string[]): Promise<void>;
  finishDelivery(id: string, patch: { status: 'sent' | 'failed'; tickets?: { token: string; id: string }[]; error?: string | null }): Promise<void>;
  deleteDelivery(id: string): Promise<void>;
  markEvaluated(userId: string, localDate: string): Promise<void>;
  invalidateDevice(token: string, reason: string): Promise<void>;
  deliveriesAwaitingReceipts(olderThanMs: number, limit: number): Promise<{ id: string; created_at: number; tickets: { token: string; id: string }[] }[]>;
  markReceiptsChecked(id: string): Promise<void>;
}

export interface Expo {
  send(messages: PushMessage[]): Promise<Ticket[]>;
  receipts(ids: string[]): Promise<Record<string, Receipt>>;
}

export type JobOptions = {
  now: number;
  // 아무것도 선점·발송하지 않고 "보낼 알림"만 계산한다.
  dryRun?: boolean;
  // 이 사용자만 처리한다 (테스트·운영 확인용).
  userId?: string;
  // 현지 시각 9시 이전/오늘 이미 평가함 제한을 무시한다 (테스트용).
  force?: boolean;
};

export type UserResult = {
  userId: string;
  skipped?: 'outside_window' | 'already_evaluated' | 'no_device' | 'all_categories_off';
  planned?: { key: string; category: string; title: string; body: string; target: unknown; memberKeys: string[] }[];
  sent: number;
  failed: number;
  duplicates: number;
};

export const CHANNEL_ID = 'reminders';
export const SEND_WINDOW = { startHour: 9, endHour: 21 };
const RECEIPT_DELAY_MS = 15 * 60_000;
const RECEIPT_GIVE_UP_MS = 24 * 3_600_000;

// 'Asia/Seoul' 같은 IANA 시간대의 그 시점 UTC 오프셋(분). 알 수 없는 이름이면 Asia/Seoul(540).
export function tzOffsetMinutes(timeZone: string, at: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000);
  } catch {
    return 540;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toReminderSettings(row: SettingsRow): ReminderSettings {
  return {
    consent: row.consent,
    categories: { mite: row.mite, post_treatment: row.post_treatment, wintering: row.wintering, trend: row.trend },
  };
}

function makeMessage(token: string, plan: PlannedReminder): PushMessage {
  return {
    to: token,
    title: plan.title,
    body: plan.body,
    // 앱이 알림을 눌렀을 때 쓰는 값 — 로컬 알림 때와 같은 모양이라 기존 딥링크가 그대로 동작한다.
    data: { target: plan.target, key: plan.key },
    channelId: CHANNEL_ID,
    sound: 'default',
    priority: 'high',
  };
}

export async function runReminderJob(store: Store, expo: Expo, opts: JobOptions): Promise<{ receiptsChecked: number; users: UserResult[] }> {
  const receiptsChecked = opts.dryRun ? 0 : await checkReceipts(store, expo, opts.now);
  const users: UserResult[] = [];

  for (const row of await store.listConsentedUsers(opts.userId)) {
    users.push(await processUser(store, expo, row, opts));
  }
  return { receiptsChecked, users };
}

async function processUser(store: Store, expo: Expo, row: SettingsRow, opts: JobOptions): Promise<UserResult> {
  const result: UserResult = { userId: row.user_id, sent: 0, failed: 0, duplicates: 0 };
  const settings = toReminderSettings(row);

  if (!Object.values(settings.categories).some(Boolean)) return { ...result, skipped: 'all_categories_off' };

  const tz = tzOffsetMinutes(row.timezone, opts.now);
  const local = wallClock(opts.now, tz);
  const localDate = `${local.year}-${pad(local.month)}-${pad(local.day)}`;

  if (!opts.force) {
    if (local.hour < SEND_WINDOW.startHour || local.hour >= SEND_WINDOW.endHour) return { ...result, skipped: 'outside_window' };
    if (row.last_evaluated_on === localDate) return { ...result, skipped: 'already_evaluated' };
  }

  const devices = await store.validDevices(row.user_id);
  // 받을 기기가 없으면 평가하지 않는다 — 나중에 기기가 등록되면 같은 날에도 처리된다.
  if (devices.length === 0) return { ...result, skipped: 'no_device' };

  // "오늘 오전 9시 직전"을 평가 시점으로 삼는다. 그러면 규칙 엔진이 말하는 "다음 오전 9시"가
  // 곧 오늘 9시가 되어, 지금 조건이 충족된 알림은 fireAt = 오늘 9시, 앞으로 충족될 알림(예: 3주치
  // 월동 알림)은 그 이후 날짜가 된다. 서버는 오늘 9시인 것만 보낸다 — 크론이 늦거나 하루를 놓쳐도
  // 조건이 아직 유효하면 다음 실행에서 그대로 따라잡는다.
  const today9 = wallToTs(local.year, local.month, local.day, SEND_WINDOW.startHour, tz);
  const evalNow = today9 - 1;

  const source = await store.loadSource(row.user_id, evalNow, tz);
  const state: ReminderState = Object.fromEntries((await store.loadClaimedKeys(row.user_id)).map((k) => [k, 0]));
  const due = planReminders({ ...source, now: evalNow, tz }, settings, state, evalNow).filter((p) => p.fireAt <= today9);

  if (opts.dryRun) {
    return { ...result, planned: due.map((p) => ({ key: p.key, category: p.category, title: p.title, body: p.body, target: p.target, memberKeys: p.memberKeys })) };
  }

  let transientFailure = false;
  for (const plan of due) {
    const outcome = await deliver(store, expo, row.user_id, devices, plan);
    if (outcome === 'sent') result.sent++;
    else if (outcome === 'duplicate') result.duplicates++;
    else {
      result.failed++;
      // 일시적인 실패(Expo 오류 등)면 오늘 평가를 "끝난 것"으로 치지 않아 다음 시간에 다시 시도한다.
      if (outcome === 'failed') transientFailure = true;
    }
  }

  if (opts.force) return result;
  if (!transientFailure) await store.markEvaluated(row.user_id, localDate);
  return result;
}

type Outcome = 'sent' | 'duplicate' | 'failed' | 'undeliverable';

async function deliver(store: Store, expo: Expo, userId: string, devices: Device[], plan: PlannedReminder): Promise<Outcome> {
  const deliveryId = crypto.randomUUID();
  await store.createDelivery({
    id: deliveryId,
    user_id: userId,
    category: plan.category,
    title: plan.title,
    body: plan.body,
    target: plan.target,
    condition_keys: plan.memberKeys,
  });

  // 같은 조건을 동시에 두 번 보내지 않도록, 보내기 전에 조건 키를 먼저 선점한다.
  if (!(await store.claim(userId, plan.memberKeys, deliveryId))) {
    await store.deleteDelivery(deliveryId);
    return 'duplicate';
  }

  let tickets: Ticket[];
  try {
    tickets = await expo.send(devices.map((d) => makeMessage(d.token, plan)));
  } catch (err) {
    // Expo에 아예 닿지 못함 — 아무도 못 받았으니 선점을 풀어서 다음에 다시 보낼 수 있게 한다.
    await store.releaseClaims(userId, plan.memberKeys);
    await store.finishDelivery(deliveryId, { status: 'failed', error: err instanceof Error ? err.message : String(err) });
    return 'failed';
  }

  const accepted: { token: string; id: string }[] = [];
  const errors: string[] = [];
  for (const [i, ticket] of tickets.entries()) {
    const device = devices[i];
    if (ticket.status === 'ok') {
      accepted.push({ token: device.token, id: ticket.id });
    } else {
      const code = ticket.details?.error ?? ticket.message ?? 'unknown_error';
      errors.push(code);
      // 만료·등록 해제된 토큰은 더 이상 보내지 않는다.
      if (code === 'DeviceNotRegistered') await store.invalidateDevice(device.token, code);
    }
  }

  if (accepted.length === 0) {
    // 받을 수 있는 기기가 하나도 없었다. 나중에 새 토큰이 등록되면 다시 보낼 수 있게 선점을 푼다.
    await store.releaseClaims(userId, plan.memberKeys);
    await store.finishDelivery(deliveryId, { status: 'failed', error: errors.join(', ') });
    return errors.every((e) => e === 'DeviceNotRegistered') ? 'undeliverable' : 'failed';
  }

  await store.finishDelivery(deliveryId, { status: 'sent', tickets: accepted, error: errors.length ? errors.join(', ') : null });
  return 'sent';
}

// Expo 영수증 확인 — 티켓은 "Expo가 받았다"일 뿐이고, 실제 기기 전달 실패(특히 토큰 만료)는
// 영수증에 나온다. 15분 이후에 확인해서 만료된 토큰을 무효 처리한다.
async function checkReceipts(store: Store, expo: Expo, now: number): Promise<number> {
  const pending = await store.deliveriesAwaitingReceipts(now - RECEIPT_DELAY_MS, 100);
  if (pending.length === 0) return 0;

  const tokenByTicket = new Map<string, string>();
  for (const d of pending) for (const t of d.tickets) tokenByTicket.set(t.id, t.token);

  let receipts: Record<string, Receipt> = {};
  try {
    receipts = await expo.receipts(Array.from(tokenByTicket.keys()));
  } catch {
    return 0; // 다음 실행에서 다시 확인한다.
  }

  for (const d of pending) {
    let settled = true;
    for (const t of d.tickets) {
      const receipt = receipts[t.id];
      if (!receipt) {
        // 아직 영수증이 없다. 하루가 지나도 없으면 포기한다.
        if (now - d.created_at < RECEIPT_GIVE_UP_MS) settled = false;
        continue;
      }
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        await store.invalidateDevice(t.token, 'DeviceNotRegistered');
      }
    }
    if (settled) await store.markReceiptsChecked(d.id);
  }
  return pending.length;
}
