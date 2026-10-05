-- STAGED ONLY: requires separate reviewed permission before any live/shared apply.
-- Trusted-source reporting intake, not on-chain verification or a rewards ledger.
-- Creates only mk_mcp_* objects. Existing players are read; no existing object is replaced.
BEGIN;

CREATE TABLE IF NOT EXISTS public.mk_mcp_markets (
  network_id TEXT NOT NULL CHECK (network_id ~ '^eip155:[1-9][0-9]{0,14}$'),
  market_address TEXT NOT NULL CHECK (market_address ~ '^0x[0-9a-f]{40}$' AND market_address <> '0x0000000000000000000000000000000000000000'),
  token_a TEXT NOT NULL CHECK (token_a ~ '^0x[0-9a-f]{40}$' AND token_a <> '0x0000000000000000000000000000000000000000'),
  token_b TEXT NOT NULL CHECK (token_b ~ '^0x[0-9a-f]{40}$' AND token_b <> '0x0000000000000000000000000000000000000000' AND token_b <> token_a),
  domain_name TEXT NOT NULL DEFAULT 'gochujang.com' CHECK (domain_name = 'gochujang.com'), enabled BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (network_id, market_address)
);
CREATE TABLE IF NOT EXISTS public.mk_mcp_batches (
  batch_id UUID PRIMARY KEY, payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  window_start TIMESTAMPTZ NOT NULL, window_end TIMESTAMPTZ NOT NULL CHECK (window_end > window_start),
  complete BOOLEAN NOT NULL, received INT NOT NULL CHECK (received >= 0), body JSONB NOT NULL,
  result JSONB NOT NULL DEFAULT '{}', recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mk_mcp_fills (
  network_id TEXT NOT NULL, tx_hash TEXT NOT NULL CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
  event_index BIGINT NOT NULL CHECK (event_index >= 0), source_fill_id TEXT NOT NULL,
  wallet TEXT NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'), market_address TEXT NOT NULL, executed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('finalized','reverted')),
  usd_value NUMERIC NOT NULL CHECK (usd_value >= 0 AND scale(usd_value) = 6),
  revision INT NOT NULL CHECK (revision > 0), payload JSONB NOT NULL,
  batch_id UUID NOT NULL REFERENCES public.mk_mcp_batches(batch_id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (network_id, tx_hash, event_index), UNIQUE (network_id, source_fill_id)
);
CREATE INDEX IF NOT EXISTS mk_mcp_fills_wallet_executed_idx ON public.mk_mcp_fills(wallet, executed_at);
CREATE TABLE IF NOT EXISTS public.mk_mcp_fill_history (
  network_id TEXT NOT NULL, tx_hash TEXT NOT NULL, event_index BIGINT NOT NULL, revision INT NOT NULL,
  payload JSONB NOT NULL, batch_id UUID NOT NULL REFERENCES public.mk_mcp_batches(batch_id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (network_id, tx_hash, event_index, revision)
);
ALTER TABLE public.mk_mcp_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mk_mcp_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mk_mcp_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mk_mcp_fill_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.mk_mcp_watchlist WITH (security_barrier = true) AS
  SELECT wallet, enlisted_at FROM public.battle_bots_players
  WHERE is_test = false AND is_operator = false AND wallet ~ '^0x[0-9a-f]{40}$' AND enlisted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mk_mcp_ingest(p_batch_id UUID, p_payload_hash TEXT, p_batch JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  existing_batch public.mk_mcp_batches%ROWTYPE; old_fill public.mk_mcp_fills%ROWTYPE;
  t JSONB; k TEXT; lock_row RECORD; start_at TIMESTAMPTZ; end_at TIMESTAMPTZ; executed TIMESTAMPTZ;
  inserted_count INT := 0; updated_count INT := 0; duplicate_count INT := 0; n INT; next_revision INT; receipt JSONB;
  utc_pattern TEXT := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$';
  uint256_max NUMERIC := 115792089237316195423570985008687907853269984665640564039457584007913129639935;
  fields TEXT[] := ARRAY['networkId','txHash','eventIndex','sourceFillId','wallet','marketAddress','tokenIn','tokenOut','amountIn','amountOut','executedAt','usdValue','valuationSource','source','tool','executionId','orderId','strategyId','status','revision','correctionReason'];
  mutable TEXT[] := ARRAY['amountIn','amountOut','usdValue','valuationSource','status','revision','correctionReason'];
BEGIN
  IF p_batch_id IS NULL OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_batch) IS DISTINCT FROM 'object'
    OR NOT p_batch ?& ARRAY['schemaVersion','batchId','windowStart','windowEnd','complete','trades']
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_batch) AS x(key) WHERE NOT key = ANY(ARRAY['schemaVersion','batchId','windowStart','windowEnd','complete','trades']))
    OR p_batch->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_batch->'batchId') IS DISTINCT FROM 'string' OR (p_batch->>'batchId')::uuid <> p_batch_id
    OR jsonb_typeof(p_batch->'complete') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_batch->'trades') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'MK_MCP_REJECTED: invalid batch';
  END IF;
  -- Batch and fill locks use separate advisory namespaces. Hash collisions only serialize unrelated keys.
  PERFORM pg_advisory_xact_lock(1734510, hashtext(p_batch_id::text));
  SELECT * INTO existing_batch FROM public.mk_mcp_batches WHERE batch_id = p_batch_id;
  IF FOUND THEN
    IF existing_batch.payload_hash <> p_payload_hash OR existing_batch.body IS DISTINCT FROM p_batch THEN RAISE EXCEPTION 'MK_MCP_CONFLICT: batch ID already has a different payload'; END IF;
    RETURN existing_batch.result || jsonb_build_object('replayed', true);
  END IF;
  IF jsonb_typeof(p_batch->'windowStart') IS DISTINCT FROM 'string' OR p_batch->>'windowStart' !~ utc_pattern
    OR jsonb_typeof(p_batch->'windowEnd') IS DISTINCT FROM 'string' OR p_batch->>'windowEnd' !~ utc_pattern THEN
    RAISE EXCEPTION 'MK_MCP_REJECTED: UTC window required';
  END IF;
  start_at := (p_batch->>'windowStart')::timestamptz; end_at := (p_batch->>'windowEnd')::timestamptz;
  n := jsonb_array_length(p_batch->'trades');
  IF start_at >= end_at OR end_at - start_at > interval '24 hours' OR end_at > now() + interval '60 seconds' OR n > 500
    OR to_char(start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_batch->>'windowStart'
    OR to_char(end_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_batch->>'windowEnd'
    THEN RAISE EXCEPTION 'MK_MCP_REJECTED: invalid window or batch size'; END IF;

  -- Take all canonical/source locks in one global order before deciding whether
  -- a fill is new. Configuration revocation must not block retries or reversals.
  FOR lock_row IN SELECT DISTINCT hashtext(key) AS id FROM (
    SELECT 'fill:' || (v->>'networkId') || ':' || (v->>'txHash') || ':' || (v->>'eventIndex') AS key FROM jsonb_array_elements(p_batch->'trades') v
    UNION ALL SELECT 'source:' || (v->>'networkId') || ':' || (v->>'sourceFillId') FROM jsonb_array_elements(p_batch->'trades') v
  ) locks ORDER BY id LOOP PERFORM pg_advisory_xact_lock(1734511, lock_row.id); END LOOP;

  -- Validate the complete batch before changing any intake row.
  FOR t IN SELECT value FROM jsonb_array_elements(p_batch->'trades') LOOP
    IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR NOT t ?& fields
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(t) AS x(key) WHERE NOT key = ANY(fields)) THEN
      RAISE EXCEPTION 'MK_MCP_REJECTED: invalid fill fields';
    END IF;
    FOREACH k IN ARRAY ARRAY['networkId','txHash','sourceFillId','wallet','marketAddress','tokenIn','tokenOut','amountIn','amountOut','executedAt','usdValue','valuationSource','source','tool','executionId','status'] LOOP
      IF jsonb_typeof(t->k) IS DISTINCT FROM 'string' OR length(btrim(t->>k)) = 0 THEN RAISE EXCEPTION 'MK_MCP_REJECTED: missing fill value'; END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['wallet','marketAddress','tokenIn','tokenOut'] LOOP
      IF t->>k !~ '^0x[0-9a-f]{40}$' OR t->>k = '0x0000000000000000000000000000000000000000' THEN RAISE EXCEPTION 'MK_MCP_REJECTED: invalid address'; END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['orderId','strategyId','correctionReason'] LOOP
      IF t->k <> 'null'::jsonb AND (jsonb_typeof(t->k) IS DISTINCT FROM 'string' OR length(btrim(t->>k)) = 0
        OR length(t->>k) > CASE WHEN k = 'correctionReason' THEN 240 ELSE 160 END
        OR (k <> 'correctionReason' AND t->>k !~ '^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$') OR t->>k ~ '[[:cntrl:]]') THEN
        RAISE EXCEPTION 'MK_MCP_REJECTED: invalid optional value';
      END IF;
    END LOOP;
    IF t->>'networkId' !~ '^eip155:[1-9][0-9]{0,14}$'
      OR t->>'txHash' !~ '^0x[0-9a-f]{64}$' OR t->>'txHash' = '0x0000000000000000000000000000000000000000000000000000000000000000'
      OR t->>'sourceFillId' !~ '^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$' OR t->>'executionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$'
      OR length(t->>'valuationSource') > 200 OR t->>'valuationSource' ~ '[[:cntrl:]]'
      OR t->>'source' <> 'doma_mcp' OR t->>'tool' NOT IN ('tokens.swap.v1','agent.execute.v1','defi.limitOrder.create.v1')
      OR t->>'status' NOT IN ('finalized','reverted')
      OR jsonb_typeof(t->'eventIndex') IS DISTINCT FROM 'number' OR t->>'eventIndex' !~ '^(0|[1-9][0-9]*)$'
      OR jsonb_typeof(t->'revision') IS DISTINCT FROM 'number' OR t->>'revision' !~ '^[1-9][0-9]*$'
      OR t->>'amountIn' !~ '^[1-9][0-9]{0,77}$' OR t->>'amountOut' !~ '^[1-9][0-9]{0,77}$'
      OR t->>'usdValue' !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{6}$'
      OR t->>'executedAt' !~ utc_pattern THEN RAISE EXCEPTION 'MK_MCP_REJECTED: invalid normalized fill'; END IF;
    IF (t->>'eventIndex')::numeric > 2147483647 OR (t->>'revision')::numeric > 2147483647
      OR (t->>'amountIn')::numeric > uint256_max OR (t->>'amountOut')::numeric > uint256_max
      OR (t->>'status' = 'finalized' AND (t->>'usdValue')::numeric <= 0)
      OR (t->>'tool' = 'defi.limitOrder.create.v1' AND t->'orderId' = 'null'::jsonb)
      OR t->>'tokenIn' = t->>'tokenOut' THEN RAISE EXCEPTION 'MK_MCP_REJECTED: invalid amount, identifier or limit-order attribution'; END IF;
    next_revision := (t->>'revision')::int;
    executed := (t->>'executedAt')::timestamptz;
    IF executed < start_at OR executed >= end_at OR to_char(executed AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> t->>'executedAt'
      THEN RAISE EXCEPTION 'MK_MCP_REJECTED: execution time is outside the batch window'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.mk_mcp_fills WHERE network_id = t->>'networkId' AND tx_hash = t->>'txHash' AND event_index = (t->>'eventIndex')::bigint) THEN
      IF NOT EXISTS(SELECT 1 FROM public.mk_mcp_watchlist w WHERE w.wallet = t->>'wallet' AND w.enlisted_at <= executed)
        THEN RAISE EXCEPTION 'MK_MCP_REJECTED: wallet was not eligible when the fill executed'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.mk_mcp_markets m WHERE m.network_id = t->>'networkId' AND m.market_address = t->>'marketAddress'
        AND m.enabled AND m.domain_name = 'gochujang.com'
        AND ((m.token_a = t->>'tokenIn' AND m.token_b = t->>'tokenOut') OR (m.token_b = t->>'tokenIn' AND m.token_a = t->>'tokenOut')))
        THEN RAISE EXCEPTION 'MK_MCP_REJECTED: market or token pair is not allowlisted'; END IF;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_batch->'trades') v GROUP BY v->>'networkId',v->>'txHash',v->>'eventIndex' HAVING count(*) > 1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_batch->'trades') v GROUP BY v->>'networkId',v->>'sourceFillId' HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'MK_MCP_REJECTED: duplicate fill keys within batch'; END IF;

  INSERT INTO public.mk_mcp_batches(batch_id,payload_hash,window_start,window_end,complete,received,body)
    VALUES(p_batch_id,p_payload_hash,start_at,end_at,(p_batch->>'complete')::boolean,n,p_batch);
  FOR t IN SELECT value FROM jsonb_array_elements(p_batch->'trades') LOOP
    next_revision := (t->>'revision')::int;
    SELECT * INTO old_fill FROM public.mk_mcp_fills WHERE network_id = t->>'networkId' AND tx_hash = t->>'txHash' AND event_index = (t->>'eventIndex')::bigint FOR UPDATE;
    IF FOUND THEN
      IF next_revision = old_fill.revision AND t = old_fill.payload THEN duplicate_count := duplicate_count + 1; CONTINUE; END IF;
      IF next_revision <> old_fill.revision + 1 OR t->'correctionReason' = 'null'::jsonb THEN RAISE EXCEPTION 'MK_MCP_CONFLICT: correction needs the next revision and a reason'; END IF;
      IF (t - mutable) IS DISTINCT FROM (old_fill.payload - mutable) THEN RAISE EXCEPTION 'MK_MCP_CONFLICT: fill attribution is immutable; manual review required'; END IF;
      UPDATE public.mk_mcp_fills SET payload = t, status = t->>'status', usd_value = (t->>'usdValue')::numeric,
        revision = next_revision, batch_id = p_batch_id, updated_at = now()
        WHERE network_id = old_fill.network_id AND tx_hash = old_fill.tx_hash AND event_index = old_fill.event_index;
      updated_count := updated_count + 1;
    ELSE
      IF next_revision <> 1 OR t->>'status' <> 'finalized' OR t->'correctionReason' <> 'null'::jsonb THEN RAISE EXCEPTION 'MK_MCP_CONFLICT: first observation must be finalized revision 1'; END IF;
      IF EXISTS(SELECT 1 FROM public.mk_mcp_fills WHERE network_id = t->>'networkId' AND source_fill_id = t->>'sourceFillId') THEN
        RAISE EXCEPTION 'MK_MCP_CONFLICT: source fill ID belongs to another economic fill';
      END IF;
      INSERT INTO public.mk_mcp_fills(network_id,tx_hash,event_index,source_fill_id,wallet,market_address,executed_at,status,usd_value,revision,payload,batch_id)
        VALUES(t->>'networkId',t->>'txHash',(t->>'eventIndex')::bigint,t->>'sourceFillId',t->>'wallet',t->>'marketAddress',(t->>'executedAt')::timestamptz,t->>'status',(t->>'usdValue')::numeric,next_revision,t,p_batch_id);
      inserted_count := inserted_count + 1;
    END IF;
    INSERT INTO public.mk_mcp_fill_history(network_id,tx_hash,event_index,revision,payload,batch_id)
      VALUES(t->>'networkId',t->>'txHash',(t->>'eventIndex')::bigint,next_revision,t,p_batch_id);
  END LOOP;
  receipt := jsonb_build_object('ok',true,'batchId',p_batch_id,'inserted',inserted_count,'updated',updated_count,'duplicates',duplicate_count,
    'received',n,'coinsAwarded',0,'status','recorded','replayed',false);
  UPDATE public.mk_mcp_batches SET result = receipt WHERE batch_id = p_batch_id;
  RETURN receipt;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
    RAISE EXCEPTION 'MK_MCP_REJECTED: invalid date or numeric value';
  WHEN unique_violation THEN RAISE EXCEPTION 'MK_MCP_CONFLICT: fill or revision identity already exists';
END $$;

-- No broad data-write credential. History can only be appended by the RPC.
REVOKE ALL ON public.mk_mcp_markets, public.mk_mcp_batches, public.mk_mcp_fills, public.mk_mcp_fill_history, public.mk_mcp_watchlist FROM PUBLIC, service_role;
REVOKE ALL ON FUNCTION public.mk_mcp_ingest(UUID,TEXT,JSONB) FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','doma_ai_ro'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON public.mk_mcp_markets, public.mk_mcp_batches, public.mk_mcp_fills, public.mk_mcp_fill_history, public.mk_mcp_watchlist FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION public.mk_mcp_ingest(UUID,TEXT,JSONB) FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'doma_ai_ro') THEN
    GRANT SELECT ON public.mk_mcp_watchlist, public.mk_mcp_markets TO doma_ai_ro;
    DROP POLICY IF EXISTS mk_mcp_markets_read ON public.mk_mcp_markets;
    CREATE POLICY mk_mcp_markets_read ON public.mk_mcp_markets FOR SELECT TO doma_ai_ro USING(enabled AND domain_name = 'gochujang.com');
  END IF;
END $$;
GRANT SELECT ON public.mk_mcp_watchlist, public.mk_mcp_markets TO service_role;
GRANT EXECUTE ON FUNCTION public.mk_mcp_ingest(UUID,TEXT,JSONB) TO service_role;
COMMIT;
