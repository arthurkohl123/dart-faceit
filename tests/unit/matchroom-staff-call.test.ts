import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261103005747_add_matchroom_staff_call.sql', import.meta.url), 'utf8');
const matchroom = readFileSync(new URL('../../app/result/page.tsx', import.meta.url), 'utf8');

test('only an authenticated match participant can request live staff assistance', () => {
  assert.match(migration, /create table if not exists public\.matchroom_staff_calls/i);
  assert.match(migration, /alter table public\.matchroom_staff_calls enable row level security/i);
  assert.match(migration, /revoke all on table public\.matchroom_staff_calls from public, anon, authenticated/i);
  assert.match(migration, /create or replace function public\.request_matchroom_staff_assistance\(p_match_id uuid\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /v_actor_id not in \(v_match\.player1_id, v_match\.player2_id\)/i);
  assert.match(migration, /v_match\.status not in \('pending_result', 'awaiting_confirmation', 'disputed'\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /grant execute on function public\.request_matchroom_staff_assistance\(uuid\) to authenticated/i);
});

test('online staff receive realtime notification records and calls are rate limited', () => {
  assert.match(migration, /get_matchroom_staff_availability/i);
  assert.match(migration, /presence\.last_seen_at >= now\(\) - interval '2 minutes'/i);
  assert.match(migration, /interval '2 minutes'/i);
  assert.match(migration, /insert into public\.notifications/i);
  assert.match(migration, /'matchroom_staff_call'/i);
  assert.match(migration, /notified_staff_count/i);
  assert.match(migration, /status text,[\s\S]*staff_online integer,[\s\S]*retry_after_seconds integer/i);
});

test('the result room keeps the call disabled while nobody from the team is online', () => {
  assert.match(matchroom, /Admin rufen/);
  assert.match(matchroom, /Team offline/);
  assert.match(matchroom, /get_matchroom_staff_availability/);
  assert.match(matchroom, /request_matchroom_staff_assistance/);
  assert.match(matchroom, /disabled=\{staffAvailabilityLoading \|\| staffOnlineCount < 1 \|\| staffCallLoading\}/);
  assert.match(matchroom, /Ein verfügbarer Admin oder Moderator erhält direkt einen Hinweis/i);
});
