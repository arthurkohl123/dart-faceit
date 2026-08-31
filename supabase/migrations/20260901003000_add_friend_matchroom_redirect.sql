-- Lets the global UI discover a freshly accepted direct challenge and take
-- both players into the same private result room without an extra click.
create or replace function public.get_ready_friend_matchroom()
returns table (
  match_id uuid,
  best_of integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  return query
  select challenge.active_match_id, challenge.best_of
  from public.friend_challenges challenge
  join public.active_matches match_room on match_room.id = challenge.active_match_id
  where challenge.status = 'accepted'
    and v_uid in (challenge.challenger_id, challenge.challenged_id)
    and challenge.responded_at >= now() - interval '10 minutes'
    and match_room.status in ('pending_result', 'awaiting_confirmation', 'disputed')
  order by challenge.responded_at desc
  limit 1;
end;
$$;

revoke all on function public.get_ready_friend_matchroom() from public;
grant execute on function public.get_ready_friend_matchroom() to authenticated;
