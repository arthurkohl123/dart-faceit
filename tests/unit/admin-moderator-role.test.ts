import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminPage = readFileSync(new URL('../../app/admin/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261102201615_fix_admin_moderator_assignment.sql', import.meta.url), 'utf8');

test('admin moderator assignment targets the profile id and verifies the persisted result', () => {
  assert.match(adminPage, /p_user_id: id/);
  assert.match(adminPage, /await loadProfiles\(\)/);
  assert.match(migration, /create or replace function public\.admin_set_moderator\(\s*p_user_id uuid,\s*p_is_mod boolean\s*\)/i);
  assert.match(migration, /where id = p_user_id/i);
  assert.doesNotMatch(migration, /where "supabaseId" = p_user_id::text/i);
  assert.match(migration, /if v_updated <> 1 then/i);
  assert.match(migration, /insert into public\.admin_logs/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.admin_set_moderator\(uuid, boolean\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_set_moderator\(uuid, boolean\) to authenticated/i);
});
