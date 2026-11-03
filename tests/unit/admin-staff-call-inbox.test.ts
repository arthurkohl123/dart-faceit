import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261103020835_add_admin_staff_call_inbox.sql', import.meta.url), 'utf8');
const inbox = readFileSync(new URL('../../components/admin-staff-call-inbox.tsx', import.meta.url), 'utf8');
const adminPage = readFileSync(new URL('../../app/admin/page.tsx', import.meta.url), 'utf8');

test('the admin staff-call inbox stays behind the private operations permission boundary', () => {
  assert.match(migration, /create or replace function public\.admin_list_matchroom_staff_calls\(p_limit integer default 12\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /perform public\.admin_require_operations_access\('admin'\)/i);
  assert.match(migration, /revoke all on function public\.admin_list_matchroom_staff_calls\(integer\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_list_matchroom_staff_calls\(integer\) to authenticated/i);
});

test('only calls still tied to a live matchroom appear in the inbox', () => {
  assert.match(migration, /join public\.active_matches matchroom on matchroom\.id = staff_call\.match_id/i);
  assert.match(migration, /matchroom\.status in \('pending_result', 'awaiting_confirmation', 'disputed'\)/i);
  assert.match(migration, /greatest\(1, least\(coalesce\(p_limit, 12\), 50\)\)/i);
});

test('the admin overview exposes the inbox with direct matchroom access and refreshes it', () => {
  assert.match(inbox, /admin_list_matchroom_staff_calls/i);
  assert.match(inbox, /window\.setInterval\(\(\) => void loadCalls\(\), 30_000\)/i);
  assert.match(inbox, /\/result\?matchId=\$\{call\.match_id\}/i);
  assert.match(adminPage, /AdminStaffCallInbox/);
  assert.doesNotMatch(adminPage, /AdminShiftHandoffPanel/);
});
