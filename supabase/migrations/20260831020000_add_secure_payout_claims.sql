-- Secure payout claims. Sensitive payment data is separated from the payout ledger,
-- never returned in ordinary payout lists, access is audited, and it is purged after payout.

alter table public.profiles add column if not exists age_confirmed_at timestamptz;

create table if not exists public.payout_payment_details (
  payout_id uuid primary key references public.payout_records(id) on delete restrict,
  payment_method text not null check (payment_method in ('bank_transfer', 'paypal')),
  account_holder text,
  iban text,
  paypal_email text,
  age_confirmed_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  purge_after timestamptz,
  check (
    (payment_method = 'bank_transfer' and account_holder is not null and iban is not null and paypal_email is null)
    or (payment_method = 'paypal' and paypal_email is not null and account_holder is null and iban is null)
  )
);

create table if not exists public.payout_payment_details_audit (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payout_records(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('submitted', 'viewed', 'deleted', 'purged')),
  created_at timestamptz not null default now()
);

create index if not exists payout_payment_details_purge_idx on public.payout_payment_details(purge_after) where purge_after is not null;
create index if not exists payout_payment_details_audit_payout_idx on public.payout_payment_details_audit(payout_id, created_at desc);

alter table public.payout_payment_details enable row level security;
alter table public.payout_payment_details_audit enable row level security;
revoke all on table public.payout_payment_details, public.payout_payment_details_audit from anon, authenticated;

create or replace function public.get_my_payouts()
returns table(
  id uuid, source_label text, amount_cents integer, currency text, status text,
  due_at timestamptz, paid_at timestamptz, payment_method text,
  details_submitted_at timestamptz, age_confirmed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.source_label, p.amount_cents, p.currency, p.status,
         p.due_at, p.paid_at, d.payment_method, d.submitted_at, d.age_confirmed_at
  from public.payout_records p
  join public.profiles me on me.id = p.recipient_profile_id
  left join public.payout_payment_details d on d.payout_id = p.id
  where me."supabaseId" = auth.uid()::text
  order by p.created_at desc;
$$;

create or replace function public.submit_my_payout_details(
  p_payout_id uuid,
  p_payment_method text,
  p_account_holder text default null,
  p_iban text default null,
  p_paypal_email text default null,
  p_age_confirmed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_account_holder text := nullif(left(trim(coalesce(p_account_holder, '')), 160), '');
  v_iban text := nullif(upper(regexp_replace(trim(coalesce(p_iban, '')), '\s+', '', 'g')), '');
  v_paypal_email text := nullif(lower(left(trim(coalesce(p_paypal_email, '')), 254)), '');
  v_payout public.payout_records%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(p_age_confirmed, false) is not true then raise exception 'AGE_CONFIRMATION_REQUIRED'; end if;
  if v_method not in ('bank_transfer', 'paypal') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if v_method = 'bank_transfer' and (v_account_holder is null or v_iban is null or v_iban !~ '^[A-Z]{2}[A-Z0-9]{13,32}$') then
    raise exception 'INVALID_BANK_DETAILS';
  end if;
  if v_method = 'paypal' and (v_paypal_email is null or v_paypal_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'INVALID_PAYPAL_EMAIL';
  end if;

  select p.* into v_payout
  from public.payout_records p
  join public.profiles me on me.id = p.recipient_profile_id
  where p.id = p_payout_id and me."supabaseId" = auth.uid()::text
  for update of p;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v_payout.status in ('paid', 'cancelled') then raise exception 'PAYOUT_NOT_EDITABLE'; end if;

  insert into public.payout_payment_details(
    payout_id, payment_method, account_holder, iban, paypal_email, age_confirmed_at, submitted_at, updated_at, purge_after
  ) values (
    v_payout.id, v_method,
    case when v_method = 'bank_transfer' then v_account_holder else null end,
    case when v_method = 'bank_transfer' then v_iban else null end,
    case when v_method = 'paypal' then v_paypal_email else null end,
    now(), now(), now(), null
  ) on conflict (payout_id) do update set
    payment_method = excluded.payment_method,
    account_holder = excluded.account_holder,
    iban = excluded.iban,
    paypal_email = excluded.paypal_email,
    age_confirmed_at = excluded.age_confirmed_at,
    updated_at = now(),
    purge_after = null;

  update public.profiles set age_confirmed_at = coalesce(age_confirmed_at, now())
  where "supabaseId" = auth.uid()::text;

  update public.payout_records
  set status = case when status = 'on_hold' then status else 'ready' end,
      updated_by = auth.uid(), updated_at = now()
  where id = v_payout.id;

  insert into public.payout_payment_details_audit(payout_id, actor_id, action)
  values (v_payout.id, auth.uid(), 'submitted');
end;
$$;

create or replace function public.admin_request_payout_details(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_payout public.payout_records%rowtype; v_user_id uuid;
begin
  perform public.admin_require_payout_access();
  select * into v_payout from public.payout_records where id = p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v_payout.status in ('paid', 'cancelled') then raise exception 'PAYOUT_NOT_EDITABLE'; end if;
  select "supabaseId"::uuid into v_user_id from public.profiles where id = v_payout.recipient_profile_id;
  if v_user_id is null then raise exception 'RECIPIENT_NOT_FOUND'; end if;

  update public.payout_records set status = 'details_requested', updated_by = auth.uid(), updated_at = now() where id = v_payout.id;
  insert into public.notifications(user_id, type, title, body, href)
  values (v_user_id, 'payout_details_requested', 'Auszahlung bereit', 'Für deine Auszahlung „' || v_payout.source_label || '“ benötigen wir noch deinen gewünschten Zahlungsweg.', '/account/payouts');
end;
$$;

create or replace function public.admin_get_payout_payment_details(p_payout_id uuid)
returns table(
  payment_method text, account_holder text, iban text, paypal_email text,
  age_confirmed_at timestamptz, submitted_at timestamptz, purge_after timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require_payout_access();
  if not exists (select 1 from public.payout_payment_details where payout_id = p_payout_id) then
    raise exception 'PAYMENT_DETAILS_NOT_FOUND';
  end if;
  insert into public.payout_payment_details_audit(payout_id, actor_id, action) values (p_payout_id, auth.uid(), 'viewed');
  return query
    select d.payment_method, d.account_holder, d.iban, d.paypal_email, d.age_confirmed_at, d.submitted_at, d.purge_after
    from public.payout_payment_details d where d.payout_id = p_payout_id;
end;
$$;

create or replace function public.admin_delete_payout_payment_details(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  perform public.admin_require_payout_access();
  select status into v_status from public.payout_records where id = p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v_status not in ('paid', 'cancelled') then raise exception 'PAYMENT_DETAILS_CAN_ONLY_BE_DELETED_AFTER_FINALISATION'; end if;
  if not exists (select 1 from public.payout_payment_details where payout_id = p_payout_id) then return; end if;
  delete from public.payout_payment_details where payout_id = p_payout_id;
  insert into public.payout_payment_details_audit(payout_id, actor_id, action) values (p_payout_id, auth.uid(), 'deleted');
end;
$$;

create or replace function public.schedule_payout_details_purge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.payout_payment_details set purge_after = now() + interval '30 days' where payout_id = new.id;
  elsif old.status = 'paid' and new.status is distinct from 'paid' then
    update public.payout_payment_details set purge_after = null where payout_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists payout_details_purge_schedule on public.payout_records;
create trigger payout_details_purge_schedule
after update of status on public.payout_records
for each row execute function public.schedule_payout_details_purge();

create or replace function public.purge_expired_payout_payment_details()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  with deleted as (
    delete from public.payout_payment_details
    where purge_after is not null and purge_after <= now()
    returning payout_id
  ), logged as (
    insert into public.payout_payment_details_audit(payout_id, actor_id, action)
    select payout_id, null, 'purged' from deleted
    returning 1
  ) select count(*) into v_count from logged;
  return v_count;
end;
$$;

revoke all on function public.get_my_payouts() from public;
revoke all on function public.submit_my_payout_details(uuid, text, text, text, text, boolean) from public;
revoke all on function public.admin_request_payout_details(uuid) from public;
revoke all on function public.admin_get_payout_payment_details(uuid) from public;
revoke all on function public.admin_delete_payout_payment_details(uuid) from public;
revoke all on function public.purge_expired_payout_payment_details() from public;
grant execute on function public.get_my_payouts() to authenticated;
grant execute on function public.submit_my_payout_details(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_request_payout_details(uuid) to authenticated;
grant execute on function public.admin_get_payout_payment_details(uuid) to authenticated;
grant execute on function public.admin_delete_payout_payment_details(uuid) to authenticated;

create extension if not exists pg_cron with schema extensions;
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'purge-payout-payment-details';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('purge-payout-payment-details', '15 3 * * *', 'select public.purge_expired_payout_payment_details()');
end;
$$;

comment on table public.payout_payment_details is 'Restricted payment details used exclusively to pay a winner. Automatically purged 30 days after payment; never expose in ordinary admin payout lists.';
