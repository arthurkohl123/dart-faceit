-- Persistent, server-side rate limits. App keys are SHA-256 hashes, not raw IPs or emails.
create table if not exists public.rate_limit_buckets (
  key text primary key check (char_length(key) = 64),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_expires_at_idx on public.rate_limit_buckets (expires_at);
alter table public.rate_limit_buckets enable row level security;

create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql security definer set search_path = public
as $$
declare v_count integer; v_expires_at timestamptz;
begin
  if char_length(p_key) <> 64 or p_limit < 1 or p_window_seconds < 1 then raise exception 'invalid rate limit input'; end if;
  insert into public.rate_limit_buckets as buckets (key, window_started_at, request_count, expires_at, updated_at)
  values (p_key, now(), 1, now() + make_interval(secs => p_window_seconds), now())
  on conflict (key) do update set
    window_started_at = case when buckets.expires_at <= now() then now() else buckets.window_started_at end,
    request_count = case when buckets.expires_at <= now() then 1 else buckets.request_count + 1 end,
    expires_at = case when buckets.expires_at <= now() then now() + make_interval(secs => p_window_seconds) else buckets.expires_at end,
    updated_at = now()
  returning request_count, expires_at into v_count, v_expires_at;
  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  retry_after_seconds := greatest(1, ceil(extract(epoch from (v_expires_at - now())))::integer);
  return next;
end;
$$;

revoke all on table public.rate_limit_buckets from anon, authenticated;
revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
