-- Fair-play protection without paid SMS verification. Existing account and
-- platform data stay intact; signals only support a human review and never
-- create an automatic ban or restriction.
begin;
set local lock_timeout = '5s';

-- SMS verification is deliberately disabled. E-mail confirmation, Turnstile
-- and short-lived, hashed rate limits remain the registration safeguards.
insert into public.app_settings(key, value, updated_at)
values ('sms_verification', '{"enabled": false}'::jsonb, now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

-- Fast, case-insensitive conflict lookups. They are non-unique on purpose:
-- historical duplicates are surfaced to staff instead of silently changing or
-- deleting somebody's linked platform account.
create index if not exists profiles_scolia_username_normalized_idx
  on public.profiles (lower(btrim(scolia_username)))
  where nullif(btrim(coalesce(scolia_username, '')), '') is not null;
create index if not exists profiles_dartcounter_username_normalized_idx
  on public.profiles (lower(btrim(dartcounter_username)))
  where nullif(btrim(coalesce(dartcounter_username, '')), '') is not null;
create index if not exists profiles_autodarts_username_normalized_idx
  on public.profiles (lower(btrim(autodarts_username)))
  where nullif(btrim(coalesce(autodarts_username, '')), '') is not null;

-- Platform identities are the primary no-cost anti-multi-account signal. A
-- transaction-scoped advisory lock makes the check race-safe without rejecting
-- existing, historic duplicates until the team has reviewed them.
create or replace function public.update_platform_usernames(
  p_scolia_username text,
  p_dartcounter_username text,
  p_autodarts_username text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_scolia text := nullif(btrim(coalesce(p_scolia_username, '')), '');
  v_dartcounter text := nullif(btrim(coalesce(p_dartcounter_username, '')), '');
  v_autodarts text := nullif(btrim(coalesce(p_autodarts_username, '')), '');
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if coalesce(char_length(v_scolia), 0) > 100
    or coalesce(char_length(v_dartcounter), 0) > 100
    or coalesce(char_length(v_autodarts), 0) > 100 then
    raise exception 'PLATFORM_USERNAME_TOO_LONG';
  end if;

  select * into v_profile
  from public.profiles
  where "supabaseId" = v_uid::text
  for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_scolia is not null
    and lower(v_scolia) is distinct from lower(nullif(btrim(coalesce(v_profile.scolia_username, '')), '')) then
    perform pg_advisory_xact_lock(hashtextextended('rankeddarts:platform:scolia:' || lower(v_scolia), 0));
    if exists (
      select 1 from public.profiles p
      where p.id <> v_profile.id
        and lower(btrim(p.scolia_username)) = lower(v_scolia)
    ) then
      raise exception 'SCOLIA_USERNAME_ALREADY_LINKED';
    end if;
  end if;

  if v_dartcounter is not null
    and lower(v_dartcounter) is distinct from lower(nullif(btrim(coalesce(v_profile.dartcounter_username, '')), '')) then
    perform pg_advisory_xact_lock(hashtextextended('rankeddarts:platform:dartcounter:' || lower(v_dartcounter), 0));
    if exists (
      select 1 from public.profiles p
      where p.id <> v_profile.id
        and lower(btrim(p.dartcounter_username)) = lower(v_dartcounter)
    ) then
      raise exception 'DARTCOUNTER_USERNAME_ALREADY_LINKED';
    end if;
  end if;

  if v_autodarts is not null
    and lower(v_autodarts) is distinct from lower(nullif(btrim(coalesce(v_profile.autodarts_username, '')), '')) then
    perform pg_advisory_xact_lock(hashtextextended('rankeddarts:platform:autodarts:' || lower(v_autodarts), 0));
    if exists (
      select 1 from public.profiles p
      where p.id <> v_profile.id
        and lower(btrim(p.autodarts_username)) = lower(v_autodarts)
    ) then
      raise exception 'AUTODARTS_USERNAME_ALREADY_LINKED';
    end if;
  end if;

  update public.profiles
  set scolia_username = v_scolia,
      dartcounter_username = v_dartcounter,
      autodarts_username = v_autodarts
  where id = v_profile.id;
end;
$$;

revoke all on function public.update_platform_usernames(text, text, text) from public, anon;
grant execute on function public.update_platform_usernames(text, text, text) to authenticated;

-- Surface historical duplicate platform identities in the existing Fair-Play
-- workspace. They are warnings for manual review, not proof of a violation.
alter table public.fairness_risk_flags
  drop constraint if exists fairness_risk_flags_reason_check;
alter table public.fairness_risk_flags
  add constraint fairness_risk_flags_reason_check
  check (reason in ('repeated_pairing', 'duplicate_platform_identity'));

with platform_profiles as (
  select 'scolia'::text as platform, lower(btrim(scolia_username)) as identity_key, "supabaseId"::uuid as user_id
  from public.profiles
  where nullif(btrim(coalesce(scolia_username, '')), '') is not null
  union all
  select 'dartcounter', lower(btrim(dartcounter_username)), "supabaseId"::uuid
  from public.profiles
  where nullif(btrim(coalesce(dartcounter_username, '')), '') is not null
  union all
  select 'autodarts', lower(btrim(autodarts_username)), "supabaseId"::uuid
  from public.profiles
  where nullif(btrim(coalesce(autodarts_username, '')), '') is not null
), duplicate_pairs as (
  select a.platform, a.identity_key, a.user_id as player1_id, b.user_id as player2_id
  from platform_profiles a
  join platform_profiles b
    on b.platform = a.platform
   and b.identity_key = a.identity_key
   and b.user_id > a.user_id
)
insert into public.fairness_risk_flags(
  pair_key, player1_id, player2_id, reason, severity, occurrence_count, context, first_seen_at, last_seen_at
)
select
  'platform_identity:' || platform || ':' || player1_id::text || ':' || player2_id::text,
  player1_id,
  player2_id,
  'duplicate_platform_identity',
  'warning',
  1,
  jsonb_build_object('platform', platform, 'identity', identity_key),
  now(),
  now()
from duplicate_pairs
on conflict (pair_key, reason) do update
set occurrence_count = excluded.occurrence_count,
    context = excluded.context,
    last_seen_at = now(),
    resolved_at = null,
    resolved_by = null;

-- Keep one pseudonymized network signal per signed-in account for seven days.
-- The browser never sends an IP to the database; the server HMACs it first.
-- It supports a review only, is never a ban trigger and is not public.
create table if not exists public.account_security_signals (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  signal_hash text not null check (signal_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (profile_id, signal_hash)
);
create index if not exists account_security_signals_hash_expiry_idx
  on public.account_security_signals(signal_hash, expires_at desc);
create index if not exists account_security_signals_expiry_idx
  on public.account_security_signals(expires_at);
alter table public.account_security_signals enable row level security;
revoke all on table public.account_security_signals from public, anon, authenticated;

create or replace function public.record_account_network_signal(
  p_user_id uuid,
  p_signal_hash text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_signal_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_SECURITY_SIGNAL';
  end if;

  delete from public.account_security_signals where expires_at <= now();

  select id into v_profile_id
  from public.profiles
  where "supabaseId" = p_user_id::text;
  if v_profile_id is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  insert into public.account_security_signals(profile_id, signal_hash, first_seen_at, last_seen_at, expires_at)
  values (v_profile_id, p_signal_hash, now(), now(), now() + interval '7 days')
  on conflict (profile_id, signal_hash) do update
  set last_seen_at = excluded.last_seen_at,
      expires_at = excluded.expires_at;
end;
$$;
revoke all on function public.record_account_network_signal(uuid, text) from public, anon, authenticated;
grant execute on function public.record_account_network_signal(uuid, text) to service_role;

create or replace function public.admin_get_network_overlaps(p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles me
    where me."supabaseId" = auth.uid()::text and coalesce(me.is_admin, false)
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  select id into v_profile_id
  from public.profiles
  where id::text = trim(coalesce(p_player_id, ''))
     or "supabaseId" = trim(coalesce(p_player_id, ''))
  order by ("supabaseId" = trim(coalesce(p_player_id, ''))) desc
  limit 1;
  if v_profile_id is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(item) order by item.last_seen_at desc, item.related_username)
    from (
      select
        coalesce(other.username, 'Unbekannt') as related_username,
        count(distinct mine.signal_hash)::integer as shared_signal_count,
        max(least(mine.last_seen_at, theirs.last_seen_at)) as last_seen_at
      from public.account_security_signals mine
      join public.account_security_signals theirs
        on theirs.signal_hash = mine.signal_hash
       and theirs.profile_id <> mine.profile_id
       and theirs.expires_at > now()
      join public.profiles other on other.id = theirs.profile_id
      where mine.profile_id = v_profile_id
        and mine.expires_at > now()
      group by other.id, other.username
      order by max(least(mine.last_seen_at, theirs.last_seen_at)) desc, other.username
      limit 12
    ) item
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_get_network_overlaps(text) from public, anon;
grant execute on function public.admin_get_network_overlaps(text) to authenticated;

-- Prize tournaments get a small earned-trust gate. Normal matchmaking and
-- tournaments without a prize remain available immediately.
create index if not exists matches_ranked_fairplay_eligibility_idx
  on public.matches(user_id, completed_at desc)
  where status = 'completed' and match_mode = 'ranked';

create or replace function public.get_my_prize_tournament_eligibility()
returns table(
  eligible boolean,
  account_age_hours integer,
  ranked_matches integer,
  required_account_age_hours integer,
  required_ranked_matches integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select created_at into v_created_at
  from public.profiles
  where "supabaseId" = auth.uid()::text;
  if v_created_at is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select count(*)::integer into ranked_matches
  from public.matches
  where user_id = auth.uid()
    and status = 'completed'
    and match_mode = 'ranked';

  account_age_hours := greatest(0, floor(extract(epoch from (now() - v_created_at)) / 3600)::integer);
  required_account_age_hours := 24;
  required_ranked_matches := 3;
  eligible := account_age_hours >= required_account_age_hours
    and ranked_matches >= required_ranked_matches;
  return next;
end;
$$;
revoke all on function public.get_my_prize_tournament_eligibility() from public, anon;
grant execute on function public.get_my_prize_tournament_eligibility() to authenticated;

-- Rebuild the current tournament join boundary with the earned-trust check.
create or replace function public.join_tournament(
  p_tournament_id uuid,
  p_access_code text default null,
  p_accept_payout_terms boolean default false
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_t public.tournaments%rowtype;
  v_profile record;
  v_average numeric;
  v_count integer;
  v_status text;
  v_position integer;
  v_eligibility record;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;

  select * into v_t
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' or now() > v_t.registration_closes_at then raise exception 'Die Anmeldung ist geschlossen.'; end if;
  if v_t.access_code_hash is not null and md5(upper(trim(coalesce(p_access_code, '')))) <> v_t.access_code_hash then raise exception 'Der Turniercode ist ungültig.'; end if;
  if v_t.prize_title is not null and p_accept_payout_terms is not true then
    raise exception 'Bitte bestätige vor der Anmeldung die Auszahlungsfrist für dieses Turnier.';
  end if;
  if exists (
    select 1
    from public.tournament_participants
    where tournament_id = p_tournament_id
      and user_id = auth.uid()
      and status not in ('withdrawn', 'removed', 'disqualified')
  ) then raise exception 'Du bist bereits angemeldet.'; end if;

  select username, scolia_username, dartcounter_username, autodarts_username into v_profile
  from public.profiles
  where "supabaseId" = auth.uid()::text;
  if v_profile.username is null then raise exception 'Dein Profil konnte nicht geladen werden.'; end if;
  if v_t.premium_only and not public.has_active_premium(auth.uid()) then raise exception 'Dieses Turnier ist nur für Premium-Mitglieder.'; end if;
  if v_t.scoring_platform = 'scolia' and nullif(trim(coalesce(v_profile.scolia_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen Scolia-Namen im Profil.'; end if;
  if v_t.scoring_platform = 'dartcounter' and nullif(trim(coalesce(v_profile.dartcounter_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen DartCounter-Namen im Profil.'; end if;
  if v_t.scoring_platform = 'autodarts' and nullif(trim(coalesce(v_profile.autodarts_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen AutoDarts-Namen im Profil.'; end if;

  if v_t.prize_title is not null then
    select * into v_eligibility from public.get_my_prize_tournament_eligibility();
    if not v_eligibility.eligible then
      raise exception 'Für Preisgeld-Turniere braucht dein Konto mindestens 24 Stunden und drei bestätigte Ranked-Matches. Aktuell: % Stunden, % von 3 Matches.', v_eligibility.account_age_hours, v_eligibility.ranked_matches;
    end if;
  end if;

  v_average := public.tournament_player_average(auth.uid());
  if v_t.max_average is not null and coalesce(v_average, 0) > v_t.max_average then raise exception 'Dein Average liegt über dem erlaubten Limit.'; end if;
  if v_t.min_average is not null and coalesce(v_average, 0) < v_t.min_average then raise exception 'Dein Average liegt unter dem erforderlichen Limit.'; end if;

  select count(*) into v_count
  from public.tournament_participants
  where tournament_id = p_tournament_id
    and status in ('registered', 'checked_in');

  v_status := case when v_count >= v_t.max_players then 'waitlisted' else 'registered' end;
  if v_status = 'waitlisted' then
    select coalesce(max(waitlist_position), 0) + 1 into v_position
    from public.tournament_participants
    where tournament_id = p_tournament_id
      and status = 'waitlisted';
  end if;

  delete from public.tournament_participants
  where tournament_id = p_tournament_id
    and user_id = auth.uid()
    and status in ('withdrawn', 'removed', 'disqualified');

  insert into public.tournament_participants(tournament_id, user_id, username, average_snapshot, status, waitlist_position)
  values (p_tournament_id, auth.uid(), v_profile.username, v_average, v_status, v_position);

  if v_t.prize_title is not null then
    insert into public.tournament_rule_acceptances(
      tournament_id, user_id, rules_version, payout_deadline_days, terms_snapshot
    )
    values (
      v_t.id, auth.uid(), v_t.payout_terms_version, v_t.payout_deadline_days, v_t.payout_terms_snapshot
    )
    on conflict (tournament_id, user_id, rules_version) do nothing;
  end if;

  return v_status;
end;
$$;
revoke all on function public.join_tournament(uuid, text, boolean) from public, anon;
grant execute on function public.join_tournament(uuid, text, boolean) to authenticated;

commit;
