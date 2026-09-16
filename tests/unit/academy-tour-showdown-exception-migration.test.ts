import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260916000000_include_academy_tour_in_wednesday_showdown.sql'),
  'utf8',
);

test('only the explicitly allowlisted Academy Tour may enter the Showdown', () => {
  assert.match(migration, /Academy Tour Event 1 - Saison 12/);
  assert.match(migration, /included_tournament_ids/);
  assert.match(migration, /is_wednesday_showdown_eligible_match/);
  assert.match(migration, /tm\.tournament_id::text = included\.tournament_id/);
});

test('the same eligibility rule is used for the live leaderboard and the recap', () => {
  assert.match(migration, /get_wednesday_showdown_leaderboard[\s\S]*is_wednesday_showdown_eligible_match\(am\.id\)/);
  assert.match(migration, /get_wednesday_showdown_recap[\s\S]*is_wednesday_showdown_eligible_match\(am\.id\)/);
});
