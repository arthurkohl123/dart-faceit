import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const integrity = readFileSync(join(root, 'supabase/migrations/20260827000000_harden_ranked_match_integrity.sql'), 'utf8');
const stripe = readFileSync(join(root, 'supabase/migrations/20260827010000_harden_stripe_entitlements.sql'), 'utf8');

test('ranked results are finalized through one locked idempotent path', () => {
  assert.match(integrity, /for update;/i);
  assert.match(integrity, /MATCH_ALREADY_RATED/);
  assert.match(integrity, /matches_active_match_user_key/);
  assert.match(integrity, /drop function if exists public\.submit_match_result\(uuid, integer, integer, numeric, integer, integer\)/i);
});

test('browser clients lose broad match write policies', () => {
  assert.match(integrity, /drop policy if exists "RPCs can manage active matches"/i);
  assert.match(integrity, /revoke insert, update, delete on public\.active_matches from anon, authenticated/i);
  assert.match(integrity, /revoke insert, update, delete on public\.matches from anon, authenticated/i);
  assert.match(integrity, /get_matchmaking_queue_counts/);
});

test('Stripe webhook processing has a durable idempotency ledger', () => {
  assert.match(stripe, /stripe_webhook_events/);
  assert.match(stripe, /claim_stripe_webhook_event/);
  assert.match(stripe, /then 'processed' else 'failed'/);
  assert.match(stripe, /has_active_premium/);
});
