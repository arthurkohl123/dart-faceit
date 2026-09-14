import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260914030000_add_wednesday_showdown_recaps.sql'),
  'utf8',
);

test('Showdown recap derives the last completed Wednesday window', () => {
  assert.match(migration, /get_wednesday_showdown_recap/);
  assert.match(migration, /v_period_start := v_status\.starts_at - interval '7 days'/);
  assert.match(migration, /v_period_end := v_status\.ends_at - interval '7 days'/);
  assert.match(migration, /limit 3/);
});

test('Showdown recap only exposes confirmed ranked queue results', () => {
  assert.match(migration, /coalesce\(m\.match_mode, 'ranked'\) = 'ranked'/);
  assert.match(migration, /not exists \([\s\S]*select 1 from public\.tournament_matches/);
  assert.match(migration, /coalesce\(p\.is_publicly_visible, true\) = true/);
  assert.match(migration, /grant execute on function public\.get_wednesday_showdown_recap\(\) to anon, authenticated/);
});
