-- A separate ledger. This migration never writes utility records.
BEGIN;
CREATE TABLE ledger_private.misc_expense_events (
 record_id text NOT NULL, version integer NOT NULL CHECK(version>0), data jsonb NOT NULL,
 deleted boolean NOT NULL DEFAULT false, actor text NOT NULL CHECK(actor IN ('michal','rina','ohm','rohil')),
 created_at timestamptz NOT NULL DEFAULT now(), request_id text NOT NULL UNIQUE, fingerprint text NOT NULL,
 PRIMARY KEY(record_id,version)
);
CREATE TABLE ledger_private.misc_settlement_events (LIKE ledger_private.misc_expense_events INCLUDING ALL);
CREATE TABLE ledger_private.misc_rounding (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), next_member integer NOT NULL CHECK(next_member BETWEEN 0 AND 3)
);
INSERT INTO ledger_private.misc_rounding VALUES(true,0);
ALTER TABLE ledger_private.misc_expense_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.misc_settlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.misc_rounding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.misc_expense_events,ledger_private.misc_settlement_events,ledger_private.misc_rounding FROM PUBLIC,anon,authenticated;
CREATE VIEW ledger_private.current_misc_expenses AS
 SELECT DISTINCT ON (record_id) * FROM ledger_private.misc_expense_events ORDER BY record_id,version DESC;
CREATE VIEW ledger_private.current_misc_settlements AS
 SELECT DISTINCT ON (record_id) * FROM ledger_private.misc_settlement_events ORDER BY record_id,version DESC;
REVOKE ALL ON ledger_private.current_misc_expenses,ledger_private.current_misc_settlements FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ledger_private.save_misc(p_kind text,p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 table_name text; old record; prior record; result record; next_version integer; data jsonb;
 members text[]:=ARRAY['michal','rina','ohm','rohil']; participants text[]; person text;
 icons text[]:=ARRAY['toilet-paper','paper-towels','cleaning-spray','sponge','groceries','milk','bread','produce','plate','takeaway','coffee','pizza','car','bus','bicycle','fuel','suitcase','airplane','train','hotel','furniture','light-bulb','tools','plant','board-game','movie','music','tickets','receipt','gift','parcel','misc-box'];
 amount integer; n integer; cursor_value integer; extra integer; shares jsonb; cents integer; sum_cents bigint;
 recalculate boolean; is_delete boolean; fingerprint text:=md5(p::text);
BEGIN
 IF p_kind NOT IN ('expense','settlement') THEN RAISE EXCEPTION 'Unknown entry type'; END IF;
 table_name:=CASE p_kind WHEN 'expense' THEN 'misc_expense_events' ELSE 'misc_settlement_events' END;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$'
   OR coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid entry or request ID'; END IF;
 LOCK TABLE ledger_private.misc_expense_events,ledger_private.misc_settlement_events IN EXCLUSIVE MODE;
 EXECUTE format('SELECT * FROM ledger_private.%I WHERE request_id=$1',table_name) INTO prior USING p->>'request_id';
 IF prior.request_id IS NOT NULL THEN
   IF prior.fingerprint<>fingerprint THEN RAISE EXCEPTION 'This request ID was already used with different details'; END IF;
   RETURN prior.data || jsonb_build_object('id',prior.record_id,'version',prior.version,'deleted',prior.deleted,'actor',prior.actor,'created_at',prior.created_at);
 END IF;
 IF coalesce(p->>'action','') NOT IN ('create','edit','delete') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF NOT coalesce(p->>'actor','')=ANY(members) THEN RAISE EXCEPTION 'Choose who made this change'; END IF;
 EXECUTE format('SELECT * FROM ledger_private.%I WHERE record_id=$1 ORDER BY version DESC LIMIT 1',table_name) INTO old USING p->>'id';
 IF p->>'action'='create' THEN
   IF old.record_id IS NOT NULL THEN RAISE EXCEPTION 'Entry already exists'; END IF;
   next_version:=1;
 ELSE
   IF old.record_id IS NULL OR old.deleted THEN RAISE EXCEPTION 'Entry no longer exists; refresh the ledger'; END IF;
   IF (p->>'expected_version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'This entry changed; refresh before editing'; END IF;
   next_version:=old.version+1;
 END IF;
 is_delete:=p->>'action'='delete';
 IF is_delete THEN data:=old.data;
 ELSE
   IF jsonb_typeof(p->'amount_cents') IS DISTINCT FROM 'number' OR coalesce(p->>'amount_cents','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Enter a positive amount with at most two decimal places'; END IF;
   amount:=(p->>'amount_cents')::integer;
   IF amount NOT BETWEEN 1 AND 100000000 THEN RAISE EXCEPTION 'Amount must be between $0.01 and $1,000,000'; END IF;
   IF coalesce(p->>'paid_on','') !~ '^\d{4}-\d{2}-\d{2}$' OR (p->>'paid_on')::date>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Use a valid date, today or earlier'; END IF;
   IF p_kind='expense' THEN
     IF jsonb_typeof(p->'description') IS DISTINCT FROM 'string' OR length(trim(p->>'description')) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Describe the purchase in 1–160 characters'; END IF;
     IF NOT coalesce(p->>'icon_id','')=ANY(icons) THEN RAISE EXCEPTION 'Choose an available icon'; END IF;
     IF NOT coalesce(p->>'payer','')=ANY(members) THEN RAISE EXCEPTION 'Choose who paid'; END IF;
     IF coalesce(p->>'split_mode','') NOT IN ('equal','custom') THEN RAISE EXCEPTION 'Choose equal or custom shares'; END IF;
     IF jsonb_typeof(p->'participants') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'participants') NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Include at least one roommate'; END IF;
     SELECT array_agg(value ORDER BY array_position(members,value)) INTO participants FROM jsonb_array_elements_text(p->'participants');
     IF EXISTS(SELECT 1 FROM unnest(participants) x WHERE x IS NULL OR NOT x=ANY(members)) OR cardinality(participants)<>(SELECT count(DISTINCT x) FROM unnest(participants) x) THEN RAISE EXCEPTION 'Choose each roommate at most once'; END IF;
     n:=cardinality(participants); shares:='{}'::jsonb;
     IF p->>'split_mode'='custom' THEN
       IF jsonb_typeof(p->'shares') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Enter each selected person''s share'; END IF;
       IF (SELECT count(*) FROM jsonb_object_keys(p->'shares'))<>n THEN RAISE EXCEPTION 'Shares must match selected roommates'; END IF;
       sum_cents:=0;
       FOREACH person IN ARRAY participants LOOP
         IF jsonb_typeof(p->'shares'->person) IS DISTINCT FROM 'number' OR coalesce(p->'shares'->>person,'') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Shares must be nonnegative amounts with at most two decimal places'; END IF;
         cents:=(p->'shares'->>person)::integer;
         IF cents>amount THEN RAISE EXCEPTION 'A share cannot exceed the purchase total'; END IF;
         sum_cents:=sum_cents+cents; shares:=shares || jsonb_build_object(person,cents);
       END LOOP;
       IF sum_cents<>amount THEN RAISE EXCEPTION 'Custom shares must add up to the purchase total'; END IF;
     ELSE
       recalculate:=next_version=1 OR old.data->'amount_cents' IS DISTINCT FROM p->'amount_cents'
         OR old.data->'participants' IS DISTINCT FROM to_jsonb(participants) OR old.data->>'split_mode' IS DISTINCT FROM 'equal';
       IF NOT recalculate THEN shares:=old.data->'shares';
       ELSE
         SELECT next_member INTO cursor_value FROM ledger_private.misc_rounding WHERE singleton FOR UPDATE;
         extra:=amount%n;
         IF extra>0 AND (p->>'expected_rounding_cursor')::integer IS DISTINCT FROM cursor_value THEN RAISE EXCEPTION 'The split preview changed; refresh and review the shares before saving'; END IF;
         FOR person IN SELECT x FROM unnest(participants) x ORDER BY (array_position(members,x)-1-cursor_value+4)%4 LOOP
           cents:=amount/n;
           IF extra>0 THEN
             cents:=cents+1;extra:=extra-1;
             UPDATE ledger_private.misc_rounding SET next_member=array_position(members,person)%4 WHERE singleton;
           END IF;
           shares:=shares || jsonb_build_object(person,cents);
         END LOOP;
       END IF;
     END IF;
     data:=jsonb_build_object('description',trim(p->>'description'),'icon_id',p->>'icon_id','payer',p->>'payer','amount_cents',amount,'paid_on',p->>'paid_on','split_mode',p->>'split_mode','participants',to_jsonb(participants),'shares',shares);
   ELSE
     IF NOT coalesce(p->>'sender','')=ANY(members) OR NOT coalesce(p->>'recipient','')=ANY(members) OR p->>'sender'=p->>'recipient' THEN RAISE EXCEPTION 'Choose two different roommates'; END IF;
     IF coalesce(p->>'method','') NOT IN ('venmo','zelle','other') THEN RAISE EXCEPTION 'Choose a repayment method'; END IF;
     IF length(coalesce(p->>'other',''))>80 OR (p->>'method'='other' AND length(trim(coalesce(p->>'other','')))=0) THEN RAISE EXCEPTION 'Describe the method in 1–80 characters'; END IF;
     data:=jsonb_build_object('sender',p->>'sender','recipient',p->>'recipient','amount_cents',amount,'paid_on',p->>'paid_on','method',p->>'method','other',CASE WHEN p->>'method'='other' THEN trim(p->>'other') ELSE '' END);
   END IF;
 END IF;
 EXECUTE format('INSERT INTO ledger_private.%I VALUES($1,$2,$3,$4,$5,now(),$6,$7) RETURNING *',table_name)
   INTO result USING p->>'id',next_version,data,is_delete,p->>'actor',p->>'request_id',fingerprint;
 RETURN result.data || jsonb_build_object('id',result.record_id,'version',result.version,'deleted',result.deleted,'actor',result.actor,'created_at',result.created_at);
END;
$$;
REVOKE ALL ON FUNCTION ledger_private.save_misc(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.utilities_save_misc_expense(p jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT ledger_private.save_misc('expense',p); $$;
CREATE FUNCTION public.utilities_save_misc_settlement(p jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT ledger_private.save_misc('settlement',p); $$;

CREATE FUNCTION public.utilities_misc_dashboard()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
WITH expenses AS (SELECT * FROM ledger_private.current_misc_expenses),
settlements AS (SELECT * FROM ledger_private.current_misc_settlements),
edges AS (
 SELECT s.key AS debtor,e.data->>'payer' AS creditor,s.value::bigint AS cents
 FROM expenses e CROSS JOIN LATERAL jsonb_each_text(e.data->'shares') s WHERE NOT e.deleted AND s.key<>e.data->>'payer'
 UNION ALL
 SELECT data->>'sender',data->>'recipient',-(data->>'amount_cents')::bigint FROM settlements WHERE NOT deleted
), totals AS (
 SELECT least(debtor,creditor) AS a,greatest(debtor,creditor) AS b,
 sum(CASE WHEN debtor<creditor THEN cents ELSE -cents END)::bigint AS cents FROM edges GROUP BY 1,2
)
SELECT jsonb_build_object(
 'expenses',coalesce((SELECT jsonb_agg(data || jsonb_build_object('id',record_id,'version',version,'deleted',deleted,'actor',actor,'created_at',created_at) ORDER BY data->>'paid_on' DESC,record_id) FROM expenses),'[]'::jsonb),
 'settlements',coalesce((SELECT jsonb_agg(data || jsonb_build_object('id',record_id,'version',version,'deleted',deleted,'actor',actor,'created_at',created_at) ORDER BY data->>'paid_on' DESC,record_id) FROM settlements),'[]'::jsonb),
 'expense_history',coalesce((SELECT jsonb_agg(data || jsonb_build_object('id',record_id,'version',version,'deleted',deleted,'actor',actor,'created_at',created_at) ORDER BY created_at DESC,record_id,version DESC) FROM ledger_private.misc_expense_events),'[]'::jsonb),
 'settlement_history',coalesce((SELECT jsonb_agg(data || jsonb_build_object('id',record_id,'version',version,'deleted',deleted,'actor',actor,'created_at',created_at) ORDER BY created_at DESC,record_id,version DESC) FROM ledger_private.misc_settlement_events),'[]'::jsonb),
 'pairs',coalesce((SELECT jsonb_agg(jsonb_build_object('sender',CASE WHEN cents>0 THEN a ELSE b END,'recipient',CASE WHEN cents>0 THEN b ELSE a END,'amount_cents',abs(cents)) ORDER BY a,b) FROM totals WHERE cents<>0),'[]'::jsonb),
 'rounding_cursor',(SELECT next_member FROM ledger_private.misc_rounding WHERE singleton),
 'updated_at',now(),'format_version',1
);
$$;
CREATE FUNCTION public.utilities_export_misc_ledger()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.utilities_misc_dashboard() || jsonb_build_object('exported_at',now());
$$;
REVOKE ALL ON FUNCTION public.utilities_misc_dashboard(),public.utilities_save_misc_expense(jsonb),public.utilities_save_misc_settlement(jsonb),public.utilities_export_misc_ledger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_misc_dashboard(),public.utilities_save_misc_expense(jsonb),public.utilities_save_misc_settlement(jsonb),public.utilities_export_misc_ledger() TO anon,authenticated,service_role;
COMMIT;
