-- The legacy matcher predates a per-match format column. The hardened
-- submit function reads this column, so old and new ranked matches need a
-- safe Best-of-7 default.
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
  drop constraint if exists active_matches_best_of_check;

alter table public.active_matches
  add constraint active_matches_best_of_check
  check (best_of in (3, 5, 7, 9, 11, 13, 15, 17, 19, 21));
