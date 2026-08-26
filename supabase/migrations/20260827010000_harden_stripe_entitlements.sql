-- Idempotent Stripe event processing and a single database entitlement rule.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing','processed','failed')),
  attempts integer not null default 1 check (attempts > 0),
  event_created_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events(status, updated_at desc);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_claimed boolean := false;
begin
  if nullif(trim(p_event_id),'') is null or nullif(trim(p_event_type),'') is null then
    raise exception 'INVALID_STRIPE_EVENT';
  end if;

  insert into public.stripe_webhook_events(event_id,event_type,event_created_at)
  values(left(p_event_id,255),left(p_event_type,120),p_event_created_at)
  on conflict(event_id) do update set
    status='processing', attempts=public.stripe_webhook_events.attempts+1,
    started_at=now(), updated_at=now(), last_error=null
  where public.stripe_webhook_events.status='failed'
     or (public.stripe_webhook_events.status='processing' and public.stripe_webhook_events.updated_at < now()-interval '10 minutes')
  returning true into v_claimed;

  return coalesce(v_claimed,false);
end;
$$;

create or replace function public.finish_stripe_webhook_event(
  p_event_id text,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stripe_webhook_events set
    status=case when p_success then 'processed' else 'failed' end,
    finished_at=now(), updated_at=now(), last_error=case when p_success then null else left(coalesce(p_error,'Unknown error'),1000) end
  where event_id=p_event_id;
end;
$$;

create or replace function public.has_active_premium(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (p."isPremium" and (
      (p.premium_manual_granted_at is not null and (p.premium_manual_until is null or p.premium_manual_until > now()))
      or p.stripe_subscription_status in ('active','trialing')
      or (p.stripe_subscription_status is null and p.stripe_subscription_id is null)
    )), false)
  from public.profiles p where p."supabaseId"=p_user_id::text;
$$;

revoke all on function public.claim_stripe_webhook_event(text,text,timestamptz) from public;
revoke all on function public.finish_stripe_webhook_event(text,boolean,text) from public;
revoke all on function public.has_active_premium(uuid) from public;
grant execute on function public.claim_stripe_webhook_event(text,text,timestamptz) to service_role;
grant execute on function public.finish_stripe_webhook_event(text,boolean,text) to service_role;
grant execute on function public.has_active_premium(uuid) to authenticated, service_role;

create or replace function public.get_ranked_match_daily_quota()
returns table(matches_used integer, daily_limit integer, is_premium boolean)
language sql security definer set search_path = public as $$
  select coalesce(usage.matches_started,0)::integer,
    case when public.has_active_premium(auth.uid()) then null else 4 end,
    public.has_active_premium(auth.uid())
  from public.profiles profile
  left join public.daily_ranked_match_usage usage on usage.user_id=auth.uid()
    and usage.usage_date=(now() at time zone 'Europe/Berlin')::date
  where profile."supabaseId"=auth.uid()::text;
$$;

