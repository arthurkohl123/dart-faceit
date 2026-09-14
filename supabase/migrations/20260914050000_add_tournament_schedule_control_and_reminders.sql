-- Tournament schedule control and player reminders.
-- This keeps time changes inside one admin-only RPC so that a cup can never
-- accidentally end up with an invalid check-in window.

create table if not exists public.tournament_notification_deliveries (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('checkin_open', 'starts_soon')),
  delivered_at timestamptz not null default now(),
  primary key (tournament_id, user_id, reminder_kind)
);

alter table public.tournament_notification_deliveries enable row level security;

create or replace function public.admin_update_tournament_schedule(
  p_tournament_id uuid,
  p_registration_closes_at timestamptz,
  p_check_in_opens_at timestamptz,
  p_check_in_closes_at timestamptz,
  p_starts_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if not public.is_tournament_admin() then
    raise exception 'Kein Admin-Zugriff.';
  end if;

  if p_registration_closes_at is null
    or p_check_in_opens_at is null
    or p_check_in_closes_at is null
    or p_starts_at is null then
    raise exception 'Alle vier Zeitpunkte werden benötigt.';
  end if;

  if p_registration_closes_at > p_check_in_opens_at
    or p_check_in_opens_at > p_check_in_closes_at
    or p_check_in_closes_at > p_starts_at then
    raise exception 'Zeitplan ungültig: Anmeldung, Check-in und Start müssen in dieser Reihenfolge liegen.';
  end if;

  update public.tournaments
  set registration_closes_at = p_registration_closes_at,
      check_in_opens_at = p_check_in_opens_at,
      check_in_closes_at = p_check_in_closes_at,
      starts_at = p_starts_at,
      updated_at = now()
  where id = p_tournament_id
    and status = 'registration'
  returning title into v_title;

  if v_title is null then
    raise exception 'Nur Turniere in der Anmeldung können zeitlich geändert werden.';
  end if;

  -- Existing participants get an in-app update immediately. The reminder
  -- worker below handles the actual check-in and start prompts later.
  insert into public.notifications(user_id, type, title, body, href)
  select tp.user_id,
         'tournament_schedule_updated',
         'Turnierzeitplan aktualisiert',
         v_title || ': Anmeldung bis ' || to_char(p_registration_closes_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI')
           || ' Uhr · Check-in ' || to_char(p_check_in_opens_at at time zone 'Europe/Berlin', 'HH24:MI')
           || '–' || to_char(p_check_in_closes_at at time zone 'Europe/Berlin', 'HH24:MI')
           || ' Uhr · Start ' || to_char(p_starts_at at time zone 'Europe/Berlin', 'HH24:MI') || ' Uhr.',
         '/tournaments'
  from public.tournament_participants tp
  where tp.tournament_id = p_tournament_id
    and tp.status in ('registered', 'checked_in', 'waitlisted');
end;
$$;

create or replace function public.send_tournament_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer := 0;
begin
  -- Prompt registered players as soon as check-in is open. A delivery row
  -- makes this idempotent even though pg_cron runs every minute.
  with delivered as (
    insert into public.tournament_notification_deliveries(tournament_id, user_id, reminder_kind)
    select t.id, tp.user_id, 'checkin_open'
    from public.tournaments t
    join public.tournament_participants tp on tp.tournament_id = t.id
    where t.status = 'registration'
      and t.check_in_opens_at <= now()
      and t.check_in_closes_at >= now()
      and tp.status = 'registered'
    on conflict do nothing
    returning tournament_id, user_id
  ), notified as (
    insert into public.notifications(user_id, type, title, body, href)
    select d.user_id,
           'tournament_checkin_open',
           'Check-in ist geöffnet',
           t.title || ': Checke jetzt ein, damit dein Startplatz sicher ist.',
           '/tournaments'
    from delivered d
    join public.tournaments t on t.id = d.tournament_id
    returning 1
  )
  select count(*) into v_sent from notified;

  -- Registered and checked-in players receive one final prompt in the
  -- fifteen-minute window before the announced start.
  with delivered as (
    insert into public.tournament_notification_deliveries(tournament_id, user_id, reminder_kind)
    select t.id, tp.user_id, 'starts_soon'
    from public.tournaments t
    join public.tournament_participants tp on tp.tournament_id = t.id
    where t.status = 'registration'
      and t.starts_at > now()
      and t.starts_at <= now() + interval '15 minutes'
      and tp.status in ('registered', 'checked_in')
    on conflict do nothing
    returning tournament_id, user_id
  ), notified as (
    insert into public.notifications(user_id, type, title, body, href)
    select d.user_id,
           'tournament_starts_soon',
           'Turnier startet gleich',
           t.title || ': Start in weniger als 15 Minuten. ' || case when tp.status = 'registered' then 'Check-in nicht vergessen.' else 'Du bist eingecheckt – gleich geht es los.' end,
           '/tournaments'
    from delivered d
    join public.tournaments t on t.id = d.tournament_id
    join public.tournament_participants tp on tp.tournament_id = d.tournament_id and tp.user_id = d.user_id
    returning 1
  )
  select v_sent + count(*) into v_sent from notified;

  return v_sent;
end;
$$;

revoke all on function public.send_tournament_reminders() from public;
grant execute on function public.admin_update_tournament_schedule(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

create extension if not exists pg_cron with schema extensions;
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'send-tournament-reminders';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule('send-tournament-reminders', '* * * * *', 'select public.send_tournament_reminders()');
end;
$$;
