-- This function is an internal implementation detail called by the admin
-- entry point and database automation; browser API roles must not call it.
revoke all on function public.start_tournament_bracket_internal(uuid) from anon, authenticated;
