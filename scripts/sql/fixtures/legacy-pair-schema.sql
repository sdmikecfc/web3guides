-- Test-only schema copied from doma-reporter/sql/battle_bots_001_init.sql; color from 003.
CREATE TABLE IF NOT EXISTS battle_bots_bots (
  id              BIGSERIAL PRIMARY KEY,
  wallet          TEXT NOT NULL,
  slot            INT NOT NULL,                               -- 1..5 (the garage bay)
  name            TEXT,                                       -- from the fixed name tables, never free text
  build           JSONB NOT NULL DEFAULT '{}'::jsonb,         -- { legs, arms, torso, head, weapon } part_instance ids
  total           INT NOT NULL DEFAULT 0,                     -- the five part totals (5..100)
  tier            INT NOT NULL DEFAULT 1,                     -- T2 at 25, T3 at 55, T4 at 80
  weight_class    TEXT NOT NULL DEFAULT 'light',              -- light | middle | heavy | super
  level           INT NOT NULL DEFAULT 1,
  xp              INT NOT NULL DEFAULT 0,
  wins            INT NOT NULL DEFAULT 0,
  losses          INT NOT NULL DEFAULT 0,
  broken_until    TIMESTAMPTZ,                                -- in the shop after a loss (24h); NULL = ready
  attacks_day_key TEXT,                                       -- the UTC day the counter belongs to
  attacks_today   INT NOT NULL DEFAULT 0,                     -- 2 per bot per UTC day
  defenses_today  INT NOT NULL DEFAULT 0,                     -- a defender is hit at most 5 times a day
  listed          BOOLEAN NOT NULL DEFAULT FALSE,             -- open to PvP challenges
  recycled_at     TIMESTAMPTZ,
  is_test         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wallet, slot)
);
CREATE TABLE IF NOT EXISTS battle_bots_part_instances (
  id          BIGSERIAL PRIMARY KEY,
  wallet      TEXT NOT NULL,
  part_key    TEXT NOT NULL,                                  -- catalog key (hand-authored part tables)
  slot_kind   TEXT NOT NULL,                                  -- legs | arms | torso | head | weapon
  tier        INT NOT NULL,
  stats       JSONB NOT NULL DEFAULT '{}'::jsonb,             -- the three stats as published in the catalog
  bot_id      BIGINT,                                         -- NULL = loose in the tray
  source      TEXT NOT NULL DEFAULT 'shop',                   -- starter | shop | drop
  list_price  INT NOT NULL DEFAULT 0,                         -- coins; recycle returns 40 percent of this
  recycled_at TIMESTAMPTZ,
  is_test     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE battle_bots_part_instances ADD COLUMN color TEXT;
