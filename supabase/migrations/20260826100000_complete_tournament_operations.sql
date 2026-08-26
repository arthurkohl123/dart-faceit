-- Complete tournament operations: check-in, waitlist, moderation, formats,
-- prizes, cancellation notifications and public player history.

alter table public.tournaments
  add column if not exists tournament_format text not null default 'single_elimination',
  add column if not exists check_in_opens_at timestamptz,
  add column if not exists check_in_closes_at timestamptz,
  add column if not exists prize_title text,
  add column if not exists prize_details text,
  add column if not exists dispute_policy text not null default 'Bei Verbindungsproblemen sofort Screenshots sichern, den Gegner informieren und innerhalb von 15 Minuten ein Support-Ticket öffnen. Bis zur Admin-Entscheidung darf das Match nicht neu gestartet werden.',
  add column if not exists cancellation_reason text;

update public.tournaments
set check_in_opens_at = coalesce(check_in_opens_at, starts_at - interval '30 minutes'),
    check_in_closes_at = coalesce(check_in_closes_at, starts_at + interval '5 minutes')
where check_in_opens_at is null or check_in_closes_at is null;

alter table public.tournaments alter column check_in_opens_at set default now();
alter table public.tournaments
  drop constraint if exists tournaments_tournament_format_check;
alter table public.tournaments
  add constraint tournaments_tournament_format_check
  check (tournament_format in ('single_elimination', 'double_elimination', 'group_stage'));

alter table public.tournament_participants
  add column if not exists status text not null default 'registered',
  add column if not exists checked_in_at timestamptz,
  add column if not exists waitlist_position integer,
  add column if not exists wins integer not null default 0,
  add column if not exists losses integer not null default 0,
  add column if not exists points integer not null default 0,
  add column if not exists group_number integer,
  add column if not exists removed_reason text,
  add column if not exists eliminated_at timestamptz;

alter table public.tournament_participants
  drop constraint if exists tournament_participants_status_check;
alter table public.tournament_participants
  add constraint tournament_participants_status_check
  check (status in ('registered', 'waitlisted', 'checked_in', 'withdrawn', 'removed', 'disqualified'));

alter table public.tournament_matches
  add column if not exists bracket_stage text not null default 'main';

create index if not exists tournament_participants_waitlist_idx
  on public.tournament_participants(tournament_id, waitlist_position, joined_at)
  where status = 'waitlisted';

create or replace function public.promote_tournament_waitlist(p_tournament_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_limit integer; v_active integer; v_user uuid; v_title text;
begin
  select max_players, title into v_limit, v_title from public.tournaments where id = p_tournament_id for update;
  select count(*) into v_active from public.tournament_participants
    where tournament_id = p_tournament_id and status in ('registered', 'checked_in');
  if v_active >= v_limit then return null; end if;
  select user_id into v_user from public.tournament_participants
    where tournament_id = p_tournament_id and status = 'waitlisted'
    order by waitlist_position nulls last, joined_at for update skip locked limit 1;
  if v_user is null then return null; end if;
  update public.tournament_participants
    set status = 'registered', waitlist_position = null
    where tournament_id = p_tournament_id and user_id = v_user;
  insert into public.notifications(user_id, type, title, body, href)
  values (v_user, 'tournament_promoted', 'Du bist nachgerückt',
    'Ein Platz bei ' || coalesce(v_title, 'deinem Turnier') || ' ist frei geworden. Checke rechtzeitig ein.', '/tournaments');
  return v_user;
end;
$$;

create or replace function public.notify_tournament_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select title into v_title from public.tournaments where id = new.tournament_id;
  insert into public.notifications(user_id, type, title, body, href)
  values (
    new.user_id,
    case when new.status = 'waitlisted' then 'tournament_waitlist' else 'tournament_registration' end,
    case when new.status = 'waitlisted' then 'Du stehst auf der Warteliste' else 'Turnier-Anmeldung bestätigt' end,
    case when new.status = 'waitlisted'
      then coalesce(v_title, 'Das Turnier') || ': Du rückst automatisch nach, sobald ein Platz frei wird.'
      else coalesce(v_title, 'Dein Turnier') || ' ist gespeichert. Der Check-in öffnet vor dem Start.' end,
    '/tournaments'
  );
  return new;
end;
$$;

drop function if exists public.list_tournaments();
create function public.list_tournaments()
returns table (
  id uuid, title text, description text, starts_at timestamptz, registration_closes_at timestamptz,
  max_players integer, best_of integer, premium_only boolean, max_average numeric, min_average numeric,
  status text, winner_id uuid, participant_count bigint, joined boolean, winner_username text,
  scoring_platform text, requires_access_code boolean, tournament_format text,
  check_in_opens_at timestamptz, check_in_closes_at timestamptz, prize_title text, prize_details text,
  dispute_policy text, cancellation_reason text, waitlist_count bigint, participant_status text,
  checked_in boolean, checked_in_count bigint
)
language sql security definer set search_path = public
as $$
  select t.id, t.title, t.description, t.starts_at, t.registration_closes_at, t.max_players, t.best_of,
    t.premium_only, t.max_average, t.min_average, t.status, t.winner_id,
    count(tp.id) filter (where tp.status in ('registered','checked_in')),
    coalesce(bool_or(tp.user_id = auth.uid() and tp.status not in ('withdrawn','removed','disqualified')), false),
    winner.username, t.scoring_platform, t.access_code_hash is not null, t.tournament_format,
    t.check_in_opens_at, t.check_in_closes_at, t.prize_title, t.prize_details,
    t.dispute_policy, t.cancellation_reason,
    count(tp.id) filter (where tp.status = 'waitlisted'),
    max(tp.status) filter (where tp.user_id = auth.uid()),
    coalesce(bool_or(tp.user_id = auth.uid() and tp.status = 'checked_in'), false),
    count(tp.id) filter (where tp.status = 'checked_in')
  from public.tournaments t
  left join public.tournament_participants tp on tp.tournament_id = t.id
  left join public.profiles winner on winner."supabaseId" = t.winner_id::text
  where t.status <> 'draft'
  group by t.id, winner.username
  order by case t.status when 'registration' then 0 when 'live' then 1 when 'completed' then 2 else 3 end, t.starts_at asc;
$$;

drop function if exists public.join_tournament(uuid, text);
create function public.join_tournament(p_tournament_id uuid, p_access_code text default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_t public.tournaments%rowtype; v_profile record; v_average numeric; v_count integer; v_status text; v_position integer;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' or now() > v_t.registration_closes_at then raise exception 'Die Anmeldung ist geschlossen.'; end if;
  if v_t.access_code_hash is not null and md5(upper(trim(coalesce(p_access_code, '')))) <> v_t.access_code_hash then raise exception 'Der Turniercode ist ungültig.'; end if;
  if exists (select 1 from public.tournament_participants where tournament_id = p_tournament_id and user_id = auth.uid() and status not in ('withdrawn','removed','disqualified')) then raise exception 'Du bist bereits angemeldet.'; end if;
  select username, coalesce("isPremium", false) is_premium, scolia_username, dartcounter_username into v_profile
    from public.profiles where "supabaseId" = auth.uid()::text;
  if v_profile.username is null then raise exception 'Dein Profil konnte nicht geladen werden.'; end if;
  if v_t.premium_only and not v_profile.is_premium then raise exception 'Dieses Turnier ist nur für Premium-Mitglieder.'; end if;
  if v_t.scoring_platform = 'scolia' and nullif(trim(coalesce(v_profile.scolia_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen Scolia-Namen im Profil.'; end if;
  if v_t.scoring_platform = 'dartcounter' and nullif(trim(coalesce(v_profile.dartcounter_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen DartCounter-Namen im Profil.'; end if;
  v_average := public.tournament_player_average(auth.uid());
  if v_t.max_average is not null and coalesce(v_average, 0) > v_t.max_average then raise exception 'Dein Average liegt über dem erlaubten Limit.'; end if;
  if v_t.min_average is not null and coalesce(v_average, 0) < v_t.min_average then raise exception 'Dein Average liegt unter dem erforderlichen Limit.'; end if;
  select count(*) into v_count from public.tournament_participants where tournament_id = p_tournament_id and status in ('registered','checked_in');
  v_status := case when v_count >= v_t.max_players then 'waitlisted' else 'registered' end;
  if v_status = 'waitlisted' then
    select coalesce(max(waitlist_position),0)+1 into v_position from public.tournament_participants where tournament_id = p_tournament_id and status='waitlisted';
  end if;
  delete from public.tournament_participants where tournament_id=p_tournament_id and user_id=auth.uid() and status in ('withdrawn','removed','disqualified');
  insert into public.tournament_participants(tournament_id,user_id,username,average_snapshot,status,waitlist_position)
  values (p_tournament_id,auth.uid(),v_profile.username,v_average,v_status,v_position);
  return v_status;
end;
$$;

create or replace function public.check_in_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments%rowtype;
begin
  select * into v_t from public.tournaments where id=p_tournament_id;
  if not found or v_t.status <> 'registration' then raise exception 'Dieses Turnier ist nicht im Check-in.'; end if;
  if now() < v_t.check_in_opens_at then raise exception 'Der Check-in ist noch nicht geöffnet.'; end if;
  if now() > v_t.check_in_closes_at then raise exception 'Das Check-in-Fenster ist geschlossen.'; end if;
  update public.tournament_participants set status='checked_in', checked_in_at=now()
    where tournament_id=p_tournament_id and user_id=auth.uid() and status='registered';
  if not found then raise exception 'Du hast keinen bestätigten Startplatz.'; end if;
end;
$$;

create or replace function public.leave_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old_status text;
begin
  select status into v_old_status from public.tournament_participants
    where tournament_id=p_tournament_id and user_id=auth.uid() and status in ('registered','checked_in','waitlisted') for update;
  if v_old_status is null then raise exception 'Keine aktive Anmeldung gefunden.'; end if;
  update public.tournament_participants set status='withdrawn', removed_reason='Vom Spieler abgemeldet'
    where tournament_id=p_tournament_id and user_id=auth.uid();
  if v_old_status in ('registered','checked_in') then perform public.promote_tournament_waitlist(p_tournament_id); end if;
end;
$$;

create or replace function public.admin_get_tournament_participants(p_tournament_id uuid)
returns table(user_id uuid, username text, status text, checked_in_at timestamptz, waitlist_position integer, wins integer, losses integer, points integer, removed_reason text)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  return query select tp.user_id,tp.username,tp.status,tp.checked_in_at,tp.waitlist_position,tp.wins,tp.losses,tp.points,tp.removed_reason
    from public.tournament_participants tp where tp.tournament_id=p_tournament_id
    order by case tp.status when 'checked_in' then 0 when 'registered' then 1 when 'waitlisted' then 2 else 3 end, tp.waitlist_position nulls last, tp.joined_at;
end;
$$;

create or replace function public.admin_manage_tournament_participant(p_tournament_id uuid,p_user_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_old text; v_title text;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  if p_action not in ('remove','disqualify') then raise exception 'Ungültige Aktion.'; end if;
  select status into v_old from public.tournament_participants where tournament_id=p_tournament_id and user_id=p_user_id for update;
  select title into v_title from public.tournaments where id=p_tournament_id;
  if v_old is null then raise exception 'Teilnehmer nicht gefunden.'; end if;
  update public.tournament_participants set status=case when p_action='disqualify' then 'disqualified' else 'removed' end,
    removed_reason=coalesce(nullif(trim(p_reason),''),'Administrative Entscheidung'), eliminated_at=now()
    where tournament_id=p_tournament_id and user_id=p_user_id;
  insert into public.notifications(user_id,type,title,body,href) values
    (p_user_id,'tournament_participant_removed',case when p_action='disqualify' then 'Vom Turnier disqualifiziert' else 'Turnierteilnahme beendet' end,
     coalesce(v_title,'Turnier') || ': ' || coalesce(nullif(trim(p_reason),''),'Bitte wende dich bei Rückfragen an den Support.'),'/support');
  if v_old in ('registered','checked_in') then perform public.promote_tournament_waitlist(p_tournament_id); end if;
end;
$$;

create or replace function public.admin_cancel_tournament(p_tournament_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_title text;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  update public.tournaments set status='cancelled',cancellation_reason=coalesce(nullif(trim(p_reason),''),'Turnier wurde durch die Turnierleitung abgesagt.'),updated_at=now()
    where id=p_tournament_id and status in ('registration','live') returning title into v_title;
  if v_title is null then raise exception 'Turnier kann nicht abgesagt werden.'; end if;
  insert into public.notifications(user_id,type,title,body,href)
    select user_id,'tournament_cancelled','Turnier abgesagt',v_title || ': ' || coalesce(nullif(trim(p_reason),''),'Weitere Informationen folgen.'),'/tournaments'
    from public.tournament_participants where tournament_id=p_tournament_id and status not in ('withdrawn','removed');
end;
$$;

create or replace function public.admin_update_tournament_awards(p_tournament_id uuid,p_prize_title text,p_prize_details text,p_winner_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  update public.tournaments set prize_title=nullif(trim(p_prize_title),''),prize_details=nullif(trim(p_prize_details),''),winner_id=coalesce(p_winner_id,winner_id),updated_at=now() where id=p_tournament_id;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
end;
$$;

drop function if exists public.admin_create_tournament(text,text,timestamptz,timestamptz,integer,integer,boolean,numeric,numeric,text,text);
create function public.admin_create_tournament(
  p_title text,p_description text,p_starts_at timestamptz,p_registration_closes_at timestamptz,
  p_max_players integer,p_best_of integer,p_premium_only boolean,p_max_average numeric,p_min_average numeric,
  p_scoring_platform text default 'dartcounter',p_access_code text default null,
  p_tournament_format text default 'single_elimination',p_check_in_minutes integer default 30,
  p_prize_title text default null,p_prize_details text default null,p_dispute_policy text default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_code text:=nullif(upper(trim(coalesce(p_access_code,''))),'');
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  if p_scoring_platform not in ('scolia','dartcounter') then raise exception 'Ungültige Spielplattform.'; end if;
  if p_tournament_format not in ('single_elimination','double_elimination','group_stage') then raise exception 'Ungültiges Turnierformat.'; end if;
  if v_code is not null and char_length(v_code)<4 then raise exception 'Ein Turniercode braucht mindestens 4 Zeichen.'; end if;
  insert into public.tournaments(title,description,starts_at,registration_closes_at,max_players,best_of,premium_only,max_average,min_average,scoring_platform,access_code_hash,created_by,tournament_format,check_in_opens_at,check_in_closes_at,prize_title,prize_details,dispute_policy)
  values(trim(p_title),trim(coalesce(p_description,'')),p_starts_at,p_registration_closes_at,p_max_players,p_best_of,coalesce(p_premium_only,false),p_max_average,p_min_average,p_scoring_platform,case when v_code is null then null else md5(v_code) end,auth.uid(),p_tournament_format,p_starts_at-make_interval(mins=>greatest(5,p_check_in_minutes)),p_starts_at+interval '5 minutes',nullif(trim(p_prize_title),''),nullif(trim(p_prize_details),''),coalesce(nullif(trim(p_dispute_policy),''),'Bei Verbindungsproblemen sofort Screenshots sichern, den Gegner informieren und innerhalb von 15 Minuten ein Support-Ticket öffnen.'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Check-in is mandatory. Missing players lose their slot and waitlisted users are promoted.
create or replace function public.admin_prepare_tournament_start(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_removed integer; v_slots integer; i integer; v_promoted uuid;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  update public.tournament_participants set status='removed',removed_reason='Check-in verpasst',eliminated_at=now()
    where tournament_id=p_tournament_id and status='registered';
  get diagnostics v_removed = row_count;
  select greatest(0,t.max_players-count(*) filter(where tp.status='checked_in')) into v_slots
    from public.tournaments t left join public.tournament_participants tp on tp.tournament_id=t.id where t.id=p_tournament_id group by t.max_players;
  if v_slots > 0 then
    for i in 1..v_slots loop
      v_promoted := public.promote_tournament_waitlist(p_tournament_id);
      exit when v_promoted is null;
      update public.tournament_participants set status='checked_in',checked_in_at=now()
        where tournament_id=p_tournament_id and user_id=v_promoted;
    end loop;
  end if;
  return v_removed;
end;
$$;

create or replace function public.admin_generate_tournament_bracket(p_tournament_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_t public.tournaments%rowtype; v_count integer; v_match_id uuid;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' then raise exception 'Das Turnier wurde bereits gestartet.'; end if;
  perform public.admin_prepare_tournament_start(p_tournament_id);
  select count(*) into v_count from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in';
  if v_count < 2 then raise exception 'Mindestens zwei eingecheckte Teilnehmer werden benötigt.'; end if;

  if v_t.tournament_format='group_stage' then
    update public.tournament_participants set group_number=1 where tournament_id=p_tournament_id and status='checked_in';
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
    if v_count not in (2,4,8,16,32) then raise exception 'Für K.-o.-Formate werden 2, 4, 8, 16 oder 32 eingecheckte Teilnehmer benötigt.'; end if;
    for v_match_id in
      with shuffled as materialized (
        select user_id,row_number() over(order by seed nulls last,random()) rn
        from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in'
      )
      insert into public.tournament_matches(tournament_id,round_number,match_number,player1_id,player2_id,status,bracket_stage)
      select p_tournament_id,1,((p1.rn+1)/2)::integer,p1.user_id,p2.user_id,'ready',
        case when v_t.tournament_format='double_elimination' then 'double' else 'main' end
      from shuffled p1 join shuffled p2 on p2.rn=p1.rn+1 where mod(p1.rn,2)=1 returning id
    loop perform public.create_tournament_matchroom(v_match_id); end loop;
  end if;
  update public.tournaments set status='live',updated_at=now() where id=p_tournament_id;
  insert into public.notifications(user_id,type,title,body,href)
    select user_id,'tournament_started','Turnier gestartet',v_t.title || ': Dein Turnier ist live. Öffne jetzt den Turnierbaum.','/tournaments'
    from public.tournament_participants where tournament_id=p_tournament_id and status='checked_in';
end;
$$;

create or replace function public.advance_tournament_bracket(p_tournament_match_id uuid,p_winner_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_m public.tournament_matches%rowtype; v_t public.tournaments%rowtype; v_loser uuid;
  v_total integer; v_done integer; v_active integer; v_next_round integer; v_match_id uuid; i integer;
  v_p1 uuid; v_p2 uuid;
begin
  select * into v_m from public.tournament_matches where id=p_tournament_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  if v_m.status='completed' then return; end if;
  if p_winner_id not in (v_m.player1_id,v_m.player2_id) then raise exception 'Der Gewinner gehört nicht zu diesem Match.'; end if;
  select * into v_t from public.tournaments where id=v_m.tournament_id for update;
  v_loser:=case when p_winner_id=v_m.player1_id then v_m.player2_id else v_m.player1_id end;
  update public.tournament_matches set winner_id=p_winner_id,status='completed' where id=p_tournament_match_id;
  update public.tournament_participants set wins=wins+1,points=points+2 where tournament_id=v_m.tournament_id and user_id=p_winner_id;
  update public.tournament_participants set losses=losses+1,
    eliminated_at=case when v_t.tournament_format='single_elimination' or losses+1>=2 then now() else eliminated_at end
    where tournament_id=v_m.tournament_id and user_id=v_loser;
  select count(*),count(*) filter(where status='completed') into v_total,v_done
    from public.tournament_matches where tournament_id=v_m.tournament_id and round_number=v_m.round_number;
  if v_total<>v_done then return; end if;

  if v_t.tournament_format='group_stage' then
    select count(*) into v_done from public.tournament_matches where tournament_id=v_m.tournament_id and status<>'completed';
    if v_done=0 then
      select user_id into v_p1 from public.tournament_participants where tournament_id=v_m.tournament_id and status='checked_in'
        order by points desc,wins desc,losses asc,average_snapshot desc nulls last limit 1;
      update public.tournaments set status='completed',winner_id=v_p1,updated_at=now() where id=v_m.tournament_id;
    end if;
    return;
  end if;

  if v_t.tournament_format='single_elimination' then
    if v_total=1 then update public.tournaments set status='completed',winner_id=p_winner_id,updated_at=now() where id=v_m.tournament_id; return; end if;
    for i in 1..(v_total/2) loop
      select winner_id into v_p1 from public.tournament_matches where tournament_id=v_m.tournament_id and round_number=v_m.round_number and match_number=i*2-1;
      select winner_id into v_p2 from public.tournament_matches where tournament_id=v_m.tournament_id and round_number=v_m.round_number and match_number=i*2;
      insert into public.tournament_matches(tournament_id,round_number,match_number,player1_id,player2_id,status,bracket_stage)
      values(v_m.tournament_id,v_m.round_number+1,i,v_p1,v_p2,'ready','main') returning id into v_match_id;
      perform public.create_tournament_matchroom(v_match_id);
    end loop;
    return;
  end if;

  -- Double elimination: a player leaves only after the second loss. Each wave
  -- pairs remaining players with the same/lower loss count whenever possible.
  select count(*) into v_active from public.tournament_participants
    where tournament_id=v_m.tournament_id and status='checked_in' and losses<2;
  if v_active=1 then
    select user_id into v_p1 from public.tournament_participants where tournament_id=v_m.tournament_id and status='checked_in' and losses<2 limit 1;
    update public.tournaments set status='completed',winner_id=v_p1,updated_at=now() where id=v_m.tournament_id;
    return;
  end if;
  v_next_round:=v_m.round_number+1;
  for v_match_id in
    with remaining as materialized (
      select user_id,row_number() over(order by losses,random()) rn
      from public.tournament_participants where tournament_id=v_m.tournament_id and status='checked_in' and losses<2
    )
    insert into public.tournament_matches(tournament_id,round_number,match_number,player1_id,player2_id,status,bracket_stage)
    select v_m.tournament_id,v_next_round,((p1.rn+1)/2)::integer,p1.user_id,p2.user_id,'ready','double'
    from remaining p1 join remaining p2 on p2.rn=p1.rn+1 where mod(p1.rn,2)=1 returning id
  loop perform public.create_tournament_matchroom(v_match_id); end loop;
end;
$$;

create or replace function public.list_player_tournament_history(p_user_id uuid)
returns table(tournament_id uuid,title text,starts_at timestamptz,status text,tournament_format text,scoring_platform text,participant_status text,wins integer,losses integer,points integer,placement integer,is_winner boolean,prize_title text)
language sql security definer set search_path=public as $$
  select t.id,t.title,t.starts_at,t.status,t.tournament_format,t.scoring_platform,tp.status,tp.wins,tp.losses,tp.points,
    case when t.winner_id=p_user_id then 1 else null end,t.winner_id=p_user_id,t.prize_title
  from public.tournament_participants tp join public.tournaments t on t.id=tp.tournament_id
  where tp.user_id=p_user_id and t.status in ('live','completed','cancelled')
  order by t.starts_at desc limit 30;
$$;

grant execute on function public.list_tournaments() to authenticated;
grant execute on function public.join_tournament(uuid,text) to authenticated;
grant execute on function public.check_in_tournament(uuid) to authenticated;
grant execute on function public.leave_tournament(uuid) to authenticated;
grant execute on function public.admin_get_tournament_participants(uuid) to authenticated;
grant execute on function public.admin_manage_tournament_participant(uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_cancel_tournament(uuid,text) to authenticated;
grant execute on function public.admin_update_tournament_awards(uuid,text,text,uuid) to authenticated;
grant execute on function public.admin_create_tournament(text,text,timestamptz,timestamptz,integer,integer,boolean,numeric,numeric,text,text,text,integer,text,text,text) to authenticated;
grant execute on function public.admin_prepare_tournament_start(uuid) to authenticated;
grant execute on function public.list_player_tournament_history(uuid) to authenticated;
