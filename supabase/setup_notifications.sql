-- Rendered by configure_notifications.py; never contains committed secrets.
BEGIN;
CREATE OR REPLACE FUNCTION ledger_private.push_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ledger_private.push_config WHERE enabled)
    OR NOT EXISTS(SELECT 1 FROM ledger_private.push_devices WHERE enabled) THEN RETURN; END IF;
 PERFORM net.http_post(
  url:={{PROJECT_URL}}||'/functions/v1/household-push',
  headers:=jsonb_build_object('Content-Type','application/json','x-household-sender',
   (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='household_push_sender')),
  body:='{}'::jsonb, timeout_milliseconds:=100000
 );
 -- Keep operational records for 30 days, outside all household activity feeds.
 DELETE FROM ledger_private.push_deliveries WHERE event_id IN
  (SELECT id FROM ledger_private.push_events WHERE expires_at<now()-interval '30 days');
 DELETE FROM ledger_private.push_events WHERE expires_at<now()-interval '30 days';
END; $$;
REVOKE ALL ON FUNCTION ledger_private.push_tick() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('household-push','* * * * *','SELECT ledger_private.push_tick()');
UPDATE ledger_private.push_config SET public_key={{PUBLIC_KEY}},enabled=true;
COMMIT;
