-- Independent switch for the DartCounter 2vs2 queue. Closing it clears only
-- waiting duo searches; already created matches are deliberately untouched.

insert into public.app_settings (key, value)
values (
  'duo_matchmaking_queue',
  jsonb_build_object(
    'enabled', true,
    'message', 'Die Duo-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.'
  )
)
on conflict (key) do nothing;

create or replace function public.get_duo_matchmaking_queue_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'duo_matchmaking_queue'),
    jsonb_build_object(
      'enabled', true,
      'message', 'Die Duo-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.'
    )
  );
$$;

revoke all on function public.get_duo_matchmaking_queue_status() from public;
revoke all on function public.get_duo_matchmaking_queue_status() from anon;
grant execute on function public.get_duo_matchmaking_queue_status() to authenticated;

create or replace function public.dev_set_duo_matchmaking_queue(
  p_enabled boolean,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text := nullif(btrim(left(coalesce(p_message, ''), 500)), '');
  v_cleared integer := 0;
begin
  if not exists (
    select 1
    from public.profiles
    where "supabaseId" = auth.uid()::text
      and is_developer = true
  ) then
    raise exception 'DEVELOPER_REQUIRED';
  end if;

  if not p_enabled and v_message is null then
    raise exception 'DUO_QUEUE_REASON_REQUIRED';
  end if;

  v_message := coalesce(
    v_message,
    'Die Duo-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.'
  );

  insert into public.app_settings (key, value, updated_by)
  values (
    'duo_matchmaking_queue',
    jsonb_build_object('enabled', p_enabled, 'message', v_message),
    auth.uid()
  )
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = excluded.updated_by;

  if not p_enabled then
    -- Explicit predicate is required by Supabase's safe-update protection.
    delete from public.duo_queue_entries where true;
    get diagnostics v_cleared = row_count;
  end if;

  return jsonb_build_object(
    'enabled', p_enabled,
    'message', v_message,
    'cleared_entries', v_cleared
  );
end;
$$;

revoke all on function public.dev_set_duo_matchmaking_queue(boolean, text) from public;
revoke all on function public.dev_set_duo_matchmaking_queue(boolean, text) from anon;
grant execute on function public.dev_set_duo_matchmaking_queue(boolean, text) to authenticated;

create or replace function public.enforce_duo_matchmaking_queue_enabled()
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
  where key = 'duo_matchmaking_queue';

  v_enabled := coalesce((v_setting ->> 'enabled')::boolean, true);
  v_message := coalesce(
    nullif(v_setting ->> 'message', ''),
    'Die Duo-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.'
  );

  if not v_enabled then
    raise exception 'DUO_MATCHMAKING_QUEUE_DISABLED: %', v_message;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_duo_matchmaking_queue_enabled() from public;
revoke all on function public.enforce_duo_matchmaking_queue_enabled() from anon, authenticated;

drop trigger if exists duo_matchmaking_queue_enabled_guard on public.duo_queue_entries;
create trigger duo_matchmaking_queue_enabled_guard
before insert or update on public.duo_queue_entries
for each row execute function public.enforce_duo_matchmaking_queue_enabled();
