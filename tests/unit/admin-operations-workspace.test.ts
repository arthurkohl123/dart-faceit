import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20260918003000_add_admin_operations_workspace.sql', import.meta.url), 'utf8');
const hardening = readFileSync(new URL('../../supabase/migrations/20260918003100_harden_operations_list_access.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../components/admin-operations-workspace.tsx', import.meta.url), 'utf8');

test('operations workspace keeps sensitive cases private and public notices narrow', () => {
  assert.match(migration, /alter table public\.admin_cases enable row level security/i);
  assert.match(migration, /revoke all on table public\.staff_role_assignments, public\.admin_cases from anon, authenticated/i);
  assert.match(migration, /grant select on table public\.site_notices to anon, authenticated/i);
  assert.match(migration, /using \(is_active = true and starts_at <= now\(\)/i);
});

test('operations list functions check access before returning records', () => {
  assert.match(hardening, /perform public\.admin_require_operations_access\('read'\)/i);
  assert.match(hardening, /perform public\.admin_require_operations_access\('admin'\)/i);
  assert.match(hardening, /return query/i);
});

test('admin operations hub covers triage, player records and controlled communications', () => {
  for (const label of ['Operations inbox', 'Spieler 360°', 'Fallmanagement', 'Turnier-Leitstand', 'Plattform-Ankündigung', 'Kommunikationscenter', 'Team & Berechtigungen']) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /admin_send_broadcast/);
  assert.match(workspace, /admin_set_staff_role/);
});
