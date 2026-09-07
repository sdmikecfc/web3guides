/**
 * RIOT - authored content. THE SEED NEVER DESIGNS, IT ONLY SELECTS: every
 * level, fight, wave, door, roamer and boss number in this file is
 * hand-authored; `levelSetForSeed` picks an index and nothing else.
 *
 * EQUAL-CEILING LAW (the ironjaw slot law, the stopclock roster law): sets
 * may differ in entry sides, door positions, delays and y placements -
 * never in enemy multisets, wave counts, points or boss numbers. A player
 * on set 0 and a player on set 1 face the same ceiling. validateLevels()
 * asserts it by signature string and THROWS from the harness adapter's
 * rate(), so a bad set can never reach a green gate.
 *
 * `skin` and `name` are RENDER-ONLY (the ladders.ts `hand` discipline):
 * the sim never branches on them, which is why retheming a level cannot
 * move a tape.
 *
 * CONTRACT STATUS: hour-0 freeze 2026-08-15. Types + scoring are FROZEN
 * (Client and harness build against them). LEVEL_SETS/ARENA_WAVES below
 * are the real authored sets (sim track, same session as the freeze).
 */

// ── enemy kinds (8 archetypes, all machines - the Warden's) ────────────────
export type EnemyKind =
  | "grunt" // rushdown: walks in, 2-hit jab + smash
  | "harass" // darts in, one hit, retreats
  | "thrower" // keeps x-distance, y-aligns, fires a bolt
  | "blocker" // frontal guard; jump/dash attack breaks it (60f stun)
  | "bomber" // lobs an arcing AoE bomb at your standing mark
  | "charger" // telegraphed unblockable x-lane charge; wall stagger
  | "pgrunt" // grunt with a pipe; DROPS the pipe
  | "bthrower"; // thrower with a blaster; DROPS the blaster

export interface SpawnDef {
  kind: EnemyKind;
  entry: "L" | "R" | "door";
  door?: number; // index into the fight's doors when entry === "door"
  delayF: number; // frames after the wave opens
  y: number; // depth-band position
}

export interface WaveDef {
  spawns: SpawnDef[];
}

export interface FightDef {
  triggerX: number; // player x that locks the camera
  lockCamX: number; // authored camera position for the locked fight
  /** Door (x, y) fixtures. y sits ON THE BAND'S BACK LINE (BAND_TOP = 252,
   * Mike's "doors in the middle of the walking area" redline 2026-08-15):
   * the slab reads as set into the back wall, and door-entry spawns emerge
   * AT the fixture (sim queueWave uses the door's own x AND y). */
  doors: [number, number][];
  waves: WaveDef[]; // 1..3 authored waves
}

export interface BossDef {
  kind: "charge" | "limbs" | "warp";
  hp: number;
  /** Exactly 3 attacks: tell/active/recover frames + damage. Tells never
   * compress under phase speedup - only gapF does. */
  attacks: { tellF: number; activeF: number; recoverF: number; dmg: number }[];
  vulnF: number; // the free-hit window length (frames)
  vulnEvery: number; // attacks per cycle before the window opens
  gapF: number; // idle frames between attacks (phase speedup shrinks this)
  anchors?: [number, number][]; // warp boss teleport points (4)
}

export interface LevelDef {
  name: string; // shipped string - ORIGINAL names only, no trademarks
  w: number; // world width (design px)
  skin: "streets" | "forest" | "facility"; // RENDER ONLY
  roamers: { kind: EnemyKind; x: number; y: number }[]; // live from frame 0
  fights: FightDef[];
  /** Hand-authored health packs (Mike 2026-08-17: "throw them the odd health
   * pack"). ONE per level, on the roaming stretch between fights - NEVER
   * inside the boss's locked screen (a boss-fight heal changes the boss
   * math; validator asserts x <= w - screen). The sim spawns these as
   * pickups at load; count rides the equal-ceiling signature. */
  packs: { x: number; y: number }[];
  bossX: number; // trigger for the boss lock
  boss: BossDef;
}

export type LevelSet = [LevelDef, LevelDef, LevelDef];

// ── scoring (FROZEN: per-kill value plateaus, kill count never caps) ───────
export const KILL_PTS: Record<EnemyKind, number> = {
  grunt: 100,
  pgrunt: 110,
  harass: 120,
  thrower: 140,
  bthrower: 150,
  bomber: 160,
  blocker: 160,
  charger: 180,
};
export const FIGHT_CLEAR_PTS = 150;
export const BOSS_PTS = [500, 650, 800] as const;
/** Arena wave bonus: VALUE plateaus at 250, wave COUNT is uncapped
 * (ADR-0120 - the rate stays bounded, the total does not). */
export const ARENA_WAVE_PTS = (n: number) => Math.min(250, 100 + 10 * n);

// ── fairness floors (imported by sim + validator, single source) ───────────
export const MIN_SPAWN_DIST = 200; // door spawn vs the fight's standing point
export const TELL_FLOOR_F = 20; // no enemy tell below this, ever
export const BOSS_TELL_FLOOR_F = 30;
export const CHARGE_TELL_F = 42; // lane charges telegraph longest
/** Health pack heal (the sim imports this - single source). 14 of the 40
 * base HP: a real chunk, never a full reset. */
export const HEAL_PACK_HP = 14;

// ── the belt band + spawn point (validator-local mirrors of sim geometry;
//    the sim's FLOOR_TOP/FLOOR_BOT are frozen there, restated here so the
//    validator has no circular import) ───────────────────────────────────────
const BAND_TOP = 252;
const BAND_BOT = 388;
const SPAWN_X = 90;
const SPAWN_Y = 320;
const SCREEN_W = 640;

// ── the enemy stat table (authored; the SIM IMPORTS THIS - the validator
//    asserts the tell floors against the very numbers the sim runs, per the
//    gates-must-import-not-reimplement law) ─────────────────────────────────
export interface EnemyStat {
  hp: number;
  spd: number; // walk px/s
  dmg: number; // per hit (arena adds 3/lap on top, uncapped)
  windupF: number; // the tell (>= TELL_FLOOR_F; charger >= CHARGE_TELL_F)
  activeF: number;
  recoverF: number;
  reach: number; // melee reach / ranged standoff trigger
  cdF: number; // frames between token requests
}
export const EN_STATS: Record<EnemyKind, EnemyStat> = {
  grunt: { hp: 12, spd: 90, dmg: 5, windupF: 24, activeF: 4, recoverF: 20, reach: 40, cdF: 70 },
  harass: { hp: 8, spd: 150, dmg: 4, windupF: 20, activeF: 3, recoverF: 12, reach: 38, cdF: 55 },
  thrower: { hp: 10, spd: 85, dmg: 6, windupF: 30, activeF: 2, recoverF: 24, reach: 200, cdF: 90 },
  blocker: { hp: 16, spd: 70, dmg: 6, windupF: 26, activeF: 4, recoverF: 22, reach: 42, cdF: 80 },
  bomber: { hp: 10, spd: 78, dmg: 8, windupF: 34, activeF: 2, recoverF: 26, reach: 210, cdF: 110 },
  charger: { hp: 14, spd: 100, dmg: 9, windupF: 42, activeF: 60, recoverF: 18, reach: 260, cdF: 130 },
  pgrunt: { hp: 12, spd: 92, dmg: 7, windupF: 26, activeF: 4, recoverF: 22, reach: 52, cdF: 70 },
  bthrower: { hp: 10, spd: 85, dmg: 6, windupF: 32, activeF: 2, recoverF: 26, reach: 210, cdF: 95 },
};

// ── the authored sets ──────────────────────────────────────────────────────
// SET 0 and SET 1 differ ONLY in entry sides, door placements, delays and y
// (the equal-ceiling law; validateLevels proves it by signature). Names are
// original - no trademarked strings anywhere in shipped copy.

const SET_0: LevelSet = [
  {
    name: "OLD TOWN",
    w: 1920,
    skin: "streets",
    roamers: [
      // THE AFK EXECUTIONER (validator-asserted): a melee roamer 200-600px
      // from the spawn point, live from frame 0, so an idle run always dies.
      { kind: "grunt", x: 380, y: 320 },
      { kind: "pgrunt", x: 1500, y: 300 },
    ],
    fights: [
      {
        triggerX: 600,
        lockCamX: 320,
        doors: [[880, 252]],
        waves: [
          {
            spawns: [
              { kind: "grunt", entry: "L", delayF: 0, y: 300 },
              { kind: "harass", entry: "R", delayF: 20, y: 350 },
              { kind: "grunt", entry: "door", door: 0, delayF: 40, y: 310 },
            ],
          },
          {
            spawns: [
              { kind: "pgrunt", entry: "L", delayF: 0, y: 330 },
              { kind: "thrower", entry: "R", delayF: 20, y: 280 },
              { kind: "harass", entry: "door", door: 0, delayF: 50, y: 360 },
            ],
          },
        ],
      },
      {
        triggerX: 1150,
        lockCamX: 880,
        doors: [[1420, 252]],
        waves: [
          {
            spawns: [
              { kind: "grunt", entry: "L", delayF: 0, y: 280 },
              { kind: "grunt", entry: "R", delayF: 15, y: 360 },
              { kind: "bomber", entry: "R", delayF: 40, y: 300 },
            ],
          },
          {
            spawns: [
              { kind: "blocker", entry: "L", delayF: 0, y: 320 },
              { kind: "harass", entry: "door", door: 0, delayF: 30, y: 340 },
              { kind: "bthrower", entry: "R", delayF: 20, y: 290 },
            ],
          },
        ],
      },
    ],
    // the breather after fight 1 clears, well short of fight 2's trigger
    packs: [{ x: 1010, y: 320 }],
    bossX: 1700,
    boss: {
      kind: "charge",
      /** 90 -> 60 (Mike 2026-08-17: "takes like 8 repetitions"). Measured
       * with the harness oracle before tuning: the fight is HP-gated, not
       * window-gated - the oracle lands 24-31 per vuln window (a human
       * ~one chain, 12-14), so hp 90 = ~7-8 punish windows for a clean
       * human fight. 60 lands it at ~4-5. Window/tell/gap untouched. */
      hp: 60,
      attacks: [
        { tellF: 30, activeF: 10, recoverF: 26, dmg: 8 }, // piston slam
        { tellF: 34, activeF: 6, recoverF: 30, dmg: 7 }, // scatter bolts
        { tellF: 42, activeF: 90, recoverF: 20, dmg: 10 }, // THE LANE CHARGE -> wall stagger = the window
      ],
      vulnF: 70,
      vulnEvery: 3,
      gapF: 55,
    },
  },
  {
    name: "THE PINES",
    w: 1920,
    skin: "forest",
    roamers: [
      { kind: "harass", x: 400, y: 300 },
      { kind: "grunt", x: 1000, y: 350 },
    ],
    fights: [
      {
        triggerX: 500,
        lockCamX: 220,
        doors: [[260, 252]],
        waves: [
          {
            spawns: [
              { kind: "harass", entry: "L", delayF: 0, y: 300 },
              { kind: "harass", entry: "R", delayF: 10, y: 340 },
              { kind: "thrower", entry: "R", delayF: 30, y: 300 },
            ],
          },
          {
            spawns: [
              { kind: "charger", entry: "L", delayF: 0, y: 320 },
              { kind: "grunt", entry: "door", door: 0, delayF: 20, y: 360 },
              { kind: "pgrunt", entry: "R", delayF: 35, y: 290 },
            ],
          },
        ],
      },
      {
        triggerX: 1000,
        lockCamX: 720,
        doors: [[760, 252]],
        waves: [
          {
            spawns: [
              { kind: "blocker", entry: "R", delayF: 0, y: 330 },
              { kind: "bomber", entry: "L", delayF: 15, y: 300 },
              { kind: "harass", entry: "door", door: 0, delayF: 40, y: 350 },
            ],
          },
          {
            spawns: [
              { kind: "grunt", entry: "L", delayF: 0, y: 280 },
              { kind: "grunt", entry: "R", delayF: 10, y: 360 },
              { kind: "bthrower", entry: "R", delayF: 30, y: 310 },
            ],
          },
        ],
      },
      {
        triggerX: 1450,
        lockCamX: 1280,
        doors: [[1700, 252]],
        waves: [
          {
            spawns: [
              { kind: "charger", entry: "R", delayF: 0, y: 320 },
              { kind: "thrower", entry: "L", delayF: 20, y: 290 },
              { kind: "grunt", entry: "door", door: 0, delayF: 35, y: 350 },
            ],
          },
          {
            spawns: [
              { kind: "blocker", entry: "L", delayF: 0, y: 310 },
              { kind: "harass", entry: "R", delayF: 15, y: 340 },
              { kind: "pgrunt", entry: "door", door: 0, delayF: 45, y: 300 },
            ],
          },
        ],
      },
    ],
    // mid-level, between fight 2's clear and fight 3's trigger
    packs: [{ x: 1180, y: 330 }],
    bossX: 1750,
    boss: {
      kind: "limbs",
      hp: 110,
      attacks: [
        { tellF: 32, activeF: 8, recoverF: 26, dmg: 9 }, // arm slam down your lane
        { tellF: 36, activeF: 60, recoverF: 24, dmg: 10 }, // chest laser - JUMP it
        { tellF: 30, activeF: 10, recoverF: 24, dmg: 8 }, // double-arm sweep
      ],
      vulnF: 70,
      vulnEvery: 3,
      gapF: 50,
    },
  },
  {
    name: "THE FOUNDRY",
    w: 1920,
    skin: "facility",
    roamers: [
      { kind: "grunt", x: 350, y: 310 },
      { kind: "thrower", x: 1200, y: 280 },
    ],
    fights: [
      {
        triggerX: 480,
        lockCamX: 200,
        doors: [[240, 252]],
        waves: [
          {
            spawns: [
              { kind: "grunt", entry: "L", delayF: 0, y: 300 },
              { kind: "blocker", entry: "R", delayF: 10, y: 330 },
              { kind: "harass", entry: "door", door: 0, delayF: 30, y: 360 },
            ],
          },
          {
            spawns: [
              { kind: "charger", entry: "L", delayF: 0, y: 320 },
              { kind: "bomber", entry: "R", delayF: 20, y: 290 },
              { kind: "bthrower", entry: "door", door: 0, delayF: 40, y: 340 },
            ],
          },
        ],
      },
      {
        triggerX: 980,
        lockCamX: 700,
        doors: [
          [740, 252],
          [1250, 252],
        ],
        waves: [
          {
            spawns: [
              { kind: "harass", entry: "L", delayF: 0, y: 340 },
              { kind: "harass", entry: "R", delayF: 10, y: 300 },
              { kind: "thrower", entry: "door", door: 1, delayF: 25, y: 330 },
            ],
          },
          {
            spawns: [
              { kind: "pgrunt", entry: "door", door: 0, delayF: 0, y: 310 },
              { kind: "grunt", entry: "R", delayF: 15, y: 350 },
              { kind: "charger", entry: "L", delayF: 35, y: 320 },
            ],
          },
        ],
      },
      {
        triggerX: 1430,
        lockCamX: 1280,
        doors: [[1730, 252]],
        waves: [
          {
            spawns: [
              { kind: "blocker", entry: "L", delayF: 0, y: 320 },
              { kind: "bomber", entry: "door", door: 0, delayF: 20, y: 340 },
              { kind: "thrower", entry: "R", delayF: 10, y: 290 },
            ],
          },
          {
            spawns: [
              { kind: "charger", entry: "R", delayF: 0, y: 320 },
              { kind: "grunt", entry: "L", delayF: 10, y: 300 },
              { kind: "harass", entry: "door", door: 0, delayF: 30, y: 350 },
            ],
          },
        ],
      },
    ],
    // mid-level, between fight 2's clear and fight 3's trigger
    packs: [{ x: 1150, y: 310 }],
    bossX: 1760,
    boss: {
      kind: "warp",
      hp: 130,
      attacks: [
        { tellF: 34, activeF: 8, recoverF: 24, dmg: 9 }, // aimed bolt burst
        { tellF: 30, activeF: 14, recoverF: 22, dmg: 10 }, // dive slash
        { tellF: 38, activeF: 10, recoverF: 26, dmg: 9 }, // shock nova
      ],
      vulnF: 100,
      vulnEvery: 3,
      gapF: 46,
      anchors: [
        [1380, 300],
        [1840, 300],
        [1380, 370],
        [1840, 370],
      ],
    },
  },
];

const SET_1: LevelSet = [
  {
    name: "OLD TOWN",
    w: 1920,
    skin: "streets",
    roamers: [
      { kind: "grunt", x: 430, y: 340 },
      { kind: "pgrunt", x: 1560, y: 330 },
    ],
    fights: [
      {
        triggerX: 600,
        lockCamX: 320,
        doors: [[400, 252]],
        waves: [
          {
            spawns: [
              { kind: "grunt", entry: "R", delayF: 0, y: 340 },
              { kind: "harass", entry: "L", delayF: 25, y: 290 },
              { kind: "grunt", entry: "door", door: 0, delayF: 35, y: 330 },
            ],
          },
          {
            spawns: [
              { kind: "pgrunt", entry: "R", delayF: 0, y: 300 },
              { kind: "thrower", entry: "L", delayF: 25, y: 340 },
              { kind: "harass", entry: "door", door: 0, delayF: 45, y: 280 },
            ],
          },
        ],
      },
      {
        triggerX: 1150,
        lockCamX: 880,
        doors: [[940, 252]],
        waves: [
          {
            spawns: [
              { kind: "grunt", entry: "R", delayF: 0, y: 300 },
              { kind: "grunt", entry: "L", delayF: 20, y: 340 },
              { kind: "bomber", entry: "L", delayF: 45, y: 320 },
            ],
          },
          {
            spawns: [
              { kind: "blocker", entry: "R", delayF: 0, y: 340 },
              { kind: "harass", entry: "door", door: 0, delayF: 25, y: 300 },
              { kind: "bthrower", entry: "L", delayF: 15, y: 330 },
            ],
          },
        ],
      },
    ],
    packs: [{ x: 1040, y: 340 }],
    bossX: 1700,
    boss: {
      kind: "charge",
      hp: 60, // 90 -> 60 with SET_0 (equal-ceiling; see SET_0's note)
      attacks: [
        { tellF: 30, activeF: 10, recoverF: 26, dmg: 8 },
        { tellF: 34, activeF: 6, recoverF: 30, dmg: 7 },
        { tellF: 42, activeF: 90, recoverF: 20, dmg: 10 },
      ],
      vulnF: 70,
      vulnEvery: 3,
      gapF: 55,
    },
  },
  {
    name: "THE PINES",
    w: 1920,
    skin: "forest",
    roamers: [
      { kind: "harass", x: 470, y: 350 },
      { kind: "grunt", x: 1060, y: 290 },
    ],
    fights: [
      {
        triggerX: 500,
        lockCamX: 220,
        doors: [[790, 252]],
        waves: [
          {
            spawns: [
              { kind: "harass", entry: "R", delayF: 0, y: 320 },
              { kind: "harass", entry: "L", delayF: 15, y: 290 },
              { kind: "thrower", entry: "L", delayF: 35, y: 350 },
            ],
          },
          {
            spawns: [
              { kind: "charger", entry: "R", delayF: 0, y: 330 },
              { kind: "grunt", entry: "door", door: 0, delayF: 25, y: 300 },
              { kind: "pgrunt", entry: "L", delayF: 30, y: 340 },
            ],
          },
        ],
      },
      {
        triggerX: 1000,
        lockCamX: 720,
        doors: [[1290, 252]],
        waves: [
          {
            spawns: [
              { kind: "blocker", entry: "L", delayF: 0, y: 300 },
              { kind: "bomber", entry: "R", delayF: 20, y: 340 },
              { kind: "harass", entry: "door", door: 0, delayF: 35, y: 290 },
            ],
          },
          {
            spawns: [
              { kind: "grunt", entry: "R", delayF: 0, y: 320 },
              { kind: "grunt", entry: "L", delayF: 15, y: 290 },
              { kind: "bthrower", entry: "L", delayF: 25, y: 350 },
            ],
          },
        ],
      },
      {
        triggerX: 1450,
        lockCamX: 1280,
        doors: [[1860, 252]],
        waves: [
          {
            spawns: [
              { kind: "charger", entry: "L", delayF: 0, y: 330 },
              { kind: "thrower", entry: "R", delayF: 15, y: 350 },
              { kind: "grunt", entry: "door", door: 0, delayF: 40, y: 300 },
            ],
          },
          {
            spawns: [
              { kind: "blocker", entry: "R", delayF: 0, y: 340 },
              { kind: "harass", entry: "L", delayF: 20, y: 300 },
              { kind: "pgrunt", entry: "door", door: 0, delayF: 40, y: 330 },
            ],
          },
        ],
      },
    ],
    packs: [{ x: 1150, y: 300 }],
    bossX: 1750,
    boss: {
      kind: "limbs",
      hp: 110,
      attacks: [
        { tellF: 32, activeF: 8, recoverF: 26, dmg: 9 },
        { tellF: 36, activeF: 60, recoverF: 24, dmg: 10 },
        { tellF: 30, activeF: 10, recoverF: 24, dmg: 8 },
      ],
      vulnF: 70,
      vulnEvery: 3,
      gapF: 50,
    },
  },
  {
    name: "THE FOUNDRY",
    w: 1920,
    skin: "facility",
    roamers: [
      { kind: "grunt", x: 420, y: 350 },
      { kind: "thrower", x: 1260, y: 330 },
    ],
    fights: [
      {
        triggerX: 480,
        lockCamX: 200,
        doors: [[720, 252]],
        waves: [
          {
            spawns: [
              { kind: "grunt", entry: "R", delayF: 0, y: 330 },
              { kind: "blocker", entry: "L", delayF: 15, y: 300 },
              { kind: "harass", entry: "door", door: 0, delayF: 25, y: 340 },
            ],
          },
          {
            spawns: [
              { kind: "charger", entry: "R", delayF: 0, y: 310 },
              { kind: "bomber", entry: "L", delayF: 25, y: 340 },
              { kind: "bthrower", entry: "door", door: 0, delayF: 35, y: 300 },
            ],
          },
        ],
      },
      {
        triggerX: 980,
        lockCamX: 700,
        doors: [
          [1300, 252],
          [750, 252],
        ],
        waves: [
          {
            spawns: [
              { kind: "harass", entry: "R", delayF: 0, y: 300 },
              { kind: "harass", entry: "L", delayF: 15, y: 350 },
              { kind: "thrower", entry: "door", door: 0, delayF: 30, y: 300 },
            ],
          },
          {
            spawns: [
              { kind: "pgrunt", entry: "door", door: 1, delayF: 0, y: 330 },
              { kind: "grunt", entry: "L", delayF: 20, y: 300 },
              { kind: "charger", entry: "R", delayF: 30, y: 330 },
            ],
          },
        ],
      },
      {
        triggerX: 1430,
        lockCamX: 1280,
        doors: [[1660, 252]],
        waves: [
          {
            spawns: [
              { kind: "blocker", entry: "R", delayF: 0, y: 300 },
              { kind: "bomber", entry: "door", door: 0, delayF: 15, y: 320 },
              { kind: "thrower", entry: "L", delayF: 15, y: 340 },
            ],
          },
          {
            spawns: [
              { kind: "charger", entry: "L", delayF: 0, y: 340 },
              { kind: "grunt", entry: "R", delayF: 15, y: 320 },
              { kind: "harass", entry: "door", door: 0, delayF: 35, y: 290 },
            ],
          },
        ],
      },
    ],
    packs: [{ x: 1185, y: 330 }],
    bossX: 1760,
    boss: {
      kind: "warp",
      hp: 130,
      attacks: [
        { tellF: 34, activeF: 8, recoverF: 24, dmg: 9 },
        { tellF: 30, activeF: 14, recoverF: 22, dmg: 10 },
        { tellF: 38, activeF: 10, recoverF: 26, dmg: 9 },
      ],
      vulnF: 100,
      vulnEvery: 3,
      gapF: 46,
      anchors: [
        [1360, 310],
        [1860, 310],
        [1440, 380],
        [1780, 380],
      ],
    },
  },
];

export const LEVEL_SETS: LevelSet[] = [SET_0, SET_1];

// ── THE ENDLESS ARENA (one locked screen; cycles these 4, escalating) ──────
// No doors in the arena - a locked screen has edges, and the escalation is
// the pressure. Exactly 4 waves, <= 6 spawns each, validator-asserted.
export const ARENA_WAVES: WaveDef[] = [
  {
    spawns: [
      { kind: "grunt", entry: "L", delayF: 0, y: 300 },
      { kind: "grunt", entry: "R", delayF: 15, y: 350 },
      { kind: "harass", entry: "R", delayF: 30, y: 320 },
    ],
  },
  {
    spawns: [
      { kind: "thrower", entry: "L", delayF: 0, y: 290 },
      { kind: "blocker", entry: "R", delayF: 15, y: 330 },
      { kind: "harass", entry: "L", delayF: 30, y: 350 },
      { kind: "pgrunt", entry: "R", delayF: 45, y: 310 },
    ],
  },
  {
    spawns: [
      { kind: "bomber", entry: "L", delayF: 0, y: 300 },
      { kind: "charger", entry: "R", delayF: 15, y: 320 },
      { kind: "grunt", entry: "L", delayF: 30, y: 350 },
      { kind: "bthrower", entry: "R", delayF: 45, y: 290 },
    ],
  },
  {
    spawns: [
      { kind: "blocker", entry: "L", delayF: 0, y: 320 },
      { kind: "charger", entry: "L", delayF: 20, y: 330 },
      { kind: "thrower", entry: "R", delayF: 10, y: 300 },
      { kind: "harass", entry: "R", delayF: 35, y: 350 },
      { kind: "grunt", entry: "R", delayF: 50, y: 320 },
    ],
  },
];

export function levelSetForSeed(hash: number): LevelSet {
  const n = LEVEL_SETS.length;
  return LEVEL_SETS[((hash % n) + n) % n];
}

// ── the validator ──────────────────────────────────────────────────────────

const WEAPON_CARRIERS: EnemyKind[] = ["pgrunt", "bthrower"];
const MELEE_ROAMERS: EnemyKind[] = ["grunt", "pgrunt", "harass"];
const EXPECTED_FIGHTS = [2, 3, 3];
const EXPECTED_BOSS = [
  { kind: "charge", hp: 60 }, // 90 -> 60, 2026-08-17 (see SET_0's boss note)
  { kind: "limbs", hp: 110 },
  { kind: "warp", hp: 130 },
] as const;

/** The equal-ceiling signature: everything that prices the level. Entry
 * sides, doors, delays and y are deliberately EXCLUDED - those are the
 * degrees of freedom sets may use. */
function levelSignature(l: LevelDef): string {
  const waves = l.fights.map((f) =>
    f.waves.map((w) => w.spawns.map((sp) => sp.kind).sort().join(",")).join("|"),
  );
  const roamers = l.roamers.map((r) => r.kind).sort().join(",");
  const b = l.boss;
  const boss =
    `${b.kind}:${b.hp}:` +
    b.attacks.map((a) => `${a.tellF}/${a.activeF}/${a.recoverF}/${a.dmg}`).join(";") +
    `:v${b.vulnF}:e${b.vulnEvery}:g${b.gapF}:a${b.anchors ? b.anchors.length : 0}`;
  // pack COUNT prices the level (heal is one shared constant); placement is
  // a degree of freedom like doors/delays/y
  return `w${l.w} fights[${waves.join(" ")}] roam[${roamers}] packs${l.packs.length} boss[${boss}]`;
}

/** Returns human-readable violations; the harness adapter's rate() throws
 * on any. Rules (hour-0 freeze): equal-ceiling signatures across sets;
 * L1 AFK executioner roamer (melee kind, 200-600px from spawn, active
 * frame 0); door spawns >= MIN_SPAWN_DIST from the standing point; doors
 * on the walkable band; health packs 1..2 per level, on the band, off the
 * spawn apron and never inside the boss screen; tell floors incl. boss + charge; variety law
 * (>=4 archetypes per level, both entry sides used, >=1 weapon carrier
 * per level, arena >=4 archetypes); triggerX increasing, lockCamX in
 * range, bossX past the last fight; arena exactly 4 waves of <=6 spawns. */
export function validateLevels(): string[] {
  const errs: string[] = [];
  if (LEVEL_SETS.length < 2) {
    errs.push(`need >= 2 authored sets, have ${LEVEL_SETS.length}`);
    return errs;
  }

  // tell floors on the one stat table the sim itself runs
  for (const kind of Object.keys(EN_STATS) as EnemyKind[]) {
    const st = EN_STATS[kind];
    if (st.windupF < TELL_FLOOR_F)
      errs.push(`EN_STATS.${kind}.windupF ${st.windupF} < TELL_FLOOR_F ${TELL_FLOOR_F}`);
  }
  if (EN_STATS.charger.windupF < CHARGE_TELL_F)
    errs.push(`EN_STATS.charger.windupF ${EN_STATS.charger.windupF} < CHARGE_TELL_F ${CHARGE_TELL_F}`);

  // equal-ceiling signatures across sets, per slot
  for (let slot = 0; slot < 3; slot++) {
    const sig0 = levelSignature(LEVEL_SETS[0][slot]);
    for (let si = 1; si < LEVEL_SETS.length; si++) {
      const sig = levelSignature(LEVEL_SETS[si][slot]);
      if (sig !== sig0)
        errs.push(`equal-ceiling broken: set ${si} level ${slot} signature\n      ${sig}\n    != set 0's\n      ${sig0}`);
    }
  }

  for (let si = 0; si < LEVEL_SETS.length; si++) {
    const set = LEVEL_SETS[si];
    if (set.length !== 3) {
      errs.push(`set ${si}: needs exactly 3 levels`);
      continue;
    }
    for (let li = 0; li < 3; li++) {
      const l = set[li];
      const tag = `set ${si} level ${li} (${l.name})`;

      // fight counts + boss numbers per the locked plan
      if (l.fights.length !== EXPECTED_FIGHTS[li])
        errs.push(`${tag}: ${l.fights.length} fights, plan locks ${EXPECTED_FIGHTS[li]}`);
      const eb = EXPECTED_BOSS[li];
      if (l.boss.kind !== eb.kind || l.boss.hp !== eb.hp)
        errs.push(`${tag}: boss ${l.boss.kind}/${l.boss.hp}hp, plan locks ${eb.kind}/${eb.hp}hp`);
      if (l.boss.attacks.length !== 3) errs.push(`${tag}: boss needs exactly 3 attacks`);
      if (l.boss.vulnF < 60) errs.push(`${tag}: boss vulnF ${l.boss.vulnF} < 60`);
      for (let ai = 0; ai < l.boss.attacks.length; ai++) {
        if (l.boss.attacks[ai].tellF < BOSS_TELL_FLOOR_F)
          errs.push(`${tag}: boss attack ${ai} tellF ${l.boss.attacks[ai].tellF} < BOSS_TELL_FLOOR_F ${BOSS_TELL_FLOOR_F}`);
      }
      if (l.boss.kind === "charge" && l.boss.attacks[2].tellF < CHARGE_TELL_F)
        errs.push(`${tag}: charge boss lane charge tellF ${l.boss.attacks[2].tellF} < CHARGE_TELL_F ${CHARGE_TELL_F}`);
      if (l.boss.kind === "warp") {
        const anchors = l.boss.anchors ?? [];
        if (anchors.length !== 4) errs.push(`${tag}: warp boss needs exactly 4 anchors`);
        for (const [ax, ay] of anchors) {
          if (ax < l.w - SCREEN_W + 20 || ax > l.w - 20)
            errs.push(`${tag}: warp anchor x ${ax} outside the boss screen [${l.w - SCREEN_W + 20}, ${l.w - 20}]`);
          if (ay < BAND_TOP || ay > BAND_BOT) errs.push(`${tag}: warp anchor y ${ay} off the band`);
        }
      }

      // L1 AFK executioner
      if (li === 0) {
        const exec = l.roamers.find((r) => {
          const d = r.x - SPAWN_X;
          return MELEE_ROAMERS.includes(r.kind) && d >= 200 && d <= 600;
        });
        if (!exec) errs.push(`${tag}: no melee AFK-executioner roamer 200-600px right of spawn (${SPAWN_X},${SPAWN_Y})`);
      }
      for (const r of l.roamers) {
        if (r.y < BAND_TOP || r.y > BAND_BOT) errs.push(`${tag}: roamer ${r.kind} y ${r.y} off the band`);
        if (r.x < 20 || r.x > l.w - 20) errs.push(`${tag}: roamer ${r.kind} x ${r.x} out of world`);
      }

      // health packs: the odd one, on the band, reachable, NEVER in the boss
      // screen (a boss-fight heal changes the boss math) and past the spawn
      // apron (an AFK pilot must never stand on a heal)
      if (l.packs.length < 1 || l.packs.length > 2)
        errs.push(`${tag}: ${l.packs.length} health packs, the odd-one law wants 1..2`);
      for (const hk of l.packs) {
        if (hk.y < BAND_TOP || hk.y > BAND_BOT) errs.push(`${tag}: health pack y ${hk.y} off the band`);
        if (hk.x < SPAWN_X + 110) errs.push(`${tag}: health pack x ${hk.x} on the spawn apron (< ${SPAWN_X + 110})`);
        if (hk.x > l.w - SCREEN_W)
          errs.push(`${tag}: health pack x ${hk.x} inside the boss screen [${l.w - SCREEN_W}, ${l.w}]`);
      }

      // fights: geometry, doors, spawns
      let lastTrig = -Infinity;
      const kinds = new Set<EnemyKind>(l.roamers.map((r) => r.kind));
      let sawL = false;
      let sawR = false;
      let carriers = l.roamers.filter((r) => WEAPON_CARRIERS.includes(r.kind)).length;
      for (let fi = 0; fi < l.fights.length; fi++) {
        const f = l.fights[fi];
        const ftag = `${tag} fight ${fi}`;
        if (f.triggerX <= lastTrig) errs.push(`${ftag}: triggerX ${f.triggerX} not strictly increasing`);
        lastTrig = f.triggerX;
        if (f.lockCamX < 0 || f.lockCamX > l.w - SCREEN_W)
          errs.push(`${ftag}: lockCamX ${f.lockCamX} outside [0, ${l.w - SCREEN_W}]`);
        if (f.waves.length < 1 || f.waves.length > 3) errs.push(`${ftag}: ${f.waves.length} waves (1..3)`);
        for (let di = 0; di < f.doors.length; di++) {
          const [dx, dy] = f.doors[di];
          const dist = Math.hypot(dx - f.triggerX, dy - SPAWN_Y);
          if (dist < MIN_SPAWN_DIST)
            errs.push(`${ftag} door ${di}: ${Math.round(dist)}px from the standing point (${f.triggerX},${SPAWN_Y}) < ${MIN_SPAWN_DIST}`);
          if (dy < BAND_TOP || dy > BAND_BOT) errs.push(`${ftag} door ${di}: y ${dy} off the band`);
          if (dx < f.lockCamX || dx > f.lockCamX + SCREEN_W)
            errs.push(`${ftag} door ${di}: x ${dx} outside the locked screen [${f.lockCamX}, ${f.lockCamX + SCREEN_W}]`);
        }
        for (const w of f.waves) {
          if (w.spawns.length < 1 || w.spawns.length > 6) errs.push(`${ftag}: wave with ${w.spawns.length} spawns (1..6)`);
          for (const sp of w.spawns) {
            kinds.add(sp.kind);
            if (WEAPON_CARRIERS.includes(sp.kind)) carriers++;
            if (sp.entry === "L") sawL = true;
            if (sp.entry === "R") sawR = true;
            if (sp.entry === "door" && (sp.door == null || sp.door < 0 || sp.door >= f.doors.length))
              errs.push(`${ftag}: door spawn references door ${sp.door} of ${f.doors.length}`);
            if (sp.y < BAND_TOP || sp.y > BAND_BOT) errs.push(`${ftag}: spawn ${sp.kind} y ${sp.y} off the band`);
            if (sp.delayF < 0) errs.push(`${ftag}: spawn ${sp.kind} negative delayF`);
          }
        }
      }
      if (l.bossX <= lastTrig) errs.push(`${tag}: bossX ${l.bossX} not past the last fight trigger ${lastTrig}`);
      if (l.bossX > l.w - 60) errs.push(`${tag}: bossX ${l.bossX} too close to the world edge ${l.w}`);

      // the variety law
      if (kinds.size < 4) errs.push(`${tag}: only ${kinds.size} archetypes, variety law wants >= 4`);
      if (!sawL || !sawR) errs.push(`${tag}: entries use ${sawL ? "" : "no L"}${!sawL && !sawR ? " and " : ""}${sawR ? "" : "no R"} side`);
      if (carriers < 1) errs.push(`${tag}: no weapon carrier (pgrunt/bthrower)`);
    }
  }

  // arena
  if (ARENA_WAVES.length !== 4) errs.push(`arena: ${ARENA_WAVES.length} waves, plan locks exactly 4`);
  const arenaKinds = new Set<EnemyKind>();
  for (let wi = 0; wi < ARENA_WAVES.length; wi++) {
    const w = ARENA_WAVES[wi];
    if (w.spawns.length > 6) errs.push(`arena wave ${wi}: ${w.spawns.length} spawns > 6`);
    for (const sp of w.spawns) {
      arenaKinds.add(sp.kind);
      if (sp.entry === "door") errs.push(`arena wave ${wi}: door entry in a doorless arena`);
      if (sp.y < BAND_TOP || sp.y > BAND_BOT) errs.push(`arena wave ${wi}: spawn ${sp.kind} y ${sp.y} off the band`);
    }
  }
  if (arenaKinds.size < 4) errs.push(`arena: only ${arenaKinds.size} archetypes, variety law wants >= 4`);

  return errs;
}
