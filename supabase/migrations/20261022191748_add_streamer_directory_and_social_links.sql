-- Stream links belong to the official streamer profile. Keep the public
-- projection narrowly scoped so that losing the streamer role immediately
-- hides the links without exposing any other profile fields.
alter table public.profiles
  add column if not exists twitch_url text,
  add column if not exists kick_url text;

alter table public.profiles
  drop constraint if exists profiles_twitch_url_check,
  drop constraint if exists profiles_kick_url_check;

alter table public.profiles
  add constraint profiles_twitch_url_check
    check (twitch_url is null or twitch_url ~* '^https://(www\.)?twitch\.tv/[a-z0-9_]{4,25}/?$'),
  add constraint profiles_kick_url_check
    check (kick_url is null or kick_url ~* '^https://(www\.)?kick\.com/[a-z0-9_-]{3,50}/?$');

comment on column public.profiles.twitch_url is
  'Validated public Twitch channel link. Only active RankedDarts streamers can set it.';
comment on column public.profiles.kick_url is
  'Validated public Kick channel link. Only active RankedDarts streamers can set it.';

-- A newly created account must not be able to preload a social link and make
-- it public later simply by receiving the streamer role. This runs after the
-- existing profile-insert guard (trigger order is alphabetical).
create or replace function public.guard_profile_streamer_links_self_insert()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    new.twitch_url := null;
    new.kick_url := null;
  end if;
  return new;
end;
$$;

drop trigger if exists zzz_guard_profile_streamer_links_self_insert on public.profiles;
create trigger zzz_guard_profile_streamer_links_self_insert
before insert on public.profiles
for each row execute function public.guard_profile_streamer_links_self_insert();

create or replace function public.update_streamer_social_links(
  p_twitch_url text default null,
  p_kick_url text default null
)
returns table(twitch_url text, kick_url text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_twitch_url text := nullif(btrim(coalesce(p_twitch_url, '')), '');
  v_kick_url text := nullif(btrim(coalesce(p_kick_url, '')), '');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if coalesce(char_length(v_twitch_url), 0) > 255
    or coalesce(char_length(v_kick_url), 0) > 255 then
    raise exception 'STREAM_LINK_TOO_LONG';
  end if;

  if v_twitch_url is not null
    and v_twitch_url !~* '^https://(www\.)?twitch\.tv/[a-z0-9_]{4,25}/?$' then
    raise exception 'INVALID_TWITCH_URL';
  end if;

  if v_kick_url is not null
    and v_kick_url !~* '^https://(www\.)?kick\.com/[a-z0-9_-]{3,50}/?$' then
    raise exception 'INVALID_KICK_URL';
  end if;

  update public.profiles profile
  set twitch_url = v_twitch_url,
      kick_url = v_kick_url
  where profile."supabaseId" = v_user_id::text
    and coalesce(profile.is_streamer, false)
  returning profile.twitch_url, profile.kick_url
  into twitch_url, kick_url;

  if not found then
    raise exception 'STREAMER_ROLE_REQUIRED';
  end if;

  return next;
end;
$$;

revoke all on function public.update_streamer_social_links(text, text) from public, anon;
grant execute on function public.update_streamer_social_links(text, text) to authenticated;

create or replace view public.public_visible_profiles as
select
  p."supabaseId",
  p.username,
  p.elo,
  p."gamesPlayed",
  p.wins,
  p."isPremium",
  p.premium_cosmetic,
  p.is_streamer,
  case when coalesce(p.is_streamer, false) then p.twitch_url else null end as twitch_url,
  case when coalesce(p.is_streamer, false) then p.kick_url else null end as kick_url
from public.profiles p
where coalesce(p.is_publicly_visible, true) = true;

revoke all on table public.public_visible_profiles from public, anon, authenticated;
grant select on table public.public_visible_profiles to anon, authenticated;
