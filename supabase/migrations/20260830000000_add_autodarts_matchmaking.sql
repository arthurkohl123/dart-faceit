-- Add AutoDarts as a first-class ranked matchmaking platform.
-- Existing Scolia and DartCounter data remains unchanged.

alter table public.profiles
  add column if not exists autodarts_username text;

-- Older installations may have an app check constraint created outside the
-- tracked migrations. Replace only checks that explicitly restrict the known
-- platform values, then add a stable constraint name for future migrations.
do $$
declare
  v_table regclass;
  v_constraint text;
begin
  foreach v_table in array array['public.matchmaking_queue'::regclass, 'public.active_matches'::regclass]
  loop
    for v_constraint in
      select conname
      from pg_constraint
      where conrelid = v_table
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%app%'
        and pg_get_constraintdef(oid) ilike '%scolia%'
        and pg_get_constraintdef(oid) ilike '%dartcounter%'
    loop
      execute format('alter table %s drop constraint %I', v_table, v_constraint);
    end loop;
  end loop;
end;
$$;

alter table public.matchmaking_queue
  drop constraint if exists ranked_matchmaking_queue_app_check,
  add constraint ranked_matchmaking_queue_app_check
    check (app in ('scolia', 'dartcounter', 'autodarts'));

alter table public.active_matches
  drop constraint if exists ranked_active_matches_app_check,
  add constraint ranked_active_matches_app_check
    check (app is null or app in ('scolia', 'dartcounter', 'autodarts'));

create or replace function public.update_platform_usernames(
  p_scolia_username text,
  p_dartcounter_username text,
  p_autodarts_username text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_scolia text := nullif(btrim(coalesce(p_scolia_username, '')), '');
  v_dartcounter text := nullif(btrim(coalesce(p_dartcounter_username, '')), '');
  v_autodarts text := nullif(btrim(coalesce(p_autodarts_username, '')), '');
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(char_length(v_scolia), 0) > 100
    or coalesce(char_length(v_dartcounter), 0) > 100
    or coalesce(char_length(v_autodarts), 0) > 100 then
    raise exception 'PLATFORM_USERNAME_TOO_LONG';
  end if;

  update public.profiles
  set scolia_username = v_scolia,
      dartcounter_username = v_dartcounter,
      autodarts_username = v_autodarts
  where "supabaseId" = v_uid::text;

  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.update_platform_usernames(text, text, text) from public;
grant execute on function public.update_platform_usernames(text, text, text) to authenticated;

-- The result room needs only the platform names for its two participants.
-- Keep profile records private rather than broadening the public profile view.
create or replace function public.get_match_platform_usernames(p_match_id uuid)
returns table(
  player1_scolia_username text,
  player1_dartcounter_username text,
  player1_autodarts_username text,
  player2_scolia_username text,
  player2_dartcounter_username text,
  player2_autodarts_username text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if not exists (
    select 1
    from public.active_matches m
    where m.id = p_match_id
      and (
        v_uid in (m.player1_id, m.player2_id)
        or exists (
          select 1 from public.profiles me
          where me."supabaseId" = v_uid::text and coalesce(me.is_admin, false)
        )
      )
  ) then
    raise exception 'MATCH_NOT_FOUND_OR_FORBIDDEN';
  end if;

  return query
  select p1.scolia_username, p1.dartcounter_username, p1.autodarts_username,
         p2.scolia_username, p2.dartcounter_username, p2.autodarts_username
  from public.active_matches m
  left join public.profiles p1 on p1."supabaseId" = m.player1_id::text
  left join public.profiles p2 on p2."supabaseId" = m.player2_id::text
  where m.id = p_match_id;
end;
$$;

revoke all on function public.get_match_platform_usernames(uuid) from public;
grant execute on function public.get_match_platform_usernames(uuid) to authenticated;

-- Keep the queue gate authoritative on the server: AutoDarts requires an
-- AutoDarts name just like the two established platforms.
create or replace function public.check_and_join_queue(p_max_elo_diff integer, p_app text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result json;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_app not in ('scolia', 'dartcounter', 'autodarts') then raise exception 'INVALID_MATCHMAKING_PLATFORM'; end if;
  if p_max_elo_diff not between 25 and 500 then raise exception 'INVALID_ELO_RANGE'; end if;

  update public.active_matches
  set status = 'cancelled', updated_at = now()
  where status = 'pending_accept'
    and accept_deadline is not null
    and accept_deadline <= now()
    and (player1_id = v_uid or player2_id = v_uid);

  perform public.cleanup_cancelled_active_matches(0);

  if exists (select 1 from public.profiles where "supabaseId" = v_uid::text and is_banned = true) then
    raise exception 'ACCOUNT_BANNED';
  end if;
  if p_app = 'scolia' and not exists (
    select 1 from public.profiles where "supabaseId" = v_uid::text and nullif(trim(scolia_username), '') is not null
  ) then raise exception 'SCOLIA_USERNAME_REQUIRED'; end if;
  if p_app = 'dartcounter' and not exists (
    select 1 from public.profiles where "supabaseId" = v_uid::text and nullif(trim(dartcounter_username), '') is not null
  ) then raise exception 'DARTCOUNTER_USERNAME_REQUIRED'; end if;
  if p_app = 'autodarts' and not exists (
    select 1 from public.profiles where "supabaseId" = v_uid::text and nullif(trim(autodarts_username), '') is not null
  ) then raise exception 'AUTODARTS_USERNAME_REQUIRED'; end if;

  if exists (
    select 1 from public.active_matches
    where (player1_id = v_uid or player2_id = v_uid)
      and status in ('pending_accept', 'pending_result', 'awaiting_confirmation', 'disputed')
  ) then raise exception 'ACTIVE_MATCH_EXISTS'; end if;

  select public.find_or_create_match(p_max_elo_diff, p_app) into v_result;
  return v_result;
end;
$$;

revoke all on function public.check_and_join_queue(integer, text) from public;
grant execute on function public.check_and_join_queue(integer, text) to authenticated;

-- Match history is populated by the secure result-finalisation function.
-- This trigger preserves the selected platform for all present and future rows.
create or replace function public.copy_match_platform_to_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.app is null and new.active_match_id is not null then
    select app into new.app from public.active_matches where id = new.active_match_id;
  end if;
  return new;
end;
$$;

drop trigger if exists copy_match_platform_to_history_trigger on public.matches;
create trigger copy_match_platform_to_history_trigger
before insert on public.matches
for each row execute function public.copy_match_platform_to_history();
