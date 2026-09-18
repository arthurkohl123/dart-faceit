-- The recorder is an implementation detail for SECURITY DEFINER triggers.
-- It must not be executable from an authenticated client session.
revoke all on function public.record_growth_funnel_event(uuid, text, timestamptz) from public, anon, authenticated;
