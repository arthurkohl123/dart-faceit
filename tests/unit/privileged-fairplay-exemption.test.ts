import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261104151641_exclude_privileged_profiles_from_fairplay_flags.sql', import.meta.url),
  'utf8',
);

test('official staff and streamers are excluded from every automatic Fair-Play hint queue', () => {
  assert.match(migration, /create or replace function public\.is_fairplay_exempt_profile/i);
  for (const role of ['is_admin', 'is_moderator', 'is_streamer']) {
    assert.match(migration, new RegExp(`coalesce\\(profile\\.${role}, false\\)`, 'i'));
  }
  assert.match(migration, /create or replace function public\.get_flagged_players/i);
  assert.match(migration, /create or replace function public\.mod_get_flagged_players/i);
  assert.match(migration, /create or replace function public\.admin_get_fairness_risk_flags/i);
  assert.match(migration, /not public\.is_fairplay_exempt_profile/i);
  assert.match(migration, /coalesce\(profile\.is_admin, false\)/i);
});

test('existing and later pair-signal flags are cleared when a privileged role applies', () => {
  assert.match(migration, /system_resolution', 'privileged_role_exempt'/i);
  assert.match(migration, /resolve_fairplay_flags_for_privileged_profile_trigger/i);
  assert.match(migration, /create or replace function public\.monitor_repeated_match_pairing/i);
  assert.match(migration, /public\.is_fairplay_exempt_profile\(v_first\)/i);
  assert.match(migration, /public\.is_fairplay_exempt_profile\(v_second\)/i);
});

test('the exemption does not turn off player reports or manual review access', () => {
  assert.doesNotMatch(migration, /drop function.*report_player_incident/i);
  assert.doesNotMatch(migration, /drop function.*admin_get_fairplay_review/i);
});
