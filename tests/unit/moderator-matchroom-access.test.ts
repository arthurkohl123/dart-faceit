import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261102202531_add_moderator_matchroom_access.sql', import.meta.url), 'utf8');
const moderatorPage = readFileSync(new URL('../../app/moderator/page.tsx', import.meta.url), 'utf8');
const matchroom = readFileSync(new URL('../../app/result/page.tsx', import.meta.url), 'utf8');

test('moderators can open a currently live matchroom from the live monitor', () => {
  assert.match(moderatorPage, /Matchroom öffnen/);
  assert.match(moderatorPage, /router\.push\(`\/result\?matchId=\$\{encodeURIComponent\(m\.id\)\}`\)/);
  assert.match(migration, /Active matches readable by participants or staff/);
  assert.match(migration, /profile\.is_moderator = true/);
  assert.match(migration, /status in \('pending_result', 'awaiting_confirmation', 'disputed'\)/);
});

test('matchroom chat derives staff labels on the server instead of accepting them from clients', () => {
  assert.match(migration, /create or replace function public\.send_match_message\(/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /v_staff_role := case/i);
  assert.match(migration, /when v_is_moderator then 'moderator'/i);
  assert.match(migration, /create or replace function public\.set_match_message_sender_context\(\)/i);
  assert.match(migration, /new\.staff_role := case/i);
  assert.match(migration, /new\.is_admin_message := new\.staff_role is not null/i);
  assert.match(migration, /grant execute on function public\.send_match_message\(uuid, text\) to authenticated/i);
  assert.match(matchroom, /supabase\.rpc\('send_match_message'/);
  assert.doesNotMatch(matchroom, /from\('match_messages'\)\.insert/);
});

test('matchroom presents moderator messages distinctly and staff reads use protected RPCs', () => {
  assert.match(migration, /create or replace function public\.staff_get_match_messages\(p_match_id uuid\)/i);
  assert.match(migration, /if auth\.uid\(\) is null or not public\.is_mod_or_admin\(\) then/i);
  assert.match(migration, /grant execute on function public\.staff_get_match_messages\(uuid\) to authenticated/i);
  assert.match(matchroom, /staff_get_match_messages/);
  assert.match(matchroom, /Moderator-Ansicht/);
  assert.match(matchroom, /🛡 Moderator/);
  assert.match(matchroom, /staff_role/);
});
