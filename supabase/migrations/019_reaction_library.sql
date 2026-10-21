BEGIN;
CREATE FUNCTION ledger_private.valid_note_expression(expression text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT expression IN ('crying-laughing','confused','mogging','vomit','gentle-laughing','disappointed','shocked','gasp','eye-roll','sobbing','rage','heart-eyes','smug','facepalm');
$$;
REVOKE ALL ON FUNCTION ledger_private.valid_note_expression(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.utilities_save_note_reaction(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior record; old record; result jsonb; expression text:=p->>'expression';
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
 IF expression IS NOT NULL AND NOT ledger_private.valid_note_expression(expression) THEN RAISE EXCEPTION 'Choose a reaction'; END IF;
 LOCK TABLE ledger_private.bulletin_note_events IN SHARE MODE;
 LOCK TABLE ledger_private.note_reactions IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.note_reactions WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN to_jsonb(prior)-'request_id'-'fingerprint';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM ledger_private.current_bulletin_notes WHERE id=p->>'note_id' AND NOT deleted) THEN RAISE EXCEPTION 'This note is no longer on the board'; END IF;
 SELECT * INTO old FROM ledger_private.current_note_reactions WHERE note_id=p->>'note_id' AND member=p->>'actor';
 IF coalesce((p->>'expected_version')::integer,0)<>coalesce(old.version,0) THEN RAISE EXCEPTION 'Your reaction changed. Refresh and try again'; END IF;
 INSERT INTO ledger_private.note_reactions VALUES(p->>'note_id',p->>'actor',coalesce(old.version,0)+1,expression,now(),p->>'request_id',md5(p::text)) RETURNING to_jsonb(note_reactions)-'request_id'-'fingerprint' INTO result;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_bulletin_dashboard() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.utilities_bulletin_dashboard_before_reactions()||jsonb_build_object('reactions',coalesce((SELECT jsonb_agg(to_jsonb(r)-'request_id'-'fingerprint') FROM ledger_private.current_note_reactions r),'[]'::jsonb),'reaction_history',coalesce((SELECT jsonb_agg(to_jsonb(r)-'request_id'-'fingerprint' ORDER BY created_at DESC) FROM ledger_private.note_reactions r),'[]'::jsonb),'reaction_library_version',2,'format_version',2);
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
