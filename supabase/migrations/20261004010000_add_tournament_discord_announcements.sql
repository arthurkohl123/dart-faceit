-- Track Discord tournament announcements for reliable retries without duplicates.
alter table public.tournaments
  add column if not exists discord_announcement_sent_at timestamptz,
  add column if not exists discord_announcement_message_id text,
  add column if not exists discord_announcement_error text;

comment on column public.tournaments.discord_announcement_sent_at is
  'Timestamp of the last successful Discord tournament announcement.';
comment on column public.tournaments.discord_announcement_message_id is
  'Discord webhook message id of the successful tournament announcement.';
comment on column public.tournaments.discord_announcement_error is
  'Last server-side Discord announcement error, if delivery failed.';
