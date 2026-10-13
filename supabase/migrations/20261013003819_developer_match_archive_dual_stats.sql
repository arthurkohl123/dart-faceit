-- Developer match corrections now edit both sides of a completed match.
-- The history table contains one row per player, linked by active_match_id.
drop function if exists public.dev_list_matches(integer, integer, text);

create function public.dev_list_matches(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null
)
returns table(
  id uuid,
  created_at timestamptz,
  user_id uuid,
  user_name text,
  opponent_name text,
  is_win boolean,
  result text,
  legs_won integer,
  legs_lost integer,
  my_average numeric,
  highest_checkout integer,
  one_eighties integer,
  opponent_average numeric,
  opponent_highest_checkout integer,
  opponent_one_eighties integer,
  elo_change integer,
  app text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where "supabaseId" = auth.uid()::text
      and is_developer = true
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.id,
    m.created_at,
    m.user_id,
    coalesce(p.scolia_username, p.dartcounter_username, '—') as user_name,
    m.opponent_name,
    m.is_win,
    m.result,
    m.legs_won,
    m.legs_lost,
    m.my_average,
    m.highest_checkout,
    m.one_eighties,
    opponent_match.my_average as opponent_average,
    opponent_match.highest_checkout as opponent_highest_checkout,
    opponent_match.one_eighties as opponent_one_eighties,
    m.elo_change,
    m.app
  from public.matches m
  left join public.matches opponent_match
    on opponent_match.active_match_id = m.active_match_id
   and opponent_match.user_id = m.opponent_id
   and opponent_match.opponent_id = m.user_id
   and opponent_match.id <> m.id
  left join public.profiles p on p."supabaseId" = m.user_id::text
  where
    p_search is null
    or m.opponent_name ilike '%' || p_search || '%'
    or p.scolia_username ilike '%' || p_search || '%'
    or p.dartcounter_username ilike '%' || p_search || '%'
  order by m.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
end;
$$;

revoke all on function public.dev_list_matches(integer, integer, text) from public;
grant execute on function public.dev_list_matches(integer, integer, text) to authenticated;

drop function if exists public.dev_update_match(uuid, integer, integer, numeric, integer, integer, boolean);

create function public.dev_update_match(
  p_match_id uuid,
  p_legs_won integer,
  p_legs_lost integer,
  p_my_average numeric,
  p_highest_checkout integer,
  p_one_eighties integer,
  p_is_win boolean,
  p_opponent_average numeric default null,
  p_opponent_highest_checkout integer default null,
  p_opponent_one_eighties integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_opponent public.matches%rowtype;
  v_active public.active_matches%rowtype;
begin
  if not exists (
    select 1
    from public.profiles
    where "supabaseId" = auth.uid()::text
      and is_developer = true
  ) then
    raise exception 'forbidden';
  end if;

  if p_legs_won is not null and p_legs_won < 0 then raise exception 'legs_won must be non-negative'; end if;
  if p_legs_lost is not null and p_legs_lost < 0 then raise exception 'legs_lost must be non-negative'; end if;
  if p_my_average is not null and (p_my_average < 0 or p_my_average > 180) then raise exception 'my_average must be between 0 and 180'; end if;
  if p_opponent_average is not null and (p_opponent_average < 0 or p_opponent_average > 180) then raise exception 'opponent_average must be between 0 and 180'; end if;
  if p_highest_checkout is not null and (p_highest_checkout < 0 or p_highest_checkout > 170) then raise exception 'highest_checkout must be between 0 and 170'; end if;
  if p_opponent_highest_checkout is not null and (p_opponent_highest_checkout < 0 or p_opponent_highest_checkout > 170) then raise exception 'opponent_highest_checkout must be between 0 and 170'; end if;
  if p_one_eighties is not null and p_one_eighties < 0 then raise exception 'one_eighties must be non-negative'; end if;
  if p_opponent_one_eighties is not null and p_opponent_one_eighties < 0 then raise exception 'opponent_one_eighties must be non-negative'; end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then raise exception 'MATCH_NOT_FOUND'; end if;

  update public.matches
  set legs_won = p_legs_won,
      legs_lost = p_legs_lost,
      my_average = p_my_average,
      highest_checkout = p_highest_checkout,
      one_eighties = p_one_eighties,
      is_win = p_is_win,
      result = case
        when p_legs_won is null or p_legs_lost is null then case when p_is_win then 'Sieg' else 'Niederlage' end
        else p_legs_won::text || ':' || p_legs_lost::text
      end
  where id = p_match_id;

  if v_match.active_match_id is not null and v_match.opponent_id is not null then
    select * into v_opponent
    from public.matches
    where active_match_id = v_match.active_match_id
      and user_id = v_match.opponent_id
      and opponent_id = v_match.user_id
      and id <> v_match.id
    order by created_at asc
    limit 1
    for update;

    if found then
      update public.matches
      set legs_won = p_legs_lost,
          legs_lost = p_legs_won,
          my_average = p_opponent_average,
          highest_checkout = p_opponent_highest_checkout,
          one_eighties = p_opponent_one_eighties,
          is_win = not p_is_win,
          result = case
            when p_legs_won is null or p_legs_lost is null then case when not p_is_win then 'Sieg' else 'Niederlage' end
            else p_legs_lost::text || ':' || p_legs_won::text
          end
      where id = v_opponent.id;
    end if;

    select * into v_active
    from public.active_matches
    where id = v_match.active_match_id
    for update;

    if found then
      if v_active.player1_id = v_match.user_id then
        update public.active_matches
        set submitted_player1_legs = p_legs_won,
            submitted_player2_legs = p_legs_lost,
            submitted_player1_average = p_my_average,
            submitted_player2_average = p_opponent_average,
            submitted_player1_checkout = p_highest_checkout,
            submitted_player2_checkout = p_opponent_highest_checkout,
            submitted_player1_180s = p_one_eighties,
            submitted_player2_180s = p_opponent_one_eighties,
            submitted_winner_id = case when p_is_win then v_active.player1_id else v_active.player2_id end,
            updated_at = now()
        where id = v_active.id;
      else
        update public.active_matches
        set submitted_player1_legs = p_legs_lost,
            submitted_player2_legs = p_legs_won,
            submitted_player1_average = p_opponent_average,
            submitted_player2_average = p_my_average,
            submitted_player1_checkout = p_opponent_highest_checkout,
            submitted_player2_checkout = p_highest_checkout,
            submitted_player1_180s = p_opponent_one_eighties,
            submitted_player2_180s = p_one_eighties,
            submitted_winner_id = case when p_is_win then v_active.player2_id else v_active.player1_id end,
            updated_at = now()
        where id = v_active.id;
      end if;
    end if;
  end if;
end;
$$;

revoke all on function public.dev_update_match(uuid, integer, integer, numeric, integer, integer, boolean, numeric, integer, integer) from public;
grant execute on function public.dev_update_match(uuid, integer, integer, numeric, integer, integer, boolean, numeric, integer, integer) to authenticated;
