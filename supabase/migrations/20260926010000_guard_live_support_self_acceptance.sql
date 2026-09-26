-- A support agent must never accept their own request. Keep the relational
-- constraint as a final safeguard, but return a useful domain error before the
-- UPDATE attempts to set agent_id = requester_id.

create or replace function public.live_support_accept_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.live_support_conversations%rowtype;
  v_agent_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.profiles profile
    where profile."supabaseId" = v_uid::text and coalesce(profile.is_admin, false) = true
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (
    select 1 from public.live_support_agents agent
    where agent.user_id = v_uid and agent.is_available = true
      and agent.last_seen_at >= now() - interval '90 seconds'
  ) then raise exception 'LIVE_SUPPORT_AGENT_OFFLINE'; end if;

  select * into v_conversation
  from public.live_support_conversations conversation
  where conversation.id = p_conversation_id and conversation.status = 'waiting'
  for update;
  if not found then raise exception 'LIVE_SUPPORT_REQUEST_NOT_AVAILABLE'; end if;
  if v_uid = v_conversation.requester_id then
    raise exception 'LIVE_SUPPORT_CANNOT_ACCEPT_OWN_REQUEST';
  end if;

  update public.live_support_conversations
  set status = 'active', agent_id = v_uid, accepted_at = now(), last_message_at = now()
  where id = v_conversation.id;

  select coalesce(profile.username, 'Support') into v_agent_name
  from public.profiles profile where profile."supabaseId" = v_uid::text;
  insert into public.notifications (user_id, type, title, body, href)
  values (
    v_conversation.requester_id,
    'live_support_assigned',
    'Live Support ist da',
    coalesce(v_agent_name, 'Ein Support-Mitarbeiter') || ' hat deine Anfrage übernommen.',
    null
  );

  return jsonb_build_object('conversation_id', v_conversation.id, 'status', 'active');
end;
$$;

revoke all on function public.live_support_accept_conversation(uuid) from public;
grant execute on function public.live_support_accept_conversation(uuid) to authenticated;
