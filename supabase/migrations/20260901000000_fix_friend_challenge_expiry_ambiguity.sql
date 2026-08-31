-- The RETURNS TABLE field expires_at is a PL/pgSQL variable. Qualify the
-- source column in the expiry cleanup so Postgres cannot confuse the two.
create or replace function public.list_my_friend_challenges()
returns table(
  challenge_id uuid,
  direction text,
  user_id uuid,
  username text,
  app text,
  best_of integer,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  update public.friend_challenges as challenge
  set status = 'expired', responded_at = now()
  where challenge.status = 'pending'
    and challenge.expires_at <= now()
    and v_uid in (challenge.challenger_id, challenge.challenged_id);

  return query
  select
    challenge.id,
    case when challenge.challenged_id = v_uid then 'incoming' else 'outgoing' end,
    case when challenge.challenged_id = v_uid then challenge.challenger_id else challenge.challenged_id end,
    coalesce(profile.username, 'Spieler'),
    challenge.app,
    challenge.best_of,
    challenge.expires_at,
    challenge.created_at
  from public.friend_challenges as challenge
  join public.profiles as profile on profile."supabaseId" =
    (case when challenge.challenged_id = v_uid then challenge.challenger_id else challenge.challenged_id end)::text
  where challenge.status = 'pending'
    and challenge.expires_at > now()
    and v_uid in (challenge.challenger_id, challenge.challenged_id)
  order by challenge.expires_at asc;
end;
$$;

revoke all on function public.list_my_friend_challenges() from public;
grant execute on function public.list_my_friend_challenges() to authenticated;
