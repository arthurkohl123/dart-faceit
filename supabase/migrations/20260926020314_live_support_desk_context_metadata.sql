-- Keep the staff desk's context payload complete while continuing to expose it
-- only through an authenticated, admin-checked RPC.
create or replace function public.live_support_admin_get_context(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_requester uuid;
  v_conversation record;
  v_profile record;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.live_support_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select c.requester_id, c.category, c.priority, c.tags, c.status, c.created_at
    into v_conversation
  from public.live_support_conversations c
  where c.id = p_conversation_id;

  if v_conversation.requester_id is null then
    raise exception 'LIVE_SUPPORT_CONVERSATION_NOT_FOUND';
  end if;
  v_requester := v_conversation.requester_id;

  select p.username, p.elo, p."gamesPlayed" as games_played, p.wins, p.created_at,
         p."isPremium" as is_premium, p.is_banned, p.scolia_username,
         p.dartcounter_username, p.autodarts_username
    into v_profile
  from public.profiles p
  where p."supabaseId" = v_requester::text;

  return jsonb_build_object(
    'support', jsonb_build_object(
      'category', v_conversation.category,
      'priority', v_conversation.priority,
      'tags', v_conversation.tags,
      'status', v_conversation.status,
      'created_at', v_conversation.created_at
    ),
    'player', jsonb_build_object(
      'username', coalesce(v_profile.username, 'Spieler'),
      'elo', coalesce(v_profile.elo, 1000),
      'games_played', coalesce(v_profile.games_played, 0),
      'wins', coalesce(v_profile.wins, 0),
      'created_at', v_profile.created_at,
      'premium', coalesce(v_profile.is_premium, false),
      'banned', coalesce(v_profile.is_banned, false),
      'platforms', jsonb_build_object(
        'scolia', v_profile.scolia_username,
        'dartcounter', v_profile.dartcounter_username,
        'autodarts', v_profile.autodarts_username
      )
    ),
    'recent_matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'opponent', m.opponent_name,
        'result', m.result,
        'average', m.my_average,
        'completed_at', m.completed_at
      ) order by m.completed_at desc)
      from (
        select * from public.matches
        where user_id = v_requester
        order by completed_at desc nulls last
        limit 5
      ) m
    ), '[]'::jsonb),
    'previous_support_cases', (
      select count(*)
      from public.live_support_conversations c
      where c.requester_id = v_requester and c.id <> p_conversation_id
    )
  );
end;
$$;

revoke all on function public.live_support_admin_get_context(uuid) from public;
grant execute on function public.live_support_admin_get_context(uuid) to authenticated;
