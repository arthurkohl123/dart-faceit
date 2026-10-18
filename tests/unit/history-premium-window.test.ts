import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migration = readFileSync(resolve(root, 'supabase/migrations/20261018002505_gate_match_history_by_premium.sql'), 'utf8');
const historyPage = readFileSync(resolve(root, 'app/history/page.tsx'), 'utf8');
const premiumPage = readFileSync(resolve(root, 'app/premium/page.tsx'), 'utf8');
const accountExport = readFileSync(resolve(root, 'app/api/account/export/route.ts'), 'utf8');

test('history access is enforced by the database for the signed-in player', () => {
  assert.match(migration, /drop policy if exists "Users can view own match history" on public\.matches/i);
  assert.match(migration, /create policy "Users can view own match history"[\s\S]*?for select to authenticated/i);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/i);
  assert.match(migration, /public\.has_active_premium\(\(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /then interval '90 days'[\s\S]*?else interval '7 days'/i);
});

test('the profile history offers 7 days to everyone and longer windows only to Premium', () => {
  assert.match(historyPage, /const historyPeriodOptions: HistoryPeriod\[\] = \['7d', '30d', '90d'\]/);
  assert.match(historyPage, /supabase\.rpc\('get_my_premium_overview'\)/);
  assert.match(historyPage, /if \(!isPremium && period !== '7d'\)/);
  assert.match(historyPage, /\.gte\('completed_at', periodStart\)/);
  assert.match(historyPage, /30 &amp; 90 Tage mit Premium/);
});

test('the duplicate Premium performance lab is retired while full account exports remain available', () => {
  assert.match(migration, /drop function if exists public\.get_my_premium_performance\(integer\)/i);
  assert.doesNotMatch(premiumPage, /Performance-Labor|get_my_premium_performance/);
  assert.match(premiumPage, /label: 'Match-Verlauf', free: '7 Tage', premium: '30 & 90 Tage'/);
  assert.match(accountExport, /const admin = createAdminClient\(\)/);
  assert.match(accountExport, /admin\.from\('matches'\)/);
});
