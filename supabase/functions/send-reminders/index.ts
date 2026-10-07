// 서버 주도 점검 푸시 알림 (응애 재검사 · 방제 후 재확인 · 월동 준비 · 봉군 상태 변화).
//
//   Supabase Cron (매시 정각, 0009_reminder_cron.sql)
//     → 이 함수: 서버 DB의 최신 기록으로 사용자별 규칙을 판단
//     → Expo Push Service → 사용자 기기
//
// 판단 규칙은 앱과 같은 코드다 (src/features/health/reminders.ts → _shared/ 복사본).
// 사용자 JWT가 아니라 크론 비밀키(x-cron-secret)로만 호출할 수 있다 — 서비스 롤로 모든
// 사용자의 기록을 읽으므로 그 외에는 열려 있으면 안 된다.
//
// Deploy:  npm run sync:ai-catalog && supabase functions deploy send-reminders --no-verify-jwt
// Secrets: CRON_SECRET        — 크론이 보내는 x-cron-secret과 같은 값 (Vault의 reminders_cron_secret과 동일)
//          EXPO_ACCESS_TOKEN  — 선택. Expo의 "Enhanced Push Security"를 켠 경우에만.
//
// 호출 본문 (모두 선택):
//   { "dryRun": true, "userId": "<uuid>", "force": true }   보낼 알림만 계산해서 보여준다 (아무것도 선점·발송 안 함)
//   { "action": "test", "userId": "<uuid>" }                 그 사용자의 유효한 기기에 시험 알림 한 건을 보낸다

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { ANALYSIS_FIELD_KEYS, HealthSource } from '../_shared/facts.ts';
import {
  CHANNEL_ID,
  DeliveryRecord,
  Device,
  Expo,
  PushMessage,
  Receipt,
  runReminderJob,
  SettingsRow,
  Store,
  Ticket,
} from './core.ts';

const EXPO_BASE = 'https://exp.host/--/api/v2/push';
const PAGE = 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// 길이와 상관없이 같은 시간이 걸리게 비교한다 (비밀키 추측 공격 방지).
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const token = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const expo: Expo = {
  async send(messages: PushMessage[]): Promise<Ticket[]> {
    const res = await fetch(`${EXPO_BASE}/send`, { method: 'POST', headers: expoHeaders(), body: JSON.stringify(messages) });
    if (!res.ok) throw new Error(`Expo push send failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    if (!Array.isArray(json.data) || json.data.length !== messages.length) throw new Error('Expo push returned an unexpected response');
    return json.data as Ticket[];
  },
  async receipts(ids: string[]): Promise<Record<string, Receipt>> {
    const out: Record<string, Receipt> = {};
    for (let i = 0; i < ids.length; i += 300) {
      const res = await fetch(`${EXPO_BASE}/getReceipts`, { method: 'POST', headers: expoHeaders(), body: JSON.stringify({ ids: ids.slice(i, i + 300) }) });
      if (!res.ok) throw new Error(`Expo getReceipts failed: ${res.status}`);
      Object.assign(out, (await res.json()).data ?? {});
    }
    return out;
  },
};

// deno-lint-ignore no-explicit-any
type Db = any;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const ms = (iso: string) => Date.parse(iso);

function makeStore(db: Db): Store {
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  return {
    async listConsentedUsers(onlyUserId) {
      let q = db.from('notification_settings').select('*').eq('consent', 'granted');
      if (onlyUserId) q = q.eq('user_id', onlyUserId);
      const { data, error } = await q;
      check(error);
      return (data ?? []) as SettingsRow[];
    },

    async validDevices(userId): Promise<Device[]> {
      const { data, error } = await db.from('push_devices').select('id, expo_push_token').eq('user_id', userId).is('invalid_at', null);
      check(error);
      return (data ?? []).map((d: { id: string; expo_push_token: string }) => ({ id: d.id, token: d.expo_push_token }));
    },

    // 서버 DB에 동기화된 최신 기록 — 앱을 며칠 안 열었어도 마지막으로 동기화된 상태가 기준이다.
    async loadSource(userId, now, tz): Promise<HealthSource> {
      const colonies = await fetchAll<{ id: string; apiary_id: string; alias: string; species: string; created_at: string }>((from, to) =>
        db.from('colonies').select('id, apiary_id, alias, species, created_at').eq('user_id', userId).is('deleted_at', null).eq('is_archived', false).order('id').range(from, to),
      );
      const records = await fetchAll<{ id: string; colony_id: string; record_type: string; occurred_at: string }>((from, to) =>
        db.from('records').select('id, colony_id, record_type, occurred_at').eq('user_id', userId).is('deleted_at', null).order('id').range(from, to),
      );
      const fieldValues = await fetchAll<{ id: string; record_id: string; field_key: string; value_state: string; value_number: number | null }>((from, to) =>
        db.from('record_field_values').select('id, record_id, field_key, value_state, value_number').eq('user_id', userId).in('field_key', ANALYSIS_FIELD_KEYS).order('id').range(from, to),
      );
      return {
        now,
        tz,
        colonies: colonies.map((c) => ({ id: c.id, apiaryId: c.apiary_id, alias: c.alias, species: c.species, createdAt: ms(c.created_at) })),
        records: records.map((r) => ({ id: r.id, colonyId: r.colony_id, recordType: r.record_type, occurredAt: ms(r.occurred_at) })),
        fieldValues: fieldValues.map((f) => ({ recordId: f.record_id, fieldKey: f.field_key, valueState: f.value_state, valueNumber: f.value_number })),
      };
    },

    async loadClaimedKeys(userId) {
      const rows = await fetchAll<{ condition_key: string }>((from, to) =>
        db.from('notification_conditions').select('condition_key').eq('user_id', userId).order('condition_key').range(from, to),
      );
      return rows.map((r) => r.condition_key);
    },

    async createDelivery(row: DeliveryRecord) {
      const { error } = await db.from('notification_deliveries').insert({ ...row, status: 'pending' });
      check(error);
    },

    // (user_id, condition_key)가 기본키 — 이미 있으면 무시하고, 새로 들어간 행 수가 요청 수와 다르면
    // 누군가 먼저 선점한 것이다. 그 경우 내가 넣은 행만 되돌리고 false.
    async claim(userId, keys, deliveryId) {
      const { data, error } = await db
        .from('notification_conditions')
        .upsert(keys.map((k) => ({ user_id: userId, condition_key: k, delivery_id: deliveryId })), { onConflict: 'user_id,condition_key', ignoreDuplicates: true })
        .select('condition_key');
      check(error);
      const inserted = (data ?? []).map((r: { condition_key: string }) => r.condition_key);
      if (inserted.length === keys.length) return true;
      if (inserted.length > 0) await db.from('notification_conditions').delete().eq('user_id', userId).eq('delivery_id', deliveryId).in('condition_key', inserted);
      return false;
    },

    async releaseClaims(userId, keys) {
      const { error } = await db.from('notification_conditions').delete().eq('user_id', userId).in('condition_key', keys);
      check(error);
    },

    async finishDelivery(id, patch) {
      const { error } = await db
        .from('notification_deliveries')
        .update({ status: patch.status, tickets: patch.tickets ?? [], error: patch.error ?? null })
        .eq('id', id);
      check(error);
    },

    async deleteDelivery(id) {
      await db.from('notification_deliveries').delete().eq('id', id);
    },

    async markEvaluated(userId, localDate) {
      const { error } = await db.from('notification_settings').update({ last_evaluated_on: localDate }).eq('user_id', userId);
      check(error);
    },

    async invalidateDevice(token, reason) {
      const { error } = await db.from('push_devices').update({ invalid_at: new Date().toISOString(), invalid_reason: reason }).eq('expo_push_token', token);
      check(error);
    },

    async deliveriesAwaitingReceipts(olderThanMs, limit) {
      const { data, error } = await db
        .from('notification_deliveries')
        .select('id, created_at, tickets')
        .eq('status', 'sent')
        .is('receipts_checked_at', null)
        .lt('created_at', new Date(olderThanMs).toISOString())
        .order('created_at')
        .limit(limit);
      check(error);
      return (data ?? []).map((d: { id: string; created_at: string; tickets: { token: string; id: string }[] }) => ({ id: d.id, created_at: ms(d.created_at), tickets: d.tickets ?? [] }));
    },

    async markReceiptsChecked(id) {
      const { error } = await db.from('notification_deliveries').update({ receipts_checked_at: new Date().toISOString() }).eq('id', id);
      check(error);
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return jsonResponse({ error: 'CRON_SECRET not configured' }, 500);
  if (!safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) return jsonResponse({ error: 'unauthorized' }, 401);

  let body: { dryRun?: boolean; userId?: string; force?: boolean; action?: string } = {};
  try {
    body = await req.json();
  } catch {
    // 크론은 빈 객체를 보낸다.
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const store = makeStore(db);

  try {
    if (body.action === 'test') {
      if (!body.userId) return jsonResponse({ error: 'userId required' }, 400);
      const devices = await store.validDevices(body.userId);
      if (devices.length === 0) return jsonResponse({ sent: 0, reason: 'no valid device' });
      const messages: PushMessage[] = devices.map((d) => ({
        to: d.token,
        title: '비히어로 시험 알림',
        body: '알림이 정상적으로 도착했어요. 누르면 월동 준비도 화면이 열려요.',
        data: { target: { kind: 'wintering' }, key: 'test' },
        channelId: CHANNEL_ID,
        sound: 'default',
        priority: 'high',
      }));
      const tickets = await expo.send(messages);
      for (const [i, t] of tickets.entries()) {
        if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') await store.invalidateDevice(devices[i].token, 'DeviceNotRegistered');
      }
      return jsonResponse({ sent: tickets.filter((t) => t.status === 'ok').length, tickets });
    }

    const result = await runReminderJob(store, expo, { now: Date.now(), dryRun: body.dryRun, userId: body.userId, force: body.force });
    return jsonResponse(result);
  } catch (err) {
    console.error('[send-reminders] failed', err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
