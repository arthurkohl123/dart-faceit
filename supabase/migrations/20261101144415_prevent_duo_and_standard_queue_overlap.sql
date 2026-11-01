-- A player may never have an active 1vs1 search and a Duo search at the same time.
create or replace function public.duo_assert_player_available(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_profile record;
begin
  select * into v_profile from public.duo_profile(p_user_id);
  if not found or v_profile.is_banned then raise exception 'ACCOUNT_BANNED_OR_PROFILE_MISSING'; end if;
  if nullif(trim(v_profile.dartcounter_username), '') is null then raise exception 'DARTCOUNTER_USERNAME_REQUIRED'; end if;
  if v_profile.queue_banned_until is not null and v_profile.queue_banned_until > now() then raise exception 'QUEUE_BANNED'; end if;
  if exists (
    select 1 from public.matchmaking_queue q
    where q.user_id = p_user_id
      and coalesce(q.last_seen, q.joined_at) >= now() - interval '45 seconds'
  ) then raise exception 'ACTIVE_1V1_QUEUE_EXISTS'; end if;
  if exists (
    select 1 from public.active_matches m
    where p_user_id in (m.player1_id, m.player2_id)
      and m.status in ('matched', 'pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then raise exception 'ACTIVE_1V1_MATCH_EXISTS'; end if;
  if exists (
    select 1 from public.duo_matches m
    where public.duo_is_member(m, p_user_id)
      and m.status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then raise exception 'ACTIVE_DUO_MATCH_EXISTS'; end if;
end;
$$;
