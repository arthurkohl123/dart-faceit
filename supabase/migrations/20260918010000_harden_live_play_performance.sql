-- Performance hardening for the most frequently used player-facing flows.
--
-- Scope:
--   * Matchroom recovery and active-match lookups
--   * Match history and notification RLS checks
--   * Removes the duplicate queue matching index reported by the DB advisor

-- The current-match lookup filters by either participant and orders by the
-- creation time. The older combined index cannot efficiently cover both sides
-- of that OR condition.
create index if not exists active_matches_open_player1_created_idx
  on public.active_matches (player1_id, created_at desc)
  where status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed');

create index if not exists active_matches_open_player2_created_idx
  on public.active_matches (player2_id, created_at desc)
  where status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed');

-- Both indexes have exactly the same definition. Keep the older active-match
-- index name so no deployment depends on a removed recently-created index.
drop index if exists public.matchmaking_queue_match_idx;

-- Consolidating identical RLS policies preserves access while avoiding a
-- second policy evaluation on every match-history and active-match read.
drop policy if exists "Admins can view all active matches" on public.active_matches;
drop policy if exists "Users can view their own active matches" on public.active_matches;
create policy "Active matches readable by participants or admins"
  on public.active_matches for select to authenticated
  using (
    (select auth.uid()) = player1_id
    or (select auth.uid()) = player2_id
    or exists (
      select 1
      from public.profiles
      where "supabaseId" = (select auth.uid())::text
        and is_admin = true
    )
  );

drop policy if exists "Users can view own match history" on public.matches;
drop policy if exists "Users can view their own matches" on public.matches;
create policy "Users can view own match history"
  on public.matches for select to authenticated
  using ((select auth.uid()) = user_id);

-- These writes are performed via trusted server/database paths. Removing the
-- obsolete browser insert policy also makes this explicit in the policy list.
drop policy if exists "Users can insert their own matches" on public.matches;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Accepting a match was already locked. Declining now uses the same ownership
-- model, so a retry or simultaneous button press cannot overwrite a just
-- accepted invitation through a separate application-level update.
create or replace function public.decline_match_invitation(p_match_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.active_matches%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_match
  from public.active_matches
  where id = p_match_id
  for update;

  if not found then
    return json_build_object('status', 'not_found');
  end if;
  if v_uid not in (v_match.player1_id, v_match.player2_id) then
    raise exception 'NOT_MATCH_PARTICIPANT';
  end if;
  if v_match.status <> 'pending_accept' then
    return json_build_object('status', 'already_handled', 'match_status', v_match.status);
  end if;

  update public.active_matches
  set status = 'cancelled',
      cancellation_reason = 'declined',
      updated_at = now()
  where id = p_match_id;

  insert into public.match_audit_log(match_id, actor_id, action, old_status, new_status, context)
  values (p_match_id, v_uid, 'invitation_declined', 'pending_accept', 'cancelled', '{}'::jsonb);

  return json_build_object('status', 'declined', 'match_id', p_match_id);
end;
$$;

revoke all on function public.decline_match_invitation(uuid) from public;
grant execute on function public.decline_match_invitation(uuid) to authenticated;
