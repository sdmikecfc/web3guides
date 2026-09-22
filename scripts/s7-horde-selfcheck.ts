/**
 * HORDE HEADLESS SELF-CHECK - the pre-harness sanity gate for the S7
 * action-crawl sim. Run from the web3guides repo root:
 *
 *   npx tsx scripts/s7-horde-selfcheck.ts
 *
 * SEVEN GATES (all must be green before the sim goes near the s7 harness):
 *  1. DETERMINISM: same seed + a scripted 2400-frame tape, twice ->
 *     identical score AND identical fnv1a(JSON.stringify(state)).
 *  2. SEED MOVES THE WORLD: a different seed -> a different hash.
 *  3. AFK GATE: an empty tape dies before 60s of sim time - contact damage
 *     from the gate room's authored first wave does the killing, no special
 *     cower mechanic exists or is needed.
 *  4. PLAY BEATS SILENCE: a greedy scripted bot (walk at the nearest body,
 *     swing on hold, burn mana on grouped enemies, route to a health potion
 *     when the belt is dry) survives >= 3x the empty tape and scores > 0.
 *  5. LOADOUT MATTERS: the bot's recorded tape replayed on a maxed loadout
 *     lands a different hash; and live-bot geared score >= ungeared on a
 *     majority of 20 seeds (survival/speed, per ceiling-neutrality).
 *  6. CLASS MATTERS: the same tape on barbarian vs wizard -> different hash.
 *  7. INTEGER STATE: after 500 frames every number in state is an int
 *     (recursive spot-check) - the fnv1a platform-stability law.
 *
 * Gate 0 is content validation: the authored-table laws are executable.
 */

import {
  createHorde,
  stepHorde,
  hordeDone,
  hordeScore,
  hordeDetail,
  fnv1a,
  FPS,
  FINE,
  ROOM_W,
  ROOM_H,
  type HordeState,
  type EnemyState,
  type SimInput,
} from "../src/app/s7/games/horde/sim";
import {
  validateContent,
  CHUNKS,
  KITS,
  WAVE_SETS,
  DROP_TRASH,
  DROP_ELITE,
  CHEST_TABLE,
  SPELL_TIER_MAX,
} from "../src/app/s7/games/horde/content";
import { CLASS_IDS, type Loadout } from "../src/app/s7/games/_shared/rules/core";

const DT = 1 / FPS;
const NEUTRAL: SimInput = { px: null, py: null, down: false, space: false };
const FRAME_CAP = FPS * 60 * 10; // 10 minutes: a broken sim can never hang the gate
const AFK_LIMIT_F = FPS * 60;
const SEED_MAIN = "s7-horde-check";
const GEARED: Loadout = { classId: "barbarian", level: 10, gear: { weapon: 3, armor: 3, trinket: 3 } };
const WIZARD: Loadout = { classId: "wizard", level: 1, gear: { weapon: 0, armor: 0, trinket: 0 } };
const FW = ROOM_W * FINE;
const FH = ROOM_H * FINE;

let failures = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`);
  if (!ok) failures += 1;
}

const hash = (s: HordeState): number => fnv1a(JSON.stringify(s));
const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");
const sq = (n: number): number => n * n;

interface RunOut {
  s: HordeState;
  frames: number;
  score: number;
  hash: number;
  done: boolean;
}

function run(seed: string, lo: Loadout | null, tape: (s: HordeState, f: number) => SimInput, maxFrames: number): RunOut {
  const s = createHorde(390, 844, seed, false, lo);
  let f = 0;
  for (; f < maxFrames; f++) {
    if (hordeDone(s)) break;
    stepHorde(s, DT, tape(s, f));
  }
  return { s, frames: f, score: hordeScore(s), hash: hash(s), done: hordeDone(s) };
}

/** The gate-1 scripted tape: a fixed pseudo-pattern sweeping the pointer
 * around the room with down holds and space pulses. Pure formula of the
 * frame index - no state, no randomness - so both runs see byte-identical
 * input. */
function scripted(f: number): SimInput {
  const xs = [0.15, 0.85, 0.5, 0.2, 0.8, 0.5];
  const ys = [0.2, 0.8, 0.5, 0.75, 0.25, 0.1];
  const i = ((f / 37) | 0) % 6;
  return { px: xs[i], py: ys[i], down: f % 30 < 18, space: f % 97 === 0 };
}

/** The gate-4 greedy bot: walk at the nearest living body, hold the swing,
 * pulse the skill when mana covers it and the pack is in reach, route to a
 * health potion when hp is low and the belt is dry, take the exit when it
 * opens. Space alternates frames so every press is a clean edge. */
function makeBot(record?: SimInput[]): (s: HordeState, f: number) => SimInput {
  return (s, f) => {
    const kit = KITS[s.classId];
    let best: EnemyState | null = null;
    let bd = -1;
    for (const en of s.enemies) {
      if (en.hp <= 0) continue;
      const dx = en.x - s.x;
      const dy = en.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (bd < 0 || d2 < bd) {
        bd = d2;
        best = en;
      }
    }
    let tx = FW >> 1;
    let ty = FH >> 1;
    let routed = false;
    if (s.hp * 2 <= s.hpMax && s.hpPots === 0) {
      for (const it of s.items) {
        if (it.kind === "hpPot") {
          tx = it.x;
          ty = it.y;
          routed = true;
          break;
        }
      }
    }
    if (!routed) {
      if (best) {
        tx = best.x;
        ty = best.y;
      } else if (s.exitOpen === 1) {
        const e = CHUNKS[s.chunkIdx].exit;
        tx = (e.x + (e.w >> 1)) * FINE;
        ty = (e.y + (e.h >> 1)) * FINE;
      }
    }
    const tier = Math.min(SPELL_TIER_MAX, s.spellTier);
    const space =
      best !== null &&
      s.mana >= kit.cost &&
      s.skillCd === 0 &&
      bd <= sq((kit.area[tier] + 40) * FINE) &&
      (f & 1) === 0;
    const out: SimInput = { px: tx / FW, py: ty / FH, down: best !== null, space };
    if (record) record.push(out);
    return out;
  };
}

function intCheck(v: unknown, path: string, bad: string[]): void {
  if (typeof v === "number") {
    if (!Number.isInteger(v)) bad.push(`${path}=${v}`);
    return;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) intCheck(v[i], `${path}[${i}]`, bad);
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) intCheck(x, `${path}.${k}`, bad);
  }
}

// ── gate 0: content laws ────────────────────────────────────────────────────
try {
  validateContent();
  check("0 content validates", true, `${CHUNKS.length} chunks, ${WAVE_SETS.length} bands`);
} catch (e) {
  check("0 content validates", false, String(e));
}

// ── gate 1: determinism ─────────────────────────────────────────────────────
const t1a = run(SEED_MAIN, null, (_s, f) => scripted(f), 2400);
const t1b = run(SEED_MAIN, null, (_s, f) => scripted(f), 2400);
check(
  "1 determinism (2400f scripted tape, twice)",
  t1a.score === t1b.score && t1a.hash === t1b.hash,
  `score ${t1a.score}/${t1b.score} hash ${hex(t1a.hash)}/${hex(t1b.hash)}`,
);

// ── gate 2: seed moves the world ────────────────────────────────────────────
const t2 = run(SEED_MAIN + "-b", null, (_s, f) => scripted(f), 2400);
check("2 different seed, different hash", t2.hash !== t1a.hash, `${hex(t1a.hash)} vs ${hex(t2.hash)}`);

// ── gate 3: AFK gate ────────────────────────────────────────────────────────
const empty = run(SEED_MAIN, null, () => NEUTRAL, FRAME_CAP);
check(
  "3 empty tape dies < 60s",
  empty.done && empty.frames < AFK_LIMIT_F,
  `died=${empty.done} at ${(empty.frames / FPS).toFixed(1)}s, score ${empty.score}`,
);

// ── gate 4: play beats silence ──────────────────────────────────────────────
const botRec: SimInput[] = [];
const bot = run(SEED_MAIN, null, makeBot(botRec), FRAME_CAP);
check(
  "4 greedy bot >= 3x empty tape, score > 0",
  bot.frames >= empty.frames * 3 && bot.score > 0,
  `bot ${(bot.frames / FPS).toFixed(1)}s vs empty ${(empty.frames / FPS).toFixed(1)}s ` +
    `(${(bot.frames / Math.max(1, empty.frames)).toFixed(2)}x), score ${bot.score} | ${hordeDetail(bot.s)}`,
);

// ── gate 5: loadout matters ─────────────────────────────────────────────────
const replayRec = (rec: SimInput[]) => (_s: HordeState, f: number): SimInput => (f < rec.length ? rec[f] : NEUTRAL);
const geared = run(SEED_MAIN, GEARED, replayRec(botRec), FRAME_CAP);
check("5a same tape, null vs geared: different hash", geared.hash !== bot.hash, `${hex(bot.hash)} vs ${hex(geared.hash)}`);

let gearedWins = 0;
const SEEDS = 20;
for (let i = 0; i < SEEDS; i++) {
  const a = run(`${SEED_MAIN}-m${i}`, null, makeBot(), FRAME_CAP);
  const b = run(`${SEED_MAIN}-m${i}`, GEARED, makeBot(), FRAME_CAP);
  if (b.score >= a.score) gearedWins += 1;
}
check("5b geared score >= ungeared on majority of 20 seeds", gearedWins > SEEDS / 2, `${gearedWins}/${SEEDS}`);

// ── gate 6: class matters ───────────────────────────────────────────────────
const wiz = run(SEED_MAIN, WIZARD, replayRec(botRec), FRAME_CAP);
check("6 barbarian vs wizard, same tape: different hash", wiz.hash !== bot.hash, `${hex(bot.hash)} vs ${hex(wiz.hash)}`);

// ── gate 7: integer state ───────────────────────────────────────────────────
const t7 = run(SEED_MAIN, null, makeBot(), 500);
const bad: string[] = [];
intCheck(t7.s, "state", bad);
check("7 all state numbers are ints after 500 frames", bad.length === 0, bad.length === 0 ? "clean" : bad.slice(0, 5).join(", "));

// ── the kit book (printed so the report and the tables can never drift) ─────
console.log("\nCLASS KIT BOOK");
for (const cls of CLASS_IDS) {
  const k = KITS[cls];
  const dice = k.dice.map((sp) => `${sp.count}d${sp.sides}${sp.bonus ? `+${sp.bonus}` : ""}`).join(" ");
  console.log(
    `  ${cls}: ${k.skillName} [${k.shape}] cost ${k.cost} cd ${k.cdF}f | swing ${k.swingCdF}f reach ${k.swingRange}px | ` +
      `dice t0..4 ${dice} | area t0..4 ${k.area.join("/")}px`,
  );
}
console.log("\nDROP TABLES");
const fmtTable = (t: readonly { item: string; weight: number }[]): string =>
  t.map((e) => `${e.item}:${e.weight}`).join(" ");
console.log(`  trash ${fmtTable(DROP_TRASH)}`);
console.log(`  elite ${fmtTable(DROP_ELITE)}`);
console.log(`  chest ${fmtTable(CHEST_TABLE)}`);

console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} GATE(S) RED`);
if (failures > 0) process.exit(1);
