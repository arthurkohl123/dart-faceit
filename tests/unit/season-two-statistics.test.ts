import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261102001831_add_current_season_player_statistics.sql', import.meta.url), 'utf8');
const leaderboard = readFileSync(new URL('../../app/leaderboard/page.tsx', import.meta.url), 'utf8');

test('Season stats begin at the newest active Elo reset and preserve all-time profile counters', () => {
  assert.match(migration, /order by executed_at desc[\s\S]*limit 1/i);
  assert.match(migration, /m\.match_mode = 'ranked'[\s\S]*m\.status = 'completed'[\s\S]*m\.completed_at >= cs\.executed_at/i);
  assert.match(migration, /p\."gamesPlayed"[\s\S]*p\.wins[\s\S]*season_games_played[\s\S]*season_wins/i);
});

test('The leaderboard qualifies players by Season 2 matches, not their all-time match count', () => {
  assert.match(leaderboard, /gte\('season_games_played', MIN_LEADERBOARD_GAMES\)/);
  assert.match(leaderboard, /player\.season_games_played/);
  assert.match(leaderboard, /player\.season_wins/);
});

