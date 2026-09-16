import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260916010000_include_all_ranked_tournaments_in_wednesday_showdown.sql'),
  'utf8',
);

test('Showdown includes all confirmed ranked matches, including tournament matchrooms', () => {
  assert.match(migration, /coalesce\(m\.match_mode, 'ranked'\) = 'ranked'/);
  assert.doesNotMatch(migration, /tournament_matches/);
  assert.match(migration, /having count\(distinct m\.active_match_id\) >= v_status\.minimum_matches/);
});

test('Showdown recap uses the same all-ranked-match rule', () => {
  assert.match(migration, /get_wednesday_showdown_recap[\s\S]*coalesce\(m\.match_mode, 'ranked'\) = 'ranked'/);
  assert.doesNotMatch(migration, /is_wednesday_showdown_eligible_match\(am\.id\)/);
});
