-- Moderators may complete a harmless account-hint review, but do not gain
-- access to bans or any other admin-only account controls. The review uses
-- the existing private review ledger so the Admin panel and Mod panel agree
-- on which hint has already been checked.

create or replace function public.mod_clear_flagged_player(
  p_player_id uuid,
  p_note text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_player_name text;
  v_note text := left(btrim(coalesce(p_note, '')), 500);
begin
  if v_actor_id is null or not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;
  if char_length(v_note) < 3 then
    raise exception 'Für den Prüfabschluss wird eine kurze interne Notiz benötigt';
  end if;

  select username into v_actor_name
  from public.profiles
  where "supabaseId" = v_actor_id::text;

  select username into v_player_name
  from public.profiles
  where id = p_player_id
  for update;

  if not found then
    raise exception 'Spieler nicht gefunden';
  end if;

  insert into public.flagged_account_reviews (profile_id, action, reason, reviewed_by)
  values (p_player_id, 'dismissed', v_note, v_actor_id)
  on conflict (profile_id) do update
    set action = 'dismissed',
        reason = excluded.reason,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = now();

  insert into public.moderator_logs (mod_id, mod_username, action, target_type, target_id, target_label, details)
  values (
    v_actor_id,
    coalesce(v_actor_name, 'Moderator'),
    'clear_flagged_player',
    'profile',
    p_player_id::text,
    v_player_name,
    'Unauffällig geprüft: ' || v_note
  );

  return json_build_object('status', 'success', 'message', 'Prüfung als unauffällig abgeschlossen.');
end;
$$;

-- Use the private review ledger to prevent completed benign checks from
-- immediately returning to the shared moderator queue.
create or replace function public.mod_get_flagged_players()
returns table (
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
set search_path = ''
as $$
begin
  if not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
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
      and not exists (
        select 1
        from public.flagged_account_reviews review
        where review.profile_id = p.id
          and review.action = 'dismissed'
      )
  )
  select
    s.id::text,
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

revoke all on function public.mod_clear_flagged_player(uuid, text) from public, anon;
grant execute on function public.mod_clear_flagged_player(uuid, text) to authenticated;
