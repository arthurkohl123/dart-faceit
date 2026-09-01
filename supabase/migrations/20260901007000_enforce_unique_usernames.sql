-- Usernames identify players throughout matchmaking, friends and public
-- profiles. Keep them unique even when the spelling only differs by case or
-- whitespace (for example "CheckoutKing" and " checkoutking ").

-- Normalize historical data first. Empty legacy values may remain null, while
-- valid names keep their chosen capitalization.
update public.profiles
set username = nullif(btrim(username), '')
where username is not null
  and username is distinct from nullif(btrim(username), '');

-- Resolve existing duplicates deterministically before installing the unique
-- index. The oldest auth account keeps the original username; later accounts
-- receive the next free "-2", "-3", … suffix and an in-app notice.
do $$
declare
  v_profile record;
  v_base text;
  v_candidate text;
  v_suffix integer;
begin
  for v_profile in
    with ranked_profiles as (
      select
        profile.id,
        profile.username,
        auth_user.id as auth_user_id,
        row_number() over (
          partition by lower(profile.username)
          order by auth_user.created_at asc nulls last, profile.id asc
        )::integer as duplicate_position
      from public.profiles profile
      left join auth.users auth_user on auth_user.id::text = profile."supabaseId"
      where profile.username is not null
    )
    select id, username, auth_user_id, duplicate_position
    from ranked_profiles
    where duplicate_position > 1
    order by lower(username), duplicate_position, id
  loop
    v_base := v_profile.username;
    v_suffix := v_profile.duplicate_position;

    loop
      v_candidate := v_base || '-' || v_suffix::text;
      exit when not exists (
        select 1
        from public.profiles existing_profile
        where existing_profile.id <> v_profile.id
          and lower(btrim(existing_profile.username)) = lower(v_candidate)
      );
      v_suffix := v_suffix + 1;
    end loop;

    update public.profiles
    set username = v_candidate
    where id = v_profile.id;

    if v_profile.auth_user_id is not null then
      insert into public.notifications (user_id, type, title, body, href)
      values (
        v_profile.auth_user_id,
        'username_updated',
        'Dein Benutzername wurde angepasst',
        'Der Benutzername "' || v_base || '" war bereits vergeben. Dein Profil heißt jetzt "' || v_candidate || '".',
        '/profile'
      );
    end if;
  end loop;
end;
$$;

create unique index if not exists profiles_username_case_insensitive_key
  on public.profiles (lower(btrim(username)))
  where username is not null;

create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username is not null then
    new.username := nullif(btrim(new.username), '');
    if new.username is null then
      raise exception 'USERNAME_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_profile_username_trigger on public.profiles;
create trigger normalize_profile_username_trigger
before insert or update of username on public.profiles
for each row execute function public.normalize_profile_username();

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    nullif(btrim(coalesce(p_username, '')), '') is not null
    and not exists (
      select 1
      from public.profiles profile
      where lower(btrim(profile.username)) = lower(btrim(p_username))
    );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

comment on index public.profiles_username_case_insensitive_key is
  'Prevents duplicate RankedDarts usernames regardless of case or surrounding whitespace.';
