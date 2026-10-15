import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPremiumTimeRemaining, getManualPremiumState, getPremiumSubscriptionState } from '../../lib/premium-subscription.ts';

const now = new Date('2026-10-16T12:00:00.000Z');

test('shows the next period end for an active subscription that renews', () => {
  assert.deepEqual(getPremiumSubscriptionState({
    stripe_subscription_status: 'active',
    stripe_current_period_end: '2026-11-16T12:00:00.000Z',
    stripe_cancel_at_period_end: false,
  }, now), { kind: 'renewing', periodEnd: '2026-11-16T12:00:00.000Z' });
});

test('shows the access end for a subscription cancelled at period end', () => {
  assert.deepEqual(getPremiumSubscriptionState({
    stripe_subscription_status: 'trialing',
    stripe_current_period_end: '2026-10-18T15:30:00.000Z',
    stripe_cancel_at_period_end: true,
  }, now), { kind: 'ending', periodEnd: '2026-10-18T15:30:00.000Z' });
});

test('does not invent a billing date while the Stripe data is incomplete', () => {
  assert.deepEqual(getPremiumSubscriptionState({
    stripe_subscription_status: 'active',
    stripe_current_period_end: null,
  }, now), { kind: 'syncing' });
});

test('marks an expired billing date as stale instead of claiming that the subscription is active', () => {
  assert.deepEqual(getPremiumSubscriptionState({
    stripe_subscription_status: 'active',
    stripe_current_period_end: '2026-10-16T11:59:59.999Z',
  }, now), { kind: 'stale', periodEnd: '2026-10-16T11:59:59.999Z' });
});

test('does not show a subscription panel for inactive subscription statuses', () => {
  assert.deepEqual(getPremiumSubscriptionState({
    stripe_subscription_status: 'canceled',
    stripe_current_period_end: '2026-11-16T12:00:00.000Z',
  }, now), { kind: 'none' });
});

test('distinguishes a timed manual grant from unlimited manual Premium', () => {
  assert.deepEqual(getManualPremiumState({
    isPremium: true,
    premium_manual_granted_at: '2026-10-01T12:00:00.000Z',
    premium_manual_until: '2026-10-20T12:00:00.000Z',
  }, now), { kind: 'ending', periodEnd: '2026-10-20T12:00:00.000Z' });

  assert.deepEqual(getManualPremiumState({
    isPremium: true,
    premium_manual_granted_at: '2026-10-01T12:00:00.000Z',
    premium_manual_until: null,
  }, now), { kind: 'unlimited' });
});

test('formats a compact remaining-time label', () => {
  assert.equal(formatPremiumTimeRemaining('2026-10-18T17:00:00.000Z', now), 'noch 2 Tage, 5 Std.');
  assert.equal(formatPremiumTimeRemaining('2026-10-16T12:01:00.000Z', now), 'noch 1 Min.');
  assert.equal(formatPremiumTimeRemaining('2026-10-16T11:59:59.999Z', now), null);
});

