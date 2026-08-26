import assert from 'node:assert/strict';
import test from 'node:test';
import { getRankForElo, getRankProgress, getRankRangeLabel, RANK_TIERS } from '../../lib/ranks.ts';

test('the ladder has ten ordered levels and Immortal starts at 2000 Elo', () => {
  assert.equal(RANK_TIERS.length, 10);
  assert.deepEqual(RANK_TIERS.map((rank) => rank.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(RANK_TIERS.at(-1)?.name, 'Immortal');
  assert.equal(RANK_TIERS.at(-1)?.min, 2000);
  assert.ok(RANK_TIERS.every((rank, index) => index === 0 || rank.min > RANK_TIERS[index - 1].min));
});

test('every Elo boundary resolves to the intended rank', () => {
  for (const [index, rank] of RANK_TIERS.entries()) {
    assert.equal(getRankForElo(rank.min).level, rank.level);
    if (index > 0) assert.equal(getRankForElo(rank.min - 1).level, rank.level - 1);
  }
});

test('rank progress and labels are clamped correctly', () => {
  const progress = getRankProgress(1075);
  assert.equal(progress.current.name, 'Challenger');
  assert.equal(progress.upcoming?.name, 'Elite');
  assert.equal(progress.eloToNext, 75);
  assert.equal(progress.progress, 50);
  assert.equal(getRankRangeLabel(RANK_TIERS[0]), '< 850');
  assert.equal(getRankRangeLabel(RANK_TIERS[9]), '2000+');
  assert.equal(getRankProgress(2500).progress, 100);
});
