-- The VPS invokes this through the protected lifecycle endpoint once per
-- minute. A tournament must stay open throughout its announced check-in
-- window; starting at starts_at would otherwise remove players who are still
-- allowed to check in for the final five minutes.
create or replace function public.auto_start_due_tournaments()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_tournament record;
  v_started integer := 0;
begin
  for v_tournament in
    select t.id
    from public.tournaments t
    where t.status = 'registration'
      and coalesce(t.check_in_closes_at, t.starts_at) <= now()
      and (
        select count(*)
        from public.tournament_participants tp
        where tp.tournament_id = t.id
          and tp.status = 'checked_in'
      ) >= 2
    order by coalesce(t.check_in_closes_at, t.starts_at), t.starts_at
    for update skip locked
  loop
    begin
      perform public.start_tournament_bracket_internal(v_tournament.id);
      v_started := v_started + 1;
    exception when others then
      -- A malformed tournament must not prevent another due tournament from
      -- starting. It remains in registration for an admin to inspect.
      raise notice 'Automatic start skipped tournament %: %', v_tournament.id, sqlerrm;
    end;
  end loop;

  return v_started;
end;
$$;

-- The two helpers create brackets and Matchrooms. They must never be callable
-- through the public browser API; the protected lifecycle route uses the
-- service role, while the manual admin function runs as the function owner.
revoke all on function public.start_tournament_bracket_internal(uuid) from public, anon, authenticated;
revoke all on function public.auto_start_due_tournaments() from public, anon, authenticated;
grant execute on function public.auto_start_due_tournaments() to service_role;
