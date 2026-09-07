-- Run after the existing battle_bots 001..009 schema and independent-limb migration.
-- Local, reviewable migration: no existing account, inventory or ledger is reset.
BEGIN;

CREATE TABLE IF NOT EXISTS public.battle_bots_beginner_offers (
  part_key TEXT PRIMARY KEY,
  ordinal INT NOT NULL,
  slot_kind TEXT NOT NULL CHECK (slot_kind IN ('head','torso','arms','legs','weapon')),
  art_key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  price INT NOT NULL CHECK (price IN (25,50))
);
-- BEGIN GENERATED OFFERS (kept identical to lib/bots/beginner-catalog.ts)
INSERT INTO public.battle_bots_beginner_offers(part_key,ordinal,slot_kind,art_key,name,color,price) VALUES
  ('beginner.v1.legs.sprocketPegs',0,'legs','legs.sprocketPegs','Leg 1','mint',25),
  ('beginner.v1.arms.sprocketMitts',1,'arms','arms.sprocketMitts','Arm 1','coral',25),
  ('beginner.v1.torso.sprocketCan',2,'torso','torso.sprocketCan','Body 1','butter',50),
  ('beginner.v1.head.sprocketCap',3,'head','head.sprocketCap','Head 1','sky',50),
  ('beginner.v1.legs.peeperStilts',4,'legs','legs.peeperStilts','Leg 2','lilac',25),
  ('beginner.v1.arms.peeperHooks',5,'arms','arms.peeperHooks','Arm 2','moss',25),
  ('beginner.v1.torso.peeperBox',6,'torso','torso.peeperBox','Body 2','cream',50),
  ('beginner.v1.head.peeperEye',7,'head','head.peeperEye','Head 2','ink',50),
  ('beginner.v1.legs.kettleShins',8,'legs','legs.kettleShins','Leg 3','coral',25),
  ('beginner.v1.arms.kettleGrips',9,'arms','arms.kettleGrips','Arm 3','butter',25),
  ('beginner.v1.torso.kettleChest',10,'torso','torso.kettleChest','Body 3','sky',50),
  ('beginner.v1.head.kettleDome',11,'head','head.kettleDome','Head 3','lilac',50),
  ('beginner.v1.legs.lanternStruts',12,'legs','legs.lanternStruts','Leg 4','moss',25),
  ('beginner.v1.arms.lanternClamps',13,'arms','arms.lanternClamps','Arm 4','cream',25),
  ('beginner.v1.torso.lanternDrum',14,'torso','torso.lanternDrum','Body 4','ink',50),
  ('beginner.v1.head.lanternLens',15,'head','head.lanternLens','Head 4','mint',50),
  ('beginner.v1.legs.hornetBoots',16,'legs','legs.hornetBoots','Leg 5','butter',25),
  ('beginner.v1.arms.hornetFists',17,'arms','arms.hornetFists','Arm 5','sky',25),
  ('beginner.v1.torso.hornetFrame',18,'torso','torso.hornetFrame','Body 5','lilac',50),
  ('beginner.v1.head.hornetScope',19,'head','head.hornetScope','Head 5','moss',50),
  ('beginner.v1.legs.pistonTreads',20,'legs','legs.pistonTreads','Leg 6','cream',25),
  ('beginner.v1.arms.pistonLevers',21,'arms','arms.pistonLevers','Arm 6','ink',25),
  ('beginner.v1.torso.pistonShell',22,'torso','torso.pistonShell','Body 6','mint',50),
  ('beginner.v1.head.pistonVisor',23,'head','head.pistonVisor','Head 6','coral',50),
  ('beginner.v1.legs.bulldozerHooves',24,'legs','legs.bulldozerHooves','Leg 7','sky',25),
  ('beginner.v1.arms.bulldozerFists',25,'arms','arms.bulldozerFists','Arm 7','lilac',25),
  ('beginner.v1.torso.bulldozerHull',26,'torso','torso.bulldozerHull','Body 7','moss',50),
  ('beginner.v1.head.bulldozerHelm',27,'head','head.bulldozerHelm','Head 7','cream',50),
  ('beginner.v1.legs.anvilSprings',28,'legs','legs.anvilSprings','Leg 8','ink',25),
  ('beginner.v1.arms.anvilGrips',29,'arms','arms.anvilGrips','Arm 8','mint',25),
  ('beginner.v1.torso.anvilCore',30,'torso','torso.anvilCore','Body 8','coral',50),
  ('beginner.v1.head.anvilMask',31,'head','head.anvilMask','Head 8','butter',50),
  ('beginner.v1.weapon.rustySpanner',32,'weapon','weapon.rustySpanner','Weapon 1',NULL,50),
  ('beginner.v1.weapon.tinMallet',33,'weapon','weapon.tinMallet','Weapon 2',NULL,50),
  ('beginner.v1.weapon.ironWrench',34,'weapon','weapon.ironWrench','Weapon 3',NULL,50),
  ('beginner.v1.weapon.sparkDrill',35,'weapon','weapon.sparkDrill','Weapon 4',NULL,50),
  ('beginner.v1.weapon.steelSaw',36,'weapon','weapon.steelSaw','Weapon 5',NULL,50),
  ('beginner.v1.weapon.brassPike',37,'weapon','weapon.brassPike','Weapon 6',NULL,50),
  ('beginner.v1.weapon.pistonHammer',38,'weapon','weapon.pistonHammer','Weapon 7',NULL,50),
  ('beginner.v1.weapon.anvilCleaver',39,'weapon','weapon.anvilCleaver','Weapon 8',NULL,50)
ON CONFLICT(part_key) DO NOTHING;
-- END GENERATED OFFERS

CREATE TABLE IF NOT EXISTS public.battle_bots_onboarding (
  wallet TEXT NOT NULL REFERENCES public.battle_bots_players(wallet),
  version INT NOT NULL DEFAULT 1 CHECK (version = 1),
  welcome_bot_id BIGINT NOT NULL,
  draft_bot_id BIGINT NOT NULL,
  reserved_coins INT NOT NULL DEFAULT 250 CHECK (reserved_coins BETWEEN 0 AND 250),
  welcomed_at TIMESTAMPTZ,
  assembled_at TIMESTAMPTZ,
  practice_fight_id BIGINT,
  practiced_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, version)
);
CREATE TABLE IF NOT EXISTS public.battle_bots_beginner_claims (
  wallet TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  socket TEXT NOT NULL CHECK (socket IN ('head','torso','armL','armR','legL','legR','weapon')),
  offer_id TEXT NOT NULL REFERENCES public.battle_bots_beginner_offers(part_key),
  part_id BIGINT NOT NULL,
  price INT NOT NULL CHECK (price IN (25,50)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, version, socket),
  FOREIGN KEY (wallet, version) REFERENCES public.battle_bots_onboarding(wallet, version)
);
ALTER TABLE public.battle_bots_beginner_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_bots_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_bots_beginner_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bb_coin_balance(p_wallet TEXT)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('total',p.coins,'reserved',coalesce(o.reserved_coins,0),
    'spendable',greatest(0,p.coins-coalesce(o.reserved_coins,0)))
  FROM battle_bots_players p LEFT JOIN battle_bots_onboarding o
    ON o.wallet=p.wallet AND o.version=1 AND o.completed_at IS NULL
  WHERE p.wallet=lower(p_wallet)
$$;

-- Preserve the reporter's original signature and total-balance return contract.
-- Every debit shares the player lock with onboarding and cannot consume its reserve.
CREATE OR REPLACE FUNCTION public.bb_grant(
  p_wallet TEXT, p_wallet_name TEXT, p_coins NUMERIC, p_battle_points NUMERIC,
  p_reason TEXT, p_meta JSONB DEFAULT NULL, p_is_test BOOLEAN DEFAULT FALSE
) RETURNS TABLE (ok BOOLEAN, duplicate BOOLEAN, new_coins NUMERIC, new_battle_points NUMERIC)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_player battle_bots_players%ROWTYPE; v_wallet TEXT := lower(p_wallet); v_reserved INT;
BEGIN
  IF p_coins IS NULL OR p_battle_points IS NULL OR p_battle_points < 0 OR p_reason IS NULL THEN
    RAISE EXCEPTION 'bb_grant: invalid delta or reason';
  END IF;
  INSERT INTO battle_bots_players(wallet,wallet_name,is_test)
    VALUES(v_wallet,coalesce(p_wallet_name,v_wallet),p_is_test) ON CONFLICT(wallet) DO NOTHING;
  SELECT * INTO v_player FROM battle_bots_players WHERE wallet=v_wallet FOR UPDATE;
  -- A retry must succeed even if the first successful debit left no spendable coins.
  IF EXISTS(SELECT 1 FROM battle_bots_ledger WHERE wallet=v_wallet AND reason=p_reason) THEN
    RETURN QUERY SELECT true,true,v_player.coins,v_player.battle_points; RETURN;
  END IF;
  SELECT coalesce(sum(reserved_coins),0)::int INTO v_reserved FROM battle_bots_onboarding
    WHERE wallet=v_wallet AND completed_at IS NULL;
  IF v_player.coins+p_coins < 0 OR (p_coins < 0 AND v_player.coins+p_coins < v_reserved) THEN
    RETURN QUERY SELECT false,false,v_player.coins,v_player.battle_points; RETURN;
  END IF;
  INSERT INTO battle_bots_ledger(wallet,coins,battle_points,reason,meta,is_test)
    VALUES(v_wallet,p_coins,p_battle_points,p_reason,p_meta,p_is_test);
  UPDATE battle_bots_players SET coins=coins+p_coins,battle_points=battle_points+p_battle_points,
    wallet_name=coalesce(p_wallet_name,wallet_name),updated_at=now() WHERE id=v_player.id;
  RETURN QUERY SELECT true,false,p.coins,p.battle_points FROM battle_bots_players p WHERE p.id=v_player.id;
END $$;

CREATE OR REPLACE FUNCTION public.bb_onboarding_provision(
  p_wallet TEXT, p_wallet_name TEXT, p_welcome_name JSONB, p_draft_name JSONB, p_is_test BOOLEAN DEFAULT false
) RETURNS JSONB LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; o battle_bots_onboarding%ROWTYPE;
  welcome_id BIGINT; draft_id BIGINT; part_id BIGINT; s TEXT; kind TEXT; paint TEXT;
  offer battle_bots_beginner_offers%ROWTYPE; sockets JSONB:='{}'; aliases JSONB; g RECORD;
BEGIN
  IF w IS NULL OR length(w)=0 THEN RAISE EXCEPTION 'A wallet is required'; END IF;
  INSERT INTO battle_bots_players(wallet,wallet_name,is_test) VALUES(w,p_wallet_name,p_is_test)
    ON CONFLICT(wallet) DO NOTHING;
  SELECT * INTO p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
  SELECT * INTO o FROM battle_bots_onboarding WHERE wallet=w AND version=1;
  IF FOUND THEN RETURN jsonb_build_object('joined',false,'onboarding',to_jsonb(o)); END IF;
  -- A real/old/test account keeps all previous progression, including recycled history.
  IF EXISTS(SELECT 1 FROM battle_bots_part_instances WHERE wallet=w)
    OR EXISTS(SELECT 1 FROM battle_bots_bots WHERE wallet=w)
    OR EXISTS(SELECT 1 FROM battle_bots_ledger WHERE wallet=w AND reason LIKE 'starter%') THEN
    RETURN jsonb_build_object('joined',false,'onboarding',null);
  END IF;
  INSERT INTO battle_bots_bots(wallet,slot,name,build,total,tier,weight_class,is_test,listed)
    VALUES(w,1,concat_ws(' ',p_welcome_name->>'first',p_welcome_name->>'second',p_welcome_name->>'num'),
      jsonb_build_object('name',p_welcome_name,'equipmentVersion',2,'decal',null,'paint','mint'),15,1,'light',p.is_test,false)
    RETURNING id INTO welcome_id;
  INSERT INTO battle_bots_bots(wallet,slot,name,build,total,tier,weight_class,is_test,listed)
    VALUES(w,2,concat_ws(' ',p_draft_name->>'first',p_draft_name->>'second',p_draft_name->>'num'),
      jsonb_build_object('name',p_draft_name,'equipmentVersion',2,'decal',null,'paint','cream',
        'sockets',jsonb_build_object('head',null,'torso',null,'armL',null,'armR',null,'legL',null,'legR',null,'weapon',null),
        'parts',jsonb_build_object('head',null,'torso',null,'arms',null,'legs',null,'weapon',null)),0,1,'light',p.is_test,false)
    RETURNING id INTO draft_id;
  FOREACH s IN ARRAY ARRAY['head','torso','armL','armR','legL','legR','weapon'] LOOP
    kind:=CASE WHEN s IN ('armL','armR') THEN 'arms' WHEN s IN ('legL','legR') THEN 'legs' ELSE s END;
    SELECT * INTO STRICT offer FROM battle_bots_beginner_offers WHERE slot_kind=kind ORDER BY ordinal LIMIT 1;
    paint:=CASE kind WHEN 'head' THEN 'butter' WHEN 'torso' THEN 'mint' WHEN 'arms' THEN 'coral' WHEN 'legs' THEN 'ink' ELSE null END;
    INSERT INTO battle_bots_part_instances(wallet,part_key,slot_kind,tier,stats,bot_id,source,list_price,is_test,color)
      VALUES(w,offer.part_key,kind,1,jsonb_strip_nulls(jsonb_build_object('s',jsonb_build_array(1,1,1),
        'equipmentVersion',2,'onboardingVersion',1,'salvage',0,'provenance','Your welcome robot','paint',paint)),
        welcome_id,'starter',0,p.is_test,paint) RETURNING id INTO part_id;
    sockets:=sockets||jsonb_build_object(s,part_id);
  END LOOP;
  aliases:=jsonb_build_object('head',sockets->'head','torso',sockets->'torso','arms',sockets->'armL','legs',sockets->'legL','weapon',sockets->'weapon');
  UPDATE battle_bots_bots SET build=build||jsonb_build_object('sockets',sockets,'parts',aliases) WHERE id=welcome_id;
  INSERT INTO battle_bots_onboarding(wallet,welcome_bot_id,draft_bot_id) VALUES(w,welcome_id,draft_id);
  SELECT * INTO g FROM bb_grant(w,p_wallet_name,250,0,'onboarding:v1:allowance',jsonb_build_object('kind','beginner-allowance','reserved',250),p.is_test);
  IF NOT g.ok OR g.duplicate THEN RAISE EXCEPTION 'Beginner allowance did not land'; END IF;
  SELECT * INTO o FROM battle_bots_onboarding WHERE wallet=w AND version=1;
  RETURN jsonb_build_object('joined',true,'onboarding',to_jsonb(o));
END $$;

CREATE OR REPLACE FUNCTION public.bb_onboarding_buy(p_wallet TEXT,p_socket TEXT,p_offer_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; o battle_bots_onboarding%ROWTYPE;
  c battle_bots_beginner_claims%ROWTYPE; offer battle_bots_beginner_offers%ROWTYPE;
  kind TEXT; price INT; part_id BIGINT; sockets JSONB; aliases JSONB; n INT; total_n INT; g RECORD;
BEGIN
  SELECT * INTO STRICT p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
  SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=1 FOR UPDATE;
  SELECT * INTO c FROM battle_bots_beginner_claims WHERE wallet=w AND version=1 AND socket=p_socket;
  IF FOUND THEN RETURN to_jsonb(c); END IF;
  IF o.completed_at IS NOT NULL OR o.practice_fight_id IS NOT NULL THEN RAISE EXCEPTION 'Your first build is already finished'; END IF;
  IF p_socket NOT IN ('head','torso','armL','armR','legL','legR','weapon') OR p_socket IS NULL THEN RAISE EXCEPTION 'Choose one socket'; END IF;
  kind:=CASE WHEN p_socket IN ('armL','armR') THEN 'arms' WHEN p_socket IN ('legL','legR') THEN 'legs' ELSE p_socket END;
  SELECT * INTO STRICT offer FROM battle_bots_beginner_offers WHERE part_key=p_offer_id AND slot_kind=kind;
  price:=CASE WHEN kind IN ('arms','legs') THEN 25 ELSE 50 END;
  IF offer.price<>price OR o.reserved_coins<price THEN RAISE EXCEPTION 'Beginner allowance is inconsistent'; END IF;
  -- Reduce the reserve first, then debit through the single ledger entry point, in this transaction.
  UPDATE battle_bots_onboarding SET reserved_coins=reserved_coins-price,welcomed_at=coalesce(welcomed_at,now()) WHERE wallet=w AND version=1;
  SELECT * INTO g FROM bb_grant(w,p.wallet_name,-price,0,'onboarding:v1:buy:'||p_socket,
    jsonb_build_object('kind','beginner-part','socket',p_socket,'offer',p_offer_id),p.is_test);
  IF NOT g.ok OR g.duplicate THEN RAISE EXCEPTION 'Beginner purchase did not land'; END IF;
  INSERT INTO battle_bots_part_instances(wallet,part_key,slot_kind,tier,stats,bot_id,source,list_price,is_test,color)
    VALUES(w,offer.part_key,kind,1,jsonb_strip_nulls(jsonb_build_object('s',jsonb_build_array(1,1,1),
      'equipmentVersion',2,'onboardingVersion',1,'salvage',floor(price*.4),'provenance','Your first build','paint',offer.color)),
      o.draft_bot_id,'beginner',price,p.is_test,offer.color) RETURNING id INTO part_id;
  INSERT INTO battle_bots_beginner_claims(wallet,socket,offer_id,part_id,price)
    VALUES(w,p_socket,offer.part_key,part_id,price) RETURNING * INTO c;
  SELECT build->'sockets' INTO STRICT sockets FROM battle_bots_bots WHERE id=o.draft_bot_id AND recycled_at IS NULL FOR UPDATE;
  sockets:=sockets||jsonb_build_object(p_socket,part_id);
  aliases:=jsonb_build_object('head',sockets->'head','torso',sockets->'torso','arms',sockets->'armL','legs',sockets->'legL','weapon',sockets->'weapon');
  -- Each complete limb pair contributes its averaged [1,1,1], exactly as equipmentStatsTotal.
  total_n:=3*((CASE WHEN sockets->>'head' IS NOT NULL THEN 1 ELSE 0 END)+
    (CASE WHEN sockets->>'torso' IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN sockets->>'weapon' IS NOT NULL THEN 1 ELSE 0 END)+
    (CASE WHEN sockets->>'armL' IS NOT NULL AND sockets->>'armR' IS NOT NULL THEN 1 ELSE 0 END)+
    (CASE WHEN sockets->>'legL' IS NOT NULL AND sockets->>'legR' IS NOT NULL THEN 1 ELSE 0 END));
  PERFORM set_config('bb.onboarding_write',w,true);
  UPDATE battle_bots_bots SET build=build||jsonb_build_object('sockets',sockets,'parts',aliases),
    total=total_n,tier=1,weight_class='light',listed=false,updated_at=now() WHERE id=o.draft_bot_id;
  SELECT count(*) INTO n FROM battle_bots_beginner_claims WHERE wallet=w AND version=1;
  IF n=7 THEN UPDATE battle_bots_onboarding SET assembled_at=coalesce(assembled_at,now()) WHERE wallet=w AND version=1; END IF;
  RETURN to_jsonb(c);
END $$;

-- A resolved tutorial is one private sparring row, atomically linked to progress.
-- Its payload is prepared only by the service-role resolver from owned rows.
CREATE OR REPLACE FUNCTION public.bb_onboarding_practice(p_wallet TEXT,p_result JSONB,p_day TEXT)
RETURNS BIGINT LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; o battle_bots_onboarding%ROWTYPE; fight_id BIGINT;
BEGIN
  SELECT * INTO STRICT p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
  SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=1 FOR UPDATE;
  IF o.practice_fight_id IS NOT NULL THEN RETURN o.practice_fight_id; END IF;
  IF o.assembled_at IS NULL OR o.reserved_coins<>0 OR (SELECT count(*) FROM battle_bots_beginner_claims WHERE wallet=w AND version=1)<>7 THEN
    RAISE EXCEPTION 'Finish your seven parts first';
  END IF;
  IF p_result->>'mode' IS DISTINCT FROM 'spar' OR p_result->>'v' IS DISTINCT FROM '3' OR
    p_result->'rewards' IS DISTINCT FROM '{"attackerCoins":0,"attackerPoints":0,"attackerXp":0,"defenderCoins":0,"stakeHeld":0,"stakePayout":0,"houseBonus":0,"drop":null,"hat":null,"attackerRepair":false}'::jsonb THEN
    RAISE EXCEPTION 'The welcome practice cannot award anything';
  END IF;
  INSERT INTO battle_bots_battles(mode,challenger_wallet,challenger_bot_id,defender_wallet,defender_bot_id,
    seed,status,result,result_hash,day_key,is_test,resolved_at)
    VALUES('spar',w,o.draft_bot_id,w,o.welcome_bot_id,p_result->>'seed','resolved',p_result,
      lpad(to_hex((p_result->>'hash')::bigint),8,'0'),p_day,p.is_test,now()) RETURNING id INTO fight_id;
  UPDATE battle_bots_onboarding SET practice_fight_id=fight_id,practiced_at=now() WHERE wallet=w AND version=1;
  RETURN fight_id;
END $$;

CREATE OR REPLACE FUNCTION public.bb_onboarding_ack(p_wallet TEXT,p_action TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); o battle_bots_onboarding%ROWTYPE;
BEGIN
  PERFORM 1 FROM battle_bots_players WHERE wallet=w FOR UPDATE;
  SELECT * INTO STRICT o FROM battle_bots_onboarding WHERE wallet=w AND version=1 FOR UPDATE;
  IF p_action='welcome' THEN
    UPDATE battle_bots_onboarding SET welcomed_at=coalesce(welcomed_at,now()) WHERE wallet=w AND version=1;
  ELSIF p_action='complete' AND o.practice_fight_id IS NOT NULL AND o.reserved_coins=0 THEN
    UPDATE battle_bots_onboarding SET completed_at=coalesce(completed_at,now()) WHERE wallet=w AND version=1;
  ELSE RAISE EXCEPTION 'Watch your first practice first'; END IF;
END $$;

-- Defend against stale save requests, recycling and competing API requests while assembling.
-- Cosmetics/name changes are fine; the tutorial's seven purchased instances cannot disappear.
CREATE OR REPLACE FUNCTION public.bb_onboarding_protect_bot() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('bb.onboarding_write',true)=OLD.wallet THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM battle_bots_onboarding WHERE wallet=OLD.wallet AND completed_at IS NULL
    AND OLD.id IN (welcome_bot_id,draft_bot_id)) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Finish your welcome practice before recycling this robot'; END IF;
    IF NEW.build->'sockets' IS DISTINCT FROM OLD.build->'sockets' OR NEW.build->'parts' IS DISTINCT FROM OLD.build->'parts'
      OR NEW.recycled_at IS DISTINCT FROM OLD.recycled_at OR NEW.listed OR NEW.total<>OLD.total
      OR NEW.wins<>OLD.wins OR NEW.losses<>OLD.losses OR NEW.xp<>OLD.xp
      OR NEW.attacks_today<>OLD.attacks_today OR NEW.defenses_today<>OLD.defenses_today THEN
      RAISE EXCEPTION 'Finish your welcome practice before changing these parts';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bb_onboarding_protect_bot ON public.battle_bots_bots;
CREATE TRIGGER bb_onboarding_protect_bot BEFORE UPDATE OR DELETE ON public.battle_bots_bots
  FOR EACH ROW EXECUTE FUNCTION public.bb_onboarding_protect_bot();
CREATE OR REPLACE FUNCTION public.bb_onboarding_protect_part() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM battle_bots_onboarding WHERE wallet=OLD.wallet AND completed_at IS NULL
    AND OLD.bot_id IN (welcome_bot_id,draft_bot_id)) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Finish your welcome practice before recycling these parts'; END IF;
    IF NEW.bot_id IS DISTINCT FROM OLD.bot_id OR NEW.recycled_at IS DISTINCT FROM OLD.recycled_at
      OR NEW.stats IS DISTINCT FROM OLD.stats OR NEW.part_key<>OLD.part_key OR NEW.color IS DISTINCT FROM OLD.color THEN
      RAISE EXCEPTION 'These parts belong to your first build';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bb_onboarding_protect_part ON public.battle_bots_part_instances;
CREATE TRIGGER bb_onboarding_protect_part BEFORE UPDATE OR DELETE ON public.battle_bots_part_instances
  FOR EACH ROW EXECUTE FUNCTION public.bb_onboarding_protect_part();

-- Atomic legacy onboarding for flag-off rollbacks. Shares the exact player lock
-- with v1 provisioning, so mixed application versions cannot grant both starters.
CREATE OR REPLACE FUNCTION public.bb_legacy_provision(
  p_wallet TEXT,p_wallet_name TEXT,p_name JSONB,p_parts JSONB,p_is_test BOOLEAN DEFAULT false
) RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE w TEXT:=lower(p_wallet); p battle_bots_players%ROWTYPE; g RECORD; bot_id BIGINT; part_id BIGINT;
  s TEXT; kind TEXT; row JSONB; remaining JSONB:=p_parts; ordinal INT; sockets JSONB:='{}'; aliases JSONB;
  total_n INT; tier_n INT; weight_name TEXT; torso_paint TEXT;
BEGIN
  IF w IS NULL OR length(w)=0 OR jsonb_typeof(p_parts) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_parts) IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'Invalid legacy starter'; END IF;
  INSERT INTO battle_bots_players(wallet,wallet_name,is_test) VALUES(w,p_wallet_name,p_is_test) ON CONFLICT(wallet) DO NOTHING;
  SELECT * INTO p FROM battle_bots_players WHERE wallet=w FOR UPDATE;
  IF EXISTS(SELECT 1 FROM battle_bots_onboarding WHERE wallet=w)
    OR EXISTS(SELECT 1 FROM battle_bots_part_instances WHERE wallet=w)
    OR EXISTS(SELECT 1 FROM battle_bots_bots WHERE wallet=w)
    OR EXISTS(SELECT 1 FROM battle_bots_ledger WHERE wallet=w AND reason LIKE 'starter%') THEN
    RETURN jsonb_build_object('joined',false);
  END IF;
  IF (SELECT sum((x->>'list_price')::int) FROM jsonb_array_elements(p_parts) x) IS DISTINCT FROM 75 THEN
    RAISE EXCEPTION 'Legacy kit must retain its original price';
  END IF;
  SELECT sum(((x#>>'{stats,s,0}')::numeric+(x#>>'{stats,s,1}')::numeric+(x#>>'{stats,s,2}')::numeric)/
    CASE WHEN x->>'slot_kind' IN ('arms','legs') THEN 2 ELSE 1 END)::int INTO total_n FROM jsonb_array_elements(p_parts) x;
  tier_n:=CASE WHEN total_n>=80 THEN 4 WHEN total_n>=55 THEN 3 WHEN total_n>=25 THEN 2 ELSE 1 END;
  weight_name:=(ARRAY['light','middle','heavy','super'])[tier_n];
  SELECT x->>'color' INTO torso_paint FROM jsonb_array_elements(p_parts) x WHERE x->>'slot_kind'='torso';
  SELECT * INTO g FROM bb_grant(w,p_wallet_name,120,0,'starter:'||w,'{"kind":"starter"}',p.is_test);
  IF NOT g.ok OR g.duplicate THEN RAISE EXCEPTION 'Legacy starter grant did not land'; END IF;
  SELECT * INTO g FROM bb_grant(w,p_wallet_name,-75,0,'starter-kit:'||w,'{"kind":"starter-kit","each":15}',p.is_test);
  IF NOT g.ok OR g.duplicate THEN RAISE EXCEPTION 'Legacy kit debit did not land'; END IF;
  INSERT INTO battle_bots_bots(wallet,slot,name,build,total,tier,weight_class,is_test)
    VALUES(w,1,concat_ws(' ',p_name->>'first',p_name->>'second',p_name->>'num'),
      jsonb_strip_nulls(jsonb_build_object('name',p_name,'paint',torso_paint,'equipmentVersion',2,'decal',null)),
      total_n,tier_n,weight_name,p.is_test) RETURNING id INTO bot_id;
  FOREACH s IN ARRAY ARRAY['head','torso','armL','armR','legL','legR','weapon'] LOOP
    kind:=CASE WHEN s IN ('armL','armR') THEN 'arms' WHEN s IN ('legL','legR') THEN 'legs' ELSE s END;
    SELECT value,(ordinality-1)::int INTO row,ordinal FROM jsonb_array_elements(remaining) WITH ORDINALITY
      WHERE value->>'slot_kind'=kind ORDER BY ordinality LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Legacy starter missing %',s; END IF;
    remaining:=remaining-ordinal;
    INSERT INTO battle_bots_part_instances(wallet,part_key,slot_kind,tier,stats,bot_id,source,list_price,is_test,color)
      VALUES(w,row->>'part_key',kind,(row->>'tier')::int,row->'stats',bot_id,'starter',(row->>'list_price')::int,p.is_test,row->>'color')
      RETURNING id INTO part_id;
    sockets:=sockets||jsonb_build_object(s,part_id);
  END LOOP;
  aliases:=jsonb_build_object('head',sockets->'head','torso',sockets->'torso','arms',sockets->'armL','legs',sockets->'legL','weapon',sockets->'weapon');
  UPDATE battle_bots_bots SET build=build||jsonb_build_object('sockets',sockets,'parts',aliases) WHERE id=bot_id;
  RETURN jsonb_build_object('joined',true);
END $$;
REVOKE ALL ON FUNCTION public.bb_legacy_provision(TEXT,TEXT,JSONB,JSONB,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bb_legacy_provision(TEXT,TEXT,JSONB,JSONB,BOOLEAN) TO service_role;


-- Nothing is callable by an anonymous client. The existing server service key is required.
REVOKE ALL ON FUNCTION public.bb_grant(TEXT,TEXT,NUMERIC,NUMERIC,TEXT,JSONB,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_coin_balance(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_provision(TEXT,TEXT,JSONB,JSONB,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_buy(TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_practice(TEXT,JSONB,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bb_onboarding_ack(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_grant(TEXT,TEXT,NUMERIC,NUMERIC,TEXT,JSONB,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_coin_balance(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_provision(TEXT,TEXT,JSONB,JSONB,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_buy(TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_practice(TEXT,JSONB,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bb_onboarding_ack(TEXT,TEXT) TO service_role;
GRANT ALL ON public.battle_bots_beginner_offers, public.battle_bots_onboarding, public.battle_bots_beginner_claims TO service_role;
COMMIT;
