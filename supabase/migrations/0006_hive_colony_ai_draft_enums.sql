-- 비히어로(BeeHero) — Hive/Colony 분리, AI 초안 보존, 필드별 상태값 확장,
-- 말벌 관찰 필드. Mirrors src/db/migrations/0005_nervous_vanisher.sql.

-- 1) Hive(물리적 벌통)를 Colony(생물학적 봉군)와 별개 엔티티로 분리.
create table if not exists hives (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  apiary_id uuid not null references apiaries(id) on delete cascade,
  code text not null,
  is_archived boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apiary_id, code)
);

create index if not exists idx_hives_user_updated on hives (user_id, updated_at);
create index if not exists idx_hives_apiary on hives (apiary_id, is_archived);

alter table hives enable row level security;
create policy "select own hives" on hives for select using (auth.uid() = user_id);
create policy "insert own hives" on hives for insert with check (auth.uid() = user_id);
create policy "update own hives" on hives for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own hives" on hives for delete using (auth.uid() = user_id);
create trigger trg_hives_set_updated_at before update on hives for each row execute function set_updated_at();

-- 봉군이 벌통을 옮기거나 벌통에 새 봉군이 들어와도, 이 이력 테이블 덕분에
-- 두 엔티티 모두 자신의 장기 이력을 유지한다. ended_at이 null인 행이 현재
-- 유효한 배정 — 부분 유니크 인덱스로 봉군/벌통 각각 활성 배정이 최대 1개임을
-- 보장한다.
create table if not exists colony_hive_assignments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  colony_id uuid not null references colonies(id) on delete cascade,
  hive_id uuid not null references hives(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cha_user_updated on colony_hive_assignments (user_id, updated_at);
create index if not exists idx_cha_colony on colony_hive_assignments (colony_id, started_at);
create index if not exists idx_cha_hive on colony_hive_assignments (hive_id, started_at);
create unique index if not exists cha_colony_open_unique on colony_hive_assignments (colony_id) where ended_at is null;
create unique index if not exists cha_hive_open_unique on colony_hive_assignments (hive_id) where ended_at is null;

alter table colony_hive_assignments enable row level security;
create policy "select own colony_hive_assignments" on colony_hive_assignments for select using (auth.uid() = user_id);
create policy "insert own colony_hive_assignments" on colony_hive_assignments for insert with check (auth.uid() = user_id);
create policy "update own colony_hive_assignments" on colony_hive_assignments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own colony_hive_assignments" on colony_hive_assignments for delete using (auth.uid() = user_id);
create trigger trg_cha_set_updated_at before update on colony_hive_assignments for each row execute function set_updated_at();

-- 2) record_field_values: value_state를 필드별 kind에 맞는 어휘까지 허용하도록
-- 확장(응애 감염 같은 검사형 필드는 not_tested/tested_positive/... 등을 쓴다 —
-- src/features/records/recordTypesConfig.ts의 FieldKind 참고), + AI 초안 보존용
-- ai_draft_value_state 컬럼 추가.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'record_field_values'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%value_state%'
      and pg_get_constraintdef(oid) not ilike '%ai_draft%'
  loop
    execute format('alter table record_field_values drop constraint %I', con.conname);
  end loop;
end $$;

alter table record_field_values
  add column if not exists ai_draft_value_state text;

alter table record_field_values
  add constraint record_field_values_value_state_check check (value_state in (
    'present', 'absent', 'unknown',
    'not_tested', 'tested_negative', 'tested_positive', 'indeterminate',
    'done', 'not_done',
    'asian_hornet', 'giant_hornet', 'other', 'unknown_species',
    'none', 'few_1_5', 'several_6_20', 'many_20_plus',
    'unset'
  ));

alter table record_field_values
  add constraint record_field_values_ai_draft_value_state_check check (ai_draft_value_state is null or ai_draft_value_state in (
    'present', 'absent', 'unknown',
    'not_tested', 'tested_negative', 'tested_positive', 'indeterminate',
    'done', 'not_done',
    'asian_hornet', 'giant_hornet', 'other', 'unknown_species',
    'none', 'few_1_5', 'several_6_20', 'many_20_plus',
    'unset'
  ));

-- 3) record_transcripts: AI가 최초로 제안한 record_type/colony_id/notes를
-- 사용자 수정 후에도 잃지 않도록 별도 컬럼으로 보존 (원본 음성/STT/AI 초안/
-- 사용자 확정값 네 가지를 항상 구분해서 저장하기 위함).
alter table record_transcripts
  add column if not exists ai_draft_record_type text,
  add column if not exists ai_draft_colony_id uuid,
  add column if not exists ai_draft_notes text;
