import assert from 'node:assert/strict';
import test from 'node:test';
import { getChunkRecoveryUrl, isChunkLoadError } from '../../lib/client-error-recovery.ts';

test('recognizes recoverable Next.js chunk errors', () => {
  assert.equal(isChunkLoadError(new Error('Failed to load chunk /_next/static/chunks/0tqycowu8dmm9.js from module 64893')), true);
  assert.equal(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 123 failed.')), true);
  assert.equal(isChunkLoadError(new Error('Failed to fetch player profile')), false);
});

test('keeps the current location while making a fresh document request', () => {
  const url = new URL(getChunkRecoveryUrl('https://www.rankeddarts.de/matchmaking?queue=scolia'));
  assert.equal(url.pathname, '/matchmaking');
  assert.equal(url.searchParams.get('queue'), 'scolia');
  assert.ok(url.searchParams.get('__chunk_retry'));
});
