-- Die Profile-Tabelle speichert die Supabase-Auth-ID als Text, die Match-Tabelle
-- hingegen als UUID. Der direkte Vergleich führte im Developer-Dashboard zu
-- "operator does not exist: text = uuid". Der Cast auf der UUID-Seite hält den
-- Join kompatibel mit bestehenden Profilen und behebt die Match-Übersicht.
-- Die bestehende matches-Tabelle besitzt zudem keine app-Spalte. Der Rückgabewert
-- bleibt aus API-Kompatibilitätsgründen erhalten und wird daher als NULL geliefert.
create or replace function public.dev_list_matches(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null
)
returns table(
  id uuid,
  created_at timestamptz,
  user_id uuid,
  user_name text,
  opponent_name text,
  is_win boolean,
  result text,
  legs_won integer,
  legs_lost integer,
  my_average numeric,
  highest_checkout integer,
  one_eighties integer,
  elo_change integer,
  app text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where "supabaseId" = auth.uid()::text
      and is_developer = true
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.id,
    m.created_at,
    m.user_id,
    coalesce(p.scolia_username, p.dartcounter_username, '—') as user_name,
    m.opponent_name,
    m.is_win,
    m.result,
    m.legs_won,
    m.legs_lost,
    m.my_average,
    m.highest_checkout,
    m.one_eighties,
    m.elo_change,
    null::text as app
  from public.matches m
  left join public.profiles p on p."supabaseId" = m.user_id::text
  where
    p_search is null
    or m.opponent_name ilike '%' || p_search || '%'
    or p.scolia_username ilike '%' || p_search || '%'
    or p.dartcounter_username ilike '%' || p_search || '%'
  order by m.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
end;
$$;

