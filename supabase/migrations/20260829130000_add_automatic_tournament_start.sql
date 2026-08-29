-- Start due tournaments automatically. pg_cron executes this once per minute.
-- The internal function is deliberately not granted to browser roles; only the
-- admin wrapper and the database scheduler can invoke it.

-- A check-in ends when the announced tournament start is reached. This keeps
-- the displayed deadline and the automatic start rule consistent for new and
-- still-open registrations.
update public.tournaments
set check_in_closes_at = starts_at
where status = 'registration'
  and (check_in_closes_at is null or check_in_closes_at > starts_at);

create or replace function public.start_tournament_bracket_internal(p_tournament_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_t public.tournaments%rowtype; v_count integer; v_match_id uuid;
begin
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' then raise exception 'Das Turnier wurde bereits gestartet.'; end if;

  -- Unchecked starters lose their slot; waitlisted players fill free slots.
  update public.tournament_participants
    set status='removed',removed_reason='Check-in verpasst',eliminated_at=now()
    where tournament_id=p_tournament_id and status='registered';

  while exists (
    select 1 from public.tournament_participants
    where tournament_id=p_tournament_id and status='waitlisted'
  ) and (
    select count(*) from public.tournament_participants
    where tournament_id=p_tournament_id and status='checked_in'
  ) < v_t.max_players loop
    exit when public.promote_tournament_waitlist(p_tournament_id) is null;
    update public.tournament_participants
      set status='checked_in',checked_in_at=now()
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
    loop
      perform public.create_tournament_matchroom(v_match_id);
    end loop;
  else
    if v_count not in (2,4,8,16,32) then
      raise exception 'Für K.-o.-Formate werden 2, 4, 8, 16 oder 32 eingecheckte Teilnehmer benötigt.';
    end if;
    for v_match_id in
      with shuffled as materialized (
        select user_id,row_number() over(order by seed nulls last,random()) rn
        from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in'
      )
      insert into public.tournament_matches(tournament_id,round_number,match_number,player1_id,player2_id,status,bracket_stage)
      select p_tournament_id,1,((p1.rn+1)/2)::integer,p1.user_id,p2.user_id,'ready',
        case when v_t.tournament_format='double_elimination' then 'double' else 'main' end
      from shuffled p1 join shuffled p2 on p2.rn=p1.rn+1 where mod(p1.rn,2)=1 returning id
    loop
      perform public.create_tournament_matchroom(v_match_id);
    end loop;
  end if;

  update public.tournaments set status='live',updated_at=now() where id=p_tournament_id;
  insert into public.notifications(user_id,type,title,body,href)
    select user_id,'tournament_started','Turnier gestartet',v_t.title || ': Dein Turnier ist live. Öffne jetzt den Turnierbaum.','/tournaments'
    from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in';
end;
$$;

create or replace function public.admin_generate_tournament_bracket(p_tournament_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  perform public.start_tournament_bracket_internal(p_tournament_id);
end;
$$;

create or replace function public.auto_start_due_tournaments()
returns integer language plpgsql security definer set search_path=public as $$
declare v_tournament record; v_started integer:=0;
begin
  for v_tournament in
    select id from public.tournaments
    where status='registration' and starts_at<=now()
    order by starts_at asc
    for update skip locked
  loop
    begin
      perform public.start_tournament_bracket_internal(v_tournament.id);
      v_started:=v_started+1;
    exception when others then
      -- A cup with too few checked-in players remains visible for the admin to
      -- cancel or adjust; one invalid cup must not stop other due tournaments.
      raise notice 'Automatic start skipped tournament %: %',v_tournament.id,sqlerrm;
    end;
  end loop;
  return v_started;
end;
$$;

revoke all on function public.start_tournament_bracket_internal(uuid) from public;
revoke all on function public.auto_start_due_tournaments() from public;
grant execute on function public.admin_generate_tournament_bracket(uuid) to authenticated;

create extension if not exists pg_cron with schema extensions;
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='auto-start-due-tournaments';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('auto-start-due-tournaments','* * * * *','select public.auto_start_due_tournaments()');
end;
$$;
