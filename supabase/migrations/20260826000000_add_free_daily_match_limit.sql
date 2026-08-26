-- Four started Ranked matches per Berlin calendar day for free accounts.
create table if not exists public.daily_ranked_match_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  matches_started integer not null default 0 check (matches_started >= 0),
  primary key (user_id, usage_date)
);

alter table public.daily_ranked_match_usage enable row level security;

create or replace function public.get_ranked_match_daily_quota()
returns table(matches_used integer, daily_limit integer, is_premium boolean)
language sql security definer set search_path = public as $$
  select coalesce(usage.matches_started, 0)::integer,
    case when coalesce(profile."isPremium", false) then null else 4 end,
    coalesce(profile."isPremium", false)
  from public.profiles profile
  left join public.daily_ranked_match_usage usage on usage.user_id = auth.uid()
    and usage.usage_date = (now() at time zone 'Europe/Berlin')::date
  where profile."supabaseId" = auth.uid()::text;
$$;

create or replace function public.enforce_free_daily_match_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_player_id uuid; v_is_premium boolean; v_matches_started integer; v_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  -- Only normal matchmaking changes pending_accept to pending_result.
  -- Tournament matchrooms are created directly as pending_result.
  if not (old.status = 'pending_accept' and new.status = 'pending_result') then return new; end if;
  foreach v_player_id in array array[new.player1_id, new.player2_id] loop
    select coalesce("isPremium", false) into v_is_premium from public.profiles where "supabaseId" = v_player_id::text;
    if not coalesce(v_is_premium, false) then
      insert into public.daily_ranked_match_usage as usage (user_id, usage_date, matches_started)
      values (v_player_id, v_today, 1)
      on conflict (user_id, usage_date) do update set matches_started = usage.matches_started + 1 where usage.matches_started < 4
      returning matches_started into v_matches_started;
      if not found then raise exception 'DAILY_MATCH_LIMIT: Free-Nutzer können maximal 4 Ranked Matches pro Tag starten.'; end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists enforce_free_daily_match_limit_on_start on public.active_matches;
create trigger enforce_free_daily_match_limit_on_start before update of status on public.active_matches
  for each row execute function public.enforce_free_daily_match_limit();

grant execute on function public.get_ranked_match_daily_quota() to authenticated;
