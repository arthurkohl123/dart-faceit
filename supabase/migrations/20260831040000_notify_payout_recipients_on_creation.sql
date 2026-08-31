-- A payout is actionable as soon as an admin creates it: notify the recipient
-- and request their payout details immediately.
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
  v_user_id uuid;
begin
  perform public.admin_require_payout_access();
  if v_source_type not in ('season', 'tournament', 'manual') then raise exception 'INVALID_SOURCE_TYPE'; end if;
  if v_source_id is null or char_length(v_source_id) > 160 then raise exception 'INVALID_SOURCE_ID'; end if;
  if v_source_label is null or char_length(v_source_label) > 240 then raise exception 'INVALID_SOURCE_LABEL'; end if;
  if coalesce(p_amount_cents, 0) <= 0 or p_amount_cents > 100000000 then raise exception 'INVALID_AMOUNT'; end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  v_user_id := v_profile."supabaseId"::uuid;
  if v_user_id is null then raise exception 'RECIPIENT_NOT_FOUND'; end if;

  insert into public.payout_records(
    recipient_profile_id, recipient_username, source_type, source_id, source_label,
    amount_cents, status, due_at, internal_note, created_by, updated_by
  ) values (
    v_profile.id, coalesce(v_profile.username, 'Unbekannt'), v_source_type, v_source_id, v_source_label,
    p_amount_cents, 'details_requested', p_due_at, v_note, auth.uid(), auth.uid()
  ) returning * into v_payout;

  insert into public.payout_audit_log(payout_id, actor_id, action, next_status)
  values (v_payout.id, auth.uid(), 'created', v_payout.status);

  insert into public.notifications(user_id, type, title, body, href)
  values (
    v_user_id,
    'payout_details_requested',
    'Preisgeld: Zahlungsdaten benötigt',
    'Für deine Auszahlung „' || v_payout.source_label || '“ hinterlege bitte jetzt deinen gewünschten Zahlungsweg.',
    '/account/payouts'
  );

  return v_payout;
end;
$$;

-- Backfill payouts created before the direct-notification workflow.
with promoted as (
  update public.payout_records
  set status = 'details_requested', updated_at = now()
  where status = 'open'
  returning id, recipient_profile_id, source_label
), recipients as (
  select promoted.id, promoted.source_label, p."supabaseId"::uuid as user_id
  from promoted join public.profiles p on p.id = promoted.recipient_profile_id
)
insert into public.notifications(user_id, type, title, body, href)
select
  user_id,
  'payout_details_requested',
  'Preisgeld: Zahlungsdaten benötigt',
  'Für deine Auszahlung „' || source_label || '“ hinterlege bitte jetzt deinen gewünschten Zahlungsweg.',
  '/account/payouts'
from recipients
where user_id is not null;
