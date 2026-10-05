-- PRELAUNCH inventory migration: legacy owned pairs -> independent limbs.
-- Reviewed against doma-reporter/sql/battle_bots_001_init.sql and 003.
-- Run while web/reporting writes are paused. This script has NOT been run
-- against a remote database. It uses only existing schema columns.
-- Original IDs, colours, stats, provenance, ownership, purchased value and
-- whole-coin resale survive. Battles, players, purchases and ledger are untouched.
-- Re-running is safe: equipmentVersion=2 and pairOriginId/equipmentSide mark
-- the completed operation. A failure rolls the whole transaction back.

BEGIN;
LOCK TABLE public.battle_bots_bots, public.battle_bots_part_instances
  IN SHARE ROW EXCLUSIVE MODE;

-- Track the intended resale, including correction of early seven-piece
-- starter rows written at prices 7/8 before the salvage override was added.
CREATE OR REPLACE FUNCTION pg_temp.bb_resale(stats jsonb, price integer, source text, slot text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    CASE WHEN jsonb_typeof(stats->'salvage') = 'number' THEN
      CASE WHEN (stats->>'salvage')::numeric >= 0
        AND (stats->>'salvage')::numeric = trunc((stats->>'salvage')::numeric)
        THEN (stats->>'salvage')::integer END END,
    CASE WHEN source = 'starter' AND slot IN ('arms','legs') AND price IN (7,8)
      AND stats->>'equipmentVersion' = '2' AND NOT (stats ? 'salvage') THEN 3 END,
    floor(price::numeric * 40 / 100)::integer)
$$;

CREATE TEMP TABLE bb_before ON COMMIT DROP AS
SELECT wallet, count(*) AS part_count, sum(list_price::bigint) AS price,
       sum(pg_temp.bb_resale(stats,list_price,source,slot_kind)::bigint) AS salvage
FROM public.battle_bots_part_instances WHERE recycled_at IS NULL GROUP BY wallet;

CREATE TEMP TABLE bb_legacy_bots ON COMMIT DROP AS
SELECT id, wallet, build,
  CASE WHEN jsonb_typeof(build->'parts') = 'object' THEN build->'parts'
       ELSE jsonb_build_object('head',build->'head','torso',build->'torso',
         'arms',build->'arms','legs',build->'legs','weapon',build->'weapon') END AS old_parts
FROM public.battle_bots_bots
WHERE recycled_at IS NULL AND coalesce(jsonb_typeof(build->'sockets'),'null') = 'null';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.battle_bots_part_instances
             WHERE recycled_at IS NULL AND (list_price < 0 OR jsonb_typeof(stats) <> 'object')) THEN
    RAISE EXCEPTION 'Inventory has negative prices or non-object stats; review those rows first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.battle_bots_bots WHERE recycled_at IS NULL
      AND coalesce(jsonb_typeof(build->'sockets'),'null') NOT IN ('null','object')) THEN
    RAISE EXCEPTION 'A saved sockets value is malformed; review before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.battle_bots_bots WHERE recycled_at IS NULL
      AND (jsonb_typeof(build)<>'object' OR
        coalesce(jsonb_typeof(build->'parts'),'null') NOT IN ('null','object'))) THEN
    RAISE EXCEPTION 'A saved build or parts value is malformed; review before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM bb_legacy_bots b CROSS JOIN
      (VALUES ('head'),('torso'),('arms'),('legs'),('weapon')) s(slot)
      WHERE b.old_parts->s.slot IS NOT NULL AND b.old_parts->s.slot <> 'null'::jsonb
      AND (jsonb_typeof(b.old_parts->s.slot) <> 'number' OR
           (b.old_parts->>s.slot) !~ '^[1-9][0-9]*$')) THEN
    RAISE EXCEPTION 'A legacy build contains a non-positive or non-integer part ID';
  END IF;
END $$;

CREATE TEMP TABLE bb_legacy_slots ON COMMIT DROP AS
SELECT b.id AS bot_id,b.wallet,s.slot,(b.old_parts->>s.slot)::bigint AS part_id
FROM bb_legacy_bots b CROSS JOIN
  (VALUES ('head'),('torso'),('arms'),('legs'),('weapon')) s(slot);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bb_legacy_slots s LEFT JOIN public.battle_bots_part_instances p ON p.id=s.part_id
      WHERE s.part_id IS NOT NULL AND (p.id IS NULL OR p.recycled_at IS NOT NULL OR
        p.wallet<>s.wallet OR p.slot_kind<>s.slot OR (p.bot_id IS NOT NULL AND p.bot_id<>s.bot_id))) THEN
    RAISE EXCEPTION 'A legacy build references a missing, recycled, wrong-kind or foreign part';
  END IF;
  IF EXISTS (SELECT part_id FROM bb_legacy_slots WHERE part_id IS NOT NULL
             GROUP BY part_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'An owned legacy part is assigned more than once';
  END IF;
  IF EXISTS (SELECT 1 FROM bb_legacy_slots s JOIN public.battle_bots_part_instances p ON p.id=s.part_id
      WHERE s.slot IN ('arms','legs') AND p.stats->>'equipmentVersion'='2') THEN
    RAISE EXCEPTION 'A legacy build contains an already-individual limb; fit its sides explicitly first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.battle_bots_part_instances p JOIN bb_legacy_bots b ON b.id=p.bot_id
      WHERE p.recycled_at IS NULL AND NOT EXISTS
        (SELECT 1 FROM bb_legacy_slots s WHERE s.bot_id=b.id AND s.part_id=p.id)) THEN
    RAISE EXCEPTION 'A legacy bot has bound parts absent from its build; review the bindings first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.battle_bots_bots b
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(b.build->'sockets')='object'
                                      THEN b.build->'sockets' ELSE '{}'::jsonb END) s
      JOIN public.battle_bots_part_instances p ON to_jsonb(p.id)=s.value
      WHERE b.recycled_at IS NULL AND p.slot_kind IN ('arms','legs')
        AND p.recycled_at IS NULL AND coalesce(p.stats->>'equipmentVersion','')<>'2') THEN
    RAISE EXCEPTION 'A modern socket build still references a legacy pair; resolve the mixed migration state first';
  END IF;
END $$;

CREATE TEMP TABLE bb_pair_map (
  original_id bigint PRIMARY KEY, right_id bigint NOT NULL UNIQUE,
  wallet text NOT NULL, original_price integer NOT NULL, original_salvage integer NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  p public.battle_bots_part_instances%ROWTYPE;
  right_id bigint;
  salvage integer;
BEGIN
  FOR p IN SELECT * FROM public.battle_bots_part_instances
    WHERE recycled_at IS NULL AND slot_kind IN ('arms','legs')
      AND coalesce(stats->>'equipmentVersion','')<>'2' ORDER BY id
  LOOP
    salvage := pg_temp.bb_resale(p.stats,p.list_price,p.source,p.slot_kind);
    INSERT INTO public.battle_bots_part_instances
      (wallet,part_key,slot_kind,tier,stats,bot_id,source,list_price,recycled_at,is_test,created_at,color)
    VALUES (p.wallet,p.part_key,p.slot_kind,p.tier,
      p.stats || jsonb_build_object('equipmentVersion',2,'pairOriginId',p.id,'equipmentSide','right',
        'legacyPairPrice',p.list_price,'legacyPairSalvage',salvage,'salvage',ceil(salvage::numeric/2)::integer),
      p.bot_id,p.source,ceil(p.list_price::numeric/2)::integer,p.recycled_at,p.is_test,p.created_at,p.color)
    RETURNING id INTO right_id;
    UPDATE public.battle_bots_part_instances SET
      list_price=floor(p.list_price::numeric/2)::integer,
      stats=p.stats || jsonb_build_object('equipmentVersion',2,'pairOriginId',p.id,'equipmentSide','left',
        'rightPartId',right_id,'legacyPairPrice',p.list_price,'legacyPairSalvage',salvage,
        'salvage',floor(salvage::numeric/2)::integer)
    WHERE id=p.id;
    INSERT INTO bb_pair_map VALUES(p.id,right_id,p.wallet,p.list_price,salvage);
  END LOOP;
END $$;

-- Original IDs remain the left-side aliases. Both old JSON layouts are
-- normalized to parts + seven sockets; unrelated look/name fields survive.
WITH ids AS (
  SELECT s.bot_id,max(s.part_id) FILTER(WHERE s.slot='head') AS head,
    max(s.part_id) FILTER(WHERE s.slot='torso') AS torso,
    max(s.part_id) FILTER(WHERE s.slot='arms') AS arm_l,
    max(m.right_id) FILTER(WHERE s.slot='arms') AS arm_r,
    max(s.part_id) FILTER(WHERE s.slot='legs') AS leg_l,
    max(m.right_id) FILTER(WHERE s.slot='legs') AS leg_r,
    max(s.part_id) FILTER(WHERE s.slot='weapon') AS weapon
  FROM bb_legacy_slots s LEFT JOIN bb_pair_map m ON m.original_id=s.part_id GROUP BY s.bot_id
)
UPDATE public.battle_bots_bots b SET build=b.build || jsonb_build_object(
  'equipmentVersion',2,
  'parts',jsonb_build_object('head',i.head,'torso',i.torso,'arms',i.arm_l,'legs',i.leg_l,'weapon',i.weapon),
  'sockets',jsonb_build_object('head',i.head,'torso',i.torso,'armL',i.arm_l,'armR',i.arm_r,
    'legL',i.leg_l,'legR',i.leg_r,'weapon',i.weapon)), updated_at=now()
FROM ids i WHERE b.id=i.bot_id;

-- Bind a previously unbound but valid fitted item and its copied right limb.
UPDATE public.battle_bots_part_instances p SET bot_id=s.bot_id
FROM bb_legacy_slots s LEFT JOIN bb_pair_map m ON m.original_id=s.part_id
WHERE p.id=s.part_id OR p.id=m.right_id;

UPDATE public.battle_bots_part_instances SET stats=stats || '{"salvage":3}'::jsonb
WHERE recycled_at IS NULL AND source='starter' AND slot_kind IN ('arms','legs')
  AND list_price IN (7,8) AND stats->>'equipmentVersion'='2' AND NOT (stats ? 'salvage');

UPDATE public.battle_bots_part_instances SET stats=stats || '{"equipmentVersion":2}'::jsonb
WHERE recycled_at IS NULL AND coalesce(stats->>'equipmentVersion','')<>'2';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bb_pair_map m
    JOIN public.battle_bots_part_instances l ON l.id=m.original_id
    JOIN public.battle_bots_part_instances r ON r.id=m.right_id
    WHERE l.list_price+r.list_price<>m.original_price OR
      pg_temp.bb_resale(l.stats,l.list_price,l.source,l.slot_kind)+
      pg_temp.bb_resale(r.stats,r.list_price,r.source,r.slot_kind)<>m.original_salvage OR
      l.wallet<>r.wallet OR l.part_key<>r.part_key OR l.stats->'s' IS DISTINCT FROM r.stats->'s' OR
      l.stats->'paint' IS DISTINCT FROM r.stats->'paint' OR l.color IS DISTINCT FROM r.color) THEN
    RAISE EXCEPTION 'Split-pair price, resale, stats, colour or ownership invariant failed';
  END IF;
  IF EXISTS (SELECT 1 FROM bb_before old JOIN (
      SELECT wallet,count(*) AS part_count,sum(list_price::bigint) AS price,
        sum(pg_temp.bb_resale(stats,list_price,source,slot_kind)::bigint) AS salvage
      FROM public.battle_bots_part_instances WHERE recycled_at IS NULL GROUP BY wallet
    ) fresh USING(wallet)
    WHERE fresh.price<>old.price OR fresh.salvage<>old.salvage OR
      fresh.part_count<>old.part_count+(SELECT count(*) FROM bb_pair_map m WHERE m.wallet=old.wallet)) THEN
    RAISE EXCEPTION 'Per-wallet inventory value or count changed unexpectedly';
  END IF;
END $$;

SELECT (SELECT count(*) FROM bb_pair_map) AS pairs_split,
       (SELECT count(*) FROM bb_legacy_bots) AS bots_migrated;
COMMIT;
