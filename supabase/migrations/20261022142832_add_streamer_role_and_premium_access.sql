-- Streamers are hand-picked by an administrator.  Their status is public, but
-- the assignment history stays staff-only on the profile row and in admin_logs.
alter table public.profiles
  add column if not exists is_streamer boolean not null default false,
  add column if not exists streamer_granted_at timestamptz,
  add column if not exists streamer_granted_by uuid references auth.users(id) on delete set null,
  add column if not exists streamer_note text,
  add column if not exists streamer_revoked_at timestamptz,
  add column if not exists streamer_revoked_by uuid references auth.users(id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_streamer_note_length_check;
alter table public.profiles
  add constraint profiles_streamer_note_length_check
  check (streamer_note is null or char_length(streamer_note) <= 500);

comment on column public.profiles.is_streamer is
  'Public streamer badge. Active streamers receive all Premium access without a paid subscription.';

-- A self-created profile must never be able to forge streamer or entitlement
-- state by sending those fields in its initial insert payload.
create or replace function public.guard_profile_self_insert()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_sms_verification_enabled boolean;
begin
  if auth.role() = 'authenticated' then
    if new."supabaseId" <> auth.uid()::text then
      raise exception 'PROFILE_OWNER_MISMATCH';
    end if;

    new.id := extensions.gen_random_uuid();
    new.elo := 1000;
    new."gamesPlayed" := 0;
    new.wins := 0;
    new.created_at := now();
    new."isPremium" := false;
    new.is_streamer := false;
    new.streamer_granted_at := null;
    new.streamer_granted_by := null;
    new.streamer_note := null;
    new.streamer_revoked_at := null;
    new.streamer_revoked_by := null;
    new.is_admin := false;
    new.is_banned := false;
    new.ban_reason := null;
    new.is_moderator := false;
    new.is_developer := false;
    new.is_searching := false;
    new.no_show_level := 0;
    new.no_show_cooldown_until := null;
    new.last_no_show_at := null;
    new.queue_banned_until := null;
    new.queue_ban_reason := null;
    new.no_show_strikes := 0;
    new.phone_verified_at := null;
    new.phone_last_otp_sent_at := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.stripe_subscription_status := null;
    new.stripe_current_period_end := null;
    new.stripe_cancel_at_period_end := false;
    new.stripe_cancelled_at := null;
    new.stripe_last_event_at := null;
    new.premium_manual_granted_at := null;
    new.premium_manual_until := null;
    new.premium_manual_reason := null;
    new.premium_manual_granted_by := null;
    new.premium_first_activated_at := null;
    new.premium_access_managed := false;
    new.premium_cosmetic := 'emerald';
    new.age_confirmed_at := null;
    new.discord_user_id := null;
    new.discord_username := null;
    new.discord_avatar := null;
    new.discord_linked_at := null;
    new.is_publicly_visible := coalesce(new.is_publicly_visible, true);

    select coalesce((setting.value ->> 'enabled')::boolean, true)
    into v_sms_verification_enabled
    from public.app_settings setting
    where setting.key = 'sms_verification';
    new.phone_verified := not coalesce(v_sms_verification_enabled, true);
    new.phone_verified_at := case when new.phone_verified then now() else null end;
  end if;
  return new;
end;
$$;

-- Streamers have exactly the same feature gates as Premium members.  The
-- streamer bit is independent of Stripe/manual grants, so removing it never
-- cancels a paid subscription or another Premium entitlement.
create or replace function public.has_active_premium(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p."supabaseId" = p_user_id::text
      and (
        coalesce(p.is_streamer, false)
        or (not coalesce(p.premium_access_managed, false) and coalesce(p."isPremium", false))
        or (
          p.premium_manual_granted_at is not null
          and (p.premium_manual_until is null or p.premium_manual_until > now())
        )
        or p.stripe_subscription_status in ('active', 'trialing')
        or exists (
          select 1
          from public.premium_entitlements entitlement
          where entitlement.user_id = p_user_id
            and entitlement.revoked_at is null
            and entitlement.starts_at <= now()
            and (entitlement.ends_at is null or entitlement.ends_at > now())
        )
      )
  ), false);
$$;

-- Public cards intentionally expose just the badge flag, never its internal
-- reason, the assigning administrator, or the audit timestamps.
create or replace view public.public_visible_profiles as
select
  p."supabaseId",
  p.username,
  p.elo,
  p."gamesPlayed",
  p.wins,
  p."isPremium",
  p.premium_cosmetic,
  p.is_streamer
from public.profiles p
where coalesce(p.is_publicly_visible, true) = true;

revoke all on table public.public_visible_profiles from public, anon, authenticated;
grant select on table public.public_visible_profiles to anon, authenticated;

create or replace function public.admin_set_streamer(
  p_profile_id uuid,
  p_active boolean,
  p_note text default null
)
returns table(is_streamer boolean, is_premium boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_user_id uuid;
  v_username text;
  v_note text := nullif(btrim(p_note), '');
  v_premium boolean;
begin
  if v_admin_id is null or not exists (
    select 1
    from public.profiles admin_profile
    where admin_profile."supabaseId" = v_admin_id::text
      and coalesce(admin_profile.is_admin, false)
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_profile_id is null then
    raise exception 'PROFILE_REQUIRED';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'STREAMER_NOTE_TOO_LONG';
  end if;

  select profile."supabaseId"::uuid, profile.username
  into v_user_id, v_username
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  update public.profiles profile
  set is_streamer = p_active,
      streamer_granted_at = case when p_active then now() else profile.streamer_granted_at end,
      streamer_granted_by = case when p_active then v_admin_id else profile.streamer_granted_by end,
      streamer_revoked_at = case when p_active then null else now() end,
      streamer_revoked_by = case when p_active then null else v_admin_id end,
      streamer_note = coalesce(v_note, profile.streamer_note)
  where profile.id = p_profile_id;

  v_premium := public.refresh_premium_entitlement_cache(v_user_id);

  insert into public.admin_logs (
    admin_id,
    admin_username,
    action,
    target_type,
    target_id,
    target_label,
    details
  )
  select
    v_admin_id,
    coalesce(admin_profile.username, 'Admin'),
    case when p_active then 'GRANT_STREAMER' else 'REVOKE_STREAMER' end,
    'PROFILE',
    p_profile_id::text,
    coalesce(v_username, 'Spieler'),
    case
      when p_active then 'Streamer-Rolle vergeben. Premium-Zugang wurde aktiviert.'
      else 'Streamer-Rolle entzogen. Andere Premium-Zugänge bleiben unverändert.'
    end || case when v_note is null then '' else ' Notiz: ' || v_note end
  from public.profiles admin_profile
  where admin_profile."supabaseId" = v_admin_id::text;

  return query
  select profile.is_streamer, profile."isPremium"
  from public.profiles profile
  where profile.id = p_profile_id;
end;
$$;

revoke all on function public.has_active_premium(uuid) from public, anon;
grant execute on function public.has_active_premium(uuid) to authenticated, service_role;

revoke all on function public.admin_set_streamer(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_streamer(uuid, boolean, text) to authenticated;
