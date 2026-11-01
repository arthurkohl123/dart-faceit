-- The first Duo migration is already live. Apply the same fixed search paths
-- to its two pure helper functions on the hosted database.
alter function public.duo_is_member(public.duo_matches, uuid) set search_path = public;
alter function public.duo_team_for_user(public.duo_matches, uuid) set search_path = public;
