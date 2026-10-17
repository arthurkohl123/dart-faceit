-- The matchroom must display the exact same outcome as finalisation. Keep the
-- calculation in Postgres so a browser-side copy cannot drift from the
-- authoritative ranked rule (including the 32-Elo cap).
create or replace function public.get_match_elo_preview(p_match_id uuid)
returns table(
  player1_win_change integer,
  player2_win_change integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.active_matches%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select *
  into v_match
  from public.active_matches
  where id = p_match_id;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  -- Participants may inspect their own match. Administrators retain the same
  -- access they already have in the matchroom, without opening previews for
  -- arbitrary signed-in users.
  if v_actor_id <> v_match.player1_id
     and v_actor_id <> v_match.player2_id
     and not exists (
       select 1
       from public.profiles
       where "supabaseId" = v_actor_id::text
         and coalesce(is_admin, false)
     ) then
    raise exception 'MATCH_ACCESS_DENIED';
  end if;

  if coalesce(v_match.match_mode, 'ranked') <> 'ranked' then
    return query select 0::integer, 0::integer;
    return;
  end if;

  return query
  select
    greatest(1, least(32, public.calculate_elo_change(v_match.player1_elo, v_match.player2_elo))),
    greatest(1, least(32, public.calculate_elo_change(v_match.player2_elo, v_match.player1_elo)));
end;
$$;

revoke all on function public.get_match_elo_preview(uuid) from public;
grant execute on function public.get_match_elo_preview(uuid) to authenticated;
