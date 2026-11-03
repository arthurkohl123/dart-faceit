import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matchroom = readFileSync(new URL('../../app/result/page.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

test('the result room exposes the distinct control-deck design surfaces', () => {
  assert.match(matchroom, /matchroom-command/);
  assert.match(matchroom, /matchroom-roombar/);
  assert.match(matchroom, /matchroom-scoreboard/);
  assert.match(matchroom, /matchroom-fighter--local/);
  assert.match(matchroom, /matchroom-fighter--away/);
  assert.match(matchroom, /matchroom-result-deck/);
  assert.match(matchroom, /matchroom-comms/);

  assert.match(styles, /MATCHROOM · CONTROL DECK/);
  assert.match(styles, /\.matchroom-scoreboard/);
  assert.match(styles, /\.matchroom-roombar/);
  assert.match(styles, /\.matchroom-result-deck/);
  assert.match(styles, /\.matchroom-comms/);
  assert.match(styles, /@media \(max-width: 640px\)/);
});

test('the visual refresh preserves result, report and staff control surfaces', () => {
  assert.match(matchroom, /Ergebnis eintragen/);
  assert.match(matchroom, /PlayerReportButton/);
  assert.match(matchroom, /Moderator-Ansicht/);
  assert.match(matchroom, /Match ohne Wertung abbrechen/);
  assert.match(matchroom, /sendChatMessage/);
});
