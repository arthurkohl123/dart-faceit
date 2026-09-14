import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260914040000_add_tournament_bracket_scores.sql'),
  'utf8',
);

test('tournament bracket returns the confirmed legs and averages from its matchroom', () => {
  assert.match(migration, /left join public\.active_matches am on am\.id = m\.active_match_id/);
  assert.match(migration, /am\.submitted_player1_legs/);
  assert.match(migration, /am\.submitted_player2_legs/);
  assert.match(migration, /am\.submitted_player1_average/);
  assert.match(migration, /am\.submitted_player2_average/);
});

test('tournament bracket scores remain authenticated-only', () => {
  assert.match(migration, /revoke all on function public\.get_tournament_bracket\(uuid\) from public/);
  assert.match(migration, /grant execute on function public\.get_tournament_bracket\(uuid\) to authenticated/);
});
