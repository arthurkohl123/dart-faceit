import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../../components/global-player-search.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');

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
