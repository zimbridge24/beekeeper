-- 비히어로(BeeHero) — visit + quick-select record tracking. Mirrors
-- src/db/migrations/0001_fuzzy_shatterstar.sql. Apply via the Supabase SQL
-- Editor or `supabase db push`.

create table if not exists visits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  apiary_id uuid not null references apiaries(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  latitude double precision,
  longitude double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_visits_user_updated on visits (user_id, updated_at);
create index if not exists idx_visits_apiary on visits (apiary_id, started_at);

alter table visits enable row level security;
create policy "select own visits" on visits for select using (auth.uid() = user_id);
create policy "insert own visits" on visits for insert with check (auth.uid() = user_id);
create policy "update own visits" on visits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own visits" on visits for delete using (auth.uid() = user_id);
create trigger trg_visits_set_updated_at before update on visits for each row execute function set_updated_at();

create table if not exists visit_colonies (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_id uuid not null references visits(id) on delete cascade,
  colony_id uuid not null references colonies(id) on delete cascade,
  sequence_order integer not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id, colony_id)
);

create index if not exists idx_visit_colonies_user_updated on visit_colonies (user_id, updated_at);
create index if not exists idx_visit_colonies_visit on visit_colonies (visit_id, sequence_order);

alter table visit_colonies enable row level security;
create policy "select own visit_colonies" on visit_colonies for select using (auth.uid() = user_id);
create policy "insert own visit_colonies" on visit_colonies for insert with check (auth.uid() = user_id);
create policy "update own visit_colonies" on visit_colonies for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own visit_colonies" on visit_colonies for delete using (auth.uid() = user_id);
create trigger trg_visit_colonies_set_updated_at before update on visit_colonies for each row execute function set_updated_at();

create table if not exists records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_id uuid not null references visits(id) on delete cascade,
  colony_id uuid not null references colonies(id) on delete cascade,
  input_method text not null check (input_method in ('voice_ai', 'quick_select')),
  record_type text not null check (record_type in (
    'general_observation', 'pest_disease', 'feeding', 'treatment',
    'honey_harvest', 'swarm_split_requeen', 'wintering_dissolution'
  )),
  confirmation_status text not null default 'confirmed' check (confirmation_status in ('draft', 'confirmed')),
  notes text,
  occurred_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_records_user_updated on records (user_id, updated_at);
create index if not exists idx_records_colony on records (colony_id, occurred_at);
create index if not exists idx_records_visit on records (visit_id);

alter table records enable row level security;
create policy "select own records" on records for select using (auth.uid() = user_id);
create policy "insert own records" on records for insert with check (auth.uid() = user_id);
create policy "update own records" on records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own records" on records for delete using (auth.uid() = user_id);
create trigger trg_records_set_updated_at before update on records for each row execute function set_updated_at();

create table if not exists record_field_values (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  category text not null check (category in ('observation', 'problem', 'action', 'result')),
  field_key text not null,
  value_state text not null default 'unset' check (value_state in ('present', 'absent', 'unknown', 'unset')),
  value_text text,
  value_number double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_id, field_key)
);

create index if not exists idx_record_field_values_user_updated on record_field_values (user_id, updated_at);
create index if not exists idx_record_field_values_record on record_field_values (record_id);

alter table record_field_values enable row level security;
create policy "select own record_field_values" on record_field_values for select using (auth.uid() = user_id);
create policy "insert own record_field_values" on record_field_values for insert with check (auth.uid() = user_id);
create policy "update own record_field_values" on record_field_values for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own record_field_values" on record_field_values for delete using (auth.uid() = user_id);
create trigger trg_record_field_values_set_updated_at before update on record_field_values for each row execute function set_updated_at();
