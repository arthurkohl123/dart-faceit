import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20260918011000_add_growth_funnel_analytics.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../components/admin-operations-workspace.tsx', import.meta.url), 'utf8');

test('growth funnel keeps analytics records private and exposes only an admin RPC', () => {
  assert.match(migration, /alter table public\.growth_funnel_events enable row level security/i);
  assert.match(migration, /revoke all on table public\.growth_funnel_events from anon, authenticated/i);
  assert.match(migration, /perform public\.admin_require_operations_access\('read'\)/i);
  assert.match(migration, /revoke all on function public\.record_growth_funnel_event[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_get_growth_funnel\(integer\) to authenticated/i);
});

test('growth funnel records the first queue and first completed normal queue match only', () => {
  assert.match(migration, /after insert on public\.matchmaking_queue/i);
  assert.match(migration, /after update of status on public\.active_matches/i);
  assert.match(migration, /function public\.track_first_growth_queue_entry\(\)[\s\S]*security definer/i);
  assert.match(migration, /function public\.track_first_growth_completed_queue_match\(\)[\s\S]*security definer/i);
  assert.match(migration, /coalesce\(new\.match_mode, 'ranked'\) <> 'ranked'/i);
  assert.match(migration, /exists \(select 1 from public\.tournament_matches tm where tm\.active_match_id = new\.id\)/i);
  assert.match(migration, /unique \(profile_id, event_name\)/i);
});

test('team insights display the onboarding drop-off without collecting browser fingerprints', () => {
  assert.match(workspace, /Wachstums-Funnel/);
  assert.match(workspace, /Wo neue Spieler abspringen/);
  assert.match(workspace, /admin_get_growth_funnel/);
  assert.match(workspace, /Keine IP-Adressen, Gerätekennungen, E-Mail-Adressen oder Seitenaufrufe/);
});
