-- Additive, review-only styled starter migration. Requires bots-onboarding-v2.sql.
-- All old onboarding functions, starter rows, finished assemblies and bb_grant remain unchanged.
BEGIN;
ALTER TABLE public.battle_bots_onboarding ADD COLUMN IF NOT EXISTS catalogue_version INT NOT NULL DEFAULT 1 CHECK(catalogue_version IN (1,2));
CREATE TABLE IF NOT EXISTS public.battle_bots_styles_offers (
 part_key TEXT PRIMARY KEY, ordinal INT NOT NULL, slot_kind TEXT NOT NULL CHECK(slot_kind IN ('head','torso','arms','legs','weapon')),
 art_key TEXT NOT NULL, name TEXT NOT NULL, color TEXT, price INT NOT NULL CHECK(price IN (25,50)),
 stats JSONB NOT NULL CHECK(jsonb_typeof(stats)='array' AND jsonb_array_length(stats)=3
 AND (stats->>0)::int BETWEEN 0 AND 3 AND (stats->>1)::int BETWEEN 0 AND 3 AND (stats->>2)::int BETWEEN 0 AND 3
 AND (stats->>0)::int+(stats->>1)::int+(stats->>2)::int=3)
);
ALTER TABLE public.battle_bots_styles_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.battle_bots_styles_offers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.battle_bots_styles_offers TO service_role;
CREATE TABLE IF NOT EXISTS public.battle_bots_styles_claims (
 wallet TEXT NOT NULL, version INT NOT NULL DEFAULT 2 CHECK(version=2), socket TEXT NOT NULL CHECK(socket IN ('head','torso','armL','armR','legL','legR','weapon')),
 offer_id TEXT NOT NULL REFERENCES public.battle_bots_styles_offers(part_key),part_id BIGINT NOT NULL,price INT NOT NULL,
 PRIMARY KEY(wallet,socket),FOREIGN KEY(wallet,version) REFERENCES public.battle_bots_onboarding(wallet,version)
);
ALTER TABLE public.battle_bots_styles_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.battle_bots_styles_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.battle_bots_styles_claims TO service_role;
INSERT INTO public.battle_bots_styles_offers(part_key,ordinal,slot_kind,art_key,name,color,price,stats) VALUES
('beginner.v2.mk5.starter.tank.head',0,'head','mk5.starter.tank.head','Heavy 1 Head','butter',50,'[0,2,1]'::jsonb),
('beginner.v2.mk5.starter.tank.torso',1,'torso','mk5.starter.tank.torso','Heavy 1 Body','butter',50,'[2,1,0]'::jsonb),
('beginner.v2.mk5.starter.tank.arms',2,'arms','mk5.starter.tank.arms','Heavy 1 Arm','butter',25,'[0,2,1]'::jsonb),
('beginner.v2.mk5.starter.tank.legs',3,'legs','mk5.starter.tank.legs','Heavy 1 Leg','butter',25,'[0,2,1]'::jsonb),
('beginner.v2.mk5.starter.tank.weapon',4,'weapon','mk5.starter.tank.weapon','Heavy 1 Hammer',NULL,50,'[2,0,1]'::jsonb),
('beginner.v2.mk5.starter.speed.head',5,'head','mk5.starter.speed.head','Fast 1 Head','coral',50,'[1,2,0]'::jsonb),
('beginner.v2.mk5.starter.speed.torso',6,'torso','mk5.starter.speed.torso','Fast 1 Body','coral',50,'[1,0,2]'::jsonb),
('beginner.v2.mk5.starter.speed.arms',7,'arms','mk5.starter.speed.arms','Fast 1 Arm','coral',25,'[2,0,1]'::jsonb),
('beginner.v2.mk5.starter.speed.legs',8,'legs','mk5.starter.speed.legs','Fast 1 Leg','coral',25,'[2,0,1]'::jsonb),
('beginner.v2.mk5.starter.speed.weapon',9,'weapon','mk5.starter.speed.weapon','Fast 1 Blade',NULL,50,'[1,2,0]'::jsonb),
('beginner.v2.mk5.starter.ranged.head',10,'head','mk5.starter.ranged.head','Sharpshooter 1 Head','sky',50,'[2,0,1]'::jsonb),
('beginner.v2.mk5.starter.ranged.torso',11,'torso','mk5.starter.ranged.torso','Sharpshooter 1 Body','sky',50,'[1,2,0]'::jsonb),
('beginner.v2.mk5.starter.ranged.arms',12,'arms','mk5.starter.ranged.arms','Sharpshooter 1 Arm','sky',25,'[1,0,2]'::jsonb),
('beginner.v2.mk5.starter.ranged.legs',13,'legs','mk5.starter.ranged.legs','Sharpshooter 1 Leg','sky',25,'[1,0,2]'::jsonb),
('beginner.v2.mk5.starter.ranged.weapon',14,'weapon','mk5.starter.ranged.weapon','Sharpshooter 1 Rifle',NULL,50,'[1,0,2]'::jsonb)
ON CONFLICT(part_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bb_styles_build_total(p_offers JSONB) RETURNS INT LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE total INT:=0; slot TEXT; a JSONB; b JSONB; pair_sum INT; i INT;
BEGIN
 FOREACH slot IN ARRAY ARRAY['head','torso','weapon'] LOOP
  SELECT stats INTO STRICT a FROM battle_bots_styles_offers WHERE part_key=p_offers->>slot;
  total:=total+(a->>0)::int+(a->>1)::int+(a->>2)::int;
 END LOOP;
 FOREACH slot IN ARRAY ARRAY['arm','leg'] LOOP
  SELECT stats INTO STRICT a FROM battle_bots_styles_offers WHERE part_key=p_offers->>(slot||'L');
  SELECT stats INTO STRICT b FROM battle_bots_styles_offers WHERE part_key=p_offers->>(slot||'R');
  pair_sum:=0;
  FOR i IN 0..2 LOOP pair_sum:=pair_sum+floor(((a->>i)::int+(b->>i)::int)/2.0); END LOOP;
  total:=total+greatest(1,pair_sum);
 END LOOP;
 RETURN total;
END $$;

CREATE OR REPLACE FUNCTION public.bb_onboarding_styles_provision(p_wallet TEXT,p_wallet_name TEXT,p_name JSONB,p_is_test BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE result JSONB; o battle_bots_onboarding%ROWTYPE;
BEGIN
 IF (SELECT count(DISTINCT slot_kind) FROM battle_bots_styles_offers)<>5 THEN RAISE EXCEPTION 'The styled starter catalogue is not installed'; END IF;
 result:=bb_onboarding_v2_provision(p_wallet,p_wallet_name,p_name,p_is_test);
 IF result->>'joined'='true' THEN
  UPDATE battle_bots_onboarding SET catalogue_version=2 WHERE wallet=lower(p_wallet) AND version=2 RETURNING * INTO o;
  UPDATE battle_bots_bots SET build=build||jsonb_build_object('catalogueVersion',2),updated_at=now() WHERE id=o.draft_bot_id;
  result:=jsonb_build_object('joined',true,'onboarding',to_jsonb(o));
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.bb_onboarding_styles_edit(p_wallet TEXT,p_revision INT,p_action TEXT,p_socket TEXT DEFAULT null,p_offer_id TEXT DEFAULT null,p_name JSONB DEFAULT null)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); o battle_bots_onboarding%ROWTYPE; kind TEXT;
BEGIN
 PERFORM 1 FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=2 FOR UPDATE;
 IF o.catalogue_version<>2 THEN RAISE EXCEPTION 'Open the saved builder for this robot'; END IF;
 IF p_action='welcome' THEN
  UPDATE battle_bots_onboarding SET welcomed_at=coalesce(welcomed_at,now()) WHERE wallet=w AND version=2;
  RETURN jsonb_build_object('revision',o.revision);
 END IF;
 IF o.completed_at IS NOT NULL THEN RAISE EXCEPTION 'This robot is finished. Its parts stay with it'; END IF;
 IF p_revision IS DISTINCT FROM o.revision THEN RAISE EXCEPTION 'Your build changed in another window. Refresh it and try again'; END IF;
 IF p_action='choose' THEN
  IF p_socket IS NULL OR p_socket NOT IN ('head','torso','armL','armR','legL','legR','weapon') THEN RAISE EXCEPTION 'Choose a part'; END IF;
  kind:=CASE WHEN p_socket IN ('armL','armR') THEN 'arms' WHEN p_socket IN ('legL','legR') THEN 'legs' ELSE p_socket END;
  IF NOT EXISTS(SELECT 1 FROM battle_bots_styles_offers WHERE part_key=p_offer_id AND slot_kind=kind) THEN RAISE EXCEPTION 'Choose a beginner part for this place'; END IF;
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

CREATE OR REPLACE FUNCTION public.bb_onboarding_styles_finish(p_wallet TEXT,p_revision INT)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; o battle_bots_onboarding%ROWTYPE; b battle_bots_bots%ROWTYPE;
 s TEXT; kind TEXT; paint TEXT; offer battle_bots_styles_offers%ROWTYPE; part BIGINT; sockets JSONB:='{}'; aliases JSONB; cost INT:=0; g RECORD;
BEGIN
 SELECT * INTO STRICT p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=2 FOR UPDATE;
 IF o.catalogue_version<>2 THEN RAISE EXCEPTION 'Open the saved builder for this robot'; END IF;
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
  SELECT * INTO offer FROM battle_bots_styles_offers WHERE part_key=o.draft_offers->>s AND slot_kind=kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose all seven parts before finishing'; END IF;
  cost:=cost+offer.price;
 END LOOP;
 IF cost<>250 THEN RAISE EXCEPTION 'The starter parts must cost 250 coins'; END IF;
 UPDATE battle_bots_onboarding SET reserved_coins=0 WHERE wallet=w AND version=2;
 SELECT * INTO g FROM bb_grant(w,p.wallet_name,-250,0,'onboarding:v2:finish',jsonb_build_object('kind','beginner-build','botId',b.id),p.is_test);
 IF NOT g.ok OR g.duplicate THEN RAISE EXCEPTION 'Your robot could not be saved. Try again'; END IF;
 FOREACH s IN ARRAY ARRAY['head','torso','armL','armR','legL','legR','weapon'] LOOP
  SELECT * INTO STRICT offer FROM battle_bots_styles_offers WHERE part_key=o.draft_offers->>s;
  paint:=CASE WHEN s='weapon' THEN null ELSE coalesce(o.draft_paints->>s,offer.color) END;
  INSERT INTO battle_bots_part_instances(wallet,part_key,slot_kind,tier,stats,bot_id,source,list_price,is_test,color)
  VALUES(w,offer.part_key,offer.slot_kind,1,jsonb_strip_nulls(jsonb_build_object('s',offer.stats,'equipmentVersion',2,'onboardingVersion',2,'catalogueVersion',2,'engineVersion',5,
   'salvage',floor(offer.price*.4),'provenance','Your starter build','paint',paint)),b.id,'beginner',offer.price,p.is_test,paint) RETURNING id INTO part;
  INSERT INTO battle_bots_styles_claims(wallet,version,socket,offer_id,part_id,price) VALUES(w,2,s,offer.part_key,part,offer.price);
  sockets:=sockets||jsonb_build_object(s,part);
 END LOOP;
 aliases:=jsonb_build_object('head',sockets->'head','torso',sockets->'torso','arms',sockets->'armL','legs',sockets->'legL','weapon',sockets->'weapon');
 PERFORM set_config('bb.onboarding_write',w,true);
 UPDATE battle_bots_bots SET name=concat_ws(' ',o.draft_name->>'first',o.draft_name->>'second',o.draft_name->>'num'),
 build=build||jsonb_build_object('name',o.draft_name,'look',coalesce(nullif(o.draft_look,'{}'),build->'look','{}'::jsonb),'sockets',sockets,'parts',aliases,'assemblyLocked',true,'engineVersion',5,'catalogueVersion',2),
 total=bb_styles_build_total(o.draft_offers),tier=1,weight_class='light',listed=false,updated_at=now() WHERE id=b.id;
 UPDATE battle_bots_onboarding SET assembled_at=now(),completed_at=now(),welcomed_at=coalesce(welcomed_at,now()),finished_revision=revision,
 finished_fingerprint=md5(draft_offers::text||draft_name::text) WHERE wallet=w AND version=2;
 RETURN jsonb_build_object('botId',b.id,'duplicate',false,'revision',o.revision);
END $$;

CREATE OR REPLACE FUNCTION public.bb_onboarding_styles_handoff(p_wallet TEXT,p_offers JSONB,p_name JSONB,p_look JSONB,p_paints JSONB,p_complete BOOLEAN,p_fingerprint TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); o battle_bots_onboarding%ROWTYPE; s TEXT; kind TEXT; v TEXT; new_revision INT;
BEGIN
 PERFORM 1 FROM battle_bots_players WHERE wallet=w FOR UPDATE;
 SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=2 FOR UPDATE;
 IF o.catalogue_version<>2 THEN RETURN jsonb_build_object('applied',false,'reason','existing-garage'); END IF;
 IF o.handoff_fingerprint=p_fingerprint THEN RETURN jsonb_build_object('applied',true,'bay',1,'complete',o.completed_at IS NOT NULL); END IF;
 IF o.completed_at IS NOT NULL OR o.revision<>0 OR o.draft_offers<>'{}'::jsonb OR o.handoff_fingerprint IS NOT NULL THEN
  RETURN jsonb_build_object('applied',false,'reason','existing-garage');
 END IF;
 IF p_fingerprint IS NULL OR length(p_fingerprint)<>64 OR jsonb_typeof(p_offers)<>'object' OR p_name->>'first' IS NULL OR p_name->>'second' IS NULL THEN RAISE EXCEPTION 'This saved build could not be read'; END IF;
 FOR s,v IN SELECT key,value FROM jsonb_each_text(p_offers) LOOP
  IF s NOT IN ('head','torso','armL','armR','legL','legR','weapon') THEN RAISE EXCEPTION 'Choose a beginner part'; END IF;
  kind:=CASE WHEN s IN ('armL','armR') THEN 'arms' WHEN s IN ('legL','legR') THEN 'legs' ELSE s END;
  IF v IS NOT NULL AND NOT EXISTS(SELECT 1 FROM battle_bots_styles_offers WHERE part_key=v AND slot_kind=kind) THEN RAISE EXCEPTION 'Choose a beginner part'; END IF;
 END LOOP;
 new_revision:=o.revision+1;
 UPDATE battle_bots_onboarding SET draft_offers=jsonb_strip_nulls(p_offers),draft_name=p_name,draft_look=p_look,draft_paints=p_paints,
 revision=new_revision,handoff_fingerprint=p_fingerprint,welcomed_at=coalesce(welcomed_at,now()) WHERE wallet=w AND version=2;
 UPDATE battle_bots_bots SET name=concat_ws(' ',p_name->>'first',p_name->>'second',p_name->>'num'),build=build||jsonb_build_object('name',p_name,'look',p_look),updated_at=now() WHERE id=o.draft_bot_id;
 IF p_complete THEN PERFORM bb_onboarding_styles_finish(w,new_revision); END IF;
 RETURN jsonb_build_object('applied',true,'bay',1,'complete',p_complete);
END $$;
REVOKE ALL ON FUNCTION public.bb_styles_build_total(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_styles_provision(TEXT,TEXT,JSONB,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_styles_edit(TEXT,INT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_styles_finish(TEXT,INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_styles_handoff(TEXT,JSONB,JSONB,JSONB,JSONB,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_styles_build_total(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_styles_provision(TEXT,TEXT,JSONB,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_styles_edit(TEXT,INT,TEXT,TEXT,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_styles_finish(TEXT,INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_styles_handoff(TEXT,JSONB,JSONB,JSONB,JSONB,BOOLEAN,TEXT) TO service_role;
COMMIT;
