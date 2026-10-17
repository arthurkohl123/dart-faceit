-- Premium expansion: durable access grants, redeemable campaign/gift codes,
-- visible cosmetics and a scoped member overview.  Paid Stripe subscriptions
-- remain the source of truth for recurring billing; this ledger stores only
-- fixed-duration access that can safely be stacked and audited.

alter table public.profiles
  add column if not exists premium_first_activated_at timestamptz,
  add column if not exists premium_cosmetic text not null default 'emerald',
  add column if not exists premium_access_managed boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_premium_cosmetic_check;
alter table public.profiles
  add constraint profiles_premium_cosmetic_check
  check (premium_cosmetic in ('emerald', 'violet', 'gold', 'cyan'));

-- Browser clients may only change the one explicitly public-facing profile
-- preference directly. Everything else is set through narrowly scoped RPCs
-- or server-side/service-role code. This closes legacy profile-update paths
-- that otherwise let a user forge billing or manual-Premium state.
drop policy if exists "profiles_update_own_safe" on public.profiles;
create policy "profiles_update_own_safe"
  on public.profiles
  for update
  to authenticated
  using (auth.uid()::text = "supabaseId")
  with check (
    (to_jsonb(profiles) - 'is_publicly_visible') is not distinct from (
      select to_jsonb(current_profile) - 'is_publicly_visible'
      from public.profiles current_profile
      where current_profile."supabaseId" = auth.uid()::text
    )
  );

-- The public leaderboard/player pages use the deliberately narrow
-- public_visible_profiles view below. Direct anonymous access to the complete
-- profile row would otherwise expose billing identifiers, phone-verification
-- state and moderation data. Authenticated players retain their existing
-- own-profile/staff RLS policies.
drop policy if exists "profiles_public_read" on public.profiles;
revoke all on table public.profiles from anon;

-- Existing authenticated self-registration is retained, but the trigger must
-- also reset every entitlement, billing, moderation, verification and queue
-- field.  Otherwise a first profile INSERT could bypass the update policy.
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

-- Existing paid/manual members get the best historically recorded activation
-- timestamp available.  New grants always use their precise activation time.
update public.profiles
set premium_first_activated_at = coalesce(
      premium_first_activated_at,
      premium_manual_granted_at,
      stripe_last_event_at
    ),
    premium_access_managed = true
where premium_manual_granted_at is not null
   or stripe_subscription_status in ('active', 'trialing');

create table if not exists public.premium_redemption_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  kind text not null check (kind in ('promo', 'gift', 'trial')),
  label text not null check (char_length(btrim(label)) between 3 and 100),
  duration_days integer not null check (duration_days between 1 and 730),
  max_redemptions integer not null default 1 check (max_redemptions between 1 and 10000),
  redemption_count integer not null default 0 check (redemption_count >= 0 and redemption_count <= max_redemptions),
  active boolean not null default true,
  expires_at timestamptz,
  stripe_checkout_session_id text unique,
  purchased_by_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at)
);

create table if not exists public.premium_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('admin', 'promo_code', 'gift', 'trial')),
  source_code_id uuid references public.premium_redemption_codes(id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create table if not exists public.premium_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.premium_redemption_codes(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid not null references public.premium_entitlements(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (code_id, user_id),
  unique (entitlement_id)
);

create index if not exists premium_entitlements_active_user_idx
  on public.premium_entitlements (user_id, starts_at desc, ends_at)
  where revoked_at is null;
create index if not exists premium_redemption_codes_active_idx
  on public.premium_redemption_codes (active, expires_at)
  where active = true;
create index if not exists premium_code_redemptions_user_idx
  on public.premium_code_redemptions (user_id, redeemed_at desc);

alter table public.premium_redemption_codes enable row level security;
alter table public.premium_entitlements enable row level security;
alter table public.premium_code_redemptions enable row level security;

-- Codes are secrets.  Browser clients only use narrowly scoped RPCs below;
-- neither plaintext nor hashes are exposed through the data API.
revoke all on table public.premium_redemption_codes from public, anon, authenticated;
revoke all on table public.premium_entitlements from public, anon, authenticated;
revoke all on table public.premium_code_redemptions from public, anon, authenticated;
grant all on table public.premium_redemption_codes to service_role;
grant all on table public.premium_entitlements to service_role;
grant all on table public.premium_code_redemptions to service_role;

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
        -- Retain compatibility for legacy hand-set Premium flags while every
        -- new entitlement uses the managed path below.
        (not coalesce(p.premium_access_managed, false) and coalesce(p."isPremium", false))
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

create or replace function public.refresh_premium_entitlement_cache(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_active boolean := false;
  v_first_activated_at timestamptz;
begin
  if p_user_id is null then
    return false;
  end if;

  select coalesce(p.premium_first_activated_at,
      case
        when p.premium_manual_granted_at is not null then p.premium_manual_granted_at
        when p.stripe_subscription_status in ('active', 'trialing') then p.stripe_last_event_at
        else (
          select min(entitlement.starts_at)
          from public.premium_entitlements entitlement
          where entitlement.user_id = p_user_id
            and entitlement.revoked_at is null
            and entitlement.starts_at <= now()
        )
      end
    )
  into v_first_activated_at
  from public.profiles p
  where p."supabaseId" = p_user_id::text
  for update;

  if not found then
    return false;
  end if;

  v_active := public.has_active_premium(p_user_id);

  update public.profiles
  set "isPremium" = v_active,
      premium_access_managed = true,
      premium_first_activated_at = case
        when v_active then coalesce(premium_first_activated_at, v_first_activated_at, now())
        else premium_first_activated_at
      end
  where "supabaseId" = p_user_id::text;

  return v_active;
end;
$$;

-- The phone-verification screen may mark a profile ready only when staff have
-- explicitly disabled SMS verification. Keeping this privileged transition in
-- an RPC means a user can never set phone_verified via a raw profile PATCH.
create or replace function public.mark_my_phone_verification_skipped()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_sms_enabled boolean := true;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select coalesce((setting.value ->> 'enabled')::boolean, true)
  into v_sms_enabled
  from public.app_settings setting
  where setting.key = 'sms_verification';

  if coalesce(v_sms_enabled, true) then
    raise exception 'SMS_VERIFICATION_IS_ENABLED';
  end if;

  update public.profiles
  set phone_verified = true,
      phone_verified_at = coalesce(phone_verified_at, now())
  where "supabaseId" = v_user_id::text;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.admin_create_premium_code(
  p_label text,
  p_kind text,
  p_duration_days integer,
  p_max_redemptions integer default 1,
  p_expires_at timestamptz default null
)
returns table(
  code text,
  code_id uuid,
  label text,
  kind text,
  duration_days integer,
  max_redemptions integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_code text;
  v_hash text;
  v_id uuid;
  v_label text := btrim(coalesce(p_label, ''));
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_attempt integer := 0;
begin
  if not public.is_tournament_admin() then
    raise exception 'Kein Admin-Zugriff.';
  end if;
  if char_length(v_label) not between 3 and 100 then
    raise exception 'Die Bezeichnung muss zwischen 3 und 100 Zeichen lang sein.';
  end if;
  if v_kind not in ('promo', 'gift', 'trial') then
    raise exception 'Ungültiger Code-Typ.';
  end if;
  if p_duration_days not between 1 and 730 then
    raise exception 'Die Laufzeit muss zwischen 1 und 730 Tagen liegen.';
  end if;
  if p_max_redemptions not between 1 and 10000 then
    raise exception 'Die Anzahl der Einlösungen muss zwischen 1 und 10000 liegen.';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Das Ablaufdatum muss in der Zukunft liegen.';
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 10 then
      raise exception 'Der Premium-Code konnte nicht erzeugt werden.';
    end if;

    v_code := 'RD-' || upper(substring(encode(extensions.gen_random_bytes(10), 'hex') from 1 for 5))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(10), 'hex') from 1 for 5))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(10), 'hex') from 1 for 5));
    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

    begin
      insert into public.premium_redemption_codes(
        code_hash, kind, label, duration_days, max_redemptions, expires_at, created_by_user_id
      ) values (
        v_hash, v_kind, v_label, p_duration_days, p_max_redemptions, p_expires_at, auth.uid()
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      -- Hash collisions are extraordinarily unlikely; try a new random code.
    end;
  end loop;

  return query
  select v_code, v_id, v_label, v_kind, p_duration_days, p_max_redemptions, p_expires_at;
end;
$$;

create or replace function public.admin_list_premium_codes()
returns table(
  id uuid,
  label text,
  kind text,
  duration_days integer,
  max_redemptions integer,
  redemption_count integer,
  active boolean,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $$
  select code.id, code.label, code.kind, code.duration_days, code.max_redemptions,
    code.redemption_count, code.active, code.expires_at, code.created_at
  from public.premium_redemption_codes code
  where public.is_tournament_admin()
  order by code.created_at desc
  limit 100;
$$;

create or replace function public.admin_set_premium_code_active(p_code_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.is_tournament_admin() then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  update public.premium_redemption_codes
  set active = coalesce(p_active, false)
  where id = p_code_id;

  if not found then
    raise exception 'Premium-Code nicht gefunden.';
  end if;
end;
$$;

create or replace function public.redeem_premium_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized text := regexp_replace(upper(btrim(coalesce(p_code, ''))), '[[:space:]]+', '', 'g');
  v_hash text;
  v_code public.premium_redemption_codes%rowtype;
  v_profile public.profiles%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_entitlement_id uuid;
  v_source text;
begin
  if v_user_id is null then
    raise exception 'Bitte melde dich zuerst an.';
  end if;
  if char_length(v_normalized) not between 6 and 64 then
    raise exception 'Dieser Premium-Code ist ungültig oder nicht mehr aktiv.';
  end if;

  -- Serialize every fixed-duration grant for a profile.  Without this row
  -- lock, two different codes redeemed in parallel could both start at the
  -- same instant instead of stacking their access periods.
  select * into v_profile
  from public.profiles profile
  where profile."supabaseId" = v_user_id::text
  for update;
  if not found then
    raise exception 'Dein Profil konnte nicht geladen werden.';
  end if;

  v_hash := encode(extensions.digest(v_normalized, 'sha256'), 'hex');
  select * into v_code
  from public.premium_redemption_codes
  where code_hash = v_hash
  for update;

  if not found
    or not v_code.active
    or (v_code.expires_at is not null and v_code.expires_at <= now())
    or v_code.redemption_count >= v_code.max_redemptions then
    raise exception 'Dieser Premium-Code ist ungültig oder nicht mehr aktiv.';
  end if;

  if exists (
    select 1 from public.premium_code_redemptions redemption
    where redemption.code_id = v_code.id and redemption.user_id = v_user_id
  ) then
    raise exception 'Du hast diesen Premium-Code bereits eingelöst.';
  end if;

  -- A recurring subscription can renew indefinitely.  Require it to end
  -- before a fixed gift/promo duration is redeemed so no paid time vanishes.
  if v_profile.stripe_subscription_status in ('active', 'trialing') then
    raise exception 'Bitte löse den Code nach Ende deines laufenden Stripe-Abos ein, damit keine Laufzeit verloren geht.';
  end if;
  if v_profile.premium_manual_granted_at is not null
    and v_profile.premium_manual_until is null then
    raise exception 'Bitte löse den Code nach Ende deiner unbefristeten manuellen Premium-Freigabe ein, damit keine Laufzeit verloren geht.';
  end if;

  select greatest(
    now(),
    coalesce(max(entitlement.ends_at), now()),
    coalesce(v_profile.premium_manual_until, now())
  ) into v_start
  from public.premium_entitlements entitlement
  where entitlement.user_id = v_user_id
    and entitlement.revoked_at is null
    and entitlement.ends_at is not null
    and entitlement.ends_at > now();

  v_end := v_start + make_interval(days => v_code.duration_days);
  v_source := case v_code.kind
    when 'gift' then 'gift'
    when 'trial' then 'trial'
    else 'promo_code'
  end;

  insert into public.premium_entitlements(
    user_id, source, source_code_id, starts_at, ends_at, created_by_user_id, note
  ) values (
    v_user_id, v_source, v_code.id, v_start, v_end, v_code.created_by_user_id, v_code.label
  ) returning id into v_entitlement_id;

  insert into public.premium_code_redemptions(code_id, user_id, entitlement_id)
  values (v_code.id, v_user_id, v_entitlement_id);

  update public.premium_redemption_codes
  set redemption_count = redemption_count + 1,
      active = case when redemption_count + 1 >= max_redemptions then false else active end
  where id = v_code.id;

  perform public.refresh_premium_entitlement_cache(v_user_id);

  insert into public.notifications(user_id, type, title, body, href)
  values (
    v_user_id,
    'premium',
    case when v_start <= now() then 'Premium-Code eingelöst' else 'Premium-Zeit vorgemerkt' end,
    case
      when v_start <= now() then 'Dein Premium-Zugang ist bis ' || to_char(v_end at time zone 'Europe/Berlin', 'DD.MM.YYYY') || ' aktiv.'
      else 'Deine Premium-Zeit startet am ' || to_char(v_start at time zone 'Europe/Berlin', 'DD.MM.YYYY') || ' und läuft bis ' || to_char(v_end at time zone 'Europe/Berlin', 'DD.MM.YYYY') || '.'
    end,
    '/premium'
  );

  return jsonb_build_object(
    'status', 'redeemed',
    'starts_at', v_start,
    'ends_at', v_end,
    'duration_days', v_code.duration_days,
    'kind', v_code.kind
  );
end;
$$;

create or replace function public.set_my_premium_cosmetic(p_cosmetic text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_cosmetic text := lower(btrim(coalesce(p_cosmetic, '')));
begin
  if auth.uid() is null then
    raise exception 'Bitte melde dich zuerst an.';
  end if;
  if v_cosmetic not in ('emerald', 'violet', 'gold', 'cyan') then
    raise exception 'Ungültiges Premium-Design.';
  end if;
  if not public.has_active_premium(auth.uid()) then
    raise exception 'Dieses Design ist nur mit aktivem Premium verfügbar.';
  end if;

  update public.profiles
  set premium_cosmetic = v_cosmetic
  where "supabaseId" = auth.uid()::text;

  if not found then
    raise exception 'Dein Profil konnte nicht geladen werden.';
  end if;

  return v_cosmetic;
end;
$$;

create or replace function public.get_my_premium_overview()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_fixed_access_until timestamptz;
  v_code_redemptions integer;
  v_premium_tournaments integer;
  v_ranked_matches_since integer;
begin
  if v_user_id is null then
    raise exception 'Bitte melde dich zuerst an.';
  end if;

  select * into v_profile
  from public.profiles
  where "supabaseId" = v_user_id::text;

  if not found then
    raise exception 'Dein Profil konnte nicht geladen werden.';
  end if;

  select max(entitlement.ends_at) into v_fixed_access_until
  from public.premium_entitlements entitlement
  where entitlement.user_id = v_user_id
    and entitlement.revoked_at is null
    and entitlement.ends_at is not null
    and entitlement.ends_at > now();

  select count(*)::integer into v_code_redemptions
  from public.premium_code_redemptions redemption
  where redemption.user_id = v_user_id;

  select count(*)::integer into v_premium_tournaments
  from public.tournament_participants participant
  join public.tournaments tournament on tournament.id = participant.tournament_id
  where participant.user_id = v_user_id
    and tournament.premium_only;

  select count(*)::integer into v_ranked_matches_since
  from public.matches match_history
  where match_history.user_id = v_user_id
    and coalesce(match_history.match_mode, 'ranked') = 'ranked'
    and v_profile.premium_first_activated_at is not null
    and coalesce(match_history.completed_at, match_history.created_at) >= v_profile.premium_first_activated_at;

  return jsonb_build_object(
    'active', public.has_active_premium(v_user_id),
    'premium_since', v_profile.premium_first_activated_at,
    'premium_cosmetic', v_profile.premium_cosmetic,
    'fixed_access_until', v_fixed_access_until,
    'code_redemptions', v_code_redemptions,
    'premium_tournaments', v_premium_tournaments,
    'ranked_matches_since', v_ranked_matches_since
  );
end;
$$;

-- Refresh the display cache after a fixed grant starts or expires.  Access
-- checks themselves always use has_active_premium(), so this job is only a
-- compatibility layer for existing UI and integrations that still read the
-- cached profile flag.
create or replace function public.expire_premium_entitlements()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid;
  v_count integer := 0;
begin
  for v_user_id in
    -- Recompute every known fixed-access account instead of relying on a
    -- narrow transition window.  This makes the cached compatibility flag
    -- self-heal after a delayed cron run or database outage.
    select distinct entitlement.user_id
    from public.premium_entitlements entitlement
  loop
    perform public.refresh_premium_entitlement_cache(v_user_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- The legacy manual-expiry job must not remove a currently active code grant.
create or replace function public.expire_manual_premium_grants()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_expired record;
  v_count integer := 0;
begin
  for v_expired in
    update public.profiles
    set premium_manual_granted_at = null,
        premium_manual_until = null,
        premium_manual_reason = null,
        premium_manual_granted_by = null
    where premium_manual_granted_at is not null
      and premium_manual_until is not null
      and premium_manual_until <= now()
    returning id, "supabaseId", username
  loop
    perform public.refresh_premium_entitlement_cache(v_expired."supabaseId"::uuid);
    insert into public.premium_grant_audit(admin_id, admin_username, profile_id, username, action, valid_until, reason)
    values ('00000000-0000-0000-0000-000000000000'::uuid, 'System', v_expired.id,
      coalesce(v_expired.username, 'Unbekannt'), 'expired', now(), 'Automatisch abgelaufen');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Manual Premium remains available for staff, but its cached state now also
-- honours any active gift/promo entitlement.
create or replace function public.admin_set_manual_premium(
  p_profile_id text,
  p_active boolean,
  p_until timestamptz default null,
  p_reason text default null
)
returns table(is_premium boolean, manual_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_target public.profiles%rowtype;
  v_admin_username text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_tournament_admin() then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  select * into v_target from public.profiles where id::text = p_profile_id for update;
  if not found then raise exception 'Spieler nicht gefunden.'; end if;
  if p_active and p_until is not null and p_until <= now() then
    raise exception 'Das Ablaufdatum muss in der Zukunft liegen.';
  end if;

  select coalesce(username, 'Admin') into v_admin_username
  from public.profiles where "supabaseId" = auth.uid()::text;

  if p_active then
    update public.profiles set
      premium_access_managed = true,
      premium_first_activated_at = coalesce(premium_first_activated_at, now()),
      premium_manual_granted_at = now(),
      premium_manual_until = p_until,
      premium_manual_reason = v_reason,
      premium_manual_granted_by = auth.uid()
    where id::text = p_profile_id;
  else
    update public.profiles set
      premium_access_managed = true,
      premium_manual_granted_at = null,
      premium_manual_until = null,
      premium_manual_reason = null,
      premium_manual_granted_by = null
    where id::text = p_profile_id;
  end if;

  perform public.refresh_premium_entitlement_cache(v_target."supabaseId"::uuid);

  insert into public.premium_grant_audit(admin_id, admin_username, profile_id, username, action, valid_until, reason)
  values (auth.uid(), v_admin_username, p_profile_id, coalesce(v_target.username, 'Unbekannt'),
    case when p_active then 'granted' else 'revoked' end, p_until, v_reason);

  insert into public.notifications(user_id, type, title, body, href)
  values (
    v_target."supabaseId"::uuid,
    'premium',
    case when p_active then 'Premium wurde aktiviert' else 'Manuelles Premium wurde beendet' end,
    case
      when p_active and p_until is not null then 'Ein Admin hat Premium bis ' || to_char(p_until at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') || ' Uhr für dich aktiviert.'
      when p_active then 'Ein Admin hat Premium ohne Ablaufdatum für dich aktiviert.'
      else 'Deine manuelle Premium-Freigabe wurde beendet.'
    end,
    '/premium'
  );

  return query
  select profile."isPremium", profile.premium_manual_until
  from public.profiles profile
  where profile.id::text = p_profile_id;
end;
$$;

-- Public player cards receive only the selected visual variant, never any
-- entitlement dates, code data, or billing details.
create or replace view public.public_visible_profiles as
select
  p."supabaseId",
  p.username,
  p.elo,
  p."gamesPlayed",
  p.wins,
  p."isPremium",
  p.premium_cosmetic
from public.profiles p
where coalesce(p.is_publicly_visible, true) = true;

-- Views are automatically updatable by default. Keep this public projection
-- read-only even though it deliberately runs as its owner to make public
-- leaderboard/player cards possible without exposing the underlying profile
-- rows to anonymous clients.
revoke all on table public.public_visible_profiles from public, anon, authenticated;
grant select on table public.public_visible_profiles to anon, authenticated;

-- The current tournament join function is redefined so Premium-only events
-- use the authoritative entitlement check instead of a potentially stale UI
-- cache.  The rest of its queue/check-in/access-code behavior is unchanged.
create or replace function public.join_tournament(p_tournament_id uuid, p_access_code text default null)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_t public.tournaments%rowtype;
  v_profile record;
  v_average numeric;
  v_count integer;
  v_status text;
  v_position integer;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' or now() > v_t.registration_closes_at then raise exception 'Die Anmeldung ist geschlossen.'; end if;
  if v_t.access_code_hash is not null and md5(upper(trim(coalesce(p_access_code, '')))) <> v_t.access_code_hash then raise exception 'Der Turniercode ist ungültig.'; end if;
  if exists (select 1 from public.tournament_participants where tournament_id = p_tournament_id and user_id = auth.uid() and status not in ('withdrawn','removed','disqualified')) then raise exception 'Du bist bereits angemeldet.'; end if;

  select username, scolia_username, dartcounter_username into v_profile
  from public.profiles where "supabaseId" = auth.uid()::text;
  if v_profile.username is null then raise exception 'Dein Profil konnte nicht geladen werden.'; end if;
  if v_t.premium_only and not public.has_active_premium(auth.uid()) then raise exception 'Dieses Turnier ist nur für Premium-Mitglieder.'; end if;
  if v_t.scoring_platform = 'scolia' and nullif(trim(coalesce(v_profile.scolia_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen Scolia-Namen im Profil.'; end if;
  if v_t.scoring_platform = 'dartcounter' and nullif(trim(coalesce(v_profile.dartcounter_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen DartCounter-Namen im Profil.'; end if;

  v_average := public.tournament_player_average(auth.uid());
  if v_t.max_average is not null and coalesce(v_average, 0) > v_t.max_average then raise exception 'Dein Average liegt über dem erlaubten Limit.'; end if;
  if v_t.min_average is not null and coalesce(v_average, 0) < v_t.min_average then raise exception 'Dein Average liegt unter dem erforderlichen Limit.'; end if;
  select count(*) into v_count from public.tournament_participants where tournament_id = p_tournament_id and status in ('registered','checked_in');
  v_status := case when v_count >= v_t.max_players then 'waitlisted' else 'registered' end;
  if v_status = 'waitlisted' then
    select coalesce(max(waitlist_position),0)+1 into v_position from public.tournament_participants where tournament_id = p_tournament_id and status='waitlisted';
  end if;
  delete from public.tournament_participants where tournament_id=p_tournament_id and user_id=auth.uid() and status in ('withdrawn','removed','disqualified');
  insert into public.tournament_participants(tournament_id,user_id,username,average_snapshot,status,waitlist_position)
  values (p_tournament_id,auth.uid(),v_profile.username,v_average,v_status,v_position);
  return v_status;
end;
$$;

-- Paid gifts are fulfilled by Stripe-facing server routes only. The database
-- keeps the hash, never the redeemable-code plaintext, and uses the Checkout
-- Session ID as a durable idempotency key across webhook retries and the
-- buyer's post-payment recovery request.
create or replace function public.fulfill_stripe_premium_gift(
  p_checkout_session_id text,
  p_purchased_by_user_id uuid,
  p_duration_days integer,
  p_code_hash text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_code_id uuid;
  v_existing public.premium_redemption_codes%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_purchased_by_user_id is null
    or p_checkout_session_id is null
    or char_length(btrim(p_checkout_session_id)) not between 10 and 255 then
    raise exception 'INVALID_PREMIUM_GIFT_CHECKOUT';
  end if;

  if p_duration_days not in (30, 90, 365) then
    raise exception 'INVALID_PREMIUM_GIFT_DURATION';
  end if;

  if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_PREMIUM_GIFT_CODE_HASH';
  end if;

  insert into public.premium_redemption_codes(
    code_hash,
    kind,
    label,
    duration_days,
    max_redemptions,
    stripe_checkout_session_id,
    purchased_by_user_id,
    created_by_user_id
  ) values (
    p_code_hash,
    'gift',
    'Premium-Geschenk · ' || p_duration_days || ' Tage',
    p_duration_days,
    1,
    btrim(p_checkout_session_id),
    p_purchased_by_user_id,
    p_purchased_by_user_id
  )
  on conflict do nothing
  returning id into v_code_id;

  if v_code_id is not null then
    return v_code_id;
  end if;

  select * into v_existing
  from public.premium_redemption_codes
  where stripe_checkout_session_id = btrim(p_checkout_session_id)
  for update;

  if not found then
    -- A collision on the separately unique hash must never be silently bound
    -- to a different Stripe payment.
    raise exception 'PREMIUM_GIFT_FULFILMENT_RETRY';
  end if;

  if v_existing.kind <> 'gift'
    or v_existing.purchased_by_user_id is distinct from p_purchased_by_user_id
    or v_existing.duration_days <> p_duration_days
    or v_existing.max_redemptions <> 1
    or v_existing.code_hash <> p_code_hash then
    raise exception 'PREMIUM_GIFT_SESSION_CONFLICT';
  end if;

  return v_existing.id;
end;
$$;

revoke all on function public.has_active_premium(uuid) from public;
revoke all on function public.refresh_premium_entitlement_cache(uuid) from public;
revoke all on function public.mark_my_phone_verification_skipped() from public;
revoke all on function public.admin_create_premium_code(text, text, integer, integer, timestamptz) from public;
revoke all on function public.admin_list_premium_codes() from public;
revoke all on function public.admin_set_premium_code_active(uuid, boolean) from public;
revoke all on function public.redeem_premium_code(text) from public;
revoke all on function public.set_my_premium_cosmetic(text) from public;
revoke all on function public.get_my_premium_overview() from public;
revoke all on function public.expire_premium_entitlements() from public;
revoke all on function public.expire_manual_premium_grants() from public;
revoke all on function public.admin_set_manual_premium(text, boolean, timestamptz, text) from public;
revoke all on function public.join_tournament(uuid, text) from public;
revoke all on function public.fulfill_stripe_premium_gift(text, uuid, integer, text) from public;

grant execute on function public.has_active_premium(uuid) to authenticated, service_role;
grant execute on function public.mark_my_phone_verification_skipped() to authenticated;
grant execute on function public.admin_create_premium_code(text, text, integer, integer, timestamptz) to authenticated;
grant execute on function public.admin_list_premium_codes() to authenticated;
grant execute on function public.admin_set_premium_code_active(uuid, boolean) to authenticated;
grant execute on function public.redeem_premium_code(text) to authenticated;
grant execute on function public.set_my_premium_cosmetic(text) to authenticated;
grant execute on function public.get_my_premium_overview() to authenticated;
grant execute on function public.join_tournament(uuid, text) to authenticated;
grant execute on function public.refresh_premium_entitlement_cache(uuid) to service_role;
grant execute on function public.expire_premium_entitlements() to service_role;
grant execute on function public.fulfill_stripe_premium_gift(text, uuid, integer, text) to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'refresh-premium-entitlements';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('refresh-premium-entitlements', '*/5 * * * *', 'select public.expire_premium_entitlements()');
end;
$$;
