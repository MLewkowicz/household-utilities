-- Count only active grid-board sessions. Completed results remain immutable.
BEGIN;
ALTER TABLE ledger_private.trivia_attempts
 ADD COLUMN clock_version integer NOT NULL DEFAULT 0,
 ADD COLUMN clock_revision integer NOT NULL DEFAULT 0,
 ADD COLUMN clock_owner uuid,
 ADD COLUMN active_ms bigint NOT NULL DEFAULT 0 CHECK(active_ms>=0),
 ADD COLUMN active_since timestamptz,
 ADD COLUMN active_until timestamptz;

CREATE FUNCTION ledger_private.puzzle_active_ms(a ledger_private.trivia_attempts, at_time timestamptz)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT a.active_ms+CASE WHEN a.active_since IS NULL THEN 0 ELSE greatest(0,floor(extract(epoch FROM (least(at_time,a.active_until)-a.active_since))*1000))::bigint END;
$$;
CREATE FUNCTION ledger_private.puzzle_clock_state(a ledger_private.trivia_attempts)
RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT jsonb_build_object('id',a.id,'clock_version',a.clock_version,'clock_revision',a.clock_revision,'clock_owner',a.clock_owner,'active_ms',a.active_ms,'active_since',a.active_since,'active_until',a.active_until,'started_at',a.started_at,'finished_at',a.finished_at,'elapsed_ms',a.elapsed_ms,'server_now',clock_timestamp(),'complete',jsonb_array_length(a.answers)>0 OR a.day<(now() AT TIME ZONE 'America/New_York')::date);
$$;
CREATE FUNCTION public.utilities_puzzle_clock(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.trivia_attempts; stamp timestamptz:=clock_timestamp(); owner uuid:=(p->>'owner')::uuid; running boolean;
BEGIN
 IF jsonb_typeof(p->'running') IS DISTINCT FROM 'boolean' OR owner IS NULL OR (p->>'revision')::integer IS NULL OR (p->>'revision')::integer<0 THEN RAISE EXCEPTION 'Invalid clock update';END IF;
 running:=(p->>'running')::boolean;
 SELECT * INTO a FROM ledger_private.trivia_attempts WHERE id=(p->>'id')::uuid AND player=p->>'player' FOR UPDATE;
 IF NOT FOUND OR a.game NOT IN ('sudoku','crossword') THEN RAISE EXCEPTION 'Timed board unavailable';END IF;
 IF jsonb_array_length(a.answers)>0 OR a.day<>(now() AT TIME ZONE 'America/New_York')::date OR (p->>'revision')::integer<>a.clock_revision THEN RETURN ledger_private.puzzle_clock_state(a);END IF;
 -- A late pause from a previous tab/visit cannot stop the current session.
 IF NOT running AND a.clock_owner IS DISTINCT FROM owner THEN RETURN ledger_private.puzzle_clock_state(a);END IF;
 a.active_ms:=CASE WHEN a.clock_version=1 THEN ledger_private.puzzle_active_ms(a,stamp)
  WHEN a.started_at IS NOT NULL THEN greatest(0,floor(extract(epoch FROM (stamp-a.started_at))*1000))::bigint ELSE 0 END;
 UPDATE ledger_private.trivia_attempts SET clock_version=1,clock_revision=a.clock_revision+1,clock_owner=owner,active_ms=a.active_ms,
  started_at=coalesce(a.started_at,stamp),active_since=CASE WHEN running THEN stamp END,
  active_until=CASE WHEN running THEN stamp+interval '30 seconds' END
 WHERE id=a.id RETURNING * INTO a;
 RETURN ledger_private.puzzle_clock_state(a);
END;$$;
REVOKE ALL ON FUNCTION ledger_private.puzzle_active_ms(ledger_private.trivia_attempts,timestamptz),ledger_private.puzzle_clock_state(ledger_private.trivia_attempts) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.utilities_puzzle_clock(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_puzzle_clock(jsonb) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.utilities_trivia_start(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.trivia_attempts;d date:=(now() AT TIME ZONE 'America/New_York')::date;s integer;v integer;n integer;
BEGIN
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player for Daily';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('trivia:'||(p->>'game')||':'||d::text));
 -- Preserve the actual slot too: new releases can contain more days than old ones.
 SELECT slot,version INTO s,v FROM ledger_private.trivia_attempts WHERE game=p->>'game' AND day=d LIMIT 1;
 IF v IS NULL THEN
  SELECT max(version) INTO v FROM ledger_private.trivia_packs WHERE game=p->>'game';
  IF v IS NULL THEN RAISE EXCEPTION 'Unknown game';END IF;
  SELECT count(*) INTO n FROM ledger_private.trivia_packs WHERE game=p->>'game' AND version=v;
  SELECT slot INTO s FROM ledger_private.trivia_packs WHERE game=p->>'game' AND version=v
   ORDER BY slot OFFSET (((d-DATE '2026-11-09')%n+n)%n) LIMIT 1;
 END IF;
 INSERT INTO ledger_private.trivia_attempts(player,game,day,slot,version) VALUES(p->>'player',p->>'game',d,s,v) ON CONFLICT(player,game,day) DO NOTHING;
 SELECT * INTO a FROM ledger_private.trivia_attempts WHERE player=p->>'player' AND game=p->>'game' AND day=d FOR UPDATE;
 IF a.game IN ('sudoku','crossword') AND a.started_at IS NULL AND jsonb_array_length(a.answers)=0 THEN
  UPDATE ledger_private.trivia_attempts SET started_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
 END IF;
 IF a.game IN ('sudoku','crossword') AND coalesce(p->>'clock_version','0')='1' AND a.clock_version=0 AND jsonb_array_length(a.answers)=0 THEN
  UPDATE ledger_private.trivia_attempts SET clock_version=1,clock_revision=clock_revision+1,
   active_ms=CASE WHEN a.started_at IS NULL THEN 0 ELSE greatest(0,floor(extract(epoch FROM (clock_timestamp()-a.started_at))*1000))::bigint END
  WHERE id=a.id RETURNING * INTO a;
 END IF;
 RETURN ledger_private.trivia_state(a)||CASE WHEN a.clock_version=1 THEN jsonb_build_object('server_now',clock_timestamp()) ELSE '{}'::jsonb END;
END;$$;
CREATE OR REPLACE FUNCTION public.utilities_trivia_action(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 UPDATE ledger_private.trivia_attempts SET answers=jsonb_build_array(jsonb_build_object('value',p->'answer','points',1000)),score=1000,finished_at=clock_timestamp(),active_since=NULL,active_until=NULL,clock_revision=a.clock_revision+1,elapsed_ms=CASE WHEN a.clock_version=1 THEN ledger_private.puzzle_active_ms(a,clock_timestamp()) WHEN a.started_at IS NOT NULL THEN greatest(0,floor(extract(epoch FROM (clock_timestamp()-a.started_at))*1000))::bigint END WHERE id=a.id RETURNING * INTO a;
 RETURN ledger_private.trivia_state(a);
END;$$;
CREATE FUNCTION ledger_private.active_puzzle_clocks_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;
REVOKE ALL ON FUNCTION ledger_private.active_puzzle_clocks_version() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_puzzle_clock_capabilities() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"version":1,"pause_resume":true}'::jsonb;$$;
REVOKE ALL ON FUNCTION public.utilities_puzzle_clock_capabilities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_puzzle_clock_capabilities() TO anon,authenticated,service_role;
COMMIT;
