-- Keep new double-elimination matches on an explicit path while preserving
-- legacy matches that were created with the old generic `double` stage.
create or replace function public.assign_double_elimination_bracket_stage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_format text;
  v_max_losses integer;
begin
  if new.bracket_stage is distinct from 'double' then
    return new;
  end if;

  select tournament_format into v_format
  from public.tournaments
  where id = new.tournament_id;

  if v_format <> 'double_elimination' then
    return new;
  end if;

  select greatest(
    coalesce((select losses from public.tournament_participants where tournament_id = new.tournament_id and user_id = new.player1_id), 0),
    coalesce((select losses from public.tournament_participants where tournament_id = new.tournament_id and user_id = new.player2_id), 0)
  ) into v_max_losses;

  new.bracket_stage := case when coalesce(v_max_losses, 0) > 0 then 'lower' else 'upper' end;
  return new;
end;
$$;

drop trigger if exists tournament_matches_assign_double_bracket_stage on public.tournament_matches;
create trigger tournament_matches_assign_double_bracket_stage
before insert on public.tournament_matches
for each row execute function public.assign_double_elimination_bracket_stage();

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
  player2_average numeric,
  bracket_stage text
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
    am.submitted_player2_average,
    m.bracket_stage
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
