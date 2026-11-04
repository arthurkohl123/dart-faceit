import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../../components/global-player-search.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');
const accountMenu = readFileSync(new URL('../../components/account-menu.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8');

test('the global player search is available from the shared application layout', () => {
  assert.match(layout, /GlobalPlayerSearch/);
  assert.match(component, /public_visible_profiles/);
  assert.match(component, /ilike\('username'/);
  assert.match(component, /MIN_QUERY_LENGTH = 2/);
  assert.match(component, /RESULT_LIMIT = 8/);
});

test('the global player search preserves public-profile privacy and protects query patterns', () => {
  assert.match(component, /Es werden nur öffentliche Spielerprofile angezeigt/);
  assert.match(component, /replace\(\/\[\\\\%_\]\/g/);
  assert.match(component, /escapeIlikePattern/);
});

test('signed-in players open the global search from the account area without covering navigation', () => {
  assert.match(component, /OPEN_PLAYER_SEARCH_EVENT/);
  assert.match(component, /!authLoading && !user/);
  assert.match(accountMenu, /OPEN_PLAYER_SEARCH_EVENT/);
  assert.match(accountMenu, /Spieler suchen/);
});

test('logged-out visitors open the search from the start-page navigation instead of a floating hero button', () => {
  assert.match(component, /pathname !== '\/'/);
  assert.match(home, /OPEN_PLAYER_SEARCH_EVENT/);
  assert.match(home, /Spieler suchen/);
});
