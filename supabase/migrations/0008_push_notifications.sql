-- 비히어로(BeeHero) — 서버 주도 점검 푸시 알림 (응애 재검사 · 방제 후 재확인 · 월동 준비 · 봉군 상태 변화).
-- 알림 판단은 Edge Function(send-reminders)이 서버 DB의 최신 기록으로 하고, 발송은 Expo Push로 한다.
-- 앱(기기)은 설정과 푸시 토큰만 서버에 맡긴다. 규칙 자체는 src/features/health/reminders.ts 를
-- supabase/functions/_shared/ 로 복사해서 쓴다 (npm run sync:ai-catalog).

-- 1) 알림 설정 — 사용자당 한 행. 동의 전(consent is null)·거절(declined)이면 어떤 알림도 가지 않는다.
create table if not exists notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- null = 아직 한 번도 안 물어봄 / granted = 동의 / declined = 동의 안 함(설정에서 나중에 켤 수 있음)
  consent text check (consent in ('granted', 'declined')),
  mite boolean not null default true,
  post_treatment boolean not null default true,
  wintering boolean not null default true,
  trend boolean not null default true,
  -- 발송 시각(현지 오전 9시)의 기준 시간대. 지금은 한국만 쓰지만 사용자별로 확장할 수 있게 컬럼만 둔다.
  timezone text not null default 'Asia/Seoul',
  -- 서버가 이 사용자의 규칙을 마지막으로 평가한 "현지 날짜" — 하루에 한 번만 평가하게 한다.
  last_evaluated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notification_settings enable row level security;
create policy "select own notification_settings" on notification_settings for select using (auth.uid() = user_id);
create policy "insert own notification_settings" on notification_settings for insert with check (auth.uid() = user_id);
create policy "update own notification_settings" on notification_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_notification_settings_set_updated_at before update on notification_settings for each row execute function set_updated_at();

-- 2) 푸시 토큰 — 기기 하나당 한 행(토큰이 유일). 쓰기는 아래 RPC로만 한다.
create table if not exists push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Expo가 "더 이상 유효하지 않은 토큰"(DeviceNotRegistered)이라고 알려주면 채운다. 재등록하면 비워진다.
  invalid_at timestamptz,
  invalid_reason text
);

create index if not exists idx_push_devices_user_valid on push_devices (user_id) where invalid_at is null;

alter table push_devices enable row level security;
create policy "select own push_devices" on push_devices for select using (auth.uid() = user_id);

-- 토큰 등록/갱신. 같은 기기가 다른 계정으로 다시 로그인하면 토큰은 새 계정으로 넘어간다
-- (그래서 RLS를 우회하는 security definer — 토큰의 이전 소유자를 직접 바꿀 수 있는 건 이 함수뿐).
create or replace function register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'invalid expo push token';
  end if;

  insert into push_devices (user_id, expo_push_token, platform)
  values (auth.uid(), p_token, case when p_platform in ('android', 'ios') then p_platform else null end)
  on conflict (expo_push_token) do update
    set user_id = auth.uid(),
        platform = coalesce(excluded.platform, push_devices.platform),
        last_seen_at = now(),
        invalid_at = null,
        invalid_reason = null;
end;
$$;

-- 로그아웃할 때 이 기기의 토큰을 지운다. 본인 토큰만 지울 수 있다.
create or replace function unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_devices where expo_push_token = p_token and user_id = auth.uid();
$$;

revoke all on function register_push_token(text, text) from public;
revoke all on function unregister_push_token(text) from public;
grant execute on function register_push_token(text, text) to authenticated;
grant execute on function unregister_push_token(text) to authenticated;

-- 3) 이미 알림을 보낸 "조건" — (사용자, 조건 키)가 기본키라서 같은 조건은 한 번만 보낸다.
-- 조건 키는 규칙 엔진이 만든다 (예: mite:<colony>:<마지막 검사 시각>, wintering:<연도>:<주차>) —
-- 규칙 주기(마지막 검사·방제·내검 기록)가 바뀌면 키가 바뀌어서 새 조건으로 다시 알린다.
-- 서버(서비스 롤)만 읽고 쓴다.
create table if not exists notification_conditions (
  user_id uuid not null references auth.users(id) on delete cascade,
  condition_key text not null,
  delivery_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, condition_key)
);

alter table notification_conditions enable row level security;

-- 4) 발송 기록 — 무엇을 언제 누구에게 보냈는지, Expo 티켓/영수증 확인 여부. 서버만 읽고 쓴다.
create table if not exists notification_deliveries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('mite', 'post_treatment', 'wintering', 'trend')),
  title text not null,
  body text not null,
  target jsonb not null,
  condition_keys text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  -- 기기별 Expo 티켓: [{ "token": "...", "id": "..." }]
  tickets jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  -- Expo 영수증(실제 기기 전달 결과)을 확인한 시각. null이면 아직 확인 전.
  receipts_checked_at timestamptz
);

create index if not exists idx_notification_deliveries_user on notification_deliveries (user_id, created_at desc);
create index if not exists idx_notification_deliveries_receipts on notification_deliveries (created_at) where status = 'sent' and receipts_checked_at is null;

alter table notification_deliveries enable row level security;
