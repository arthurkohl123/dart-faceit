import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261103000601_strengthen_matchroom_no_show_safety.sql', import.meta.url), 'utf8');
const matchroom = readFileSync(new URL('../../app/result/page.tsx', import.meta.url), 'utf8');
const lifecycleRoute = readFileSync(new URL('../../app/api/internal/match-lifecycle/route.ts', import.meta.url), 'utf8');
const lifecycleRunner = readFileSync(new URL('../../deploy/vps/run-match-lifecycle.sh', import.meta.url), 'utf8');

test('No-Show reports cannot punish a player who entered the Matchroom', () => {
  assert.match(migration, /player1_matchroom_entered_at/);
  assert.match(migration, /player2_matchroom_entered_at/);
  assert.match(migration, /create or replace function public\.mark_matchroom_entered/i);
  assert.match(migration, /status', 'opponent_present'/);
  assert.match(migration, /Die No-Show-Meldung wurde zurückgezogen/);
  assert.match(matchroom, /mark_matchroom_entered/);
  assert.match(matchroom, /Ist dein Gegner wirklich nicht erschienen\?/);
  assert.match(matchroom, /Ja, No-Show melden/);
});

test('expired Matchroom actions are finalized by the VPS instead of a browser tab', () => {
  assert.match(migration, /create or replace function public\.finalize_expired_no_shows/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(lifecycleRoute, /finalize_expired_match_confirmations/);
  assert.match(lifecycleRoute, /finalize_expired_no_shows/);
  assert.match(lifecycleRoute, /authorization !== `Bearer \$\{cronSecret\}`/);
  assert.match(lifecycleRunner, /api\/internal\/match-lifecycle/);
});
