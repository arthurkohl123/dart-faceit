alter table public.profiles
  add column if not exists discord_user_id text,
  add column if not exists discord_username text,
  add column if not exists discord_avatar text,
  add column if not exists discord_linked_at timestamptz;

create unique index if not exists profiles_discord_user_id_key
  on public.profiles (discord_user_id)
  where discord_user_id is not null;

comment on column public.profiles.discord_user_id is 'Discord user id linked through the official OAuth2 flow.';
comment on column public.profiles.discord_username is 'Last known Discord display name for the linked account.';
