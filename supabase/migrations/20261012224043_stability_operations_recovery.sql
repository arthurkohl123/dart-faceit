-- Stability pass for matchmaking operations, login recovery and deployment
-- observability. The migration is intentionally additive and keeps existing
-- client-side recovery paths compatible.

-- Give every monitoring incident a human-readable reference and preserve the
-- match/cause that led to it. Existing rows remain valid and receive a code
-- the next time they are surfaced or updated.
alter table if exists public.monitoring_events
  add column if not exists incident_code text,
  add column if not exists match_id text,
  add column if not exists cause text;

create index if not exists monitoring_events_match_idx
  on public.monitoring_events (match_id, last_seen_at desc)
  where match_id is not null;

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
  v_incident_code text := 'RD-'
    || upper(regexp_replace(left(trim(p_event_type), 80), '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || upper(substr(md5(coalesce(p_fingerprint, p_event_type) || v_bucket::text), 1, 6));
  v_match_id text := nullif(left(trim(coalesce(p_context->>'match_id', '')), 160), '');
  v_cause text := nullif(left(trim(coalesce(p_context->>'cause', p_message)), 1000), '');
begin
  if p_severity not in ('info', 'warning', 'error', 'critical') then
    raise exception 'invalid monitoring severity';
  end if;

  insert into public.monitoring_events (
    source, event_type, severity, message, context, fingerprint,
    bucket_started_at, incident_code, match_id, cause
  ) values (
    left(trim(p_source), 50),
    left(trim(p_event_type), 80),
    p_severity,
    left(trim(p_message), 1000),
    coalesce(p_context, '{}'::jsonb),
    left(trim(p_fingerprint), 160),
    v_bucket,
    v_incident_code,
    v_match_id,
    v_cause
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
        incident_code = coalesce(incident_code, v_incident_code),
        match_id = coalesce(v_match_id, match_id),
        cause = coalesce(v_cause, cause),
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

  return jsonb_build_object('id', v_id, 'is_new', v_is_new, 'incident_code', v_incident_code);
end;
$$;

revoke all on function public.record_monitoring_event(text, text, text, text, text, jsonb) from public;
grant execute on function public.record_monitoring_event(text, text, text, text, text, jsonb) to service_role;

-- A server-side sweep is the final safety net when a browser is closed before
-- it can call the normal expiry endpoint. It is idempotent and safe to run
-- every minute through pg_cron.
create or replace function public.cleanup_stale_matchmaking_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_accepts integer := 0;
  v_stale_matches integer := 0;
  v_stale_queue integer := 0;
  v_match public.active_matches%rowtype;
begin
  select public.cleanup_expired_match_acceptances() into v_expired_accepts;

  for v_match in
    select *
    from public.active_matches
    where (
      status = 'matched'
      and created_at <= now() - interval '20 minutes'
    ) or (
      status = 'pending_result'
      and coalesce(updated_at, created_at) <= now() - interval '24 hours'
    )
    for update skip locked
  loop
    update public.active_matches
    set status = 'cancelled',
        cancellation_reason = case when v_match.status = 'matched' then 'stale_match' else 'stale_result' end,
        updated_at = now()
    where id = v_match.id
      and status = v_match.status;

    insert into public.match_audit_log(match_id, actor_id, action, old_status, new_status, context)
    values (
      v_match.id,
      null,
      'stale_match_cleanup',
      v_match.status,
      'cancelled',
      jsonb_build_object('reason', case when v_match.status = 'matched' then 'stale_match' else 'stale_result' end)
    );
    v_stale_matches := v_stale_matches + 1;
  end loop;

  delete from public.matchmaking_queue
  where coalesce(last_seen, joined_at) < now() - interval '2 minutes';
  get diagnostics v_stale_queue = row_count;

  return jsonb_build_object(
    'expired_acceptances', v_expired_accepts,
    'stale_matches', v_stale_matches,
    'stale_queue_entries', v_stale_queue
  );
end;
$$;

revoke all on function public.cleanup_stale_matchmaking_state() from public;

create extension if not exists pg_cron with schema extensions;
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'cleanup-stale-matchmaking-state';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'cleanup-stale-matchmaking-state',
    '* * * * *',
    'select public.cleanup_stale_matchmaking_state()'
  );
end;
$$;

-- Expose the new incident metadata to the existing Developer Observatory.
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
          incident_code, match_id, cause, occurrence_count,
          first_seen_at, last_seen_at, resolved_at
        from public.monitoring_events
        order by last_seen_at desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) e
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.dev_get_monitoring_dashboard(integer) from public;
grant execute on function public.dev_get_monitoring_dashboard(integer) to authenticated;
