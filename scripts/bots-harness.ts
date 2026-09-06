/**
 * BATTLE BOTS HEADLESS HARNESS - the determinism / stats-matter / readable
 * chain merge gate for the fight engine, structured like scripts/s7-harness.ts
 * (report(), hashState via fnv1a of the JSON state, a frozen baseline table
 * recorded once with --record, ALL CHECKS GREEN / exit 1). Under 10 s.
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/bots-harness.ts            verify
 *   npx tsx scripts/bots-harness.ts --record   (re)record src/app/bots/_engine/baseline.ts
 *   npx tsx scripts/bots-harness.ts --table    also print every baseline row (gate i)
 *
 * CHECKS (engine doc section 7):
 *  (0)   content: validateCatalog() + validateCommentary() + 40 launch parts
 *        in 8 families + the 5 starter cards
 *  (grep) no Math.random / Date / performance / toFixed anywhere in _engine/
 *  (m-src) _engine/ never names the look layer in code (look, face, sticker,
 *        decal, topper, hat, mark) - comments and authored strings exempt
 *  (m)   nothing in the look enters the fight: the four mirrors run bare and
 *        with a full look on every part, outcome / log / fighters / sides /
 *        cursors byte-identical, only .builds differs, undressed hash equal
 *  (m-roll) the dressed run reproduces the frozen rollup
 *  (p)   the engine's PAINT_IDS mirror equals src/app/bots/_ui/tokens.ts
 *  (s)   the set bonus never changes a bot's total or tier, and moves every
 *        fight aggregate by exactly perStat (family 2, paint 1, both 3)
 *  (a)   double replay: 50 seeds x 4 canonical mirror pairings, resolved
 *        twice, byte-identical hashes, equal to the frozen baseline
 *  (int) Number.isInteger walk of every baseline fight's final state
 *  (b)   stats matter (small): CANON_T3 beats CANON_T1 in at least 47 of 50
 *  (g)   forked streams: changing build A's head changes none of B's draws
 *  (h)   readable chain: at least 80 percent of the baseline fights break a
 *        part before the end
 *  (v)   the baseline was frozen under the current ENGINE_VERSION
 *  (i)   node vs browser: prints the baseline rollup per pairing (and every
 *        row with --table); /bots/dev/replay-check prints the same from a
 *        browser replay and ends MATCH / MISMATCH
 *
 * The many-seed statistics (luck bounded, durations, archetype round robin,
 * reward EV) live in scripts/bots-massim.ts, kept OUT of the merge gate the
 * way scripts/s7-balance.ts is.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fnv1a } from "../src/app/bots/_engine/rng";
import { PAINT_IDS, PIECE, botTier, buildTotal, setBonus, validateCatalog, type Build, type CanonKey, type FightEvent, type Part } from "../src/app/bots/_engine/parts";
import { CANON, CARD_INDEX, CATALOG, FAMILIES, PARTS, PART_INDEX, WEAPON_OF_TIER, familyBuild, paintAll, unmatchedTwin } from "../src/app/bots/_engine/catalog";
import { AGGREGATE_KEYS, deriveFighter } from "../src/app/bots/_engine/derive";
import { createFight, fightHash, runFight, stepFight, type Fight, type FightState } from "../src/app/bots/_engine/resolve";
import { validateCommentary } from "../src/app/bots/_engine/commentary";
import { ENGINE_VERSION } from "../src/app/bots/_engine/version";
import { BASELINE, type BaselineRow } from "../src/app/bots/_engine/baseline";
import { PAINT_IDS as UI_PAINT_IDS } from "../src/app/bots/_ui/tokens";
// (m) reads the SHIPPED look module, never a copy of it: a gate that
// reimplements what it checks reproduces the author's assumptions and passes.
import { EVERY_HAT, earnedMarks, normalizeLook, type LookEarned } from "../src/lib/bots/look";

// ---------------------------------------------------------------------------
// shared shapes (mirroring scripts/s7-harness.ts)
// ---------------------------------------------------------------------------

const ENGINE_REL = "src/app/bots/_engine";
const BASELINE_REL = `${ENGINE_REL}/baseline.ts`;

/** The four canonical pairings the baseline freezes: the mirrors. */
const PAIRINGS: readonly [CanonKey, CanonKey][] = [["T1", "T1"], ["T2", "T2"], ["T3", "T3"], ["T4", "T4"]];
const SEED_COUNT = 50;

/** Seeds are fixed strings hashed the way the server hashes a fight id. */
function seedAt(i: number): number {
  return fnv1a(`bots-baseline-${i}`);
}

function hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

interface RunRow {
  pairing: number;
  seed: number;
  winner: number;
  frames: number;
  end: number;
  hash: number;
  state: FightState;
}

function runRow(pairing: number, seedIdx: number): RunRow {
  const [ka, kb] = PAIRINGS[pairing];
  const fight = runFight(seedAt(seedIdx), CANON[ka], CANON[kb]);
  const st = fight.st;
  return { pairing, seed: seedIdx, winner: st.winner, frames: st.frame, end: st.end, hash: fightHash(st), state: st };
}

function sameRow(x: RunRow, y: { winner: number; frames: number; end: number; hash: number }): boolean {
  return x.winner === y.winner && x.frames === y.frames && x.end === y.end && x.hash === y.hash;
}

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

let failures = 0;
function report(ok: boolean, gate: string, msg: string): void {
  const tag = ok ? "[OK] " : "[FAIL]";
  if (!ok) failures += 1;
  console.log(`${tag} bots ${gate} ${msg}`);
}

/** (grep) the float / clock law, executable. Matches comments too, on
 * purpose: an engine file must not even mention these. */
function gateGrep(root: string): void {
  const dir = path.join(root, ENGINE_REL);
  const bad: string[] = [];
  const re = /Math\.random|\bDate\b|performance|toFixed/;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (re.test(line)) bad.push(`${file}:${i + 1}`);
    });
  }
  report(bad.length === 0, "(grep)", bad.length === 0 ? `no Math.random / Date / performance / toFixed in ${ENGINE_REL}/` : `forbidden token at ${bad.join(", ")}`);
}

/** (int) every number in the final state is a whole number; only numbers,
 * strings, arrays and plain objects are allowed. */
function walkIntegers(v: unknown, at: string, bad: string[]): void {
  if (typeof v === "number") {
    if (!Number.isInteger(v)) bad.push(`${at}=${v}`);
    return;
  }
  if (typeof v === "string") return;
  if (Array.isArray(v)) {
    v.forEach((x, i) => walkIntegers(x, `${at}[${i}]`, bad));
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) walkIntegers(x, `${at}.${k}`, bad);
    return;
  }
  bad.push(`${at}:${typeof v}`);
}

function breaksBeforeEnd(log: readonly FightEvent[]): number {
  let n = 0;
  for (const e of log) if (e.t === "break" && e.part !== PIECE.BODY) n += 1;
  return n;
}

/** (g) wrap side B's six streams so every draw is recorded, then run. */
function recordedDraws(seed: number, a: Build, b: Build): { fight: Fight; draws: number[][] } {
  const fight = createFight(seed, a, b);
  const draws: number[][] = [];
  for (let idx = 6; idx < 12; idx++) {
    const rec: number[] = [];
    draws.push(rec);
    const orig = fight.rng[idx];
    fight.rng[idx] = () => {
      const v = orig();
      rec.push(v);
      return v;
    };
  }
  while (!fight.st.done) stepFight(fight);
  return { fight, draws };
}

function isPrefix(shorter: number[], longer: number[]): boolean {
  if (shorter.length > longer.length) return isPrefix(longer, shorter);
  for (let i = 0; i < shorter.length; i++) if (shorter[i] !== longer[i]) return false;
  return true;
}

/** (p) the engine mirrors the UI's eight paint ids (parts.ts PAINT_IDS vs
 * tokens.ts PAINTS) so the engine can stay import-free of the UI tree. */
function gatePaint(): void {
  const same = PAINT_IDS.length === UI_PAINT_IDS.length && PAINT_IDS.every((id, i) => id === UI_PAINT_IDS[i]);
  report(
    same,
    "(p)",
    same ? `PAINT_IDS mirror matches tokens.ts: ${PAINT_IDS.join(", ")}` : `PAINT_IDS drifted: engine [${PAINT_IDS.join(",")}] vs tokens [${UI_PAINT_IDS.join(",")}]`,
  );
}

/** (s) a set is a boost, never a tier: for every family, the matched body
 * and its unmatched twin (same stats, ids the card index cannot see) share
 * a total and a bot tier, and every fight aggregate differs by exactly
 * perStat: family 2, the twin painted one color 1, the matched body painted
 * one color 3. */
function gateSets(): void {
  const bad: string[] = [];
  for (const fam of FAMILIES) {
    const matched = familyBuild(fam.id, WEAPON_OF_TIER[fam.tier]);
    const twin = unmatchedTwin(matched);
    const ft = deriveFighter(twin);
    if (setBonus(twin, CARD_INDEX).perStat !== 0 || ft.setPerStat !== 0) bad.push(`${fam.id}: the unmatched twin carries a set`);
    const probes: [string, Build, number][] = [
      ["family", matched, 2],
      ["paint", paintAll(twin, "mint"), 1],
      ["both", paintAll(matched, "coral"), 3],
    ];
    for (const [label, b, want] of probes) {
      const f = deriveFighter(b);
      const bonus = setBonus(b, CARD_INDEX);
      if (bonus.perStat !== want || f.setPerStat !== want) bad.push(`${fam.id} ${label}: perStat ${bonus.perStat} / fighter ${f.setPerStat}, want ${want}`);
      if (f.total !== ft.total || f.total !== buildTotal(b)) bad.push(`${fam.id} ${label}: total ${f.total} moved from ${ft.total}`);
      if (botTier(buildTotal(b)) !== botTier(buildTotal(twin))) bad.push(`${fam.id} ${label}: bot tier moved`);
      for (const key of AGGREGATE_KEYS) {
        if (f[key] !== ft[key] + want) bad.push(`${fam.id} ${label}: ${key} ${f[key]} vs twin ${ft[key]} + ${want}`);
      }
    }
  }
  report(
    bad.length === 0,
    "(s)",
    bad.length === 0
      ? `set bonus over ${FAMILIES.length} families: family +2 / paint +1 / both +3 on every aggregate, total and bot tier unchanged`
      : `set bonus drift: ${bad.slice(0, 4).join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// (m) NOTHING IN THE LOOK ENTERS THE FIGHT
// ---------------------------------------------------------------------------

/** Every word the look layer is built out of. `shape` is deliberately NOT
 * here: catalog.ts has always used it for the house bots. Words are matched
 * as whole identifier tokens after camelCase is split, so `CardLookup`,
 * `interface` and `what` are not hits; the point is to catch `part.look`,
 * not the English language. */
const LOOK_WORDS: readonly string[] = [
  "look", "looks", "face", "faces", "sticker", "stickers", "decal", "decals",
  "topper", "toppers", "hat", "hats", "mark", "marks",
];
const LOOK_WORD_SET = new Set(LOOK_WORDS);

/** Drop comments and string bodies, so English prose in a doc comment or in
 * an authored part description ("heavy enough to leave a mark") is not a
 * violation while `p.look` is. A quote inside a comment and a slash inside a
 * string both have to be handled, hence a state machine and not a regex. */
function codeOnly(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += quote; // keep the delimiters so a key like "look": still reads
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      out += quote;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** camelCase and snake_case split into lower-case words. */
function identWords(code: string): string[] {
  const out: string[] = [];
  for (const raw of code.split(/[^A-Za-z]+/)) {
    if (!raw) continue;
    const split = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
    for (const w of split.split(" ")) if (w) out.push(w.toLowerCase());
  }
  return out;
}

/** (m-src) the engine may not name the look layer in code. Two passes: an
 * identifier pass over comment-free, string-free code, and a string pass for
 * the back door an identifier pass cannot see, `b["look"]` and `{ "hat": 1 }`. */
function gateLookSource(root: string): void {
  const dir = path.join(root, ENGINE_REL);
  const bad: string[] = [];
  const keyRe = new RegExp(`(?:\\[\\s*|[,{]\\s*)(['"\`])(${LOOK_WORDS.join("|")})\\1\\s*(?:\\]|:)`, "i");
  let files = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    files += 1;
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
    // comment / string stripping has to run over the whole file (a block
    // comment spans lines), then be split back into lines to report one.
    const stripped = codeOnly(lines.join("\n")).split("\n");
    stripped.forEach((line, i) => {
      const hit = identWords(line.replace(/(['"`]).*?\1/g, "")).filter((w) => LOOK_WORD_SET.has(w));
      if (hit.length) bad.push(`${file}:${i + 1} names ${Array.from(new Set(hit)).join("/")}`);
      const key = keyRe.exec(line);
      if (key) bad.push(`${file}:${i + 1} reads the key "${key[2]}"`);
    });
  }
  report(
    bad.length === 0,
    "(m-src)",
    bad.length === 0
      ? `${ENGINE_REL}/ (${files} files) never names ${LOOK_WORDS.length} look words in code: ${LOOK_WORDS.join(", ")}`
      : `the look reached the engine: ${bad.slice(0, 5).join("; ")}`,
  );
}

/** The keys the dressed build carries, so they can be taken back off again. */
const DRESS_KEYS = ["look", "marks", "face", "sticker", "spot", "stickerPaint", "hat", "decal", "topper", "plate", "plateNumber"] as const;

/** A robot wearing everything the look layer can put on it, built by the
 * SHIPPED module off a server-shaped LookEarned. Champion, 27 wins (past the
 * gold star), level 10, four repairs, every hat won. */
const DRESS_EARNED: LookEarned = {
  wins: 27, level: 10, repairs: 4, champion: true, colourMatch: true, fourStar: true,
  hats: EVERY_HAT.slice(), paints: ["mint", "coral", "moss", "ink"], plateNumber: 41,
};

function dressBuild(b: Build): Build {
  const look = normalizeLook(
    { face: "stars", sticker: "star", spot: "chest", stickerPaint: "mint", hat: { kind: "bow", color: "sky" } },
    DRESS_EARNED,
  );
  const marks = earnedMarks(DRESS_EARNED);
  const dress = (p: Part): Part =>
    ({
      ...p, look, marks, face: look.face, sticker: look.sticker, spot: look.spot,
      stickerPaint: look.stickerPaint, hat: look.hat, decal: look.sticker,
      topper: look.hat, plate: look.plateNumber, plateNumber: look.plateNumber,
    }) as Part;
  return {
    legs: dress(b.legs), arms: dress(b.arms), torso: dress(b.torso),
    head: dress(b.head), weapon: dress(b.weapon),
    look, marks,
  } as Build;
}

/** Take the look back off, at any depth, so what is left is the build the
 * engine was handed before it was dressed. */
function undress(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(undress);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if ((DRESS_KEYS as readonly string[]).includes(k)) continue;
      out[k] = undress(x);
    }
    return out;
  }
  return v;
}

/** Every path at which two states differ, so "only the builds moved" is
 * measured and not asserted by looking at four fields. */
function diffPaths(a: unknown, b: unknown, at: string, out: string[], cap = 40): void {
  if (out.length >= cap) return;
  if (a === b) return;
  const ao = a && typeof a === "object";
  const bo = b && typeof b === "object";
  if (!ao || !bo) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(at);
    return;
  }
  const keys = Array.from(new Set(Object.keys(a as object).concat(Object.keys(b as object))));
  for (const k of keys) {
    diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`, out, cap);
  }
}

/**
 * (m) the four canonical mirrors, every seed, run twice: once bare and once
 * with a full look on every part AND on the build. What is proven:
 *
 *  (m1) the FIGHT is untouched - winner, frames, end, the whole event log,
 *       both derived fighters, both side states and the draw cursors are
 *       byte-identical, so no stat, no roll and no target moved;
 *  (m2) the ONLY paths that differ anywhere in the final state are under
 *       .builds, measured by a full structural diff rather than by checking
 *       a handful of fields;
 *  (m3) with the look taken back off .builds, the state hashes byte-identical
 *       to the bare fight and the rollup is the frozen one.
 *
 * NOTE the hash of a DRESSED state is deliberately not asserted equal: the
 * state carries `builds` verbatim, so dressing the input changes the record
 * the fight is stored with. That is the state echoing its input, not the
 * fight moving, and (m1)+(m2) are the stronger claim.
 */
function gateLook(bare: RunRow[]): void {
  const behaviour: string[] = [];
  const outside: string[] = [];
  const hashDrift: string[] = [];
  const dressedRows: RunRow[] = [];

  for (const r of bare) {
    const [ka, kb] = PAIRINGS[r.pairing];
    const fight = runFight(seedAt(r.seed), dressBuild(CANON[ka]), dressBuild(CANON[kb]));
    const st = fight.st;
    const tag = `${PAIRINGS[r.pairing].join("v")}#${r.seed}`;

    // (m1) the fight itself
    if (st.winner !== r.state.winner || st.frame !== r.state.frame || st.end !== r.state.end) behaviour.push(`${tag} outcome`);
    if (JSON.stringify(st.log) !== JSON.stringify(r.state.log)) behaviour.push(`${tag} log`);
    if (JSON.stringify(st.fighters) !== JSON.stringify(r.state.fighters)) behaviour.push(`${tag} fighters`);
    if (JSON.stringify(st.sides) !== JSON.stringify(r.state.sides)) behaviour.push(`${tag} sides`);
    if (JSON.stringify(st.cursors) !== JSON.stringify(r.state.cursors)) behaviour.push(`${tag} cursors`);

    // (m2) nothing outside .builds moved
    const paths: string[] = [];
    diffPaths(r.state, st, "st", paths);
    for (const p of paths) if (!p.startsWith("st.builds")) outside.push(`${tag} ${p}`);

    // (m3) undress and re-hash
    const back = undress(st) as FightState;
    const hash = fnv1a(JSON.stringify(back));
    if (hash !== r.hash) hashDrift.push(`${tag} ${hex(hash)} vs ${hex(r.hash)}`);
    dressedRows.push({ ...r, hash, state: back });
  }

  const ok = behaviour.length === 0 && outside.length === 0 && hashDrift.length === 0;
  report(
    ok,
    "(m)",
    ok
      ? `look on every part over ${bare.length} fights: outcome, log, fighters, sides and cursors byte-identical; ` +
          `the only state paths that moved are under .builds; undressed hashes equal the baseline`
      : `the look moved the fight: ${[...behaviour, ...outside, ...hashDrift].slice(0, 5).join("; ")}`,
  );

  // (m-roll) the frozen rollup, recomputed from the dressed-then-undressed run
  const roll = (rs: RunRow[]): string => hex(fnv1a(rs.map((x) => hex(x.hash)).join(",")));
  const per = PAIRINGS.map((p, i) => `${p[0]}v${p[1]} ${roll(dressedRows.filter((x) => x.pairing === i))}`);
  const all = roll(dressedRows);
  const want = ["T1vT1 fa0df511", "T2vT2 98c10093", "T3vT3 e750eafb", "T4vT4 9e5392ed"];
  const wantAll = "9fd36ca7";
  const rollOk = per.every((s, i) => s === want[i]) && all === wantAll;
  report(rollOk, "(m-roll)", `dressed rollup ${per.join("  ")}  all ${all}${rollOk ? " (unmoved)" : ` - WANT ${want.join("  ")}  all ${wantAll}`}`);
}

/** (i) the node half of "node vs browser": a rollup hash per pairing and
 * over the whole table (fnv1a of the hex hashes joined by commas, seed
 * order inside a pairing, pairing order over the table), the same numbers
 * /bots/dev/replay-check prints from a browser replay. --table prints every
 * row for a line-by-line compare. */
function printRollup(rows: RunRow[], full: boolean): void {
  const roll = (rs: RunRow[]): string => hex(fnv1a(rs.map((r) => hex(r.hash)).join(",")));
  const perPairing = PAIRINGS.map((p, i) => `${p[0]}v${p[1]} ${roll(rows.filter((r) => r.pairing === i))}`);
  report(true, "(i)", `node table rollup: ${perPairing.join("  ")}  all ${roll(rows)} (compare with /bots/dev/replay-check; --table prints every row)`);
  if (!full) return;
  console.log("  pairing seed winner frames end hash");
  for (const r of rows) {
    console.log(`  ${PAIRINGS[r.pairing].join("v").padEnd(7)} ${String(r.seed).padStart(4)} ${String(r.winner).padStart(6)} ${String(r.frames).padStart(6)} ${String(r.end).padStart(3)} ${hex(r.hash)}`);
  }
}

function verify(rows: RunRow[]): void {
  // (a) double replay vs baseline
  let unstable = 0;
  let drift = 0;
  let missing = 0;
  const byKey = new Map<string, BaselineRow>();
  for (const r of BASELINE.rows) byKey.set(`${r[0]}/${r[1]}`, r);
  for (const r of rows) {
    const again = runRow(r.pairing, r.seed);
    if (!sameRow(r, again)) unstable += 1;
    const base = byKey.get(`${r.pairing}/${r.seed}`);
    if (!base) missing += 1;
    else if (!sameRow(r, { winner: base[2], frames: base[3], end: base[4], hash: base[5] })) drift += 1;
  }
  const sample = rows[SEED_COUNT + 3];
  report(
    unstable === 0 && drift === 0 && missing === 0,
    "(a)",
    `double replay ${rows.length} fights (${SEED_COUNT} seeds x ${PAIRINGS.length} mirrors): ` +
      `${unstable === 0 ? "byte-identical x2" : `${unstable} UNSTABLE`}, ` +
      `${drift === 0 && missing === 0 ? "equal to baseline" : `${drift} drifted, ${missing} missing from baseline`}; ` +
      `sample T2vT2 seed 3: winner ${sample.winner}, ${sample.frames}f, hash ${hex(sample.hash)}`,
  );

  // (int) integer walk
  const bad: string[] = [];
  for (const r of rows) walkIntegers(r.state, `${PAIRINGS[r.pairing].join("v")}#${r.seed}`, bad);
  report(bad.length === 0, "(int)", bad.length === 0 ? `Number.isInteger walk clean over ${rows.length} final states` : `non-integer or foreign value: ${bad.slice(0, 5).join(", ")}`);

  // (b) stats matter: T3 beats T1 in >= 47 of 50 (sides alternate by seed)
  let t3wins = 0;
  for (let i = 0; i < SEED_COUNT; i++) {
    const t3IsA = i % 2 === 0;
    const fight = runFight(seedAt(i), t3IsA ? CANON.T3 : CANON.T1, t3IsA ? CANON.T1 : CANON.T3);
    if (fight.st.winner === (t3IsA ? 0 : 1)) t3wins += 1;
  }
  report(t3wins >= 47, "(b)", `CANON_T3 beats CANON_T1 in ${t3wins}/${SEED_COUNT} (bar 47)`);

  // (g) forked streams: A with a different head must not move any B draw
  const helm = PART_INDEX["head.bulldozerHelm"];
  const altA: Build = { ...CANON.T2, head: { id: helm.id, s: helm.s } };
  let gOk = true;
  let gMoved = 0;
  let gDetail = "";
  for (let i = 0; i < 10; i++) {
    const seed = seedAt(100 + i);
    const x = recordedDraws(seed, CANON.T2, CANON.T2);
    const y = recordedDraws(seed, altA, CANON.T2);
    if (fightHash(x.fight.st) !== fightHash(y.fight.st)) gMoved += 1;
    for (let p = 0; p < 6; p++) {
      if (!isPrefix(x.draws[p], y.draws[p])) {
        gOk = false;
        gDetail = ` (seed ${i}, B stream ${p} diverged)`;
      }
    }
  }
  report(
    gOk && gMoved > 0,
    "(g)",
    `forked streams: over 10 seeds, swapping A's head to Bulldozer Helm moved the fight ${gMoved}/10 times and ` +
      `${gOk ? "none of B's draws" : "SOME of B's draws"}${gDetail}`,
  );

  // (h) readable chain
  let withBreak = 0;
  for (const r of rows) if (breaksBeforeEnd(r.state.log) > 0) withBreak += 1;
  const pct = Math.floor((withBreak * 100) / rows.length);
  report(pct >= 80, "(h)", `${withBreak}/${rows.length} baseline fights (${pct} percent) break a part before the end (bar 80)`);

  // (v) version pin
  report(
    BASELINE.engineVersion === ENGINE_VERSION,
    "(v)",
    `baseline frozen under engine v${BASELINE.engineVersion}, engine is v${ENGINE_VERSION}${BASELINE.engineVersion === ENGINE_VERSION ? "" : " (re-record after a deliberate rule change)"}`,
  );
}

// ---------------------------------------------------------------------------
// recording
// ---------------------------------------------------------------------------

function emitBaselineFile(rows: RunRow[], stamp: string): string {
  const lines = rows.map((r) => `  [${r.pairing}, ${r.seed}, ${r.winner}, ${r.frames}, ${r.end}, ${r.hash}],`).join("\n");
  const kos = rows.filter((r) => r.end === 1).length;
  const meanF = Math.round(rows.reduce((s, r) => s + r.frames, 0) / rows.length);
  return `/**
 * BATTLE BOTS BASELINE - recorded ${stamp} by
 * \`npx tsx scripts/bots-harness.ts --record\`. DO NOT EDIT BY HAND and do
 * not re-record casually: this table IS the byte-identity baseline the
 * harness replays to prove the engine did not move. Re-record ONLY when the
 * engine deliberately changes (and bump ENGINE_VERSION), and say so in the
 * commit.
 *
 * Contract (scripts/bots-harness.ts): seed i = fnv1a("bots-baseline-" + i);
 * the four pairings are the canonical mirrors; hashes are fnv1a32 over
 * JSON.stringify of the final fight state.
 *
 * ${rows.length} fights: ${kos} knockouts, ${rows.length - kos} timeouts, mean ${meanF} frames.
 */

/** [pairing index, seed index, winner, frames, end (1 ko / 2 timeout), hash] */
export type BaselineRow = readonly [number, number, number, number, number, number];

export const BASELINE = {
  recorded: true,
  engineVersion: ${ENGINE_VERSION},
  pairings: [${PAIRINGS.map((p) => `"${p[0]}v${p[1]}"`).join(", ")}] as readonly string[],
  seedCount: ${SEED_COUNT},
  rows: [
${lines}
  ] as readonly BaselineRow[],
};
`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, ENGINE_REL))) {
  console.error(`Run from the web3guides repo root (${ENGINE_REL} not found under cwd).`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const recording = argv.includes("--record");
const fullTable = argv.includes("--table");
const t0 = Date.now();

// (0) content first: the authored-table laws are executable
try {
  validateCatalog(CATALOG);
  validateCommentary();
  report(
    PARTS.length === 40 && FAMILIES.length === 8 && CATALOG.starter.length === 5,
    "(0)",
    `catalog validates: ${PARTS.length} launch parts (want 40) in ${FAMILIES.length} families (want 8), ${CATALOG.starter.length} starter cards (want 5), ` +
      `${CATALOG.shapes.length} house shapes, commentary covers every event kind`,
  );
} catch (e) {
  report(false, "(0)", String(e instanceof Error ? e.message : e));
}

gateGrep(ROOT);
gateLookSource(ROOT);
gatePaint();
gateSets();

const rows: RunRow[] = [];
for (let p = 0; p < PAIRINGS.length; p++) {
  for (let i = 0; i < SEED_COUNT; i++) rows.push(runRow(p, i));
}

gateLook(rows);

if (recording) {
  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(ROOT, BASELINE_REL), emitBaselineFile(rows, stamp), "utf8");
  console.log(`[OK]  wrote ${BASELINE_REL}: ${rows.length} rows under engine v${ENGINE_VERSION}`);
  // verify against what was just written, without a re-import
  (BASELINE as { recorded: boolean; engineVersion: number; rows: readonly BaselineRow[] }).recorded = true;
  (BASELINE as { engineVersion: number }).engineVersion = ENGINE_VERSION;
  (BASELINE as { rows: readonly BaselineRow[] }).rows = rows.map((r) => [r.pairing, r.seed, r.winner, r.frames, r.end, r.hash] as const);
}

if (!BASELINE.recorded || BASELINE.rows.length === 0) {
  report(false, "(a)", `baseline not recorded yet - run: npx tsx scripts/bots-harness.ts --record`);
} else {
  verify(rows);
}
printRollup(rows, fullTable);

console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s wall clock`);
console.log(failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`);
if (failures > 0) process.exit(1);
