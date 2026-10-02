-- REVIEW ONLY. New Model Kombat seasonal namespace. No active season is created.
-- No existing table, shared money function, Reporter object, or prize rule is changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mk6_seasons (
 id text PRIMARY KEY, name text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT false, rules_version text NOT NULL DEFAULT 'mk-season-1',
 CHECK(ends_at>starts_at), CHECK(rules_version='mk-season-1')
);
CREATE TABLE IF NOT EXISTS public.mk6_catalog (
 id text PRIMARY KEY, catalog_version text NOT NULL, slot text NOT NULL CHECK(slot IN('head','torso','arms','legs','weapon')),
 tier integer NOT NULL CHECK(tier BETWEEN 1 AND 4), gp integer NOT NULL CHECK(gp>0),
 price integer NOT NULL CHECK(price>0), spec jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.mk6_players (
 season_id text NOT NULL REFERENCES public.mk6_seasons(id), wallet text NOT NULL CHECK(wallet~'^0x[0-9a-f]{40}$'),
 coins bigint NOT NULL DEFAULT 250, rating integer NOT NULL DEFAULT 1000 CHECK(rating>=100),
 wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0, archived_at timestamptz,
 draft jsonb NOT NULL DEFAULT '{"revision":0,"name":"My robot","parts":{},"defensePlan":"balanced"}',
 joined_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(season_id,wallet)
);
CREATE TABLE IF NOT EXISTS public.mk6_bots (
 id uuid PRIMARY KEY, season_id text NOT NULL, wallet text NOT NULL, name text NOT NULL,
 build jsonb NOT NULL, gp integer NOT NULL CHECK(gp>0), defense_plan text NOT NULL CHECK(defense_plan IN('early','balanced','last-stand')),
 wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0, defense_wins integer NOT NULL DEFAULT 0, defense_losses integer NOT NULL DEFAULT 0,
 repair_until timestamptz, protected_until timestamptz, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(season_id,wallet) REFERENCES public.mk6_players(season_id,wallet)
);
CREATE INDEX IF NOT EXISTS mk6_roster ON public.mk6_bots(season_id,wallet);
CREATE TABLE IF NOT EXISTS public.mk6_owned_parts (
 id bigserial PRIMARY KEY, bot_id uuid NOT NULL REFERENCES public.mk6_bots(id), socket text NOT NULL,
 card_id text NOT NULL REFERENCES public.mk6_catalog(id), paid integer NOT NULL, snapshot jsonb NOT NULL,
 UNIQUE(bot_id,socket), CHECK(socket IN('head','torso','armL','armR','legL','legR','weapon'))
);
CREATE TABLE IF NOT EXISTS public.mk6_days (
 season_id text NOT NULL, wallet text NOT NULL, day date NOT NULL, completions integer NOT NULL DEFAULT 0,
 rewarded integer NOT NULL DEFAULT 0 CHECK(rewarded BETWEEN 0 AND 12), play_coins integer NOT NULL DEFAULT 0 CHECK(play_coins BETWEEN 0 AND 1000),
 trade_bonus integer NOT NULL DEFAULT 0 CHECK(trade_bonus BETWEEN 0 AND 500), direct_rated integer NOT NULL DEFAULT 0 CHECK(direct_rated BETWEEN 0 AND 2),
 defense_loss integer NOT NULL DEFAULT 0 CHECK(defense_loss BETWEEN 0 AND 20),
 PRIMARY KEY(season_id,wallet,day), FOREIGN KEY(season_id,wallet) REFERENCES public.mk6_players(season_id,wallet)
);
CREATE TABLE IF NOT EXISTS public.mk6_receipts (
 season_id text NOT NULL, wallet text NOT NULL, request_id text NOT NULL, kind text NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(season_id,wallet,request_id), FOREIGN KEY(season_id,wallet) REFERENCES public.mk6_players(season_id,wallet)
);
CREATE TABLE IF NOT EXISTS public.mk6_ledger (
 id bigserial PRIMARY KEY, season_id text NOT NULL, wallet text NOT NULL, key text NOT NULL, amount bigint NOT NULL,
 reason text NOT NULL, day date, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(season_id,wallet,key),
 FOREIGN KEY(season_id,wallet) REFERENCES public.mk6_players(season_id,wallet)
);
CREATE TABLE IF NOT EXISTS public.mk6_matches (
 id uuid PRIMARY KEY, season_id text NOT NULL REFERENCES public.mk6_seasons(id), wallet text NOT NULL,
 request_id text NOT NULL, request_payload jsonb NOT NULL, bot_id uuid REFERENCES public.mk6_bots(id), target_bot_id uuid REFERENCES public.mk6_bots(id), target_wallet text,
 mode text NOT NULL CHECK(mode IN('ranked','direct','house','loaner','exhibition')), requested_mode text NOT NULL,
 seed bigint NOT NULL, revision integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'preparing' CHECK(status IN('preparing','running','settlement-pending','complete')),
 started_at timestamptz NOT NULL, builds jsonb NOT NULL, plans jsonb NOT NULL, identities jsonb NOT NULL, rules jsonb NOT NULL,
 state jsonb, input_receipts jsonb NOT NULL DEFAULT '[]', result jsonb, settlement jsonb,
 UNIQUE(season_id,wallet,request_id), FOREIGN KEY(season_id,wallet) REFERENCES public.mk6_players(season_id,wallet)
);
CREATE UNIQUE INDEX IF NOT EXISTS mk6_one_active_match ON public.mk6_matches(season_id,wallet) WHERE status<>'complete';
CREATE INDEX IF NOT EXISTS mk6_defender_active ON public.mk6_matches(season_id,target_bot_id) WHERE status<>'complete';
CREATE INDEX IF NOT EXISTS mk6_owner_history ON public.mk6_matches(season_id,wallet,started_at DESC) WHERE status='complete';
CREATE INDEX IF NOT EXISTS mk6_defense_history ON public.mk6_matches(season_id,target_wallet,started_at DESC) WHERE status='complete';
CREATE TABLE IF NOT EXISTS public.mk6_trade_facts (
 canonical_key text PRIMARY KEY, source text NOT NULL CHECK(source IN('mcp','strategies')), wallet text NOT NULL,
 day date NOT NULL, usd_micros bigint NOT NULL CHECK(usd_micros>=0), completed boolean NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 evidence jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS mk6_trade_wallet_day ON public.mk6_trade_facts(wallet,day);
CREATE TABLE IF NOT EXISTS public.mk6_collection_parts (
 season_id text NOT NULL, wallet text NOT NULL, card_id text NOT NULL REFERENCES public.mk6_catalog(id),
 paid integer NOT NULL CHECK(paid>=0), snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(season_id,wallet,card_id), FOREIGN KEY(season_id,wallet) REFERENCES public.mk6_players(season_id,wallet)
);

CREATE OR REPLACE FUNCTION public.mk6_current(p_season text,p_now timestamptz) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.mk6_seasons WHERE id=p_season AND enabled AND rules_version='mk-season-1' AND p_now>=starts_at AND p_now<ends_at)
 THEN RAISE EXCEPTION 'SEASON_CLOSED|This season is not open.'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.mk6_enroll(p_season text,p_wallet text,p_request text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mk6_players; now_at timestamptz:=clock_timestamp();
BEGIN
 PERFORM public.mk6_current(p_season,now_at);
 PERFORM 1 FROM public.mk6_seasons ORDER BY id FOR UPDATE;
 IF p_wallet !~ '^0x[0-9a-f]{40}$' THEN RAISE EXCEPTION 'BAD_WALLET|Sign in again.'; END IF;
 INSERT INTO public.mk6_players(season_id,wallet) VALUES(p_season,p_wallet) ON CONFLICT DO NOTHING;
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 INSERT INTO public.mk6_ledger(season_id,wallet,key,amount,reason) VALUES(p_season,p_wallet,'enroll',250,'starter') ON CONFLICT DO NOTHING;
 -- Ending collection keeps its original funds and parts; none enter this season.
 UPDATE public.mk6_players q SET archived_at=coalesce(q.archived_at,now_at) FROM public.mk6_seasons s
 WHERE q.wallet=p_wallet AND q.season_id=s.id AND s.ends_at<=now_at AND q.season_id<>p_season;
 UPDATE public.mk6_bots b SET archived_at=coalesce(b.archived_at,now_at) FROM public.mk6_seasons s
 WHERE b.wallet=p_wallet AND b.season_id=s.id AND s.ends_at<=now_at AND b.season_id<>p_season;
 RETURN to_jsonb(p);
END $$;
CREATE OR REPLACE FUNCTION public.mk6_save_draft(p_season text,p_wallet text,p_request text,p_revision integer,p_draft jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mk6_players; receipt public.mk6_receipts; payload jsonb:=jsonb_build_object('revision',p_revision,'draft',p_draft); result jsonb;
BEGIN
 PERFORM public.mk6_current(p_season,clock_timestamp());
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ENROLLED|Join this season first.'; END IF;
 SELECT * INTO receipt FROM public.mk6_receipts WHERE season_id=p_season AND wallet=p_wallet AND request_id=p_request;
 IF FOUND THEN IF receipt.kind<>'draft' OR receipt.payload<>payload THEN RAISE EXCEPTION 'REQUEST_CONFLICT|This request was already used.'; END IF; RETURN receipt.result; END IF;
 IF (p.draft->>'revision')::integer<>p_revision THEN RAISE EXCEPTION 'STALE_DRAFT|Your build changed in another window. Refresh it.'; END IF;
 IF p_draft->>'defensePlan' NOT IN('early','balanced','last-stand') OR char_length(p_draft->>'name') NOT BETWEEN 1 AND 32 OR jsonb_typeof(p_draft->'parts')<>'object'
 THEN RAISE EXCEPTION 'INVALID_BUILD|Check your robot choices.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(p_draft->'parts') c LEFT JOIN public.mk6_catalog k ON k.id=c.value
 WHERE c.key NOT IN('head','torso','armL','armR','legL','legR','weapon') OR k.id IS NULL OR k.slot<>CASE WHEN c.key LIKE 'arm%' THEN 'arms' WHEN c.key LIKE 'leg%' THEN 'legs' ELSE c.key END)
 THEN RAISE EXCEPTION 'INVALID_PART|Choose an available part for each place.'; END IF;
 result:=p_draft||jsonb_build_object('revision',p_revision+1);
 UPDATE public.mk6_players SET draft=result WHERE season_id=p_season AND wallet=p_wallet;
 INSERT INTO public.mk6_receipts VALUES(p_season,p_wallet,p_request,'draft',payload,result);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.mk6_finish_bot(p_season text,p_wallet text,p_request text,p_revision integer,p_id uuid,p_build jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mk6_players; r public.mk6_receipts; total integer; gp_total integer; b public.mk6_bots; payload jsonb:=jsonb_build_object('revision',p_revision);
BEGIN
 PERFORM public.mk6_current(p_season,clock_timestamp());
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ENROLLED|Join this season first.'; END IF;
 SELECT * INTO r FROM public.mk6_receipts WHERE season_id=p_season AND wallet=p_wallet AND request_id=p_request;
 IF FOUND THEN IF r.kind<>'finish' OR r.payload<>payload THEN RAISE EXCEPTION 'REQUEST_CONFLICT|This request was already used.'; END IF; RETURN r.result; END IF;
 IF (p.draft->>'revision')::integer<>p_revision THEN RAISE EXCEPTION 'STALE_DRAFT|Your build changed. Refresh before finishing.'; END IF;
 IF (SELECT count(*) FROM public.mk6_bots WHERE season_id=p_season AND wallet=p_wallet AND archived_at IS NULL)>=5 THEN RAISE EXCEPTION 'GARAGE_FULL|You can keep five robots in this season.'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p.draft->'parts'))<>7 OR p_build->>'version'<>'6' OR p_build->>'catalogVersion'<>'mk6-catalog-1'
 THEN RAISE EXCEPTION 'INVALID_BUILD|Choose all seven parts.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(p.draft->'parts') c LEFT JOIN public.mk6_catalog k ON k.id=c.value
 WHERE k.id IS NULL OR (p_build->'parts'->c.key->>'id') IS DISTINCT FROM c.value OR (p_build->'parts'->c.key->'s') IS DISTINCT FROM (k.spec->'s')
 OR (p_build->'parts'->c.key->>'gp')::integer IS DISTINCT FROM k.gp OR k.slot<>CASE WHEN c.key LIKE 'arm%' THEN 'arms' WHEN c.key LIKE 'leg%' THEN 'legs' ELSE c.key END)
 THEN RAISE EXCEPTION 'INVALID_BUILD|These parts do not match your saved choices.'; END IF;
 SELECT sum(k.price),sum(k.gp) INTO total,gp_total FROM jsonb_each_text(p.draft->'parts') c JOIN public.mk6_catalog k ON k.id=c.value;
 IF (p_build->>'gp')::integer<>gp_total THEN RAISE EXCEPTION 'INVALID_BUILD|This build needs its current part rules.'; END IF;
 IF p.coins<total THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS|You need more season coins to finish this robot.'; END IF;
 INSERT INTO public.mk6_bots(id,season_id,wallet,name,build,gp,defense_plan) VALUES(p_id,p_season,p_wallet,p.draft->>'name',p_build,gp_total,p.draft->>'defensePlan') RETURNING * INTO b;
 INSERT INTO public.mk6_owned_parts(bot_id,socket,card_id,paid,snapshot) SELECT p_id,c.key,k.id,k.price,p_build->'parts'->c.key FROM jsonb_each_text(p.draft->'parts') c JOIN public.mk6_catalog k ON k.id=c.value;
 UPDATE public.mk6_players SET coins=coins-total,draft=jsonb_build_object('revision',p_revision+1,'name','My robot','parts','{}'::jsonb,'defensePlan','balanced') WHERE season_id=p_season AND wallet=p_wallet;
 INSERT INTO public.mk6_ledger(season_id,wallet,key,amount,reason) VALUES(p_season,p_wallet,'build:'||p_id,-total,'build');
 INSERT INTO public.mk6_receipts VALUES(p_season,p_wallet,p_request,'finish',payload,to_jsonb(b));
 RETURN to_jsonb(b);
END $$;

CREATE OR REPLACE FUNCTION public.mk6_start_match(p_season text,p_wallet text,p_request text,p_id uuid,p_seed bigint,p_payload jsonb,p_house jsonb,p_loaner jsonb,p_rules jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE now_at timestamptz:=clock_timestamp(); p public.mk6_players; a public.mk6_bots; b public.mk6_bots; m public.mk6_matches; opponent public.mk6_players;
 requested text:=p_payload->>'mode'; actual text:=requested; day_at date:=(now_at AT TIME ZONE 'UTC')::date; ranked_count integer; paid_count integer; target_id uuid; a_build jsonb; b_build jsonb; a_name text; b_name text; a_plan text:='balanced'; b_plan text:='balanced';
BEGIN
 PERFORM public.mk6_current(p_season,now_at);
 -- All starts/settles lock the season row first: small preview league, simple deadlock-free cross-wallet serialization.
 PERFORM 1 FROM public.mk6_seasons WHERE id=p_season FOR UPDATE;
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ENROLLED|Join this season first.'; END IF;
 SELECT * INTO m FROM public.mk6_matches WHERE season_id=p_season AND wallet=p_wallet AND request_id=p_request;
 IF FOUND THEN IF m.request_payload<>p_payload THEN RAISE EXCEPTION 'REQUEST_CONFLICT|This request belongs to another fight.'; END IF; RETURN to_jsonb(m); END IF;
 IF EXISTS(SELECT 1 FROM public.mk6_matches WHERE season_id=p_season AND wallet=p_wallet AND status<>'complete') THEN RAISE EXCEPTION 'ACTIVE_MATCH|Finish or resume your current fight first.'; END IF;
 IF requested NOT IN('ranked','direct','house','loaner','exhibition') THEN RAISE EXCEPTION 'INVALID_MODE|Choose a fight.'; END IF;
 SELECT coalesce(max(rewarded),0) INTO paid_count FROM public.mk6_days WHERE season_id=p_season AND wallet=p_wallet AND day=day_at;
 IF requested='loaner' THEN
  IF NOT EXISTS(SELECT 1 FROM public.mk6_bots WHERE season_id=p_season AND wallet=p_wallet AND archived_at IS NULL) THEN RAISE EXCEPTION 'BUILD_FIRST|Build your first robot before borrowing a Workshop loaner.'; END IF;
  IF EXISTS(SELECT 1 FROM public.mk6_bots WHERE season_id=p_season AND wallet=p_wallet AND archived_at IS NULL AND (repair_until IS NULL OR repair_until<=now_at)) THEN RAISE EXCEPTION 'OWN_BOT_READY|One of your robots is ready to fight.'; END IF;
  a_build:=p_loaner; a_name:='Workshop loaner';
 ELSE
  SELECT * INTO a FROM public.mk6_bots WHERE id=(p_payload->>'botId')::uuid AND season_id=p_season AND wallet=p_wallet AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOT_NOT_FOUND|Choose a robot from this season.'; END IF;
  IF a.repair_until>now_at AND requested<>'exhibition' THEN RAISE EXCEPTION 'ROBOT_REPAIRING|This robot needs a little more repair time.'; END IF;
  a_build:=a.build; a_name:=a.name; a_plan:=a.defense_plan;
 END IF;
 IF requested='ranked' THEN
  SELECT q.* INTO b FROM public.mk6_bots q JOIN public.mk6_players qp ON qp.season_id=q.season_id AND qp.wallet=q.wallet
  WHERE q.season_id=p_season AND q.wallet<>p_wallet AND q.archived_at IS NULL AND (q.protected_until IS NULL OR q.protected_until<=now_at)
   AND abs(q.gp-a.gp)::numeric/a.gp<=0.15 AND NOT EXISTS(SELECT 1 FROM public.mk6_matches x WHERE x.season_id=p_season AND x.target_bot_id=q.id AND x.status<>'complete')
  ORDER BY CASE WHEN abs(q.gp-a.gp)::numeric/a.gp<=0.10 THEN 0 ELSE 1 END,
   abs(qp.rating-p.rating)+12*least(10,abs(qp.wins-p.wins)),abs(q.gp-a.gp),md5(q.id::text||p_seed::text) LIMIT 1 FOR UPDATE OF q;
  IF NOT FOUND THEN actual:='house'; END IF;
 ELSIF requested IN('direct','exhibition') AND p_payload ? 'targetBotId' THEN
  SELECT * INTO b FROM public.mk6_bots WHERE id=(p_payload->>'targetBotId')::uuid AND season_id=p_season AND wallet<>p_wallet AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_FOUND|That season robot is not available.'; END IF;
  IF requested='direct' THEN
   INSERT INTO public.mk6_days(season_id,wallet,day) VALUES(p_season,p_wallet,day_at) ON CONFLICT DO NOTHING;
   SELECT direct_rated INTO ranked_count FROM public.mk6_days WHERE season_id=p_season AND wallet=p_wallet AND day=day_at;
   IF paid_count>=12 OR ranked_count>=2 OR abs(b.gp-a.gp)::numeric/a.gp>0.15 OR b.protected_until>now_at
    OR EXISTS(SELECT 1 FROM public.mk6_matches WHERE season_id=p_season AND wallet=p_wallet AND target_wallet=b.wallet AND mode='direct' AND started_at>now_at-interval '24 hours')
    OR EXISTS(SELECT 1 FROM public.mk6_matches WHERE season_id=p_season AND target_bot_id=b.id AND status<>'complete') THEN actual:='exhibition';
   ELSE UPDATE public.mk6_days SET direct_rated=direct_rated+1 WHERE season_id=p_season AND wallet=p_wallet AND day=day_at; END IF;
  END IF;
 ELSIF requested='direct' THEN RAISE EXCEPTION 'TARGET_NOT_FOUND|Choose the robot you want to challenge.';
 END IF;
 IF b.id IS NOT NULL THEN b_build:=b.build; b_name:=b.name; b_plan:=b.defense_plan; ELSE b_build:=p_house; b_name:='Workshop house robot'; END IF;
 IF paid_count>=12 THEN actual:='exhibition'; END IF;
 IF a_build->>'version'<>'6' OR b_build->>'version'<>'6' OR p_rules->>'version'<>'mk-season-1' THEN RAISE EXCEPTION 'RULES_UNAVAILABLE|The new arena is still being set up.'; END IF;
 INSERT INTO public.mk6_matches(id,season_id,wallet,request_id,request_payload,bot_id,target_bot_id,target_wallet,mode,requested_mode,seed,started_at,builds,plans,identities,rules)
 VALUES(p_id,p_season,p_wallet,p_request,p_payload,a.id,b.id,b.wallet,actual,requested,p_seed,now_at,jsonb_build_array(a_build,b_build),jsonb_build_array(a_plan,b_plan),
 jsonb_build_array(jsonb_build_object('name',a_name,'botId',a.id),jsonb_build_object('name',b_name,'botId',b.id)),p_rules) RETURNING * INTO m;
 RETURN to_jsonb(m);
END $$;
CREATE OR REPLACE FUNCTION public.mk6_match_cas(p_season text,p_wallet text,p_id uuid,p_revision integer,p_state jsonb,p_receipts jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.mk6_matches; old_frame integer; next_frame integer;
BEGIN
 SELECT * INTO m FROM public.mk6_matches WHERE id=p_id AND season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND|This fight is not in your season.'; END IF;
 IF m.revision<>p_revision OR m.status='complete' THEN RETURN NULL; END IF;
 old_frame:=coalesce((m.state->>'frame')::integer,0); next_frame:=(p_state->>'frame')::integer;
 IF (p_state ?& ARRAY['version','seed','frame','done','winner','builds','stats','defensePlans','autoSpecial','commands','events','rulesVersion']) IS NOT TRUE
  OR jsonb_typeof(p_state->'commands') IS DISTINCT FROM 'array' OR jsonb_typeof(p_receipts) IS DISTINCT FROM 'array'
  OR p_state->>'version'<>'6' OR (p_state->>'seed')::bigint<>m.seed OR p_state->'builds'<>m.builds OR p_state->'defensePlans'<>m.plans OR p_state->'autoSpecial'<>'[false,true]'::jsonb
  OR next_frame<old_frame OR next_frame>5400 OR next_frame>greatest(0,floor(extract(epoch FROM clock_timestamp()-m.started_at)*60))+1 OR jsonb_array_length(p_receipts)>256
  OR (p_state->>'rulesVersion') IS DISTINCT FROM (m.rules->'engine'->>'rulesVersion')
  OR (m.state IS NOT NULL AND ((p_state->'stats') IS DISTINCT FROM (m.state->'stats') OR ((p_state->'commands') @> (m.state->'commands')) IS NOT TRUE))
  OR (p_receipts @> m.input_receipts) IS NOT TRUE
  OR (SELECT count(*) FROM jsonb_array_elements(p_receipts))<>(SELECT count(DISTINCT x->>'inputId') FROM jsonb_array_elements(p_receipts) x)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(m.input_receipts) WITH ORDINALITY old(value,n) WHERE p_receipts->(old.n::integer-1) IS DISTINCT FROM old.value)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(m.state->'commands','[]'::jsonb)) WITH ORDINALITY old(value,n) WHERE (p_state->'commands')->(old.n::integer-1) IS DISTINCT FROM old.value)
 THEN RAISE EXCEPTION 'INVALID_STATE|This fight needs its saved combat rules.'; END IF;
 UPDATE public.mk6_matches SET state=p_state,input_receipts=p_receipts,revision=revision+1,
 status=CASE WHEN (p_state->>'done')::boolean THEN 'settlement-pending' ELSE 'running' END WHERE id=p_id RETURNING * INTO m;
 RETURN to_jsonb(m);
END $$;

CREATE OR REPLACE FUNCTION public.mk6_defense_plan(p_season text,p_wallet text,p_request text,p_bot uuid,p_plan text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mk6_players; r public.mk6_receipts; b public.mk6_bots; payload jsonb:=jsonb_build_object('botId',p_bot,'defensePlan',p_plan);
BEGIN
 PERFORM public.mk6_current(p_season,clock_timestamp());
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ENROLLED|Join this season first.'; END IF;
 SELECT * INTO r FROM public.mk6_receipts WHERE season_id=p_season AND wallet=p_wallet AND request_id=p_request;
 IF FOUND THEN IF r.kind<>'defense' OR r.payload<>payload THEN RAISE EXCEPTION 'REQUEST_CONFLICT|This request was already used.'; END IF; RETURN r.result; END IF;
 IF p_plan NOT IN('early','balanced','last-stand') THEN RAISE EXCEPTION 'INVALID_PLAN|Choose Early, Balanced, or Last stand.'; END IF;
 UPDATE public.mk6_bots SET defense_plan=p_plan WHERE id=p_bot AND wallet=p_wallet AND season_id=p_season AND archived_at IS NULL RETURNING * INTO b;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOT_NOT_FOUND|Choose a robot from this season.'; END IF;
 INSERT INTO public.mk6_receipts VALUES(p_season,p_wallet,p_request,'defense',payload,to_jsonb(b)); RETURN to_jsonb(b);
END $$;

-- Private helper: caller holds the season/player locks. Bonus corrections may create debt; never touch old coins.
CREATE OR REPLACE FUNCTION public.mk6_reconcile_day(p_season text,p_wallet text,p_day date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE d public.mk6_days; target integer; delta integer;
BEGIN
 SELECT * INTO d FROM public.mk6_days WHERE season_id=p_season AND wallet=p_wallet AND day=p_day FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 target:=CASE WHEN EXISTS(SELECT 1 FROM public.mk6_trade_facts WHERE wallet=p_wallet AND day=p_day AND completed AND usd_micros>=10000000) THEN least(500,d.play_coins/2) ELSE 0 END;
 delta:=target-d.trade_bonus;
 IF delta<>0 THEN
  UPDATE public.mk6_players SET coins=coins+delta WHERE season_id=p_season AND wallet=p_wallet;
  UPDATE public.mk6_days SET trade_bonus=target WHERE season_id=p_season AND wallet=p_wallet AND day=p_day;
  INSERT INTO public.mk6_ledger(season_id,wallet,key,amount,reason,day) VALUES(p_season,p_wallet,'trade:'||p_day||':'||(SELECT coalesce(max(id),0)+1 FROM public.mk6_ledger),delta,CASE WHEN delta>0 THEN 'trade_bonus' ELSE 'trade_correction' END,p_day);
 END IF; RETURN delta;
END $$;
CREATE OR REPLACE FUNCTION public.mk6_settle_match(p_season text,p_wallet text,p_id uuid,p_result jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.mk6_matches; p public.mk6_players; opponent public.mk6_players; d public.mk6_days; dd public.mk6_days;
 finished timestamptz; day_at date; winner integer; reward integer:=0; goal integer:=0; bonus integer:=0; rating_delta integer:=0; defense_delta integer:=0;
 expected numeric; score numeric; repair_end timestamptz; repair_seconds integer; attacker_gp integer;
BEGIN
 PERFORM 1 FROM public.mk6_seasons WHERE id=p_season FOR UPDATE;
 SELECT * INTO m FROM public.mk6_matches WHERE id=p_id AND season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND|This fight is not in your season.'; END IF;
 IF m.status='complete' THEN RETURN to_jsonb(m); END IF;
 IF m.status<>'settlement-pending' OR m.state->>'done'<>'true' OR p_result->'winner' IS DISTINCT FROM m.state->'winner'
 OR p_result->'builds'<>m.builds OR p_result->'commands'<>m.state->'commands' OR p_result->'events'<>m.state->'events' OR (p_result->>'frames')::integer<>(m.state->>'frame')::integer
 THEN RAISE EXCEPTION 'INVALID_RESULT|Wait for this fight to finish.'; END IF;
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 finished:=m.started_at+make_interval(secs=>(m.state->>'frame')::numeric/60); day_at:=(finished AT TIME ZONE 'UTC')::date; winner:=(m.state->>'winner')::integer;
 IF finished>clock_timestamp()+interval '1 second' THEN RAISE EXCEPTION 'FUTURE_RESULT|This fight has not finished yet.'; END IF;
 INSERT INTO public.mk6_days(season_id,wallet,day) VALUES(p_season,p_wallet,day_at) ON CONFLICT DO NOTHING;
 SELECT * INTO d FROM public.mk6_days WHERE season_id=p_season AND wallet=p_wallet AND day=day_at FOR UPDATE;
 IF m.mode<>'exhibition' AND d.rewarded<12 THEN
  reward:=75; IF d.rewarded=5 THEN goal:=100; END IF;
  UPDATE public.mk6_days SET rewarded=rewarded+1,play_coins=play_coins+reward+goal WHERE season_id=p_season AND wallet=p_wallet AND day=day_at;
  UPDATE public.mk6_players SET coins=coins+reward+goal WHERE season_id=p_season AND wallet=p_wallet;
  INSERT INTO public.mk6_ledger(season_id,wallet,key,amount,reason,day) VALUES(p_season,p_wallet,'match:'||m.id,reward+goal,'play',day_at);
 END IF;
 UPDATE public.mk6_days SET completions=completions+1 WHERE season_id=p_season AND wallet=p_wallet AND day=day_at;
 IF m.mode IN('ranked','direct') AND m.target_wallet IS NOT NULL THEN
  SELECT * INTO opponent FROM public.mk6_players WHERE season_id=p_season AND wallet=m.target_wallet FOR UPDATE;
  INSERT INTO public.mk6_days(season_id,wallet,day) VALUES(p_season,m.target_wallet,day_at) ON CONFLICT DO NOTHING;
  SELECT * INTO dd FROM public.mk6_days WHERE season_id=p_season AND wallet=m.target_wallet AND day=day_at FOR UPDATE;
  expected:=1/(1+power(10::numeric,(opponent.rating-p.rating)::numeric/400)); score:=CASE WHEN winner IS NULL THEN 0.5 WHEN winner=0 THEN 1 ELSE 0 END;
  rating_delta:=greatest(100-p.rating,round(24*(score-expected))::integer);
  defense_delta:=round(8*(expected-score))::integer;
  IF defense_delta<0 THEN defense_delta:=-least(-defense_delta,greatest(0,20-dd.defense_loss)); END IF;
  defense_delta:=greatest(100-opponent.rating,defense_delta);
  UPDATE public.mk6_players SET rating=rating+rating_delta,wins=wins+CASE WHEN winner=0 THEN 1 ELSE 0 END,losses=losses+CASE WHEN winner=1 THEN 1 ELSE 0 END WHERE season_id=p_season AND wallet=p_wallet;
  UPDATE public.mk6_players SET rating=rating+defense_delta WHERE season_id=p_season AND wallet=m.target_wallet;
  UPDATE public.mk6_days SET defense_loss=defense_loss+greatest(0,-defense_delta) WHERE season_id=p_season AND wallet=m.target_wallet AND day=day_at;
  UPDATE public.mk6_bots SET defense_wins=defense_wins+CASE WHEN winner=1 THEN 1 ELSE 0 END,defense_losses=defense_losses+CASE WHEN winner=0 THEN 1 ELSE 0 END,
   protected_until=CASE WHEN winner=0 THEN greatest(coalesce(protected_until,finished),finished+interval '2 hours') ELSE protected_until END WHERE id=m.target_bot_id;
 END IF;
 IF m.bot_id IS NOT NULL AND m.mode<>'exhibition' THEN
  IF winner=1 THEN
   attacker_gp:=(m.builds->0->>'gp')::integer; repair_seconds:=round(3600+greatest(0,least(1,(attacker_gp-100)::numeric/400))*7200)::integer;
   repair_end:=finished+make_interval(secs=>repair_seconds);
  END IF;
  UPDATE public.mk6_bots SET wins=wins+CASE WHEN winner=0 THEN 1 ELSE 0 END,losses=losses+CASE WHEN winner=1 THEN 1 ELSE 0 END,
   repair_until=CASE WHEN winner=1 THEN repair_end ELSE repair_until END WHERE id=m.bot_id;
 END IF;
 bonus:=public.mk6_reconcile_day(p_season,p_wallet,day_at);
 UPDATE public.mk6_matches SET status='complete',revision=revision+1,result=p_result,
 settlement=jsonb_build_object('playCoins',reward,'objectiveCoins',goal,'tradeBonus',bonus,'rewarded',reward>0,'ratingChange',rating_delta,'defenderRatingChange',defense_delta,'repairUntil',repair_end,'finishedAt',finished,'winner',winner)
 WHERE id=m.id RETURNING * INTO m;
 RETURN to_jsonb(m);
END $$;

CREATE OR REPLACE FUNCTION public.mk6_repair(p_season text,p_wallet text,p_request text,p_bot uuid,p_quote jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mk6_players; b public.mk6_bots; r public.mk6_receipts; now_at timestamptz:=clock_timestamp(); duration numeric; full_price numeric; price integer; result jsonb;
BEGIN
 PERFORM public.mk6_current(p_season,now_at);
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ENROLLED|Join this season first.'; END IF;
 SELECT * INTO r FROM public.mk6_receipts WHERE season_id=p_season AND wallet=p_wallet AND request_id=p_request;
 IF FOUND THEN IF r.kind<>'repair' OR r.payload->>'botId'<>p_bot::text OR r.payload->>'quoteId'<>p_quote->>'quoteId' THEN RAISE EXCEPTION 'REQUEST_CONFLICT|This request was already used.'; END IF; RETURN r.result; END IF;
 SELECT * INTO b FROM public.mk6_bots WHERE id=p_bot AND season_id=p_season AND wallet=p_wallet AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOT_NOT_FOUND|Choose a robot from this season.'; END IF;
 IF (p_quote->>'expiresAt')::timestamptz<now_at OR (p_quote->>'readyAt')::timestamptz IS DISTINCT FROM b.repair_until THEN RAISE EXCEPTION 'QUOTE_EXPIRED|The repair price changed. Open a fresh quote.'; END IF;
 duration:=3600+greatest(0,least(1,(b.gp-100)::numeric/400))*7200; full_price:=50+greatest(0,least(1,(b.gp-100)::numeric/400))*100;
 price:=ceil(full_price*least(duration,greatest(0,extract(epoch FROM b.repair_until-now_at)))/duration)::integer;
 IF price>(p_quote->>'coins')::integer THEN RAISE EXCEPTION 'QUOTE_CHANGED|Open a fresh repair quote.'; END IF;
 IF p.coins<price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS|You need more season coins for this repair.'; END IF;
 UPDATE public.mk6_players SET coins=coins-price WHERE season_id=p_season AND wallet=p_wallet;
 UPDATE public.mk6_bots SET repair_until=now_at WHERE id=p_bot;
 result:=jsonb_build_object('botId',p_bot,'coins',price,'readyAt',now_at);
 INSERT INTO public.mk6_ledger(season_id,wallet,key,amount,reason) VALUES(p_season,p_wallet,'repair:'||p_request,-price,'repair');
 INSERT INTO public.mk6_receipts VALUES(p_season,p_wallet,p_request,'repair',jsonb_build_object('botId',p_bot,'quoteId',p_quote->>'quoteId'),result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mk6_confirm_trade(p_fact jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.mk6_trade_facts; f public.mk6_trade_facts; p public.mk6_players; delta integer:=0;
BEGIN
 IF p_fact->>'source' NOT IN('mcp','strategies') OR p_fact->>'wallet' !~ '^0x[0-9a-f]{40}$' OR (p_fact->>'usdMicros')::bigint<0 OR (p_fact->>'revision')::bigint<1 OR char_length(p_fact->>'canonicalKey') NOT BETWEEN 8 AND 200
 THEN RAISE EXCEPTION 'INVALID_TRADE|This trade record needs verification.'; END IF;
 -- Match transactions lock seasons in the same order. This service-only path accepts no browser claims.
 PERFORM 1 FROM public.mk6_seasons ORDER BY id FOR UPDATE;
 SELECT * INTO old FROM public.mk6_trade_facts WHERE canonical_key=p_fact->>'canonicalKey' FOR UPDATE;
 IF FOUND THEN
  IF old.wallet<>p_fact->>'wallet' OR old.source<>p_fact->>'source' OR old.day<>(p_fact->>'day')::date THEN RAISE EXCEPTION 'TRADE_IDENTITY_CONFLICT|Trade identity cannot change.'; END IF;
  IF old.revision>(p_fact->>'revision')::bigint THEN RETURN jsonb_build_object('changed',false); END IF;
  IF old.revision=(p_fact->>'revision')::bigint THEN
   IF old.usd_micros<>(p_fact->>'usdMicros')::bigint OR old.completed<>(p_fact->>'completed')::boolean THEN RAISE EXCEPTION 'TRADE_REVISION_CONFLICT|A correction needs a new revision.'; END IF;
   RETURN jsonb_build_object('changed',false);
  END IF;
 END IF;
 INSERT INTO public.mk6_trade_facts(canonical_key,source,wallet,day,usd_micros,completed,revision,evidence)
 VALUES(p_fact->>'canonicalKey',p_fact->>'source',p_fact->>'wallet',(p_fact->>'day')::date,(p_fact->>'usdMicros')::bigint,(p_fact->>'completed')::boolean,(p_fact->>'revision')::bigint,p_fact->'evidence')
 ON CONFLICT(canonical_key) DO UPDATE SET usd_micros=excluded.usd_micros,completed=excluded.completed,revision=excluded.revision,evidence=excluded.evidence,updated_at=clock_timestamp() RETURNING * INTO f;
 FOR p IN SELECT q.* FROM public.mk6_players q JOIN public.mk6_seasons s ON q.season_id=s.id WHERE q.wallet=f.wallet AND f.day BETWEEN (s.starts_at AT TIME ZONE 'UTC')::date AND (s.ends_at AT TIME ZONE 'UTC')::date ORDER BY q.season_id FOR UPDATE OF q LOOP
  delta:=delta+public.mk6_reconcile_day(p.season_id,f.wallet,f.day);
 END LOOP;
 RETURN jsonb_build_object('changed',true,'coinAdjustment',delta);
END $$;

CREATE OR REPLACE FUNCTION public.mk6_archive_owns(p_wallet text,p_card text) RETURNS boolean LANGUAGE sql AS $$
 SELECT EXISTS(SELECT 1 FROM public.mk6_owned_parts i JOIN public.mk6_bots b ON b.id=i.bot_id JOIN public.mk6_seasons s ON s.id=b.season_id
  WHERE b.wallet=p_wallet AND i.card_id=p_card AND s.ends_at<=now())
 OR EXISTS(SELECT 1 FROM public.mk6_collection_parts c JOIN public.mk6_seasons s ON s.id=c.season_id WHERE c.wallet=p_wallet AND c.card_id=p_card AND s.ends_at<=now())
$$;
CREATE OR REPLACE FUNCTION public.mk6_archive_buy(p_season text,p_wallet text,p_request text,p_card text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mk6_players; c public.mk6_catalog; r public.mk6_receipts; price integer; result jsonb; payload jsonb:=jsonb_build_object('cardId',p_card);
BEGIN
 PERFORM pg_advisory_xact_lock(627611,hashtext(p_wallet));
 PERFORM 1 FROM public.mk6_seasons WHERE id=p_season AND ends_at<=clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARCHIVE_NOT_READY|These coins belong to a season that has not ended.'; END IF;
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARCHIVE_NOT_FOUND|That collection is not in your wallet.'; END IF;
 SELECT * INTO r FROM public.mk6_receipts WHERE season_id=p_season AND wallet=p_wallet AND request_id=p_request;
 IF FOUND THEN IF r.kind<>'archive-buy' OR r.payload<>payload THEN RAISE EXCEPTION 'REQUEST_CONFLICT|This request was already used.'; END IF; RETURN r.result; END IF;
 SELECT * INTO c FROM public.mk6_catalog WHERE id=p_card;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PART|Choose an available collection part.'; END IF;
 price:=CASE WHEN public.mk6_archive_owns(p_wallet,p_card) THEN 0 ELSE c.price END;
 IF price>0 AND p.coins<price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS|This collection needs more of its own saved coins.'; END IF;
 INSERT INTO public.mk6_collection_parts(season_id,wallet,card_id,paid,snapshot) VALUES(p_season,p_wallet,c.id,price,c.spec) ON CONFLICT DO NOTHING;
 UPDATE public.mk6_players SET coins=coins-price,archived_at=coalesce(archived_at,clock_timestamp()) WHERE season_id=p_season AND wallet=p_wallet;
 INSERT INTO public.mk6_ledger(season_id,wallet,key,amount,reason) VALUES(p_season,p_wallet,'archive-buy:'||p_request,-price,'archive_part');
 result:=jsonb_build_object('cardId',p_card,'coins',price,'collectionOnly',true);
 INSERT INTO public.mk6_receipts VALUES(p_season,p_wallet,p_request,'archive-buy',payload,result); RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.mk6_archive_build(p_season text,p_wallet text,p_request text,p_id uuid,p_name text,p_choices jsonb,p_build jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mk6_players; r public.mk6_receipts; b public.mk6_bots; total integer; gp_total integer;
 payload jsonb:=jsonb_build_object('name',p_name,'parts',p_choices);
BEGIN
 PERFORM pg_advisory_xact_lock(627611,hashtext(p_wallet));
 PERFORM 1 FROM public.mk6_seasons WHERE id=p_season AND ends_at<=clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARCHIVE_NOT_READY|This season has not ended.'; END IF;
 SELECT * INTO p FROM public.mk6_players WHERE season_id=p_season AND wallet=p_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARCHIVE_NOT_FOUND|That collection is not in your wallet.'; END IF;
 SELECT * INTO r FROM public.mk6_receipts WHERE season_id=p_season AND wallet=p_wallet AND request_id=p_request;
 IF FOUND THEN IF r.kind<>'archive-build' OR r.payload<>payload THEN RAISE EXCEPTION 'REQUEST_CONFLICT|This request was already used.'; END IF; RETURN r.result; END IF;
 IF char_length(p_name) NOT BETWEEN 1 AND 32 OR jsonb_typeof(p_choices) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_choices))<>7
 OR (p_build->>'version') IS DISTINCT FROM '6' THEN RAISE EXCEPTION 'INVALID_BUILD|Choose all seven collection parts.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(p_choices) x LEFT JOIN public.mk6_catalog c ON c.id=x.value
  WHERE x.key NOT IN('head','torso','armL','armR','legL','legR','weapon') OR c.id IS NULL OR c.slot<>CASE WHEN x.key LIKE 'arm%' THEN 'arms' WHEN x.key LIKE 'leg%' THEN 'legs' ELSE x.key END
  OR (p_build->'parts'->x.key->>'id') IS DISTINCT FROM c.id OR (p_build->'parts'->x.key->'s') IS DISTINCT FROM (c.spec->'s'))
 THEN RAISE EXCEPTION 'INVALID_PART|These collection parts do not match.'; END IF;
 SELECT sum(c.gp) INTO gp_total FROM jsonb_each_text(p_choices) x JOIN public.mk6_catalog c ON c.id=x.value;
 IF (p_build->>'gp')::integer IS DISTINCT FROM gp_total THEN RAISE EXCEPTION 'INVALID_BUILD|This build needs its saved part rules.'; END IF;
 -- Archived parts are reusable collection designs. Buy each missing design once,
 -- even when it is fitted on both sides. These copies can never enter a league.
 SELECT coalesce(sum(c.price),0) INTO total FROM public.mk6_catalog c WHERE c.id IN(SELECT value FROM jsonb_each_text(p_choices)) AND NOT public.mk6_archive_owns(p_wallet,c.id);
 IF total>0 AND p.coins<total THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS|This collection needs more of its own saved coins.'; END IF;
 INSERT INTO public.mk6_collection_parts(season_id,wallet,card_id,paid,snapshot)
 SELECT p_season,p_wallet,c.id,CASE WHEN public.mk6_archive_owns(p_wallet,c.id) THEN 0 ELSE c.price END,c.spec FROM public.mk6_catalog c WHERE c.id IN(SELECT value FROM jsonb_each_text(p_choices)) ON CONFLICT DO NOTHING;
 INSERT INTO public.mk6_bots(id,season_id,wallet,name,build,gp,defense_plan,archived_at) VALUES(p_id,p_season,p_wallet,p_name,p_build,gp_total,'balanced',clock_timestamp()) RETURNING * INTO b;
 INSERT INTO public.mk6_owned_parts(bot_id,socket,card_id,paid,snapshot) SELECT p_id,x.key,x.value,0,p_build->'parts'->x.key FROM jsonb_each_text(p_choices) x;
 UPDATE public.mk6_players SET coins=coins-total,archived_at=coalesce(archived_at,clock_timestamp()) WHERE season_id=p_season AND wallet=p_wallet;
 INSERT INTO public.mk6_ledger(season_id,wallet,key,amount,reason) VALUES(p_season,p_wallet,'archive-build:'||p_request,-total,'archive_build');
 INSERT INTO public.mk6_receipts VALUES(p_season,p_wallet,p_request,'archive-build',payload,to_jsonb(b)); RETURN to_jsonb(b);
END $$;

CREATE OR REPLACE FUNCTION public.mk6_collection_view(p_wallet text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH reusable AS (
  SELECT DISTINCT i.card_id FROM public.mk6_owned_parts i JOIN public.mk6_bots b ON b.id=i.bot_id JOIN public.mk6_seasons s ON s.id=b.season_id WHERE b.wallet=p_wallet AND s.ends_at<=now()
  UNION SELECT c.card_id FROM public.mk6_collection_parts c JOIN public.mk6_seasons s ON s.id=c.season_id WHERE c.wallet=p_wallet AND s.ends_at<=now()
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('seasonId',p.season_id,'name',s.name,'coins',p.coins,'spendable',greatest(0,p.coins),'correctionDue',greatest(0,-p.coins),
  'parts',(SELECT coalesce(jsonb_agg(card_id ORDER BY card_id),'[]'::jsonb) FROM reusable),
  'botCount',(SELECT count(*) FROM public.mk6_bots b WHERE b.season_id=p.season_id AND b.wallet=p_wallet)) ORDER BY s.starts_at),'[]'::jsonb)
 FROM public.mk6_players p JOIN public.mk6_seasons s ON s.id=p.season_id WHERE p.wallet=p_wallet AND s.ends_at<=now()
$$;

CREATE OR REPLACE FUNCTION public.mk6_standings(p_season text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH board AS (
  SELECT row_number() OVER(ORDER BY p.rating DESC,p.wins DESC,p.losses,p.joined_at,p.wallet) AS place,p.*,b.id AS bot_id,b.name AS bot_name,b.gp
  FROM public.mk6_players p LEFT JOIN LATERAL (
   SELECT id,name,gp FROM public.mk6_bots WHERE season_id=p_season AND wallet=p.wallet AND archived_at IS NULL ORDER BY wins DESC,gp DESC,created_at LIMIT 1
  ) b ON true WHERE p.season_id=p_season AND (p.wins+p.losses>0 OR EXISTS(SELECT 1 FROM public.mk6_bots x WHERE x.season_id=p_season AND x.wallet=p.wallet AND x.defense_wins+x.defense_losses>0))
  ORDER BY p.rating DESC,p.wins DESC,p.losses,p.joined_at,p.wallet LIMIT 50
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('rank',place,'wallet',wallet,'rating',rating,'wins',wins,'losses',losses,'botId',bot_id,'botName',coalesce(bot_name,'Season player'),'gp',gp) ORDER BY place),'[]'::jsonb) FROM board
$$;
CREATE OR REPLACE FUNCTION public.mk6_rivalries(p_season text,p_wallet text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH fights AS (
  SELECT m.*,CASE WHEN wallet=p_wallet THEN target_wallet ELSE wallet END AS rival,
   CASE WHEN wallet=p_wallet THEN identities->1->>'name' ELSE identities->0->>'name' END AS rival_name,
   CASE WHEN wallet=p_wallet THEN target_bot_id ELSE bot_id END AS rival_bot,
   CASE WHEN wallet=p_wallet THEN 0 ELSE 1 END AS viewer,
   (settlement->>'winner')::integer AS winning_side,(settlement->>'finishedAt')::timestamptz AS finished
  FROM public.mk6_matches m WHERE season_id=p_season AND status='complete' AND mode IN('ranked','direct') AND (wallet=p_wallet OR target_wallet=p_wallet)
 ), totals AS (
  SELECT rival,count(*) AS played,count(*) FILTER(WHERE winning_side=viewer) AS wins,count(*) FILTER(WHERE winning_side<>viewer) AS losses,
   count(*) FILTER(WHERE winning_side IS NULL) AS draws,count(*) FILTER(WHERE viewer=0) AS own_attacks,count(*) FILTER(WHERE viewer=1) AS defenses,max(finished) AS last_at
  FROM fights GROUP BY rival
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('wallet',t.rival,'rivalName',last_fight.rival_name,'rivalBotId',last_fight.rival_bot,'played',t.played,'wins',t.wins,'losses',t.losses,
  'draws',t.draws,'ownAttacks',t.own_attacks,'defenses',t.defenses,'lastMatchId',last_fight.id,'lastFoughtAt',t.last_at) ORDER BY t.last_at DESC),'[]'::jsonb)
 FROM totals t JOIN LATERAL(SELECT * FROM fights f WHERE f.rival=t.rival ORDER BY finished DESC,id LIMIT 1) last_fight ON true
$$;

-- Table access and every RPC stay server-only, including helper functions.
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['mk6_seasons','mk6_catalog','mk6_players','mk6_bots','mk6_owned_parts','mk6_days','mk6_receipts','mk6_ledger','mk6_matches','mk6_trade_facts','mk6_collection_parts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',t); END IF;
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'mk6_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.sig);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon',f.sig); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated',f.sig); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig); END IF;
 END LOOP;
END $$;
COMMIT;
