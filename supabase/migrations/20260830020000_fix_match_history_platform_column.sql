-- copy_match_platform_to_history() is already active and fills the platform
-- from active_matches. The history table must expose the target column before
-- any result can be finalized.
alter table public.matches
  add column if not exists app text;

alter table public.matches
  drop constraint if exists matches_app_check,
  add constraint matches_app_check
    check (app is null or app in ('scolia', 'dartcounter', 'autodarts'));

create index if not exists matches_app_created_at_idx
  on public.matches (app, created_at desc);
