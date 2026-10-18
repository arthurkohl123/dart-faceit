import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261018211717_add_tournament_payout_terms_snapshot.sql'),
  'utf8',
);
const termsPage = readFileSync(resolve(root, 'app/agb/page.tsx'), 'utf8');
const tournamentRulesPage = readFileSync(resolve(root, 'app/turnierregeln/page.tsx'), 'utf8');
const registerPage = readFileSync(resolve(root, 'app/auth/register/page.tsx'), 'utf8');

test('payout periods are fixed per tournament instead of being retroactively read from a global rule', () => {
  assert.match(migration, /payout_deadline_days smallint/i);
  assert.match(migration, /coalesce\(payout_deadline_days, 30\)/i);
  assert.match(migration, /payout_terms_version[\s\S]*2026-08-27-30d/i);
  assert.match(migration, /alter column payout_deadline_days set default 90/i);
  assert.match(migration, /2026-10-18-90d/);
  assert.match(migration, /payout_deadline_days in \(30, 90\)/i);
});

test('new prize tournament registrations require and record the stored payout terms', () => {
  assert.match(migration, /create table if not exists public\.tournament_rule_acceptances/i);
  assert.match(migration, /p_accept_payout_terms boolean default false/i);
  assert.match(migration, /Bitte bestätige vor der Anmeldung die Auszahlungsfrist/i);
  assert.match(migration, /insert into public\.tournament_rule_acceptances/i);
  assert.match(migration, /v_t\.payout_terms_snapshot/i);
});

test('price information is locked as soon as anybody has registered', () => {
  assert.match(migration, /Preisangaben können nach der ersten Anmeldung nicht mehr geändert werden\./i);
  assert.match(migration, /from public\.tournament_participants\s+where tournament_id = p_tournament_id\s*\) then/i);
});

test('the tournament and Discord views disclose the same stored deadline', () => {
  const overview = readFileSync(resolve(root, 'app/tournaments/page.tsx'), 'utf8');
  const detail = readFileSync(resolve(root, 'app/tournaments/[id]/page.tsx'), 'utf8');
  const discordAnnouncement = readFileSync(resolve(root, 'app/api/admin/tournaments/announce/route.ts'), 'utf8');

  assert.match(overview, /Details &amp; anmelden/);
  assert.match(detail, /payout_terms_snapshot/);
  assert.match(detail, /p_accept_payout_terms/);
  assert.match(detail, /href="\/turnierregeln"/);
  assert.match(discordAnnouncement, /payout_deadline_days/);
  assert.match(discordAnnouncement, /Auszahlung/);
});

test('public terms preserve current commitments and explain the forward-only 90-day policy', () => {
  for (const page of [termsPage, tournamentRulesPage]) {
    assert.match(page, /Season 01/i);
    assert.match(page, /30 (Tagen|Kalendertagen)/i);
    assert.match(page, /vor dem 18\.10\.2026/i);
    assert.match(page, /höchstens 90 Kalendertage/i);
    assert.match(page, /Bei der Anmeldung(?: zu einem solchen Turnier)? bestätigst du/i);
  }
});

test('new accounts accept the current terms version', () => {
  assert.match(registerPage, /terms_version:\s*'2026-10-18'/);
});
