import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261027030840_add_player_incident_reporting.sql', import.meta.url), 'utf8');
const reportButton = readFileSync(new URL('../../components/player-report-button.tsx', import.meta.url), 'utf8');
const matchroom = readFileSync(new URL('../../app/result/page.tsx', import.meta.url), 'utf8');
const playerProfile = readFileSync(new URL('../../app/players/[username]/page.tsx', import.meta.url), 'utf8');
const moderatorPage = readFileSync(new URL('../../app/moderator/page.tsx', import.meta.url), 'utf8');

test('player reports use one protected and deduplicated fair-play workflow', () => {
  assert.match(migration, /create or replace function public\.report_player_incident/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /v_reporter_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /support_tickets_open_player_report_unique/i);
  assert.match(migration, /maximal fünf Spielermeldungen innerhalb von 24 Stunden/i);
  assert.match(migration, /Du kannst dein eigenes Profil nicht melden/i);
  assert.match(migration, /Im Matchroom kannst du nur deinen Gegner melden/i);
  assert.match(migration, /revoke all on function public\.report_player_incident\(text, text, uuid, text, text\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.report_player_incident\(text, text, uuid, text, text\) to authenticated/i);
});

test('reports are available from the relevant player surfaces and are visible to moderators', () => {
  assert.match(reportButton, /report_player_incident/);
  assert.match(reportButton, /Meldungen werden vertraulich geprüft/);
  assert.match(matchroom, /source="matchroom"/);
  assert.match(playerProfile, /source="profile"/);
  assert.match(moderatorPage, /reported_username/);
  assert.match(moderatorPage, /Meldung ·/);
});

test('moderator ticket queries include the reporting context', () => {
  assert.match(migration, /drop function if exists public\.mod_get_tickets\(text, integer, integer\)/i);
  assert.match(migration, /reported_profile_id uuid/i);
  assert.match(migration, /reported\.username/i);
  assert.match(migration, /report_source/i);
  assert.match(migration, /active_match_id/i);
  assert.match(migration, /incident_kind/i);
});
