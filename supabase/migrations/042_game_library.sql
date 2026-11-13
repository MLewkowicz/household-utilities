-- Personal practice shelves and stable historical daily boards. Ranked attempts stay immutable.
BEGIN;
CREATE TABLE ledger_private.game_pack_versions(game text NOT NULL,version integer NOT NULL,available_from date NOT NULL DEFAULT (now() AT TIME ZONE 'America/New_York')::date,PRIMARY KEY(game,version));
INSERT INTO ledger_private.game_pack_versions(game,version,available_from)
 SELECT game,version,coalesce((SELECT min(day) FROM ledger_private.trivia_attempts a WHERE a.game=p.game AND a.version=p.version),CASE WHEN version>=5 THEN DATE '2026-11-12' ELSE DATE '2026-11-09' END) FROM ledger_private.trivia_packs p GROUP BY game,version;
CREATE FUNCTION ledger_private.capture_game_pack_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN INSERT INTO ledger_private.game_pack_versions(game,version) VALUES(NEW.game,NEW.version) ON CONFLICT DO NOTHING;RETURN NEW;END;$$;
CREATE TRIGGER game_pack_version AFTER INSERT ON ledger_private.trivia_packs FOR EACH ROW EXECUTE FUNCTION ledger_private.capture_game_pack_version();
CREATE TABLE ledger_private.game_starter_packs(game text NOT NULL,slot integer NOT NULL CHECK(slot BETWEEN 1 AND 10),questions jsonb NOT NULL,PRIMARY KEY(game,slot));
CREATE TABLE ledger_private.game_archive_progress(player text NOT NULL CHECK(player IN ('michal','rina','ohm','rohil')),game text NOT NULL,entry text NOT NULL,state jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(player,game,entry));
ALTER TABLE ledger_private.game_pack_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.game_starter_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.game_archive_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.game_pack_versions,ledger_private.game_starter_packs,ledger_private.game_archive_progress FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.utilities_game_daily_status(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d date:=(now() AT TIME ZONE 'America/New_York')::date;result jsonb;
BEGIN
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player in Settings';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('game',g.game,'complete',coalesce(jsonb_array_length(a.answers)=jsonb_array_length(pack.questions),false),'started',a.id IS NOT NULL) ORDER BY g.game),'[]') INTO result
 FROM (SELECT DISTINCT game FROM ledger_private.trivia_packs) g LEFT JOIN ledger_private.trivia_attempts a ON a.game=g.game AND a.player=p->>'player' AND a.day=d LEFT JOIN ledger_private.trivia_packs pack ON pack.game=a.game AND pack.slot=a.slot AND pack.version=a.version;
 RETURN jsonb_build_object('day',d,'games',result||jsonb_build_array(jsonb_build_object('game','geography','complete',coalesce((SELECT complete FROM ledger_private.geography_routes WHERE player=p->>'player' AND day=d),false),'started',EXISTS(SELECT 1 FROM ledger_private.geography_routes WHERE player=p->>'player' AND day=d))));
END;$$;

CREATE FUNCTION public.utilities_game_library(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d date:=(now() AT TIME ZONE 'America/New_York')::date;first_day date;result jsonb;
BEGIN
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player in Settings';END IF;
 IF p->>'game'='geography' THEN first_day:=DATE '2026-11-09';ELSE SELECT min(available_from) INTO first_day FROM ledger_private.game_pack_versions WHERE game=p->>'game';END IF;
 IF first_day IS NULL THEN RAISE EXCEPTION 'Unknown game';END IF;
 WITH entries AS(
 SELECT 'starter-'||i AS entry,NULL::date AS day,i AS starter FROM generate_series(1,10) i
 UNION ALL SELECT t::date::text,t::date,NULL FROM generate_series(first_day::timestamp,(d-1)::timestamp,interval '1 day') t
 ), records AS(
 SELECT e.*,coalesce((s.state->'attempt'->>'complete')::boolean,CASE WHEN p->>'game'='geography' THEN r.complete ELSE jsonb_array_length(a.answers)=jsonb_array_length(pack.questions) END,false) AS complete,
 s.entry IS NOT NULL OR a.id IS NOT NULL OR r.id IS NOT NULL AS started,
 coalesce((s.state->'attempt'->>'score')::integer,a.score,r.score,0) AS score
 FROM entries e LEFT JOIN ledger_private.game_archive_progress s ON s.entry=e.entry AND s.game=p->>'game' AND s.player=p->>'player'
 LEFT JOIN ledger_private.trivia_attempts a ON a.game=p->>'game' AND a.player=p->>'player' AND a.day=e.day
 LEFT JOIN ledger_private.trivia_packs pack ON pack.game=a.game AND pack.slot=a.slot AND pack.version=a.version
 LEFT JOIN ledger_private.geography_routes r ON p->>'game'='geography' AND r.player=p->>'player' AND r.day=e.day
 ) SELECT coalesce(jsonb_agg(to_jsonb(records) ORDER BY day DESC NULLS LAST,starter),'[]') INTO result FROM records;
 RETURN jsonb_build_object('day',d,'entries',result);
END;$$;

CREATE FUNCTION public.utilities_game_archive(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d date:=(now() AT TIME ZONE 'America/New_York')::date;v_entry text:=p->>'entry';g text:=p->>'game';chosen date;s integer;v integer;n integer;pack jsonb;a ledger_private.trivia_attempts;state jsonb;stored ledger_private.game_archive_progress;r ledger_private.geography_routes;trail ledger_private.geography_route_puzzles;
BEGIN
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player in Settings';END IF;
 IF v_entry ~ '^starter-([1-9]|10)$' THEN
  s:=split_part(v_entry,'-',2)::integer;
  IF g<>'geography' THEN SELECT questions INTO pack FROM ledger_private.game_starter_packs WHERE game=g AND slot=s;IF pack IS NULL THEN RAISE EXCEPTION 'Unknown practice board';END IF;END IF;
 ELSE
  IF coalesce(v_entry,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid archive date';END IF;
  chosen:=v_entry::date;IF chosen>=d OR chosen<DATE '2026-11-09' THEN RAISE EXCEPTION 'Only past daily challenges are in the archive';END IF;
  IF g<>'geography' THEN
   SELECT * INTO a FROM ledger_private.trivia_attempts WHERE game=g AND day=chosen AND trivia_attempts.player=p->>'player';
   SELECT slot,version INTO s,v FROM ledger_private.trivia_attempts WHERE game=g AND day=chosen LIMIT 1;
   IF v IS NULL THEN
    SELECT max(version) INTO v FROM ledger_private.game_pack_versions WHERE game=g AND available_from<=chosen;
    SELECT count(*) INTO n FROM ledger_private.trivia_packs WHERE game=g AND version=v;
    IF n=0 THEN RAISE EXCEPTION 'No puzzle for that date';END IF;
    SELECT slot INTO s FROM ledger_private.trivia_packs WHERE game=g AND version=v ORDER BY slot OFFSET (((chosen-DATE '2026-11-09')%n+n)%n) LIMIT 1;
   END IF;
   SELECT questions INTO pack FROM ledger_private.trivia_packs WHERE game=g AND slot=s AND version=v;
  END IF;
 END IF;
 SELECT * INTO stored FROM ledger_private.game_archive_progress WHERE game=g AND game_archive_progress.player=p->>'player' AND game_archive_progress.entry=v_entry;
 IF FOUND THEN RETURN jsonb_build_object('state',stored.state,'revision',stored.revision);END IF;
 IF g='geography' THEN
  SELECT count(*) INTO n FROM ledger_private.geography_route_puzzles;
  SELECT * INTO trail FROM ledger_private.geography_route_puzzles WHERE id=CASE WHEN chosen IS NULL THEN (s-1)%n ELSE ((chosen-DATE '2026-11-09')%n+n)%n END;
  IF chosen IS NOT NULL THEN SELECT * INTO r FROM ledger_private.geography_routes WHERE geography_routes.player=p->>'player' AND day=chosen;END IF;
  state:=jsonb_build_object('id','archive:geography:'||v_entry,'game',g,'player',p->>'player','day',v_entry,'puzzle_id',trail.id,'path',coalesce(r.path,jsonb_build_array(trail.start)),'discovered',coalesce(r.discovered,jsonb_build_array(trail.start,trail.finish)),'steps',coalesce(r.steps,0),'mistakes',coalesce(r.mistakes,0),'revision',coalesce(r.revision,0),'complete',coalesce(r.complete,false),'won',coalesce(r.won,false),'score',coalesce(r.score,0),'notice','');
 ELSE
  state:=jsonb_build_object('id','archive:'||g||':'||v_entry,'game',g,'player',p->>'player','day',v_entry,'questions',pack,'answers',coalesce(a.answers,'[]'),'hints',coalesce(a.hints,'{}'),'progress',coalesce(a.progress,'{}'),'score',coalesce(a.score,0),'complete',coalesce(jsonb_array_length(a.answers)=jsonb_array_length(pack),false));
 END IF;
 RETURN jsonb_build_object('state',jsonb_build_object('attempt',state,'drafts','{}'::jsonb),'revision',0);
END;$$;

CREATE FUNCTION public.utilities_game_archive_save(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current jsonb;row ledger_private.game_archive_progress;v integer;
BEGIN
 IF jsonb_typeof(p->'state') IS DISTINCT FROM 'object' OR length((p->'state')::text)>150000 OR p->'state'->'attempt'->>'player' IS DISTINCT FROM p->>'player' OR p->'state'->'attempt'->>'game' IS DISTINCT FROM p->>'game' OR p->'state'->'attempt'->>'day' IS DISTINCT FROM p->>'entry' THEN RAISE EXCEPTION 'Invalid saved board';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('archive:'||(p->>'player')||':'||(p->>'game')||':'||(p->>'entry')));
 current:=public.utilities_game_archive(p);v:=(current->>'revision')::integer;
 IF p->'state'=current->'state' THEN RETURN current;END IF;
 IF v IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'This archive board changed on another device. Reopen it to continue.';END IF;
 INSERT INTO ledger_private.game_archive_progress(player,game,entry,state,revision) VALUES(p->>'player',p->>'game',p->>'entry',p->'state',v+1)
 ON CONFLICT(player,game,entry) DO UPDATE SET state=excluded.state,revision=excluded.revision,updated_at=now() RETURNING * INTO row;
 RETURN jsonb_build_object('state',row.state,'revision',row.revision);
END;$$;

ALTER FUNCTION public.utilities_trivia_action(jsonb) SET SCHEMA ledger_private;
ALTER FUNCTION ledger_private.utilities_trivia_action(jsonb) RENAME TO trivia_action_v5;
REVOKE ALL ON FUNCTION ledger_private.trivia_action_v5(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_trivia_action(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.trivia_attempts;q jsonb;value text;
BEGIN
 SELECT * INTO a FROM ledger_private.trivia_attempts WHERE id=(p->>'id')::uuid AND player=p->>'player' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable';END IF;
 SELECT questions->0 INTO q FROM ledger_private.trivia_packs WHERE game=a.game AND slot=a.slot AND version=a.version;
 IF q->>'kind' NOT IN ('sudoku','crossword') THEN RETURN ledger_private.trivia_action_v5(p);END IF;
 IF p->>'action' IS DISTINCT FROM 'answer' OR p->>'index' IS DISTINCT FROM '0' OR jsonb_typeof(p->'answer') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Submit the filled board';END IF;
 IF jsonb_array_length(a.answers)>0 THEN
  IF a.answers->0->'value' IS DISTINCT FROM p->'answer' THEN RAISE EXCEPTION 'This answer is already locked';END IF;
  RETURN ledger_private.trivia_state(a);
 END IF;
 IF a.day<>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'This daily round has ended';END IF;
 IF p->'answer' IS DISTINCT FROM q->'answer' THEN RAISE EXCEPTION 'The board is not quite right yet. Keep going.';END IF;
 UPDATE ledger_private.trivia_attempts SET answers=jsonb_build_array(jsonb_build_object('value',p->'answer','points',1000)),score=1000 WHERE id=a.id RETURNING * INTO a;
 RETURN ledger_private.trivia_state(a);
END;$$;
CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('version',6,'games',7,'groups',true,'size_objects',32,'online_sync',true,'online_seed',1,'archive',true,'grid_puzzles',true);$$;
CREATE FUNCTION ledger_private.game_library_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;
REVOKE ALL ON FUNCTION public.utilities_game_daily_status(jsonb),public.utilities_game_library(jsonb),public.utilities_game_archive(jsonb),public.utilities_game_archive_save(jsonb),public.utilities_trivia_action(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_game_daily_status(jsonb),public.utilities_game_library(jsonb),public.utilities_game_archive(jsonb),public.utilities_game_archive_save(jsonb),public.utilities_trivia_action(jsonb) TO anon,authenticated,service_role;
COMMIT;
