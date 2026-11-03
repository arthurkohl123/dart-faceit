import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261103184402_auto_start_tournaments_after_checkin.sql', import.meta.url), 'utf8');
const lifecycleRoute = readFileSync(new URL('../../app/api/internal/match-lifecycle/route.ts', import.meta.url), 'utf8');
const lifecycleRunner = readFileSync(new URL('../../deploy/vps/run-match-lifecycle.sh', import.meta.url), 'utf8');

test('the VPS starts only due tournaments after their check-in window', () => {
  assert.match(migration, /create or replace function public\.auto_start_due_tournaments/i);
  assert.match(migration, /coalesce\(t\.check_in_closes_at, t\.starts_at\) <= now\(\)/i);
  assert.match(migration, /tp\.status = 'checked_in'/i);
  assert.match(migration, />= 2/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /start_tournament_bracket_internal/i);
});

test('bracket helpers are not exposed to browser roles', () => {
  assert.match(migration, /revoke all on function public\.start_tournament_bracket_internal\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.auto_start_due_tournaments\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.auto_start_due_tournaments\(\) to service_role/i);
});

test('the existing VPS lifecycle job triggers automatic tournament starts', () => {
  assert.match(lifecycleRoute, /admin\.rpc\('auto_start_due_tournaments'\)/);
  assert.match(lifecycleRoute, /autoStartedTournaments/);
  assert.match(lifecycleRunner, /api\/internal\/match-lifecycle/);
});
