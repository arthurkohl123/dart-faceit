import assert from 'node:assert/strict';
import test from 'node:test';
import { getEloPeriodSummary, type EloPeriodMatch } from '../../lib/elo-period-summary.ts';

const now = new Date('2026-10-16T12:00:00.000Z');

test('summarizes Elo gains and losses over a rolling 24-hour window', () => {
  const summary = getEloPeriodSummary([
    { created_at: '2026-10-16T11:00:00.000Z', elo_change: 18, match_mode: 'ranked' },
    { created_at: '2026-10-15T12:00:00.000Z', elo_change: -9, match_mode: 'ranked' },
    { created_at: '2026-10-15T11:59:59.999Z', elo_change: 32, match_mode: 'ranked' },
    { created_at: '2026-10-16T10:00:00.000Z', elo_change: 24, match_mode: 'private' },
  ], '24h', now);

  assert.deepEqual(summary, { ratedMatches: 2, gained: 18, lost: 9, net: 9 });
});

test('uses completed_at and supports the seven- and thirty-day filters', () => {
  const matches: EloPeriodMatch[] = [
    { created_at: '2026-09-01T09:00:00.000Z', completed_at: '2026-10-12T12:00:00.000Z', elo_change: 12, match_mode: 'ranked' },
    { created_at: '2026-10-10T12:00:00.000Z', elo_change: -15, match_mode: 'ranked' },
    { created_at: '2026-09-17T12:00:00.000Z', elo_change: 8, match_mode: 'ranked' },
    { created_at: '2026-09-16T11:59:59.999Z', elo_change: 20, match_mode: 'ranked' },
  ];

  assert.deepEqual(getEloPeriodSummary(matches, '7d', now), { ratedMatches: 2, gained: 12, lost: 15, net: -3 });
  assert.deepEqual(getEloPeriodSummary(matches, '30d', now), { ratedMatches: 3, gained: 20, lost: 15, net: 5 });
});

