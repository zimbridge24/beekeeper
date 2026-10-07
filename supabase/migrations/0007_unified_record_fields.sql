-- 비히어로(BeeHero) — 응애·말벌·월동을 수동 입력 / AI 음성 / 사진 AI가 모두 같은 기록
-- 구조(records + record_field_values)로 저장하도록 확장한다.
-- Mirrors src/db/migrations/0006_*.sql. Apply via the Supabase SQL Editor or `supabase db push`.
--
-- 기존 앱 버전과 호환된다: 허용값을 "늘리기만" 하고 줄이지 않으며, 새 컬럼은 전부 nullable이다.
-- 이미 저장된 기록(예전 pest_disease의 응애·말벌 필드, 있음/없음으로 저장된 봉세 등)은
-- 그대로 읽힌다.

-- 1) records: 새 기록 유형 · 입력 방법 · 같은 발화에서 나온 기록 묶음
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'records'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%record_type%' or pg_get_constraintdef(oid) ilike '%input_method%')
  loop
    execute format('alter table records drop constraint %I', con.conname);
  end loop;
end $$;

alter table records
  add constraint records_record_type_check check (record_type in (
    'general_observation', 'mite', 'hornet', 'pest_disease', 'treatment', 'feeding',
    'swarm_split_requeen', 'wintering_prep', 'wintering_dissolution', 'honey_harvest'
  )),
  add constraint records_input_method_check check (input_method in ('voice_ai', 'quick_select', 'photo_ai'));

-- 음성 한 번으로 여러 영역(상태·응애·말벌·급이…)이 구조화되면 영역마다 기록이 하나씩
-- 생기고, 대표 기록의 id를 공유한다. FK는 걸지 않는다 (동기화 순서와 무관하게 푸시되도록).
alter table records add column if not exists capture_group_id uuid;
create index if not exists idx_records_capture_group on records (capture_group_id);

-- 2) record_field_values: 새 필드 종류가 쓰는 값 토큰 + 수치/텍스트 AI 초안 보존
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'record_field_values'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%value_state%'
  loop
    execute format('alter table record_field_values drop constraint %I', con.conname);
  end loop;
end $$;

alter table record_field_values
  add column if not exists ai_draft_value_number double precision,
  add column if not exists ai_draft_value_text text;

alter table record_field_values
  add constraint record_field_values_value_state_check check (value_state in (
    'present', 'absent', 'unknown',
    'not_tested', 'tested_negative', 'tested_positive', 'indeterminate',
    'done', 'not_done',
    'asian_hornet', 'giant_hornet', 'other', 'unknown_species',
    'none', 'few_1_5', 'several_6_20', 'many_20_plus',
    'strong', 'normal', 'weak', 'enough', 'low', 'partial', 'good', 'needs_check',
    'survived', 'weak_survived', 'lost',
    'sugar_roll', 'alcohol_wash', 'sticky_board', 'drone_brood', 'visual', 'other_method',
    'sugar_syrup', 'pollen_cake', 'honey_feed', 'other_feed', 'kg', 'liter',
    'unset'
  )),
  add constraint record_field_values_ai_draft_value_state_check check (ai_draft_value_state is null or ai_draft_value_state in (
    'present', 'absent', 'unknown',
    'not_tested', 'tested_negative', 'tested_positive', 'indeterminate',
    'done', 'not_done',
    'asian_hornet', 'giant_hornet', 'other', 'unknown_species',
    'none', 'few_1_5', 'several_6_20', 'many_20_plus',
    'strong', 'normal', 'weak', 'enough', 'low', 'partial', 'good', 'needs_check',
    'survived', 'weak_survived', 'lost',
    'sugar_roll', 'alcohol_wash', 'sticky_board', 'drone_brood', 'visual', 'other_method',
    'sugar_syrup', 'pollen_cake', 'honey_feed', 'other_feed', 'kg', 'liter',
    'unset'
  ));

-- 3) ai_analyses: 사진 AI 판독의 "출처" 메타데이터. 판독으로 채워진 값 자체는 위의
-- records + record_field_values에 (다른 입력 방법과 똑같이) 저장되고, 여기에는 필드로
-- 표현되지 않는 신뢰도 · 사진 품질 · 재촬영 필요 여부 · 원본 응답만 남긴다.
create table if not exists ai_analyses (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  kind text not null check (kind in ('mite_photo', 'hornet_photo', 'wintering_photo')),
  confidence text check (confidence is null or confidence in ('low', 'medium', 'high')),
  photo_quality text check (photo_quality is null or photo_quality in ('good', 'fair', 'poor')),
  retake_needed boolean not null default false,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_analyses_user_updated on ai_analyses (user_id, updated_at);
create index if not exists idx_ai_analyses_record on ai_analyses (record_id);

alter table ai_analyses enable row level security;
create policy "select own ai_analyses" on ai_analyses for select using (auth.uid() = user_id);
create policy "insert own ai_analyses" on ai_analyses for insert with check (auth.uid() = user_id);
create policy "update own ai_analyses" on ai_analyses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own ai_analyses" on ai_analyses for delete using (auth.uid() = user_id);
create trigger trg_ai_analyses_set_updated_at before update on ai_analyses for each row execute function set_updated_at();
