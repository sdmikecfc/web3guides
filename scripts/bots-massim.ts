/**
 * BATTLE BOTS NIGHTLY MASS-SIM - the statistical proof that is too slow for
 * the merge gate (scripts/bots-harness.ts holds gates 0, a, b, g, h; this
 * file owns the many-seed runs the engine doc keeps OUT of the merge gate,
 * the way scripts/s7-balance.ts sits beside scripts/s7-harness.ts).
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/bots-massim.ts              full pass (N=10000 seeds per check, E=200 per pair)
 *   npx tsx scripts/bots-massim.ts --n=2000     quick pass
 *   npx tsx scripts/bots-massim.ts --e=50       fewer seeds per archetype pair
 *   npx tsx scripts/bots-massim.ts B D          only the named gates
 *
 * CHECKS (engine doc section 7, nightly):
 *  (B) stats matter: T3 vs T1 >= 95 percent, T2 vs T1 >= 70, +10 points at
 *      equal tier >= 62
 *  (C) luck bounded: the mirror lands 50 within 2; a max-LUCK build against
 *      a same-total no-luck build stays within 40..60
 *  (D) duration: pooled median 30..55 s, p10 >= 18, p90 <= 75, timeouts
 *      < 1 percent, no fight reaches the frame cap without a timeout event
 *  (E) no dominant archetype: 40 authored 35-point builds, round robin, E
 *      seeds per pair; every build wins 35..65 percent overall
 *  (F) reward EV from MEASURED win rates times the section-5 gap
 *      multipliers peaks between gap +5 and +15 and is lowest at -20 or below
 *  (G) matched sets: every T2 family body (+2 on every aggregate) beats
 *      the SAME body unmatched (unmatchedTwin: same stats, no set) >= 60
 *  (H) a set is never a tier: an unmatched T3 body (the two T3 families
 *      mixed, so no set) beats every matched T2 family body >= 70
 *
 * Seeds are `massim-<gate>-<i>` strings hashed with fnv1a, disjoint from the
 * frozen baseline, so this gate never couples to the byte-identity table.
 * Sides alternate by seed parity wherever a pairing is symmetric, so the
 * challenged-bot tiebreak cannot lean a number.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fnv1a } from "../src/app/bots/_engine/rng";
import { PIECE, buildTotal, isLegalBuild, setBonus, type Build, type Part, type Slot } from "../src/app/bots/_engine/parts";
import {
  CANON,
  CARD_INDEX,
  FAMILIES,
  PART_INDEX,
  SHAPE_INDEX,
  WEAPON_OF_TIER,
  familyBuild,
  familyCards,
  paintAll,
  partOf,
  scaleShape,
  unmatchedTwin,
} from "../src/app/bots/_engine/catalog";
import { aggregates } from "../src/app/bots/_engine/derive";
import { BEAT, runFight } from "../src/app/bots/_engine/resolve";

// ---------------------------------------------------------------------------
// run machinery
// ---------------------------------------------------------------------------

interface Outcome {
  xWins: number;      // wins for build X (the first argument)
  n: number;
  frames: number[];
  timeouts: number;
  capNoTimeout: number;
}

/** X vs Y over n seeds, X on side A for even seeds and side B for odd. */
function duel(tag: string, x: Build, y: Build, n: number, alternate = true): Outcome {
  const out: Outcome = { xWins: 0, n, frames: [], timeouts: 0, capNoTimeout: 0 };
  for (let i = 0; i < n; i++) {
    const seed = fnv1a(`massim-${tag}-${i}`);
    const xIsA = !alternate || i % 2 === 0;
    const st = runFight(seed, xIsA ? x : y, xIsA ? y : x).st;
    if (st.winner === (xIsA ? 0 : 1)) out.xWins += 1;
    out.frames.push(st.frame);
    if (st.end === 2) out.timeouts += 1;
    if (st.frame >= BEAT.CAP_F && st.log[st.log.length - 1].t !== "timeout") out.capNoTimeout += 1;
  }
  return out;
}

function pct(wins: number, n: number): number {
  return (wins * 100) / n;
}

function quantile(sorted: number[], q: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

function secs(frames: number): string {
  return (frames / 60).toFixed(1);
}

function shapeAt(id: string, total: number): Build {
  return scaleShape(SHAPE_INDEX[id], total);
}

// ---------------------------------------------------------------------------
// authored fixtures
// ---------------------------------------------------------------------------

/** A 35-point build from fifteen whole numbers in slot order (legs, arms,
 * torso, head, weapon; three stats each). Throws if it is not exactly 35
 * or not legal, so a typo cannot become a silent fixture. */
function build35(id: string, v: readonly number[]): Build {
  if (v.length !== 15) throw new Error(`${id}: ${v.length} numbers, want 15`);
  const part = (slot: Slot, i: number): Part => ({ id: `${id}.${slot}`, s: [v[i], v[i + 1], v[i + 2]] });
  const b: Build = { legs: part("legs", 0), arms: part("arms", 3), torso: part("torso", 6), head: part("head", 9), weapon: part("weapon", 12) };
  if (!isLegalBuild(b)) throw new Error(`${id}: not a legal build`);
  if (buildTotal(b) !== 35) throw new Error(`${id}: totals ${buildTotal(b)}, want 35`);
  return b;
}

/** Gate (E): forty authored 35-point archetypes. Order per part:
 * legs speed/strength/dodge, arms damage/strength/block, torso
 * health/strength/luck, head accuracy/dodge/luck, weapon damage/attack
 * speed/accuracy. */
const ARCHETYPES: readonly { name: string; v: readonly number[] }[] = [
  { name: "Even Hands", v: [3, 2, 2, 2, 2, 3, 3, 2, 2, 3, 2, 2, 3, 2, 2] },
  { name: "Tank", v: [1, 4, 0, 1, 4, 3, 8, 4, 0, 2, 0, 0, 3, 2, 3] },
  { name: "Glass Cannon", v: [4, 0, 1, 7, 0, 0, 1, 0, 0, 4, 0, 0, 10, 6, 2] },
  { name: "Speedster", v: [10, 0, 2, 2, 0, 0, 2, 0, 0, 2, 1, 0, 3, 12, 1] },
  { name: "Dodger", v: [2, 0, 12, 1, 0, 1, 2, 0, 1, 1, 12, 0, 2, 0, 1] },
  { name: "Blocker", v: [1, 2, 0, 2, 3, 12, 4, 3, 0, 2, 0, 0, 3, 1, 2] },
  { name: "Lucky", v: [1, 0, 1, 1, 0, 1, 2, 0, 12, 1, 0, 12, 2, 1, 1] },
  { name: "Sniper", v: [2, 0, 1, 2, 0, 1, 2, 1, 0, 12, 0, 0, 3, 1, 10] },
  { name: "Strongman", v: [1, 12, 0, 1, 10, 0, 1, 7, 0, 1, 0, 0, 1, 1, 0] },
  { name: "Health Wall", v: [1, 1, 0, 1, 1, 1, 12, 4, 0, 2, 0, 0, 4, 4, 4] },
  { name: "Brawler", v: [2, 4, 0, 6, 4, 1, 3, 4, 0, 2, 0, 0, 6, 2, 1] },
  { name: "Fencer", v: [6, 0, 2, 2, 0, 1, 2, 0, 0, 6, 1, 0, 4, 6, 5] },
  { name: "Bruiser", v: [1, 1, 0, 8, 1, 1, 8, 1, 0, 2, 0, 0, 8, 1, 3] },
  { name: "Turtle", v: [1, 0, 4, 1, 0, 8, 8, 0, 0, 1, 4, 0, 3, 3, 2] },
  { name: "Gambler", v: [1, 0, 0, 6, 0, 0, 1, 0, 8, 1, 0, 8, 8, 1, 1] },
  { name: "Skirmisher", v: [4, 0, 6, 2, 0, 0, 2, 0, 0, 2, 6, 0, 3, 9, 1] },
  { name: "Guardian", v: [1, 6, 0, 2, 6, 8, 3, 6, 0, 1, 0, 0, 1, 0, 1] },
  { name: "Hunter", v: [2, 0, 1, 5, 0, 0, 2, 0, 0, 8, 0, 0, 7, 2, 8] },
  { name: "Juggernaut", v: [1, 3, 0, 4, 3, 0, 6, 3, 0, 1, 0, 0, 6, 4, 4] },
  { name: "Ghost", v: [3, 0, 8, 1, 0, 1, 2, 0, 5, 1, 8, 4, 1, 0, 1] },
  { name: "Hammer", v: [1, 0, 0, 12, 0, 0, 1, 0, 0, 1, 0, 0, 12, 4, 4] },
  { name: "Pacer", v: [8, 6, 0, 1, 6, 0, 2, 4, 0, 1, 0, 0, 2, 4, 1] },
  { name: "Aimed Tank", v: [1, 3, 0, 1, 3, 3, 6, 3, 0, 8, 0, 0, 2, 1, 4] },
  { name: "Quick Even", v: [5, 1, 2, 3, 1, 2, 3, 1, 1, 3, 2, 1, 3, 5, 2] },
  { name: "Bulwark", v: [2, 2, 6, 2, 2, 6, 4, 2, 0, 2, 4, 0, 1, 1, 1] },
  { name: "Crit Fisher", v: [2, 0, 0, 2, 0, 0, 1, 0, 10, 1, 0, 9, 2, 8, 0] },
  { name: "Iron Fist", v: [1, 5, 0, 5, 5, 0, 2, 5, 0, 4, 0, 0, 4, 0, 4] },
  { name: "Wisp", v: [8, 0, 6, 1, 0, 1, 2, 0, 1, 1, 6, 0, 2, 6, 1] },
  { name: "Anchor", v: [1, 1, 0, 1, 1, 9, 10, 1, 0, 2, 0, 0, 4, 2, 3] },
  { name: "Aimed Wall", v: [1, 2, 0, 1, 2, 10, 4, 2, 0, 6, 0, 0, 2, 1, 4] },
  { name: "Fast Tough", v: [6, 2, 0, 1, 2, 0, 8, 2, 0, 1, 0, 0, 3, 8, 2] },
  { name: "Sharp Dodger", v: [2, 0, 5, 1, 0, 0, 2, 0, 0, 9, 4, 0, 2, 2, 8] },
  { name: "Reckless", v: [2, 0, 0, 9, 0, 0, 2, 0, 0, 2, 0, 0, 8, 9, 3] },
  { name: "Slow Giant", v: [1, 8, 0, 2, 8, 0, 6, 8, 0, 1, 0, 0, 1, 0, 0] },
  { name: "Lucky Blocker", v: [1, 0, 0, 1, 0, 9, 2, 0, 8, 1, 0, 8, 3, 1, 1] },
  { name: "Heavy Weapon", v: [2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 4, 3, 3] },
  { name: "Dodge Tank", v: [1, 3, 8, 1, 3, 3, 6, 3, 0, 1, 4, 0, 1, 0, 1] },
  { name: "Precise Speed", v: [7, 0, 0, 2, 0, 0, 2, 0, 0, 7, 0, 0, 3, 8, 6] },
  { name: "Chipper", v: [1, 0, 0, 1, 0, 6, 3, 0, 0, 5, 0, 0, 2, 10, 7] },
  { name: "Strong Dodger", v: [2, 7, 5, 1, 7, 0, 1, 7, 0, 1, 3, 0, 1, 0, 0] },
];

/** Gate (C): the luck probe. Same total, one build holds 24 luck. */
const LUCKY35 = build35("lucky35", [1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 0, 12, 1, 1, 0]);
const NOLUCK35 = build35("noluck35", [3, 3, 3, 3, 3, 3, 3, 3, 0, 3, 3, 0, 2, 2, 1]);

/** Gate (F): the section-5 reward shape by power gap, linear between rows,
 * flat past the ends. Hundredths. */
const GAP_TABLE: readonly [number, number][] = [[-20, 30], [-10, 75], [0, 150], [10, 300], [20, 400], [30, 500]];
function gapMultiplier(gap: number): number {
  if (gap <= GAP_TABLE[0][0]) return GAP_TABLE[0][1];
  const last = GAP_TABLE[GAP_TABLE.length - 1];
  if (gap >= last[0]) return last[1];
  for (let i = 1; i < GAP_TABLE.length; i++) {
    const [g0, m0] = GAP_TABLE[i - 1];
    const [g1, m1] = GAP_TABLE[i];
    if (gap <= g1) return m0 + ((m1 - m0) * (gap - g0)) / (g1 - g0);
  }
  return last[1];
}

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

let failures = 0;
function report(ok: boolean, gate: string, msg: string, warn = false): void {
  const tag = ok ? (warn ? "[WARN]" : "[OK] ") : "[FAIL]";
  if (!ok) failures += 1;
  console.log(`${tag} bots ${gate} ${msg}`);
}

function gateB(n: number): void {
  const t3 = duel("B-t3t1", CANON.T3, CANON.T1, n);
  report(pct(t3.xWins, n) >= 95, "(B)", `T3 vs T1: ${pct(t3.xWins, n).toFixed(1)} percent (bar 95)`);
  const t2 = duel("B-t2t1", CANON.T2, CANON.T1, n);
  report(pct(t2.xWins, n) >= 70, "(B)", `T2 vs T1: ${pct(t2.xWins, n).toFixed(1)} percent (bar 70)`);
  const plus = duel("B-plus10", shapeAt("tinpup", 45), shapeAt("tinpup", 35), n);
  report(pct(plus.xWins, n) >= 62, "(B)", `+10 points at equal tier (Tin Pup 45 vs 35, both T2): ${pct(plus.xWins, n).toFixed(1)} percent (bar 62)`);
  for (const id of ["kettle", "clatter", "gremlin"]) {
    const o = duel(`B-plus10-${id}`, shapeAt(id, 45), shapeAt(id, 35), Math.max(1, Math.floor(n / 5)));
    console.log(`       info: +10 on ${SHAPE_INDEX[id].name} (45 vs 35): ${pct(o.xWins, o.n).toFixed(1)} percent over ${o.n}`);
  }
  const t4 = duel("B-t4t3", CANON.T4, CANON.T3, Math.max(1, Math.floor(n / 5)));
  const t3t2 = duel("B-t3t2", CANON.T3, CANON.T2, Math.max(1, Math.floor(n / 5)));
  console.log(`       info: T4 vs T3 ${pct(t4.xWins, t4.n).toFixed(1)} percent, T3 vs T2 ${pct(t3t2.xWins, t3t2.n).toFixed(1)} percent (one tier down, target ~25 for the weaker bot)`);
}

function gateC(n: number): void {
  const mirror = duel("C-mirror", CANON.T2, CANON.T2, n);
  const m = pct(mirror.xWins, n);
  report(Math.abs(m - 50) <= 2, "(C)", `T2 mirror: first-named side wins ${m.toFixed(1)} percent (want 50 within 2)`);
  const mirrorA = duel("C-mirror-sideA", CANON.T2, CANON.T2, n, false);
  console.log(`       info: side A wins the T2 mirror ${pct(mirrorA.xWins, n).toFixed(1)} percent when it never swaps sides`);
  const luck = duel("C-luck", LUCKY35, NOLUCK35, n);
  const l = pct(luck.xWins, n);
  report(l >= 40 && l <= 60, "(C)", `max-LUCK 35 vs no-luck 35: lucky wins ${l.toFixed(1)} percent (want 40..60)`);
}

function gateD(n: number): void {
  const pairings: [string, Build, Build][] = [
    ["T1vT1", CANON.T1, CANON.T1],
    ["T2vT2", CANON.T2, CANON.T2],
    ["T3vT3", CANON.T3, CANON.T3],
    ["T4vT4", CANON.T4, CANON.T4],
    ["T1vT2", CANON.T1, CANON.T2],
    ["T2vT3", CANON.T2, CANON.T3],
    ["T3vT4", CANON.T3, CANON.T4],
    ["Kettle35vHornet45", shapeAt("kettle", 35), shapeAt("hornet", 45)],
  ];
  const pooled: number[] = [];
  let timeouts = 0;
  let capNoTimeout = 0;
  let total = 0;
  console.log(`  ${"pairing".padEnd(18)} ${"median".padStart(7)} ${"p10".padStart(6)} ${"p90".padStart(6)} ${"min".padStart(6)} ${"max".padStart(6)} ${"timeouts".padStart(9)}`);
  for (const [name, a, b] of pairings) {
    const o = duel(`D-${name}`, a, b, n);
    const sorted = o.frames.slice().sort((x, y) => x - y);
    pooled.push(...o.frames);
    timeouts += o.timeouts;
    capNoTimeout += o.capNoTimeout;
    total += n;
    const med = quantile(sorted, 0.5);
    const flag = med < 60 * 25 || med > 60 * 60 ? "  <- outside 25..60 s" : "";
    console.log(
      `  ${name.padEnd(18)} ${secs(med).padStart(6)}s ${secs(quantile(sorted, 0.1)).padStart(5)}s ${secs(quantile(sorted, 0.9)).padStart(5)}s ` +
        `${secs(sorted[0]).padStart(5)}s ${secs(sorted[sorted.length - 1]).padStart(5)}s ${String(o.timeouts).padStart(9)}${flag}`,
    );
  }
  const sorted = pooled.sort((x, y) => x - y);
  const med = quantile(sorted, 0.5);
  const p10 = quantile(sorted, 0.1);
  const p90 = quantile(sorted, 0.9);
  const toPct = (timeouts * 100) / total;
  report(med >= 60 * 30 && med <= 60 * 55, "(D)", `pooled median ${secs(med)} s (want 30..55)`);
  report(p10 >= 60 * 18, "(D)", `pooled p10 ${secs(p10)} s (want >= 18)`);
  report(p90 <= 60 * 75, "(D)", `pooled p90 ${secs(p90)} s (want <= 75)`);
  report(toPct < 1, "(D)", `timeouts ${timeouts}/${total} = ${toPct.toFixed(2)} percent (want < 1)`);
  report(capNoTimeout === 0, "(D)", capNoTimeout === 0 ? "no fight reached the frame cap without a timeout event" : `${capNoTimeout} fights hit the cap with no timeout event`);
}

function gateE(e: number): void {
  const builds = ARCHETYPES.map((a, i) => build35(`arch${i}`, a.v));
  const wins = new Array<number>(builds.length).fill(0);
  const games = new Array<number>(builds.length).fill(0);
  const t0 = Date.now();
  let pairs = 0;
  for (let i = 0; i < builds.length; i++) {
    for (let j = i + 1; j < builds.length; j++) {
      for (let s = 0; s < e; s++) {
        const seed = fnv1a(`massim-E-${i}-${j}-${s}`);
        const iIsA = s % 2 === 0;
        const st = runFight(seed, iIsA ? builds[i] : builds[j], iIsA ? builds[j] : builds[i]).st;
        const iWon = st.winner === (iIsA ? 0 : 1);
        wins[iWon ? i : j] += 1;
        games[i] += 1;
        games[j] += 1;
      }
      pairs += 1;
    }
    if ((i + 1) % 10 === 0) console.log(`  [E] ${pairs} pairs done (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  const rows = builds.map((b, i) => ({ i, name: ARCHETYPES[i].name, rate: pct(wins[i], games[i]), agg: aggregates(b) }));
  rows.sort((x, y) => y.rate - x.rate);
  console.log(`  ${"archetype".padEnd(15)} ${"win".padStart(6)}  spd str dod dmg blk hp  lck acc asp`);
  for (const r of rows) {
    const a = r.agg;
    const flag = r.rate > 65 || r.rate < 35 ? "  <- outside 35..65" : "";
    console.log(
      `  ${r.name.padEnd(15)} ${r.rate.toFixed(1).padStart(5)}%  ${String(a.speed).padStart(3)} ${String(a.str).padStart(3)} ${String(a.dodge).padStart(3)} ` +
        `${String(a.dmg).padStart(3)} ${String(a.block).padStart(3)} ${String(a.health).padStart(3)} ${String(a.luck).padStart(3)} ${String(a.acc).padStart(3)} ${String(a.atkSpd).padStart(3)}${flag}`,
    );
  }
  const outside = rows.filter((r) => r.rate > 65 || r.rate < 35);
  report(
    outside.length === 0,
    "(E)",
    `${builds.length} archetypes round robin, ${e} seeds per pair: ${outside.length === 0 ? "every build inside 35..65" : `${outside.length} outside 35..65 (${outside.map((r) => `${r.name} ${r.rate.toFixed(1)}`).join(", ")})`}; ` +
      `best ${rows[0].name} ${rows[0].rate.toFixed(1)}, worst ${rows[rows.length - 1].name} ${rows[rows.length - 1].rate.toFixed(1)}`,
  );
}

function gateF(n: number): void {
  const gaps = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30];
  const probes: [string, string, number, number][] = [
    ["Tin Pup 45", "tinpup", 45, n],
    ["Kettle 60", "kettle", 60, Math.max(1, Math.floor(n / 4))],
  ];
  for (const [label, id, base, seeds] of probes) {
    console.log(`  attacker ${label} (side A, the challenger) vs the same shape at base + gap, ${seeds} seeds per gap`);
    console.log(`  ${"gap".padStart(5)} ${"win".padStart(7)} ${"mult".padStart(6)} ${"EV".padStart(7)}`);
    const ev: { gap: number; win: number; ev: number }[] = [];
    for (const gap of gaps) {
      const o = duel(`F-${id}-${base}-${gap}`, shapeAt(id, base), shapeAt(id, base + gap), seeds, false);
      const win = pct(o.xWins, seeds);
      const mult = gapMultiplier(gap) / 100;
      const value = (win * mult) / 100;
      ev.push({ gap, win, ev: value });
      console.log(`  ${String(gap).padStart(5)} ${win.toFixed(1).padStart(6)}% ${mult.toFixed(2).padStart(6)} ${value.toFixed(3).padStart(7)}`);
    }
    let peak = ev[0];
    for (const r of ev) if (r.ev > peak.ev) peak = r;
    // punching down (gap <= -20) must pay less than any challenge inside the
    // listed range (-15..+20); +25 and +30 are two weight classes up and the
    // doc's own model has them tied with -20 (0.30 vs 0.255), so they are
    // reported, not gated
    const low = ev.filter((r) => r.gap <= -20);
    const mid = ev.filter((r) => r.gap > -20 && r.gap <= 20);
    const tail = ev.filter((r) => r.gap > 20);
    const lowMax = Math.max(...low.map((r) => r.ev));
    const midMin = Math.min(...mid.map((r) => r.ev));
    const tailMin = Math.min(...tail.map((r) => r.ev));
    const gated = label === probes[0][0];
    const ok = peak.gap >= 5 && peak.gap <= 15 && lowMax < midMin;
    report(
      ok || !gated,
      "(F)",
      `${label}: EV peaks at gap ${peak.gap >= 0 ? "+" : ""}${peak.gap} (${peak.ev.toFixed(3)} per attack, want +5..+15); ` +
        `punching down (gap <= -20) tops out at ${lowMax.toFixed(3)} vs ${midMin.toFixed(3)} anywhere in -15..+20${lowMax < midMin ? "" : " (NOT the lowest)"}; ` +
        `two classes up (+25/+30) bottoms at ${tailMin.toFixed(3)}` +
        (gated ? "" : ok ? " [info]" : " [info, not gated]"),
      !gated && !ok,
    );
  }
}

/** (G) and (H) fixtures: the T2 family fighters and one unmatched T3 body.
 * The T3 body mixes the two T3 families (legs and torso from the first,
 * arms and head from the second) so it has no style set and, by the
 * catalog's varied colors, no color set; each bot carries its own tier's
 * mid weapon (WEAPON_OF_TIER). */
const T2_FAMILIES = FAMILIES.filter((f) => f.tier === 2);
const T3_FAMILIES = FAMILIES.filter((f) => f.tier === 3);
function mixedBody(a: string, b: string, weaponId: string): Build {
  const ca = familyCards(a);
  const cb = familyCards(b);
  return { legs: partOf(ca.legs), arms: partOf(cb.arms), torso: partOf(ca.torso), head: partOf(cb.head), weapon: partOf(PART_INDEX[weaponId]) };
}

function gateG(n: number): void {
  for (const fam of T2_FAMILIES) {
    const matched = familyBuild(fam.id, WEAPON_OF_TIER[2]);
    const o = duel(`G-${fam.id}`, matched, unmatchedTwin(matched), n);
    const w = pct(o.xWins, n);
    report(w >= 60, "(G)", `${fam.name} set (${buildTotal(matched)} points, +2 on every stat) vs the same body unmatched: ${w.toFixed(1)} percent (bar 60)`);
  }
  // info: paint alone (+1) and style plus paint (+3) on the first T2 family
  const base = familyBuild(T2_FAMILIES[0].id, WEAPON_OF_TIER[2]);
  const twin = unmatchedTwin(base);
  const half = Math.max(1, Math.floor(n / 2));
  const paintOnly = duel("G-paint", paintAll(twin, "mint"), twin, half);
  const both = duel("G-both", paintAll(base, "mint"), twin, half);
  console.log(
    `       info: ${T2_FAMILIES[0].name} body vs its unmatched twin over ${half}: paint set alone (+1) wins ${pct(paintOnly.xWins, half).toFixed(1)} percent, ` +
      `style and paint (+3) wins ${pct(both.xWins, half).toFixed(1)} percent`,
  );
}

function gateH(n: number): void {
  const t3 = mixedBody(T3_FAMILIES[0].id, T3_FAMILIES[1].id, WEAPON_OF_TIER[3]);
  if (setBonus(t3, CARD_INDEX).perStat !== 0) throw new Error("gate H: the mixed T3 body carries a set");
  for (const fam of T2_FAMILIES) {
    const matched = familyBuild(fam.id, WEAPON_OF_TIER[2]);
    const o = duel(`H-${fam.id}`, t3, matched, n);
    const w = pct(o.xWins, n);
    report(
      w >= 70,
      "(H)",
      `unmatched T3 body (${buildTotal(t3)} points, no set) vs the ${fam.name} set (${buildTotal(matched)} points, +2): T3 wins ${w.toFixed(1)} percent (bar 70)`,
    );
  }
  // info: the same bodies with equal weapons, so only the bodies differ
  const t3same = mixedBody(T3_FAMILIES[0].id, T3_FAMILIES[1].id, WEAPON_OF_TIER[2]);
  const half = Math.max(1, Math.floor(n / 2));
  for (const fam of T2_FAMILIES) {
    const matched = familyBuild(fam.id, WEAPON_OF_TIER[2]);
    const o = duel(`H-eq-${fam.id}`, t3same, matched, half);
    console.log(`       info: equal weapons (${PART_INDEX[WEAPON_OF_TIER[2]].name} both), unmatched T3 body vs the ${fam.name} set over ${half}: T3 wins ${pct(o.xWins, half).toFixed(1)} percent`);
  }
}

/** Info only (engine doc section 9, "samey fights"): how many distinct
 * break chains a T2 mirror produces, and the spread of breaks per fight. */
function infoChains(n: number): void {
  const chains = new Map<string, number>();
  const breakCounts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const st = runFight(fnv1a(`massim-chain-${i}`), CANON.T2, CANON.T2).st;
    const parts: string[] = [];
    let breaks = 0;
    for (const e of st.log) {
      if (e.t === "break") {
        parts.push(`${e.who}${["H", "B", "aL", "aR", "lL", "lR"][e.part]}`);
        if (e.part !== PIECE.BODY) breaks += 1;
      }
    }
    const key = parts.join(" ");
    chains.set(key, (chains.get(key) ?? 0) + 1);
    breakCounts.set(breaks, (breakCounts.get(breaks) ?? 0) + 1);
  }
  const sorted = Array.from(chains.entries()).sort((a, b) => b[1] - a[1]);
  let covered = 0;
  let k = 0;
  for (const [, c] of sorted) {
    covered += c;
    k += 1;
    if (covered * 100 >= n * 80) break;
  }
  const spread = Array.from(breakCounts.entries()).sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b} breaks: ${((c * 100) / n).toFixed(0)}%`).join(", ");
  console.log(`  info: T2 mirror over ${n} seeds has ${sorted.length} distinct break chains; ${k} chains cover 80 percent; ${spread}`);
  console.log(`  info: top chains ${sorted.slice(0, 5).map(([key, c]) => `[${key}] x${c}`).join("  ")}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "src", "app", "bots", "_engine"))) {
  console.error("Run from the web3guides repo root (src/app/bots/_engine not found under cwd).");
  process.exit(2);
}

const argv = process.argv.slice(2);
function flag(name: string, dflt: number): number {
  const hit = argv.find((x) => x.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const v = parseInt(hit.slice(name.length + 3), 10);
  if (!Number.isFinite(v) || v < 1) {
    console.error(`Bad --${name} value: ${hit}`);
    process.exit(2);
  }
  return v;
}
const N = flag("n", 10000);
const E = flag("e", 200);
const only = argv.filter((x) => !x.startsWith("--")).map((x) => x.toUpperCase());
const want = (g: string): boolean => only.length === 0 || only.includes(g);

console.log(`BATTLE BOTS MASS-SIM: N=${N} seeds per check, E=${E} seeds per archetype pair`);
const tAll = Date.now();
const timed = (name: string, fn: () => void): void => {
  if (!want(name)) return;
  console.log(`\n=== gate ${name} ===`);
  const t0 = Date.now();
  fn();
  console.log(`  [${name}] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
};
timed("B", () => gateB(N));
timed("C", () => gateC(N));
timed("D", () => gateD(N));
timed("E", () => gateE(E));
timed("F", () => gateF(N));
timed("G", () => gateG(N));
timed("H", () => gateH(N));
timed("CHAINS", () => infoChains(Math.min(N, 2000)));

console.log(`\ntotal wall clock ${((Date.now() - tAll) / 1000).toFixed(1)}s`);
console.log(failures === 0 ? "ALL GREEN" : `${failures} FAILED`);
if (failures > 0) process.exit(1);
