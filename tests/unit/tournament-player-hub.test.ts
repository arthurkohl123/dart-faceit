import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const overview = readFileSync(new URL('../../app/tournaments/page.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../../app/tournaments/[id]/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261026120000_add_tournament_player_hub_and_incidents.sql', import.meta.url), 'utf8');

test('tournament overview gives signed-in players a next-action hub', () => {
  assert.match(overview, /get_my_tournament_hub/);
  assert.match(overview, /DEINE TURNIERE/);
  assert.match(overview, /Nächste Aktion/);
  assert.match(overview, /MATCHROOM/);
});

test('an active tournament match provides a player-facing incident path', () => {
  assert.match(detail, /TournamentMatchDesk/);
  assert.match(detail, /PROBLEM MELDEN/);
  assert.match(detail, /report_tournament_incident/);
  assert.match(detail, /AN TURNIERLEITUNG SENDEN/);
});

test('tournament incident RPC validates ownership and reuses the existing ticket workflow', () => {
  assert.match(migration, /alter table public\.support_tickets/);
  assert.match(migration, /tournament_match_id uuid references public\.tournament_matches/);
  assert.match(migration, /create unique index if not exists support_tickets_open_tournament_incident_unique/i);
  assert.match(migration, /if v_user_id not in \(v_match\.player1_id, v_match\.player2_id\) then/i);
  assert.match(migration, /insert into public\.ticket_messages/i);
  assert.match(migration, /revoke all on function public\.report_tournament_incident\(uuid, text, text\) from public/i);
  assert.match(migration, /grant execute on function public\.report_tournament_incident\(uuid, text, text\) to authenticated/i);
});
