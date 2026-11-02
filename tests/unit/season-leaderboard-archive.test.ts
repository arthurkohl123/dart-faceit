import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261102100253_add_season_leaderboard_archive.sql', import.meta.url), 'utf8');
const leaderboard = readFileSync(new URL('../../app/leaderboard/page.tsx', import.meta.url), 'utf8');

test('completed seasons receive a fixed, private snapshot before the following Elo reset', () => {
  assert.match(migration, /create table if not exists public\.season_leaderboard_snapshots/i);
  assert.match(migration, /e\.elo_before[\s\S]*coalesce\(p\."gamesPlayed", 0\)[\s\S]*coalesce\(p\.wins, 0\)/i);
  assert.match(migration, /insert into public\.season_leaderboard_snapshots[\s\S]*on conflict \(season_label, profile_id\) do nothing/i);
  assert.match(migration, /revoke all on table public\.season_leaderboard_snapshots from public, anon, authenticated/i);
});

test('ranked seasons are public read-only data ordered with the active season first', () => {
  assert.match(migration, /create or replace function public\.get_public_ranked_seasons/i);
  assert.match(migration, /order by s\.season_started_at desc/i);
  assert.match(migration, /create or replace function public\.get_public_season_leaderboard/i);
  assert.match(migration, /grant execute on function public\.get_public_ranked_seasons\(\) to anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_public_season_leaderboard\(text, integer\) to anon, authenticated/i);
});

test('the leaderboard offers the active season first and an archive selector', () => {
  assert.match(leaderboard, /get_public_ranked_seasons/);
  assert.match(leaderboard, /get_public_season_leaderboard/);
  assert.match(leaderboard, /Season auswählen/);
  assert.match(leaderboard, /season\.is_current \? ' · Aktuell' : ''/);
});

