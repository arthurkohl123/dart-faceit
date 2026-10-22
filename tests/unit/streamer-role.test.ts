import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261022142832_add_streamer_role_and_premium_access.sql', import.meta.url),
  'utf8',
);
const leaderboard = readFileSync(new URL('../../app/leaderboard/page.tsx', import.meta.url), 'utf8');
const publicProfile = readFileSync(new URL('../../app/players/[username]/page.tsx', import.meta.url), 'utf8');
const ownProfile = readFileSync(new URL('../../components/ProfileV2.tsx', import.meta.url), 'utf8');
const discord = readFileSync(new URL('../../lib/discord.ts', import.meta.url), 'utf8');
const syncRoute = readFileSync(new URL('../../app/api/admin/streamer-sync/route.ts', import.meta.url), 'utf8');

test('streamer status is admin-controlled, publicly visible and grants Premium access', () => {
  assert.match(migration, /add column if not exists is_streamer boolean not null default false/i);
  assert.match(migration, /new\.is_streamer := false/i);
  assert.match(migration, /coalesce\(p\.is_streamer, false\)/i);
  assert.match(migration, /create or replace function public\.admin_set_streamer\(/i);
  assert.match(migration, /and coalesce\(admin_profile\.is_admin, false\)/i);
  assert.match(migration, /v_premium := public\.refresh_premium_entitlement_cache\(v_user_id\)/i);
  assert.match(migration, /p\.is_streamer/i);
  assert.match(migration, /revoke all on function public\.admin_set_streamer\(uuid, boolean, text\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_set_streamer\(uuid, boolean, text\) to authenticated/i);
});

test('streamers are marked in the leaderboard and both profile variants', () => {
  for (const source of [leaderboard, publicProfile]) {
    assert.match(source, /is_streamer/);
    assert.match(source, /StreamerBadge/);
  }
  assert.match(ownProfile, /profile\?\.is_streamer && <StreamerBadge/);
});

test('Discord streamer role is optional, guarded server-side and syncable on assignment', () => {
  assert.match(discord, /DISCORD_STREAMER_ROLE_ID/);
  assert.match(discord, /syncDiscordStreamerRole/);
  assert.match(syncRoute, /createServerSupabaseClient/);
  assert.match(syncRoute, /requester\?\.is_admin/);
  assert.match(syncRoute, /syncDiscordStreamerRole/);
});
