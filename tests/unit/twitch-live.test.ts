import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getTwitchChannel, getTwitchEmbedUrl } from '../../lib/twitch.ts';

const route = readFileSync(new URL('../../app/api/streamers/route.ts', import.meta.url), 'utf8');
const directory = readFileSync(new URL('../../app/streamers/page.tsx', import.meta.url), 'utf8');

test('extracts only valid Twitch channel URLs', () => {
  assert.equal(getTwitchChannel('https://www.twitch.tv/rankeddarts'), 'rankeddarts');
  assert.equal(getTwitchChannel('https://twitch.tv/Ranked_Darts/'), 'ranked_darts');
  assert.equal(getTwitchChannel('https://example.com/rankeddarts'), null);
  assert.equal(getTwitchChannel('https://www.twitch.tv/rankeddarts/videos'), null);
});

test('builds a Twitch embed URL with the required parent', () => {
  const url = new URL(getTwitchEmbedUrl('rankeddarts', 'www.rankeddarts.de'));
  assert.equal(url.hostname, 'player.twitch.tv');
  assert.equal(url.searchParams.get('channel'), 'rankeddarts');
  assert.equal(url.searchParams.get('parent'), 'www.rankeddarts.de');
  assert.equal(url.searchParams.get('autoplay'), 'false');
});

test('live state is looked up server-side and only the selected stream is embedded', () => {
  assert.match(route, /TWITCH_CLIENT_SECRET/);
  assert.match(route, /https:\/\/api\.twitch\.tv\/helix\/streams/);
  assert.match(route, /s-maxage=60/);
  assert.match(directory, /selectedUsername/);
  assert.match(directory, /stream_status === 'live'/);
  assert.match(directory, /getTwitchEmbedUrl\(selectedStreamer\.twitch_channel, \['rankeddarts\.de', 'www\.rankeddarts\.de'\]\)/);
  assert.match(directory, /iframe title=\{`Twitch-Stream von \$\{selectedStreamer\.username\}`\}/);
});
