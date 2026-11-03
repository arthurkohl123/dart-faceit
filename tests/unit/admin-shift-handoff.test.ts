import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261103020114_add_admin_shift_handoffs.sql', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../../components/admin-shift-handoff-panel.tsx', import.meta.url), 'utf8');
const adminPage = readFileSync(new URL('../../app/admin/page.tsx', import.meta.url), 'utf8');

test('admin handover notes stay private and are permission-checked on the server', () => {
  assert.match(migration, /create table if not exists public\.admin_shift_handoffs/i);
  assert.match(migration, /alter table public\.admin_shift_handoffs enable row level security/i);
  assert.match(migration, /revoke all on table public\.admin_shift_handoffs from public, anon, authenticated/i);
  assert.match(migration, /admin_require_operations_access\('admin'\)/i);
  assert.match(migration, /create or replace function public\.admin_list_shift_handoffs/i);
  assert.match(migration, /create or replace function public\.admin_create_shift_handoff/i);
  assert.match(migration, /create or replace function public\.admin_update_shift_handoff/i);
  assert.match(migration, /revoke all on function public\.admin_create_shift_handoff\(text, boolean\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_update_shift_handoff\(uuid, text, boolean\) to authenticated/i);
});

test('the admin overview exposes a persistent handover tool with pin and resolve controls', () => {
  assert.match(adminPage, /AdminShiftHandoffPanel/);
  assert.match(panel, /admin_list_shift_handoffs/);
  assert.match(panel, /admin_create_shift_handoff/);
  assert.match(panel, /admin_update_shift_handoff/);
  assert.match(panel, /Oben anheften/);
  assert.match(panel, /Als erledigt markieren/);
  assert.match(panel, /Schichtnotiz ist für das Admin-Team gespeichert/);
});

test('every operations workspace receives the new desk header', () => {
  const workspace = readFileSync(new URL('../../components/admin-operations-workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /admin-ops-desk-header/);
  assert.match(workspace, /admin-ops-studio--\$\{view\}/);
  assert.match(workspace, /activeViewMeta\.title/);
});
