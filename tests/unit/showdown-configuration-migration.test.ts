import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260914010000_make_showdown_configurable.sql'),
  'utf8',
);

test('Showdown settings validate the editable window and match threshold', () => {
  assert.match(migration, /v_minimum_matches := greatest\(1, least\(50/);
  assert.match(migration, /if v_end_time <= v_start_time then/);
  assert.match(migration, /v_start_time := time '18:00'/);
  assert.match(migration, /v_end_time := time '22:00'/);
});

test('Showdown exposes editable copy and prizes through a public-safe RPC', () => {
  assert.match(migration, /get_wednesday_showdown_public_config/);
  assert.match(migration, /prize_first text/);
  assert.match(migration, /prize_second text/);
  assert.match(migration, /prize_third text/);
  assert.match(migration, /grant execute on function public\.get_wednesday_showdown_public_config\(\) to anon, authenticated/);
});
