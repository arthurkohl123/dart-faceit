-- Persistent handover notes keep the admin team aligned between shifts.
-- The table has no direct Data API access; every operation goes through the
-- permission-checked RPCs below.
create table if not exists public.admin_shift_handoffs (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 3 and 1500),
  is_pinned boolean not null default false,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists admin_shift_handoffs_open_idx
  on public.admin_shift_handoffs (is_pinned desc, created_at desc)
  where status = 'open';

alter table public.admin_shift_handoffs enable row level security;
revoke all on table public.admin_shift_handoffs from public, anon, authenticated;

create or replace function public.admin_list_shift_handoffs(p_status text default 'open')
returns table (
  id uuid,
  body text,
  is_pinned boolean,
  status text,
  created_at timestamptz,
  created_by_username text,
  resolved_at timestamptz,
  resolved_by_username text
)
language sql
security definer
set search_path = public
as $$
  select
    handoff.id,
    handoff.body,
    handoff.is_pinned,
    handoff.status,
    handoff.created_at,
    coalesce(author.username, 'Admin') as created_by_username,
    handoff.resolved_at,
    resolver.username as resolved_by_username
  from public.admin_shift_handoffs handoff
  left join public.profiles author on author."supabaseId" = handoff.created_by::text
  left join public.profiles resolver on resolver."supabaseId" = handoff.resolved_by::text
  where public.admin_require_operations_access('admin') is not null
    and (p_status is null or handoff.status = p_status)
  order by handoff.is_pinned desc, handoff.created_at desc;
$$;

create or replace function public.admin_create_shift_handoff(
  p_body text,
  p_is_pinned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public.admin_require_operations_access('admin');

  if char_length(v_body) < 3 or char_length(v_body) > 1500 then
    raise exception 'Eine Schichtnotiz muss zwischen 3 und 1.500 Zeichen lang sein.';
  end if;

  insert into public.admin_shift_handoffs (body, is_pinned, created_by)
  values (v_body, coalesce(p_is_pinned, false), auth.uid())
  returning id into v_id;

  insert into public.admin_logs (admin_id, admin_username, action, target_type, target_id, target_label, details)
  select auth.uid(), coalesce(profile.username, 'Admin'), 'ADMIN_SHIFT_NOTE_CREATED', 'shift_handoff', v_id::text, 'Schichtnotiz', left(v_body, 180)
  from public.profiles profile
  where profile."supabaseId" = auth.uid()::text;

  return v_id;
end;
$$;

create or replace function public.admin_update_shift_handoff(
  p_handoff_id uuid,
  p_status text default null,
  p_is_pinned boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := coalesce(p_status, 'open');
begin
  perform public.admin_require_operations_access('admin');

  if v_status not in ('open', 'resolved') then
    raise exception 'Ungültiger Status für die Schichtnotiz.';
  end if;

  update public.admin_shift_handoffs
  set
    status = coalesce(p_status, status),
    is_pinned = coalesce(p_is_pinned, is_pinned),
    resolved_by = case when coalesce(p_status, status) = 'resolved' then auth.uid() else null end,
    resolved_at = case when coalesce(p_status, status) = 'resolved' then now() else null end,
    updated_at = now()
  where id = p_handoff_id;

  if not found then
    raise exception 'Schichtnotiz nicht gefunden.';
  end if;

  insert into public.admin_logs (admin_id, admin_username, action, target_type, target_id, target_label, details)
  select auth.uid(), coalesce(profile.username, 'Admin'), 'ADMIN_SHIFT_NOTE_UPDATED', 'shift_handoff', p_handoff_id::text, 'Schichtnotiz', concat('status=', coalesce(p_status, 'unverändert'), ', pinned=', coalesce(p_is_pinned::text, 'unverändert'))
  from public.profiles profile
  where profile."supabaseId" = auth.uid()::text;
end;
$$;

revoke all on function public.admin_list_shift_handoffs(text) from public, anon;
revoke all on function public.admin_create_shift_handoff(text, boolean) from public, anon;
revoke all on function public.admin_update_shift_handoff(uuid, text, boolean) from public, anon;
grant execute on function public.admin_list_shift_handoffs(text) to authenticated;
grant execute on function public.admin_create_shift_handoff(text, boolean) to authenticated;
grant execute on function public.admin_update_shift_handoff(uuid, text, boolean) to authenticated;

comment on table public.admin_shift_handoffs is
  'Private, audit-logged admin handover notes for pending operational work.';
