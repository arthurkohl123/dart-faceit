-- The original matcher predates AutoDarts and still rejected it internally.
-- Keep the already-live function body intact and update only its platform
-- allow-list so all three first-class queues use the identical matcher.
do $$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef('public.find_or_create_match(integer,text)'::regprocedure)
  into v_definition;

  v_before := v_definition;
  v_definition := regexp_replace(
    v_definition,
    'p_app[[:space:]]+not[[:space:]]+in[[:space:]]*[(]''scolia'',[[:space:]]*''dartcounter''[)]',
    'p_app not in (''scolia'', ''dartcounter'', ''autodarts'')'
  );

  if v_definition = v_before then
    raise exception 'Could not update the AutoDarts matcher allow-list.';
  end if;

  execute v_definition;
end;
$$;
