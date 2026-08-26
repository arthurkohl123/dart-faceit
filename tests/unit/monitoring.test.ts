import assert from 'node:assert/strict';
import test from 'node:test';
import { monitoringErrorMessage } from '../../lib/monitoring-utils.ts';

test('monitoring normalizes unknown errors without leaking oversized messages', () => {
  assert.equal(monitoringErrorMessage(new Error('Stripe unavailable')), 'Stripe unavailable');
  assert.equal(monitoringErrorMessage('network error'), 'network error');
  assert.equal(monitoringErrorMessage({ code: 500 }), 'Unbekannter Produktionsfehler');
  assert.equal(monitoringErrorMessage('x'.repeat(1_500)).length, 1_000);
});
