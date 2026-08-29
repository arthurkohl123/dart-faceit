-- A pending acceptance is only valid until its deadline. Previously, an
-- expired row could remain open and block the player forever with
-- ACTIVE_MATCH_EXISTS on the next queue attempt.
update public.active_matches
set status = 'cancelled', updated_at = now()
where status = 'pending_accept'
  and accept_deadline is not null
  and accept_deadline <= now();

create or replace function public.check_and_join_queue(p_max_elo_diff integer, p_app text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result json;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_app not in ('scolia', 'dartcounter') then raise exception 'INVALID_MATCHMAKING_PLATFORM'; end if;
  if p_max_elo_diff not between 25 and 500 then raise exception 'INVALID_ELO_RANGE'; end if;

  -- Recover from a browser close, refresh or lost realtime event after the
  -- 30-second accept window. This runs before the active-match guard so a
  -- stale invitation can never trap a player outside the queue.
  update public.active_matches
  set status = 'cancelled', updated_at = now()
  where status = 'pending_accept'
    and accept_deadline is not null
    and accept_deadline <= now()
    and (player1_id = v_uid or player2_id = v_uid);

  perform public.cleanup_cancelled_active_matches(0);

  if exists (select 1 from public.profiles where "supabaseId" = v_uid::text and is_banned = true) then
    raise exception 'ACCOUNT_BANNED';
  end if;
  if p_app = 'scolia' and not exists (
    select 1 from public.profiles
    where "supabaseId" = v_uid::text and nullif(trim(scolia_username), '') is not null
  ) then raise exception 'SCOLIA_USERNAME_REQUIRED'; end if;
  if p_app = 'dartcounter' and not exists (
    select 1 from public.profiles
    where "supabaseId" = v_uid::text and nullif(trim(dartcounter_username), '') is not null
  ) then raise exception 'DARTCOUNTER_USERNAME_REQUIRED'; end if;

  if exists (
    select 1 from public.active_matches
    where (player1_id = v_uid or player2_id = v_uid)
      and status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then raise exception 'ACTIVE_MATCH_EXISTS'; end if;

  select public.find_or_create_match(p_max_elo_diff, p_app) into v_result;
  return v_result;
end;
$$;

revoke all on function public.check_and_join_queue(integer, text) from public;
grant execute on function public.check_and_join_queue(integer, text) to authenticated;
