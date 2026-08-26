import assert from 'node:assert/strict';
import test from 'node:test';
import { getHealthHttpStatus, getOverallHealth } from '../../lib/health.ts';

test('overall health uses the most severe component state', () => {
  assert.equal(getOverallHealth(['ok', 'ok']), 'ok');
  assert.equal(getOverallHealth(['ok', 'degraded']), 'degraded');
  assert.equal(getOverallHealth(['degraded', 'down', 'ok']), 'down');
});

test('only an outage produces a non-success HTTP status', () => {
  assert.equal(getHealthHttpStatus('ok'), 200);
  assert.equal(getHealthHttpStatus('degraded'), 200);
  assert.equal(getHealthHttpStatus('down'), 503);
});

