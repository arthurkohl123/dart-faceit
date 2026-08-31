-- Public aggregated performance stats. Individual match rows remain private
-- under RLS; this function exposes only values already displayed on player cards.
create or replace function public.get_public_player_statistics(p_user_ids uuid[])
returns table (
  user_id uuid,
  average numeric,
  best_average numeric,
  total_180s bigint,
  match_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    round(avg(m.my_average)::numeric, 2) as average,
    round(max(m.my_average)::numeric, 2) as best_average,
    coalesce(sum(m.one_eighties), 0)::bigint as total_180s,
    count(*)::bigint as match_count
  from public.matches m
  join public.profiles p on p."supabaseId" = m.user_id::text
  where m.user_id = any(p_user_ids)
  group by m.user_id;
$$;

revoke all on function public.get_public_player_statistics(uuid[]) from public;
grant execute on function public.get_public_player_statistics(uuid[]) to anon, authenticated;

comment on function public.get_public_player_statistics(uuid[]) is
  'Returns public aggregate match statistics without exposing protected match rows.';
