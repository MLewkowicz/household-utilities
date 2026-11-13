-- Timed grids and global Border Trails. Existing results and packs remain intact.
BEGIN;
ALTER TABLE ledger_private.trivia_attempts ADD COLUMN started_at timestamptz, ADD COLUMN finished_at timestamptz, ADD COLUMN elapsed_ms bigint CHECK(elapsed_ms>=0);
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
 SELECT * INTO a FROM ledger_private.trivia_attempts WHERE player=p->>'player' AND game=p->>'game' AND day=d;
 IF a.game IN ('sudoku','crossword') AND a.started_at IS NULL AND jsonb_array_length(a.answers)=0 THEN
  UPDATE ledger_private.trivia_attempts SET started_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
 END IF;
 RETURN ledger_private.trivia_state(a);
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
 UPDATE ledger_private.trivia_attempts SET answers=jsonb_build_array(jsonb_build_object('value',p->'answer','points',1000)),score=1000,finished_at=clock_timestamp(),elapsed_ms=CASE WHEN a.started_at IS NOT NULL THEN greatest(0,floor(extract(epoch FROM (clock_timestamp()-a.started_at))*1000))::bigint END WHERE id=a.id RETURNING * INTO a;
 RETURN ledger_private.trivia_state(a);
END;$$;
CREATE OR REPLACE FUNCTION ledger_private.trivia_standings(p jsonb,at_day date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH daily AS(
 SELECT a.*,row_number() OVER(PARTITION BY player ORDER BY score DESC,CASE WHEN a.game IN ('sudoku','crossword') THEN elapsed_ms END ASC NULLS LAST,day DESC) AS n
 FROM ledger_private.trivia_attempts a JOIN ledger_private.trivia_packs c USING(game,slot,version)
 WHERE a.game=p->>'game' AND a.day BETWEEN CASE WHEN p->>'period'='week' THEN date_trunc('week',at_day::timestamp)::date ELSE at_day END AND at_day
 AND (a.day<at_day OR jsonb_array_length(a.answers)=jsonb_array_length(c.questions))
 ), totals AS(
 SELECT player,sum(score)::integer AS score,count(*) AS days,
 CASE WHEN p->>'game' IN ('sudoku','crossword') AND count(elapsed_ms)=count(*) THEN sum(elapsed_ms)::bigint END AS elapsed_ms
 FROM daily WHERE n<=5 GROUP BY player
 ), ranked AS(SELECT *,rank() OVER(ORDER BY score DESC,elapsed_ms ASC NULLS LAST)::integer AS rank FROM totals)
 SELECT coalesce(jsonb_agg(to_jsonb(ranked) ORDER BY rank,player),'[]') FROM ranked;
$$;
ALTER TABLE ledger_private.geography_route_puzzles ADD COLUMN available_from date NOT NULL DEFAULT (now() AT TIME ZONE 'America/New_York')::date;
UPDATE ledger_private.geography_route_puzzles SET available_from=DATE '2026-11-09';
ALTER TABLE ledger_private.geography_routes ADD COLUMN guesses jsonb NOT NULL DEFAULT '[]', ADD COLUMN feedback jsonb NOT NULL DEFAULT '[]', ADD COLUMN rules_version integer NOT NULL DEFAULT 1;
ALTER TABLE ledger_private.geography_routes ALTER COLUMN rules_version SET DEFAULT 2;
-- Global Border Trail catalog and playable connections.
INSERT INTO ledger_private.geography_route_edges VALUES('FRA','GBR') ON CONFLICT DO NOTHING;
INSERT INTO ledger_private.geography_route_edges VALUES('DNK','SWE') ON CONFLICT DO NOTHING;
INSERT INTO ledger_private.geography_route_edges VALUES('MYS','SGP') ON CONFLICT DO NOTHING;
DELETE FROM ledger_private.geography_route_edges WHERE a='AZE' AND b='TUR';
DELETE FROM ledger_private.geography_route_edges WHERE a='AGO' AND b='COG';
DELETE FROM ledger_private.geography_route_edges WHERE a='EGY' AND b='PSX';
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(48,'PRT','THA',9,'["PRT","ESP","FRA","DEU","POL","BLR","RUS","CHN","LAO","THA"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(49,'CAN','ARG',10,'["CAN","USA","MEX","GTM","HND","NIC","CRI","PAN","COL","BRA","ARG"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(50,'MAR','ZAF',8,'["MAR","DZA","LBY","SDN","CAF","COD","AGO","NAM","ZAF"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(51,'GBR','IND',7,'["GBR","FRA","DEU","POL","BLR","RUS","CHN","IND"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(52,'MEX','CHL',8,'["MEX","GTM","HND","NIC","CRI","PAN","COL","PER","CHL"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(53,'SEN','ETH',5,'["SEN","MLI","DZA","LBY","SDN","ETH"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(54,'NOR','VNM',3,'["NOR","RUS","CHN","VNM"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(55,'EGY','NAM',5,'["EGY","SDN","CAF","COD","AGO","NAM"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(56,'FRA','SGP',9,'["FRA","DEU","POL","BLR","RUS","CHN","LAO","THA","MYS","SGP"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(57,'GTM','URY',7,'["GTM","HND","NIC","CRI","PAN","COL","BRA","URY"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(58,'IRL','NPL',8,'["IRL","GBR","FRA","DEU","POL","BLR","RUS","CHN","NPL"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(59,'GHA','SOM',6,'["GHA","BFA","NER","LBY","SDN","ETH","SOM"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(60,'CAN','CHL',10,'["CAN","USA","MEX","GTM","HND","NIC","CRI","PAN","COL","PER","CHL"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(61,'ESP','KHM',8,'["ESP","FRA","DEU","POL","BLR","RUS","CHN","LAO","KHM"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(62,'ZAF','TUN',7,'["ZAF","BWA","ZMB","COD","CAF","SDN","LBY","TUN"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(63,'USA','URY',9,'["USA","MEX","GTM","HND","NIC","CRI","PAN","COL","BRA","URY"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(64,'FIN','BGD',4,'["FIN","RUS","CHN","IND","BGD"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(65,'GIN','KEN',6,'["GIN","MLI","DZA","LBY","SDN","ETH","KEN"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(66,'PAN','CHL',3,'["PAN","COL","PER","CHL"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(67,'DEU','MYS',7,'["DEU","POL","BLR","RUS","CHN","LAO","THA","MYS"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(68,'PRT','ZAF',17,'["PRT","ESP","FRA","CHE","AUT","HUN","ROU","BGR","TUR","SYR","ISR","EGY","SDN","CAF","COD","AGO","NAM","ZAF"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(69,'SWE','OMN',7,'["SWE","FIN","RUS","AZE","IRN","IRQ","SAU","OMN"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(70,'SEN','MOZ',7,'["SEN","MLI","NER","TCD","CAF","COD","TZA","MOZ"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(71,'CAN','PER',9,'["CAN","USA","MEX","GTM","HND","NIC","CRI","PAN","COL","PER"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(72,'GBR','THA',8,'["GBR","FRA","DEU","POL","BLR","RUS","CHN","LAO","THA"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(73,'MAR','TZA',6,'["MAR","DZA","LBY","SDN","CAF","COD","TZA"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(74,'USA','ARG',9,'["USA","MEX","GTM","HND","NIC","CRI","PAN","COL","BRA","ARG"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(75,'IRL','VNM',8,'["IRL","GBR","FRA","DEU","POL","BLR","RUS","CHN","VNM"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(76,'LBR','ETH',6,'["LBR","CIV","BFA","NER","LBY","SDN","ETH"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(77,'MEX','URY',8,'["MEX","GTM","HND","NIC","CRI","PAN","COL","BRA","URY"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(78,'FRA','NPL',6,'["FRA","DEU","POL","BLR","RUS","CHN","NPL"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(79,'DZA','ZWE',6,'["DZA","LBY","SDN","CAF","COD","ZMB","ZWE"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(80,'HND','CHL',6,'["HND","NIC","CRI","PAN","COL","PER","CHL"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(81,'BEL','SGP',9,'["BEL","DEU","POL","BLR","RUS","CHN","LAO","THA","MYS","SGP"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(82,'GMB','ZAF',9,'["GMB","SEN","MLI","NER","TCD","CAF","COD","AGO","NAM","ZAF"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(83,'CAN','BOL',10,'["CAN","USA","MEX","GTM","HND","NIC","CRI","PAN","COL","BRA","BOL"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(84,'NOR','PAK',3,'["NOR","RUS","CHN","PAK"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(85,'CIV','KEN',6,'["CIV","BFA","NER","LBY","SDN","ETH","KEN"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(86,'CRI','ARG',4,'["CRI","PAN","COL","BRA","ARG"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(87,'ESP','MYS',9,'["ESP","FRA","DEU","POL","BLR","RUS","CHN","LAO","THA","MYS"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(88,'IRL','ZAF',17,'["IRL","GBR","FRA","CHE","AUT","HUN","ROU","BGR","TUR","SYR","ISR","EGY","SDN","CAF","COD","AGO","NAM","ZAF"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(89,'PRT','BGD',9,'["PRT","ESP","FRA","DEU","POL","BLR","RUS","CHN","IND","BGD"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(90,'TUN','MOZ',6,'["TUN","LBY","SDN","CAF","COD","TZA","MOZ"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(91,'USA','PRY',9,'["USA","MEX","GTM","HND","NIC","CRI","PAN","COL","BRA","PRY"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(92,'DNK','KHM',6,'["DNK","SWE","FIN","RUS","CHN","LAO","KHM"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(93,'SLE','SOM',7,'["SLE","GIN","MLI","DZA","LBY","SDN","ETH","SOM"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(94,'MEX','PER',7,'["MEX","GTM","HND","NIC","CRI","PAN","COL","PER"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(95,'NLD','THA',7,'["NLD","DEU","POL","BLR","RUS","CHN","LAO","THA"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(96,'GNB','ZMB',7,'["GNB","GIN","MLI","NER","TCD","CAF","COD","ZMB"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(97,'CAN','URY',10,'["CAN","USA","MEX","GTM","HND","NIC","CRI","PAN","COL","BRA","URY"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(98,'PRT','KOR',8,'["PRT","ESP","FRA","DEU","POL","BLR","RUS","PRK","KOR"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(99,'GBR','ZAF',16,'["GBR","FRA","CHE","AUT","HUN","ROU","BGR","TUR","SYR","ISR","EGY","SDN","CAF","COD","AGO","NAM","ZAF"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(100,'SEN','MWI',7,'["SEN","MLI","NER","TCD","CAF","COD","TZA","MWI"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(101,'BLZ','ARG',8,'["BLZ","GTM","HND","NIC","CRI","PAN","COL","BRA","ARG"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(102,'FRA','TLS',10,'["FRA","DEU","POL","BLR","RUS","CHN","LAO","THA","MYS","IDN","TLS"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(103,'GIN','ZWE',7,'["GIN","MLI","NER","TCD","CAF","COD","ZMB","ZWE"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(104,'USA','BOL',9,'["USA","MEX","GTM","HND","NIC","CRI","PAN","COL","BRA","BOL"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(105,'SWE','IND',4,'["SWE","FIN","RUS","CHN","IND"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(106,'MAR','UGA',5,'["MAR","DZA","LBY","SDN","SDS","UGA"]'::jsonb);
INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES(107,'GTM','CHL',7,'["GTM","HND","NIC","CRI","PAN","COL","PER","CHL"]'::jsonb);
CREATE FUNCTION ledger_private.route_slot(d date) RETURNS integer LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE first_id integer;n integer;result integer;
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM ledger_private.geography_route_puzzles WHERE id>=48 AND available_from<=d) THEN 48 ELSE 0 END INTO first_id;
 SELECT count(*) INTO n FROM ledger_private.geography_route_puzzles WHERE (first_id=48 AND id>=48) OR (first_id=0 AND id<48);
 SELECT id INTO result FROM ledger_private.geography_route_puzzles WHERE (first_id=48 AND id>=48) OR (first_id=0 AND id<48) ORDER BY id OFFSET (((d-DATE '2026-11-09')%n+n)%n) LIMIT 1;
 RETURN result;
END;$$;
CREATE OR REPLACE FUNCTION public.utilities_geography_route_start(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d date:=(now() AT TIME ZONE 'America/New_York')::date;slot integer;q ledger_private.geography_route_puzzles;a ledger_private.geography_routes;
BEGIN
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player for the daily trail';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('border-trail:'||d::text));
 SELECT puzzle_id INTO slot FROM ledger_private.geography_routes WHERE day=d LIMIT 1;
 SELECT * INTO q FROM ledger_private.geography_route_puzzles WHERE id=coalesce(slot,ledger_private.route_slot(d));
 INSERT INTO ledger_private.geography_routes(player,day,puzzle_id,path,discovered) VALUES(p->>'player',d,q.id,jsonb_build_array(q.start),jsonb_build_array(q.start,q.finish)) ON CONFLICT(player,day) DO NOTHING;
 SELECT * INTO a FROM ledger_private.geography_routes WHERE player=p->>'player' AND day=d;
 RETURN to_jsonb(a);
END;$$;
-- Dijkstra: each unguessed country costs 1000, each edge costs 1.
-- The graph has fewer than 1000 nodes, so path length is only a tie breaker.
CREATE FUNCTION ledger_private.route_remaining(origin text,destination text,guessed jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE costs jsonb:=jsonb_build_object(origin,0);previous jsonb:='{}';visited text[]:='{}';known jsonb:=guessed||jsonb_build_array(origin,destination);current text;neighbor text;distance integer;candidate integer;route jsonb:='[]';cursor text;
BEGIN
 LOOP
  SELECT key,value::text::integer INTO current,distance FROM jsonb_each(costs) WHERE NOT key=ANY(visited) ORDER BY value::text::integer,key LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('missing',1000000,'path','[]'::jsonb);END IF;
  IF current=destination THEN
   cursor:=destination;WHILE cursor IS NOT NULL LOOP route:=jsonb_build_array(cursor)||route;cursor:=previous->>cursor;END LOOP;
   RETURN jsonb_build_object('missing',distance/1000,'path',route);
  END IF;
  visited:=array_append(visited,current);
  FOR neighbor IN SELECT b FROM ledger_private.geography_route_edges WHERE a=current UNION SELECT a FROM ledger_private.geography_route_edges WHERE b=current LOOP
   candidate:=distance+1+CASE WHEN known ? neighbor THEN 0 ELSE 1000 END;
   IF NOT neighbor=ANY(visited) AND candidate<coalesce((costs->>neighbor)::integer,2147483647) THEN costs:=jsonb_set(costs,ARRAY[neighbor],to_jsonb(candidate));previous:=jsonb_set(previous,ARRAY[neighbor],to_jsonb(current));END IF;
  END LOOP;
 END LOOP;
END;$$;
CREATE OR REPLACE FUNCTION public.utilities_geography_route_action(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.geography_routes;q ledger_private.geography_route_puzzles;choice text:=p->>'choice';before_route jsonb;after_route jsonb;known jsonb;country text;quality text;useful boolean;n integer;budget integer;via integer;
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
  IF useful THEN quality:=CASE WHEN a.path ? choice THEN 'connected' ELSE 'useful' END;
  ELSE
   via:=(ledger_private.route_remaining(q.start,choice,a.guesses)->>'missing')::integer+(ledger_private.route_remaining(choice,q.finish,a.guesses)->>'missing')::integer;
   quality:=CASE WHEN via<=(after_route->>'missing')::integer+1 THEN 'detour' ELSE 'miss' END;a.mistakes:=a.mistakes+1;
  END IF;
  a.feedback:=a.feedback||jsonb_build_array(jsonb_build_object('country',choice,'quality',quality));a.notice:=quality;
  IF NOT a.discovered ? choice THEN a.discovered:=a.discovered||jsonb_build_array(choice);END IF;
  n:=q.minimum-1;budget:=n+CASE WHEN n<=3 THEN 4 WHEN n<=6 THEN 5 WHEN n<=9 THEN 6 WHEN n<=12 THEN 7 ELSE 8 END;
  a.won:=(after_route->>'missing')::integer=0;a.complete:=a.won OR a.steps>=budget;
  a.score:=CASE WHEN a.won THEN greatest(0,1000-100*greatest(0,a.steps-n)-CASE WHEN a.steps=n AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.feedback) f WHERE f->>'quality'<>'connected') THEN 25 ELSE 0 END) ELSE 0 END;
 END IF;
 a.revision:=a.revision+1;
 UPDATE ledger_private.geography_routes SET path=a.path,discovered=a.discovered,guesses=a.guesses,feedback=a.feedback,rules_version=a.rules_version,steps=a.steps,mistakes=a.mistakes,revision=a.revision,complete=a.complete,won=a.won,score=a.score,notice=a.notice WHERE id=a.id;
 RETURN to_jsonb(a);
END;$$;
CREATE OR REPLACE FUNCTION public.utilities_game_archive(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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
  SELECT * INTO trail FROM ledger_private.geography_route_puzzles WHERE id=CASE WHEN chosen IS NULL THEN 48+s-1 ELSE coalesce((SELECT puzzle_id FROM ledger_private.geography_routes WHERE day=chosen LIMIT 1),ledger_private.route_slot(chosen)) END;
  IF chosen IS NOT NULL THEN SELECT * INTO r FROM ledger_private.geography_routes WHERE geography_routes.player=p->>'player' AND day=chosen;IF FOUND THEN SELECT * INTO trail FROM ledger_private.geography_route_puzzles WHERE id=r.puzzle_id;END IF;END IF;
  state:=jsonb_build_object('id','archive:geography:'||v_entry,'game',g,'player',p->>'player','day',v_entry,'rules_version',coalesce(r.rules_version,2),'guesses',coalesce(r.guesses,'[]'),'feedback',coalesce(r.feedback,'[]'),'puzzle_id',trail.id,'path',coalesce(r.path,jsonb_build_array(trail.start)),'discovered',coalesce(r.discovered,jsonb_build_array(trail.start,trail.finish)),'steps',coalesce(r.steps,0),'mistakes',coalesce(r.mistakes,0),'revision',coalesce(r.revision,0),'complete',coalesce(r.complete,false),'won',coalesce(r.won,false),'score',coalesce(r.score,0),'notice','');
 ELSE
  state:=jsonb_build_object('id','archive:'||g||':'||v_entry,'game',g,'player',p->>'player','day',v_entry,'started_at',CASE WHEN jsonb_array_length(a.answers)>0 THEN a.started_at END,'finished_at',a.finished_at,'elapsed_ms',a.elapsed_ms,'questions',pack,'answers',coalesce(a.answers,'[]'),'hints',coalesce(a.hints,'{}'),'progress',coalesce(a.progress,'{}'),'score',coalesce(a.score,0),'complete',coalesce(jsonb_array_length(a.answers)=jsonb_array_length(pack),false));
 END IF;
 RETURN jsonb_build_object('state',jsonb_build_object('attempt',state,'drafts','{}'::jsonb),'revision',0);
END;$$;

CREATE OR REPLACE FUNCTION public.utilities_geography_route_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('version',2,'puzzles',(SELECT count(*) FROM ledger_private.geography_route_puzzles),'global_routes',true);$$;
CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('version',7,'games',7,'groups',true,'size_objects',59,'online_sync',true,'online_seed',1,'archive',true,'grid_puzzles',true,'photo_silhouettes',true,'passport_editorial',2,'timed_grids',true);$$;
CREATE FUNCTION ledger_private.game_mechanics_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;
REVOKE ALL ON FUNCTION ledger_private.route_slot(date),ledger_private.route_remaining(text,text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
