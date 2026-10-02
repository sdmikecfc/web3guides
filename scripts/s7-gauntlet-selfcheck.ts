/**
 * GAUNTLET HEADLESS SELF-CHECK - the pre-harness sanity gate for the S7
 * deckbuilder sim. Run from the web3guides repo root:
 *
 *   npx tsx scripts/s7-gauntlet-selfcheck.ts
 *
 * SEVEN GATES (all must be green before the sim goes near the s7 harness):
 *  1. DETERMINISM: same seed + a scripted 2000-frame tape, twice ->
 *     identical score AND identical fnv1a(JSON.stringify(state)).
 *  2. SEED MOVES THE WORLD: a different seed -> a different hash.
 *  3. AFK GATE: an empty tape dies before 75s of sim time (hesitation is
 *     damage - the cowering rule does the killing).
 *  4. PLAY BEATS SILENCE: a greedy scripted bot (first affordable attack,
 *     end turn, mid node, draft slot 0) survives >= 3x the empty tape and
 *     scores > 0.
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
  createGauntlet,
  stepGauntlet,
  gauntletDone,
  gauntletScore,
  gauntletDetail,
  fnv1a,
  FPS,
  type GauntletState,
  type SimInput,
} from "../src/app/s7/games/gauntlet/sim";
import { validateContent, CARDS, CARD_INDEX, STARTER_DECKS, DRAFT_POOLS } from "../src/app/s7/games/gauntlet/content";
import { CLASS_IDS, type Loadout } from "../src/app/s7/games/_shared/rules/core";

const DT = 1 / FPS;
const NEUTRAL: SimInput = { px: null, py: null, down: false, space: false };
const FRAME_CAP = FPS * 60 * 10; // 10 minutes: a broken sim can never hang the gate
const AFK_LIMIT_F = FPS * 75;
const SEED_MAIN = "s7-gauntlet-check";
const GEARED: Loadout = { classId: "barbarian", level: 10, gear: { weapon: 3, armor: 3, trinket: 3 } };
const WIZARD: Loadout = { classId: "wizard", level: 1, gear: { weapon: 0, armor: 0, trinket: 0 } };

let failures = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`);
  if (!ok) failures += 1;
}

const hash = (s: GauntletState): number => fnv1a(JSON.stringify(s));
const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");

interface RunOut {
  s: GauntletState;
  frames: number;
  score: number;
  hash: number;
  done: boolean;
}

function run(seed: string, lo: Loadout | null, tape: (s: GauntletState, f: number) => SimInput, maxFrames: number): RunOut {
  const s = createGauntlet(390, 844, seed, false, lo);
  let f = 0;
  for (; f < maxFrames; f++) {
    if (gauntletDone(s)) break;
    stepGauntlet(s, DT, tape(s, f));
  }
  return { s, frames: f, score: gauntletScore(s), hash: hash(s), done: gauntletDone(s) };
}

/** The gate-1 scripted tape: a fixed pseudo-pattern of taps and space pulses
 * sweeping every input zone. Pure formula of the frame index - no state, no
 * randomness - so both runs see byte-identical input. */
function scripted(f: number): SimInput {
  const xs = [0.1, 0.5, 0.9, 0.3, 0.95, 0.7];
  const ys = [0.9, 0.4, 0.9, 0.5, 0.3, 0.85];
  const i = ((f / 11) | 0) % 6;
  return { px: xs[i], py: ys[i], down: f % 11 === 0, space: f % 53 === 0 };
}

/** The gate-4 greedy bot: first affordable attack card, else end turn; mid
 * node; draft slot 0; space through events. One-frame taps with a release
 * frame between, so every press is a clean edge. */
function makeBot(record?: SimInput[]): (s: GauntletState, f: number) => SimInput {
  let rest = 0;
  const tap = (px: number, py: number): SimInput => ({ px, py, down: true, space: false });
  return (s) => {
    let out: SimInput = NEUTRAL;
    if (rest > 0) {
      rest -= 1;
    } else if (s.busyF === 0) {
      if (s.phase === "node") {
        out = tap(0.5, 0.4); // mid
        rest = 1;
      } else if (s.phase === "draft") {
        out = tap(1 / 6, 0.4); // slot 0
        rest = 1;
      } else if (s.phase === "event") {
        out = { px: null, py: null, down: false, space: true };
        rest = 1;
      } else if (s.phase === "combat" && s.sub === "hero") {
        let idx = -1;
        for (let i = 0; i < s.hand.length; i++) {
          const c = CARD_INDEX[s.hand[i]];
          if (c && c.kind === "attack" && c.cost <= s.energy && (c.hpCost === 0 || s.hp > c.hpCost)) {
            idx = i;
            break;
          }
        }
        out = idx >= 0 ? tap((idx + 0.5) / 5, 0.9) : tap(0.95, 0.4); // play : end turn
        rest = 1;
      }
    }
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
  check("0 content validates", true, `${CARDS.length} cards`);
} catch (e) {
  check("0 content validates", false, String(e));
}

// ── gate 1: determinism ─────────────────────────────────────────────────────
const t1a = run(SEED_MAIN, null, (_s, f) => scripted(f), 2000);
const t1b = run(SEED_MAIN, null, (_s, f) => scripted(f), 2000);
check(
  "1 determinism (2000f scripted tape, twice)",
  t1a.score === t1b.score && t1a.hash === t1b.hash,
  `score ${t1a.score}/${t1b.score} hash ${hex(t1a.hash)}/${hex(t1b.hash)}`,
);

// ── gate 2: seed moves the world ────────────────────────────────────────────
const t2 = run(SEED_MAIN + "-b", null, (_s, f) => scripted(f), 2000);
check("2 different seed, different hash", t2.hash !== t1a.hash, `${hex(t1a.hash)} vs ${hex(t2.hash)}`);

// ── gate 3: AFK gate ────────────────────────────────────────────────────────
const empty = run(SEED_MAIN, null, () => NEUTRAL, FRAME_CAP);
check(
  "3 empty tape dies < 75s",
  empty.done && empty.frames < AFK_LIMIT_F,
  `died=${empty.done} at ${(empty.frames / FPS).toFixed(1)}s, score ${empty.score}`,
);

// ── gate 4: play beats silence ──────────────────────────────────────────────
const botRec: SimInput[] = [];
const bot = run(SEED_MAIN, null, makeBot(botRec), FRAME_CAP);
check(
  "4 greedy bot >= 3x empty tape, score > 0",
  bot.frames >= empty.frames * 3 && bot.score > 0,
  `bot ${(bot.frames / FPS).toFixed(1)}s vs empty ${(empty.frames / FPS).toFixed(1)}s (${(bot.frames / Math.max(1, empty.frames)).toFixed(2)}x), score ${bot.score} | ${gauntletDetail(bot.s)}`,
);

// ── gate 5: loadout matters ─────────────────────────────────────────────────
const replayRec = (rec: SimInput[]) => (_s: GauntletState, f: number): SimInput => (f < rec.length ? rec[f] : NEUTRAL);
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

// ── the card book (printed so the report and the tables can never drift) ────
console.log("\nCARD BOOK");
for (const cls of CLASS_IDS) {
  const fmt = (id: string): string => {
    const c = CARD_INDEX[id];
    return `${c.name}[${c.cost}${c.kind === "attack" ? "A" : "S"}${c.hpCost ? `,hp${c.hpCost}` : ""}]`;
  };
  const starters = Array.from(new Set(STARTER_DECKS[cls]));
  const draftables = DRAFT_POOLS[cls].slice(8);
  console.log(`  ${cls}: starters ${starters.map(fmt).join(" ")}`);
  console.log(`  ${" ".repeat(cls.length)}  drafts   ${draftables.map(fmt).join(" ")}`);
}

console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} GATE(S) RED`);
if (failures > 0) process.exit(1);
