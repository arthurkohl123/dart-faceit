import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260914000000_add_wednesday_showdown.sql'),
  'utf8',
);

test('Wednesday Showdown is pinned to the Berlin 18:00–22:00 window', () => {
  assert.match(migration, /now\(\) at time zone 'Europe\/Berlin'/);
  assert.match(migration, /time '18:00'/);
  assert.match(migration, /time '22:00'/);
  assert.match(migration, /extract\(isodow from v_local_now\)[\s\S]*3/);
});

test('Showdown leaderboard only admits qualifying normal queue matches', () => {
  assert.match(migration, /coalesce\(m\.match_mode, 'ranked'\) = 'ranked'/);
  assert.match(migration, /not exists \([\s\S]*select 1 from public\.tournament_matches/);
  assert.match(migration, /having count\(distinct m\.active_match_id\) >= v_status\.minimum_matches/);
  assert.match(migration, /'minimum_matches', 3/);
});

test('Showdown can lift only the Free daily limit without changing Elo processing', () => {
  assert.match(migration, /showdown\.is_active and showdown\.free_limit_override/);
  assert.match(migration, /if coalesce\(v_showdown\.is_active, false\)[\s\S]*return new;/);
  assert.doesNotMatch(migration, /update public\.profiles\s+set\s+elo/i);
});
