-- Supabase grants EXECUTE to API roles by default when functions are created.
-- Keep the public status readable only for signed-in players and leave the
-- developer mutation protected by its server-side is_developer check.

revoke all on function public.get_duo_matchmaking_queue_status() from public, anon;
grant execute on function public.get_duo_matchmaking_queue_status() to authenticated;

revoke all on function public.dev_set_duo_matchmaking_queue(boolean, text) from public, anon;
grant execute on function public.dev_set_duo_matchmaking_queue(boolean, text) to authenticated;

revoke all on function public.enforce_duo_matchmaking_queue_enabled() from public, anon, authenticated;
