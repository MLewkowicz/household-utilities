-- Run once in a dedicated Supabase project's SQL editor, or ./configure.sh.
-- No addresses, account details, PDF contents, or provider credentials are stored.
BEGIN;
CREATE SCHEMA IF NOT EXISTS ledger_private;
REVOKE ALL ON SCHEMA ledger_private FROM PUBLIC, anon, authenticated;

CREATE TABLE ledger_private.bill_versions (
  bill_id text NOT NULL, version integer NOT NULL CHECK (version > 0),
  data jsonb NOT NULL, deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bill_id, version)
);
CREATE TABLE ledger_private.allocations (
  bill_id text NOT NULL, version integer NOT NULL, charge_index integer NOT NULL,
  month text NOT NULL, member text NOT NULL, cents bigint NOT NULL,
  PRIMARY KEY (bill_id,version,charge_index,month,member),
  FOREIGN KEY (bill_id,version) REFERENCES ledger_private.bill_versions
);
CREATE TABLE ledger_private.import_requests (
  request_id text PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ledger_private.payment_events (
  payment_id text NOT NULL, version integer NOT NULL CHECK(version > 0),
  member_id text NOT NULL CHECK(member_id IN ('rina','ohm','rohil')),
  amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),
  method text NOT NULL CHECK(method IN ('venmo','zelle','other')),
  other text NOT NULL DEFAULT '' CHECK(length(other)<=80), paid_on date NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  actor text NOT NULL CHECK(actor IN ('michal','rina','ohm','rohil')),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL UNIQUE, fingerprint text NOT NULL,
  PRIMARY KEY(payment_id,version)
);
ALTER TABLE ledger_private.bill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.import_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.payment_events ENABLE ROW LEVEL SECURITY;

CREATE VIEW ledger_private.current_bills AS
SELECT DISTINCT ON (bill_id) * FROM ledger_private.bill_versions ORDER BY bill_id,version DESC;
CREATE VIEW ledger_private.current_payments AS
SELECT DISTINCT ON (payment_id) * FROM ledger_private.payment_events ORDER BY payment_id,version DESC;

-- Exact largest-remainder allocation. Ties: month, then Michal/Rina/Ohm/Rohil.
CREATE FUNCTION ledger_private.allocate(p_bill jsonb)
RETURNS TABLE(charge_index integer, month text, member text, cents bigint)
LANGUAGE sql SET search_path = '' AS $$
WITH charges AS (
 SELECT (ordinality-1)::int AS idx, value->>'kind' AS kind,
        (value->>'amount_cents')::bigint AS amount
 FROM jsonb_array_elements(p_bill->'charges') WITH ORDINALITY
), members AS (
 SELECT * FROM (VALUES('michal',0),('rina',1),('ohm',2),('rohil',3)) AS m(member,rank)
), daily AS (
 SELECT d::date AS day FROM generate_series(
   (p_bill->>'start_date')::date::timestamp,
   (p_bill->>'end_date')::date::timestamp, interval '1 day') d
), weights AS (
 SELECT c.idx,c.amount,to_char(d.day,'YYYY-MM') AS month,m.member,m.rank,
        sum(CASE WHEN d.day < date '2026-09-01' THEN 4 ELSE 3 END)::bigint AS weight,
        (((p_bill->>'end_date')::date-(p_bill->>'start_date')::date+1)*12)::bigint AS denominator
 FROM charges c CROSS JOIN daily d CROSS JOIN members m
 WHERE c.kind='recurring' AND (m.member<>'rohil' OR d.day>=date '2026-09-01')
 GROUP BY c.idx,c.amount,to_char(d.day,'YYYY-MM'),m.member,m.rank
 UNION ALL
 SELECT c.idx,c.amount,substring(p_bill->>'start_date',1,7),m.member,m.rank,1::bigint,4::bigint
 FROM charges c CROSS JOIN members m WHERE c.kind='one_time'
 UNION ALL
 SELECT c.idx,c.amount,'opening',m.member,m.rank,1::bigint,3::bigint
 FROM charges c CROSS JOIN members m WHERE c.kind='opening' AND m.member<>'rohil'
), shares AS (
 SELECT *, abs(amount)*weight/denominator AS base,
           abs(amount)*weight%denominator AS remainder FROM weights
), ranked AS (
 SELECT *, row_number() OVER(PARTITION BY idx ORDER BY remainder DESC,month,rank) AS priority,
           abs(amount)-sum(base) OVER(PARTITION BY idx) AS leftover FROM shares
)
SELECT idx,month,member,(sign(amount)*(base+CASE WHEN priority<=leftover THEN 1 ELSE 0 END))::bigint FROM ranked;
$$;

CREATE FUNCTION public.utilities_dashboard()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
SELECT jsonb_build_object(
 'bills',coalesce((SELECT jsonb_agg(data || jsonb_build_object('version',version,'deleted',deleted,'created_at',created_at,'actor','michal') ORDER BY data->>'start_date') FROM ledger_private.current_bills WHERE NOT deleted),'[]'::jsonb),
 'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object('bill_id',a.bill_id,'charge_index',a.charge_index,'month',a.month,'member',a.member,'cents',a.cents)) FROM ledger_private.allocations a JOIN ledger_private.current_bills b USING(bill_id,version) WHERE NOT b.deleted),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(e)-'request_id'-'fingerprint' ORDER BY created_at DESC,version DESC) FROM ledger_private.payment_events e),'[]'::jsonb),
 'bill_history',coalesce((SELECT jsonb_agg(jsonb_build_object('bill_id',bill_id,'version',version,'deleted',deleted,'data',data,'created_at',created_at) ORDER BY created_at DESC) FROM ledger_private.bill_versions),'[]'::jsonb),
 'updated_at',now()
);
$$;

-- Anonymous, deliberately trust-based payments. Append-only revisions make all
-- changes visible. No caller can directly modify bills or erase audit history.
CREATE FUNCTION public.utilities_save_payment(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 old ledger_private.payment_events; previous ledger_private.payment_events;
 pid text; ver integer; result ledger_private.payment_events;
 is_delete boolean; fingerprint text := md5(p::text);
BEGIN
 IF jsonb_typeof(p)<>'object' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid request ID'; END IF;
 LOCK TABLE ledger_private.payment_events IN EXCLUSIVE MODE;
 SELECT * INTO previous FROM ledger_private.payment_events WHERE request_id=p->>'request_id';
 IF FOUND THEN
   IF previous.fingerprint<>fingerprint THEN RAISE EXCEPTION 'This request ID was already used with different details'; END IF;
   RETURN to_jsonb(previous)-'request_id'-'fingerprint';
 END IF;
 IF coalesce(p->>'action','') NOT IN ('create','edit','delete') THEN RAISE EXCEPTION 'Invalid payment action'; END IF;
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who made this change'; END IF;
 pid := p->>'payment_id';
 IF coalesce(pid,'') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid payment ID'; END IF;
 SELECT * INTO old FROM ledger_private.current_payments WHERE payment_id=pid;
 IF p->>'action'='create' THEN
   IF FOUND THEN RAISE EXCEPTION 'Payment already exists'; END IF;
   ver := 1;
 ELSE
   IF NOT FOUND OR old.deleted THEN RAISE EXCEPTION 'Payment no longer exists; refresh the ledger'; END IF;
   IF (p->>'expected_version') IS NULL OR old.version<>(p->>'expected_version')::integer THEN RAISE EXCEPTION 'This payment changed; refresh before editing'; END IF;
   ver := old.version+1;
 END IF;
 is_delete := p->>'action'='delete';
 IF is_delete THEN
   INSERT INTO ledger_private.payment_events VALUES(pid,ver,old.member_id,old.amount_cents,old.method,old.other,old.paid_on,true,p->>'actor',now(),p->>'request_id',fingerprint) RETURNING * INTO result;
 ELSE
   IF coalesce(p->>'member_id','') NOT IN ('rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a roommate who is reimbursing Michal'; END IF;
   IF ver>1 AND old.member_id<>p->>'member_id' THEN RAISE EXCEPTION 'Delete and re-enter a payment to change its owner'; END IF;
   IF coalesce(p->>'amount_cents','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Enter a positive amount with no more than two decimal places'; END IF;
   IF coalesce(p->>'method','') NOT IN ('venmo','zelle','other') THEN RAISE EXCEPTION 'Choose a payment method'; END IF;
   IF p->>'method'='other' AND length(trim(coalesce(p->>'other','')))=0 THEN RAISE EXCEPTION 'Describe the payment method'; END IF;
   IF coalesce(p->>'paid_on','') !~ '^\d{4}-\d{2}-\d{2}$' OR (p->>'paid_on')::date>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Use a valid payment date, today or earlier'; END IF;
   INSERT INTO ledger_private.payment_events VALUES(pid,ver,p->>'member_id',(p->>'amount_cents')::integer,p->>'method',CASE WHEN p->>'method'='other' THEN trim(p->>'other') ELSE '' END,(p->>'paid_on')::date,false,p->>'actor',now(),p->>'request_id',fingerprint) RETURNING * INTO result;
 END IF;
 RETURN to_jsonb(result)-'request_id'-'fingerprint';
END;
$$;

CREATE FUNCTION public.utilities_import_bills(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 raw jsonb; b jsonb; c jsonb; clean_charges jsonb; old ledger_private.bill_versions;
 opening ledger_private.bill_versions; previous ledger_private.import_requests;
 expected integer; next_version integer; has_opening boolean; did_change boolean := false;
 incoming_ids text[] := ARRAY[]::text[]; reconcile jsonb;
 outcome jsonb := '[]'::jsonb; fingerprint text := md5(p::text);
BEGIN
 IF jsonb_typeof(p)<>'object' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid import request ID'; END IF;
 IF jsonb_typeof(p->'bills')<>'array' OR jsonb_array_length(p->'bills') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Import between 1 and 100 bills'; END IF;
 LOCK TABLE ledger_private.bill_versions IN EXCLUSIVE MODE;
 SELECT * INTO previous FROM ledger_private.import_requests WHERE request_id=p->>'request_id';
 IF FOUND THEN
   IF previous.fingerprint<>fingerprint THEN RAISE EXCEPTION 'Import request ID reused with different data'; END IF;
   RETURN previous.result;
 END IF;
 FOR raw IN SELECT value FROM jsonb_array_elements(p->'bills') LOOP
   IF coalesce(raw->>'id','') !~ '^[a-zA-Z0-9:_-]{1,120}$' OR raw->>'id'=ANY(incoming_ids) THEN RAISE EXCEPTION 'Invalid or repeated bill ID'; END IF;
   incoming_ids := array_append(incoming_ids,raw->>'id');
   IF coalesce(raw->>'utility','') NOT IN ('gas','electricity','wifi') THEN RAISE EXCEPTION 'Unknown utility'; END IF;
   IF coalesce(raw->>'source_hash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid PDF hash'; END IF;
   IF jsonb_typeof(raw->'charges')<>'array' OR jsonb_array_length(raw->'charges') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Provide 1 to 20 charge lines'; END IF;
   clean_charges := '[]'::jsonb; has_opening := false;
   FOR c IN SELECT value FROM jsonb_array_elements(raw->'charges') LOOP
     IF coalesce(c->>'kind','') NOT IN ('recurring','one_time','opening') OR coalesce(c->>'amount_cents','') !~ '^-?[0-9]+$' OR abs((c->>'amount_cents')::bigint)>100000000 THEN RAISE EXCEPTION 'Invalid charge'; END IF;
     IF length(trim(coalesce(c->>'label',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid charge label'; END IF;
     IF c->>'kind'='opening' THEN has_opening := true; END IF;
     clean_charges := clean_charges || jsonb_build_array(jsonb_build_object('kind',c->>'kind','amount_cents',(c->>'amount_cents')::bigint,'label',trim(c->>'label')));
   END LOOP;
   IF has_opening THEN
     IF raw->>'start_date' IS NOT NULL OR raw->>'end_date' IS NOT NULL OR coalesce(raw->>'opening_before','') !~ '^\d{4}-\d{2}-\d{2}$' OR (raw->>'opening_before')::date>date '2026-09-01' OR EXISTS(SELECT 1 FROM jsonb_array_elements(clean_charges) x WHERE x->>'kind'<>'opening') THEN RAISE EXCEPTION 'Opening charges require unknown dates and a pre-September cutoff'; END IF;
   ELSE
     IF coalesce(raw->>'start_date','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(raw->>'end_date','') !~ '^\d{4}-\d{2}-\d{2}$' OR (raw->>'end_date')::date-(raw->>'start_date')::date NOT BETWEEN 0 AND 369 OR raw->>'opening_before' IS NOT NULL THEN RAISE EXCEPTION 'Invalid service period'; END IF;
   END IF;
   IF length(coalesce(raw->>'note',''))>240 THEN RAISE EXCEPTION 'Note is too long'; END IF;
   b := jsonb_build_object('id',raw->>'id','utility',raw->>'utility','start_date',raw->>'start_date','end_date',raw->>'end_date','opening_before',raw->>'opening_before','charges',clean_charges,'source_hash',raw->>'source_hash','note',coalesce(raw->>'note',''));
   SELECT * INTO old FROM ledger_private.current_bills WHERE bill_id=raw->>'id';
   IF FOUND AND NOT old.deleted AND old.data=b THEN
     outcome := outcome || jsonb_build_array(jsonb_build_object('id',raw->>'id','status','unchanged','version',old.version));
     CONTINUE;
   END IF;
   expected := coalesce((raw->>'expected_version')::integer,0);
   IF coalesce(old.version,0)<>expected THEN RAISE EXCEPTION 'Bill changed since preview: %',raw->>'id'; END IF;
   IF old.version IS NOT NULL AND old.data->>'utility'<>b->>'utility' THEN RAISE EXCEPTION 'A bill cannot change utility'; END IF;
   IF NOT has_opening THEN
     FOR opening IN SELECT * FROM ledger_private.current_bills WHERE NOT deleted AND data->>'utility'=b->>'utility' AND data->>'opening_before' IS NOT NULL AND (b->>'start_date')::date<(data->>'opening_before')::date LOOP
       SELECT value INTO reconcile FROM jsonb_array_elements(coalesce(raw->'replaces_opening','[]'::jsonb)) WHERE value->>'id'=opening.bill_id;
       IF reconcile IS NULL OR (reconcile->>'expected_version')::integer IS DISTINCT FROM opening.version THEN RAISE EXCEPTION 'Reconcile opening charge % before importing earlier statements',opening.bill_id; END IF;
       INSERT INTO ledger_private.bill_versions VALUES(opening.bill_id,opening.version+1,opening.data,true,now());
     END LOOP;
     IF EXISTS(SELECT 1 FROM ledger_private.current_bills x WHERE NOT x.deleted AND x.bill_id<>b->>'id' AND x.data->>'utility'=b->>'utility' AND x.data->>'start_date' IS NOT NULL AND (x.data->>'start_date')::date<=(b->>'end_date')::date AND (x.data->>'end_date')::date>=(b->>'start_date')::date) THEN RAISE EXCEPTION 'Service dates overlap an existing bill; revise that bill instead'; END IF;
   END IF;
   next_version := expected+1;
   INSERT INTO ledger_private.bill_versions VALUES(b->>'id',next_version,b,false,now());
   INSERT INTO ledger_private.allocations SELECT b->>'id',next_version,* FROM ledger_private.allocate(b);
   outcome := outcome || jsonb_build_array(jsonb_build_object('id',b->>'id','status',CASE WHEN expected=0 THEN 'created' ELSE 'revised' END,'version',next_version));
   did_change := true;
 END LOOP;
 INSERT INTO ledger_private.import_requests VALUES(p->>'request_id',fingerprint,outcome,now());
 RETURN outcome;
END;
$$;

CREATE FUNCTION public.utilities_export_ledger()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
SELECT public.utilities_dashboard() || jsonb_build_object('exported_at',now(),'format_version',1);
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA ledger_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ledger_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.utilities_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.utilities_save_payment(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.utilities_import_bills(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.utilities_export_ledger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_dashboard(), public.utilities_save_payment(jsonb), public.utilities_export_ledger() TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.utilities_import_bills(jsonb) TO service_role;
COMMIT;
