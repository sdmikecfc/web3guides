-- Test-only schema: exact relevant 001 tables plus the existing 003 colour fixture.
CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE IF NOT EXISTS battle_bots_players (
  id                   BIGSERIAL PRIMARY KEY,
  wallet               TEXT NOT NULL,                        -- IDENTITY, lowercased 0x...
  discord_id           TEXT,                                 -- one wallet per Discord (SIWE bind); NULL until linked
  wallet_name          TEXT,                                 -- shortened checksum address or an owned tokenized domain
  enlisted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  denominator_usd      NUMERIC NOT NULL DEFAULT 50,          -- D0: the bankroll snapshot at enlist, floor 50
  denominator_now_usd  NUMERIC NOT NULL DEFAULT 50,          -- D(t): D0 plus inbound at TWAP; never goes down
  bracket              TEXT NOT NULL DEFAULT 'garage',       -- garage | workshop | factory (by D0; moves UP only)
  coins                NUMERIC NOT NULL DEFAULT 0,           -- cached; the ledger is the truth
  battle_points        NUMERIC NOT NULL DEFAULT 0,           -- cached; the ledger is the truth; never spent
  trading_score        NUMERIC NOT NULL DEFAULT 0,           -- cached: the current window's trade coins
  roi_pct              NUMERIC,                              -- cached whole-percent ROI from the last daily run
  review_status        TEXT NOT NULL DEFAULT 'clear',        -- clear | held | cleared (flags hold a payout, never coins)
  is_operator          BOOLEAN NOT NULL DEFAULT FALSE,       -- staff: shown as "staff", earns nothing, fails closed
  is_test              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wallet)
);
CREATE TABLE IF NOT EXISTS battle_bots_ledger (
  id            BIGSERIAL PRIMARY KEY,
  wallet        TEXT NOT NULL,
  coins         NUMERIC NOT NULL DEFAULT 0,                  -- signed delta (spends are negative)
  battle_points NUMERIC NOT NULL DEFAULT 0,                  -- delta, never negative (points are never spent)
  reason        TEXT NOT NULL,
  meta          JSONB,
  is_test       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wallet, reason)
);
CREATE TABLE IF NOT EXISTS battle_bots_battles (
  id                BIGSERIAL PRIMARY KEY,
  mode              TEXT NOT NULL,                            -- pve | pvp | spar
  difficulty        TEXT,                                     -- easy | medium | hard (pve only)
  challenger_wallet TEXT NOT NULL,
  challenger_bot_id BIGINT NOT NULL,
  defender_wallet   TEXT,                                     -- NULL for house bots
  defender_bot_id   BIGINT,
  stake             INT NOT NULL DEFAULT 0,                   -- pvp: 25..500 coins
  class_gap         INT NOT NULL DEFAULT 0,                   -- defender class minus challenger class
  seed              TEXT,                                     -- the fight is deterministic from (seed, builds, orders, mode)
  status            TEXT NOT NULL DEFAULT 'open',             -- open | accepted | resolved | expired | declined
  winner_wallet     TEXT,
  result            JSONB,                                    -- the stored result the client replays and hashes
  result_hash       TEXT,
  coins_paid        INT NOT NULL DEFAULT 0,
  points_paid       NUMERIC NOT NULL DEFAULT 0,
  day_key           TEXT NOT NULL,                            -- the UTC day the attack was spent on
  is_test           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);
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

