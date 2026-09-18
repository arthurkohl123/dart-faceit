-- SQL-language functions cannot reliably enforce a guard in a WHERE clause
-- when the underlying table is empty. Guard first, then return the dataset.

create or replace function public.admin_list_cases(p_status text default null)
returns table (id uuid, profile_id uuid, username text, title text, summary text, case_type text, priority text, status text, owner_username text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.admin_require_operations_access('read');
  return query
  select c.id,c.profile_id,p.username,c.title,c.summary,c.case_type,c.priority,c.status,owner.username,c.created_at,c.updated_at
  from public.admin_cases c join public.profiles p on p.id=c.profile_id left join public.profiles owner on owner.id=c.owner_profile_id
  where p_status is null or c.status=p_status
  order by case c.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,c.updated_at desc;
end;
$$;

create or replace function public.admin_list_site_notices()
returns table (id uuid,title text,body text,tone text,href text,is_active boolean,starts_at timestamptz,expires_at timestamptz,created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.admin_require_operations_access('admin');
  return query
  select n.id,n.title,n.body,n.tone,n.href,n.is_active,n.starts_at,n.expires_at,n.created_at
  from public.site_notices n order by n.is_active desc,n.starts_at desc;
end;
$$;

revoke all on function public.admin_list_cases(text), public.admin_list_site_notices() from public, anon;
grant execute on function public.admin_list_cases(text), public.admin_list_site_notices() to authenticated;
