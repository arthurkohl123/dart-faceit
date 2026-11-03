import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261103162841_strengthen_fairplay_account_protection.sql', 'utf8');
const trustGateRemoval = readFileSync('supabase/migrations/20261103165229_remove_prize_tournament_trust_gate.sql', 'utf8');
const registration = readFileSync('app/auth/register/page.tsx', 'utf8');
const profile = readFileSync('app/profile/page.tsx', 'utf8');
const signalRoute = readFileSync('app/api/security/session-signal/route.ts', 'utf8');
const tournamentPage = readFileSync('app/tournaments/[id]/page.tsx', 'utf8');
const tournamentRules = readFileSync('app/turnierregeln/page.tsx', 'utf8');

test('platform identities are reserved without overwriting historic duplicate links', () => {
  assert.match(migration, /SCOLIA_USERNAME_ALREADY_LINKED/);
  assert.match(migration, /DARTCOUNTER_USERNAME_ALREADY_LINKED/);
  assert.match(migration, /AUTODARTS_USERNAME_ALREADY_LINKED/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /duplicate_platform_identity/);
  assert.match(migration, /historical duplicates are surfaced to staff/i);
});

test('paid phone verification is removed from registration without weakening existing email and captcha flows', () => {
  assert.doesNotMatch(registration, /Handynummer/);
  assert.doesNotMatch(registration, /verify-phone/);
  assert.match(registration, /verifyCaptcha\('register'/);
  assert.match(registration, /auth\.signUp/);
  assert.match(profile, /ALREADY_LINKED/);
});

test('network signals are pseudonymized, short-lived, and only available to staff review', () => {
  assert.match(signalRoute, /createHmac\('sha256'/);
  assert.match(migration, /account_security_signals/);
  assert.match(migration, /interval '7 days'/);
  assert.match(migration, /SERVICE_ROLE_REQUIRED/);
  assert.match(migration, /admin_get_network_overlaps/);
  assert.match(migration, /never a ban trigger/i);
});

test('prize tournaments do not require an account age or ranked-match trust gate', () => {
  assert.match(trustGateRemoval, /drop function if exists public\.get_my_prize_tournament_eligibility/i);
  assert.doesNotMatch(trustGateRemoval, /required_account_age_hours|required_ranked_matches|v_eligibility/);
  assert.doesNotMatch(tournamentPage, /Fair-Play-Freischaltung/);
  assert.doesNotMatch(tournamentRules, /drei bestätigte Ranked-Matches/);
});
