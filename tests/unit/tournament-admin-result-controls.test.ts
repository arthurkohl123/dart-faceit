import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260918000000_add_tournament_admin_result_controls.sql', 'utf8');
const adminPage = readFileSync('app/admin/page.tsx', 'utf8');

test('tournament result controls preserve the ranked finalisation path', () => {
  assert.match(migration, /create or replace function public\.admin_record_tournament_result/i);
  assert.match(migration, /public\.finalize_ranked_match_result\(v_active_match\.id, v_admin_id, 'admin_tournament_result'\)/);
  assert.match(migration, /security definer\s+set search_path = public/i);
  assert.match(migration, /if not public\.is_tournament_admin\(\) then/i);
  assert.match(migration, /revoke all on function public\.admin_record_tournament_result/i);
  assert.match(migration, /grant execute on function public\.admin_record_tournament_result/i);
});

test('no-show and reset actions cannot silently alter rated tournament history', () => {
  assert.match(migration, /create or replace function public\.admin_resolve_tournament_no_show/i);
  assert.match(migration, /no_show_resolved = true/i);
  assert.match(migration, /create or replace function public\.admin_restart_tournament/i);
  assert.match(migration, /join public\.matches m on m\.active_match_id = tm\.active_match_id/i);
  assert.match(migration, /bereits gewertete Matches/i);
});

test('admin UI exposes detailed result, no-show and reset workflows', () => {
  assert.match(adminPage, /admin_record_tournament_result/);
  assert.match(adminPage, /admin_resolve_tournament_no_show/);
  assert.match(adminPage, /admin_restart_tournament/);
  assert.match(adminPage, /ERGEBNIS MIT ELO ABSCHLIESSEN/);
  assert.match(adminPage, /NO-SHOW/);
  assert.match(adminPage, /TURNIER ZURÜCKSETZEN/);
});
