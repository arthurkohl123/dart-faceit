-- Make the confirmed platform visible next to public ranked history rows.
-- Platform account names remain private; this only returns the match platform.

create or replace function public.get_public_player_match_history_with_platform(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (
  id text,
  created_at timestamptz,
  completed_at timestamptz,
  opponent_name text,
  is_win boolean,
  legs_won integer,
  legs_lost integer,
  my_average numeric,
  one_eighties integer,
  app text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id::text,
    m.created_at,
    coalesce(m.completed_at, m.created_at),
    coalesce(m.opponent_name, 'Unbekannter Gegner'),
    coalesce(m.is_win, false),
    coalesce(m.legs_won, 0),
    coalesce(m.legs_lost, 0),
    m.my_average::numeric,
    coalesce(m.one_eighties, 0),
    m.app
  from public.matches m
  join public.profiles p on p."supabaseId" = m.user_id::text
  where m.user_id = p_user_id
    and coalesce(m.match_mode, 'ranked') = 'ranked'
    and (
      coalesce(p.is_publicly_visible, true) = true
      or p."supabaseId" = auth.uid()::text
    )
  order by coalesce(m.completed_at, m.created_at) desc
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
$$;

revoke all on function public.get_public_player_match_history_with_platform(uuid, integer) from public;
grant execute on function public.get_public_player_match_history_with_platform(uuid, integer) to anon, authenticated;

comment on function public.get_public_player_match_history_with_platform(uuid, integer) is
  'Public ranked match summaries including the confirmed scoring platform.';
