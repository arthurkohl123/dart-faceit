-- Expose the submitted, confirmed result on the public tournament bracket.
-- The values come from the existing matchroom record, so the bracket cannot
-- disagree with the result that the two players confirmed.

drop function if exists public.get_tournament_bracket(uuid);

create function public.get_tournament_bracket(p_tournament_id uuid)
returns table (
  id uuid,
  round_number integer,
  match_number integer,
  player1_id uuid,
  player2_id uuid,
  player1_username text,
  player2_username text,
  winner_id uuid,
  winner_username text,
  status text,
  active_match_id uuid,
  player1_legs integer,
  player2_legs integer,
  player1_average numeric,
  player2_average numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.round_number,
    m.match_number,
    m.player1_id,
    m.player2_id,
    p1.username,
    p2.username,
    m.winner_id,
    winner.username,
    m.status,
    m.active_match_id,
    am.submitted_player1_legs,
    am.submitted_player2_legs,
    am.submitted_player1_average,
    am.submitted_player2_average
  from public.tournament_matches m
  left join public.profiles p1 on p1."supabaseId" = m.player1_id::text
  left join public.profiles p2 on p2."supabaseId" = m.player2_id::text
  left join public.profiles winner on winner."supabaseId" = m.winner_id::text
  left join public.active_matches am on am.id = m.active_match_id
  where m.tournament_id = p_tournament_id
  order by m.round_number, m.match_number;
$$;

revoke all on function public.get_tournament_bracket(uuid) from public;
grant execute on function public.get_tournament_bracket(uuid) to authenticated;
