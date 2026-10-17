import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getConfiguredPremiumPlans,
  getPremiumPlanPriceId,
  parsePremiumCheckoutPayload,
  parsePremiumCheckoutPlan,
} from '../../lib/premium-offers.ts';

const monthlyOnlyEnvironment = {
  STRIPE_PREMIUM_PRICE_ID: 'price_monthly',
};

test('defaults an omitted checkout plan to monthly', () => {
  assert.equal(parsePremiumCheckoutPlan(undefined), 'monthly');
  assert.equal(parsePremiumCheckoutPayload({}), 'monthly');
});

test('only accepts the server allowlisted Premium plans', () => {
  assert.equal(parsePremiumCheckoutPayload({ plan: 'monthly' }), 'monthly');
  assert.equal(parsePremiumCheckoutPayload({ plan: 'yearly' }), 'yearly');
  assert.equal(parsePremiumCheckoutPayload({ plan: 'price_untrusted' }), null);
  assert.equal(parsePremiumCheckoutPayload({ plan: '' }), null);
  assert.equal(parsePremiumCheckoutPayload(null), null);
});

test('maps plan names to configured server-side price ids only', () => {
  assert.equal(getPremiumPlanPriceId('monthly', monthlyOnlyEnvironment), 'price_monthly');
  assert.equal(getPremiumPlanPriceId('yearly', monthlyOnlyEnvironment), null);
  assert.deepEqual(getConfiguredPremiumPlans(monthlyOnlyEnvironment), [
    { plan: 'monthly', priceId: 'price_monthly' },
  ]);
});

test('includes a yearly plan only when its dedicated environment value is configured', () => {
  const configuredEnvironment = {
    STRIPE_PREMIUM_PRICE_ID: ' price_monthly ',
    STRIPE_PREMIUM_YEARLY_PRICE_ID: ' price_yearly ',
  };

  assert.deepEqual(getConfiguredPremiumPlans(configuredEnvironment), [
    { plan: 'monthly', priceId: 'price_monthly' },
    { plan: 'yearly', priceId: 'price_yearly' },
  ]);
});
