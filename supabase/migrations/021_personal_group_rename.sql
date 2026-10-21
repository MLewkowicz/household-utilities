BEGIN;
-- One request renames the owner's entire group, retaining every prior revision.
CREATE TABLE ledger_private.personal_group_renames (
 request_id text PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ledger_private.personal_group_renames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.personal_group_renames FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.utilities_rename_personal_group(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 INSERT INTO ledger_private.personal_task_events(id,version,owner,title,pinned,completed_at,deleted,actor,action,created_at,added_at,request_id,fingerprint,group_name)
 SELECT id,version+1,owner,title,pinned,completed_at,deleted,p->>'actor','rename_group',now(),added_at,
 'group-rename-'||md5(jsonb_build_array(p->>'request_id',id)::text),md5(p::text),new_name
 FROM ledger_private.current_personal_tasks WHERE owner=p->>'actor' AND lower(group_name)=lower(old_name);
 result:=jsonb_build_object('group_name',new_name,'renamed_count',jsonb_array_length(current_versions));
 INSERT INTO ledger_private.personal_group_renames(request_id,fingerprint,result) VALUES(p->>'request_id',md5(p::text),result);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.utilities_rename_personal_group(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_rename_personal_group(jsonb) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.utilities_personal_tasks(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(p->>'member','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose whose tasks to read'; END IF;
 RETURN jsonb_build_object('member',p->>'member','tasks',coalesce((SELECT jsonb_agg(to_jsonb(t)-'request_id'-'fingerprint' ORDER BY added_at DESC,id) FROM ledger_private.current_personal_tasks t WHERE owner=p->>'member'),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(t)-'request_id'-'fingerprint' ORDER BY created_at DESC,id,version DESC) FROM ledger_private.personal_task_events t WHERE owner=p->>'member'),'[]'::jsonb),'updated_at',now(),'format_version',2,'group_rename_version',1);
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_export_personal_tasks(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p->>'member' IS NOT NULL THEN RETURN public.utilities_personal_tasks(p)||jsonb_build_object('exported_at',now()); END IF;
 SELECT jsonb_build_object('tasks',coalesce((SELECT jsonb_agg(to_jsonb(t)-'request_id'-'fingerprint' ORDER BY owner,added_at DESC,id) FROM ledger_private.current_personal_tasks t),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(t)-'request_id'-'fingerprint' ORDER BY created_at DESC,id,version DESC) FROM ledger_private.personal_task_events t),'[]'::jsonb),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(o)-'request_id'-'fingerprint' ORDER BY member) FROM ledger_private.current_home_orders o),'[]'::jsonb),
 'updated_at',now(),'exported_at',now(),'format_version',2,'group_rename_version',1) INTO result;
 RETURN result;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
