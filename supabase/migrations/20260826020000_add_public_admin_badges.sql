-- Public admin markers for trusted profile badges.
-- Only the public account id is exposed; no private profile fields are returned.

create or replace function public.get_public_admin_profile_ids()
returns table(profile_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select p."supabaseId"::text
  from public.profiles p
  where coalesce(p.is_admin, false) = true
    and p."supabaseId" is not null;
$$;

revoke all on function public.get_public_admin_profile_ids() from public;
grant execute on function public.get_public_admin_profile_ids() to anon, authenticated;

comment on function public.get_public_admin_profile_ids() is
  'Returns public profile ids that should display the official RankedDarts admin badge.';
