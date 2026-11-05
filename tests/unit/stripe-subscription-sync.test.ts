import assert from 'node:assert/strict';
import test from 'node:test';
import { getStripeSubscriptionEventIgnoreReason, getStripeSubscriptionPeriodEnd } from '../../lib/stripe-subscription-sync.ts';

test('reads the billing period from subscription items on current Stripe API versions', () => {
  assert.equal(getStripeSubscriptionPeriodEnd({
    current_period_end: null,
    items: { data: [{ current_period_end: 1_795_000_000 }, { current_period_end: 1_795_100_000 }] },
  }), 1_795_100_000);
  assert.equal(getStripeSubscriptionPeriodEnd({ current_period_end: 1_794_900_000 }), 1_794_900_000);
});

test('an inactive sibling subscription cannot replace an active Premium subscription', () => {
  assert.equal(getStripeSubscriptionEventIgnoreReason({
    storedSubscriptionId: 'sub_active',
    storedSubscriptionStatus: 'active',
    storedLastEventAt: '2026-11-05T12:00:00.000Z',
    incomingSubscriptionId: 'sub_past_due',
    incomingSubscriptionStatus: 'past_due',
    incomingEventAt: '2026-11-05T12:01:00.000Z',
  }), 'inactive_sibling_subscription');
});

test('stale events are compared only within the same Stripe subscription', () => {
  assert.equal(getStripeSubscriptionEventIgnoreReason({
    storedSubscriptionId: 'sub_active',
    storedSubscriptionStatus: 'active',
    storedLastEventAt: '2026-11-05T12:00:00.000Z',
    incomingSubscriptionId: 'sub_active',
    incomingSubscriptionStatus: 'active',
    incomingEventAt: '2026-11-05T11:59:00.000Z',
  }), 'stale_subscription_event');
  assert.equal(getStripeSubscriptionEventIgnoreReason({
    storedSubscriptionId: 'sub_active',
    storedSubscriptionStatus: 'active',
    storedLastEventAt: '2026-11-05T12:00:00.000Z',
    incomingSubscriptionId: 'sub_other_active',
    incomingSubscriptionStatus: 'active',
    incomingEventAt: '2026-11-05T11:59:00.000Z',
  }), null);
});
