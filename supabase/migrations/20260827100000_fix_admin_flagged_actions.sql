-- Admin operations for fairness flags.
-- The browser must never write privileged profile fields directly. These
-- security-definer RPCs resolve both the profile UUID and the auth UUID/text
-- used by the legacy anti-smurf query.

create table if not exists public.flagged_account_reviews (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  action text not null check (action in ('dismissed', 'reopened')),
  reason text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);

create index if not exists flagged_account_reviews_action_idx
  on public.flagged_account_reviews(action, reviewed_at desc);

alter table public.flagged_account_reviews enable row level security;
revoke all on table public.flagged_account_reviews from anon, authenticated;

create or replace function public.admin_set_player_ban(
  p_player_id text,
  p_is_banned boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if v_admin is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.profiles
    where "supabaseId" = v_admin::text and coalesce(is_admin, false) = true
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;
  if nullif(trim(coalesce(p_player_id, '')), '') is null then
    raise exception 'PLAYER_REQUIRED';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id::text = trim(p_player_id)
     or p."supabaseId" = trim(p_player_id)
  order by (p."supabaseId" = trim(p_player_id)) desc
  limit 1
  for update;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_profile.id::text = (select id::text from public.profiles where "supabaseId" = v_admin::text limit 1) then
    raise exception 'SELF_BAN_NOT_ALLOWED';
  end if;

  update public.profiles
  set is_banned = coalesce(p_is_banned, false),
      ban_reason = case when coalesce(p_is_banned, false) then v_reason else null end
  where id = v_profile.id;

  return jsonb_build_object(
    'profile_id', v_profile.id,
    'supabase_id', v_profile."supabaseId",
    'is_banned', coalesce(p_is_banned, false)
  );
end;
$$;

revoke all on function public.admin_set_player_ban(text, boolean, text) from public;
grant execute on function public.admin_set_player_ban(text, boolean, text) to authenticated;

create or replace function public.admin_dismiss_flagged_player(
  p_player_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_admin is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.profiles
    where "supabaseId" = v_admin::text and coalesce(is_admin, false) = true
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id::text = trim(p_player_id)
     or p."supabaseId" = trim(p_player_id)
  order by (p."supabaseId" = trim(p_player_id)) desc
  limit 1;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into public.flagged_account_reviews(profile_id, action, reason, reviewed_by)
  values (v_profile.id, 'dismissed', nullif(left(trim(coalesce(p_reason, '')), 500), ''), v_admin)
  on conflict (profile_id) do update
    set action = 'dismissed',
        reason = excluded.reason,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = now();

  return jsonb_build_object('profile_id', v_profile.id, 'action', 'dismissed');
end;
$$;

revoke all on function public.admin_dismiss_flagged_player(text, text) from public;
grant execute on function public.admin_dismiss_flagged_player(text, text) to authenticated;

create or replace function public.admin_restore_flagged_player(p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_admin is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.profiles
    where "supabaseId" = v_admin::text and coalesce(is_admin, false) = true
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.id::text = trim(p_player_id)
     or p."supabaseId" = trim(p_player_id)
  order by (p."supabaseId" = trim(p_player_id)) desc
  limit 1;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  delete from public.flagged_account_reviews where profile_id = v_profile_id;
  return jsonb_build_object('profile_id', v_profile_id, 'action', 'reopened');
end;
$$;

revoke all on function public.admin_restore_flagged_player(text) from public;
grant execute on function public.admin_restore_flagged_player(text) to authenticated;

create or replace function public.admin_get_flagged_dismissals()
returns table(profile_id text, supabase_id text, username text)
language sql
security definer
set search_path = public
as $$
  select r.profile_id::text, p."supabaseId"::text, p.username
  from public.flagged_account_reviews r
  join public.profiles p on p.id = r.profile_id
  where r.action = 'dismissed'
    and exists (
      select 1 from public.profiles me
      where me."supabaseId" = auth.uid()::text and coalesce(me.is_admin, false) = true
    );
$$;

revoke all on function public.admin_get_flagged_dismissals() from public;
grant execute on function public.admin_get_flagged_dismissals() to authenticated;
