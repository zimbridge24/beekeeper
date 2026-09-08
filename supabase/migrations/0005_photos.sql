-- 비히어로(BeeHero) — 내검 기록 사진. src/db/migrations/0004_concerned_daredevil.sql를
-- 미러링한다. 실제 이미지 바이트는 이 테이블이 아니라 Storage 버킷
-- inspection-photos에 저장되고, 이 테이블은 그 경로(storage_path)만 참조하는
-- 메타데이터다 — src/sync/photos.ts가 outbox/JSON upsert 경로 대신 별도로
-- 업로드+메타 upsert를 함께 수행한다.

create table if not exists photos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  storage_path text not null,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_photos_user_updated on photos (user_id, updated_at);
create index if not exists idx_photos_record on photos (record_id);

alter table photos enable row level security;
create policy "select own photos" on photos for select using (auth.uid() = user_id);
create policy "insert own photos" on photos for insert with check (auth.uid() = user_id);
create policy "update own photos" on photos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own photos" on photos for delete using (auth.uid() = user_id);
create trigger trg_photos_set_updated_at before update on photos for each row execute function set_updated_at();

-- Storage 버킷: 비공개, 경로 규칙은 "{user_id}/{photo_id}.jpg" — 정책이 그
-- 규칙에 의존해 소유자만 자신의 폴더에 접근하게 한다.
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

create policy "select own inspection photo files" on storage.objects for select
  using (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "insert own inspection photo files" on storage.objects for insert
  with check (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "update own inspection photo files" on storage.objects for update
  using (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own inspection photo files" on storage.objects for delete
  using (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
