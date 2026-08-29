-- Follow-up for installations that already ran the automatic-start migration.
-- Single-elimination fields can now start with any two or more checked-in players.

create or replace function public.start_tournament_bracket_internal(p_tournament_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_t public.tournaments%rowtype; v_count integer; v_match_id uuid; v_bracket_size integer:=2; v_full_matches integer;
begin
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' then raise exception 'Das Turnier wurde bereits gestartet.'; end if;

  update public.tournament_participants
    set status='removed',removed_reason='Check-in verpasst',eliminated_at=now()
    where tournament_id=p_tournament_id and status='registered';

  while exists (
    select 1 from public.tournament_participants where tournament_id=p_tournament_id and status='waitlisted'
  ) and (
    select count(*) from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in'
  ) < v_t.max_players loop
    exit when public.promote_tournament_waitlist(p_tournament_id) is null;
    update public.tournament_participants set status='checked_in',checked_in_at=now()
      where tournament_id=p_tournament_id and status='registered' and checked_in_at is null;
  end loop;

  select count(*) into v_count from public.tournament_participants
    where tournament_id=p_tournament_id and status='checked_in';
  if v_count < 2 then raise exception 'Nicht genügend eingecheckte Teilnehmer.'; end if;

  if v_t.tournament_format='group_stage' then
    update public.tournament_participants set group_number=1
      where tournament_id=p_tournament_id and status='checked_in';
    for v_match_id in
      with players as materialized (
        select user_id,row_number() over(order by seed nulls last,random()) rn
        from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in'
      ), pairs as (
        select p1.user_id p1,p2.user_id p2,row_number() over(order by p1.rn,p2.rn) mn
        from players p1 join players p2 on p1.rn<p2.rn
      )
      insert into public.tournament_matches(tournament_id,round_number,match_number,player1_id,player2_id,status,bracket_stage)
      select p_tournament_id,1,mn,p1,p2,'ready','group' from pairs returning id
    loop perform public.create_tournament_matchroom(v_match_id); end loop;
  else
    while v_bracket_size<v_count loop v_bracket_size:=v_bracket_size*2; end loop;
    if v_bracket_size>32 then raise exception 'Maximal 32 Teilnehmer sind möglich.'; end if;
    v_full_matches:=v_count-(v_bracket_size/2);

    with shuffled as materialized (
      select user_id,row_number() over(order by seed nulls last,random()) rn
      from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in'
    ), slots as (
      select generate_series(1,v_bracket_size/2) as match_number
    ), pairings as (
      select s.match_number,
        case when s.match_number<=v_full_matches then
          (select user_id from shuffled where rn=s.match_number*2-1)
        else (select user_id from shuffled where rn=v_full_matches+s.match_number) end as player1_id,
        case when s.match_number<=v_full_matches then
          (select user_id from shuffled where rn=s.match_number*2) end as player2_id
      from slots s
    )
    insert into public.tournament_matches(tournament_id,round_number,match_number,player1_id,player2_id,winner_id,status,bracket_stage)
    select p_tournament_id,1,match_number,player1_id,player2_id,
      case when player2_id is null then player1_id else null end,
      case when player2_id is null then 'completed' else 'ready' end,
      case when v_t.tournament_format='double_elimination' then 'double' else 'main' end
    from pairings;

    for v_match_id in
      select id from public.tournament_matches where tournament_id=p_tournament_id and round_number=1 and status='ready'
    loop perform public.create_tournament_matchroom(v_match_id); end loop;
  end if;

  update public.tournaments set status='live',updated_at=now() where id=p_tournament_id;
  insert into public.notifications(user_id,type,title,body,href)
    select user_id,'tournament_started','Turnier gestartet',v_t.title || ': Dein Turnier ist live. Öffne jetzt den Turnierbaum.','/tournaments'
    from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in';
end;
$$;

revoke all on function public.start_tournament_bracket_internal(uuid) from public;
