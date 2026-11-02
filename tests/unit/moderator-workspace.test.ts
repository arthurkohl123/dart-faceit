import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const moderatorPage = readFileSync(new URL('../../app/moderator/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261025211443_harden_moderator_workspace.sql', import.meta.url), 'utf8');
const handoffMigration = readFileSync(new URL('../../supabase/migrations/20261102110036_add_moderator_handoffs_and_escalation.sql', import.meta.url), 'utf8');
const flagClearanceMigration = readFileSync(new URL('../../supabase/migrations/20261102110955_add_moderator_flag_clearance.sql', import.meta.url), 'utf8');

test('moderator desk supports bounded case ownership and handoffs', () => {
  for (const label of ['Mir zuweisen', 'Interne Übergabe-Notiz', 'Ticket oder Spieler suchen', 'Sync']) {
    assert.match(moderatorPage, new RegExp(label));
  }
  assert.match(moderatorPage, /mod_claim_ticket/);
  assert.match(moderatorPage, /mod_update_ticket/);
  assert.doesNotMatch(moderatorPage, /admin_set_moderator|admin_set_premium|admin_set_streamer/);
});

test('moderator RPCs stay authenticated and make player warnings visible', () => {
  assert.match(migration, /create or replace function public\.mod_claim_ticket/i);
  assert.match(migration, /if not public\.is_mod_or_admin\(\) then/i);
  assert.match(migration, /insert into public\.notifications/i);
  assert.match(migration, /revoke all on function public\.mod_claim_ticket\(uuid\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.mod_claim_ticket\(uuid\) to authenticated/i);
  assert.match(migration, /create or replace function public\.mod_cancel_dispute/i);
});

test('moderators can release their own cases and document an admin escalation', () => {
  for (const label of ['Team-Inbox', 'Meine Fälle', 'Für Team freigeben', 'An Admin geben']) {
    assert.match(moderatorPage, new RegExp(label));
  }
  assert.match(moderatorPage, /mod_release_ticket/);
  assert.match(moderatorPage, /mod_escalate_ticket/);
  assert.match(handoffMigration, /create or replace function public\.mod_release_ticket/i);
  assert.match(handoffMigration, /create or replace function public\.mod_escalate_ticket/i);
  assert.match(handoffMigration, /Nur die zuständige Person oder ein Admin kann dieses Ticket abgeben/i);
  assert.match(handoffMigration, /insert into public\.notifications/i);
  assert.match(handoffMigration, /revoke all on function public\.mod_release_ticket\(uuid, text\) from public, anon/i);
  assert.match(handoffMigration, /grant execute on function public\.mod_escalate_ticket\(uuid, text\) to authenticated/i);
});

test('moderators can close an unremarkable account hint without gaining ban powers', () => {
  assert.match(moderatorPage, /Alles in Ordnung/);
  assert.match(moderatorPage, /mod_clear_flagged_player/);
  assert.match(flagClearanceMigration, /create or replace function public\.mod_clear_flagged_player/i);
  assert.match(flagClearanceMigration, /if v_actor_id is null or not public\.is_mod_or_admin\(\) then/i);
  assert.match(flagClearanceMigration, /insert into public\.flagged_account_reviews/i);
  assert.match(flagClearanceMigration, /action = 'dismissed'/i);
  assert.match(flagClearanceMigration, /insert into public\.moderator_logs/i);
  assert.match(flagClearanceMigration, /revoke all on function public\.mod_clear_flagged_player\(uuid, text\) from public, anon/i);
  assert.match(flagClearanceMigration, /grant execute on function public\.mod_clear_flagged_player\(uuid, text\) to authenticated/i);
  assert.doesNotMatch(moderatorPage, /admin_set_player_ban/);
});
