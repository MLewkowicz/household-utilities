BEGIN;
-- Additive group metadata: omitted fields from cached clients preserve the group.
ALTER TABLE ledger_private.personal_task_events ADD COLUMN group_name text;
CREATE OR REPLACE VIEW ledger_private.current_personal_tasks AS SELECT DISTINCT ON(id) * FROM ledger_private.personal_task_events ORDER BY id,version DESC;
CREATE FUNCTION ledger_private.personal_task_group(value jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result text;
BEGIN
 IF value IS NULL OR value='null'::jsonb THEN RETURN NULL; END IF;
 IF jsonb_typeof(value)<>'string' THEN RAISE EXCEPTION 'Write a group name'; END IF;
 IF value #>> '{}' ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Group names cannot contain control characters'; END IF;
 result:=nullif(regexp_replace(trim(value #>> '{}'),' +',' ','g'),'');
 IF length(result)>60 THEN RAISE EXCEPTION 'Use a group name of at most 60 characters'; END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION ledger_private.personal_task_group(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.utilities_save_personal_task(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old record; prior record; saved record; a text:=p->>'action'; v integer; owner_id text; title_text text; pin boolean; done timestamptz; removed boolean; added timestamptz; group_text text;
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{16,100}$' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid task or request identifier'; END IF;
 IF a IS NULL OR a NOT IN ('create','edit','pin','complete','undo','delete','restore','group') THEN RAISE EXCEPTION 'Choose a personal task action'; END IF;
 LOCK TABLE ledger_private.personal_task_events IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.personal_task_events WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN to_jsonb(prior)-'request_id'-'fingerprint';
 END IF;
 SELECT * INTO old FROM ledger_private.current_personal_tasks WHERE id=p->>'id';
 IF a='create' THEN
  IF old.id IS NOT NULL THEN RAISE EXCEPTION 'This task already exists'; END IF;
  IF coalesce((p->>'expected_version')::integer,0)<>0 THEN RAISE EXCEPTION 'Invalid starting version'; END IF;
  owner_id:=p->>'actor';v:=1;title_text:=trim(p->>'title');pin:=coalesce((p->>'pinned')::boolean,false);done:=NULL;removed:=false;added:=now();
 ELSE
  IF old.id IS NULL THEN RAISE EXCEPTION 'Personal task not found'; END IF;
  IF old.owner<>p->>'actor' THEN RAISE EXCEPTION 'Select this task’s owner to change it'; END IF;
  IF (p->>'expected_version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'This task changed. Refresh and review before saving'; END IF;
  IF old.deleted AND a<>'restore' THEN RAISE EXCEPTION 'Restore this deleted task first'; END IF;
  v:=old.version+1;owner_id:=old.owner;title_text:=old.title;pin:=old.pinned;done:=old.completed_at;removed:=old.deleted;added:=old.added_at;group_text:=old.group_name;
  IF a='edit' THEN title_text:=trim(p->>'title'); END IF;
  IF a='pin' THEN
   IF jsonb_typeof(p->'pinned') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Choose a pinned state'; END IF;
   pin:=(p->>'pinned')::boolean;
  END IF;
  IF a='complete' THEN
   IF done IS NOT NULL THEN RAISE EXCEPTION 'This task is already complete'; END IF;done:=now();
  ELSIF a='undo' THEN
   IF done IS NULL THEN RAISE EXCEPTION 'This task is already active'; END IF;done:=NULL;
  ELSIF a='delete' THEN removed:=true;
  ELSIF a='restore' THEN removed:=false;
  END IF;
 END IF;
 IF a IN ('create','edit','group') AND p ? 'group_name' THEN
  group_text:=ledger_private.personal_task_group(p->'group_name');
  SELECT coalesce((SELECT t.group_name FROM ledger_private.current_personal_tasks t WHERE t.owner=owner_id AND lower(t.group_name)=lower(group_text) ORDER BY t.added_at,t.id LIMIT 1),group_text) INTO group_text;
 END IF;
 IF a='group' AND NOT p ? 'group_name' THEN RAISE EXCEPTION 'Choose a task group'; END IF;
 IF a IN ('create','edit') AND jsonb_typeof(p->'title') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Write a task title'; END IF;
 IF title_text IS NULL OR length(title_text) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Write a task title of 1–120 characters'; END IF;
 INSERT INTO ledger_private.personal_task_events VALUES(p->>'id',v,owner_id,title_text,pin,done,removed,p->>'actor',a,now(),added,p->>'request_id',md5(p::text),group_text) RETURNING * INTO saved;
 RETURN to_jsonb(saved)-'request_id'-'fingerprint';
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_personal_tasks(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(p->>'member','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose whose tasks to read'; END IF;
 RETURN jsonb_build_object('member',p->>'member','tasks',coalesce((SELECT jsonb_agg(to_jsonb(t)-'request_id'-'fingerprint' ORDER BY added_at DESC,id) FROM ledger_private.current_personal_tasks t WHERE owner=p->>'member'),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(t)-'request_id'-'fingerprint' ORDER BY created_at DESC,id,version DESC) FROM ledger_private.personal_task_events t WHERE owner=p->>'member'),'[]'::jsonb),'updated_at',now(),'format_version',2);
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_home_order(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(p->>'member','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose whose order to read'; END IF;
 RETURN coalesce((SELECT to_jsonb(o)-'request_id'-'fingerprint' FROM ledger_private.current_home_orders o WHERE member=p->>'member'),jsonb_build_object('member',p->>'member','version',0,'keys','[]'::jsonb));
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_save_home_order(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior record; old record; saved record;
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
 IF jsonb_typeof(p->'keys') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose a task order'; END IF;
 IF jsonb_array_length(p->'keys')>4000 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'keys') k WHERE k IS NULL OR k !~ '^(personal|shared):[a-zA-Z0-9_:-]{1,160}$') THEN RAISE EXCEPTION 'Invalid task order'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements_text(p->'keys'))<>(SELECT count(DISTINCT k) FROM jsonb_array_elements_text(p->'keys') k) THEN RAISE EXCEPTION 'Duplicate task in order'; END IF;
 LOCK TABLE ledger_private.home_order_events IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.home_order_events WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN to_jsonb(prior)-'request_id'-'fingerprint';
 END IF;
 SELECT * INTO old FROM ledger_private.current_home_orders WHERE member=p->>'actor';
 IF coalesce((p->>'expected_version')::integer,-1)<>coalesce(old.version,0) THEN RAISE EXCEPTION 'Your Home order changed. Refresh before moving tasks'; END IF;
 IF p ? 'move' THEN
  IF jsonb_typeof(p->'move') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Choose a personal task to move'; END IF;
  PERFORM public.utilities_save_personal_task(jsonb_build_object('id',p->'move'->>'id','expected_version',p->'move'->'expected_version','actor',p->>'actor','action','group','group_name',p->'move'->'group_name','request_id',p->>'request_id'||'-group'));
 END IF;
 INSERT INTO ledger_private.home_order_events VALUES(p->>'actor',coalesce(old.version,0)+1,p->'keys',now(),p->>'request_id',md5(p::text)) RETURNING * INTO saved;
 RETURN to_jsonb(saved)-'request_id'-'fingerprint';
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_export_personal_tasks(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p->>'member' IS NOT NULL THEN RETURN public.utilities_personal_tasks(p)||jsonb_build_object('exported_at',now()); END IF;
 SELECT jsonb_build_object('tasks',coalesce((SELECT jsonb_agg(to_jsonb(t)-'request_id'-'fingerprint' ORDER BY owner,added_at DESC,id) FROM ledger_private.current_personal_tasks t),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(t)-'request_id'-'fingerprint' ORDER BY created_at DESC,id,version DESC) FROM ledger_private.personal_task_events t),'[]'::jsonb),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(o)-'request_id'-'fingerprint' ORDER BY member) FROM ledger_private.current_home_orders o),'[]'::jsonb),
 'updated_at',now(),'exported_at',now(),'format_version',2) INTO result;
 RETURN result;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
