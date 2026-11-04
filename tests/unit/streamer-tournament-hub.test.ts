import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261104174352_add_streamer_tournament_hub.sql', import.meta.url),
  'utf8',
);
const creatorPage = readFileSync(new URL('../../app/creator/page.tsx', import.meta.url), 'utf8');
const announceRoute = readFileSync(new URL('../../app/api/streamer/tournaments/announce/route.ts', import.meta.url), 'utf8');

test('the Streamer Hub has a dedicated server-side permission boundary', () => {
  assert.match(migration, /create or replace function public\.streamer_create_tournament/i);
  assert.match(migration, /create or replace function public\.streamer_list_my_tournaments/i);
  assert.match(migration, /create or replace function public\.streamer_list_tournament_participants/i);
  assert.match(migration, /create or replace function public\.streamer_update_tournament_schedule/i);
  assert.match(migration, /create or replace function public\.streamer_cancel_tournament/i);
  assert.match(migration, /coalesce\(profile\.is_streamer, false\)/i);
  assert.match(migration, /revoke all on function public\.streamer_create_tournament/i);
  assert.match(migration, /grant execute on function public\.streamer_create_tournament/i);
});

test('streamer cups remain free, public and protected from organizer conflicts', () => {
  assert.match(migration, /premium_only, max_average, min_average, scoring_platform, access_code_hash/i);
  assert.match(migration, /false, null, null, p_scoring_platform, null/i);
  assert.match(migration, /Streamer-Turniere sind immer kostenlos, öffentlich und ohne Preisgeld/i);
  assert.match(migration, /prevent_streamer_host_tournament_participation/i);
  assert.match(migration, /Als Veranstalter kannst du nicht selbst an deinem Streamer-Turnier teilnehmen/i);
  assert.match(migration, /maximal zwei Community-Turniere innerhalb von sieben Tagen/i);
  assert.match(migration, /status in \('registration', 'live'\)/i);
});

test('creator changes remain scoped to the owner and notify enrolled players', () => {
  assert.match(migration, /tournament\.created_by = auth\.uid\(\)/i);
  assert.match(migration, /tournament\.streamer_hosted = true/i);
  assert.match(migration, /Turnierzeitplan aktualisiert/i);
  assert.match(migration, /Streamer-Turnier abgesagt/i);
  assert.match(migration, /tournament\.status = 'registration'/i);
});

test('public tournament cards disclose their Streamer host without exposing admin controls', () => {
  assert.match(migration, /host_username text, host_twitch_url text/i);
  assert.match(migration, /grant execute on function public\.list_tournaments\(\) to anon/i);
  assert.match(creatorPage, /Creator Hub/i);
  assert.match(creatorPage, /Community Cup/i);
  assert.doesNotMatch(creatorPage, /admin_create_tournament/i);
  assert.doesNotMatch(creatorPage, /admin_report_tournament_winner/i);
  assert.doesNotMatch(creatorPage, /admin_update_tournament_awards/i);
});

test('Discord creator announcements are owner-only and never ping everyone', () => {
  assert.match(announceRoute, /\.eq\('created_by', user\.id\)/i);
  assert.match(announceRoute, /\.eq\('streamer_hosted', true\)/i);
  assert.match(announceRoute, /allowed_mentions: \{ parse: \[\] as string\[\] \}/i);
  assert.doesNotMatch(announceRoute, /content:\s*['"]@everyone/i);
  assert.doesNotMatch(announceRoute, /parse:\s*\[\s*['"]everyone/i);
});
