import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261103140616_add_autodarts_tournament_platform.sql', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../../app/admin/page.tsx', import.meta.url), 'utf8');
const announce = readFileSync(new URL('../../app/api/admin/tournaments/announce/route.ts', import.meta.url), 'utf8');
const tournamentHub = readFileSync(new URL('../../app/tournaments/page.tsx', import.meta.url), 'utf8');

test('AutoDarts is a validated tournament platform on the server', () => {
  assert.match(migration, /check \(scoring_platform in \('scolia', 'dartcounter', 'autodarts'\)\)/i);
  assert.match(migration, /p_scoring_platform not in \('scolia', 'dartcounter', 'autodarts'\)/i);
  assert.match(migration, /select username, scolia_username, dartcounter_username, autodarts_username into v_profile/i);
  assert.match(migration, /v_t\.scoring_platform = 'autodarts'/i);
  assert.match(migration, /AutoDarts-Namen im Profil/i);
});

test('admins can select AutoDarts and players see it correctly in tournament surfaces', () => {
  assert.match(admin, /value="autodarts">AutoDarts/);
  assert.match(admin, /'scolia' \| 'dartcounter' \| 'autodarts'/);
  assert.match(announce, /value === 'autodarts' \? 'AutoDarts'/);
  assert.match(tournamentHub, /autodarts: 'AutoDarts'/);
});
