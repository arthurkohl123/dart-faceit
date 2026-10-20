import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261020170259_faceit_style_elo_curve.sql'),
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
  const previewDefinition = migration.slice(
    migration.indexOf('create or replace function public.get_match_elo_preview'),
    migration.indexOf('create or replace function public.finalize_ranked_match_result'),
  );
  const finalisationDefinition = migration.slice(
    migration.indexOf('create or replace function public.finalize_ranked_match_result'),
    migration.indexOf('-- Keep the older admin RPC'),
  );

  const previewCalls = previewDefinition.match(/greatest\(1, least\(50, public\.calculate_elo_change\(/gi) ?? [];
  const finalisationCalls = finalisationDefinition.match(/greatest\(1, least\(50, public\.calculate_elo_change\(/gi) ?? [];

  assert.equal(previewCalls.length, 2);
  assert.equal(finalisationCalls.length, 1);
  assert.match(previewDefinition, /coalesce\(v_match\.match_mode, 'ranked'\) <> 'ranked'/i);
  assert.match(migration, /power\(10::numeric, \(loser_elo - winner_elo\)::numeric \/ 400\)/i);
});

test('the matchroom never falls back to a separate browser-side Elo formula', () => {
  assert.match(resultPage, /supabase\.rpc\('get_match_elo_preview', \{ p_match_id: m\.id \}\)/);
  assert.doesNotMatch(resultPage, /function calculateEloChange\(/);
  assert.match(resultPage, /omit a preview than promise a wrong Elo amount/i);
});
