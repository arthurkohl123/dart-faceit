import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260918010000_harden_live_play_performance.sql'),
  'utf8',
);

test('current match recovery gets participant-specific indexes', () => {
  assert.match(migration, /active_matches_open_player1_created_idx/i);
  assert.match(migration, /active_matches_open_player2_created_idx/i);
  assert.match(migration, /player1_id, created_at desc/i);
  assert.match(migration, /player2_id, created_at desc/i);
});

test('high-traffic RLS policies are consolidated without broadening access', () => {
  assert.match(migration, /Active matches readable by participants or admins/i);
  assert.match(migration, /for select to authenticated/i);
  assert.match(migration, /\(select auth\.uid\(\)\)/i);
  assert.match(migration, /Users can view own match history/i);
  assert.match(migration, /Users read own notifications/i);
  assert.match(migration, /Users mark own notifications read/i);
});

test('only the duplicate queue index is removed', () => {
  assert.match(migration, /drop index if exists public\.matchmaking_queue_match_idx/i);
  assert.doesNotMatch(migration, /drop index if exists public\.matchmaking_queue_active_match_idx/i);
});

test('declining an invitation is locked and restricted to the participants', () => {
  assert.match(migration, /create or replace function public\.decline_match_invitation/i);
  assert.match(migration, /for update;/i);
  assert.match(migration, /NOT_MATCH_PARTICIPANT/);
  assert.match(migration, /revoke all on function public\.decline_match_invitation\(uuid\) from public/i);
  assert.match(migration, /grant execute on function public\.decline_match_invitation\(uuid\) to authenticated/i);
});
