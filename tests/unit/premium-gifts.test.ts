import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createPremiumGiftDisplayCode,
  getConfiguredPremiumGiftOffers,
  getPremiumGiftPriceId,
  hashPremiumRedemptionCode,
  isStripeCheckoutSessionId,
  parsePremiumGiftCheckoutPayload,
  parsePremiumGiftDuration,
} from '../../lib/premium-gifts.ts';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261017180700_premium_expansion_entitlements.sql', import.meta.url),
  'utf8',
);
const giftCheckoutRoute = readFileSync(
  new URL('../../app/api/premium-gifts/checkout/route.ts', import.meta.url),
  'utf8',
);
const giftCodeRoute = readFileSync(
  new URL('../../app/api/premium-gifts/code/route.ts', import.meta.url),
  'utf8',
);
const webhookRoute = readFileSync(
  new URL('../../app/api/stripe/webhook/route.ts', import.meta.url),
  'utf8',
);

const configuredEnvironment = {
  STRIPE_PREMIUM_GIFT_30D_PRICE_ID: ' price_gift_30 ',
  STRIPE_PREMIUM_GIFT_365D_PRICE_ID: 'price_gift_365',
};
const signingSecret = 'whsec_server_only_test_secret';

test('only allowlists the supported gift durations', () => {
  assert.equal(parsePremiumGiftDuration(30), 30);
  assert.equal(parsePremiumGiftDuration('90'), 90);
  assert.equal(parsePremiumGiftDuration(365), 365);
  assert.equal(parsePremiumGiftDuration(31), null);
  assert.equal(parsePremiumGiftDuration(' 30 '), null);
  assert.equal(parsePremiumGiftDuration('price_untrusted'), null);
  assert.equal(parsePremiumGiftCheckoutPayload({ duration: 90, priceId: 'price_untrusted' }), 90);
  assert.equal(parsePremiumGiftCheckoutPayload({ priceId: 'price_untrusted' }), null);
});

test('maps gift duration to server-only Stripe configuration', () => {
  assert.equal(getPremiumGiftPriceId(30, configuredEnvironment), 'price_gift_30');
  assert.equal(getPremiumGiftPriceId(90, configuredEnvironment), null);
  assert.equal(getPremiumGiftPriceId(365, configuredEnvironment), 'price_gift_365');
  assert.deepEqual(getConfiguredPremiumGiftOffers(configuredEnvironment), [
    { duration: 30, priceId: 'price_gift_30' },
    { duration: 365, priceId: 'price_gift_365' },
  ]);
});

test('derives a recoverable HMAC-protected code and stores only its hash', () => {
  const sessionId = 'cs_test_1234567890abcdefABCDEF';
  const code = createPremiumGiftDisplayCode(sessionId, signingSecret);

  assert.match(code, /^RD-GIFT-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);
  assert.equal(createPremiumGiftDisplayCode(sessionId, signingSecret), code);
  assert.notEqual(createPremiumGiftDisplayCode(sessionId, 'whsec_another_server_secret'), code);
  assert.notEqual(createPremiumGiftDisplayCode('cs_test_abcdef1234567890ABCDEF', signingSecret), code);
  assert.equal(
    hashPremiumRedemptionCode(` ${code.toLowerCase()} `),
    createHash('sha256').update(code).digest('hex'),
  );
  assert.equal(isStripeCheckoutSessionId(sessionId), true);
  assert.equal(isStripeCheckoutSessionId('not-a-checkout-session'), false);
  assert.throws(() => createPremiumGiftDisplayCode('not-a-checkout-session', signingSecret));
  assert.throws(() => createPremiumGiftDisplayCode(sessionId, ''));
});

test('gift checkout is a one-time, server-priced Stripe payment', () => {
  assert.match(giftCheckoutRoute, /mode: 'payment'/);
  assert.match(giftCheckoutRoute, /getPremiumGiftPriceId\(duration\)/);
  assert.match(giftCheckoutRoute, /metadata\[purchase_type\]': 'premium_gift'/);
  assert.match(giftCheckoutRoute, /metadata\[duration\]': String\(duration\)/);
  assert.doesNotMatch(giftCheckoutRoute, /payload\.price(?:Id)?/);
});

test('gift recovery verifies Stripe payment ownership before fulfillment', () => {
  assert.match(giftCodeRoute, /session\.payment_status === 'paid'/);
  assert.match(giftCodeRoute, /session\.metadata\?\.supabaseUserId === expectedBuyerId/);
  assert.match(giftCodeRoute, /session\.client_reference_id === expectedBuyerId/);
  assert.match(giftCodeRoute, /fulfill_stripe_premium_gift/);
});

test('gift fulfillment is service-role-only, idempotent, and cannot activate the buyer', () => {
  assert.match(migration, /create or replace function public\.fulfill_stripe_premium_gift\(/i);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(migration, /on conflict do nothing/i);
  assert.match(migration, /code_hash[\s\S]*kind[\s\S]*stripe_checkout_session_id/i);
  assert.match(migration, /revoke all on function public\.fulfill_stripe_premium_gift\(text, uuid, integer, text\) from public/i);
  assert.match(migration, /grant execute on function public\.fulfill_stripe_premium_gift\(text, uuid, integer, text\) to service_role/i);

  assert.match(webhookRoute, /checkout\.session\.async_payment_succeeded/);
  assert.match(webhookRoute, /payment_status !== 'paid'/);
  assert.match(webhookRoute, /fulfill_stripe_premium_gift/);
  const giftBlock = webhookRoute.split('if (isGiftCheckout)')[1]?.split('let supabaseUserId')[0] ?? '';
  assert.equal(giftBlock.includes("from('profiles')"), false);
  assert.equal(giftBlock.includes('isPremium:'), false);
});
