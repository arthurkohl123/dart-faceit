import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../../app/api/admin/streamer-twitch/route.ts', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../../app/admin/page.tsx', import.meta.url), 'utf8');
const publicStreamerRoute = readFileSync(new URL('../../app/api/streamers/route.ts', import.meta.url), 'utf8');

test('only admins can manually manage Twitch links for active streamers', () => {
  assert.match(route, /createServerSupabaseClient/);
  assert.match(route, /actor\?\.is_admin/);
  assert.match(route, /target\.is_streamer/);
  assert.match(route, /getTwitchChannel/);
  assert.match(route, /https:\/\/www\.twitch\.tv\/\$\{channel\}/);
  assert.match(route, /STREAMER_TWITCH_UPDATED/);
});

test('the public streamer list excludes profiles without a Twitch channel', () => {
  assert.match(publicStreamerRoute, /\.not\('twitch_url', 'is', null\)/);
  assert.match(admin, /\/api\/admin\/streamer-twitch/);
  assert.match(admin, /Twitch-Kanal/);
});
