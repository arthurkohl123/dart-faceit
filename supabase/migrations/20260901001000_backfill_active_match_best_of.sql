-- Some production databases predate the match-format migration. Private
-- challenges store their selected Best-of format on active_matches, so add the
-- missing column safely and give every existing room the historic Best-of-7.
alter table public.active_matches
  add column if not exists best_of integer not null default 7;

alter table public.active_matches
  alter column best_of set default 7;

update public.active_matches
set best_of = 7
where best_of is null or best_of not in (3, 5, 7, 9, 11, 13, 15, 17, 19, 21);

alter table public.active_matches
  alter column best_of set not null;

alter table public.active_matches
  drop constraint if exists active_matches_best_of_check,
  add constraint active_matches_best_of_check
    check (best_of in (3, 5, 7, 9, 11, 13, 15, 17, 19, 21));
