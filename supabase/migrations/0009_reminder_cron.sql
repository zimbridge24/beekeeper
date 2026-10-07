-- 점검 알림 판단 함수(send-reminders)를 매시 정각에 호출하는 Supabase Cron.
--
-- 함수는 사용자마다 "현지 시각 오전 9시 이후 + 오늘 아직 평가 안 함"일 때만 일을 한다. 그래서
-- 매시 호출해도 알림은 하루 한 번, 오전 9시 이후 첫 호출에서 나가고, 한 번 실패해도 같은 날
-- 다음 시간에 이어서 처리된다 (사용자 시간대가 달라져도 이 스케줄은 그대로 쓸 수 있다).
--
-- 함수 주소와 크론 비밀키는 이 파일에 적지 않는다 — Vault에서 읽는다. 환경마다 한 번만:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-reminders', 'reminders_function_url');
--   select vault.create_secret('<무작위 긴 문자열>', 'reminders_cron_secret');   -- Edge Function의 CRON_SECRET과 같은 값
-- 끄려면: select cron.unschedule('send-reminders-hourly');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-reminders-hourly',
  '0 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
