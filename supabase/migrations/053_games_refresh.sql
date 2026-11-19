-- Passport penalties, outline-first clues, and historical/average standings.
BEGIN;
ALTER TABLE ledger_private.trivia_attempts DROP CONSTRAINT trivia_attempts_score_check;
ALTER TABLE ledger_private.trivia_attempts ADD CONSTRAINT trivia_attempts_score_check CHECK(score<=1000 AND (game='passport-puzzle' OR score>=0));
ALTER TABLE ledger_private.trivia_attempts ADD COLUMN passport_requests jsonb NOT NULL DEFAULT '{}';
CREATE FUNCTION ledger_private.passport_clues(q jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(c ORDER BY n),'[]') FROM jsonb_array_elements(q->'clues') WITH ORDINALITY t(c,n)
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(q->'aliases','[]')||jsonb_build_array(q->>'answer')) a
 WHERE length(a)>=4 AND position(ledger_private.trivia_normalize(a) in ledger_private.trivia_normalize(c#>>'{}'))>0);
$$;
CREATE OR REPLACE FUNCTION ledger_private.trivia_state(a ledger_private.trivia_attempts) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE pack jsonb;q jsonb;qs jsonb:='[]';i integer:=0;level integer;
BEGIN
 SELECT questions INTO pack FROM ledger_private.trivia_packs WHERE game=a.game AND slot=a.slot AND version=a.version;
 FOR q IN SELECT value FROM jsonb_array_elements(pack) LOOP
  IF a.game='passport-puzzle' THEN q:=jsonb_set(q,'{clues}',ledger_private.passport_clues(q));q:=q||jsonb_build_object('clue_count',jsonb_array_length(q->'clues'));END IF;
  level:=coalesce((a.hints->>i::text)::integer,0);
  IF i>=jsonb_array_length(a.answers) THEN
   q:=q-'answer'-'aliases'-'explanation'-'sources'-'reveal'-'groups';
   IF q->>'kind'='clues' THEN q:=jsonb_set(q,'{clues}',(SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') FROM jsonb_array_elements(q->'clues') WITH ORDINALITY WHERE ordinality<=level+CASE WHEN a.game='passport-puzzle' THEN 0 ELSE 1 END));END IF;
  END IF;
  qs:=qs||jsonb_build_array(q);i:=i+1;
 END LOOP;
 RETURN to_jsonb(a)||jsonb_build_object('questions',qs,'complete',jsonb_array_length(a.answers)=jsonb_array_length(pack) OR a.day<(now() AT TIME ZONE 'America/New_York')::date,'server_day',(now() AT TIME ZONE 'America/New_York')::date);
END;$$;
ALTER FUNCTION public.utilities_trivia_action(jsonb) RENAME TO utilities_trivia_action_before_passport;
REVOKE ALL ON FUNCTION public.utilities_trivia_action_before_passport(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_trivia_action(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.trivia_attempts;pack jsonb;q jsonb;idx integer;level integer;correct boolean;rid text:=p->>'request_id';
BEGIN
 SELECT * INTO a FROM ledger_private.trivia_attempts WHERE id=(p->>'id')::uuid AND player=p->>'player' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable';END IF;
 IF a.game<>'passport-puzzle' THEN RETURN public.utilities_trivia_action_before_passport(p);END IF;
 idx:=(p->>'index')::integer;
 IF idx IS NULL OR idx<0 THEN RAISE EXCEPTION 'Invalid question';END IF;
 IF idx<jsonb_array_length(a.answers) THEN
  IF p->>'action'='answer' AND a.answers->idx->'value' IS DISTINCT FROM p->'answer' THEN RAISE EXCEPTION 'This answer is already locked';END IF;
  RETURN ledger_private.trivia_state(a);
 END IF;
 IF a.day<>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'This daily round has ended';END IF;
 IF p->>'action'='answer' AND rid IS NOT NULL AND a.passport_requests ? rid THEN RETURN ledger_private.trivia_state(a);END IF;
 SELECT questions INTO pack FROM ledger_private.trivia_packs WHERE game=a.game AND slot=a.slot AND version=a.version;
 IF idx<>jsonb_array_length(a.answers) OR idx>=jsonb_array_length(pack) THEN RAISE EXCEPTION 'Resume the current question';END IF;
 q:=pack->idx;level:=coalesce((a.hints->>idx::text)::integer,0);
 IF p->>'action'='clue' THEN
  IF p->>'level' IS NULL OR (p->>'level')::integer NOT BETWEEN 1 AND jsonb_array_length(ledger_private.passport_clues(q)) OR (p->>'level')::integer>level+1 THEN RAISE EXCEPTION 'Invalid clue request';END IF;
  IF (p->>'level')::integer>level THEN
   UPDATE ledger_private.trivia_attempts SET score=score-50,hints=jsonb_set(hints,ARRAY[idx::text],p->'level') WHERE id=a.id RETURNING * INTO a;
  END IF;
 ELSIF p->>'action'='answer' THEN
  IF jsonb_typeof(p->'answer') IS DISTINCT FROM 'string' OR length(trim(p->>'answer'))=0 OR length(p->>'answer')>100 THEN RAISE EXCEPTION 'Enter a country name';END IF;
  SELECT EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(q->'aliases','[]')||jsonb_build_array(q->>'answer')) x WHERE ledger_private.trivia_normalize(x)=ledger_private.trivia_normalize(p->>'answer')) INTO correct;
  UPDATE ledger_private.trivia_attempts SET score=score+CASE WHEN correct THEN 200 ELSE -50 END,
   answers=CASE WHEN correct THEN answers||jsonb_build_array(jsonb_build_object('value',p->'answer','points',200)) ELSE answers END,
   passport_requests=CASE WHEN rid IS NOT NULL THEN passport_requests||jsonb_build_object(rid,true) ELSE passport_requests END
  WHERE id=a.id RETURNING * INTO a;
 ELSE RAISE EXCEPTION 'Unknown action';END IF;
 RETURN ledger_private.trivia_state(a);
END;$$;
REVOKE ALL ON FUNCTION public.utilities_trivia_action(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_trivia_action(jsonb) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION ledger_private.trivia_standings(p jsonb,at_day date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH daily AS(
 SELECT a.*,row_number() OVER(PARTITION BY player ORDER BY score DESC,CASE WHEN a.game IN ('sudoku','crossword') THEN elapsed_ms END ASC NULLS LAST,day DESC) AS n
 FROM ledger_private.trivia_attempts a JOIN ledger_private.trivia_packs c USING(game,slot,version)
 WHERE a.game=p->>'game' AND a.day BETWEEN CASE WHEN p->>'period'='all' THEN DATE '2026-11-09' WHEN p->>'period'='week' THEN date_trunc('week',at_day::timestamp)::date ELSE at_day END AND at_day
 AND (jsonb_array_length(a.answers)=jsonb_array_length(c.questions) OR (p->>'period'<>'all' AND a.day<at_day))
 ), totals AS(
 SELECT player,CASE WHEN p->>'period'='all' THEN round(avg(score),2) ELSE sum(score) END AS score,count(*) AS days,
 CASE WHEN p->>'game' IN ('sudoku','crossword') AND count(elapsed_ms)=count(*) THEN (CASE WHEN p->>'period'='all' THEN avg(elapsed_ms) ELSE sum(elapsed_ms) END)::bigint END AS elapsed_ms
 FROM daily WHERE n<=5 OR p->>'period'='all' GROUP BY player
 ), ranked AS(SELECT *,rank() OVER(ORDER BY score DESC,elapsed_ms ASC NULLS LAST)::integer AS rank FROM totals)
 SELECT coalesce(jsonb_agg(to_jsonb(ranked) ORDER BY rank,player),'[]') FROM ranked;
$$;
CREATE OR REPLACE FUNCTION public.utilities_trivia_scores(p jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT ledger_private.trivia_standings(p,least(coalesce((p->>'day')::date,(now() AT TIME ZONE 'America/New_York')::date),(now() AT TIME ZONE 'America/New_York')::date));$$;
CREATE FUNCTION ledger_private.games_refresh_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;
REVOKE ALL ON FUNCTION ledger_private.games_refresh_version(),ledger_private.passport_clues(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_game_history_scores(p jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH raw AS (
 SELECT player,day,score,steps,mistakes,won,0::bigint AS elapsed_ms FROM ledger_private.geography_routes
 WHERE p->>'challenge'='route' AND complete
 UNION ALL
 SELECT player,(finished_at AT TIME ZONE 'America/New_York')::date,score,correct,mistakes,true,elapsed_ms FROM ledger_private.geography_scores
 WHERE p->>'challenge'<>'route' AND challenge=p->>'challenge' AND region=p->>'region' AND scope=p->>'scope'
 ), daily AS (SELECT *,row_number() OVER(PARTITION BY player,day ORDER BY score DESC,elapsed_ms) n FROM raw), totals AS (
 SELECT player,round(avg(score),2) AS score,count(*) AS days,round(avg(steps),1) AS steps,round(avg(mistakes),1) AS mistakes,bool_and(won) AS won,round(avg(elapsed_ms)) AS elapsed_ms
 FROM daily WHERE n=1 AND day<= (now() AT TIME ZONE 'America/New_York')::date AND (p->>'period'='all' OR day=coalesce((p->>'day')::date,(now() AT TIME ZONE 'America/New_York')::date)) GROUP BY player
 ), ranked AS (SELECT *,rank() OVER(ORDER BY score DESC)::integer AS rank FROM totals)
 SELECT coalesce(jsonb_agg(to_jsonb(ranked) ORDER BY rank,player),'[]') FROM ranked;
$$;
REVOKE ALL ON FUNCTION public.utilities_game_history_scores(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_game_history_scores(jsonb) TO anon,authenticated,service_role;
CREATE FUNCTION public.utilities_games_refresh_capabilities() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"passport_penalties":true,"outline_first":true,"historical_scores":true,"average_scores":true}'::jsonb;$$;
REVOKE ALL ON FUNCTION public.utilities_games_refresh_capabilities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_games_refresh_capabilities() TO anon,authenticated,service_role;
COMMIT;
