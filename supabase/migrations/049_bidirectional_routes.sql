-- Treat either endpoint as the start, keeping finished results immutable.
BEGIN;
CREATE FUNCTION ledger_private.route_ordered(origin text,destination text,guessed jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 WITH chain AS (SELECT jsonb_build_array(origin)||guessed||jsonb_build_array(destination) AS path)
 SELECT NOT EXISTS(
  SELECT 1 FROM chain CROSS JOIN LATERAL generate_series(0,jsonb_array_length(path)-2) pos(n)
  WHERE NOT EXISTS(SELECT 1 FROM ledger_private.geography_route_edges
   WHERE (a=(path->>n) AND b=(path->>(n+1))) OR (b=(path->>n) AND a=(path->>(n+1))))
 );
$$;
REVOKE ALL ON FUNCTION ledger_private.route_ordered(text,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.utilities_geography_route_action(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.geography_routes;q ledger_private.geography_route_puzzles;choice text:=p->>'choice';before_route jsonb;after_route jsonb;tail jsonb;known jsonb;country text;quality text;useful boolean;n integer;budget integer;via integer;
BEGIN
 SELECT * INTO a FROM ledger_private.geography_routes WHERE id=(p->>'id')::uuid AND player=p->>'player' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Trail not found for this player';END IF;
 IF (p->>'revision')::integer IS NULL OR (p->>'revision')::integer>a.revision THEN RAISE EXCEPTION 'Refresh this trail before continuing';END IF;
 IF a.complete OR (p->>'revision')::integer<a.revision THEN RETURN to_jsonb(a);END IF;
 IF a.day<>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'A new daily trail is ready. Start today’s trail in settings';END IF;
 SELECT * INTO q FROM ledger_private.geography_route_puzzles WHERE id=a.puzzle_id;
 IF choice='back' OR choice IN(q.start,q.finish) OR a.guesses ? choice OR (a.rules_version=1 AND a.path ? choice) THEN RETURN to_jsonb(a);END IF;
 IF q.id<48 THEN q.minimum:=(ledger_private.route_remaining(q.start,q.finish,'[]')->>'missing')::integer+1;END IF;
 IF a.rules_version=1 THEN a.guesses:=coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(a.path) x WHERE x NOT IN(q.start,q.finish)),'[]');a.steps:=a.steps+a.mistakes;a.rules_version:=2;END IF;
 IF choice='back' OR choice IN(q.start,q.finish) OR a.guesses ? choice THEN RETURN to_jsonb(a);END IF;
 IF choice IS NULL OR (choice<>'give-up' AND NOT EXISTS(SELECT 1 FROM ledger_private.geography_catalog WHERE id=choice AND official)) THEN RAISE EXCEPTION 'Choose a country';END IF;
 IF choice='give-up' THEN a.complete:=true;a.notice:='revealed';
 ELSE
  before_route:=ledger_private.route_remaining(q.start,q.finish,a.guesses);
  a.guesses:=a.guesses||jsonb_build_array(choice);a.steps:=a.steps+1;
  after_route:=ledger_private.route_remaining(q.start,q.finish,a.guesses);known:=a.guesses||jsonb_build_array(q.start,q.finish);a.path:='[]';
  FOR country IN SELECT jsonb_array_elements_text(after_route->'path') LOOP EXIT WHEN NOT known ? country;a.path:=a.path||jsonb_build_array(country);END LOOP;
  IF jsonb_array_length(a.path)=0 THEN a.path:=jsonb_build_array(q.start);END IF;
  useful:=(after_route->>'missing')::integer<(before_route->>'missing')::integer;
  IF useful THEN
   tail:='[]';
   FOR country IN SELECT t.value FROM jsonb_array_elements_text(after_route->'path') WITH ORDINALITY t(value,ord) ORDER BY t.ord DESC LOOP EXIT WHEN NOT known ? country;tail:=tail||jsonb_build_array(country);END LOOP;
   quality:=CASE WHEN a.path ? choice OR tail ? choice THEN 'connected' ELSE 'useful' END;
  ELSE
   via:=(ledger_private.route_remaining(q.start,choice,a.guesses)->>'missing')::integer+(ledger_private.route_remaining(choice,q.finish,a.guesses)->>'missing')::integer;
   quality:=CASE WHEN via<=(after_route->>'missing')::integer+1 THEN 'detour' ELSE 'miss' END;a.mistakes:=a.mistakes+1;
  END IF;
  a.feedback:=a.feedback||jsonb_build_array(jsonb_build_object('country',choice,'quality',quality));a.notice:=quality;
  IF NOT a.discovered ? choice THEN a.discovered:=a.discovered||jsonb_build_array(choice);END IF;
  n:=q.minimum-1;budget:=n+CASE WHEN n<=3 THEN 4 WHEN n<=6 THEN 5 WHEN n<=9 THEN 6 WHEN n<=12 THEN 7 ELSE 8 END;
  a.won:=(after_route->>'missing')::integer=0;a.complete:=a.won OR a.steps>=budget;
  a.score:=CASE WHEN a.won THEN greatest(0,1000-100*greatest(0,a.steps-n)-CASE WHEN a.steps=n AND NOT (ledger_private.route_ordered(q.start,q.finish,a.guesses) OR ledger_private.route_ordered(q.finish,q.start,a.guesses)) THEN 25 ELSE 0 END) ELSE 0 END;
 END IF;
 a.revision:=a.revision+1;
 UPDATE ledger_private.geography_routes SET path=a.path,discovered=a.discovered,guesses=a.guesses,feedback=a.feedback,rules_version=a.rules_version,steps=a.steps,mistakes=a.mistakes,revision=a.revision,complete=a.complete,won=a.won,score=a.score,notice=a.notice WHERE id=a.id;
 RETURN to_jsonb(a);
END;$$;
CREATE FUNCTION ledger_private.route_bidirectional_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1; $$;
REVOKE ALL ON FUNCTION ledger_private.route_bidirectional_version() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.utilities_geography_route_capabilities() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"version":2,"puzzles":108,"global_routes":true,"bidirectional":true}'::jsonb; $$;
COMMIT;
