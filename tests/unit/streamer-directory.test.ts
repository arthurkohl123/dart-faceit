import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261022191748_add_streamer_directory_and_social_links.sql', import.meta.url),
  'utf8',
);
const directory = readFileSync(new URL('../../app/streamers/page.tsx', import.meta.url), 'utf8');
const streamerStatusRoute = readFileSync(new URL('../../app/api/streamers/route.ts', import.meta.url), 'utf8');
const publicProfile = readFileSync(new URL('../../app/players/[username]/page.tsx', import.meta.url), 'utf8');
const ownProfile = readFileSync(new URL('../../app/profile/page.tsx', import.meta.url), 'utf8');

test('only active streamers can save validated Twitch and Kick links', () => {
  assert.match(migration, /add column if not exists twitch_url text/i);
  assert.match(migration, /add column if not exists kick_url text/i);
  assert.match(migration, /twitch\\\.tv/i);
  assert.match(migration, /kick\\\.com/i);
  assert.match(migration, /create or replace function public\.update_streamer_social_links/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/i);
  assert.match(migration, /coalesce\(profile\.is_streamer, false\)/i);
  assert.match(migration, /raise exception 'STREAMER_ROLE_REQUIRED'/i);
  assert.match(migration, /revoke all on function public\.update_streamer_social_links\(text, text\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.update_streamer_social_links\(text, text\) to authenticated/i);
});

test('public links are visible only through the streamer projection and creator surfaces', () => {
  assert.match(migration, /case when coalesce\(p\.is_streamer, false\) then p\.twitch_url else null end/i);
  assert.match(migration, /case when coalesce\(p\.is_streamer, false\) then p\.kick_url else null end/i);
  assert.match(streamerStatusRoute, /\.eq\('is_streamer', true\)/);
  assert.match(directory, /twitch_url/);
  assert.match(directory, /getTwitchEmbedUrl/);
  assert.doesNotMatch(directory, /kick_url/);
  assert.match(publicProfile, /twitch_url/);
  assert.match(publicProfile, /kick_url/);
  assert.match(ownProfile, /update_streamer_social_links/);
});
