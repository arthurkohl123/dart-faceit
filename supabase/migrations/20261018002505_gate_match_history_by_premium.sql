-- Match-History access is a Premium entitlement.  The database, rather than
-- the browser, is authoritative: Free accounts can read their last 7 days and
-- active Premium accounts their last 90 days.
--
-- The old Performance-Labor endpoint is no longer presented anywhere.  Its
-- one-time platform backfill remains in its already-applied migration; only
-- the unused RPC is retired here.
drop function if exists public.get_my_premium_performance(integer);

drop policy if exists "Users can view own match history" on public.matches;
create policy "Users can view own match history"
  on public.matches for select to authenticated
  using (
    (select auth.uid()) = user_id
    and completed_at >= now() - case
      when (select public.has_active_premium((select auth.uid()))) then interval '90 days'
      else interval '7 days'
    end
  );

comment on policy "Users can view own match history" on public.matches is
  'Own match history: last 7 days for Free, last 90 days for active Premium. The application narrows Premium views to 7, 30, or 90 days.';
