-- Central, deduplicated production monitoring for server errors and matchmaking incidents.
create table if not exists public.monitoring_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (char_length(source) between 2 and 50),
  event_type text not null check (char_length(event_type) between 2 and 80),
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  message text not null check (char_length(message) between 1 and 1000),
  context jsonb not null default '{}'::jsonb,
  fingerprint text not null check (char_length(fingerprint) between 8 and 160),
  bucket_started_at timestamptz not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (fingerprint, bucket_started_at)
);

create index if not exists monitoring_events_last_seen_idx
  on public.monitoring_events (last_seen_at desc);
create index if not exists monitoring_events_unresolved_idx
  on public.monitoring_events (severity, last_seen_at desc)
  where resolved_at is null;
create index if not exists monitoring_events_type_idx
  on public.monitoring_events (event_type, last_seen_at desc);

alter table public.monitoring_events enable row level security;
revoke all on table public.monitoring_events from anon, authenticated;

create or replace function public.record_monitoring_event(
  p_source text,
  p_event_type text,
  p_severity text,
  p_message text,
  p_fingerprint text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_bucket timestamptz := date_trunc('hour', now())
    + floor(extract(minute from now()) / 5) * interval '5 minutes';
  v_is_new boolean := false;
begin
  if p_severity not in ('info', 'warning', 'error', 'critical') then
    raise exception 'invalid monitoring severity';
  end if;

  insert into public.monitoring_events (
    source, event_type, severity, message, context, fingerprint, bucket_started_at
  ) values (
    left(trim(p_source), 50),
    left(trim(p_event_type), 80),
    p_severity,
    left(trim(p_message), 1000),
    coalesce(p_context, '{}'::jsonb),
    left(trim(p_fingerprint), 160),
    v_bucket
  )
  on conflict (fingerprint, bucket_started_at) do nothing
  returning id into v_id;

  if v_id is not null then
    v_is_new := true;
  else
    update public.monitoring_events
    set occurrence_count = occurrence_count + 1,
        last_seen_at = now(),
        severity = p_severity,
        message = left(trim(p_message), 1000),
        context = coalesce(p_context, '{}'::jsonb),
        resolved_at = null,
        resolved_by = null
    where fingerprint = left(trim(p_fingerprint), 160)
      and bucket_started_at = v_bucket
    returning id into v_id;
  end if;

  if v_is_new and p_severity in ('error', 'critical') then
    insert into public.notifications (user_id, type, title, body, href)
    select p."supabaseId"::uuid,
      'monitoring_alert',
      case when p_severity = 'critical' then 'Kritischer Produktionsfehler' else 'Produktionswarnung' end,
      left(trim(p_source) || ': ' || trim(p_message), 500),
      '/developer#monitoring'
    from public.profiles p
    where p.is_developer = true
      and p."supabaseId" is not null;
  end if;

  return jsonb_build_object('id', v_id, 'is_new', v_is_new);
end;
$$;

revoke all on function public.record_monitoring_event(text, text, text, text, text, jsonb) from public;
grant execute on function public.record_monitoring_event(text, text, text, text, text, jsonb) to service_role;

create or replace function public.monitor_cancelled_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled_1h integer;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.record_monitoring_event(
      'matchmaking',
      'match_cancelled',
      'warning',
      'Ein Match wurde abgebrochen.',
      'matchmaking:match_cancelled',
      jsonb_build_object(
        'match_id', new.id,
        'no_show', coalesce((to_jsonb(new)->>'no_show_resolved')::boolean, false)
      )
    );

    select coalesce(sum(occurrence_count), 0)::integer into v_cancelled_1h
    from public.monitoring_events
    where event_type = 'match_cancelled'
      and last_seen_at >= now() - interval '1 hour';

    if v_cancelled_1h >= 5 then
      perform public.record_monitoring_event(
        'matchmaking',
        'cancellation_spike',
        'error',
        'Ungewöhnlich viele Match-Abbrüche innerhalb einer Stunde.',
        'matchmaking:cancellation_spike',
        jsonb_build_object('cancelled_matches_1h', v_cancelled_1h)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_match_cancellation_monitor on public.active_matches;
create trigger on_match_cancellation_monitor
after update of status on public.active_matches
for each row execute function public.monitor_cancelled_match();

create or replace function public.dev_get_monitoring_dashboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where "supabaseId" = auth.uid()::text and is_developer = true
  ) then
    raise exception 'Developer access required.';
  end if;

  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'errors_24h', coalesce((select sum(occurrence_count) from public.monitoring_events where severity in ('error', 'critical') and last_seen_at >= now() - interval '24 hours'), 0),
      'unresolved', coalesce((select count(*) from public.monitoring_events where resolved_at is null and severity in ('error', 'critical')), 0),
      'checkout_errors_24h', coalesce((select sum(occurrence_count) from public.monitoring_events where source in ('checkout', 'billing_portal', 'stripe_webhook') and severity in ('error', 'critical') and last_seen_at >= now() - interval '24 hours'), 0),
      'cancelled_matches_1h', coalesce((select sum(occurrence_count) from public.monitoring_events where event_type = 'match_cancelled' and last_seen_at >= now() - interval '1 hour'), 0),
      'cancelled_matches_24h', coalesce((select sum(occurrence_count) from public.monitoring_events where event_type = 'match_cancelled' and last_seen_at >= now() - interval '24 hours'), 0)
    ),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.last_seen_at desc)
      from (
        select id, source, event_type, severity, message, context,
          occurrence_count, first_seen_at, last_seen_at, resolved_at
        from public.monitoring_events
        order by last_seen_at desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) e
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.dev_resolve_monitoring_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where "supabaseId" = auth.uid()::text and is_developer = true
  ) then
    raise exception 'Developer access required.';
  end if;

  update public.monitoring_events
  set resolved_at = now(), resolved_by = auth.uid()
  where id = p_event_id;
end;
$$;

revoke all on function public.dev_get_monitoring_dashboard(integer) from public;
revoke all on function public.dev_resolve_monitoring_event(uuid) from public;
grant execute on function public.dev_get_monitoring_dashboard(integer) to authenticated;
grant execute on function public.dev_resolve_monitoring_event(uuid) to authenticated;

