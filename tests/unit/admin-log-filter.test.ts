import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminPage = readFileSync(new URL('../../app/admin/page.tsx', import.meta.url), 'utf8');

test('the admin audit trail hides routine Elo updates while keeping a full audit record in storage', () => {
  assert.match(adminPage, /from\('admin_logs'\)/);
  assert.match(adminPage, /\.neq\('action', 'ELO_CHANGE'\)/);
  assert.match(adminPage, /Keep it in the database for audits/i);
});
