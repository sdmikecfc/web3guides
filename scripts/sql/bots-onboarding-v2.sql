-- Additive preview migration. Apply after bots-onboarding-v1.sql, before enabling
-- BOTS_ONBOARDING_V2 and NEXT_PUBLIC_BOTS_ONBOARDING_V2. No existing row is reset.
BEGIN;
ALTER TABLE public.battle_bots_onboarding DROP CONSTRAINT IF EXISTS battle_bots_onboarding_version_check;
ALTER TABLE public.battle_bots_onboarding ADD CONSTRAINT battle_bots_onboarding_version_check CHECK(version IN (1,2));
ALTER TABLE public.battle_bots_onboarding ALTER COLUMN welcome_bot_id DROP NOT NULL;
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS draft_offers JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS draft_name JSONB;
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS draft_look JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS draft_paints JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 0 CHECK(revision>=0);
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS finished_revision INT;
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS handoff_fingerprint TEXT;
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS finished_fingerprint TEXT;

CREATE OR REPLACE FUNCTION public.bb_coin_balance(p_wallet TEXT)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('total',p.coins,'reserved',coalesce(o.reserved,0),'spendable',greatest(0,p.coins-coalesce(o.reserved,0)))
 FROM battle_bots_players p LEFT JOIN LATERAL
 (SELECT sum(reserved_coins) AS reserved FROM battle_bots_onboarding WHERE wallet=p.wallet AND completed_at IS NULL) o ON true
 WHERE p.wallet=lower(p_wallet)
$$;

CREATE OR REPLACE FUNCTION public.bb_onboarding_v2_provision(p_wallet TEXT,p_wallet_name TEXT,p_name JSONB,p_is_test BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; o battle_bots_onboarding%ROWTYPE; bot BIGINT; g RECORD;
BEGIN
 IF w IS NULL OR length(w)=0 THEN RAISE EXCEPTION 'A wallet is required'; END IF;
 INSERT INTO battle_bots_players(wallet,wallet_name,is_test) VALUES(w,p_wallet_name,p_is_test) ON CONFLICT(wallet) DO NOTHING;
 SELECT * INTO p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO o FROM battle_bots_onboarding WHERE wallet=w ORDER BY version DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('joined',false,'onboarding',to_jsonb(o)); END IF;
 IF EXISTS(SELECT 1 FROM battle_bots_bots WHERE wallet=w) OR EXISTS(SELECT 1 FROM battle_bots_part_instances WHERE wallet=w)
 OR EXISTS(SELECT 1 FROM battle_bots_ledger WHERE wallet=w AND (reason LIKE 'starter%' OR reason LIKE 'onboarding:%')) THEN
  RETURN jsonb_build_object('joined',false,'onboarding',null);
 END IF;
 INSERT INTO battle_bots_bots(wallet,slot,name,build,total,tier,weight_class,is_test,listed)
 VALUES(w,1,concat_ws(' ',p_name->>'first',p_name->>'second',p_name->>'num'),jsonb_build_object('name',p_name,'equipmentVersion',2,
 'onboardingVersion',2,'decal',null,'paint','cream','sockets','{"head":null,"torso":null,"armL":null,"armR":null,"legL":null,"legR":null,"weapon":null}'::jsonb,
 'parts','{"head":null,"torso":null,"arms":null,"legs":null,"weapon":null}'::jsonb),0,1,'light',p.is_test,false) RETURNING id INTO bot;
 INSERT INTO battle_bots_onboarding(wallet,version,welcome_bot_id,draft_bot_id,draft_name) VALUES(w,2,null,bot,p_name);
 SELECT * INTO g FROM bb_grant(w,p.wallet_name,250,0,'onboarding:v2:allowance',jsonb_build_object('kind','beginner-allowance','reserved',250),p.is_test);
 IF NOT g.ok OR g.duplicate THEN RAISE EXCEPTION 'Starter coins could not be saved'; END IF;
 SELECT * INTO o FROM battle_bots_onboarding WHERE wallet=w AND version=2;
 RETURN jsonb_build_object('joined',true,'onboarding',to_jsonb(o));
END $$;

-- Every mutation takes the player lock before progress: purchases and reporter
-- credits share this order, so the protected starter allowance cannot be spent.
CREATE OR REPLACE FUNCTION public.bb_onboarding_v2_edit(p_wallet TEXT,p_revision INT,p_action TEXT,p_socket TEXT DEFAULT null,p_offer_id TEXT DEFAULT null,p_name JSONB DEFAULT null)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); o battle_bots_onboarding%ROWTYPE; kind TEXT;
BEGIN
 PERFORM 1 FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=2 FOR UPDATE;
 IF p_action='welcome' THEN
  UPDATE battle_bots_onboarding SET welcomed_at=coalesce(welcomed_at,now()) WHERE wallet=w AND version=2;
  RETURN jsonb_build_object('revision',o.revision);
 END IF;
 IF o.completed_at IS NOT NULL THEN RAISE EXCEPTION 'This robot is finished. Its parts stay with it'; END IF;
 IF p_revision IS DISTINCT FROM o.revision THEN RAISE EXCEPTION 'Your build changed in another window. Refresh it and try again'; END IF;
 IF p_action='choose' THEN
  IF p_socket IS NULL OR p_socket NOT IN ('head','torso','armL','armR','legL','legR','weapon') THEN RAISE EXCEPTION 'Choose a part'; END IF;
  kind:=CASE WHEN p_socket IN ('armL','armR') THEN 'arms' WHEN p_socket IN ('legL','legR') THEN 'legs' ELSE p_socket END;
  IF NOT EXISTS(SELECT 1 FROM battle_bots_beginner_offers WHERE part_key=p_offer_id AND slot_kind=kind) THEN RAISE EXCEPTION 'Choose a beginner part for this place'; END IF;
  IF o.draft_offers->>p_socket=p_offer_id THEN RETURN jsonb_build_object('revision',o.revision); END IF;
  UPDATE battle_bots_onboarding SET draft_offers=draft_offers||jsonb_build_object(p_socket,p_offer_id),draft_paints=draft_paints-p_socket,revision=revision+1,welcomed_at=coalesce(welcomed_at,now()) WHERE wallet=w AND version=2;
 ELSIF p_action='name' THEN
  IF jsonb_typeof(p_name)<>'object' OR p_name->>'first' IS NULL OR p_name->>'second' IS NULL THEN RAISE EXCEPTION 'Choose a robot name'; END IF;
  IF o.draft_name=p_name THEN RETURN jsonb_build_object('revision',o.revision); END IF;
  UPDATE battle_bots_onboarding SET draft_name=p_name,revision=revision+1 WHERE wallet=w AND version=2;
  UPDATE battle_bots_bots SET name=concat_ws(' ',p_name->>'first',p_name->>'second',p_name->>'num'),build=build||jsonb_build_object('name',p_name),updated_at=now() WHERE id=o.draft_bot_id;
 ELSE RAISE EXCEPTION 'Choose your next step'; END IF;
 RETURN jsonb_build_object('revision',o.revision+1);
END $$;

CREATE OR REPLACE FUNCTION public.bb_onboarding_v2_finish(p_wallet TEXT,p_revision INT)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; o battle_bots_onboarding%ROWTYPE; b battle_bots_bots%ROWTYPE;
 s TEXT; kind TEXT; paint TEXT; offer battle_bots_beginner_offers%ROWTYPE; part BIGINT; sockets JSONB:='{}'; aliases JSONB; cost INT:=0; g RECORD;
BEGIN
 SELECT * INTO STRICT p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=2 FOR UPDATE;
 IF o.completed_at IS NOT NULL THEN
  IF p_revision IS DISTINCT FROM o.finished_revision THEN RAISE EXCEPTION 'This robot is already finished. Open your garage'; END IF;
  RETURN jsonb_build_object('botId',o.draft_bot_id,'duplicate',true,'revision',o.revision);
 END IF;
 IF p_revision IS DISTINCT FROM o.revision THEN RAISE EXCEPTION 'Your build changed in another window. Refresh it and try again'; END IF;
 IF o.reserved_coins<>250 OR p.coins<250 THEN RAISE EXCEPTION 'Your starter coins are not ready. Refresh your garage'; END IF;
 SELECT * INTO STRICT b FROM battle_bots_bots WHERE id=o.draft_bot_id AND wallet=w AND recycled_at IS NULL FOR UPDATE;
 IF EXISTS(SELECT 1 FROM battle_bots_part_instances WHERE bot_id=b.id AND recycled_at IS NULL) THEN RAISE EXCEPTION 'This robot already has parts'; END IF;
 FOREACH s IN ARRAY ARRAY['head','torso','armL','armR','legL','legR','weapon'] LOOP
  kind:=CASE WHEN s IN ('armL','armR') THEN 'arms' WHEN s IN ('legL','legR') THEN 'legs' ELSE s END;
  SELECT * INTO offer FROM battle_bots_beginner_offers WHERE part_key=o.draft_offers->>s AND slot_kind=kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose all seven parts before finishing'; END IF;
  cost:=cost+offer.price;
 END LOOP;
 IF cost<>250 THEN RAISE EXCEPTION 'The starter parts must cost 250 coins'; END IF;
 UPDATE battle_bots_onboarding SET reserved_coins=0 WHERE wallet=w AND version=2;
 SELECT * INTO g FROM bb_grant(w,p.wallet_name,-250,0,'onboarding:v2:finish',jsonb_build_object('kind','beginner-build','botId',b.id),p.is_test);
 IF NOT g.ok OR g.duplicate THEN RAISE EXCEPTION 'Your robot could not be saved. Try again'; END IF;
 FOREACH s IN ARRAY ARRAY['head','torso','armL','armR','legL','legR','weapon'] LOOP
  SELECT * INTO STRICT offer FROM battle_bots_beginner_offers WHERE part_key=o.draft_offers->>s;
  paint:=CASE WHEN s='weapon' THEN null ELSE coalesce(o.draft_paints->>s,offer.color) END;
  INSERT INTO battle_bots_part_instances(wallet,part_key,slot_kind,tier,stats,bot_id,source,list_price,is_test,color)
  VALUES(w,offer.part_key,offer.slot_kind,1,jsonb_strip_nulls(jsonb_build_object('s',jsonb_build_array(1,1,1),'equipmentVersion',2,'onboardingVersion',2,
   'salvage',floor(offer.price*.4),'provenance','Your starter build','paint',paint)),b.id,'beginner',offer.price,p.is_test,paint) RETURNING id INTO part;
  INSERT INTO battle_bots_beginner_claims(wallet,version,socket,offer_id,part_id,price) VALUES(w,2,s,offer.part_key,part,offer.price);
  sockets:=sockets||jsonb_build_object(s,part);
 END LOOP;
 aliases:=jsonb_build_object('head',sockets->'head','torso',sockets->'torso','arms',sockets->'armL','legs',sockets->'legL','weapon',sockets->'weapon');
 PERFORM set_config('bb.onboarding_write',w,true);
 UPDATE battle_bots_bots SET name=concat_ws(' ',o.draft_name->>'first',o.draft_name->>'second',o.draft_name->>'num'),
 build=build||jsonb_build_object('name',o.draft_name,'look',coalesce(nullif(o.draft_look,'{}'),build->'look','{}'::jsonb),'sockets',sockets,'parts',aliases,'assemblyLocked',true),
 total=15,tier=1,weight_class='light',listed=false,updated_at=now() WHERE id=b.id;
 UPDATE battle_bots_onboarding SET assembled_at=now(),completed_at=now(),welcomed_at=coalesce(welcomed_at,now()),finished_revision=revision,
 finished_fingerprint=md5(draft_offers::text||draft_name::text) WHERE wallet=w AND version=2;
 RETURN jsonb_build_object('botId',b.id,'duplicate',false,'revision',o.revision);
END $$;

-- The service validates this appearance-only payload before entering the RPC.
-- The whole handoff, including optional Finish, is one transaction. A conflict
-- returns without touching the wallet draft or its inventory.
CREATE OR REPLACE FUNCTION public.bb_onboarding_v2_handoff(p_wallet TEXT,p_offers JSONB,p_name JSONB,p_look JSONB,p_paints JSONB,p_complete BOOLEAN,p_fingerprint TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); o battle_bots_onboarding%ROWTYPE; s TEXT; kind TEXT; v TEXT; new_revision INT;
BEGIN
 PERFORM 1 FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=2 FOR UPDATE;
 IF o.handoff_fingerprint=p_fingerprint THEN RETURN jsonb_build_object('applied',true,'bay',1,'complete',o.completed_at IS NOT NULL); END IF;
 IF o.completed_at IS NOT NULL OR o.revision<>0 OR o.draft_offers<>'{}'::jsonb OR o.handoff_fingerprint IS NOT NULL THEN
  RETURN jsonb_build_object('applied',false,'reason','existing-garage');
 END IF;
 IF p_fingerprint IS NULL OR length(p_fingerprint)<>64 OR jsonb_typeof(p_offers)<>'object' OR p_name->>'first' IS NULL OR p_name->>'second' IS NULL THEN RAISE EXCEPTION 'This saved build could not be read'; END IF;
 FOR s,v IN SELECT key,value FROM jsonb_each_text(p_offers) LOOP
  IF s NOT IN ('head','torso','armL','armR','legL','legR','weapon') THEN RAISE EXCEPTION 'Choose a beginner part'; END IF;
  kind:=CASE WHEN s IN ('armL','armR') THEN 'arms' WHEN s IN ('legL','legR') THEN 'legs' ELSE s END;
  IF v IS NOT NULL AND NOT EXISTS(SELECT 1 FROM battle_bots_beginner_offers WHERE part_key=v AND slot_kind=kind) THEN RAISE EXCEPTION 'Choose a beginner part'; END IF;
 END LOOP;
 new_revision:=o.revision+1;
 UPDATE battle_bots_onboarding SET draft_offers=jsonb_strip_nulls(p_offers),draft_name=p_name,draft_look=p_look,draft_paints=p_paints,
 revision=new_revision,handoff_fingerprint=p_fingerprint,welcomed_at=coalesce(welcomed_at,now()) WHERE wallet=w AND version=2;
 UPDATE battle_bots_bots SET name=concat_ws(' ',p_name->>'first',p_name->>'second',p_name->>'num'),build=build||jsonb_build_object('name',p_name,'look',p_look),updated_at=now() WHERE id=o.draft_bot_id;
 IF p_complete THEN PERFORM bb_onboarding_v2_finish(w,new_revision); END IF;
 RETURN jsonb_build_object('applied',true,'bay',1,'complete',p_complete);
END $$;

REVOKE ALL ON FUNCTION public.bb_onboarding_v2_provision(TEXT,TEXT,JSONB,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_v2_edit(TEXT,INT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_v2_finish(TEXT,INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_v2_handoff(TEXT,JSONB,JSONB,JSONB,JSONB,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_v2_provision(TEXT,TEXT,JSONB,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_v2_edit(TEXT,INT,TEXT,TEXT,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_v2_finish(TEXT,INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_v2_handoff(TEXT,JSONB,JSONB,JSONB,JSONB,BOOLEAN,TEXT) TO service_role;
COMMIT;
