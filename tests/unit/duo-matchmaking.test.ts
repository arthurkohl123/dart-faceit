import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261101142818_add_duo_matchmaking.sql', import.meta.url), 'utf8');
const overlapGuard = readFileSync(new URL('../../supabase/migrations/20261101144415_prevent_duo_and_standard_queue_overlap.sql', import.meta.url), 'utf8');
const queueControl = readFileSync(new URL('../../supabase/migrations/20261101153509_add_duo_matchmaking_queue_control.sql', import.meta.url), 'utf8');
const duoPage = readFileSync(new URL('../../app/duo/page.tsx', import.meta.url), 'utf8');
const matchPage = readFileSync(new URL('../../app/duo/match/page.tsx', import.meta.url), 'utf8');
const matchmakingPage = readFileSync(new URL('../../app/matchmaking/page.tsx', import.meta.url), 'utf8');
const developerPage = readFileSync(new URL('../../app/developer/page.tsx', import.meta.url), 'utf8');

test('Duo Ranked has an independent rating, queue and match record', () => {
  assert.match(migration, /create table if not exists public\.duo_ratings/i);
  assert.match(migration, /create table if not exists public\.duo_queue_entries/i);
  assert.match(migration, /create table if not exists public\.duo_matches/i);
  assert.match(migration, /update public\.duo_ratings/i);
  assert.doesNotMatch(migration, /update public\.profiles\s+set\s+elo/i);
});

test('Duo Ranked supports both solo and premade-team queues on DartCounter', () => {
  assert.match(migration, /p_queue_kind not in \('solo','party'\)/);
  assert.match(migration, /app text not null default 'dartcounter'/i);
  assert.match(duoPage, /p_queue_kind: 'solo'/);
  assert.match(duoPage, /p_queue_kind: 'party'/);
});

test('Duo results are Best of 7 and require the other team to confirm', () => {
  assert.match(migration, /p_my_legs=4 and p_opponent_legs between 0 and 3/);
  assert.match(migration, /OPPOSING_TEAM_CONFIRMATION_REQUIRED/);
  assert.match(matchPage, /Best of 7/);
  assert.match(matchPage, /duo_confirm_result/);
});

test('a player cannot search 1vs1 and Duo at the same time', () => {
  assert.match(overlapGuard, /ACTIVE_1V1_QUEUE_EXISTS/);
  assert.match(overlapGuard, /public\.matchmaking_queue/);
  assert.match(duoPage, /ACTIVE_1V1_QUEUE_EXISTS/);
});

test('Duo is selected inside Matchmaking instead of from a separate navigation page', () => {
  assert.match(matchmakingPage, /1vs1 Ranked/);
  assert.match(matchmakingPage, /2vs2 Duo/);
  assert.match(matchmakingPage, /<DuoQueuePanel embedded/);
  assert.doesNotMatch(matchmakingPage, /href="\/duo"/);
  assert.match(duoPage, /router\.replace\('\/matchmaking'\)/);
});

test('developers can close Duo matchmaking with a player-facing reason', () => {
  assert.match(queueControl, /dev_set_duo_matchmaking_queue/i);
  assert.match(queueControl, /DUO_QUEUE_REASON_REQUIRED/);
  assert.match(queueControl, /delete from public\.duo_queue_entries where true/i);
  assert.match(queueControl, /DUO_MATCHMAKING_QUEUE_DISABLED/);
  assert.match(queueControl, /get_duo_matchmaking_queue_status\(\) from anon/i);
  assert.match(duoPage, /get_duo_matchmaking_queue_status/);
  assert.match(duoPage, /Duo-Queue ist geschlossen/);
  assert.match(developerPage, /dev_set_duo_matchmaking_queue/);
  assert.match(developerPage, /Bitte hinterlege eine Begründung/);
});
