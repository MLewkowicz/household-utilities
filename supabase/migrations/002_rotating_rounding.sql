-- Derived shares use a replayable rotation; source bills and payments are intact.
BEGIN;
CREATE FUNCTION ledger_private.allocate_ledger(p_bills jsonb)
RETURNS TABLE(bill_id text, charge_index integer, month text, member text, cents bigint)
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
 b jsonb; g record; cell jsonb; previous_idx integer; remaining bigint;
 take integer; position integer; contested boolean; direction integer;
 cursors integer[] := ARRAY[0,0]; last_rank integer;
BEGIN
 FOR b IN SELECT value FROM jsonb_array_elements(p_bills)
   ORDER BY coalesce(value->>'start_date',value->>'opening_before') COLLATE "C",
     coalesce(value->>'end_date',value->>'opening_before') COLLATE "C",
     (value->>'utility') COLLATE "C", (value->>'id') COLLATE "C"
 LOOP
   previous_idx := -1;
   FOR g IN
     WITH charges AS (
       SELECT (ordinality-1)::int AS idx, value->>'kind' AS kind,
              (value->>'amount_cents')::bigint AS amount
       FROM jsonb_array_elements(b->'charges') WITH ORDINALITY
     ), members AS (
       SELECT * FROM (VALUES('michal',0),('rina',1),('ohm',2),('rohil',3)) AS m(member,rank)
     ), daily AS (
       SELECT d::date AS day FROM generate_series((b->>'start_date')::date::timestamp,
         (b->>'end_date')::date::timestamp, interval '1 day') d
     ), weights AS (
       SELECT c.idx,c.amount,to_char(d.day,'YYYY-MM') AS month,m.member,m.rank,
         sum(CASE WHEN d.day < date '2026-09-01' THEN 4 ELSE 3 END)::bigint AS weight,
         (((b->>'end_date')::date-(b->>'start_date')::date+1)*12)::bigint AS denominator
       FROM charges c CROSS JOIN daily d CROSS JOIN members m
       WHERE c.kind='recurring' AND (m.member<>'rohil' OR d.day>=date '2026-09-01')
       GROUP BY c.idx,c.amount,to_char(d.day,'YYYY-MM'),m.member,m.rank
       UNION ALL
       SELECT c.idx,c.amount,substring(b->>'start_date',1,7),m.member,m.rank,1::bigint,4::bigint
       FROM charges c CROSS JOIN members m WHERE c.kind='one_time'
       UNION ALL
       SELECT c.idx,c.amount,'opening',m.member,m.rank,1::bigint,3::bigint
       FROM charges c CROSS JOIN members m WHERE c.kind='opening' AND m.member<>'rohil'
     ), shares AS (
       SELECT w.*,abs(w.amount)*w.weight/w.denominator AS base,
         abs(w.amount)*w.weight%w.denominator AS remainder FROM weights w
     ), leftovers AS (
       SELECT s.*,abs(s.amount)-sum(s.base) OVER(PARTITION BY s.idx) AS leftover FROM shares s
     )
     SELECT s.idx,s.amount,s.month,s.remainder,s.leftover,
       jsonb_agg(jsonb_build_object('member',s.member,'rank',s.rank,'base',s.base)) AS cells
     FROM leftovers s GROUP BY s.idx,s.amount,s.month,s.remainder,s.leftover
     ORDER BY s.idx,s.remainder DESC,s.month COLLATE "C"
   LOOP
     IF g.idx<>previous_idx THEN remaining:=g.leftover; previous_idx:=g.idx; END IF;
     take := least(remaining,jsonb_array_length(g.cells));
     contested := take>0 AND take<jsonb_array_length(g.cells);
     direction := CASE WHEN g.amount<0 THEN 2 ELSE 1 END;
     position := 0;
     FOR cell IN SELECT value FROM jsonb_array_elements(g.cells)
       ORDER BY ((value->>'rank')::int-cursors[direction]+4)%4
     LOOP
       bill_id:=b->>'id'; charge_index:=g.idx; month:=g.month; member:=cell->>'member';
       cents := (sign(g.amount)*((cell->>'base')::bigint+CASE WHEN position<take THEN 1 ELSE 0 END))::bigint;
       IF position<take THEN last_rank:=(cell->>'rank')::int; END IF;
       position:=position+1;
       RETURN NEXT;
     END LOOP;
     IF contested THEN cursors[direction]:=(last_rank+1)%4; END IF;
     remaining:=remaining-take;
   END LOOP;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION ledger_private.allocate_ledger(jsonb) FROM PUBLIC,anon,authenticated;

-- Stored import-time allocations remain historical data. Current shares are
-- derived from current bills so backdated imports and corrections replay fairly.
CREATE OR REPLACE FUNCTION public.utilities_dashboard()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
WITH active AS (SELECT * FROM ledger_private.current_bills WHERE NOT deleted)
SELECT jsonb_build_object(
 'bills',coalesce((SELECT jsonb_agg(data || jsonb_build_object('version',version,'deleted',deleted,'created_at',created_at,'actor','michal') ORDER BY data->>'start_date') FROM active),'[]'::jsonb),
 'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM ledger_private.allocate_ledger(coalesce((SELECT jsonb_agg(data) FROM active),'[]'::jsonb)) a),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(e)-'request_id'-'fingerprint' ORDER BY created_at DESC,version DESC) FROM ledger_private.payment_events e),'[]'::jsonb),
 'bill_history',coalesce((SELECT jsonb_agg(jsonb_build_object('bill_id',bill_id,'version',version,'deleted',deleted,'data',data,'created_at',created_at) ORDER BY created_at DESC) FROM ledger_private.bill_versions),'[]'::jsonb),
 'allocation_version',2,
 'updated_at',now()
);
$$;

CREATE OR REPLACE FUNCTION public.utilities_export_ledger()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
SELECT public.utilities_dashboard() || jsonb_build_object('exported_at',now(),'format_version',2);
$$;
COMMIT;
