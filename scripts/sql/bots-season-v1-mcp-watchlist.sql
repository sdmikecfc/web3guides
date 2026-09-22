-- REVIEW ONLY. Apply after bots-mcp-trades-v1.sql AND bots-season-v1.sql.
-- Adds the season enrollment read contract and extends only the existing game
-- intake's enrollment check. No Reporter, accounting or existing view changes.
BEGIN;
CREATE OR REPLACE VIEW public.mk6_mcp_watchlist WITH (security_barrier = true) AS
 SELECT p.wallet, min(p.joined_at) AS enlisted_at
 FROM public.mk6_players p
 WHERE p.wallet ~ '^0x[0-9a-f]{40}$'
   AND NOT EXISTS(SELECT 1 FROM public.battle_bots_players old
     WHERE old.wallet=p.wallet AND (old.is_test=true OR old.is_operator=true))
 GROUP BY p.wallet;
-- Retain archived enrollments: source corrections can arrive after rollover.
REVOKE ALL ON public.mk6_mcp_watchlist FROM PUBLIC, service_role;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','doma_ai_ro'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON public.mk6_mcp_watchlist FROM %I',role_name);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='doma_ai_ro') THEN
  GRANT SELECT ON public.mk6_mcp_watchlist TO doma_ai_ro;
 END IF;
END $$;
GRANT SELECT ON public.mk6_mcp_watchlist TO service_role;
-- botsDb is the existing server-only service role. The original intake revokes
-- its table SELECT privileges; grant only the columns this season adapter reads.
-- No INSERT/UPDATE/DELETE, reader-role access or other table privilege is added.
GRANT SELECT(network_id,tx_hash,event_index,wallet,executed_at,status,usd_value,revision,batch_id,payload)
 ON public.mk_mcp_fills TO service_role;
GRANT SELECT(batch_id,complete,window_start,window_end,body,recorded_at)
 ON public.mk_mcp_batches TO service_role;

-- Preserve the installed RPC's owner, grants, validation, fill identity rules and
-- correction logic. Fail closed if its reviewed enrollment clause has changed.
DO $extension$
DECLARE
 definition text;
 old_clause constant text := $old$IF NOT EXISTS(SELECT 1 FROM public.mk_mcp_watchlist w WHERE w.wallet = t->>'wallet' AND w.enlisted_at <= executed)$old$;
 new_clause constant text := $new$IF NOT EXISTS(SELECT 1 FROM public.mk_mcp_watchlist w WHERE w.wallet = t->>'wallet' AND w.enlisted_at <= executed)
        AND NOT EXISTS(SELECT 1 FROM public.mk6_mcp_watchlist w WHERE w.wallet = t->>'wallet' AND w.enlisted_at <= executed)$new$;
BEGIN
 IF to_regprocedure('public.mk_mcp_ingest(uuid,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Install the reviewed game MCP intake before its season extension.';
 END IF;
 SELECT pg_get_functiondef('public.mk_mcp_ingest(uuid,text,jsonb)'::regprocedure) INTO definition;
 IF strpos(definition,new_clause)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,old_clause,'')))/length(old_clause)<>1 THEN
  RAISE EXCEPTION 'The game MCP intake enrollment check has changed; review this extension again.';
 END IF;
 EXECUTE replace(definition,old_clause,new_clause);
END $extension$;
COMMIT;
