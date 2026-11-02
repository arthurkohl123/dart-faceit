-- Moderators need a safe spectator path into currently live matchrooms.  Keep
-- role labels authoritative: chat clients may only submit plain text, while the
-- database derives the sender name and the staff badge from the logged-in user.

alter table public.match_messages
  add column if not exists staff_role text;

alter table public.match_messages
  drop constraint if exists match_messages_staff_role_check;

alter table public.match_messages
  add constraint match_messages_staff_role_check
  check (staff_role is null or staff_role in ('moderator', 'admin'));

-- Preserve the visual context of existing staff messages. New messages below
-- receive their role exclusively in send_match_message().
update public.match_messages message
set staff_role = coalesce(
  (
    select case
      when profile.is_admin then 'admin'
      when profile.is_moderator then 'moderator'
      else null
    end
    from public.profiles profile
    where profile."supabaseId" = message.user_id::text
  ),
  case when message.is_admin_message then 'admin' else null end
)
where message.staff_role is null
  and message.is_admin_message = true;

-- A moderator may inspect a room only while it is in the live monitor. Admins
-- retain their existing access to every room for escalation work.
drop policy if exists "Active matches readable by participants or admins" on public.active_matches;
drop policy if exists "Active matches readable by participants or staff" on public.active_matches;

create policy "Active matches readable by participants or staff"
on public.active_matches
for select
to authenticated
using (
  (select auth.uid()) = player1_id
  or (select auth.uid()) = player2_id
  or exists (
    select 1
    from public.profiles profile
    where profile."supabaseId" = (select auth.uid())::text
      and profile.is_admin = true
  )
  or (
    status in ('pending_result', 'awaiting_confirmation', 'disputed')
    and exists (
      select 1
      from public.profiles profile
      where profile."supabaseId" = (select auth.uid())::text
        and profile.is_moderator = true
    )
  )
);

-- The legacy browser insert accepted is_admin_message and username from the
-- client. Keep it working during the rolling deploy, but overwrite those
-- fields inside PostgreSQL so neither identity nor staff label can be forged.
drop policy if exists match_messages_insert on public.match_messages;

create or replace function public.set_match_message_sender_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_username text;
  v_is_admin boolean := false;
  v_is_moderator boolean := false;
begin
  if v_actor_id is null or new.user_id is distinct from v_actor_id then
    raise exception 'Ungültiger Chat-Absender.';
  end if;

  select
    nullif(btrim(profile.username), ''),
    coalesce(profile.is_admin, false),
    coalesce(profile.is_moderator, false)
  into v_username, v_is_admin, v_is_moderator
  from public.profiles profile
  where profile."supabaseId" = v_actor_id::text;

  if not found then
    raise exception 'Dein Spielerkonto wurde nicht gefunden.';
  end if;

  new.user_id := v_actor_id;
  new.username := coalesce(v_username, 'Spieler');
  new.staff_role := case
    when v_is_admin then 'admin'
    when v_is_moderator then 'moderator'
    else null
  end;
  new.is_admin_message := new.staff_role is not null;
  return new;
end;
$$;

drop trigger if exists set_match_message_sender_context on public.match_messages;
create trigger set_match_message_sender_context
before insert on public.match_messages
for each row
execute function public.set_match_message_sender_context();

create policy match_messages_insert
on public.match_messages
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    exists (
      select 1
      from public.active_matches match
      where match.id = match_messages.match_id
        and ((select auth.uid()) = match.player1_id or (select auth.uid()) = match.player2_id)
    )
    or (
      (select public.is_mod_or_admin())
      and exists (
        select 1
        from public.active_matches match
        where match.id = match_messages.match_id
          and match.status in ('pending_result', 'awaiting_confirmation', 'disputed')
      )
    )
  )
);

create or replace function public.send_match_message(
  p_match_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_content text := btrim(coalesce(p_content, ''));
  v_username text;
  v_is_admin boolean := false;
  v_is_moderator boolean := false;
  v_is_participant boolean := false;
  v_is_live boolean := false;
  v_staff_role text;
begin
  if v_actor_id is null then
    raise exception 'Bitte melde dich an, um im Matchroom zu schreiben.';
  end if;
  if p_match_id is null then
    raise exception 'Der Matchroom wurde nicht gefunden.';
  end if;
  if char_length(v_content) < 1 or char_length(v_content) > 300 then
    raise exception 'Die Nachricht muss zwischen 1 und 300 Zeichen lang sein.';
  end if;

  select
    nullif(btrim(profile.username), ''),
    coalesce(profile.is_admin, false),
    coalesce(profile.is_moderator, false)
  into v_username, v_is_admin, v_is_moderator
  from public.profiles profile
  where profile."supabaseId" = v_actor_id::text;

  if not found then
    raise exception 'Dein Spielerkonto wurde nicht gefunden.';
  end if;

  select
    (match.player1_id = v_actor_id or match.player2_id = v_actor_id),
    match.status in ('pending_result', 'awaiting_confirmation', 'disputed')
  into v_is_participant, v_is_live
  from public.active_matches match
  where match.id = p_match_id;

  if not found then
    raise exception 'Der Matchroom wurde nicht gefunden.';
  end if;

  if not v_is_participant
    and not ((v_is_admin or v_is_moderator) and v_is_live) then
    raise exception 'Du darfst in diesem Matchroom nicht schreiben.';
  end if;

  v_staff_role := case
    when v_is_admin then 'admin'
    when v_is_moderator then 'moderator'
    else null
  end;

  insert into public.match_messages (
    match_id,
    user_id,
    username,
    content,
    is_admin_message,
    staff_role
  ) values (
    p_match_id,
    v_actor_id,
    coalesce(v_username, 'Spieler'),
    v_content,
    v_staff_role is not null,
    v_staff_role
  );
end;
$$;

create or replace function public.staff_get_match_messages(p_match_id uuid)
returns table (
  id uuid,
  match_id uuid,
  user_id uuid,
  username text,
  content text,
  created_at timestamptz,
  is_admin_message boolean,
  staff_role text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_mod_or_admin() then
    raise exception 'Kein Moderator-Zugriff';
  end if;

  if not exists (
    select 1
    from public.active_matches match
    where match.id = p_match_id
      and match.status in ('pending_result', 'awaiting_confirmation', 'disputed')
  ) then
    raise exception 'Dieser Matchroom ist nicht mehr aktiv.';
  end if;

  return query
  select
    message.id,
    message.match_id,
    message.user_id,
    message.username,
    message.content,
    message.created_at,
    message.is_admin_message,
    message.staff_role
  from public.match_messages message
  where message.match_id = p_match_id
  order by message.created_at asc, message.id asc;
end;
$$;

-- Keep the legacy admin RPC private as well. The matchroom now uses the shared
-- staff RPC above, but existing tooling can still read it as an administrator.
create or replace function public.admin_get_match_messages(p_match_id uuid)
returns table (
  id uuid,
  match_id uuid,
  user_id uuid,
  username text,
  content text,
  created_at timestamptz,
  is_admin_message boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    where profile."supabaseId" = auth.uid()::text
      and profile.is_admin = true
  ) then
    raise exception 'Nur Administratoren dürfen diese Funktion aufrufen.';
  end if;

  return query
  select
    message.id,
    message.match_id,
    message.user_id,
    message.username,
    message.content,
    message.created_at,
    message.is_admin_message
  from public.match_messages message
  where message.match_id = p_match_id
  order by message.created_at asc, message.id asc;
end;
$$;

revoke all on function public.send_match_message(uuid, text) from public, anon;
revoke all on function public.staff_get_match_messages(uuid) from public, anon;
revoke all on function public.admin_get_match_messages(uuid) from public, anon;

grant execute on function public.send_match_message(uuid, text) to authenticated;
grant execute on function public.staff_get_match_messages(uuid) to authenticated;
grant execute on function public.admin_get_match_messages(uuid) to authenticated;

notify pgrst, 'reload schema';
