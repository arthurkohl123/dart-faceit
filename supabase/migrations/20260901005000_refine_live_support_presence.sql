-- A conversation-specific status lookup lets a client keep a just-closed chat
-- open long enough to clearly tell the player that support has ended it.
create or replace function public.live_support_get_conversation_state(p_conversation_id uuid)
returns table (
  status text,
  agent_username text,
  closed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.live_support_conversations%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_conversation
  from public.live_support_conversations conversation
  where conversation.id = p_conversation_id;
  if not found then raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_FOUND'; end if;
  if v_uid <> v_conversation.requester_id and v_uid <> v_conversation.agent_id then
    raise exception 'LIVE_SUPPORT_ACCESS_DENIED';
  end if;

  return query
  select v_conversation.status, profile.username, v_conversation.closed_at
  from (select 1) source
  left join public.profiles profile on profile."supabaseId" = v_conversation.agent_id::text;
end;
$$;

revoke all on function public.live_support_get_conversation_state(uuid) from public;
grant execute on function public.live_support_get_conversation_state(uuid) to authenticated;
