-- 비히어로(BeeHero) — 방문 시점 날씨 스냅샷. src/db/migrations/0003_milky_absorbing_man.sql
-- 를 미러링한다. 나중에 다시 조회하는 구조가 아니라, 방문 생성 시점에 한 번
-- 캡처한 관측값을 그대로 보존한다 (weather_source로 출처 추적).

alter table visits
  add column if not exists weather_observed_at timestamptz,
  add column if not exists temperature_c double precision,
  add column if not exists humidity_percent double precision,
  add column if not exists precipitation_mm double precision,
  add column if not exists wind_speed_ms double precision,
  add column if not exists weather_code text,
  add column if not exists weather_source text;
