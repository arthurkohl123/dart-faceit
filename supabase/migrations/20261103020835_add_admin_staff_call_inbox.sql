-- The player-facing call button already notifies online staff. This read-only
-- inbox gives admins one durable place to triage calls that are still tied to
-- an active matchroom. Direct table access remains unavailable to browser roles.
create or replace function public.admin_list_matchroom_staff_calls(p_limit integer default 12)
returns table (
  id uuid,
  match_id uuid,
  requester_username text,
  player1_username text,
  player2_username text,
  match_status text,
  requested_at timestamptz,
  notified_staff_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 50));
begin
  perform public.admin_require_operations_access('admin');

  return query
  select
    staff_call.id,
    staff_call.match_id,
    coalesce(nullif(btrim(requester.username), ''), 'Spieler') as requester_username,
    coalesce(matchroom.player1_username, 'Spieler 1') as player1_username,
    coalesce(matchroom.player2_username, 'Spieler 2') as player2_username,
    matchroom.status as match_status,
    staff_call.requested_at,
    staff_call.notified_staff_count::integer
  from public.matchroom_staff_calls staff_call
  join public.active_matches matchroom on matchroom.id = staff_call.match_id
  left join public.profiles requester on requester."supabaseId" = staff_call.requester_id::text
  where matchroom.status in ('pending_result', 'awaiting_confirmation', 'disputed')
  order by staff_call.requested_at desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_list_matchroom_staff_calls(integer) from public, anon;
grant execute on function public.admin_list_matchroom_staff_calls(integer) to authenticated;

comment on function public.admin_list_matchroom_staff_calls(integer) is
  'Private admin inbox for active matchroom calls for staff assistance.';
