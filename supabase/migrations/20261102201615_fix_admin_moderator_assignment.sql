-- The Admin panel sends the internal profile UUID. The old RPC compared that
-- value to profiles.supabaseId, so it returned success without updating any
-- row. Use the profile primary key, reject missing targets, and keep an audit.

create or replace function public.admin_set_moderator(
  p_user_id uuid,
  p_is_mod boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_name text;
  v_target_name text;
  v_updated integer := 0;
begin
  if v_admin_id is null or not exists (
    select 1
    from public.profiles admin_profile
    where admin_profile."supabaseId" = v_admin_id::text
      and coalesce(admin_profile.is_admin, false)
  ) then
    raise exception 'Nur Admins können Moderatoren ernennen';
  end if;

  if p_user_id is null then
    raise exception 'Spieler nicht gefunden';
  end if;

  select username into v_target_name
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Spieler nicht gefunden';
  end if;

  update public.profiles
  set is_moderator = coalesce(p_is_mod, false)
  where id = p_user_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Moderator-Rolle konnte nicht gespeichert werden';
  end if;

  select username into v_admin_name
  from public.profiles
  where "supabaseId" = v_admin_id::text;

  insert into public.admin_logs (
    admin_id,
    admin_username,
    action,
    target_type,
    target_id,
    target_label,
    details
  ) values (
    v_admin_id,
    coalesce(v_admin_name, 'Admin'),
    case when coalesce(p_is_mod, false) then 'GRANT_MODERATOR_ROLE' else 'REVOKE_MODERATOR_ROLE' end,
    'profile',
    p_user_id::text,
    coalesce(v_target_name, 'Unbekannt'),
    case when coalesce(p_is_mod, false) then 'Moderator-Rolle vergeben' else 'Moderator-Rolle entfernt' end
  );
end;
$$;

revoke all on function public.admin_set_moderator(uuid, boolean) from public, anon;
grant execute on function public.admin_set_moderator(uuid, boolean) to authenticated;
