/**
 * HORDE CONTENT - every authored table the sim selects from. The seed
 * SELECTS, it never DESIGNS (the S5/S6 law carried whole): room chunks, wave
 * escalation sets, class kits, drop tables are all hand-written here; sim.ts
 * only ever indexes into them with a forked stream.
 *
 * LAWS THIS FILE CARRIES:
 *  - ROOMS ARE AUTHORED CHUNKS. A chunk is a fixed 960x640 layout: wall
 *    rects, a hero spawn, enemy spawn points, chest spots, one exit. The
 *    seed picks WHICH chunk and WHICH wave set a room uses - one draw each,
 *    pure selection, rngFork(seed, "map", "roomN").
 *  - SPAWN GEOMETRY IS VALIDATED. Every hero spawn / enemy spawn / chest
 *    spot keeps SPAWN_CLEAR px of clearance from every wall, so a body can
 *    never materialize inside (or wedged against) a wall and soft-lock the
 *    wave clear. The exit column is clear in every chunk. Executable law.
 *  - DEPTH 0 IS THE AFK GATE. The gate band has one wave set and its first
 *    wave carries >= 3 bodies, so an idle hero standing in spawn is swarmed
 *    and dead on contact damage alone - no cower mechanic. Validated.
 *  - KITS ARE DATA. A class kit is {mana cost, cooldown, swing cadence and
 *    reach, a 5-entry dice ladder, a 5-entry area ladder, a shape tag}. The
 *    sim interprets the shape; nothing here is code. Casters pay for their
 *    spell with a slower, shorter melee swing - the weakness is authored in
 *    the cadence columns, never by touching derive()'s weapon dice.
 *  - XP LIVES IN THE BESTIARY, NOT HERE. Wave rows are bestiary ids; the
 *    kill's score value comes from core.ts and is never restated. Drops pay
 *    potions and run-local tiers - SURVIVAL and SPEED, never score
 *    (ceiling-neutrality, ADR-0070 lineage).
 */

import {
  d,
  statblock,
  CLASS_IDS,
  type ClassId,
  type DiceSpec,
  type LootEntry,
} from "../_shared/rules/core";

// ── room geometry ───────────────────────────────────────────────────────────

export const ROOM_W = 960; // px, the authored chunk canvas
export const ROOM_H = 640;
export const ENEMY_CAP = 40; // live bodies, perf law
export const SPAWN_CLEAR = 56; // px clearance every authored point keeps from walls

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Pt = readonly [number, number];

export interface RoomChunk {
  id: string;
  walls: readonly Rect[];
  heroSpawn: Pt;
  spawnPts: readonly Pt[]; // enemy entry points, cycled by wave slot
  chestSpots: readonly Pt[];
  exit: Rect; // opens when the room's waves are cleared
}

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Every chunk keeps the same hero spawn (left-mid) and exit (right-mid) so
 * room-to-room flow always reads left-to-right; the walls between are the
 * variety. Six authored layouts. */
export const CHUNKS: readonly RoomChunk[] = [
  {
    id: "cryptHall",
    walls: [R(240, 240, 80, 160), R(640, 240, 80, 160)],
    heroSpawn: [96, 320],
    spawnPts: [[864, 80], [864, 560], [480, 64], [480, 576]],
    chestSpots: [[480, 320]],
    exit: R(912, 272, 48, 96),
  },
  {
    id: "pillarField",
    walls: [R(192, 160, 64, 64), R(192, 416, 64, 64), R(448, 288, 64, 64), R(704, 160, 64, 64), R(704, 416, 64, 64)],
    heroSpawn: [96, 320],
    spawnPts: [[864, 96], [864, 544], [480, 64], [480, 576]],
    chestSpots: [[256, 320]],
    exit: R(912, 272, 48, 96),
  },
  {
    id: "longCorridor",
    walls: [R(160, 144, 640, 48), R(160, 448, 640, 48)],
    heroSpawn: [96, 320],
    spawnPts: [[880, 96], [880, 544], [480, 320], [80, 560]],
    chestSpots: [[480, 64]],
    exit: R(912, 272, 48, 96),
  },
  {
    id: "boneCross",
    walls: [R(432, 192, 96, 256), R(336, 288, 288, 64)],
    heroSpawn: [96, 320],
    spawnPts: [[128, 96], [832, 96], [128, 544], [832, 544]],
    chestSpots: [[480, 96]],
    exit: R(912, 272, 48, 96),
  },
  {
    id: "catacombDoor",
    walls: [R(460, 0, 40, 256), R(460, 384, 40, 256)],
    heroSpawn: [96, 320],
    spawnPts: [[864, 160], [864, 480], [672, 320], [576, 64]],
    chestSpots: [[240, 160]],
    exit: R(912, 272, 48, 96),
  },
  {
    id: "boneArena",
    walls: [R(128, 128, 96, 96), R(736, 128, 96, 96), R(128, 416, 96, 96), R(736, 416, 96, 96)],
    heroSpawn: [96, 320],
    spawnPts: [[480, 64], [480, 576], [864, 320], [480, 320]],
    chestSpots: [[480, 128], [480, 512]],
    exit: R(912, 272, 48, 96),
  },
] as const;

// ── class kits ──────────────────────────────────────────────────────────────

export type SkillShape = "nova" | "dash" | "line" | "wave" | "blast" | "smite";

/** The whole kit is data. dice/area index by RUN spell tier 0..4 (the
 * in-run upgrade ladder); cost is mana; cdF/swingCdF are frame timers;
 * swingRange is the melee arc reach in px. Caster weakness = slower swing,
 * shorter reach - derive()'s weapon dice are never edited here. */
export interface ClassKit {
  skillName: string;
  cost: number;      // mana per cast (the discipline the potions feed)
  cdF: number;       // skill cooldown, frames
  swingCdF: number;  // melee cadence, frames
  swingRange: number; // melee arc reach, px
  shape: SkillShape;
  dice: readonly DiceSpec[]; // [tier0..tier4]
  area: readonly number[];   // px: radius (nova/wave/blast/smite), dash length, line length
}

export const KITS: Readonly<Record<ClassId, ClassKit>> = {
  barbarian: {
    skillName: "Whirlwind", cost: 12, cdF: 150, swingCdF: 26, swingRange: 88, shape: "nova",
    dice: [d(2, 8), d(2, 8, 2), d(3, 8, 2), d(3, 8, 4), d(4, 8, 4)],
    area: [110, 125, 140, 155, 170],
  },
  monk: {
    skillName: "Dash Strike", cost: 10, cdF: 120, swingCdF: 20, swingRange: 78, shape: "dash",
    dice: [d(2, 6), d(2, 6, 2), d(3, 6, 2), d(3, 6, 4), d(4, 6, 4)],
    area: [180, 200, 220, 240, 260], // dash length
  },
  ranger: {
    skillName: "Piercing Volley", cost: 12, cdF: 130, swingCdF: 26, swingRange: 84, shape: "line",
    dice: [d(2, 6), d(2, 6, 2), d(3, 6, 2), d(3, 6, 4), d(4, 6, 4)],
    area: [280, 305, 330, 355, 380], // corridor length
  },
  // bard + wizard retuned 2026-08-25 (balance gate f2 with skill-aware bots:
  // both kits were being SPENT and still finished bottom by 3-5x - kit
  // numbers, not bot artifact). Bard's wave gains the standard dice ladder and
  // sheds 2 mana; wizard's blast radius grows to clear space around a glass
  // hero (his survival IS the kill) and his staff stops being suicidal.
  bard: {
    skillName: "Resonance Wave", cost: 12, cdF: 140, swingCdF: 28, swingRange: 80, shape: "wave",
    dice: [d(2, 6), d(2, 6, 2), d(3, 6, 2), d(3, 6, 4), d(4, 6, 4)],
    area: [130, 145, 160, 175, 190],
  },
  wizard: {
    skillName: "Arcane Blast", cost: 14, cdF: 110, swingCdF: 30, swingRange: 80, shape: "blast",
    dice: [d(3, 6), d(3, 6, 2), d(4, 6, 2), d(4, 6, 4), d(5, 6, 4)],
    area: [130, 150, 170, 190, 210],
  },
  cleric: {
    skillName: "Smite Nova", cost: 14, cdF: 150, swingCdF: 30, swingRange: 82, shape: "smite",
    dice: [d(2, 6), d(2, 6, 2), d(3, 6, 2), d(3, 6, 4), d(4, 6, 4)],
    area: [120, 134, 148, 162, 176],
  },
};

// ── in-run upgrades ─────────────────────────────────────────────────────────

export const WEAPON_TIER_MAX = 4;
export const SPELL_TIER_MAX = 4;

/** Run weapon tier steps the SWING dice on top of whatever derive() handed
 * over from the store gear - same stepping voice as derive's gear steps:
 * +1 die every 2 tiers, +1 flat per tier. Run-local, dies with the run. */
export function stepWeaponDice(base: DiceSpec, tier: number): DiceSpec {
  const t = Math.max(0, Math.min(WEAPON_TIER_MAX, tier | 0));
  return d(base.count + (t >> 1), base.sides, base.bonus + t);
}

// ── drops ───────────────────────────────────────────────────────────────────

export const ITEM_KINDS: readonly string[] = ["nothing", "hpPot", "mpPot", "wpnUp", "splUp"];

/** Trash kills: mostly nothing, an even split of potions when it pays.
 * ~22% at horde kill volume keeps the floor routing loop alive without
 * flooding the 3-slot belts. */
export const DROP_TRASH: readonly LootEntry[] = [
  { item: "nothing", weight: 78 },
  { item: "hpPot", weight: 11 },
  { item: "mpPot", weight: 11 },
];

/** Elites ALWAYS pay: half potions, half the Diablo beam moment. */
export const DROP_ELITE: readonly LootEntry[] = [
  { item: "hpPot", weight: 3 },
  { item: "mpPot", weight: 3 },
  { item: "wpnUp", weight: 3 },
  { item: "splUp", weight: 3 },
];

/** Chests never come up empty. */
export const CHEST_TABLE: readonly LootEntry[] = [
  { item: "hpPot", weight: 30 },
  { item: "mpPot", weight: 30 },
  { item: "wpnUp", weight: 20 },
  { item: "splUp", weight: 20 },
];

/** The heavies: their loot stream rolls DROP_ELITE. */
export const ELITE_IDS: readonly string[] = ["wight", "specter", "necromancer", "boneKnight", "wraith", "boneDragon"];

// ── wave escalation ─────────────────────────────────────────────────────────

/** Depth band: 0 = the gate room, then early / mid / deep / abyss
 * (same band edges as the other S7 games). */
export function hordeBand(depth: number): number {
  if (depth <= 0) return 0;
  if (depth <= 2) return 1;
  if (depth <= 5) return 2;
  if (depth <= 9) return 3;
  return 4;
}

export type WaveRow = readonly (readonly [string, number])[]; // [bestiaryId, count]
export type WaveSet = readonly WaveRow[];

/** Room N picks ONE set from its band via rngFork(seed, "map", "wavesN").
 * Statblocks scale by DEPTH via scaleStatblock; xp per kill never moves. */
export const WAVE_SETS: readonly (readonly WaveSet[])[] = [
  // band 0 - the gate room: one set, first wave 4 bodies (the AFK law),
  // zombie-led so the first fight is slow and kiteable while learning
  // (xp-neutral vs the skeleton-led mix: both waves stay 200)
  [
    [
      [["zombie", 3], ["skeleton", 1]],
      [["zombie", 2], ["skeleton", 1]],
    ],
  ],
  // band 1 - depths 1-2: numbers, first archers, first ghouls; every set's
  // opener leads with zombies (xp-equal swaps - danger arrives from band 2)
  [
    [
      [["zombie", 2], ["skeleton", 1]],
      [["zombie", 4]],
      [["ghoul", 1], ["zombie", 2]],
    ],
    [
      [["zombie", 2], ["boneArcher", 1]],
      [["zombie", 4]],
      [["ghoul", 1], ["zombie", 2]],
    ],
    [
      [["zombie", 2], ["skeleton", 2]],
      [["boneArcher", 1], ["zombie", 2]],
      [["ghoul", 1], ["zombie", 2]],
    ],
  ],
  // band 2 - depths 3-5: the first elites walk in
  [
    [
      [["skeleton", 4], ["boneArcher", 1]],
      [["ghoul", 2], ["zombie", 2]],
      [["wight", 1], ["skeleton", 2]],
    ],
    [
      [["zombie", 4], ["boneArcher", 2]],
      [["specter", 1], ["skeleton", 2]],
      [["necromancer", 1], ["zombie", 2]],
    ],
    [
      [["ghoul", 3]],
      [["boneArcher", 2], ["skeleton", 3]],
      [["wight", 1], ["ghoul", 1]],
    ],
  ],
  // band 3 - depths 6-9: knights and the first wraith
  [
    [
      [["skeleton", 5], ["boneArcher", 2]],
      [["wight", 1], ["ghoul", 2], ["zombie", 2]],
      [["boneKnight", 1], ["skeleton", 3]],
    ],
    [
      [["zombie", 5], ["specter", 1]],
      [["necromancer", 1], ["ghoul", 2]],
      [["wraith", 1], ["skeleton", 2]],
    ],
    [
      [["ghoul", 3], ["boneArcher", 2]],
      [["boneKnight", 1], ["zombie", 3]],
      [["necromancer", 1], ["specter", 1], ["skeleton", 2]],
    ],
  ],
  // band 4 - depths 10+: the abyss cycles; the dragon set is the book's
  // richest wave (MAX_WAVE_XP leans on it - validated below)
  [
    [
      [["skeleton", 6], ["ghoul", 2]],
      [["wraith", 1], ["boneArcher", 3]],
      [["boneKnight", 2], ["zombie", 3]],
    ],
    [
      [["specter", 2], ["ghoul", 3]],
      [["necromancer", 2], ["skeleton", 4]],
      [["wraith", 2], ["skeleton", 2]],
    ],
    [
      [["zombie", 6], ["boneArcher", 2]],
      [["wraith", 1], ["specter", 1], ["ghoul", 2]],
      [["boneDragon", 1], ["ghoul", 2]],
    ],
  ],
];

/** The single richest wave in the book: Bone Dragon + 2 Ghouls. rate() in
 * sim.ts leans on this number - keep them in sync (validated below). */
export const MAX_WAVE_XP = 3100;

// ── validation (the laws, executable) ───────────────────────────────────────

export function validateContent(): void {
  const fail = (msg: string): never => {
    throw new Error(`horde content: ${msg}`);
  };
  const clearOf = (p: Pt, walls: readonly Rect[], margin: number): boolean => {
    for (const w of walls) {
      if (p[0] >= w.x - margin && p[0] <= w.x + w.w + margin && p[1] >= w.y - margin && p[1] <= w.y + w.h + margin) return false;
    }
    return true;
  };
  const inRoom = (p: Pt): boolean => p[0] >= 32 && p[0] <= ROOM_W - 32 && p[1] >= 32 && p[1] <= ROOM_H - 32;

  // chunks: geometry in bounds, every authored point wall-clear (soft-lock law)
  if (CHUNKS.length === 0) fail("no chunks");
  const chunkIds = new Set<string>();
  for (const c of CHUNKS) {
    if (chunkIds.has(c.id)) fail(`duplicate chunk id ${c.id}`);
    chunkIds.add(c.id);
    for (const w of c.walls) {
      if (w.x < 0 || w.y < 0 || w.x + w.w > ROOM_W || w.y + w.h > ROOM_H) fail(`${c.id}: wall out of bounds`);
      if (w.w <= 0 || w.h <= 0) fail(`${c.id}: degenerate wall`);
    }
    if (c.spawnPts.length < 4) fail(`${c.id}: fewer than 4 spawn points`);
    for (const p of [c.heroSpawn, ...c.spawnPts, ...c.chestSpots]) {
      if (!inRoom(p)) fail(`${c.id}: point ${p[0]},${p[1]} outside the room inset`);
      if (!clearOf(p, c.walls, SPAWN_CLEAR)) fail(`${c.id}: point ${p[0]},${p[1]} under ${SPAWN_CLEAR}px from a wall`);
    }
    const e = c.exit;
    if (e.x < 0 || e.y < 0 || e.x + e.w > ROOM_W || e.y + e.h > ROOM_H) fail(`${c.id}: exit out of bounds`);
    const exitCenter: Pt = [e.x + (e.w >> 1), e.y + (e.h >> 1)];
    if (!clearOf(exitCenter, c.walls, 40)) fail(`${c.id}: exit center walled off`);
  }

  // kits: complete ladders for every class, sane cadence
  for (const cls of CLASS_IDS) {
    const k = KITS[cls];
    if (!k) fail(`${cls}: no kit`);
    if (k.dice.length !== SPELL_TIER_MAX + 1) fail(`${cls}: dice ladder is ${k.dice.length}, want ${SPELL_TIER_MAX + 1}`);
    if (k.area.length !== SPELL_TIER_MAX + 1) fail(`${cls}: area ladder is ${k.area.length}`);
    for (const spec of k.dice) if (spec.count < 1 || spec.sides < 2) fail(`${cls}: degenerate dice`);
    for (let i = 1; i < k.area.length; i++) if (k.area[i] <= k.area[i - 1]) fail(`${cls}: area ladder not ascending`);
    if (k.cost < 1) fail(`${cls}: free skill`);
    if (k.cdF < 30) fail(`${cls}: skill cd under half a second`);
    if (k.swingCdF < 10 || k.swingCdF > 60) fail(`${cls}: swing cadence ${k.swingCdF} out of 10..60`);
    if (k.swingRange < 40 || k.swingRange > 120) fail(`${cls}: swing range ${k.swingRange} out of 40..120`);
  }

  // drops: known kinds, positive weights; chests never pay nothing
  for (const [name, table] of [["trash", DROP_TRASH], ["elite", DROP_ELITE], ["chest", CHEST_TABLE]] as const) {
    if (table.length === 0) fail(`${name} table empty`);
    for (const e of table) {
      if (!ITEM_KINDS.includes(e.item)) fail(`${name} table: unknown item ${e.item}`);
      if (e.weight <= 0) fail(`${name} table: non-positive weight on ${e.item}`);
    }
  }
  if (CHEST_TABLE.some((e) => e.item === "nothing")) fail("chest table pays nothing");
  if (!DROP_ELITE.some((e) => e.item === "wpnUp") || !DROP_ELITE.some((e) => e.item === "splUp")) fail("elite table missing upgrades");
  for (const id of ELITE_IDS) statblock(id); // throws on a bad id

  // waves: every id real, first gate wave >= 3 bodies, caps respected,
  // MAX_WAVE_XP is the tables' truth
  if (WAVE_SETS.length !== 5) fail(`want 5 bands, got ${WAVE_SETS.length}`);
  if (hordeBand(0) !== 0 || hordeBand(3) !== 2 || hordeBand(99) !== 4) fail("hordeBand edges drifted");
  let maxXp = 0;
  for (let b = 0; b < WAVE_SETS.length; b++) {
    const band = WAVE_SETS[b];
    if (band.length === 0) fail(`band ${b}: no wave sets`);
    for (const set of band) {
      if (set.length < 2 || set.length > 4) fail(`band ${b}: set has ${set.length} waves, want 2..4`);
      for (let w = 0; w < set.length; w++) {
        let bodies = 0;
        let xp = 0;
        for (const [id, n] of set[w]) {
          if (n < 1) fail(`band ${b}: non-positive count for ${id}`);
          statblock(id); // throws on a bad id
          bodies += n;
          xp += statblock(id).xp * n;
        }
        if (bodies < 1 || bodies > 12) fail(`band ${b}: wave of ${bodies} bodies out of 1..12`);
        if (bodies > ENEMY_CAP) fail(`band ${b}: wave over the live cap`);
        if (xp > maxXp) maxXp = xp;
        if (b === 0 && w === 0 && bodies < 3) fail(`gate band first wave has ${bodies} bodies (AFK lethality law)`);
      }
    }
  }
  if (maxXp !== MAX_WAVE_XP) fail(`MAX_WAVE_XP drifted: tables say ${maxXp}, constant says ${MAX_WAVE_XP}`);
}
