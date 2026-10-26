import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20260918003000_add_admin_operations_workspace.sql', import.meta.url), 'utf8');
const platformStatsMigration = readFileSync(new URL('../../supabase/migrations/20261017171538_admin_platform_match_stats.sql', import.meta.url), 'utf8');
const tournamentCommandCenterMigration = readFileSync(new URL('../../supabase/migrations/20261026130000_add_tournament_command_center.sql', import.meta.url), 'utf8');
const hardening = readFileSync(new URL('../../supabase/migrations/20260918003100_harden_operations_list_access.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../components/admin-operations-workspace.tsx', import.meta.url), 'utf8');

test('operations workspace keeps sensitive cases private and public notices narrow', () => {
  assert.match(migration, /alter table public\.admin_cases enable row level security/i);
  assert.match(migration, /revoke all on table public\.staff_role_assignments, public\.admin_cases from anon, authenticated/i);
  assert.match(migration, /grant select on table public\.site_notices to anon, authenticated/i);
  assert.match(migration, /using \(is_active = true and starts_at <= now\(\)/i);
});

test('operations list functions check access before returning records', () => {
  assert.match(hardening, /perform public\.admin_require_operations_access\('read'\)/i);
  assert.match(hardening, /perform public\.admin_require_operations_access\('admin'\)/i);
  assert.match(hardening, /return query/i);
});

test('admin operations hub covers triage, player records and controlled communications', () => {
  for (const label of ['Operations inbox', 'Spieler 360°', 'Fallmanagement', 'Turnier-Leitstand', 'Plattform-Ankündigung', 'Kommunikationscenter', 'Team & Berechtigungen']) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /admin_send_broadcast/);
  assert.match(workspace, /admin_set_staff_role/);
});

test('platform activity counts completed matchrooms once per scoring platform', () => {
  assert.match(platformStatsMigration, /create or replace function public\.admin_get_operations_workspace\(\)/i);
  assert.match(platformStatsMigration, /perform public\.admin_require_operations_access\('read'\)/i);
  assert.match(platformStatsMigration, /language plpgsql security definer set search_path = public/i);
  assert.match(platformStatsMigration, /from public\.active_matches m/i);
  assert.match(platformStatsMigration, /m\.status = 'completed'/i);
  assert.match(platformStatsMigration, /m\.completed_at >= now\(\) - interval '24 hours'/i);
  for (const platform of ['scolia', 'dartcounter', 'autodarts']) {
    assert.match(platformStatsMigration, new RegExp(`'${platform}'`));
  }
  assert.match(platformStatsMigration, /revoke all on function public\.admin_get_operations_workspace\(\) from public, anon/i);
  assert.match(platformStatsMigration, /grant execute on function public\.admin_get_operations_workspace\(\) to authenticated/i);
});

test('operations inbox renders the 24-hour platform breakdown', () => {
  assert.match(workspace, /platform_matches_24h/);
  assert.match(workspace, /Abgeschlossene Matches · letzte 24 Stunden/);
  for (const label of ['Scolia', 'DartCounter', 'AutoDarts']) {
    assert.match(workspace, new RegExp(label));
  }
});

test('tournament command center is admin-only and keeps operational actions routed through existing desks', () => {
  assert.match(tournamentCommandCenterMigration, /create or replace function public\.admin_get_tournament_command_center\(\)/i);
  assert.match(tournamentCommandCenterMigration, /if auth\.uid\(\) is null or not public\.is_tournament_admin\(\) then/i);
  assert.match(tournamentCommandCenterMigration, /set search_path = ''/i);
  assert.match(tournamentCommandCenterMigration, /support_tickets_command_center_idx/i);
  assert.match(tournamentCommandCenterMigration, /revoke execute on function public\.admin_get_tournament_command_center\(\) from public/i);
  assert.match(tournamentCommandCenterMigration, /grant execute on function public\.admin_get_tournament_command_center\(\) to authenticated/i);
  assert.match(workspace, /admin_get_tournament_command_center/);
  assert.match(workspace, /Matchrooms aktiv/);
  assert.match(workspace, /Ticket öffnen/);
  assert.match(workspace, /Leitung öffnen/);
});
