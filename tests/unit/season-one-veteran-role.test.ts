import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261103220310_add_season_one_veteran_role.sql', import.meta.url),
  'utf8',
);
const leaderboard = readFileSync(new URL('../../app/leaderboard/page.tsx', import.meta.url), 'utf8');
const publicProfile = readFileSync(new URL('../../app/players/[username]/page.tsx', import.meta.url), 'utf8');
const ownProfile = readFileSync(new URL('../../components/ProfileV2.tsx', import.meta.url), 'utf8');
const discord = readFileSync(new URL('../../lib/discord.ts', import.meta.url), 'utf8');
const discordSync = readFileSync(new URL('../../app/api/discord/sync/route.ts', import.meta.url), 'utf8');

test('Season 01 Veteran is a permanent cosmetic award based on the frozen Season 01 snapshot', () => {
  assert.match(migration, /add column if not exists is_season_one_veteran boolean not null default false/i);
  assert.match(migration, /new\.is_season_one_veteran := false/i);
  assert.match(migration, /lower\(snapshot\.season_label\) = 'season 01'/i);
  assert.match(migration, /snapshot\.games_played >= 150/i);
  assert.match(migration, /veteran_season_one_games = snapshot\.games_played/i);
  assert.match(migration, /revoke all on table public\.public_visible_profiles from public, anon, authenticated/i);
});

test('Veterans are visibly marked in both profile variants, not in the leaderboard', () => {
  for (const source of [publicProfile, ownProfile]) {
    assert.match(source, /is_season_one_veteran/);
    assert.match(source, /VeteranBadge/);
  }
  assert.doesNotMatch(leaderboard, /VeteranBadge/);
  assert.match(leaderboard, /is_season_one_veteran:\s+boolean/i);
});

test('the optional Discord Veteran role is reconciled only server-side', () => {
  assert.match(discord, /DISCORD_VETERAN_ROLE_ID/);
  assert.match(discord, /syncDiscordVeteranRole/);
  assert.match(discordSync, /isDiscordVeteranRoleConfigured/);
  assert.match(discordSync, /Boolean\(profile\.is_season_one_veteran\)/);
});
