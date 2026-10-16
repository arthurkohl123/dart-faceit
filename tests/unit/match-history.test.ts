import assert from 'node:assert/strict';
import test from 'node:test';
import { filterMatchHistory, getMatchFinishedAt, isMatchInPeriod, type MatchHistoryEntry } from '../../lib/match-history.ts';

const now = new Date('2026-10-16T12:00:00.000Z');

const matches: MatchHistoryEntry[] = [
  {
    id: 'won-scolia', created_at: '2026-10-16T09:00:00.000Z', opponent_name: 'Lisa', opponent_elo: 1500,
    is_win: true, result: '3:1', legs_won: 3, legs_lost: 1, my_average: 58, highest_checkout: 100, elo_change: 20, app: 'scolia', match_mode: 'ranked',
  },
  {
    id: 'lost-dartcounter', created_at: '2026-10-12T12:00:00.000Z', opponent_name: 'Lars', opponent_elo: 1510,
    is_win: false, result: '2:3', legs_won: 2, legs_lost: 3, my_average: 56, highest_checkout: 80, elo_change: -15, app: 'dartcounter', match_mode: 'ranked',
  },
  {
    id: 'private-autodarts', created_at: '2026-09-01T12:00:00.000Z', completed_at: '2026-10-15T13:00:00.000Z', opponent_name: 'Lina', opponent_elo: null,
    is_win: true, result: '3:0', legs_won: 3, legs_lost: 0, my_average: null, highest_checkout: null, elo_change: 0, app: 'autodarts', match_mode: 'private',
  },
  {
    id: 'old-win', created_at: '2026-08-01T12:00:00.000Z', opponent_name: 'Andre', opponent_elo: 1420,
    is_win: true, result: '3:2', legs_won: 3, legs_lost: 2, my_average: 55, highest_checkout: 91, elo_change: 12, app: 'scolia', match_mode: 'ranked',
  },
];

test('uses completed_at for the visible history date and rolling period filter', () => {
  assert.equal(getMatchFinishedAt(matches[2]), '2026-10-15T13:00:00.000Z');
  assert.equal(isMatchInPeriod(matches[2], '24h', now), true);
  assert.equal(isMatchInPeriod(matches[3], '30d', now), false);
});

test('combines time, result, mode, platform, and opponent filters', () => {
  const filtered = filterMatchHistory(matches, {
    period: '7d',
    result: 'wins',
    mode: 'ranked',
    platform: 'scolia',
    opponentQuery: ' LISA ',
  }, now);

  assert.deepEqual(filtered.map((match) => match.id), ['won-scolia']);
});

test('handles null opponent names and keeps every valid past match in the complete history', () => {
  const withUnknownOpponent = { ...matches[0], id: 'unknown', opponent_name: null };
  const filtered = filterMatchHistory([...matches, withUnknownOpponent], {
    period: 'all',
    result: 'all',
    mode: 'all',
    platform: 'all',
    opponentQuery: '',
  }, now);

  assert.equal(filtered.length, 5);
  assert.deepEqual(filterMatchHistory([...matches, withUnknownOpponent], {
    period: 'all', result: 'all', mode: 'all', platform: 'all', opponentQuery: 'unknown',
  }, now), []);
});

