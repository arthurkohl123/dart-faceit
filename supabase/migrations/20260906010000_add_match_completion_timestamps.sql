-- A match row is written when its result has been confirmed. Store that exact
-- event time explicitly so all profile and history surfaces can label it
-- consistently as the completion time.
alter table public.matches
  add column if not exists completed_at timestamptz;

update public.matches
set completed_at = created_at
where completed_at is null;

alter table public.matches
  alter column completed_at set default now();

create or replace function public.set_match_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.completed_at := coalesce(new.completed_at, new.created_at, now());
  return new;
end;
$$;

drop trigger if exists set_match_completed_at_before_insert on public.matches;
create trigger set_match_completed_at_before_insert
before insert on public.matches
for each row execute function public.set_match_completed_at();

create index if not exists matches_completed_at_idx
  on public.matches (user_id, completed_at desc);

create or replace function public.get_public_player_match_history(
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
    coalesce(m.completed_at, m.created_at),
    coalesce(m.opponent_name, 'Unbekannter Gegner'),
    coalesce(m.is_win, false),
    coalesce(m.legs_won, 0),
    coalesce(m.legs_lost, 0),
    m.my_average::numeric,
    coalesce(m.one_eighties, 0)
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

grant execute on function public.get_public_player_match_history(uuid, integer) to anon, authenticated;
