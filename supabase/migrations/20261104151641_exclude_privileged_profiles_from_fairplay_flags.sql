-- Staff and official community creators are trusted operational accounts.
-- They must never enter the automatic Fair-Play hint queues. This affects
-- only heuristic review signals; player reports and manual admin reviews keep
-- their normal safeguards.
begin;
set local lock_timeout = '5s';

create or replace function public.is_fairplay_exempt_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile."supabaseId" = p_user_id::text
      and (
        coalesce(profile.is_admin, false)
        or coalesce(profile.is_moderator, false)
        or coalesce(profile.is_streamer, false)
      )
  );
$$;
revoke all on function public.is_fairplay_exempt_profile(uuid) from public, anon, authenticated;

-- Resolve historic automatic pair signals as soon as either account has an
-- exempt role. Retaining no open record prevents stale dashboard counts.
update public.fairness_risk_flags flag
set resolved_at = now(),
    resolved_by = null,
    context = coalesce(flag.context, '{}'::jsonb) || jsonb_build_object(
      'system_resolution', 'privileged_role_exempt',
      'system_resolved_at', now()
    )
where flag.resolved_at is null
  and (
    public.is_fairplay_exempt_profile(flag.player1_id)
    or public.is_fairplay_exempt_profile(flag.player2_id)
  );

-- Keep that guarantee when a role is assigned later from the Admin Panel.
create or replace function public.resolve_fairplay_flags_for_privileged_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(new.is_admin, false)
    or coalesce(new.is_moderator, false)
    or coalesce(new.is_streamer, false) then
    update public.fairness_risk_flags flag
    set resolved_at = now(),
        resolved_by = null,
        context = coalesce(flag.context, '{}'::jsonb) || jsonb_build_object(
          'system_resolution', 'privileged_role_exempt',
          'system_resolved_at', now()
        )
    where flag.resolved_at is null
      and (
        flag.player1_id::text = new."supabaseId"
        or flag.player2_id::text = new."supabaseId"
      );
  end if;
  return new;
end;
$$;

drop trigger if exists resolve_fairplay_flags_for_privileged_profile_trigger on public.profiles;
create trigger resolve_fairplay_flags_for_privileged_profile_trigger
after insert or update of is_admin, is_moderator, is_streamer on public.profiles
for each row execute function public.resolve_fairplay_flags_for_privileged_profile();

-- Do not create pair signals for staff or official streamers. The trigger also
-- closes a stale pair hint if either participant gained an exempt role after
-- the hint was originally created.
create or replace function public.monitor_repeated_match_pairing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_pair text;
  v_first uuid;
  v_second uuid;
  v_count integer;
begin
  if new.status <> 'completed' or new.user_id is null or new.opponent_id is null or new.user_id = new.opponent_id then
    return new;
  end if;

  if new.user_id::text < new.opponent_id::text then
    v_first := new.user_id;
    v_second := new.opponent_id;
  else
    v_first := new.opponent_id;
    v_second := new.user_id;
  end if;
  v_pair := v_first::text || ':' || v_second::text;

  if public.is_fairplay_exempt_profile(v_first) or public.is_fairplay_exempt_profile(v_second) then
    update public.fairness_risk_flags flag
    set resolved_at = now(),
        resolved_by = null,
        context = coalesce(flag.context, '{}'::jsonb) || jsonb_build_object(
          'system_resolution', 'privileged_role_exempt',
          'system_resolved_at', now()
        )
    where flag.resolved_at is null
      and flag.pair_key = v_pair;
    return new;
  end if;

  select count(distinct active_match_id)::integer into v_count
  from public.matches
  where active_match_id is not null
    and created_at >= now() - interval '7 days'
    and (
      (user_id = v_first and opponent_id = v_second)
      or (user_id = v_second and opponent_id = v_first)
    );

  if v_count >= 5 then
    insert into public.fairness_risk_flags(
      pair_key, player1_id, player2_id, reason, severity, occurrence_count, context, last_seen_at
    )
    values (
      v_pair,
      v_first,
      v_second,
      'repeated_pairing',
      'warning',
      v_count,
      jsonb_build_object('matches_last_7_days', v_count, 'threshold', 5),
      now()
    )
    on conflict (pair_key, reason) do update
    set occurrence_count = excluded.occurrence_count,
        context = excluded.context,
        last_seen_at = now(),
        resolved_at = null,
        resolved_by = null;
  end if;
  return new;
end;
$$;

create or replace function public.admin_get_fairness_risk_flags(p_limit integer default 100)
returns table(
  id uuid,
  player1_id uuid,
  player2_id uuid,
  player1_username text,
  player2_username text,
  reason text,
  severity text,
  occurrence_count integer,
  context jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    where profile."supabaseId" = auth.uid()::text
      and coalesce(profile.is_admin, false)
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    flag.id,
    flag.player1_id,
    flag.player2_id,
    coalesce(player1.username, 'Unbekannt'),
    coalesce(player2.username, 'Unbekannt'),
    flag.reason,
    flag.severity,
    flag.occurrence_count,
    flag.context,
    flag.first_seen_at,
    flag.last_seen_at
  from public.fairness_risk_flags flag
  left join public.profiles player1 on player1."supabaseId" = flag.player1_id::text
  left join public.profiles player2 on player2."supabaseId" = flag.player2_id::text
  where flag.resolved_at is null
    and not public.is_fairplay_exempt_profile(flag.player1_id)
    and not public.is_fairplay_exempt_profile(flag.player2_id)
  order by flag.last_seen_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;
revoke all on function public.admin_get_fairness_risk_flags(integer) from public, anon;
grant execute on function public.admin_get_fairness_risk_flags(integer) to authenticated;

create or replace function public.get_flagged_players()
returns table(
  id text,
  username text,
  elo integer,
  "gamesPlayed" integer,
  wins integer,
  winrate numeric,
  elo_gain_7d integer,
  account_age_days integer,
  flags text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    where profile."supabaseId" = auth.uid()::text
      and coalesce(profile.is_admin, false)
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  return query
  with player_stats as (
    select
      profile.*,
      coalesce((
        select sum(match.elo_change)::integer
        from public.matches match
        where match.user_id::text = profile."supabaseId"
          and match.status = 'completed'
          and coalesce(match.completed_at, match.created_at) >= now() - interval '7 days'
      ), 0) as calculated_elo_gain_7d
    from public.profiles profile
    where (profile.is_banned = false or profile.is_banned is null)
      and profile.username is not null
      and coalesce(profile."gamesPlayed", 0) >= 5
      -- Use role columns directly here: this keeps the account review queue
      -- safe even if a legacy profile id is malformed text.
      and not (
        coalesce(profile.is_admin, false)
        or coalesce(profile.is_moderator, false)
        or coalesce(profile.is_streamer, false)
      )
  )
  select
    stats.id::text,
    coalesce(stats.username, 'Unbekannt'),
    coalesce(stats.elo, 0)::integer,
    coalesce(stats."gamesPlayed", 0)::integer,
    coalesce(stats.wins, 0)::integer,
    case
      when coalesce(stats."gamesPlayed", 0) > 0
        then round((coalesce(stats.wins, 0)::numeric / stats."gamesPlayed"::numeric) * 100, 1)
      else 0::numeric
    end,
    stats.calculated_elo_gain_7d,
    coalesce(extract(day from (now() - stats.created_at))::integer, 999),
    array_remove(array[
      case when coalesce(stats."gamesPlayed", 0) >= 10 and coalesce(stats.wins, 0)::numeric / nullif(stats."gamesPlayed", 0) >= 0.85 then 'Hohe Winrate (≥85%)' end,
      case when coalesce(stats."gamesPlayed", 0) >= 15 and coalesce(stats.wins, 0)::numeric / nullif(stats."gamesPlayed", 0) >= 0.90 then 'Extremer Win-Streak (≥90%)' end,
      case when coalesce(stats.elo, 0) >= 1200 and stats.created_at is not null and extract(day from (now() - stats.created_at)) < 14 then 'Neuer Account in High-Elo' end,
      case when stats.calculated_elo_gain_7d >= 200 then 'Schneller Elo-Anstieg (+200 / 7T)' end
    ], null)
  from player_stats stats
  where (coalesce(stats."gamesPlayed", 0) >= 10 and coalesce(stats.wins, 0)::numeric / nullif(stats."gamesPlayed", 0) >= 0.85)
     or (coalesce(stats.elo, 0) >= 1200 and stats.created_at is not null and extract(day from (now() - stats.created_at)) < 14)
     or stats.calculated_elo_gain_7d >= 200
  order by stats.calculated_elo_gain_7d desc, stats.elo desc;
end;
$$;
revoke all on function public.get_flagged_players() from public, anon;
grant execute on function public.get_flagged_players() to authenticated;

create or replace function public.mod_get_flagged_players()
returns table(
  id text,
  username text,
  elo integer,
  "gamesPlayed" integer,
  wins integer,
  winrate numeric,
  elo_gain_7d integer,
  account_age_days integer,
  flags text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  return query
  with player_stats as (
    select
      profile.*,
      coalesce((
        select sum(match.elo_change)::integer
        from public.matches match
        where match.user_id::text = profile."supabaseId"
          and match.status = 'completed'
          and coalesce(match.completed_at, match.created_at) >= now() - interval '7 days'
      ), 0) as calculated_elo_gain_7d
    from public.profiles profile
    where (profile.is_banned = false or profile.is_banned is null)
      and profile.username is not null
      and coalesce(profile."gamesPlayed", 0) >= 5
      and not (
        coalesce(profile.is_admin, false)
        or coalesce(profile.is_moderator, false)
        or coalesce(profile.is_streamer, false)
      )
      and not exists (
        select 1
        from public.flagged_account_reviews review
        where review.profile_id = profile.id
          and review.action = 'dismissed'
      )
  )
  select
    stats.id::text,
    coalesce(stats.username, 'Unbekannt'),
    coalesce(stats.elo, 0)::integer,
    coalesce(stats."gamesPlayed", 0)::integer,
    coalesce(stats.wins, 0)::integer,
    case
      when coalesce(stats."gamesPlayed", 0) > 0
        then round((coalesce(stats.wins, 0)::numeric / stats."gamesPlayed"::numeric) * 100, 1)
      else 0::numeric
    end,
    stats.calculated_elo_gain_7d,
    coalesce(extract(day from (now() - stats.created_at))::integer, 999),
    array_remove(array[
      case when coalesce(stats."gamesPlayed", 0) >= 10 and coalesce(stats.wins, 0)::numeric / nullif(stats."gamesPlayed", 0) >= 0.85 then 'Hohe Winrate (≥85%)' end,
      case when coalesce(stats."gamesPlayed", 0) >= 15 and coalesce(stats.wins, 0)::numeric / nullif(stats."gamesPlayed", 0) >= 0.90 then 'Extremer Win-Streak (≥90%)' end,
      case when coalesce(stats.elo, 0) >= 1200 and stats.created_at is not null and extract(day from (now() - stats.created_at)) < 14 then 'Neuer Account in High-Elo' end,
      case when stats.calculated_elo_gain_7d >= 200 then 'Schneller Elo-Anstieg (+200 / 7T)' end
    ], null)
  from player_stats stats
  where (coalesce(stats."gamesPlayed", 0) >= 10 and coalesce(stats.wins, 0)::numeric / nullif(stats."gamesPlayed", 0) >= 0.85)
     or (coalesce(stats.elo, 0) >= 1200 and stats.created_at is not null and extract(day from (now() - stats.created_at)) < 14)
     or stats.calculated_elo_gain_7d >= 200
  order by stats.calculated_elo_gain_7d desc, stats.elo desc;
end;
$$;
revoke all on function public.mod_get_flagged_players() from public, anon;
grant execute on function public.mod_get_flagged_players() to authenticated;

commit;
