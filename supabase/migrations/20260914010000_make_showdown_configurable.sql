-- Let developers configure the weekly Showdown without a deployment.
-- All values are validated in the database as a second line of defence.

create or replace function public.get_wednesday_showdown_status()
returns table (
  is_active boolean,
  event_enabled boolean,
  free_limit_override boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  minimum_matches integer,
  title text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_setting jsonb;
  v_local_now timestamp := now() at time zone 'Europe/Berlin';
  v_event_date date;
  v_iso_day integer;
  v_start_time time;
  v_end_time time;
  v_start_local timestamp;
  v_end_local timestamp;
  v_enabled boolean;
  v_free_override boolean;
  v_minimum_matches integer;
begin
  select value into v_setting from public.app_settings where key = 'wednesday_showdown';

  v_enabled := coalesce((v_setting ->> 'enabled')::boolean, true);
  v_free_override := coalesce((v_setting ->> 'free_limit_override')::boolean, true);
  v_minimum_matches := greatest(1, least(50, coalesce((v_setting ->> 'minimum_matches')::integer, 3)));
  begin
    v_start_time := coalesce(nullif(v_setting ->> 'starts_at_local', '')::time, time '18:00');
    v_end_time := coalesce(nullif(v_setting ->> 'ends_at_local', '')::time, time '22:00');
  exception when others then
    v_start_time := time '18:00';
    v_end_time := time '22:00';
  end;

  -- The event currently remains a Wednesday-only event. Invalid or overnight
  -- time ranges fall back to the safe, advertised default window.
  if v_end_time <= v_start_time then
    v_start_time := time '18:00';
    v_end_time := time '22:00';
  end if;

  v_iso_day := extract(isodow from v_local_now)::integer;
  v_event_date := v_local_now::date + ((3 - v_iso_day + 7) % 7);
  if v_iso_day = 3 and v_local_now::time >= v_end_time then
    v_event_date := v_event_date + 7;
  end if;

  v_start_local := v_event_date + v_start_time;
  v_end_local := v_event_date + v_end_time;

  return query select
    v_enabled and v_local_now >= v_start_local and v_local_now < v_end_local,
    v_enabled,
    v_free_override,
    v_start_local at time zone 'Europe/Berlin',
    v_end_local at time zone 'Europe/Berlin',
    v_minimum_matches,
    coalesce(nullif(v_setting ->> 'title', ''), 'Mittwoch Showdown');
end;
$$;

create or replace function public.get_wednesday_showdown_public_config()
returns table (
  description text,
  prize_first text,
  prize_second text,
  prize_third text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(nullif(value ->> 'description', ''), 'Vier Stunden, eine eigene Wochenwertung. Spiele ganz normal Ranked – deine Elo zählt weiter für die Saison und gleichzeitig für den Showdown.'),
    coalesce(nullif(value ->> 'prize_first', ''), '15 €'),
    coalesce(nullif(value ->> 'prize_second', ''), '14 Tage Premium'),
    coalesce(nullif(value ->> 'prize_third', ''), '7 Tage Premium')
  from public.app_settings
  where key = 'wednesday_showdown';
$$;

revoke all on function public.get_wednesday_showdown_public_config() from public;
grant execute on function public.get_wednesday_showdown_public_config() to anon, authenticated;
