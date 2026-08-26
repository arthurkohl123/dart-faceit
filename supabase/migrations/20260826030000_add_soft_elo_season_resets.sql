-- Audited, reversible soft Elo resets for season transitions.

create table if not exists public.elo_season_resets (
  id uuid primary key default gen_random_uuid(),
  season_label text not null unique,
  anchor_elo integer not null default 1000,
  compression_factor numeric(4,3) not null default 0.500
    check (compression_factor > 0 and compression_factor <= 1),
  player_count integer not null default 0,
  changed_count integer not null default 0,
  average_before numeric(10,2),
  average_after numeric(10,2),
  minimum_before integer,
  maximum_before integer,
  minimum_after integer,
  maximum_after integer,
  executed_by text not null,
  executed_at timestamptz not null default now(),
  rolled_back_by text,
  rolled_back_at timestamptz
);

create table if not exists public.elo_season_reset_entries (
  reset_id uuid not null references public.elo_season_resets(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  supabase_id text,
  username text,
  elo_before integer not null,
  elo_after integer not null,
  primary key (reset_id, profile_id)
);

create index if not exists elo_season_reset_entries_profile_idx
  on public.elo_season_reset_entries(profile_id);

alter table public.elo_season_resets enable row level security;
alter table public.elo_season_reset_entries enable row level security;

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

  if exists (
    select 1 from public.active_matches
    where status in ('pending_result', 'awaiting_confirmation')
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

create or replace function public.admin_rollback_soft_elo_reset(
  p_reset_id uuid,
  p_confirmation text default null
)
returns table(restored_players integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id text := auth.uid()::text;
  v_restored integer;
  v_executed_at timestamptz;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles
    where "supabaseId" = v_admin_id and coalesce(is_admin, false) = true
  ) then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  if p_confirmation is distinct from 'ROLLBACK' then
    raise exception 'Bestätigung für den Rollback fehlt.';
  end if;

  select executed_at into v_executed_at
  from public.elo_season_resets
  where id = p_reset_id and rolled_back_at is null
  for update;

  if not found then
    raise exception 'Aktiver Reset nicht gefunden.';
  end if;

  if exists (
    select 1 from public.elo_season_resets
    where executed_at > v_executed_at and rolled_back_at is null
  ) then
    raise exception 'Nur der neueste aktive Reset kann zurückgerollt werden.';
  end if;

  if exists (
    select 1
    from public.elo_season_reset_entries e
    join public.profiles p on p.id = e.profile_id
    where e.reset_id = p_reset_id and p.elo is distinct from e.elo_after
  ) then
    raise exception 'Seit dem Reset wurden Elo-Werte verändert. Automatischer Rollback wurde zum Schutz abgebrochen.';
  end if;

  update public.profiles p
  set elo = e.elo_before
  from public.elo_season_reset_entries e
  where e.reset_id = p_reset_id and e.profile_id = p.id;

  get diagnostics v_restored = row_count;

  update public.elo_season_resets
  set rolled_back_at = now(), rolled_back_by = v_admin_id
  where id = p_reset_id;

  return query select v_restored;
end;
$$;

revoke all on function public.admin_execute_soft_elo_reset(text, integer, numeric, text) from public;
revoke all on function public.admin_rollback_soft_elo_reset(uuid, text) from public;
grant execute on function public.admin_execute_soft_elo_reset(text, integer, numeric, text) to authenticated;
grant execute on function public.admin_rollback_soft_elo_reset(uuid, text) to authenticated;

comment on function public.admin_execute_soft_elo_reset(text, integer, numeric, text) is
  'Creates an audited season snapshot and compresses every profile Elo toward the configured anchor.';
