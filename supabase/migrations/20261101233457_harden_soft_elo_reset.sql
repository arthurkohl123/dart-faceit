-- Make season resets safe even if an invitation, a dispute or a stale queue
-- entry exists. A reset must happen only while the normal ranked queue is
-- explicitly closed and every 1v1 match has reached a final state.

create or replace function public.admin_execute_soft_elo_reset(
  p_season_label text,
  p_anchor_elo integer default 1000,
  p_compression_factor numeric default 0.500,
  p_confirmation text default null
)
returns table(
  reset_id uuid,
  player_count integer,
  changed_count integer,
  average_before numeric,
  average_after numeric,
  minimum_before integer,
  maximum_before integer,
  minimum_after integer,
  maximum_after integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reset_id uuid;
  v_admin_id text := auth.uid()::text;
  v_label text := nullif(trim(coalesce(p_season_label, '')), '');
  v_player_count integer;
  v_changed_count integer;
  v_average_before numeric;
  v_average_after numeric;
  v_minimum_before integer;
  v_maximum_before integer;
  v_minimum_after integer;
  v_maximum_after integer;
  v_queue_enabled boolean;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles
    where "supabaseId" = v_admin_id and coalesce(is_admin, false) = true
  ) then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  if p_confirmation is distinct from 'SOFT RESET' then
    raise exception 'Bestätigung für den Soft Reset fehlt.';
  end if;

  if v_label is null then
    raise exception 'Bitte eine Season-Bezeichnung angeben.';
  end if;

  if p_anchor_elo < 500 or p_anchor_elo > 2000 then
    raise exception 'Der Elo-Anker muss zwischen 500 und 2000 liegen.';
  end if;

  if p_compression_factor <= 0 or p_compression_factor > 1 then
    raise exception 'Der Kompressionsfaktor muss größer 0 und höchstens 1 sein.';
  end if;

  select coalesce((value ->> 'enabled')::boolean, true)
  into v_queue_enabled
  from public.app_settings
  where key = 'matchmaking_queue';

  if coalesce(v_queue_enabled, true) then
    raise exception 'Der Soft Reset ist nur bei geschlossener Ranked-Queue möglich.';
  end if;

  if exists (select 1 from public.matchmaking_queue) then
    raise exception 'Der Soft Reset ist gesperrt, solange Spieler in der Ranked-Queue warten.';
  end if;

  if exists (
    select 1 from public.active_matches
    where coalesce(status, '') not in ('completed', 'cancelled', 'expired')
  ) then
    raise exception 'Der Soft Reset ist gesperrt, solange Ranked-Matches laufen.';
  end if;

  lock table public.profiles in share row exclusive mode;

  if exists (
    select 1 from public.elo_season_resets
    where lower(season_label) = lower(v_label)
  ) then
    raise exception 'Für diese Season wurde bereits ein Reset angelegt.';
  end if;

  select
    count(*)::integer,
    round(avg(coalesce(elo, p_anchor_elo)), 2),
    min(coalesce(elo, p_anchor_elo))::integer,
    max(coalesce(elo, p_anchor_elo))::integer
  into v_player_count, v_average_before, v_minimum_before, v_maximum_before
  from public.profiles;

  insert into public.elo_season_resets (
    season_label, anchor_elo, compression_factor, player_count,
    average_before, minimum_before, maximum_before, executed_by
  ) values (
    v_label, p_anchor_elo, p_compression_factor, v_player_count,
    v_average_before, v_minimum_before, v_maximum_before, v_admin_id
  )
  returning id into v_reset_id;

  insert into public.elo_season_reset_entries (
    reset_id, profile_id, supabase_id, username, elo_before, elo_after
  )
  select
    v_reset_id,
    p.id,
    p."supabaseId",
    p.username,
    coalesce(p.elo, p_anchor_elo),
    round(p_anchor_elo + ((coalesce(p.elo, p_anchor_elo) - p_anchor_elo) * p_compression_factor))::integer
  from public.profiles p;

  update public.profiles p
  set elo = e.elo_after
  from public.elo_season_reset_entries e
  where e.reset_id = v_reset_id and e.profile_id = p.id;

  select
    (count(*) filter (where e.elo_before <> e.elo_after))::integer,
    round(avg(e.elo_after), 2),
    min(e.elo_after)::integer,
    max(e.elo_after)::integer
  into v_changed_count, v_average_after, v_minimum_after, v_maximum_after
  from public.elo_season_reset_entries e
  where e.reset_id = v_reset_id;

  update public.elo_season_resets
  set changed_count = v_changed_count,
      average_after = v_average_after,
      minimum_after = v_minimum_after,
      maximum_after = v_maximum_after
  where id = v_reset_id;

  return query select
    v_reset_id, v_player_count, v_changed_count,
    v_average_before, v_average_after,
    v_minimum_before, v_maximum_before,
    v_minimum_after, v_maximum_after;
end;
$$;

revoke all on function public.admin_execute_soft_elo_reset(text, integer, numeric, text) from public;
grant execute on function public.admin_execute_soft_elo_reset(text, integer, numeric, text) to authenticated;
