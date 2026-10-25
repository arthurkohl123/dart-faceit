alter function public.is_mod_or_admin() set search_path = public;
revoke all on function public.is_mod_or_admin() from public, anon;
grant execute on function public.is_mod_or_admin() to authenticated;
