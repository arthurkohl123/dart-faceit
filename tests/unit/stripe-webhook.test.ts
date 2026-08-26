import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyStripeSignature } from '../../lib/stripe-webhook.ts';

const secret = 'whsec_test_secret';
const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
const nowMs = 1_800_000_000_000;
const timestamp = Math.floor(nowMs / 1000);

function signature(value = payload, time = timestamp) {
  return createHmac('sha256', secret).update(`${time}.${value}`, 'utf8').digest('hex');
}

test('accepts a valid Stripe signature', () => {
  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${signature()}`, secret, nowMs), true);
});

test('accepts any matching v1 signature during secret rotation', () => {
  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${'0'.repeat(64)},v1=${signature()}`, secret, nowMs), true);
});

test('rejects tampering, malformed signatures and stale events', () => {
  assert.equal(verifyStripeSignature(`${payload}x`, `t=${timestamp},v1=${signature()}`, secret, nowMs), false);
  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=not-hex`, secret, nowMs), false);
  assert.equal(verifyStripeSignature(payload, `t=${timestamp - 301},v1=${signature(payload, timestamp - 301)}`, secret, nowMs), false);
  assert.equal(verifyStripeSignature(payload, 'v1=abc', secret, nowMs), false);
});
