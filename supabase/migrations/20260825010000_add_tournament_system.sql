-- RankedDarts tournament system: registration, eligibility and knockout brackets.

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '',
  starts_at timestamptz not null,
  registration_closes_at timestamptz not null,
  max_players integer not null check (max_players in (4, 8, 16, 32)),
  best_of integer not null default 5 check (best_of in (3, 5, 7, 9, 11)),
  premium_only boolean not null default false,
  max_average numeric(5,2),
  min_average numeric(5,2),
  status text not null default 'registration' check (status in ('draft', 'registration', 'live', 'completed', 'cancelled')),
  winner_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_closes_at <= starts_at),
  check (min_average is null or max_average is null or min_average <= max_average)
);

create table if not exists public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  average_snapshot numeric(5,2),
  seed integer,
  joined_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  match_number integer not null check (match_number >= 1),
  player1_id uuid references auth.users(id) on delete set null,
  player2_id uuid references auth.users(id) on delete set null,
  winner_id uuid references auth.users(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'ready', 'completed')),
  created_at timestamptz not null default now(),
  unique (tournament_id, round_number, match_number)
);

create index if not exists tournaments_status_starts_at_idx on public.tournaments(status, starts_at);
create index if not exists tournament_participants_tournament_id_idx on public.tournament_participants(tournament_id);
create index if not exists tournament_matches_tournament_id_idx on public.tournament_matches(tournament_id, round_number, match_number);

alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_matches enable row level security;

drop policy if exists "tournaments readable by signed in users" on public.tournaments;
create policy "tournaments readable by signed in users" on public.tournaments
  for select to authenticated using (status <> 'draft');

drop policy if exists "participants readable by signed in users" on public.tournament_participants;
create policy "participants readable by signed in users" on public.tournament_participants
  for select to authenticated using (true);

drop policy if exists "tournament matches readable by signed in users" on public.tournament_matches;
create policy "tournament matches readable by signed in users" on public.tournament_matches
  for select to authenticated using (true);

create or replace function public.is_tournament_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where "supabaseId" = auth.uid()::text and is_admin = true
  );
$$;

create or replace function public.tournament_player_average(p_user_id uuid)
returns numeric
language sql
security definer
set search_path = public
as $$
  select round(avg(
    case when player1_id::text = p_user_id::text then submitted_player1_average else submitted_player2_average end
  )::numeric, 2)
  from public.active_matches
  where p_user_id::text in (player1_id::text, player2_id::text)
    and (case when player1_id::text = p_user_id::text then submitted_player1_average else submitted_player2_average end) is not null;
$$;

create or replace function public.list_tournaments()
returns table (
  id uuid, title text, description text, starts_at timestamptz, registration_closes_at timestamptz,
  max_players integer, best_of integer, premium_only boolean, max_average numeric, min_average numeric,
  status text, winner_id uuid, participant_count bigint, joined boolean, winner_username text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.title, t.description, t.starts_at, t.registration_closes_at, t.max_players, t.best_of,
    t.premium_only, t.max_average, t.min_average, t.status, t.winner_id,
    count(tp.id) as participant_count,
    coalesce(bool_or(tp.user_id = auth.uid()), false) as joined,
    winner.username as winner_username
  from public.tournaments t
  left join public.tournament_participants tp on tp.tournament_id = t.id
  left join public.profiles winner on winner."supabaseId" = t.winner_id::text
  where t.status <> 'draft'
  group by t.id, winner.username
  order by case t.status when 'registration' then 0 when 'live' then 1 when 'completed' then 2 else 3 end, t.starts_at asc;
$$;

create or replace function public.get_tournament_bracket(p_tournament_id uuid)
returns table (
  id uuid, round_number integer, match_number integer, player1_id uuid, player2_id uuid,
  player1_username text, player2_username text, winner_id uuid, winner_username text, status text
)
language sql
security definer
set search_path = public
as $$
  select m.id, m.round_number, m.match_number, m.player1_id, m.player2_id,
    p1.username, p2.username, m.winner_id, pw.username, m.status
  from public.tournament_matches m
  left join public.profiles p1 on p1."supabaseId" = m.player1_id::text
  left join public.profiles p2 on p2."supabaseId" = m.player2_id::text
  left join public.profiles pw on pw."supabaseId" = m.winner_id::text
  where m.tournament_id = p_tournament_id
  order by m.round_number, m.match_number;
$$;

create or replace function public.join_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_profile record;
  v_average numeric;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_tournament.status <> 'registration' or now() > v_tournament.registration_closes_at then raise exception 'Die Anmeldung ist geschlossen.'; end if;
  select count(*) into v_count from public.tournament_participants where tournament_id = p_tournament_id;
  if v_count >= v_tournament.max_players then raise exception 'Dieses Turnier ist bereits voll.'; end if;
  if exists (select 1 from public.tournament_participants where tournament_id = p_tournament_id and user_id = auth.uid()) then raise exception 'Du bist bereits angemeldet.'; end if;

  select username, coalesce("isPremium", false) as is_premium into v_profile from public.profiles where "supabaseId" = auth.uid()::text;
  if v_profile.username is null then raise exception 'Dein Profil konnte nicht geladen werden.'; end if;
  if v_tournament.premium_only and not v_profile.is_premium then raise exception 'Dieses Turnier ist nur für Premium-Mitglieder.'; end if;
  v_average := public.tournament_player_average(auth.uid());
  if v_tournament.max_average is not null and coalesce(v_average, 0) > v_tournament.max_average then raise exception 'Dein Average liegt über dem erlaubten Limit.'; end if;
  if v_tournament.min_average is not null and coalesce(v_average, 0) < v_tournament.min_average then raise exception 'Dein Average liegt unter dem erforderlichen Limit.'; end if;

  insert into public.tournament_participants(tournament_id, user_id, username, average_snapshot)
  values (p_tournament_id, auth.uid(), v_profile.username, v_average);
end;
$$;

create or replace function public.admin_create_tournament(
  p_title text, p_description text, p_starts_at timestamptz, p_registration_closes_at timestamptz,
  p_max_players integer, p_best_of integer, p_premium_only boolean, p_max_average numeric, p_min_average numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  insert into public.tournaments(title, description, starts_at, registration_closes_at, max_players, best_of, premium_only, max_average, min_average, created_by)
  values (trim(p_title), trim(coalesce(p_description, '')), p_starts_at, p_registration_closes_at, p_max_players, p_best_of, coalesce(p_premium_only, false), p_max_average, p_min_average, auth.uid())
  returning id into v_id;
  return v_id;
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
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_tournament.status <> 'registration' then raise exception 'Der Turnierbaum wurde bereits erstellt.'; end if;
  select count(*) into v_count from public.tournament_participants where tournament_id = p_tournament_id;
  if v_count <> v_tournament.max_players then raise exception 'Der Turnierbaum kann erst gestartet werden, wenn alle Plätze belegt sind.'; end if;

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

create or replace function public.admin_report_tournament_winner(p_match_id uuid, p_winner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_total integer;
  v_completed integer;
  v_p1 uuid;
  v_p2 uuid;
  i integer;
begin
  if not public.is_tournament_admin() then raise exception 'Kein Admin-Zugriff.'; end if;
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'Turniermatch nicht gefunden.'; end if;
  if v_match.status = 'completed' then raise exception 'Dieses Ergebnis wurde bereits eingetragen.'; end if;
  if p_winner_id not in (v_match.player1_id, v_match.player2_id) then raise exception 'Der Gewinner gehört nicht zu diesem Match.'; end if;
  update public.tournament_matches set winner_id = p_winner_id, status = 'completed' where id = p_match_id;

  select count(*), count(winner_id) into v_total, v_completed from public.tournament_matches
  where tournament_id = v_match.tournament_id and round_number = v_match.round_number;
  if v_total <> v_completed then return; end if;

  if v_total = 1 then
    update public.tournaments set status = 'completed', winner_id = p_winner_id, updated_at = now() where id = v_match.tournament_id;
    return;
  end if;

  for i in 1..(v_total / 2) loop
    select winner_id into v_p1 from public.tournament_matches where tournament_id = v_match.tournament_id and round_number = v_match.round_number and match_number = i * 2 - 1;
    select winner_id into v_p2 from public.tournament_matches where tournament_id = v_match.tournament_id and round_number = v_match.round_number and match_number = i * 2;
    insert into public.tournament_matches(tournament_id, round_number, match_number, player1_id, player2_id, status)
    values (v_match.tournament_id, v_match.round_number + 1, i, v_p1, v_p2, 'ready');
  end loop;
end;
$$;

grant execute on function public.list_tournaments() to authenticated;
grant execute on function public.get_tournament_bracket(uuid) to authenticated;
grant execute on function public.join_tournament(uuid) to authenticated;
grant execute on function public.admin_create_tournament(text, text, timestamptz, timestamptz, integer, integer, boolean, numeric, numeric) to authenticated;
grant execute on function public.admin_generate_tournament_bracket(uuid) to authenticated;
grant execute on function public.admin_report_tournament_winner(uuid, uuid) to authenticated;
