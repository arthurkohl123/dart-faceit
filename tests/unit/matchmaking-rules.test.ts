import assert from 'node:assert/strict';
import test from 'node:test';
import { getDailyMatchesUsed, getMaxEloDiff, hasReachedDailyMatchLimit } from '../../lib/matchmaking-rules.ts';

test('the Elo search range expands at the configured boundaries', () => {
  assert.equal(getMaxEloDiff(0), 50);
  assert.equal(getMaxEloDiff(14), 50);
  assert.equal(getMaxEloDiff(15), 100);
  assert.equal(getMaxEloDiff(29), 100);
  assert.equal(getMaxEloDiff(30), 200);
  assert.equal(getMaxEloDiff(59), 200);
  assert.equal(getMaxEloDiff(60), 300);
  assert.equal(getMaxEloDiff(89), 300);
  assert.equal(getMaxEloDiff(90), 400);
  assert.equal(getMaxEloDiff(119), 400);
  assert.equal(getMaxEloDiff(120), 500);
  assert.equal(getMaxEloDiff(6000), 500);
});

test('free users stop at four daily matches while premium stays unlimited', () => {
  assert.equal(hasReachedDailyMatchLimit({ is_premium: false, matches_used: 3, daily_limit: 4 }), false);
  assert.equal(hasReachedDailyMatchLimit({ is_premium: false, matches_used: 4, daily_limit: 4 }), true);
  assert.equal(hasReachedDailyMatchLimit({ is_premium: true, matches_used: 999, daily_limit: null }), false);
  assert.equal(hasReachedDailyMatchLimit(null), false);
});

test('quota values support database response aliases', () => {
  assert.equal(getDailyMatchesUsed({ is_premium: false, matches_started: 2, daily_limit: 4 }), 2);
  assert.equal(getDailyMatchesUsed({ is_premium: false, matches_played: 3, daily_limit: 4 }), 3);
  assert.equal(getDailyMatchesUsed({ is_premium: false, matches_used: -2, daily_limit: 4 }), 0);
});
