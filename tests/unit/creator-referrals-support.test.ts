import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261104181849_add_creator_referrals_and_support.sql', import.meta.url), 'utf8');
const creatorHub = readFileSync(new URL('../../app/creator/page.tsx', import.meta.url), 'utf8');
const register = readFileSync(new URL('../../app/auth/register/page.tsx', import.meta.url), 'utf8');
const referralRoute = readFileSync(new URL('../../app/r/[code]/route.ts', import.meta.url), 'utf8');
const privacy = readFileSync(new URL('../../app/datenschutz/page.tsx', import.meta.url), 'utf8');

test('creator referral data is private and only Streamers can read their own aggregate figures', () => {
  assert.match(migration, /create table if not exists public\.creator_referral_codes/i);
  assert.match(migration, /create table if not exists public\.creator_referral_attributions/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.creator_referral_codes from public, anon, authenticated/i);
  assert.match(migration, /function public\.streamer_get_referral_stats\(\)[\s\S]*security definer/i);
  assert.match(migration, /coalesce\(profile\.is_streamer, false\)/i);
  assert.match(migration, /grant execute on function public\.streamer_get_referral_stats\(\) to authenticated/i);
});

test('a referral is one-time, safe to receive from registration metadata, and counts a normal first Ranked match only', () => {
  assert.match(migration, /creator_referral_attributions_no_self_referral/i);
  assert.match(migration, /on conflict \(referred_profile_id\) do nothing/i);
  assert.match(migration, /raw_user_meta_data ->> 'creator_referral_code'/i);
  assert.match(migration, /coalesce\(new\.match_mode, 'ranked'\) <> 'ranked'/i);
  assert.match(migration, /exists \(select 1 from public\.tournament_matches/i);
  assert.match(migration, /first_ranked_match_at is null/i);
});

test('the public link only forwards a verified active Creator code to registration', () => {
  assert.match(referralRoute, /REFERRAL_CODE_PATTERN/);
  assert.match(referralRoute, /createAdminClient/);
  assert.match(referralRoute, /\.eq\('code', code\)/);
  assert.match(referralRoute, /streamer\?\.is_streamer/);
  assert.match(referralRoute, /destination\.searchParams\.set\('ref', code\)/);
  assert.match(referralRoute, /return NextResponse\.redirect\(destination\)/);
});

test('registration preserves a valid Creator referral and the Hub offers referral and priority support tools', () => {
  assert.match(register, /useSearchParams/);
  assert.match(register, /creator_referral_code: referralCode/);
  assert.match(creatorHub, /streamer_get_referral_stats/);
  assert.match(creatorHub, /streamer_create_creator_support_ticket/);
  assert.match(creatorHub, /\/r\/\$\{referral\.referral_code\}/);
  assert.match(creatorHub, /Keine Klick-, IP- oder Browser-Auswertung/);
  assert.match(migration, /creator_support boolean not null default false/i);
  assert.match(migration, /\[Creator\] ' \|\| v_subject/i);
});

test('the privacy notice transparently describes the limited Creator referral processing', () => {
  assert.match(privacy, /Creator-Empfehlungslinks/);
  assert.match(privacy, /keine Klicks, IP-Adressen oder Browserdaten/i);
});
