import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261018000127_premium_performance_lab.sql', import.meta.url),
  'utf8',
);
const premiumPage = readFileSync(
  new URL('../../app/premium/page.tsx', import.meta.url),
  'utf8',
);

test('Premium Performance-Labor is self-scoped and enforces its access window on the server', () => {
  assert.match(migration, /create or replace function public\.get_my_premium_performance\(p_days integer default 7\)/i);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /if v_user_id is null then[\s\S]*?AUTHENTICATION_REQUIRED/i);
  assert.match(migration, /v_requested_days not in \(7, 30, 90\)/i);
  assert.match(migration, /v_is_premium := public\.has_active_premium\(v_user_id\)/i);
  assert.match(migration, /v_period_days := case when v_is_premium then v_requested_days else 7 end/i);
  assert.match(migration, /if not v_is_premium then[\s\S]*?'full_access', false[\s\S]*?'summary', v_summary/i);
  assert.doesNotMatch(migration, /p_user_id/i);
});

test('Performance aggregates use confirmed own Ranked matches and retain honest platform metadata', () => {
  assert.match(migration, /match_history\.user_id = v_user_id/i);
  assert.match(migration, /match_history\.status = 'completed'/i);
  assert.match(migration, /match_history\.match_mode = 'ranked'/i);
  assert.match(migration, /match_history\.completed_at >= v_period_start/i);
  assert.match(migration, /'elo_delta', coalesce\(sum\(match_history\.elo_change\), 0\)::integer/i);
  assert.match(migration, /'highest_checkout', max\(nullif\(match_history\.highest_checkout, 0\)\)/i);
  assert.match(migration, /'one_eighties', coalesce\(sum\(match_history\.one_eighties\), 0\)::integer/i);
  assert.match(migration, /left join public\.active_matches active_match on active_match\.id = match_history\.active_match_id/i);
  assert.match(migration, /coalesce\(match_history\.app, active_match\.app\) is null/i);
  assert.match(migration, /update public\.matches match_history[\s\S]*?set app = active_match\.app/i);
});

test('Performance RPC is a fixed-search-path security-definer function with limited execution', () => {
  const functionBlock = migration.split('create or replace function public.get_my_premium_performance')[1]?.split('-- Repair rows')[0] ?? '';
  assert.match(functionBlock, /security definer/i);
  assert.match(functionBlock, /set search_path = pg_catalog, public, pg_temp/i);
  assert.match(migration, /revoke all on function public\.get_my_premium_performance\(integer\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_my_premium_performance\(integer\) to authenticated/i);
});

test('Premium page presents the secured 7/30/90-day report and a factual Free preview', () => {
  assert.match(premiumPage, /get_my_premium_performance/);
  assert.match(premiumPage, /const performancePeriods: PerformancePeriod\[\] = \[7, 30, 90\]/);
  assert.match(premiumPage, /Performance-Labor/);
  assert.match(premiumPage, /7 Tage Vorschau/);
  assert.match(premiumPage, /Plattformvergleich/);
  assert.match(premiumPage, /Persönliche Bestwerte/);
  assert.match(premiumPage, /performanceDetailsUnlocked/);
});
