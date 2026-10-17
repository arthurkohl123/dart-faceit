import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261017180700_premium_expansion_entitlements.sql', import.meta.url),
  'utf8',
);
const webhookRoute = readFileSync(
  new URL('../../app/api/stripe/webhook/route.ts', import.meta.url),
  'utf8',
);

test('only exposes the explicit public profile preference to self-service updates', () => {
  assert.match(migration, /drop policy if exists "profiles_update_own_safe"/i);
  assert.match(migration, /create policy "profiles_update_own_safe"[\s\S]*?with check \([\s\S]*?to_jsonb\(profiles\) - 'is_publicly_visible'/i);
  assert.match(migration, /drop policy if exists "profiles_public_read" on public\.profiles/i);
  assert.match(migration, /revoke all on table public\.profiles from anon/i);
  assert.match(migration, /revoke all on table public\.public_visible_profiles from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.public_visible_profiles to anon, authenticated/i);

  const insertGuard = migration.split('create or replace function public.guard_profile_self_insert()')[1]?.split('-- Existing paid\/manual')[0] ?? '';
  for (const protectedAssignment of [
    'new."isPremium" := false',
    'new.stripe_subscription_status := null',
    'new.premium_manual_granted_at := null',
    'new.premium_access_managed := false',
    "new.premium_cosmetic := 'emerald'",
  ]) {
    assert.ok(insertGuard.includes(protectedAssignment), `insert guard must reset ${protectedAssignment}`);
  }
});

test('serializes code redemption and preserves fixed-duration access correctly', () => {
  const redemption = migration.split('create or replace function public.redeem_premium_code')[1]?.split('create or replace function public.set_my_premium_cosmetic')[0] ?? '';
  assert.match(redemption, /from public\.profiles profile[\s\S]*?for update/i);
  assert.match(redemption, /from public\.premium_redemption_codes[\s\S]*?for update/i);
  assert.match(redemption, /premium_manual_until is null/i);
  assert.match(redemption, /greatest\([\s\S]*?max\(entitlement\.ends_at\)[\s\S]*?v_profile\.premium_manual_until/i);
  assert.match(redemption, /perform public\.refresh_premium_entitlement_cache\(v_user_id\)/i);
});

test('privileged Premium functions use a fixed safe search path and Stripe refreshes the entitlement cache', () => {
  const privilegedBlocks = migration.match(/security definer[\s\S]*?(?=\n\$\$;)/gi) ?? [];
  assert.ok(privilegedBlocks.length >= 10, 'expected the Premium RPCs to be security definer functions');
  for (const block of privilegedBlocks) {
    assert.match(block, /set search_path = pg_catalog, public, pg_temp/i);
    assert.doesNotMatch(block, /set search_path = public(?:\s|$)/i);
  }

  assert.match(webhookRoute, /refresh_premium_entitlement_cache/);
  assert.match(webhookRoute, /Boolean\(effectivePremium\)/);
});
