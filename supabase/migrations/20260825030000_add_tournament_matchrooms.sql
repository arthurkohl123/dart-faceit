-- Each tournament pairing receives a normal RankedDarts matchroom. Completed
-- matchroom results advance the bracket automatically.
alter table public.tournament_matches
  add column if not exists active_match_id uuid unique references public.active_matches(id) on delete set null;

drop function if exists public.get_tournament_bracket(uuid);

create or replace function public.get_tournament_bracket(p_tournament_id uuid)
returns table (
  id uuid, round_number integer, match_number integer, player1_id uuid, player2_id uuid,
  player1_username text, player2_username text, winner_id uuid, winner_username text, status text,
  active_match_id uuid
)
language sql
security definer
set search_path = public
as $$
  select m.id, m.round_number, m.match_number, m.player1_id, m.player2_id,
    p1.username, p2.username, m.winner_id, pw.username, m.status, m.active_match_id
  from public.tournament_matches m
  left join public.profiles p1 on p1."supabaseId" = m.player1_id::text
  left join public.profiles p2 on p2."supabaseId" = m.player2_id::text
  left join public.profiles pw on pw."supabaseId" = m.winner_id::text
  where m.tournament_id = p_tournament_id
  order by m.round_number, m.match_number;
$$;

create or replace function public.create_tournament_matchroom(p_tournament_match_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_player1_name text;
  v_player2_name text;
  v_player1_elo integer;
  v_player2_elo integer;
  v_active_match_id uuid;
begin
  select * into v_match from public.tournament_matches where id = p_tournament_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  if v_match.active_match_id is not null then return v_match.active_match_id; end if;
  if v_match.player1_id is null or v_match.player2_id is null then raise exception 'Die Paarung ist noch nicht vollständig.'; end if;

  select username, coalesce(elo, 1000) into v_player1_name, v_player1_elo
  from public.profiles where "supabaseId" = v_match.player1_id::text;
  select username, coalesce(elo, 1000) into v_player2_name, v_player2_elo
  from public.profiles where "supabaseId" = v_match.player2_id::text;

  insert into public.active_matches(player1_id, player2_id, player1_username, player2_username, player1_elo, player2_elo, status)
  values (v_match.player1_id, v_match.player2_id, coalesce(v_player1_name, 'Spieler 1'), coalesce(v_player2_name, 'Spieler 2'), coalesce(v_player1_elo, 1000), coalesce(v_player2_elo, 1000), 'pending_result')
  returning id into v_active_match_id;

  update public.tournament_matches set active_match_id = v_active_match_id, status = 'ready' where id = p_tournament_match_id;
  return v_active_match_id;
end;
$$;

create or replace function public.advance_tournament_bracket(p_tournament_match_id uuid, p_winner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_total integer;
  v_completed integer;
  v_player1 uuid;
  v_player2 uuid;
  v_next_match_id uuid;
  i integer;
begin
  select * into v_match from public.tournament_matches where id = p_tournament_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  if v_match.status = 'completed' then return; end if;
  if p_winner_id not in (v_match.player1_id, v_match.player2_id) then raise exception 'Der Gewinner gehört nicht zu diesem Match.'; end if;

  update public.tournament_matches set winner_id = p_winner_id, status = 'completed' where id = p_tournament_match_id;
  select count(*), count(winner_id) into v_total, v_completed from public.tournament_matches
  where tournament_id = v_match.tournament_id and round_number = v_match.round_number;
  if v_total <> v_completed then return; end if;

  if v_total = 1 then
    update public.tournaments set status = 'completed', winner_id = p_winner_id, updated_at = now() where id = v_match.tournament_id;
    return;
  end if;

  for i in 1..(v_total / 2) loop
    select winner_id into v_player1 from public.tournament_matches where tournament_id = v_match.tournament_id and round_number = v_match.round_number and match_number = i * 2 - 1;
    select winner_id into v_player2 from public.tournament_matches where tournament_id = v_match.tournament_id and round_number = v_match.round_number and match_number = i * 2;
    insert into public.tournament_matches(tournament_id, round_number, match_number, player1_id, player2_id, status)
    values (v_match.tournament_id, v_match.round_number + 1, i, v_player1, v_player2, 'ready')
    returning id into v_next_match_id;
    perform public.create_tournament_matchroom(v_next_match_id);
  end loop;
end;
$$;

create or replace function public.admin_generate_tournament_bracket(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_count integer;
  v_tournament_match_id uuid;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_tournament.status <> 'registration' then raise exception 'Der Turnierbaum wurde bereits erstellt.'; end if;
  select count(*) into v_count from public.tournament_participants where tournament_id = p_tournament_id;
  if v_count not in (2, 4, 8, 16, 32) then raise exception 'Zum Start werden 2, 4, 8, 16 oder 32 Teilnehmer benötigt.'; end if;

  for v_tournament_match_id in
    with shuffled as materialized (
      select user_id, row_number() over (order by random()) as seed
      from public.tournament_participants where tournament_id = p_tournament_id
    )
    insert into public.tournament_matches(tournament_id, round_number, match_number, player1_id, player2_id, status)
    select p_tournament_id, 1, ((p1.seed + 1) / 2)::integer, p1.user_id, p2.user_id, 'ready'
    from shuffled p1 join shuffled p2 on p2.seed = p1.seed + 1 where mod(p1.seed, 2) = 1
    returning id
  loop
    perform public.create_tournament_matchroom(v_tournament_match_id);
  end loop;
  update public.tournaments set status = 'live', updated_at = now() where id = p_tournament_id;
end;
$$;

create or replace function public.admin_report_tournament_winner(p_match_id uuid, p_winner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  perform public.advance_tournament_bracket(p_match_id, p_winner_id);
end;
$$;

create or replace function public.sync_tournament_matchroom_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_tournament_match_id uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.submitted_winner_id is not null then
    select id into v_tournament_match_id from public.tournament_matches where active_match_id = new.id;
    if v_tournament_match_id is not null then
      perform public.advance_tournament_bracket(v_tournament_match_id, new.submitted_winner_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_tournament_matchroom_completed on public.active_matches;
create trigger on_tournament_matchroom_completed
after update of status on public.active_matches
for each row execute function public.sync_tournament_matchroom_result();

-- Repair already-live tournaments that were created before matchroom support.
do $$
declare v_tournament_match_id uuid;
begin
  for v_tournament_match_id in
    select tm.id from public.tournament_matches tm
    join public.tournaments t on t.id = tm.tournament_id
    where t.status = 'live' and tm.status = 'ready' and tm.active_match_id is null
      and tm.player1_id is not null and tm.player2_id is not null
  loop
    perform public.create_tournament_matchroom(v_tournament_match_id);
  end loop;
end;
$$;

grant execute on function public.get_tournament_bracket(uuid) to authenticated;
grant execute on function public.create_tournament_matchroom(uuid) to authenticated;
