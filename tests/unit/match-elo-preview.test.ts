import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261017155020_authoritative_match_elo_preview.sql'),
  'utf8',
);
const resultPage = readFileSync(join(process.cwd(), 'app/result/page.tsx'), 'utf8');

test('the match Elo preview is calculated by a participant-only server RPC', () => {
  assert.match(migration, /create or replace function public\.get_match_elo_preview\(p_match_id uuid\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /MATCH_ACCESS_DENIED/);
  assert.match(migration, /coalesce\(is_admin, false\)/i);
  assert.match(migration, /revoke all on function public\.get_match_elo_preview\(uuid\) from public/i);
  assert.match(migration, /grant execute on function public\.get_match_elo_preview\(uuid\) to authenticated/i);
});

test('the preview uses the identical capped database calculation as finalisation', () => {
  const calls = migration.match(/greatest\(1, least\(32, public\.calculate_elo_change\(/gi) ?? [];
  assert.equal(calls.length, 2);
  assert.match(migration, /coalesce\(v_match\.match_mode, 'ranked'\) <> 'ranked'/i);
});

test('the matchroom never falls back to a separate browser-side Elo formula', () => {
  assert.match(resultPage, /supabase\.rpc\('get_match_elo_preview', \{ p_match_id: m\.id \}\)/);
  assert.doesNotMatch(resultPage, /function calculateEloChange\(/);
  assert.match(resultPage, /omit a preview than promise a wrong Elo amount/i);
});
