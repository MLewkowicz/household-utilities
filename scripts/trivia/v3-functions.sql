-- Additive upgrade: existing attempts keep their original question packs.
BEGIN;
ALTER TABLE ledger_private.trivia_attempts ADD COLUMN progress jsonb NOT NULL DEFAULT '{}';
ALTER FUNCTION public.utilities_trivia_action(jsonb) SET SCHEMA ledger_private;
ALTER FUNCTION ledger_private.utilities_trivia_action(jsonb) RENAME TO trivia_action_v2;
REVOKE ALL ON FUNCTION ledger_private.trivia_action_v2(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_trivia_action(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.trivia_attempts;q jsonb;g jsonb;guess jsonb;matched jsonb;solved jsonb;guesses jsonb;mistakes integer;notice text;done boolean;
BEGIN
 IF p->>'action' IS DISTINCT FROM 'group' THEN RETURN ledger_private.trivia_action_v2(p);END IF;
 SELECT * INTO a FROM ledger_private.trivia_attempts WHERE id=(p->>'id')::uuid AND player=p->>'player' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable';END IF;
 IF p->>'index' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Invalid question';END IF;
 SELECT questions->0 INTO q FROM ledger_private.trivia_packs WHERE game=a.game AND slot=a.slot AND version=a.version;
 IF q->>'kind'<>'groups' THEN RAISE EXCEPTION 'This is not a word board';END IF;
 IF jsonb_array_length(a.answers)>0 THEN RETURN ledger_private.trivia_state(a);END IF;
 IF a.day<>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'This daily round has ended';END IF;
 guess:=p->'answer';
 IF guess IS NULL OR jsonb_typeof(guess)<>'array' THEN RAISE EXCEPTION 'Choose four remaining words';END IF;
 IF jsonb_array_length(guess)<>4 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(guess))<>4 OR NOT guess <@ (q->'words') THEN RAISE EXCEPTION 'Choose four remaining words';END IF;
 solved:=coalesce(a.progress->'solved','[]');guesses:=coalesce(a.progress->'guesses','[]');mistakes:=coalesce((a.progress->>'mistakes')::integer,0);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(guesses) x WHERE x @> guess AND x <@ guess) THEN
  UPDATE ledger_private.trivia_attempts SET progress=jsonb_set(progress,'{notice}','"Already tried that group."') WHERE id=a.id RETURNING * INTO a;
  RETURN ledger_private.trivia_state(a);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(solved) s CROSS JOIN jsonb_array_elements(s->'words') w WHERE guess @> jsonb_build_array(w)) THEN RAISE EXCEPTION 'Choose four remaining words';END IF;
 notice:='Not a group.';
 FOR g IN SELECT value FROM jsonb_array_elements(q->'groups') LOOP
  IF g->'words' @> guess AND g->'words' <@ guess THEN matched:=g;EXIT;END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(g->'words') w WHERE guess @> jsonb_build_array(w))=3 THEN notice:='One word away.';END IF;
 END LOOP;
 IF matched IS NOT NULL THEN solved:=solved||jsonb_build_array(matched);notice:=matched->>'label';ELSE mistakes:=mistakes+1;END IF;
 done:=jsonb_array_length(solved)=4 OR mistakes>=4;
 UPDATE ledger_private.trivia_attempts SET
  progress=jsonb_build_object('solved',solved,'guesses',guesses||jsonb_build_array(guess),'mistakes',mistakes,'notice',notice),
  score=jsonb_array_length(solved)*250,
  answers=CASE WHEN done THEN jsonb_build_array(jsonb_build_object('value',(SELECT coalesce(jsonb_agg(s->'id'),'[]') FROM jsonb_array_elements(solved) s),'points',jsonb_array_length(solved)*250)) ELSE '[]'::jsonb END
 WHERE id=a.id RETURNING * INTO a;
 RETURN ledger_private.trivia_state(a);
END;$$;
REVOKE ALL ON FUNCTION public.utilities_trivia_action(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_trivia_action(jsonb) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.utilities_trivia_start(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.trivia_attempts;d date:=(now() AT TIME ZONE 'America/New_York')::date;s integer;v integer;
BEGIN
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player for Daily';END IF;
 s:=((d-DATE '2026-11-09')%14+14)%14;
 -- Serialize the first starts across a rollout so all roommates get the same board.
 PERFORM pg_advisory_xact_lock(hashtext('trivia:'||(p->>'game')||':'||d::text));
 SELECT min(version) INTO v FROM ledger_private.trivia_attempts WHERE game=p->>'game' AND day=d;
 IF v IS NULL THEN SELECT max(version) INTO v FROM ledger_private.trivia_packs WHERE game=p->>'game' AND slot=s;END IF;
 IF v IS NULL THEN RAISE EXCEPTION 'Unknown game';END IF;
 INSERT INTO ledger_private.trivia_attempts(player,game,day,slot,version) VALUES(p->>'player',p->>'game',d,s,v) ON CONFLICT(player,game,day) DO NOTHING;
 SELECT * INTO a FROM ledger_private.trivia_attempts WHERE player=p->>'player' AND game=p->>'game' AND day=d;
 RETURN ledger_private.trivia_state(a);
END;$$;
CREATE OR REPLACE FUNCTION ledger_private.trivia_state(a ledger_private.trivia_attempts) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE pack jsonb;q jsonb;qs jsonb:='[]';i integer:=0;level integer;
BEGIN
 SELECT questions INTO pack FROM ledger_private.trivia_packs WHERE game=a.game AND slot=a.slot AND version=a.version;
 FOR q IN SELECT value FROM jsonb_array_elements(pack) LOOP
  level:=coalesce((a.hints->>i::text)::integer,0);
  IF i>=jsonb_array_length(a.answers) THEN
   q:=q-'answer'-'aliases'-'explanation'-'sources'-'reveal'-'groups';
   IF q->>'kind'='clues' THEN q:=jsonb_set(q,'{clues}',(SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(q->'clues') WITH ORDINALITY WHERE ordinality<=level+1));END IF;
  END IF;
  qs:=qs||jsonb_build_array(q);i:=i+1;
 END LOOP;
 RETURN to_jsonb(a)||jsonb_build_object('questions',qs,'complete',jsonb_array_length(a.answers)=jsonb_array_length(pack) OR a.day<(now() AT TIME ZONE 'America/New_York')::date,'server_day',(now() AT TIME ZONE 'America/New_York')::date);
END;$$;
CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"version":3,"games":5,"daily_packs":14,"groups":true}'::jsonb;$$;
CREATE FUNCTION ledger_private.trivia_content_v3() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 3;$$;
