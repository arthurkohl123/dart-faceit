-- A cup can be started early with any valid knockout field size.
create or replace function public.admin_generate_tournament_bracket(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_count integer;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_tournament.status <> 'registration' then raise exception 'Der Turnierbaum wurde bereits erstellt.'; end if;

  select count(*) into v_count from public.tournament_participants where tournament_id = p_tournament_id;
  if v_count not in (2, 4, 8, 16, 32) then
    raise exception 'Zum Start werden 2, 4, 8, 16 oder 32 Teilnehmer benötigt.';
  end if;
  if v_count > v_tournament.max_players then raise exception 'Die Teilnehmerzahl überschreitet die Turniergröße.'; end if;

  with shuffled as materialized (
    select user_id, row_number() over (order by random()) as seed
    from public.tournament_participants
    where tournament_id = p_tournament_id
  )
  insert into public.tournament_matches(tournament_id, round_number, match_number, player1_id, player2_id, status)
  select p_tournament_id, 1, ((p1.seed + 1) / 2)::integer, p1.user_id, p2.user_id, 'ready'
  from shuffled p1
  join shuffled p2 on p2.seed = p1.seed + 1
  where mod(p1.seed, 2) = 1;

  update public.tournaments set status = 'live', updated_at = now() where id = p_tournament_id;
end;
$$;

grant execute on function public.admin_generate_tournament_bracket(uuid) to authenticated;
