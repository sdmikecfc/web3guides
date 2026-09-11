-- Review-only additive game migration. Requires the existing game/onboarding schema.
-- No shared ledger function is replaced. Apply before enabling BOTS_STYLES_V1.
BEGIN;
CREATE TABLE IF NOT EXISTS public.battle_bots_live_house_v5 (
 id UUID PRIMARY KEY,
 wallet TEXT NOT NULL,
 bot_id BIGINT NOT NULL,
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 96),
 difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
 engine_version INT NOT NULL DEFAULT 5 CHECK(engine_version=5),
 balance_version TEXT NOT NULL,
 revision INT NOT NULL DEFAULT 0 CHECK(revision>=0),
 started_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 day_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','settlement-pending','complete')),
 state JSONB NOT NULL,
 input_receipts JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(input_receipts)='array'),
 reward_snapshot JSONB NOT NULL,
 rules_snapshot JSONB NOT NULL,
 identity_snapshot JSONB NOT NULL,
 result JSONB,
 settlement JSONB,
 settled_at TIMESTAMPTZ,
 is_test BOOLEAN NOT NULL DEFAULT false,
 UNIQUE(wallet,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS battle_bots_live_house_v5_active_bot ON public.battle_bots_live_house_v5(bot_id) WHERE status <> 'complete';
CREATE INDEX IF NOT EXISTS battle_bots_live_house_v5_wallet_time ON public.battle_bots_live_house_v5(wallet,started_at DESC);
ALTER TABLE public.battle_bots_live_house_v5 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.battle_bots_live_house_v5 FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.battle_bots_live_house_v5 TO service_role;

CREATE OR REPLACE FUNCTION public.bb_live_house_v5_start(
 p_wallet TEXT,p_id UUID,p_request_id TEXT,p_bot_id BIGINT,p_bot_updated_at TIMESTAMPTZ,
 p_difficulty TEXT,p_day TEXT,p_started_at TIMESTAMPTZ,p_state JSONB,p_rewards JSONB,p_identity JSONB,p_rules JSONB
) RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; b battle_bots_bots%ROWTYPE; r battle_bots_live_house_v5%ROWTYPE; used INT; today_coins NUMERIC;
BEGIN
 SELECT * INTO STRICT p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO r FROM battle_bots_live_house_v5 WHERE wallet=w AND request_id=p_request_id;
 IF FOUND THEN
  IF r.bot_id<>p_bot_id OR r.difficulty<>p_difficulty THEN RAISE EXCEPTION 'This fight request already belongs to another match'; END IF;
  RETURN to_jsonb(r);
 END IF;
 SELECT * INTO STRICT b FROM battle_bots_bots WHERE id=p_bot_id AND wallet=w AND recycled_at IS NULL FOR UPDATE;
 SELECT * INTO r FROM battle_bots_live_house_v5 WHERE bot_id=b.id AND status<>'complete';
 IF FOUND THEN RETURN to_jsonb(r); END IF;
 IF b.updated_at IS DISTINCT FROM p_bot_updated_at THEN RAISE EXCEPTION 'Your robot changed. Refresh your garage'; END IF;
 IF b.build->>'engineVersion' IS DISTINCT FROM '5' OR b.build->>'assemblyLocked' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Choose a finished styled robot'; END IF;
 -- The seven rows must still be attached to this exact bot, not merely owned by
 -- the wallet. Lock them across the start so a concurrent assembly cannot move
 -- one between the service read and saving the immutable fight snapshot.
 PERFORM id FROM battle_bots_part_instances WHERE wallet=w AND bot_id=b.id AND recycled_at IS NULL ORDER BY id FOR UPDATE;
 IF (SELECT count(DISTINCT part.id) FROM (VALUES ('head','head'),('torso','torso'),('armL','arms'),('armR','arms'),('legL','legs'),('legR','legs'),('weapon','weapon')) socket(name,kind)
   JOIN battle_bots_part_instances part ON part.id::text=b.build#>>ARRAY['sockets',socket.name]
   AND part.wallet=w AND part.bot_id=b.id AND part.slot_kind=socket.kind AND part.recycled_at IS NULL)<>7 THEN
  RAISE EXCEPTION 'Your saved parts are not all on this robot. Refresh your garage';
 END IF;
 IF EXISTS(SELECT 1 FROM battle_bots_onboarding WHERE wallet=w AND completed_at IS NULL) THEN RAISE EXCEPTION 'Finish building your robot first'; END IF;
 IF b.broken_until>now() THEN RAISE EXCEPTION 'Your robot is being repaired'; END IF;
 IF p_difficulty NOT IN ('easy','medium','hard') OR p_state->>'version' IS DISTINCT FROM '5'
  OR (p_state->>'frame')::int<>0 OR p_state->>'done' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'This fight is not ready'; END IF;
 IF jsonb_typeof(p_state->'builds')<>'array' OR jsonb_array_length(p_state->'builds')<>2 THEN RAISE EXCEPTION 'This fight needs two robot snapshots'; END IF;
 IF p_state->'autoSpecial' IS DISTINCT FROM '[false,true]'::jsonb OR p_state->>'balanceVersion' IS DISTINCT FROM p_rules->>'balanceVersion' THEN RAISE EXCEPTION 'Invalid live combat rules'; END IF;
 IF (p_rewards#>>'{win,coins}')::int NOT BETWEEN 0 AND 1500 OR (p_rewards#>>'{loss,coins}')::int NOT BETWEEN 0 AND 1500 THEN RAISE EXCEPTION 'Invalid game rewards'; END IF;
 SELECT coalesce(sum(coins),0) INTO today_coins FROM battle_bots_ledger WHERE wallet=w AND coins>0 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND (reason LIKE 'battle:%' OR reason LIKE 'stake:%');
 IF today_coins+greatest((p_rewards#>>'{win,coins}')::int,(p_rewards#>>'{loss,coins}')::int)>20000 THEN RAISE EXCEPTION 'You have won all your battle coins today. Come back tomorrow'; END IF;
 used:=CASE WHEN b.attacks_day_key=p_day THEN b.attacks_today ELSE 0 END;
 IF used>=2 THEN RAISE EXCEPTION 'Your robot has used its two fights today'; END IF;
 UPDATE battle_bots_bots SET attacks_today=used+1,attacks_day_key=p_day,
  defenses_today=CASE WHEN attacks_day_key=p_day THEN defenses_today ELSE 0 END,updated_at=now() WHERE id=b.id;
 INSERT INTO battle_bots_live_house_v5(id,wallet,bot_id,request_id,difficulty,balance_version,started_at,day_key,state,reward_snapshot,identity_snapshot,rules_snapshot,is_test)
 VALUES(p_id,w,b.id,p_request_id,p_difficulty,p_state->>'balanceVersion',p_started_at,p_day,p_state,p_rewards,p_identity,p_rules,p.is_test) RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;

-- Each new state is accepted only from the revision the server actually read.
-- A failed CAS returns null; the caller reloads, advances and retries.
CREATE OR REPLACE FUNCTION public.bb_live_house_v5_cas(p_wallet TEXT,p_id UUID,p_revision INT,p_state JSONB,p_receipts JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r battle_bots_live_house_v5%ROWTYPE;
BEGIN
 SELECT * INTO r FROM battle_bots_live_house_v5 WHERE id=p_id AND wallet=lower(p_wallet) FOR UPDATE;
 IF NOT FOUND OR r.revision<>p_revision OR r.status='complete' THEN RETURN null; END IF;
 IF p_state->>'version' IS DISTINCT FROM '5' OR p_state->>'balanceVersion' IS DISTINCT FROM r.balance_version
  OR p_state->'builds' IS DISTINCT FROM r.state->'builds' OR p_state->'seed' IS DISTINCT FROM r.state->'seed'
  OR p_state->'stats' IS DISTINCT FROM r.state->'stats' OR p_state->'autoSpecial' IS DISTINCT FROM r.state->'autoSpecial'
  OR (p_state->>'frame')::int > 5400 OR (p_state->>'frame')::int < (r.state->>'frame')::int
  OR (r.status='settlement-pending' AND p_state IS DISTINCT FROM r.state) THEN RAISE EXCEPTION 'Invalid combat snapshot'; END IF;
 IF jsonb_typeof(p_receipts)<>'array' OR jsonb_array_length(p_receipts)>256 OR jsonb_array_length(p_receipts)<jsonb_array_length(r.input_receipts)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.input_receipts) WITH ORDINALITY old(value,n) WHERE p_receipts->((old.n-1)::int) IS DISTINCT FROM old.value) THEN RAISE EXCEPTION 'Invalid input history'; END IF;
 IF (SELECT count(DISTINCT value->>'inputId') FROM jsonb_array_elements(p_receipts))<>jsonb_array_length(p_receipts) THEN RAISE EXCEPTION 'Duplicate input history'; END IF;
 UPDATE battle_bots_live_house_v5 SET state=p_state,input_receipts=p_receipts,revision=revision+1,updated_at=now(),
  status=CASE WHEN p_state->>'done'='true' THEN 'settlement-pending' ELSE 'running' END
 WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;

-- Session result, ordinary bb_grant payout, record, repair and drop are one transaction.
-- If any write fails, status stays pending and a later GET safely retries everything.
CREATE OR REPLACE FUNCTION public.bb_live_house_v5_settle(p_wallet TEXT,p_id UUID,p_result JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; b battle_bots_bots%ROWTYPE; r battle_bots_live_house_v5%ROWTYPE;
 reward JSONB; g RECORD; won BOOLEAN; next_xp INT; next_level INT; paid NUMERIC; part BIGINT; drop JSONB; receipt JSONB;
BEGIN
 SELECT * INTO STRICT p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO STRICT r FROM battle_bots_live_house_v5 WHERE id=p_id AND wallet=w FOR UPDATE;
 IF r.status='complete' THEN RETURN to_jsonb(r); END IF;
 IF r.status<>'settlement-pending' OR r.state->>'done' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'This fight is still running'; END IF;
 IF p_result->'winner' IS DISTINCT FROM r.state->'winner' THEN RAISE EXCEPTION 'The result does not match this fight'; END IF;
 SELECT * INTO STRICT b FROM battle_bots_bots WHERE id=r.bot_id AND wallet=w FOR UPDATE;
 won:=coalesce(r.state->>'winner'='0',false);
 reward:=r.reward_snapshot->CASE WHEN won THEN 'win' ELSE 'loss' END;
 IF reward IS NULL THEN RAISE EXCEPTION 'The saved rewards are missing'; END IF;
 SELECT coalesce(sum(coins),0) INTO paid FROM battle_bots_ledger WHERE wallet=w AND coins>0 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND (reason LIKE 'battle:%' OR reason LIKE 'stake:%');
 IF paid+(reward->>'coins')::int>20000 THEN RAISE EXCEPTION 'The daily battle coin limit was reached'; END IF;
 SELECT * INTO g FROM bb_grant(w,p.wallet_name,(reward->>'coins')::int,(reward->>'points')::numeric,'battle:live5:'||r.id||':attacker',jsonb_build_object('kind','live-house','sessionId',r.id,'mode','pve','difficulty',r.difficulty,'won',won,'day',r.day_key),r.is_test);
 IF NOT g.ok THEN RAISE EXCEPTION 'Your fight reward could not be saved'; END IF;
 next_xp:=b.xp+(reward->>'xp')::int;
 SELECT count(*) INTO next_level FROM unnest(ARRAY[0,5,12,20,30,42,56,72,90,110]) threshold WHERE threshold<=next_xp;
 UPDATE battle_bots_bots SET wins=wins+CASE WHEN won THEN 1 ELSE 0 END,losses=losses+CASE WHEN won THEN 0 ELSE 1 END,
  xp=next_xp,level=next_level,broken_until=CASE WHEN (reward->>'repairMs')::bigint>0 THEN now()+((reward->>'repairMs')::bigint*interval '1 millisecond') ELSE broken_until END,updated_at=now() WHERE id=b.id;
 drop:=reward->'drop';
 IF drop IS NOT NULL AND drop<>'null'::jsonb THEN
  INSERT INTO battle_bots_part_instances(wallet,part_key,slot_kind,tier,stats,bot_id,source,list_price,is_test,color)
  VALUES(w,drop->>'partKey',drop->>'slot',(drop->>'tier')::int,jsonb_strip_nulls(jsonb_build_object('s',drop->'s','equipmentVersion',2,'engineVersion',5,'provenance','Won in a house fight','fightId','live5:'||r.id,'paint',drop->>'paint')),null,'drop',(drop->>'price')::int,r.is_test,drop->>'paint') RETURNING id INTO part;
 END IF;
 receipt:=jsonb_build_object('coins',(reward->>'coins')::int,'points',(reward->>'points')::numeric,'xp',(reward->>'xp')::int,'dropPartId',part,'balance',g.new_coins);
 UPDATE battle_bots_live_house_v5 SET status='complete',result=p_result,settlement=receipt,settled_at=now(),updated_at=now(),revision=revision+1 WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;

-- Styled recycling uses the same player/bot lock order as starting a session.
-- Completed snapshots remain readable after the physical bot row is recycled.
CREATE OR REPLACE FUNCTION public.bb_styles_recycle(p_wallet TEXT,p_bot_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; b battle_bots_bots%ROWTYPE; amount INT; g RECORD;
BEGIN
 SELECT * INTO STRICT p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO b FROM battle_bots_bots WHERE id=p_bot_id AND wallet=w FOR UPDATE;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM battle_bots_ledger WHERE wallet=w AND reason='recycle:'||p_bot_id) THEN RETURN jsonb_build_object('coins',0,'balance',p.coins,'duplicate',true); END IF;
  RAISE EXCEPTION 'This robot is not in your garage';
 END IF;
 IF b.build->>'engineVersion' IS DISTINCT FROM '5' THEN RAISE EXCEPTION 'Use the saved garage for this robot'; END IF;
 IF EXISTS(SELECT 1 FROM battle_bots_live_house_v5 WHERE bot_id=b.id AND status<>'complete') THEN RAISE EXCEPTION 'Wait for this fight and its rewards to finish before recycling'; END IF;
 IF EXISTS(SELECT 1 FROM battle_bots_onboarding WHERE wallet=w AND completed_at IS NULL) THEN RAISE EXCEPTION 'Finish your first build before recycling'; END IF;
 SELECT coalesce(sum(CASE WHEN stats->>'salvage' ~ '^[0-9]+$' THEN (stats->>'salvage')::int ELSE floor(list_price*.4) END),0) INTO amount
 FROM battle_bots_part_instances WHERE bot_id=b.id AND wallet=w AND recycled_at IS NULL;
 SELECT * INTO g FROM bb_grant(w,p.wallet_name,amount,0,'recycle:'||b.id,jsonb_build_object('bot',b.name,'bay',b.slot,'kind','styled-recycle'),p.is_test);
 IF NOT g.ok THEN RAISE EXCEPTION 'Your recycle coins could not be saved'; END IF;
 DELETE FROM battle_bots_part_instances WHERE bot_id=b.id AND wallet=w;
 DELETE FROM battle_bots_bots WHERE id=b.id AND wallet=w;
 RETURN jsonb_build_object('coins',CASE WHEN g.duplicate THEN 0 ELSE amount END,'balance',g.new_coins,'bot',b.name,'bay',b.slot,'duplicate',g.duplicate);
END $$;
REVOKE ALL ON FUNCTION public.bb_styles_recycle(TEXT,BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_styles_recycle(TEXT,BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.bb_live_house_v5_start(TEXT,UUID,TEXT,BIGINT,TIMESTAMPTZ,TEXT,TEXT,TIMESTAMPTZ,JSONB,JSONB,JSONB,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_live_house_v5_cas(TEXT,UUID,INT,JSONB,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_live_house_v5_settle(TEXT,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_live_house_v5_start(TEXT,UUID,TEXT,BIGINT,TIMESTAMPTZ,TEXT,TEXT,TIMESTAMPTZ,JSONB,JSONB,JSONB,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_live_house_v5_cas(TEXT,UUID,INT,JSONB,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_live_house_v5_settle(TEXT,UUID,JSONB) TO service_role;
-- Game-only assembly transaction. The service resolves and validates canonical
-- stats and cosmetic entitlements first; this transaction rechecks all ownership
-- and permanent-part constraints under the same wallet lock as live starts.
CREATE OR REPLACE FUNCTION public.bb_styles_save_assembly(
 p_wallet TEXT,p_bot_id BIGINT,p_expected_updated_at TIMESTAMPTZ,p_bay INT,p_name TEXT,p_build JSONB,p_total INT,p_tier INT,p_weight_class TEXT
) RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); player battle_bots_players%ROWTYPE; b battle_bots_bots%ROWTYPE;
 selected BIGINT[]; complete BOOLEAN; old_complete BOOLEAN; s TEXT; kind TEXT; id_text TEXT; attached battle_bots_part_instances%ROWTYPE;
BEGIN
 SELECT * INTO STRICT player FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO b FROM battle_bots_bots WHERE wallet=w AND slot=p_bay AND recycled_at IS NULL FOR UPDATE;
 IF p_bay NOT BETWEEN 1 AND 5 OR p_build->>'engineVersion' IS DISTINCT FROM '5'
  OR p_build->>'equipmentVersion' IS DISTINCT FROM '2' OR p_build->>'catalogueVersion' IS DISTINCT FROM '2'
  OR jsonb_typeof(p_build->'sockets') IS DISTINCT FROM 'object' OR p_total NOT BETWEEN 0 AND 100 OR p_tier NOT BETWEEN 1 AND 4
  THEN RAISE EXCEPTION 'Choose parts for your styled robot'; END IF;
 IF b.id IS NOT NULL AND b.build=p_build THEN RETURN jsonb_build_object('botId',b.id,'duplicate',true); END IF;
 IF p_bot_id IS DISTINCT FROM b.id THEN RAISE EXCEPTION 'This stand changed. Refresh your garage'; END IF;
 IF b.id IS NOT NULL AND b.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Your robot changed in another window. Refresh your garage'; END IF;
 IF EXISTS(SELECT 1 FROM battle_bots_onboarding WHERE wallet=w AND completed_at IS NULL) THEN RAISE EXCEPTION 'Finish your first build before building another robot'; END IF;
 IF b.id IS NOT NULL AND b.build->'practiceHandoff'->>'status'='pending' THEN RAISE EXCEPTION 'Your browser robot is still being saved'; END IF;
 IF b.id IS NULL AND (SELECT count(*) FROM battle_bots_bots WHERE wallet=w AND recycled_at IS NULL)>=5 THEN RAISE EXCEPTION 'Your garage has five robots'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_build->'sockets'))<>7
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_build->'sockets') k WHERE k NOT IN ('head','torso','armL','armR','legL','legR','weapon'))
   OR EXISTS(SELECT 1 FROM jsonb_each(p_build->'sockets') e WHERE e.value<>'null'::jsonb AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[1-9][0-9]*$')) THEN RAISE EXCEPTION 'Choose each of the seven parts'; END IF;
 SELECT coalesce(array_agg(value::bigint),'{}'::bigint[]) INTO selected FROM jsonb_each_text(p_build->'sockets') WHERE value IS NOT NULL;
 IF cardinality(selected)<>(SELECT count(DISTINCT id) FROM unnest(selected) id) THEN RAISE EXCEPTION 'One part fits one place. Choose separate arms and legs'; END IF;
 complete:=cardinality(selected)=7;
 IF p_build->>'assemblyLocked' IS DISTINCT FROM complete::text THEN RAISE EXCEPTION 'A finished robot keeps all seven parts'; END IF;
 -- Lock every old or newly selected instance in stable order. Another save to a
 -- different bay cannot claim a part after observing its earlier loose state.
 PERFORM id FROM battle_bots_part_instances WHERE wallet=w AND (bot_id=b.id OR id=ANY(selected)) ORDER BY id FOR UPDATE;
 IF b.id IS NOT NULL THEN
  IF jsonb_typeof(b.build->'sockets')='object' THEN
   SELECT count(DISTINCT part.id)=7 INTO old_complete FROM jsonb_each_text(b.build->'sockets') chosen JOIN battle_bots_part_instances part ON part.id::text=chosen.value AND part.wallet=w AND part.recycled_at IS NULL;
  ELSE
   SELECT count(DISTINCT part.id)=5 INTO old_complete FROM jsonb_each_text(coalesce(b.build->'parts','{}')) chosen JOIN battle_bots_part_instances part ON part.id::text=chosen.value AND part.wallet=w AND part.recycled_at IS NULL;
  END IF;
  IF b.build->>'assemblyLocked'='true' OR old_complete THEN
   IF b.build->>'engineVersion' IS DISTINCT FROM '5' OR b.build->'sockets' IS DISTINCT FROM p_build->'sockets' THEN RAISE EXCEPTION 'A completed robot keeps its parts'; END IF;
  END IF;
 END IF;
 FOR s,id_text IN SELECT key,value FROM jsonb_each_text(p_build->'sockets') LOOP
  IF id_text IS NULL THEN CONTINUE; END IF;
  kind:=CASE WHEN s IN ('armL','armR') THEN 'arms' WHEN s IN ('legL','legR') THEN 'legs' ELSE s END;
  SELECT * INTO attached FROM battle_bots_part_instances WHERE id=id_text::bigint AND wallet=w AND slot_kind=kind AND recycled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an owned part for each place'; END IF;
  IF attached.bot_id IS NOT NULL AND attached.bot_id IS DISTINCT FROM b.id THEN RAISE EXCEPTION 'That part is on another robot'; END IF;
  IF s='torso' AND attached.part_key !~ '^(beginner[.]v2[.])?mk5[.](starter|t[1-4])[.](tank|speed|ranged)[.]torso$' THEN RAISE EXCEPTION 'Choose a styled body for the new arena'; END IF;
 END LOOP;
 IF b.id IS NULL THEN
  INSERT INTO battle_bots_bots(wallet,slot,name,build,total,tier,weight_class,listed,is_test)
   VALUES(w,p_bay,p_name,p_build,p_total,p_tier,p_weight_class,false,player.is_test) RETURNING * INTO b;
 ELSE
  UPDATE battle_bots_bots SET name=p_name,build=p_build,total=p_total,tier=p_tier,weight_class=p_weight_class,listed=false,updated_at=now() WHERE id=b.id RETURNING * INTO b;
 END IF;
 UPDATE battle_bots_part_instances SET bot_id=NULL WHERE wallet=w AND bot_id=b.id AND NOT(id=ANY(selected));
 UPDATE battle_bots_part_instances SET bot_id=b.id WHERE wallet=w AND id=ANY(selected);
 RETURN jsonb_build_object('botId',b.id,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.bb_styles_save_assembly(TEXT,BIGINT,TIMESTAMPTZ,INT,TEXT,JSONB,INT,INT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_styles_save_assembly(TEXT,BIGINT,TIMESTAMPTZ,INT,TEXT,JSONB,INT,INT,TEXT) TO service_role;
-- A legacy save that read a loose mixed part before the new transaction claimed
-- it cannot later steal it from a completed styled assembly. Earlier robots and
-- their normal updates do not satisfy this narrowly scoped guard.
CREATE OR REPLACE FUNCTION public.bb_styles_protect_attached_part() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.bot_id IS NOT NULL AND OLD.bot_id IS DISTINCT FROM NEW.bot_id AND EXISTS(
  SELECT 1 FROM battle_bots_bots WHERE id=OLD.bot_id AND build->>'engineVersion'='5' AND build->>'assemblyLocked'='true'
 ) THEN RAISE EXCEPTION 'A completed styled robot keeps its parts'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS battle_bots_styles_attached_part_guard ON public.battle_bots_part_instances;
CREATE TRIGGER battle_bots_styles_attached_part_guard BEFORE UPDATE OF bot_id ON public.battle_bots_part_instances FOR EACH ROW EXECUTE FUNCTION public.bb_styles_protect_attached_part();
REVOKE ALL ON FUNCTION public.bb_styles_protect_attached_part() FROM PUBLIC;
COMMIT;
