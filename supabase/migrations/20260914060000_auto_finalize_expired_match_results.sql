-- Result confirmation must not depend on either player keeping the Result room
-- open. A minute-based worker finalizes eligible submissions after the existing
-- five-minute dispute period. Disputed and already completed matches are never
-- selected by this worker.

create or replace function public.finalize_expired_match_confirmations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_finalized integer := 0;
begin
  -- SKIP LOCKED keeps this safe if two scheduler executions overlap, or a
  -- participant confirms the same match at exactly the deadline.
  for v_match_id in
    select id
    from public.active_matches
    where status = 'awaiting_confirmation'
      and confirmation_requested_at is not null
      and confirmation_requested_at <= now() - interval '5 minutes'
    order by confirmation_requested_at asc
    for update skip locked
  loop
    begin
      -- Reuse the single, locked finalization path. It handles ranked and
      -- private matches correctly (private results never affect Elo/stats).
      perform public.finalize_ranked_match_result(v_match_id, null, 'server_timeout');
      v_finalized := v_finalized + 1;
    exception
      when others then
        -- A malformed historic record must not prevent later eligible results
        -- from being processed. Record the failure once per worker attempt for
        -- moderation without changing the match's current state.
        insert into public.match_audit_log(match_id, actor_id, action, old_status, new_status, context)
        values (
          v_match_id,
          null,
          'timeout_finalization_failed',
          'awaiting_confirmation',
          'awaiting_confirmation',
          jsonb_build_object('source', 'server_timeout', 'error', sqlerrm)
        );
    end;
  end loop;

  return v_finalized;
end;
$$;

revoke all on function public.finalize_expired_match_confirmations() from public;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'finalize-expired-match-results';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'finalize-expired-match-results',
    '* * * * *',
    'select public.finalize_expired_match_confirmations()'
  );
end;
$$;
