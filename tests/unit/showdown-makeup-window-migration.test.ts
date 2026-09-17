import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const makeupMigration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260917000000_add_showdown_makeup_window.sql'),
  'utf8',
);
const typeFixMigration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260917001000_fix_showdown_makeup_elo_types.sql'),
  'utf8',
);

test('the one-time Showdown replay carries the interrupted Wednesday into Thursday only', () => {
  assert.match(makeupMigration, /'makeup_date', '2026-09-17'/);
  assert.match(makeupMigration, /'makeup_carryover_date', '2026-09-16'/);
  assert.match(makeupMigration, /v_event_date = v_makeup_date/);
  assert.match(makeupMigration, /v_include_carryover/);
  assert.match(makeupMigration, /m\.completed_at >= v_carryover_start/);
});

test('the replay standing remains readable before the four-hour window starts', () => {
  assert.match(makeupMigration, /if not coalesce\(v_status\.event_enabled, false\) then/);
  assert.doesNotMatch(makeupMigration, /if not coalesce\(v_status\.is_active, false\) then/);
});

test('Showdown RPCs explicitly cast the smallint profile Elo to their public integer contract', () => {
  assert.match(typeFixMigration, /p\.elo::integer as player_elo/);
  assert.match(typeFixMigration, /get_wednesday_showdown_leaderboard/);
  assert.match(typeFixMigration, /get_wednesday_showdown_recap/);
});
