-- Prize tournaments retain their normal payout-term confirmation, but must not
-- require a minimum account age or a minimum number of ranked matches.
begin;
set local lock_timeout = '5s';

create or replace function public.join_tournament(
  p_tournament_id uuid,
  p_access_code text default null,
  p_accept_payout_terms boolean default false
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_t public.tournaments%rowtype;
  v_profile record;
  v_average numeric;
  v_count integer;
  v_status text;
  v_position integer;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;

  select * into v_t
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then raise exception 'Turnier nicht gefunden.'; end if;
  if v_t.status <> 'registration' or now() > v_t.registration_closes_at then raise exception 'Die Anmeldung ist geschlossen.'; end if;
  if v_t.access_code_hash is not null and md5(upper(trim(coalesce(p_access_code, '')))) <> v_t.access_code_hash then raise exception 'Der Turniercode ist ungültig.'; end if;
  if v_t.prize_title is not null and p_accept_payout_terms is not true then
    raise exception 'Bitte bestätige vor der Anmeldung die Auszahlungsfrist für dieses Turnier.';
  end if;
  if exists (
    select 1
    from public.tournament_participants
    where tournament_id = p_tournament_id
      and user_id = auth.uid()
      and status not in ('withdrawn', 'removed', 'disqualified')
  ) then raise exception 'Du bist bereits angemeldet.'; end if;

  select username, scolia_username, dartcounter_username, autodarts_username into v_profile
  from public.profiles
  where "supabaseId" = auth.uid()::text;
  if v_profile.username is null then raise exception 'Dein Profil konnte nicht geladen werden.'; end if;
  if v_t.premium_only and not public.has_active_premium(auth.uid()) then raise exception 'Dieses Turnier ist nur für Premium-Mitglieder.'; end if;
  if v_t.scoring_platform = 'scolia' and nullif(trim(coalesce(v_profile.scolia_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen Scolia-Namen im Profil.'; end if;
  if v_t.scoring_platform = 'dartcounter' and nullif(trim(coalesce(v_profile.dartcounter_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen DartCounter-Namen im Profil.'; end if;
  if v_t.scoring_platform = 'autodarts' and nullif(trim(coalesce(v_profile.autodarts_username, '')), '') is null then raise exception 'Bitte hinterlege zuerst deinen AutoDarts-Namen im Profil.'; end if;

  v_average := public.tournament_player_average(auth.uid());
  if v_t.max_average is not null and coalesce(v_average, 0) > v_t.max_average then raise exception 'Dein Average liegt über dem erlaubten Limit.'; end if;
  if v_t.min_average is not null and coalesce(v_average, 0) < v_t.min_average then raise exception 'Dein Average liegt unter dem erforderlichen Limit.'; end if;

  select count(*) into v_count
  from public.tournament_participants
  where tournament_id = p_tournament_id
    and status in ('registered', 'checked_in');

  v_status := case when v_count >= v_t.max_players then 'waitlisted' else 'registered' end;
  if v_status = 'waitlisted' then
    select coalesce(max(waitlist_position), 0) + 1 into v_position
    from public.tournament_participants
    where tournament_id = p_tournament_id
      and status = 'waitlisted';
  end if;

  delete from public.tournament_participants
  where tournament_id = p_tournament_id
    and user_id = auth.uid()
    and status in ('withdrawn', 'removed', 'disqualified');

  insert into public.tournament_participants(tournament_id, user_id, username, average_snapshot, status, waitlist_position)
  values (p_tournament_id, auth.uid(), v_profile.username, v_average, v_status, v_position);

  if v_t.prize_title is not null then
    insert into public.tournament_rule_acceptances(
      tournament_id, user_id, rules_version, payout_deadline_days, terms_snapshot
    )
    values (
      v_t.id, auth.uid(), v_t.payout_terms_version, v_t.payout_deadline_days, v_t.payout_terms_snapshot
    )
    on conflict (tournament_id, user_id, rules_version) do nothing;
  end if;

  return v_status;
end;
$$;
revoke all on function public.join_tournament(uuid, text, boolean) from public, anon;
grant execute on function public.join_tournament(uuid, text, boolean) to authenticated;

drop function if exists public.get_my_prize_tournament_eligibility();

commit;
