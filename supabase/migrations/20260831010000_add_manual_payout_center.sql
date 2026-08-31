-- Manual payout ledger for season and tournament prizes.
-- Payment details (IBAN, PayPal address, etc.) deliberately do not belong here.

create table if not exists public.payout_records (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  recipient_username text not null,
  source_type text not null check (source_type in ('season', 'tournament', 'manual')),
  source_id text not null check (char_length(source_id) between 1 and 160),
  source_label text not null check (char_length(source_label) between 1 and 240),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  currency text not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'open' check (status in ('open', 'details_requested', 'ready', 'paid', 'on_hold', 'cancelled')),
  payment_method text check (payment_method in ('bank_transfer', 'paypal', 'other')),
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 160),
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  due_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists payout_records_status_due_idx on public.payout_records(status, due_at asc nulls last);
create index if not exists payout_records_recipient_idx on public.payout_records(recipient_profile_id, created_at desc);

create table if not exists public.payout_audit_log (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payout_records(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('created', 'updated')),
  previous_status text,
  next_status text,
  created_at timestamptz not null default now()
);

create index if not exists payout_audit_log_payout_idx on public.payout_audit_log(payout_id, created_at desc);

alter table public.payout_records enable row level security;
alter table public.payout_audit_log enable row level security;
revoke all on table public.payout_records, public.payout_audit_log from anon, authenticated;

create or replace function public.admin_require_payout_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.profiles
    where "supabaseId" = auth.uid()::text and coalesce(is_admin, false) = true
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;
end;
$$;

create or replace function public.admin_list_payouts(p_status text default null)
returns table(
  id uuid, recipient_profile_id uuid, recipient_username text, source_type text, source_id text,
  source_label text, amount_cents integer, currency text, status text, payment_method text,
  payment_reference text, internal_note text, due_at timestamptz, paid_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id, p.recipient_profile_id, p.recipient_username, p.source_type, p.source_id,
    p.source_label, p.amount_cents, p.currency, p.status, p.payment_method,
    p.payment_reference, p.internal_note, p.due_at, p.paid_at, p.created_at, p.updated_at
  from public.payout_records p
  where (p_status is null or p.status = p_status)
    and exists (
      select 1 from public.profiles me
      where me."supabaseId" = auth.uid()::text and coalesce(me.is_admin, false) = true
    )
  order by
    case p.status when 'open' then 0 when 'details_requested' then 1 when 'ready' then 2 when 'on_hold' then 3 when 'paid' then 4 else 5 end,
    p.due_at asc nulls last,
    p.created_at desc
  limit 500;
$$;

create or replace function public.admin_get_payout_candidates(p_season_label text default 'Season 01')
returns table(
  source_type text, source_id text, source_label text, recipient_profile_id uuid,
  recipient_username text, suggested_amount_cents integer, already_created boolean
)
language sql
security definer
set search_path = public
as $$
  with access as (
    select 1
    from public.profiles me
    where me."supabaseId" = auth.uid()::text and coalesce(me.is_admin, false) = true
  ), season_leaderboard as (
    select p.id as profile_id, coalesce(p.username, 'Unbekannt') as username,
           row_number() over (order by coalesce(p.elo, 1000) desc, p.id) as placement
    from public.profiles p
    where coalesce(p."gamesPlayed", 0) > 0 and coalesce(p.is_banned, false) = false
  ), season_candidates as (
    select
      'season'::text as source_type,
      lower(trim(coalesce(p_season_label, 'Season 01'))) || ':platz:' || placement::text as source_id,
      trim(coalesce(p_season_label, 'Season 01')) || ' · Platz ' || placement::text as source_label,
      profile_id as recipient_profile_id,
      username as recipient_username,
      case placement when 1 then 17500 when 2 then 10000 when 3 then 7500 when 4 then 5000 when 5 then 3000 end as suggested_amount_cents
    from season_leaderboard
    where placement <= 5
  ), tournament_candidates as (
    select
      'tournament'::text as source_type,
      t.id::text as source_id,
      t.title as source_label,
      p.id as recipient_profile_id,
      coalesce(p.username, 'Unbekannt') as recipient_username,
      null::integer as suggested_amount_cents
    from public.tournaments t
    join public.profiles p on p."supabaseId" = t.winner_id::text
    where t.status = 'completed' and t.winner_id is not null
  ), candidates as (
    select * from season_candidates
    union all
    select * from tournament_candidates
  )
  select c.source_type, c.source_id, c.source_label, c.recipient_profile_id,
         c.recipient_username, c.suggested_amount_cents,
         exists(select 1 from public.payout_records pr where pr.source_type = c.source_type and pr.source_id = c.source_id) as already_created
  from candidates c
  where exists (select 1 from access)
  order by case c.source_type when 'season' then 0 else 1 end, c.source_label;
$$;

create or replace function public.admin_create_payout(
  p_profile_id uuid,
  p_source_type text,
  p_source_id text,
  p_source_label text,
  p_amount_cents integer,
  p_due_at timestamptz default null,
  p_internal_note text default null
)
returns public.payout_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_source_type text := lower(trim(coalesce(p_source_type, '')));
  v_source_id text := nullif(trim(coalesce(p_source_id, '')), '');
  v_source_label text := nullif(trim(coalesce(p_source_label, '')), '');
  v_note text := nullif(left(trim(coalesce(p_internal_note, '')), 2000), '');
  v_payout public.payout_records%rowtype;
begin
  perform public.admin_require_payout_access();
  if v_source_type not in ('season', 'tournament', 'manual') then raise exception 'INVALID_SOURCE_TYPE'; end if;
  if v_source_id is null or char_length(v_source_id) > 160 then raise exception 'INVALID_SOURCE_ID'; end if;
  if v_source_label is null or char_length(v_source_label) > 240 then raise exception 'INVALID_SOURCE_LABEL'; end if;
  if coalesce(p_amount_cents, 0) <= 0 or p_amount_cents > 100000000 then raise exception 'INVALID_AMOUNT'; end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into public.payout_records(
    recipient_profile_id, recipient_username, source_type, source_id, source_label,
    amount_cents, due_at, internal_note, created_by, updated_by
  ) values (
    v_profile.id, coalesce(v_profile.username, 'Unbekannt'), v_source_type, v_source_id, v_source_label,
    p_amount_cents, p_due_at, v_note, auth.uid(), auth.uid()
  ) returning * into v_payout;

  insert into public.payout_audit_log(payout_id, actor_id, action, next_status)
  values (v_payout.id, auth.uid(), 'created', v_payout.status);

  return v_payout;
end;
$$;

create or replace function public.admin_update_payout(
  p_payout_id uuid,
  p_status text,
  p_payment_method text default null,
  p_payment_reference text default null,
  p_internal_note text default null
)
returns public.payout_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_method text := nullif(lower(trim(coalesce(p_payment_method, ''))), '');
  v_reference text := nullif(left(trim(coalesce(p_payment_reference, '')), 160), '');
  v_note text := nullif(left(trim(coalesce(p_internal_note, '')), 2000), '');
  v_before public.payout_records%rowtype;
  v_payout public.payout_records%rowtype;
begin
  perform public.admin_require_payout_access();
  if v_status not in ('open', 'details_requested', 'ready', 'paid', 'on_hold', 'cancelled') then raise exception 'INVALID_PAYOUT_STATUS'; end if;
  if v_method is not null and v_method not in ('bank_transfer', 'paypal', 'other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if v_status = 'paid' and v_method is null then raise exception 'PAYMENT_METHOD_REQUIRED'; end if;

  select * into v_before from public.payout_records where id = p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;

  update public.payout_records
  set status = v_status,
      payment_method = v_method,
      payment_reference = v_reference,
      internal_note = v_note,
      paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_payout_id
  returning * into v_payout;

  insert into public.payout_audit_log(payout_id, actor_id, action, previous_status, next_status)
  values (v_payout.id, auth.uid(), 'updated', v_before.status, v_payout.status);

  return v_payout;
end;
$$;

revoke all on function public.admin_require_payout_access() from public;
revoke all on function public.admin_list_payouts(text) from public;
revoke all on function public.admin_get_payout_candidates(text) from public;
revoke all on function public.admin_create_payout(uuid, text, text, text, integer, timestamptz, text) from public;
revoke all on function public.admin_update_payout(uuid, text, text, text, text) from public;
grant execute on function public.admin_list_payouts(text) to authenticated;
grant execute on function public.admin_get_payout_candidates(text) to authenticated;
grant execute on function public.admin_create_payout(uuid, text, text, text, integer, timestamptz, text) to authenticated;
grant execute on function public.admin_update_payout(uuid, text, text, text, text) to authenticated;

comment on table public.payout_records is 'Administrative payout ledger. Never store IBANs, PayPal addresses, or other payment credentials in this table.';
