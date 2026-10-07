-- 비히어로(BeeHero) — 방제 약제 성분 기록 · 농진청 벌집판당 응애 세기 · 집중 방제 기간 알림.
-- Mirrors src/db/migrations/0007_*.sql. Apply via the Supabase SQL Editor or `supabase db push`.
--
-- 기존 앱 버전과 호환된다: 허용값을 "늘리기만" 하고 줄이지 않으며, 새 컬럼은 기본값이 있다.

-- 1) record_field_values: 응애 검사 방법 'comb_count'(벌집판당 세기) + 방제 약제 성분 토큰
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
  add constraint record_field_values_value_state_check check (value_state in (
    'present', 'absent', 'unknown',
    'not_tested', 'tested_negative', 'tested_positive', 'indeterminate',
    'done', 'not_done',
    'asian_hornet', 'giant_hornet', 'other', 'unknown_species',
    'none', 'few_1_5', 'several_6_20', 'many_20_plus',
    'strong', 'normal', 'weak', 'enough', 'low', 'partial', 'good', 'needs_check',
    'survived', 'weak_survived', 'lost',
    'comb_count', 'sugar_roll', 'alcohol_wash', 'sticky_board', 'drone_brood', 'visual', 'other_method',
    'amitraz', 'coumaphos', 'formic_acid', 'oxalic_acid', 'other_ingredient', 'unknown_ingredient',
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
    'comb_count', 'sugar_roll', 'alcohol_wash', 'sticky_board', 'drone_brood', 'visual', 'other_method',
    'amitraz', 'coumaphos', 'formic_acid', 'oxalic_acid', 'other_ingredient', 'unknown_ingredient',
    'sugar_syrup', 'pollen_cake', 'honey_feed', 'other_feed', 'kg', 'liter',
    'unset'
  ));

-- 2) 집중 방제 기간(6~10월) 시즌 알림 — 설정 토글 + 발송 기록 카테고리
alter table notification_settings add column if not exists treatment_season boolean not null default true;

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'notification_deliveries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table notification_deliveries drop constraint %I', con.conname);
  end loop;
end $$;

alter table notification_deliveries
  add constraint notification_deliveries_category_check
  check (category in ('mite', 'post_treatment', 'wintering', 'trend', 'treatment_season'));
