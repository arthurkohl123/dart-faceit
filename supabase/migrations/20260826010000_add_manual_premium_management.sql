alter table public.profiles
  add column if not exists premium_manual_granted_at timestamptz,
  add column if not exists premium_manual_until timestamptz,
  add column if not exists premium_manual_reason text,
  add column if not exists premium_manual_granted_by uuid;

create table if not exists public.premium_grant_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  admin_username text not null,
  profile_id text not null,
  username text not null,
  action text not null check (action in ('granted', 'revoked', 'expired')),
  valid_until timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists premium_grant_audit_created_idx on public.premium_grant_audit(created_at desc);
alter table public.premium_grant_audit enable row level security;

drop policy if exists "Admins read premium grant audit" on public.premium_grant_audit;
create policy "Admins read premium grant audit" on public.premium_grant_audit for select to authenticated
using (exists (select 1 from public.profiles where "supabaseId" = auth.uid()::text and is_admin = true));

create or replace function public.admin_set_manual_premium(
  p_profile_id text,
  p_active boolean,
  p_until timestamptz default null,
  p_reason text default null
)
returns table(is_premium boolean, manual_until timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_admin_username text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_stripe_active boolean;
begin
  if not exists (select 1 from public.profiles where "supabaseId" = auth.uid()::text and is_admin = true) then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  select * into v_target from public.profiles where id::text = p_profile_id for update;
  if not found then raise exception 'Spieler nicht gefunden.'; end if;
  if p_active and p_until is not null and p_until <= now() then raise exception 'Das Ablaufdatum muss in der Zukunft liegen.'; end if;

  select coalesce(username, 'Admin') into v_admin_username from public.profiles where "supabaseId" = auth.uid()::text;
  v_stripe_active := coalesce(v_target.stripe_subscription_status in ('active', 'trialing'), false);

  if p_active then
    update public.profiles set
      "isPremium" = true,
      premium_manual_granted_at = now(),
      premium_manual_until = p_until,
      premium_manual_reason = v_reason,
      premium_manual_granted_by = auth.uid()
    where id::text = p_profile_id;
  else
    update public.profiles set
      "isPremium" = v_stripe_active,
      premium_manual_granted_at = null,
      premium_manual_until = null,
      premium_manual_reason = null,
      premium_manual_granted_by = null
    where id::text = p_profile_id;
  end if;

  insert into public.premium_grant_audit(admin_id, admin_username, profile_id, username, action, valid_until, reason)
  values (auth.uid(), v_admin_username, p_profile_id, coalesce(v_target.username, 'Unbekannt'), case when p_active then 'granted' else 'revoked' end, p_until, v_reason);

  insert into public.notifications(user_id, type, title, message, href)
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

  return query select p."isPremium", p.premium_manual_until from public.profiles p where p.id::text = p_profile_id;
end;
$$;

create or replace function public.expire_manual_premium_grants()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  with expired as (
    update public.profiles set
      "isPremium" = coalesce(stripe_subscription_status in ('active', 'trialing'), false),
      premium_manual_granted_at = null,
      premium_manual_until = null,
      premium_manual_reason = null,
      premium_manual_granted_by = null
    where premium_manual_granted_at is not null and premium_manual_until is not null and premium_manual_until <= now()
    returning id, username
  ), logged as (
    insert into public.premium_grant_audit(admin_id, admin_username, profile_id, username, action, valid_until, reason)
    select '00000000-0000-0000-0000-000000000000'::uuid, 'System', id, coalesce(username, 'Unbekannt'), 'expired', now(), 'Automatisch abgelaufen' from expired
    returning 1
  ) select count(*) into v_count from logged;
  return v_count;
end;
$$;

revoke all on function public.admin_set_manual_premium(text, boolean, timestamptz, text) from public;
grant execute on function public.admin_set_manual_premium(text, boolean, timestamptz, text) to authenticated;
revoke all on function public.expire_manual_premium_grants() from public;

create extension if not exists pg_cron with schema extensions;
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'expire-manual-premium-grants';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('expire-manual-premium-grants', '*/5 * * * *', 'select public.expire_manual_premium_grants()');
end;
$$;
