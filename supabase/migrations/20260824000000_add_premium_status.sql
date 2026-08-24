alter table public.profiles
  add column if not exists "isPremium" boolean not null default false;

