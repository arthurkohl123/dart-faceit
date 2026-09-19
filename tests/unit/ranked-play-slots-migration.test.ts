import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260919020000_add_ranked_play_slots.sql'),
  'utf8',
);

test('ranked slots stay private and only expose aggregate availability', () => {
  assert.match(migration, /create table if not exists public\.ranked_play_slots/i);
  assert.match(migration, /alter table public\.ranked_play_slots enable row level security/i);
  assert.match(migration, /revoke all on table public\.ranked_play_slots from anon, authenticated/i);
  assert.match(migration, /count\(slots\.user_id\)::bigint as planned_players/i);
  const publicSlotContract = migration.slice(
    migration.indexOf('create or replace function public.get_ranked_play_slots'),
    migration.indexOf('create or replace function public.toggle_ranked_play_slot'),
  );
  const returnContract = publicSlotContract.slice(0, publicSlotContract.indexOf('\nlanguage'));
  assert.doesNotMatch(returnContract, /user_id/i);
});

test('ranked slot functions authenticate, validate and limit scheduling', () => {
  assert.match(migration, /create or replace function public\.get_ranked_play_slots\(p_days integer default 7\)/i);
  assert.match(migration, /create or replace function public\.toggle_ranked_play_slot\(p_starts_at timestamptz\)/i);
  assert.match(migration, /NOT_AUTHENTICATED/);
  assert.match(migration, /SLOT_OUT_OF_RANGE/);
  assert.match(migration, /SLOT_LIMIT_REACHED/);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /ranked_play_slots_starts_user_idx/i);
});

test('only signed-in players can invoke ranked slot RPCs', () => {
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.get_ranked_play_slots\(integer\) from public/i);
  assert.match(migration, /grant execute on function public\.get_ranked_play_slots\(integer\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.toggle_ranked_play_slot\(timestamptz\) from public/i);
  assert.match(migration, /grant execute on function public\.toggle_ranked_play_slot\(timestamptz\) to authenticated/i);
});
