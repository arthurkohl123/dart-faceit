-- Public profile history without exposing the protected active_matches table.
create or replace function public.get_public_player_match_history(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (
  id text,
  created_at timestamptz,
  opponent_name text,
  is_win boolean,
  legs_won integer,
  legs_lost integer,
  my_average numeric,
  one_eighties integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id::text,
    m.created_at,
    coalesce(m.opponent_name, 'Unbekannter Gegner'),
    coalesce(m.is_win, false),
    coalesce(m.legs_won, 0),
    coalesce(m.legs_lost, 0),
    m.my_average::numeric,
    coalesce(m.one_eighties, 0)
  from public.matches m
  join public.profiles p on p."supabaseId" = m.user_id::text
  where m.user_id = p_user_id
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
$$;

revoke all on function public.get_public_player_match_history(uuid, integer) from public;
grant execute on function public.get_public_player_match_history(uuid, integer) to anon, authenticated;

comment on function public.get_public_player_match_history(uuid, integer) is
  'Returns at most 20 public result summaries for a player profile.';
