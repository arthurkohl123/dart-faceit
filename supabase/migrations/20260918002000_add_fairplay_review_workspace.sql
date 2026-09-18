-- Internal, privacy-conscious Fair Play review workflow. It intentionally uses
-- existing account and match data only: no IP addresses, device fingerprints or
-- hidden user-facing labels are introduced.

create table if not exists public.fairplay_review_actions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  disposition text not null check (disposition in ('watchlist', 'cleared', 'warning_issued', 'restriction_recommended')),
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists fairplay_review_actions_profile_created_idx
  on public.fairplay_review_actions(profile_id, created_at desc);

alter table public.fairplay_review_actions enable row level security;
revoke all on public.fairplay_review_actions from anon, authenticated;

create or replace function public.admin_get_fairplay_review(p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not exists (
    select 1 from public.profiles me
    where me."supabaseId" = v_admin::text and coalesce(me.is_admin, false)
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  select * into v_profile
  from public.profiles
  where id::text = trim(coalesce(p_player_id, ''))
     or "supabaseId" = trim(coalesce(p_player_id, ''))
  order by ("supabaseId" = trim(coalesce(p_player_id, ''))) desc
  limit 1;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'profile_id', v_profile.id,
      'user_id', v_profile."supabaseId",
      'username', coalesce(v_profile.username, 'Unbekannt'),
      'elo', coalesce(v_profile.elo, 1000),
      'games_played', coalesce(v_profile."gamesPlayed", 0),
      'wins', coalesce(v_profile.wins, 0),
      'created_at', v_profile.created_at,
      'phone_verified', coalesce(v_profile.phone_verified, false),
      'is_banned', coalesce(v_profile.is_banned, false),
      'queue_banned_until', v_profile.queue_banned_until,
      'no_show_strikes', coalesce(v_profile.no_show_strikes, 0)
    ),
    'recent_matches', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.completed_at desc)
      from (
        select m.completed_at, coalesce(m.opponent_name, opponent.username, 'Unbekannt') as opponent_username,
               m.result, m.legs_won, m.legs_lost, m.my_average, m.elo_change, m.match_mode, m.app
        from public.matches m
        left join public.profiles opponent on opponent."supabaseId" = m.opponent_id::text
        where m.user_id::text = v_profile."supabaseId"
          and m.status = 'completed'
        order by m.completed_at desc nulls last, m.created_at desc
        limit 20
      ) item
    ), '[]'::jsonb),
    'shared_opponents', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.matches_together desc, item.last_match_at desc)
      from (
        select coalesce(m.opponent_name, opponent.username, 'Unbekannt') as opponent_username,
               m.opponent_id as opponent_user_id,
               count(*)::integer as matches_together,
               max(coalesce(m.completed_at, m.created_at)) as last_match_at,
               count(*) filter (where m.is_win)::integer as wins_against
        from public.matches m
        left join public.profiles opponent on opponent."supabaseId" = m.opponent_id::text
        where m.user_id::text = v_profile."supabaseId"
          and m.status = 'completed'
          and coalesce(m.completed_at, m.created_at) >= now() - interval '30 days'
        group by m.opponent_id, coalesce(m.opponent_name, opponent.username, 'Unbekannt')
        having count(*) >= 2
        order by count(*) desc, max(coalesce(m.completed_at, m.created_at)) desc
        limit 12
      ) item
    ), '[]'::jsonb),
    'signals', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.last_seen_at desc)
      from (
        select f.id, f.reason, f.severity, f.occurrence_count, f.context, f.first_seen_at, f.last_seen_at,
               case when f.player1_id::text = v_profile."supabaseId" then coalesce(p2.username, 'Unbekannt') else coalesce(p1.username, 'Unbekannt') end as related_username
        from public.fairness_risk_flags f
        left join public.profiles p1 on p1."supabaseId" = f.player1_id::text
        left join public.profiles p2 on p2."supabaseId" = f.player2_id::text
        where f.player1_id::text = v_profile."supabaseId" or f.player2_id::text = v_profile."supabaseId"
        order by f.last_seen_at desc
        limit 20
      ) item
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select a.id, a.disposition, a.note, a.created_at, coalesce(admin.username, 'Admin') as admin_username
        from public.fairplay_review_actions a
        left join public.profiles admin on admin."supabaseId" = a.created_by::text
        where a.profile_id = v_profile.id
        order by a.created_at desc
        limit 20
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_record_fairplay_review(
  p_player_id text,
  p_disposition text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_admin uuid := auth.uid();
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  v_disposition text := lower(trim(coalesce(p_disposition, '')));
begin
  if v_admin is null or not exists (
    select 1 from public.profiles me
    where me."supabaseId" = v_admin::text and coalesce(me.is_admin, false)
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;
  if v_disposition not in ('watchlist', 'cleared', 'warning_issued', 'restriction_recommended') then
    raise exception 'INVALID_FAIRPLAY_DISPOSITION';
  end if;

  select * into v_profile
  from public.profiles
  where id::text = trim(coalesce(p_player_id, ''))
     or "supabaseId" = trim(coalesce(p_player_id, ''))
  order by ("supabaseId" = trim(coalesce(p_player_id, ''))) desc
  limit 1
  for update;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into public.fairplay_review_actions(profile_id, disposition, note, created_by)
  values (v_profile.id, v_disposition, v_note, v_admin);

  insert into public.admin_logs(admin_id, admin_username, action, target_type, target_id, target_label, details)
  values (
    v_admin,
    coalesce((select username from public.profiles where "supabaseId" = v_admin::text), 'Admin'),
    'FAIRPLAY_REVIEW_' || upper(v_disposition),
    'PLAYER',
    v_profile.id::text,
    coalesce(v_profile.username, 'Unbekannt'),
    coalesce(v_note, 'Keine Notiz hinterlegt.')
  );

  return jsonb_build_object('profile_id', v_profile.id, 'disposition', v_disposition, 'recorded_at', now());
end;
$$;

-- Replaces the earlier placeholder Elo change with a real seven-day calculation.
-- It remains an internal hint, never an automatic punishment.
create or replace function public.get_flagged_players()
returns table(id text, username text, elo integer, "gamesPlayed" integer, wins integer, winrate numeric, elo_gain_7d integer, account_age_days integer, flags text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where "supabaseId" = auth.uid()::text and coalesce(is_admin, false)
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  return query
  with player_stats as (
    select p.*, coalesce((
      select sum(m.elo_change)::integer
      from public.matches m
      where m.user_id::text = p."supabaseId"
        and m.status = 'completed'
        and coalesce(m.completed_at, m.created_at) >= now() - interval '7 days'
    ), 0) as calculated_elo_gain_7d
    from public.profiles p
    where (p.is_banned = false or p.is_banned is null)
      and p.username is not null
      and coalesce(p."gamesPlayed", 0) >= 5
  )
  select s.id::text,
         coalesce(s.username, 'Unbekannt'),
         coalesce(s.elo, 0)::integer,
         coalesce(s."gamesPlayed", 0)::integer,
         coalesce(s.wins, 0)::integer,
         case when coalesce(s."gamesPlayed", 0) > 0 then round((coalesce(s.wins, 0)::numeric / s."gamesPlayed"::numeric) * 100, 1) else 0::numeric end,
         s.calculated_elo_gain_7d,
         coalesce(extract(day from (now() - s.created_at))::integer, 999),
         array_remove(array[
           case when coalesce(s."gamesPlayed", 0) >= 10 and coalesce(s.wins, 0)::numeric / nullif(s."gamesPlayed", 0) >= 0.85 then 'Hohe Winrate (≥85%)' end,
           case when coalesce(s."gamesPlayed", 0) >= 15 and coalesce(s.wins, 0)::numeric / nullif(s."gamesPlayed", 0) >= 0.90 then 'Extremer Win-Streak (≥90%)' end,
           case when coalesce(s.elo, 0) >= 1200 and s.created_at is not null and extract(day from (now() - s.created_at)) < 14 then 'Neuer Account in High-Elo' end,
           case when s.calculated_elo_gain_7d >= 200 then 'Schneller Elo-Anstieg (+200 / 7T)' end
         ], null)
  from player_stats s
  where (coalesce(s."gamesPlayed", 0) >= 10 and coalesce(s.wins, 0)::numeric / nullif(s."gamesPlayed", 0) >= 0.85)
     or (coalesce(s.elo, 0) >= 1200 and s.created_at is not null and extract(day from (now() - s.created_at)) < 14)
     or s.calculated_elo_gain_7d >= 200
  order by s.calculated_elo_gain_7d desc, s.elo desc;
end;
$$;

revoke all on function public.admin_get_fairplay_review(text) from public;
revoke all on function public.admin_record_fairplay_review(text, text, text) from public;
revoke all on function public.get_flagged_players() from public;
grant execute on function public.admin_get_fairplay_review(text) to authenticated;
grant execute on function public.admin_record_fairplay_review(text, text, text) to authenticated;
grant execute on function public.get_flagged_players() to authenticated;
