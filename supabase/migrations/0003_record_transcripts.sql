-- 비히어로(BeeHero) — voice record transcripts. Mirrors
-- src/db/migrations/0002_mushy_plazm.sql. audio_local_uri stays local-only
-- (never synced) since this phase's STT/AI are mocks with no real audio
-- file to upload yet; audio_remote_path is reserved for when a real
-- provider is wired in.

create table if not exists record_transcripts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  audio_remote_path text,
  audio_duration_sec double precision,
  raw_transcript text,
  structuring_status text not null default 'pending_transcription' check (structuring_status in (
    'pending_transcription', 'transcribing', 'pending_structuring', 'structuring', 'structured', 'failed'
  )),
  ai_confidence_score double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_id)
);

create index if not exists idx_record_transcripts_user_updated on record_transcripts (user_id, updated_at);
create index if not exists idx_record_transcripts_record on record_transcripts (record_id);

alter table record_transcripts enable row level security;
create policy "select own record_transcripts" on record_transcripts for select using (auth.uid() = user_id);
create policy "insert own record_transcripts" on record_transcripts for insert with check (auth.uid() = user_id);
create policy "update own record_transcripts" on record_transcripts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own record_transcripts" on record_transcripts for delete using (auth.uid() = user_id);
create trigger trg_record_transcripts_set_updated_at before update on record_transcripts for each row execute function set_updated_at();
