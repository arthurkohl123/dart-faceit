-- A group stage is played as one round-robin league. Pairings are visible from
-- the start, but only the current pairing receives a Matchroom. This prevents
-- players from being presented with several simultaneous rooms.

create or replace function public.get_tournament_standings(p_tournament_id uuid)
returns table(
  rank integer,
  group_number integer,
  user_id uuid,
  username text,
  wins integer,
  losses integer,
  points integer,
  average numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (
      partition by coalesce(tp.group_number, 1)
      order by tp.points desc, tp.wins desc, tp.losses asc,
        tp.average_snapshot desc nulls last, tp.user_id
    )::integer as rank,
    coalesce(tp.group_number, 1) as group_number,
    tp.user_id,
    coalesce(p.username, 'Spieler') as username,
    tp.wins,
    tp.losses,
    tp.points,
    tp.average_snapshot as average
  from public.tournament_participants tp
  join public.tournaments t on t.id = tp.tournament_id
  left join public.profiles p on p."supabaseId" = tp.user_id::text
  where tp.tournament_id = p_tournament_id
    and tp.status = 'checked_in'
    and t.status <> 'draft'
  order by group_number, rank;
$$;

revoke all on function public.get_tournament_standings(uuid) from public;
grant execute on function public.get_tournament_standings(uuid) to authenticated;

create or replace function public.start_tournament_bracket_internal(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.tournaments%rowtype;
  v_count integer;
  v_match_id uuid;
  v_bracket_size integer := 2;
  v_full_matches integer;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' then raise exception 'Das Turnier wurde bereits gestartet.'; end if;

  update public.tournament_participants
    set status = 'removed', removed_reason = 'Check-in verpasst', eliminated_at = now()
    where tournament_id = p_tournament_id and status = 'registered';

  while exists (
    select 1 from public.tournament_participants where tournament_id = p_tournament_id and status = 'waitlisted'
  ) and (
    select count(*) from public.tournament_participants where tournament_id = p_tournament_id and status = 'checked_in'
  ) < v_t.max_players loop
    exit when public.promote_tournament_waitlist(p_tournament_id) is null;
    update public.tournament_participants
      set status = 'checked_in', checked_in_at = now()
      where tournament_id = p_tournament_id and status = 'registered' and checked_in_at is null;
  end loop;

  select count(*) into v_count
    from public.tournament_participants
    where tournament_id = p_tournament_id and status = 'checked_in';
  if v_count < 2 then raise exception 'Nicht genügend eingecheckte Teilnehmer.'; end if;

  if v_t.tournament_format = 'group_stage' then
    update public.tournament_participants
      set group_number = 1, wins = 0, losses = 0, points = 0, eliminated_at = null
      where tournament_id = p_tournament_id and status = 'checked_in';

    with players as materialized (
      select user_id, row_number() over (order by seed nulls last, random()) as rn
      from public.tournament_participants
      where tournament_id = p_tournament_id and status = 'checked_in'
    ), pairs as (
      select p1.user_id as p1, p2.user_id as p2,
        row_number() over (order by p1.rn, p2.rn) as match_number
      from players p1
      join players p2 on p1.rn < p2.rn
    )
    insert into public.tournament_matches(
      tournament_id, round_number, match_number, player1_id, player2_id, status, bracket_stage
    )
    select p_tournament_id, 1, match_number, p1, p2, 'scheduled', 'group'
    from pairs;

    select id into v_match_id
    from public.tournament_matches
    where tournament_id = p_tournament_id and status = 'scheduled'
    order by round_number, match_number
    limit 1;
    perform public.create_tournament_matchroom(v_match_id);
  else
    while v_bracket_size < v_count loop v_bracket_size := v_bracket_size * 2; end loop;
    if v_bracket_size > 32 then raise exception 'Maximal 32 Teilnehmer sind möglich.'; end if;
    v_full_matches := v_count - (v_bracket_size / 2);

    with shuffled as materialized (
      select user_id, row_number() over(order by seed nulls last, random()) as rn
      from public.tournament_participants where tournament_id = p_tournament_id and status = 'checked_in'
    ), slots as (
      select generate_series(1, v_bracket_size / 2) as match_number
    ), pairings as (
      select s.match_number,
        case when s.match_number <= v_full_matches then
          (select user_id from shuffled where rn = s.match_number * 2 - 1)
        else (select user_id from shuffled where rn = v_full_matches + s.match_number) end as player1_id,
        case when s.match_number <= v_full_matches then
          (select user_id from shuffled where rn = s.match_number * 2) end as player2_id
      from slots s
    )
    insert into public.tournament_matches(
      tournament_id, round_number, match_number, player1_id, player2_id, winner_id, status, bracket_stage
    )
    select p_tournament_id, 1, match_number, player1_id, player2_id,
      case when player2_id is null then player1_id else null end,
      case when player2_id is null then 'completed' else 'ready' end,
      case when v_t.tournament_format = 'double_elimination' then 'double' else 'main' end
    from pairings;

    for v_match_id in
      select id from public.tournament_matches
      where tournament_id = p_tournament_id and round_number = 1 and status = 'ready'
    loop
      perform public.create_tournament_matchroom(v_match_id);
    end loop;
  end if;

  update public.tournaments set status = 'live', updated_at = now() where id = p_tournament_id;
  insert into public.notifications(user_id, type, title, body, href)
    select user_id, 'tournament_started', 'Turnier gestartet',
      v_t.title || ': Dein Turnier ist live. Öffne jetzt den Turnierplan.',
      '/tournaments/' || p_tournament_id::text
    from public.tournament_participants
    where tournament_id = p_tournament_id and status = 'checked_in';
end;
$$;

create or replace function public.advance_tournament_bracket(p_tournament_match_id uuid, p_winner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_matches%rowtype;
  v_t public.tournaments%rowtype;
  v_loser uuid;
  v_total integer;
  v_done integer;
  v_active integer;
  v_next_round integer;
  v_match_id uuid;
  i integer;
  v_p1 uuid;
  v_p2 uuid;
begin
  select * into v_m from public.tournament_matches where id = p_tournament_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  if v_m.status = 'completed' then return; end if;
  if p_winner_id not in (v_m.player1_id, v_m.player2_id) then raise exception 'Der Gewinner gehört nicht zu diesem Match.'; end if;
  select * into v_t from public.tournaments where id = v_m.tournament_id for update;

  v_loser := case when p_winner_id = v_m.player1_id then v_m.player2_id else v_m.player1_id end;
  update public.tournament_matches set winner_id = p_winner_id, status = 'completed' where id = p_tournament_match_id;
  update public.tournament_participants
    set wins = wins + 1, points = points + 2
    where tournament_id = v_m.tournament_id and user_id = p_winner_id;
  update public.tournament_participants
    set losses = losses + 1,
      eliminated_at = case when v_t.tournament_format = 'single_elimination' or losses + 1 >= 2 then now() else eliminated_at end
    where tournament_id = v_m.tournament_id and user_id = v_loser;

  if v_t.tournament_format = 'group_stage' then
    select id into v_match_id
    from public.tournament_matches
    where tournament_id = v_m.tournament_id and status = 'scheduled'
    order by round_number, match_number
    limit 1
    for update skip locked;

    if found then
      perform public.create_tournament_matchroom(v_match_id);
      return;
    end if;

    select user_id into v_p1
    from public.tournament_participants
    where tournament_id = v_m.tournament_id and status = 'checked_in'
    order by points desc, wins desc, losses asc, average_snapshot desc nulls last
    limit 1;
    update public.tournaments
      set status = 'completed', winner_id = v_p1, updated_at = now()
      where id = v_m.tournament_id;
    return;
  end if;

  select count(*), count(*) filter(where status = 'completed') into v_total, v_done
    from public.tournament_matches
    where tournament_id = v_m.tournament_id and round_number = v_m.round_number;
  if v_total <> v_done then return; end if;

  if v_t.tournament_format = 'single_elimination' then
    if v_total = 1 then
      update public.tournaments set status = 'completed', winner_id = p_winner_id, updated_at = now()
        where id = v_m.tournament_id;
      return;
    end if;
    for i in 1..(v_total / 2) loop
      select winner_id into v_p1 from public.tournament_matches
        where tournament_id = v_m.tournament_id and round_number = v_m.round_number and match_number = i * 2 - 1;
      select winner_id into v_p2 from public.tournament_matches
        where tournament_id = v_m.tournament_id and round_number = v_m.round_number and match_number = i * 2;
      insert into public.tournament_matches(tournament_id, round_number, match_number, player1_id, player2_id, status, bracket_stage)
        values(v_m.tournament_id, v_m.round_number + 1, i, v_p1, v_p2, 'ready', 'main')
        returning id into v_match_id;
      perform public.create_tournament_matchroom(v_match_id);
    end loop;
    return;
  end if;

  select count(*) into v_active from public.tournament_participants
    where tournament_id = v_m.tournament_id and status = 'checked_in' and losses < 2;
  if v_active = 1 then
    select user_id into v_p1 from public.tournament_participants
      where tournament_id = v_m.tournament_id and status = 'checked_in' and losses < 2 limit 1;
    update public.tournaments set status = 'completed', winner_id = v_p1, updated_at = now()
      where id = v_m.tournament_id;
    return;
  end if;
  v_next_round := v_m.round_number + 1;
  for v_match_id in
    with remaining as materialized (
      select user_id, row_number() over(order by losses, random()) as rn
      from public.tournament_participants
      where tournament_id = v_m.tournament_id and status = 'checked_in' and losses < 2
    )
    insert into public.tournament_matches(tournament_id, round_number, match_number, player1_id, player2_id, status, bracket_stage)
    select v_m.tournament_id, v_next_round, ((p1.rn + 1) / 2)::integer, p1.user_id, p2.user_id, 'ready', 'double'
    from remaining p1 join remaining p2 on p2.rn = p1.rn + 1
    where mod(p1.rn, 2) = 1
    returning id
  loop
    perform public.create_tournament_matchroom(v_match_id);
  end loop;
end;
$$;
