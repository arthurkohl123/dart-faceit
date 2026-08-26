-- Privacy-safe, explainable signals for repeated pairings. This never stores IPs,
-- device fingerprints or raw telemetry; it only records match-derived review flags.
create table if not exists public.fairness_risk_flags (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null,
  player1_id uuid not null references auth.users(id) on delete cascade,
  player2_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('repeated_pairing')),
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  occurrence_count integer not null default 0,
  context jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique(pair_key, reason)
);
create index if not exists fairness_risk_flags_open_idx on public.fairness_risk_flags(resolved_at, last_seen_at desc);
alter table public.fairness_risk_flags enable row level security;
revoke all on public.fairness_risk_flags from anon, authenticated;

create or replace function public.monitor_repeated_match_pairing()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_pair text;
  v_first uuid;
  v_second uuid;
  v_count integer;
begin
  if new.status <> 'completed' or new.user_id is null or new.opponent_id is null or new.user_id = new.opponent_id then return new; end if;
  if new.user_id::text < new.opponent_id::text then v_first := new.user_id; v_second := new.opponent_id;
  else v_first := new.opponent_id; v_second := new.user_id; end if;
  v_pair := v_first::text || ':' || v_second::text;
  select count(distinct active_match_id)::integer into v_count
  from public.matches
  where active_match_id is not null and created_at >= now() - interval '7 days'
    and ((user_id = v_first and opponent_id = v_second) or (user_id = v_second and opponent_id = v_first));
  if v_count >= 5 then
    insert into public.fairness_risk_flags(pair_key, player1_id, player2_id, reason, severity, occurrence_count, context, last_seen_at)
    values(v_pair, v_first, v_second, 'repeated_pairing', 'warning', v_count,
      jsonb_build_object('matches_last_7_days', v_count, 'threshold', 5), now())
    on conflict (pair_key, reason) do update set occurrence_count = excluded.occurrence_count,
      context = excluded.context, last_seen_at = now(), resolved_at = null, resolved_by = null;
  end if;
  return new;
end;
$$;
drop trigger if exists monitor_repeated_match_pairing_trigger on public.matches;
create trigger monitor_repeated_match_pairing_trigger after insert on public.matches
for each row execute function public.monitor_repeated_match_pairing();

create or replace function public.admin_get_fairness_risk_flags(p_limit integer default 100)
returns table(id uuid, player1_id uuid, player2_id uuid, player1_username text, player2_username text,
  reason text, severity text, occurrence_count integer, context jsonb, first_seen_at timestamptz, last_seen_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists(select 1 from public.profiles where "supabaseId" = auth.uid()::text and is_admin = true) then raise exception 'NOT_AUTHORIZED'; end if;
  return query select f.id, f.player1_id, f.player2_id,
    coalesce(p1.username, 'Unbekannt'), coalesce(p2.username, 'Unbekannt'), f.reason, f.severity,
    f.occurrence_count, f.context, f.first_seen_at, f.last_seen_at
  from public.fairness_risk_flags f
  left join public.profiles p1 on p1."supabaseId" = f.player1_id::text
  left join public.profiles p2 on p2."supabaseId" = f.player2_id::text
  where f.resolved_at is null order by f.last_seen_at desc limit greatest(1, least(p_limit, 200));
end;
$$;
revoke all on function public.admin_get_fairness_risk_flags(integer) from public;
grant execute on function public.admin_get_fairness_risk_flags(integer) to authenticated;

create or replace function public.admin_resolve_fairness_risk_flag(p_flag_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists(select 1 from public.profiles where "supabaseId" = auth.uid()::text and is_admin = true) then raise exception 'NOT_AUTHORIZED'; end if;
  update public.fairness_risk_flags set resolved_at = now(), resolved_by = auth.uid() where id = p_flag_id;
end;
$$;
revoke all on function public.admin_resolve_fairness_risk_flag(uuid) from public;
grant execute on function public.admin_resolve_fairness_risk_flag(uuid) to authenticated;
