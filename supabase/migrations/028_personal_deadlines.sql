BEGIN;
ALTER TABLE ledger_private.personal_task_events ADD COLUMN due_on text, ADD COLUMN due_time text, ADD COLUMN due_at timestamptz;
CREATE OR REPLACE VIEW ledger_private.current_personal_tasks AS SELECT DISTINCT ON(id) * FROM ledger_private.personal_task_events ORDER BY id,version DESC;
CREATE OR REPLACE FUNCTION public.utilities_save_personal_task(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old record; prior record; saved record; a text:=p->>'action'; v integer; owner_id text; title_text text; pin boolean; done timestamptz; removed boolean; added timestamptz; group_text text; due_day text; due_time_text text; deadline timestamptz;
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
  v:=old.version+1;owner_id:=old.owner;title_text:=old.title;pin:=old.pinned;done:=old.completed_at;removed:=old.deleted;added:=old.added_at;group_text:=old.group_name;due_day:=old.due_on;due_time_text:=old.due_time;deadline:=old.due_at;
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
 IF a IN ('create','edit') THEN
  IF p ? 'due_on' THEN due_day:=nullif(p->>'due_on',''); END IF;
  IF p ? 'due_time' THEN due_time_text:=nullif(p->>'due_time',''); END IF;
  deadline:=ledger_private.chore_deadline(due_day,due_time_text);
 END IF;
 IF a IN ('create','edit','group') AND p ? 'group_name' THEN
  group_text:=ledger_private.personal_task_group(p->'group_name');
  SELECT coalesce((SELECT t.group_name FROM ledger_private.current_personal_tasks t WHERE t.owner=owner_id AND lower(t.group_name)=lower(group_text) ORDER BY t.added_at,t.id LIMIT 1),group_text) INTO group_text;
 END IF;
 IF a='group' AND NOT p ? 'group_name' THEN RAISE EXCEPTION 'Choose a task group'; END IF;
 IF a IN ('create','edit') AND jsonb_typeof(p->'title') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Write a task title'; END IF;
 IF title_text IS NULL OR length(title_text) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Write a task title of 1–120 characters'; END IF;
 INSERT INTO ledger_private.personal_task_events VALUES(p->>'id',v,owner_id,title_text,pin,done,removed,p->>'actor',a,now(),added,p->>'request_id',md5(p::text),group_text,due_day,due_time_text,deadline) RETURNING * INTO saved;
 RETURN to_jsonb(saved)-'request_id'-'fingerprint';
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_rename_personal_group(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_name text; new_name text; prior record; current_versions jsonb; expected_versions jsonb; result jsonb;
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
 old_name:=ledger_private.personal_task_group(p->'group_name');
 new_name:=ledger_private.personal_task_group(p->'new_name');
 IF old_name IS NULL OR new_name IS NULL THEN RAISE EXCEPTION 'Write a group name'; END IF;
 IF jsonb_typeof(p->'expected_tasks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Refresh the group before renaming it'; END IF;
 LOCK TABLE ledger_private.personal_task_events IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.personal_group_renames WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN prior.result;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'version',version) ORDER BY id) INTO current_versions
 FROM ledger_private.current_personal_tasks WHERE owner=p->>'actor' AND lower(group_name)=lower(old_name);
 IF current_versions IS NULL THEN RAISE EXCEPTION 'This group is no longer available. Refresh your tasks'; END IF;
 SELECT jsonb_agg(t ORDER BY t->>'id') INTO expected_versions FROM jsonb_array_elements(p->'expected_tasks') t;
 IF current_versions IS DISTINCT FROM expected_versions THEN RAISE EXCEPTION 'This group changed. Close this dialog and refresh before renaming it'; END IF;
 IF lower(new_name)<>lower(old_name) AND EXISTS(SELECT 1 FROM ledger_private.current_personal_tasks WHERE owner=p->>'actor' AND lower(group_name)=lower(new_name)) THEN
  RAISE EXCEPTION 'That group name already exists. Choose another name';
 END IF;
 INSERT INTO ledger_private.personal_task_events(id,version,owner,title,pinned,completed_at,deleted,actor,action,created_at,added_at,request_id,fingerprint,group_name,due_on,due_time,due_at)
 SELECT id,version+1,owner,title,pinned,completed_at,deleted,p->>'actor','rename_group',now(),added_at,
 'group-rename-'||md5(jsonb_build_array(p->>'request_id',id)::text),md5(p::text),new_name,due_on,due_time,due_at
 FROM ledger_private.current_personal_tasks WHERE owner=p->>'actor' AND lower(group_name)=lower(old_name);
 result:=jsonb_build_object('group_name',new_name,'renamed_count',jsonb_array_length(current_versions));
 INSERT INTO ledger_private.personal_group_renames(request_id,fingerprint,result) VALUES(p->>'request_id',md5(p::text),result);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.utilities_rename_personal_group(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_rename_personal_group(jsonb) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.utilities_app_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT '{"event_edit_notifications":true,"quarter_points":true,"as_needed_routines":true,"sweeping_spaces":true,"personal_deadlines":true}'::jsonb;
$$;
-- Marker for installers; deadlines use the existing strict New York validator.
CREATE FUNCTION ledger_private.personal_deadlines_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1; $$;
REVOKE ALL ON FUNCTION ledger_private.personal_deadlines_version() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.utilities_chores_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM ledger_private.materialize_chores();
 SELECT jsonb_build_object('counts',coalesce(jsonb_object_agg(member,n),'{}'::jsonb),'local_day',(now() AT TIME ZONE 'America/New_York')::date)
 INTO result FROM (
 SELECT data->>'assignee' AS member,count(*) AS n FROM ledger_private.current_chores
 WHERE ledger_private.chore_queue_ready(data,(now() AT TIME ZONE 'America/New_York')::date) AND data->>'assignee' IS NOT NULL AND ledger_private.chore_status(data,now()) IN ('active','overdue')
 AND (data->>'pinned'='true' OR ledger_private.chore_status(data,now())='overdue' OR (data->>'due_at')::timestamptz<=now()+interval '48 hours')
 GROUP BY data->>'assignee') counts;
 RETURN result;
END; $$;


NOTIFY pgrst,'reload schema';
COMMIT;
