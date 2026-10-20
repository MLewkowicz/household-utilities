-- Public household notes, separate from money and chore credit.
BEGIN;
CREATE TABLE ledger_private.bulletin_note_events (
 id text NOT NULL,version integer NOT NULL,data jsonb NOT NULL,deleted boolean NOT NULL,
 actor text NOT NULL,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 request_id text UNIQUE NOT NULL,fingerprint text NOT NULL,PRIMARY KEY(id,version)
);
ALTER TABLE ledger_private.bulletin_note_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.bulletin_note_events FROM PUBLIC,anon,authenticated;
CREATE VIEW ledger_private.current_bulletin_notes AS
 SELECT DISTINCT ON(id) * FROM ledger_private.bulletin_note_events ORDER BY id,version DESC;
REVOKE ALL ON ledger_private.current_bulletin_notes FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.utilities_save_bulletin_note(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old record; prior record; payload jsonb; recipients jsonb; fingerprint text:=md5(p::text);
 next_version integer; is_deleted boolean:=false; temperature integer; act text:=p->>'action';
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{16,100}$' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid note or request identifier'; END IF;
 IF act IS NULL OR act NOT IN ('create','edit','delete','restore') THEN RAISE EXCEPTION 'Choose a note action'; END IF;
 LOCK TABLE ledger_private.bulletin_note_events IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.bulletin_note_events e WHERE e.request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>fingerprint THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN prior.data||jsonb_build_object('id',prior.id,'version',prior.version,'deleted',prior.deleted,'actor',prior.actor,'action',prior.action,'created_at',prior.created_at);
 END IF;
 SELECT * INTO old FROM ledger_private.current_bulletin_notes WHERE id=p->>'id';
 IF act='create' THEN
  IF old.id IS NOT NULL THEN RAISE EXCEPTION 'This note already exists'; END IF;
  next_version:=1;
 ELSE
  IF old.id IS NULL THEN RAISE EXCEPTION 'This note could not be found'; END IF;
  IF (p->>'expected_version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'This note changed. Refresh and review before saving'; END IF;
  IF act='restore' AND NOT old.deleted THEN RAISE EXCEPTION 'This note is already on the board'; END IF;
  IF act<>'restore' AND old.deleted THEN RAISE EXCEPTION 'Restore this note before changing it'; END IF;
  next_version:=old.version+1;
 END IF;
 IF act IN ('delete','restore') THEN
  payload:=old.data;is_deleted:=act='delete';
 ELSE
  IF jsonb_typeof(p->'body') IS DISTINCT FROM 'string' OR length(trim(p->>'body')) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Write a note of 1–600 characters'; END IF;
  IF jsonb_typeof(p->'temperature') IS DISTINCT FROM 'number' OR coalesce(p->>'temperature','') !~ '^-?[0-9]+$' THEN RAISE EXCEPTION 'Choose a temperature'; END IF;
  temperature:=(p->>'temperature')::integer;
  IF temperature=0 OR temperature NOT BETWEEN -100 AND 100 THEN RAISE EXCEPTION 'Slide toward a complaint or a compliment'; END IF;
  PERFORM ledger_private.chore_members(p->'recipients');
  SELECT jsonb_agg(value ORDER BY array_position(ARRAY['michal','rina','ohm','rohil'],value)) INTO recipients FROM jsonb_array_elements_text(p->'recipients');
  payload:=jsonb_build_object('body',trim(p->>'body'),'temperature',temperature,'kind',CASE WHEN temperature<0 THEN 'complaint' ELSE 'compliment' END,
   'recipients',recipients,'author',CASE WHEN act='create' THEN p->>'actor' ELSE old.data->>'author' END,
   'posted_at',CASE WHEN act='create' THEN to_jsonb(now()) ELSE old.data->'posted_at' END);
 END IF;
 INSERT INTO ledger_private.bulletin_note_events VALUES(p->>'id',next_version,payload,is_deleted,p->>'actor',act,now(),p->>'request_id',fingerprint);
 RETURN payload||jsonb_build_object('id',p->>'id','version',next_version,'deleted',is_deleted,'actor',p->>'actor','action',act,'created_at',now());
END; $$;

CREATE FUNCTION public.utilities_bulletin_dashboard()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
WITH notes AS (SELECT * FROM ledger_private.current_bulletin_notes),
periods AS (SELECT 'all' AS period,NULL::timestamptz AS starts UNION ALL SELECT 'week',date_trunc('week',now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York' UNION ALL SELECT 'month',date_trunc('month',now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'),
edges AS (
 SELECT id,data->>'author' AS member,'written' AS direction,data->>'kind' AS kind,(data->>'posted_at')::timestamptz AS posted_at FROM notes WHERE NOT deleted
 UNION ALL
 SELECT n.id,r.value,'received',n.data->>'kind',(n.data->>'posted_at')::timestamptz FROM notes n CROSS JOIN LATERAL jsonb_array_elements_text(n.data->'recipients') r WHERE NOT n.deleted
), stats AS (
 SELECT p.period,m.member,d.direction,count(e.id) FILTER(WHERE e.kind='complaint')::integer AS complaints,count(e.id) FILTER(WHERE e.kind='compliment')::integer AS compliments
 FROM periods p CROSS JOIN unnest(ARRAY['michal','rina','ohm','rohil']) m(member) CROSS JOIN unnest(ARRAY['written','received']) d(direction)
 LEFT JOIN edges e ON e.member=m.member AND e.direction=d.direction AND (p.starts IS NULL OR e.posted_at>=p.starts)
 GROUP BY p.period,m.member,d.direction
)
SELECT jsonb_build_object(
 'notes',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'deleted',deleted,'actor',actor,'action',action,'created_at',created_at) ORDER BY data->>'posted_at' DESC,id) FROM notes),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'deleted',deleted,'actor',actor,'action',action,'created_at',created_at) ORDER BY created_at DESC,id,version DESC) FROM ledger_private.bulletin_note_events),'[]'::jsonb),
 'stats',coalesce((SELECT jsonb_agg(to_jsonb(stats) ORDER BY period,direction,member) FROM stats),'[]'::jsonb),'updated_at',now(),'format_version',1
);
$$;
CREATE FUNCTION public.utilities_export_bulletin() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.utilities_bulletin_dashboard()||jsonb_build_object('exported_at',now()); $$;
REVOKE ALL ON FUNCTION public.utilities_save_bulletin_note(jsonb),public.utilities_bulletin_dashboard(),public.utilities_export_bulletin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_save_bulletin_note(jsonb),public.utilities_bulletin_dashboard(),public.utilities_export_bulletin() TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
