import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261105031741_add_public_profile_match_elo_change.sql', import.meta.url), 'utf8');
const playerProfile = readFileSync(new URL('../../app/players/[username]/page.tsx', import.meta.url), 'utf8');

test('public player match history returns the final stored Elo delta', () => {
  assert.match(migration, /drop function if exists public\.get_public_player_match_history_with_platform\(uuid, integer\)/i);
  assert.match(migration, /elo_change integer/i);
  assert.match(migration, /coalesce\(m\.elo_change, 0\)::integer/i);
  assert.match(migration, /coalesce\(m\.match_mode, 'ranked'\) = 'ranked'/i);
});

test('the public history endpoint keeps its visibility guard and explicit grants', () => {
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(migration, /coalesce\(p\.is_publicly_visible, true\) = true/i);
  assert.match(migration, /revoke all on function public\.get_public_player_match_history_with_platform\(uuid, integer\) from public/i);
  assert.match(migration, /grant execute on function public\.get_public_player_match_history_with_platform\(uuid, integer\) to anon, authenticated/i);
});

test('the player profile displays each recorded Elo result with its sign', () => {
  assert.match(playerProfile, /elo_change: number/);
  assert.match(playerProfile, /const eloChange = Number\(match\.elo_change \?\? 0\)/);
  assert.match(playerProfile, /eloChange > 0 \? '\+' : ''/);
  assert.match(playerProfile, />Elo<\/span>/);
});
