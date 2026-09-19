import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const read = (path: string) => readFileSync(join(projectRoot, path), 'utf8');

test('community activity exposes only anonymous aggregate counts', () => {
  const route = read('app/api/community-stats/route.ts');

  assert.match(route, /onlinePlayers: number/);
  assert.match(route, /queuePlayers: number/);
  assert.match(route, /livePlayers: number/);
  assert.match(route, /new Set\(/);
  assert.doesNotMatch(route, /\.select\([^)]*(?:username|email)/);
});

test('home makes the current arena activity actionable', () => {
  const home = read('app/page.tsx');

  assert.match(home, /Live in der Arena/);
  assert.match(home, /Spieler suchen.*gerade/);
  assert.match(home, /onlinePlayers/);
  assert.match(home, /livePlayers/);
  assert.match(home, /setInterval\(\(\) => void loadCommunityStats\(\), 30_000\)/);
});
