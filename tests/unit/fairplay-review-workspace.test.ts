import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260918002000_add_fairplay_review_workspace.sql', 'utf8');
const adminPage = readFileSync('app/admin/page.tsx', 'utf8');
const fairplayPage = readFileSync('app/fairplay/page.tsx', 'utf8');

test('fairplay review records are private and admin-gated', () => {
  assert.match(migration, /create table if not exists public\.fairplay_review_actions/i);
  assert.match(migration, /alter table public\.fairplay_review_actions enable row level security/i);
  assert.match(migration, /revoke all on public\.fairplay_review_actions from anon, authenticated/i);
  assert.match(migration, /create or replace function public\.admin_get_fairplay_review/i);
  assert.match(migration, /create or replace function public\.admin_record_fairplay_review/i);
  assert.match(migration, /ADMIN_ACCESS_REQUIRED/);
  assert.match(migration, /security definer\s+set search_path = public/i);
});

test('review workspace uses behaviour data and never claims IP or device checks', () => {
  assert.match(migration, /recent_matches/i);
  assert.match(migration, /shared_opponents/i);
  assert.match(migration, /fairness_risk_flags/i);
  assert.match(migration, /existing account and match data only/i);
  assert.match(adminPage, /admin_get_fairplay_review/);
  assert.match(adminPage, /admin_record_fairplay_review/);
  assert.match(adminPage, /Prüfakte öffnen/);
});

test('players receive clear public information about fairplay and sanctions', () => {
  assert.match(fairplayPage, /Wie eine Prüfung abläuft/);
  assert.match(fairplayPage, /Mögliche Maßnahmen/);
  assert.match(fairplayPage, /nicht automatisch zu einer Sperre/i);
});
