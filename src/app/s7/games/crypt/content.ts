/**
 * CRYPT CONTENT - the authored book for the S7 grid crawler (the Legend of
 * Grimrock / Eye of the Beholder mirror). Everything the seed may pick from
 * lives HERE, hand-authored: floor chunks, encounter bands, loot tables and
 * class kits. SEED SELECTS, NEVER GENERATES (house law): sim.ts draws an
 * index into these tables and nothing else - no procedural layout, ever.
 *
 * THE DUEL_BOOK (2026-08-28, CRYPT DUELS): combat is one-on-one duels now,
 * and every creature's fight is an authored strike table here - style
 * (light/heavy/feint), required dodge side, gap/tell/recover cadence, the
 * punish window a won read opens, and the strike's damage multiplier. The
 * sim compresses gapF/tellF by the (scaled) statblock speed at runtime;
 * recoverF/punishF are authored raw - depth quickens the threat, never
 * shrinks the reward window. DUEL_TELL_FLOOR_F lives HERE (the ironjaw
 * ladders.ts precedent): one source of truth for sim, renderer, validator.
 *
 * validateContent() makes the authoring laws executable (selfcheck gate 0):
 *  - CHUNK_MIN..CHUNK_MAX chunks; every chunk rectangular, full wall border;
 *  - exactly one entry '@' and one stairs '>'; 1-2 chests 'C'; >= 3 spawns 'S';
 *  - stairs, every spawn and every chest BFS-reachable from the entry;
 *  - nearest spawn within AFK_SPAWN_DIST of the entry (the AFK-gate law: an
 *    idle hero must meet the legion fast on EVERY possible floor 0);
 *  - entry->stairs BFS distance >= MIN_STAIR_PATH (rate() honesty: no floor
 *    is ever a two-step teleport to the descent bonus);
 *  - every encounter id resolves in the BESTIARY; the loudest body in the
 *    book equals MAX_TABLE_XP (anchors sim.ts rate() math); loot weights
 *    positive; every class has a kit and every kit number is an int;
 *  - DUEL_BOOK laws: every encounter-used id has an entry; 3-6 strikes;
 *    >= 1 light AND >= 1 heavy each (a duel can never freeze the stall
 *    fingerprint); feints never in band-0 teachers; all strike ints
 *    positive; tellF >= DUEL_TELL_FLOOR_F; punishF >= slowest class
 *    atkCdF + 10 (a won read must pay for EVERY class); band-0 ids keep
 *    every strike's gapF+tellF+recoverF <= BAND0_LOOP_MAX_F with lights at
 *    full damage (the AFK-death cadence bound).
 */

import { BESTIARY, CLASS_IDS, statblock, type ClassId, type LootEntry } from "../_shared/rules/core";

// ── chunk grid ──────────────────────────────────────────────────────────────

export const CHUNK_MIN = 10;
export const CHUNK_MAX = 14;
export const AFK_SPAWN_DIST = 6; // BFS cells, entry -> nearest spawn
export const MIN_STAIR_PATH = 6; // BFS cells, entry -> stairs

export interface Cell {
  x: number;
  y: number;
}

export interface Chunk {
  name: string;
  w: number;
  h: number;
  cells: readonly number[]; // w*h flattened, 1 = wall, 0 = floor
  spawns: readonly Cell[];
  chests: readonly Cell[];
  stairs: Cell;
  entry: Cell;
  facing: number; // hero facing on arrival: 0=N 1=E 2=S 3=W
}

const FACING: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };

interface ChunkDef {
  name: string;
  facing: "N" | "E" | "S" | "W";
  rows: readonly string[];
}

/** Legend: '#' wall, '.' floor, 'S' spawn, 'C' chest, '>' stairs, '@' entry.
 * Every marked cell is also a floor cell. */
function parseChunk(def: ChunkDef): Chunk {
  const h = def.rows.length;
  const w = def.rows[0].length;
  const cells: number[] = new Array(w * h).fill(0);
  const spawns: Cell[] = [];
  const chests: Cell[] = [];
  let stairs: Cell | null = null;
  let entry: Cell | null = null;
  for (let y = 0; y < h; y++) {
    const row = def.rows[y];
    if (row.length !== w) throw new Error(`${def.name}: row ${y} width ${row.length} != ${w}`);
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === "#") {
        cells[y * w + x] = 1;
        continue;
      }
      if (c === "S") spawns.push({ x, y });
      else if (c === "C") chests.push({ x, y });
      else if (c === ">") {
        if (stairs) throw new Error(`${def.name}: two stairs`);
        stairs = { x, y };
      } else if (c === "@") {
        if (entry) throw new Error(`${def.name}: two entries`);
        entry = { x, y };
      } else if (c !== ".") throw new Error(`${def.name}: unknown cell '${c}' at ${x},${y}`);
    }
  }
  if (!stairs) throw new Error(`${def.name}: no stairs`);
  if (!entry) throw new Error(`${def.name}: no entry`);
  return { name: def.name, w, h, cells, spawns, chests, stairs, entry, facing: FACING[def.facing] };
}

/** Twelve authored crypts. Interiors are deliberately open-handed: greedy
 * chasers and greedy players both need workable lines, so walls are accents
 * (pillars, dividers, one ring, one serpentine) - never mazes. */
const CHUNK_DEFS: readonly ChunkDef[] = [
  {
    name: "The Long Hall",
    facing: "E",
    rows: [
      "#############",
      "#@..S.....C.#",
      "#...........#",
      "#..S....#...#",
      "#.......#.S.#",
      "#.........>.#",
      "#############",
    ],
  },
  {
    name: "Pillared Vault",
    facing: "E",
    rows: [
      "###########",
      "#....C....#",
      "#.#.....#.#",
      "#....S....#",
      "#@.S...S.>#",
      "#....S....#",
      "#.#.....#.#",
      "#....C....#",
      "###########",
    ],
  },
  {
    name: "The Ring",
    facing: "E",
    rows: [
      "###########",
      "#@...S....#",
      "#.#######.#",
      "#.#######.#",
      "#.#######.#",
      "#.#######.#",
      "#.........#",
      "#S...>..SC#",
      "###########",
    ],
  },
  {
    name: "Ossuary Rows",
    facing: "E",
    rows: [
      "#############",
      "#@..........#",
      "#.##.##.##..#",
      "#...S...S...#",
      "#.##.##.##..#",
      "#......S...C#",
      "#.##.##.##..#",
      "#..........>#",
      "#############",
    ],
  },
  {
    name: "The Crossing",
    facing: "E",
    rows: [
      "###########",
      "####.S.####",
      "####...####",
      "####.C.####",
      "#@...S...>#",
      "####...####",
      "####.S.####",
      "####...####",
      "###########",
    ],
  },
  {
    name: "Flooded Crypt",
    facing: "S",
    rows: [
      "#############",
      "#.....#.....#",
      "#.@...#..S..#",
      "#.....#.....#",
      "#..#.....#..#",
      "#.....S.....#",
      "#..S.....C..#",
      "#......>....#",
      "#############",
    ],
  },
  {
    name: "The Gallery",
    facing: "E",
    rows: [
      "###############",
      "#@.....C.....S#",
      "#.#.#.#.#.#.#.#",
      "#.............#",
      "#.#.#.#.#.#.#.#",
      "#S.....S.....>#",
      "###############",
    ],
  },
  {
    name: "Twin Chambers",
    facing: "E",
    rows: [
      "#############",
      "#.....#.....#",
      "#.@S..#..S..#",
      "#.....#.....#",
      "#...........#",
      "#.....#..>..#",
      "#.S...#.....#",
      "#C....#..S..#",
      "#############",
    ],
  },
  {
    name: "Serpentine",
    facing: "E",
    rows: [
      "#############",
      "#@....S....S#",
      "#########...#",
      "#...........#",
      "#...#########",
      "#..S......C.#",
      "#########...#",
      "#S.........>#",
      "#############",
    ],
  },
  {
    name: "Broken Chapel",
    facing: "N",
    rows: [
      "###########",
      "#....>....#",
      "#.S.....S.#",
      "#....#....#",
      "#...###...#",
      "#....#....#",
      "#.S.....S.#",
      "#....@..C.#",
      "###########",
    ],
  },
  {
    name: "Catacomb Cells",
    facing: "E",
    rows: [
      "###############",
      "#S..#..C#...S.#",
      "#...#...#.....#",
      "#.............#",
      "#@....S......>#",
      "#.............#",
      "#...#...#.....#",
      "#C..#..S#.....#",
      "###############",
    ],
  },
  {
    name: "The Deep Stair",
    facing: "N",
    rows: [
      "###########",
      "#....>....#",
      "#.#.....#.#",
      "#..C...S..#",
      "#....#....#",
      "#.S..#..S.#",
      "#....#....#",
      "#..S...C..#",
      "#.#.....#.#",
      "#....@....#",
      "###########",
    ],
  },
];

export const CHUNKS: readonly Chunk[] = CHUNK_DEFS.map(parseChunk);

// ── encounter bands ─────────────────────────────────────────────────────────
/** Depth bands of authored enemy rows. The seed picks ONE row per floor;
 * bodies fill the chunk's spawn cells in order (extra names truncate against
 * small chunks - deterministic, documented). Depth banding is the difficulty
 * ramp: scaleStatblock hardens the bodies, the band swaps in louder ones,
 * and xp per body NEVER moves (core law - see BESTIARY). */
export const ENCOUNTER_BANDS: readonly (readonly (readonly string[])[])[] = [
  // band 0: depth 0-1 - the shallow dead
  [
    ["skeleton", "skeleton", "zombie"],
    ["skeleton", "zombie", "zombie"],
    ["skeleton", "skeleton", "skeleton"],
    ["zombie", "zombie", "skeleton", "skeleton"],
  ],
  // band 1: depth 2-3 - fast claws, first archers
  [
    ["ghoul", "skeleton", "skeleton"],
    ["boneArcher", "zombie", "ghoul"],
    ["ghoul", "ghoul", "zombie"],
    ["boneArcher", "boneArcher", "skeleton", "zombie"],
  ],
  // band 2: depth 4-5 - wights and specters
  [
    ["wight", "ghoul", "ghoul"],
    ["specter", "boneArcher", "skeleton"],
    ["wight", "specter", "zombie"],
    ["specter", "specter", "ghoul", "ghoul"],
  ],
  // band 3: depth 6-7 - the officer corps
  [
    ["necromancer", "wight", "ghoul"],
    ["boneKnight", "specter", "specter"],
    ["boneKnight", "necromancer", "skeleton"],
    ["wight", "wight", "specter", "boneArcher"],
  ],
  // band 4: depth 8+ - wraiths and the dragon
  [
    ["wraith", "boneKnight", "specter"],
    ["wraith", "necromancer", "wight", "specter"],
    ["boneDragon", "ghoul", "ghoul"],
    ["wraith", "wraith", "boneKnight"],
  ],
];

export function bandFor(depth: number): readonly (readonly string[])[] {
  return ENCOUNTER_BANDS[Math.min(ENCOUNTER_BANDS.length - 1, (depth | 0) >> 1)];
}

/** The single loudest body any encounter row can field (boneDragon). Anchors
 * the honest-rate math in sim.ts rate(); validateContent() proves it. */
export const MAX_TABLE_XP = 2900;

// ── loot ────────────────────────────────────────────────────────────────────
/** Two items only, run-boons both, and NOTHING here touches score (law):
 *  - draught: belt potion (max BELT_MAX), auto-drunk at half hp;
 *  - whetstone: +1 flat damage for the CURRENT floor (resets on descent). */
export const CHEST_TABLE: readonly LootEntry[] = [
  { item: "draught", weight: 55 },
  { item: "whetstone", weight: 40 },
  { item: "nothing", weight: 5 },
];

export const KILL_TABLE: readonly LootEntry[] = [
  { item: "nothing", weight: 72 },
  { item: "draught", weight: 16 },
  { item: "whetstone", weight: 12 },
];

// ── class kits ──────────────────────────────────────────────────────────────
/** Shared loop, one passive each, no mana in CRYPT. Cooldowns are AUTHORED
 * ints (frames at 60fps): monk's -25% ships pre-computed (12->9, 30->22) so
 * the sim never does float math. Derived.speed from the core is deliberately
 * unused here - a stepped grid has no px/s; the monk's speed identity IS the
 * cooldown discount (documented sim ambiguity). */
export interface Kit {
  classId: ClassId;
  title: string;
  passive: string; // renderer copy
  moveCdF: number; // frames between steps/turns
  atkCdF: number;  // frames between swings
  reach: number;   // cells deep the swing checks (ranger 2)
  dieStep: number; // barbarian: damage die size steps up this many times
  weakenTicks: number; // bard: core weaken ticks applied per landed hit
  cleaveEvery: number; // wizard: every Nth landed hit also hits the cell behind
  healKill: number;    // cleric: hp per kill
}

export const KITS: Record<ClassId, Kit> = {
  barbarian: {
    classId: "barbarian", title: "Gravebreaker", passive: "Brutal arc: weapon die steps up one size",
    moveCdF: 12, atkCdF: 30, reach: 1, dieStep: 1, weakenTicks: 0, cleaveEvery: 0, healKill: 0,
  },
  monk: {
    classId: "monk", title: "Cloister Fist", passive: "Flow: moves and strikes 25% faster",
    moveCdF: 9, atkCdF: 22, reach: 1, dieStep: 0, weakenTicks: 0, cleaveEvery: 0, healKill: 0,
  },
  ranger: {
    classId: "ranger", title: "Tombstalker", passive: "Longshot: when you dodge a strike, the foe stays open longer for your counter.",
    moveCdF: 12, atkCdF: 30, reach: 2, dieStep: 0, weakenTicks: 0, cleaveEvery: 0, healKill: 0,
  },
  bard: {
    classId: "bard", title: "Dirge Singer", passive: "Dissonance: every hit weakens the target",
    moveCdF: 12, atkCdF: 30, reach: 1, dieStep: 0, weakenTicks: 3, cleaveEvery: 0, healKill: 0,
  },
  wizard: {
    classId: "wizard", title: "Sepulcher Sage", passive: "Arc lightning: every 3rd hit jumps to the cell behind",
    moveCdF: 12, atkCdF: 30, reach: 1, dieStep: 0, weakenTicks: 0, cleaveEvery: 3, healKill: 0,
  },
  cleric: {
    classId: "cleric", title: "Last Rites", passive: "Rites: heals 1 hp per kill",
    moveCdF: 12, atkCdF: 30, reach: 1, dieStep: 0, weakenTicks: 0, cleaveEvery: 0, healKill: 1,
  },
};

/** Barbarian die ladder: 4->6->8->10->12->20, capped. */
export const DIE_STEP: Record<number, number> = { 4: 6, 6: 8, 8: 10, 10: 12, 12: 20, 20: 20 };

// ── the duel book (CRYPT DUELS, 2026-08-28) ─────────────────────────────────
/** A strike's shape. All frame numbers are AUTHORED AT SPEED 100: the sim
 * compresses gapF and tellF by the scaled statblock speed (x100 int), so a
 * zombie (60) telegraphs LONGER than authored and a deep wraith (180) faster,
 * floored at DUEL_TELL_FLOOR_F. recoverF and punishF ride raw - the reward
 * for a won read never shrinks with depth. */
export type DuelStyle = "light" | "heavy" | "feint";

export interface DuelStrike {
  style: DuelStyle;
  /** required dodge side; "any" = either sidestep beats it. On a feint this
   * is the side the fake SELLS - resolution ignores it (feints never land). */
  req: "any" | "L" | "R";
  gapF: number;      // authored frames before the tell (speed-compressed)
  tellF: number;     // authored telegraph frames (speed-compressed, floored)
  recoverF: number;  // frames after a landed / guard-pierced / feinted swing
  punishF: number;   // VULN frames a dodge opens (guarded lights pay 55%)
  dmgMulPct: number; // damage scale on a landed swing: lights 100, heavies 150-175
}

/** The reactability floor: a tell NEVER compresses below this, at any depth
 * or mash-counter. One source of truth (sim re-exports it; the deprecated
 * WINDUP_F alias in sim.ts equals it until the presentation lane lands). */
export const DUEL_TELL_FLOOR_F = 20;

/** Band-0 AFK cadence bound: every band-0 teacher's single-strike loop
 * (gapF+tellF+recoverF) fits inside this, so an idle hero meets a swing at
 * least every 4 authored seconds and the AFK gate keeps killing. */
export const BAND0_LOOP_MAX_F = 240;

/** Per-creature duel identities (validated below):
 *  - skeleton/zombie: slow teachers - long tells, both req sides taught,
 *    generous punish windows (zombie's speed 60 stretches it further);
 *  - ghoul: fast light flurries, one committed heavy;
 *  - boneArcher: skirmisher - quick jabs and a jab-fake between them;
 *  - wight/boneKnight: heavy-siders with authored req (wight leans L,
 *    knight leans R) - guard is useless, feet or nothing;
 *  - specter/wraith: feint-into-heavy - the bait IS the identity;
 *  - necromancer: long-tell nukes with the fattest teacher-grade windows;
 *  - boneDragon: widest heavies in the book, biggest dmgMulPct. */
export const DUEL_BOOK: Record<string, readonly DuelStrike[]> = {
  skeleton: [
    { style: "light", req: "R",   gapF: 55, tellF: 40, recoverF: 30, punishF: 55, dmgMulPct: 100 },
    { style: "heavy", req: "L",   gapF: 65, tellF: 44, recoverF: 40, punishF: 60, dmgMulPct: 150 },
    { style: "light", req: "L",   gapF: 50, tellF: 38, recoverF: 30, punishF: 55, dmgMulPct: 100 },
    { style: "heavy", req: "R",   gapF: 70, tellF: 44, recoverF: 42, punishF: 60, dmgMulPct: 150 },
  ],
  zombie: [
    { style: "light", req: "any", gapF: 40, tellF: 36, recoverF: 26, punishF: 60, dmgMulPct: 100 },
    { style: "heavy", req: "L",   gapF: 46, tellF: 40, recoverF: 36, punishF: 66, dmgMulPct: 160 },
    { style: "heavy", req: "R",   gapF: 46, tellF: 40, recoverF: 36, punishF: 66, dmgMulPct: 160 },
  ],
  ghoul: [
    { style: "light", req: "L",   gapF: 30, tellF: 26, recoverF: 22, punishF: 48, dmgMulPct: 100 },
    { style: "light", req: "R",   gapF: 26, tellF: 24, recoverF: 22, punishF: 48, dmgMulPct: 100 },
    { style: "light", req: "any", gapF: 24, tellF: 22, recoverF: 20, punishF: 44, dmgMulPct: 100 },
    { style: "heavy", req: "R",   gapF: 55, tellF: 34, recoverF: 36, punishF: 58, dmgMulPct: 150 },
  ],
  boneArcher: [
    { style: "light", req: "any", gapF: 40, tellF: 30, recoverF: 26, punishF: 50, dmgMulPct: 100 },
    { style: "feint", req: "L",   gapF: 34, tellF: 28, recoverF: 24, punishF: 44, dmgMulPct: 100 },
    { style: "light", req: "R",   gapF: 38, tellF: 30, recoverF: 26, punishF: 50, dmgMulPct: 100 },
    { style: "heavy", req: "L",   gapF: 60, tellF: 38, recoverF: 40, punishF: 62, dmgMulPct: 155 },
  ],
  wight: [
    { style: "heavy", req: "L",   gapF: 55, tellF: 36, recoverF: 38, punishF: 62, dmgMulPct: 160 },
    { style: "light", req: "any", gapF: 40, tellF: 30, recoverF: 26, punishF: 50, dmgMulPct: 100 },
    { style: "heavy", req: "L",   gapF: 60, tellF: 40, recoverF: 40, punishF: 64, dmgMulPct: 165 },
    { style: "light", req: "R",   gapF: 36, tellF: 28, recoverF: 26, punishF: 50, dmgMulPct: 100 },
  ],
  specter: [
    { style: "feint", req: "R",   gapF: 34, tellF: 30, recoverF: 20, punishF: 44, dmgMulPct: 100 },
    { style: "heavy", req: "R",   gapF: 30, tellF: 34, recoverF: 34, punishF: 58, dmgMulPct: 160 },
    { style: "light", req: "any", gapF: 30, tellF: 26, recoverF: 22, punishF: 46, dmgMulPct: 100 },
    { style: "feint", req: "L",   gapF: 32, tellF: 30, recoverF: 20, punishF: 44, dmgMulPct: 100 },
    { style: "heavy", req: "L",   gapF: 28, tellF: 34, recoverF: 34, punishF: 58, dmgMulPct: 160 },
  ],
  necromancer: [
    { style: "heavy", req: "R",   gapF: 70, tellF: 50, recoverF: 44, punishF: 70, dmgMulPct: 170 },
    { style: "light", req: "any", gapF: 44, tellF: 32, recoverF: 28, punishF: 52, dmgMulPct: 100 },
    { style: "heavy", req: "L",   gapF: 76, tellF: 54, recoverF: 46, punishF: 72, dmgMulPct: 170 },
  ],
  boneKnight: [
    { style: "heavy", req: "R",   gapF: 58, tellF: 40, recoverF: 40, punishF: 64, dmgMulPct: 165 },
    { style: "heavy", req: "R",   gapF: 52, tellF: 38, recoverF: 38, punishF: 62, dmgMulPct: 160 },
    { style: "light", req: "L",   gapF: 40, tellF: 30, recoverF: 28, punishF: 50, dmgMulPct: 100 },
    { style: "heavy", req: "L",   gapF: 62, tellF: 42, recoverF: 42, punishF: 66, dmgMulPct: 165 },
  ],
  wraith: [
    { style: "feint", req: "L",   gapF: 30, tellF: 28, recoverF: 18, punishF: 44, dmgMulPct: 100 },
    { style: "heavy", req: "L",   gapF: 26, tellF: 32, recoverF: 32, punishF: 56, dmgMulPct: 165 },
    { style: "light", req: "any", gapF: 28, tellF: 26, recoverF: 20, punishF: 46, dmgMulPct: 100 },
    { style: "feint", req: "R",   gapF: 30, tellF: 28, recoverF: 18, punishF: 44, dmgMulPct: 100 },
    { style: "heavy", req: "R",   gapF: 26, tellF: 32, recoverF: 32, punishF: 56, dmgMulPct: 165 },
  ],
  boneDragon: [
    { style: "heavy", req: "L",   gapF: 64, tellF: 46, recoverF: 48, punishF: 74, dmgMulPct: 175 },
    { style: "light", req: "any", gapF: 40, tellF: 30, recoverF: 28, punishF: 52, dmgMulPct: 100 },
    { style: "heavy", req: "R",   gapF: 68, tellF: 48, recoverF: 50, punishF: 76, dmgMulPct: 175 },
    { style: "heavy", req: "any", gapF: 72, tellF: 50, recoverF: 52, punishF: 80, dmgMulPct: 175 },
  ],
};

// ── validation (selfcheck gate 0) ───────────────────────────────────────────

function bfsDist(ch: Chunk, from: Cell, to: Cell): number {
  if (from.x === to.x && from.y === to.y) return 0;
  const dist = new Array(ch.w * ch.h).fill(-1);
  dist[from.y * ch.w + from.x] = 0;
  const qx = [from.x];
  const qy = [from.y];
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  for (let head = 0; head < qx.length; head++) {
    const x = qx[head];
    const y = qy[head];
    const dHere = dist[y * ch.w + x];
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= ch.w || ny >= ch.h) continue;
      const i = ny * ch.w + nx;
      if (ch.cells[i] === 1 || dist[i] >= 0) continue;
      dist[i] = dHere + 1;
      if (nx === to.x && ny === to.y) return dist[i];
      qx.push(nx);
      qy.push(ny);
    }
  }
  return -1;
}

export function validateContent(): void {
  if (CHUNKS.length < CHUNK_MIN || CHUNKS.length > CHUNK_MAX)
    throw new Error(`chunk count ${CHUNKS.length} outside ${CHUNK_MIN}..${CHUNK_MAX}`);
  for (const ch of CHUNKS) {
    for (let x = 0; x < ch.w; x++)
      if (ch.cells[x] !== 1 || ch.cells[(ch.h - 1) * ch.w + x] !== 1)
        throw new Error(`${ch.name}: border breach (top/bottom)`);
    for (let y = 0; y < ch.h; y++)
      if (ch.cells[y * ch.w] !== 1 || ch.cells[y * ch.w + ch.w - 1] !== 1)
        throw new Error(`${ch.name}: border breach (sides)`);
    if (ch.chests.length < 1 || ch.chests.length > 2)
      throw new Error(`${ch.name}: ${ch.chests.length} chests (need 1-2)`);
    if (ch.spawns.length < 3) throw new Error(`${ch.name}: only ${ch.spawns.length} spawns (need >= 3)`);
    const stairD = bfsDist(ch, ch.entry, ch.stairs);
    if (stairD < 0) throw new Error(`${ch.name}: stairs unreachable from entry`);
    if (stairD < MIN_STAIR_PATH) throw new Error(`${ch.name}: entry->stairs ${stairD} < ${MIN_STAIR_PATH}`);
    let nearest = -1;
    for (const sp of ch.spawns) {
      const dSp = bfsDist(ch, ch.entry, sp);
      if (dSp < 0) throw new Error(`${ch.name}: spawn ${sp.x},${sp.y} unreachable`);
      if (nearest < 0 || dSp < nearest) nearest = dSp;
    }
    if (nearest > AFK_SPAWN_DIST)
      throw new Error(`${ch.name}: nearest spawn ${nearest} > ${AFK_SPAWN_DIST} (AFK law)`);
    for (const c of ch.chests)
      if (bfsDist(ch, ch.entry, c) < 0) throw new Error(`${ch.name}: chest ${c.x},${c.y} unreachable`);
  }
  let maxXp = 0;
  for (const band of ENCOUNTER_BANDS) {
    if (band.length === 0) throw new Error("empty encounter band");
    for (const row of band) {
      if (row.length < 1 || row.length > 6) throw new Error(`encounter row size ${row.length}`);
      for (const id of row) {
        const sb = statblock(id); // throws on unknown id
        if (sb.xp > maxXp) maxXp = sb.xp;
      }
    }
  }
  if (maxXp !== MAX_TABLE_XP)
    throw new Error(`loudest body xp ${maxXp} != MAX_TABLE_XP ${MAX_TABLE_XP} (rate() anchor drifted)`);
  for (const t of [CHEST_TABLE, KILL_TABLE]) {
    if (t.length === 0) throw new Error("empty loot table");
    for (const e of t) if (!Number.isInteger(e.weight) || e.weight <= 0) throw new Error(`bad loot weight ${e.item}`);
  }
  for (const cls of CLASS_IDS) {
    const k = KITS[cls];
    if (!k || k.classId !== cls) throw new Error(`kit missing/mislabeled: ${cls}`);
    for (const n of [k.moveCdF, k.atkCdF, k.reach, k.dieStep, k.weakenTicks, k.cleaveEvery, k.healKill])
      if (!Number.isInteger(n) || n < 0) throw new Error(`${cls}: non-int kit number`);
    if (k.reach < 1) throw new Error(`${cls}: reach < 1`);
  }
  for (const sides of [4, 6, 8, 10, 12, 20])
    if (!Number.isInteger(DIE_STEP[sides])) throw new Error(`DIE_STEP missing ${sides}`);
  // ── DUEL_BOOK laws (CRYPT DUELS, 2026-08-28) ──────────────────────────────
  const usedIds = new Set<string>();
  for (const band of ENCOUNTER_BANDS) for (const row of band) for (const id of row) usedIds.add(id);
  const band0Ids = new Set<string>();
  for (const row of ENCOUNTER_BANDS[0]) for (const id of row) band0Ids.add(id);
  // the punish floor: a won read must pay for EVERY class - the slowest swing
  // hand plus 10 frames of human slack
  let slowestAtkCdF = 0;
  for (const cls of CLASS_IDS) if (KITS[cls].atkCdF > slowestAtkCdF) slowestAtkCdF = KITS[cls].atkCdF;
  const punishFloor = slowestAtkCdF + 10;
  usedIds.forEach((id) => {
    if (!DUEL_BOOK[id]) throw new Error(`${id}: encounter-used but no DUEL_BOOK entry`);
  });
  for (const [id, pat] of Object.entries(DUEL_BOOK)) {
    statblock(id); // throws on unknown id
    if (pat.length < 3 || pat.length > 6) throw new Error(`${id}: ${pat.length} strikes (need 3-6)`);
    let lights = 0;
    let heavies = 0;
    for (const st of pat) {
      if (st.style !== "light" && st.style !== "heavy" && st.style !== "feint")
        throw new Error(`${id}: unknown style ${st.style}`);
      if (st.req !== "any" && st.req !== "L" && st.req !== "R") throw new Error(`${id}: bad req ${st.req}`);
      for (const n of [st.gapF, st.tellF, st.recoverF, st.punishF, st.dmgMulPct])
        if (!Number.isInteger(n) || n <= 0) throw new Error(`${id}: non-positive strike int`);
      if (st.tellF < DUEL_TELL_FLOOR_F)
        throw new Error(`${id}: tellF ${st.tellF} < floor ${DUEL_TELL_FLOOR_F}`);
      if (st.punishF < punishFloor)
        throw new Error(`${id}: punishF ${st.punishF} < ${punishFloor} (a won read must pay for every class)`);
      if (st.style === "light") {
        lights += 1;
        if (st.dmgMulPct < 100) throw new Error(`${id}: light dmgMulPct ${st.dmgMulPct} < 100`);
      } else if (st.style === "heavy") heavies += 1;
      if (band0Ids.has(id)) {
        if (st.style === "feint") throw new Error(`${id}: feint in a band-0 teacher`);
        const loop = st.gapF + st.tellF + st.recoverF;
        if (loop > BAND0_LOOP_MAX_F)
          throw new Error(`${id}: strike loop ${loop} > ${BAND0_LOOP_MAX_F} (AFK cadence bound)`);
      }
    }
    if (lights < 1 || heavies < 1)
      throw new Error(`${id}: needs >= 1 light AND >= 1 heavy (stall-fingerprint law)`);
  }
  void BESTIARY;
}
