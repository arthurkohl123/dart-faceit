-- Global matchmaking queue switch controlled by developer accounts.
-- Running matches are deliberately left untouched; only waiting/new queue entries are affected.

insert into public.app_settings (key, value)
values (
  'matchmaking_queue',
  jsonb_build_object(
    'enabled', true,
    'message', 'Die Ranked-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.'
  )
)
on conflict (key) do nothing;

create or replace function public.get_matchmaking_queue_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'matchmaking_queue'),
    jsonb_build_object(
      'enabled', true,
      'message', 'Die Ranked-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.'
    )
  );
$$;

revoke all on function public.get_matchmaking_queue_status() from public;
grant execute on function public.get_matchmaking_queue_status() to authenticated;

create or replace function public.dev_set_matchmaking_queue(
  p_enabled boolean,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text := coalesce(
    nullif(btrim(p_message), ''),
    'Die Ranked-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.'
  );
  v_cleared integer := 0;
begin
  if not exists (
    select 1
    from public.profiles
    where "supabaseId" = auth.uid()
      and is_developer = true
  ) then
    raise exception 'DEVELOPER_REQUIRED';
  end if;

  insert into public.app_settings (key, value)
  values (
    'matchmaking_queue',
    jsonb_build_object('enabled', p_enabled, 'message', v_message)
  )
  on conflict (key) do update
    set value = excluded.value;

  if not p_enabled then
    delete from public.matchmaking_queue;
    get diagnostics v_cleared = row_count;
  end if;

  return jsonb_build_object(
    'enabled', p_enabled,
    'message', v_message,
    'cleared_entries', v_cleared
  );
end;
$$;

revoke all on function public.dev_set_matchmaking_queue(boolean, text) from public;
grant execute on function public.dev_set_matchmaking_queue(boolean, text) to authenticated;

create or replace function public.enforce_matchmaking_queue_enabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting jsonb;
  v_enabled boolean;
  v_message text;
begin
  select value
  into v_setting
  from public.app_settings
  where key = 'matchmaking_queue';

  v_enabled := coalesce((v_setting ->> 'enabled')::boolean, true);
  v_message := coalesce(
    nullif(v_setting ->> 'message', ''),
    'Die Ranked-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.'
  );

  if not v_enabled then
    raise exception 'MATCHMAKING_QUEUE_DISABLED: %', v_message;
  end if;

  return new;
end;
$$;

drop trigger if exists matchmaking_queue_enabled_guard on public.matchmaking_queue;
create trigger matchmaking_queue_enabled_guard
before insert on public.matchmaking_queue
for each row execute function public.enforce_matchmaking_queue_enabled();

