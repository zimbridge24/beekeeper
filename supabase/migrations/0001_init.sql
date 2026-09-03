-- 비히어로(BeeHero) — foundation slice: apiaries + colonies mirrored from
-- the local SQLite source of truth. Apply via the Supabase SQL Editor or
-- `supabase db push` (requires the CLI to be linked to this project).

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists apiaries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  memo text,
  is_archived boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_apiaries_user_updated on apiaries (user_id, updated_at);

alter table apiaries enable row level security;

create policy "select own apiaries" on apiaries for select using (auth.uid() = user_id);
create policy "insert own apiaries" on apiaries for insert with check (auth.uid() = user_id);
create policy "update own apiaries" on apiaries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own apiaries" on apiaries for delete using (auth.uid() = user_id);

create trigger trg_apiaries_set_updated_at
  before update on apiaries
  for each row execute function set_updated_at();

create table if not exists colonies (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  apiary_id uuid not null references apiaries(id) on delete cascade,
  internal_code text not null,
  alias text not null,
  species text not null default 'western' check (species in ('western', 'native')),
  is_archived boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apiary_id, internal_code)
);

create index if not exists idx_colonies_user_updated on colonies (user_id, updated_at);
create index if not exists idx_colonies_apiary on colonies (apiary_id, is_archived);

alter table colonies enable row level security;

create policy "select own colonies" on colonies for select using (auth.uid() = user_id);
create policy "insert own colonies" on colonies for insert with check (auth.uid() = user_id);
create policy "update own colonies" on colonies for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own colonies" on colonies for delete using (auth.uid() = user_id);

create trigger trg_colonies_set_updated_at
  before update on colonies
  for each row execute function set_updated_at();
