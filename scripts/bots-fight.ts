/**
 * BATTLE BOTS CLI FIGHT PRINTER - fun test 0. Prints one fight as the
 * commentary bar would read it, with timestamps, then the result line and
 * the chain summary. Read three of these out loud before any pixel exists
 * (engine doc section 8, week 1).
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/bots-fight.ts <seed> <fighter> <fighter> [--stanceA n] [--focusA n] [--stanceB n] [--focusB n]
 *
 * A fighter is T1 | T2 | T3 | T4 (the reference fighters),
 * shape:<name>@<total> (a house shape scaled, e.g. shape:Kettle@35),
 * set:<family> (a full family body plus its tier's mid weapon, the matched
 * set, e.g. set:kettle) or twin:<family> (the same body unmatched, for a
 * side-by-side read). The seed is a whole number, or any string (hashed
 * with fnv1a the way the server hashes a fight id).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fnv1a } from "../src/app/bots/_engine/rng";
import { NO_ORDERS, botTier, buildTotal, type Build, type CanonKey, type Orders } from "../src/app/bots/_engine/parts";
import { CANON, CANON_NAMES, FAMILIES, FAMILY_INDEX, SHAPES, WEAPON_OF_TIER, familyBuild, scaleShape, unmatchedTwin } from "../src/app/bots/_engine/catalog";
import { blockChance, deriveFighter, describeSet, hitChance } from "../src/app/bots/_engine/derive";
import { runFight, resultOf } from "../src/app/bots/_engine/resolve";
import { chainSummary, narrate } from "../src/app/bots/_engine/commentary";

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "src", "app", "bots", "_engine"))) {
  console.error("Run from the web3guides repo root (src/app/bots/_engine not found under cwd).");
  process.exit(2);
}

function parseSeed(raw: string): number {
  return /^\d+$/.test(raw) ? Number(raw) >>> 0 : fnv1a(raw);
}

function parseFighter(raw: string): { build: Build; name: string } {
  const canon = raw.toUpperCase();
  if (/^T[1-4]$/.test(canon)) {
    const key = canon as CanonKey;
    return { build: CANON[key], name: CANON_NAMES[key] };
  }
  const m = /^shape:([A-Za-z ]+)@(\d+)$/.exec(raw);
  if (m) {
    const want = m[1].toLowerCase().replace(/\s+/g, "");
    const shape = SHAPES.find((s) => s.id === want || s.name.toLowerCase().replace(/\s+/g, "") === want);
    if (!shape) {
      console.error(`Unknown house shape "${m[1]}". Shapes: ${SHAPES.map((s) => s.name).join(", ")}`);
      process.exit(2);
    }
    return { build: scaleShape(shape, Number(m[2])), name: shape.name };
  }
  const fam = /^(set|twin):([A-Za-z]+)$/.exec(raw);
  if (fam) {
    const f = FAMILY_INDEX[fam[2].toLowerCase()];
    if (!f) {
      console.error(`Unknown family "${fam[2]}". Families: ${FAMILIES.map((x) => x.name).join(", ")}`);
      process.exit(2);
    }
    const matched = familyBuild(f.id, WEAPON_OF_TIER[f.tier]);
    return fam[1] === "set" ? { build: matched, name: `${f.name} Set` } : { build: unmatchedTwin(matched), name: `${f.name} Twin` };
  }
  console.error(`Bad fighter "${raw}". Use T1 | T2 | T3 | T4, shape:<name>@<total>, set:<family> or twin:<family>.`);
  process.exit(2);
}

function flag(argv: string[], name: string, dflt: number): number {
  const i = argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= argv.length) return dflt;
  return Number(argv[i + 1]) | 0;
}

/** frames -> "12.3s" with whole-number math (one decimal). */
function stamp(f: number): string {
  const whole = Math.floor(f / 60);
  const tenth = Math.floor(((f % 60) * 10) / 60);
  return `${String(whole).padStart(2, " ")}.${tenth}s`;
}

const argv = process.argv.slice(2);
const positional = argv.filter((x, i) => !x.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
if (positional.length < 3) {
  console.error("usage: npx tsx scripts/bots-fight.ts <seed> <T1|T2|T3|T4|shape:Kettle@35|set:kettle|twin:kettle> <same>");
  process.exit(2);
}

const seed = parseSeed(positional[0]);
const A = parseFighter(positional[1]);
const B = parseFighter(positional[2]);
if (A.name === B.name) {
  A.name = `${A.name} A`;
  B.name = `${B.name} B`;
}
const oa: Orders = { ...NO_ORDERS, stance: flag(argv, "stanceA", 0) as Orders["stance"], focus: flag(argv, "focusA", 0) as Orders["focus"] };
const ob: Orders = { ...NO_ORDERS, stance: flag(argv, "stanceB", 0) as Orders["stance"], focus: flag(argv, "focusB", 0) as Orders["focus"] };

const fa = deriveFighter(A.build, oa);
const fb = deriveFighter(B.build, ob);
const names: [string, string] = [A.name, B.name];

console.log(`seed ${seed}: ${A.name} (T${botTier(buildTotal(A.build))}, ${buildTotal(A.build)} points) vs ${B.name} (T${botTier(buildTotal(B.build))}, ${buildTotal(B.build)} points)`);
for (const [n, f, other, b] of [[A.name, fa, fb, A.build], [B.name, fb, fa, B.build]] as const) {
  console.log(
    `  ${n.padEnd(12)} body ${f.bodyArmor}, limbs ${f.limbArmor}, ${f.damagePerHit} per hit, swings every ${f.interval} frames, ` +
      `hits ${hitChance(f.acc, other.dodge)} percent, blocks ${blockChance(f.block)} percent, crit ${f.critChance} percent`,
  );
  // the set readout, only for a body that has a style line or a paint
  const set = describeSet(b);
  if (set.family || set.color) console.log(`  ${"".padEnd(12)} ${set.lines.join(". ")}`);
}
console.log("");

const fight = runFight(seed, A.build, B.build, oa, ob, "spar");
const result = resultOf(fight);
for (const line of narrate(result.log, names)) console.log(`[${stamp(line.f)}] ${line.text}`);

const secs = Math.floor(result.frames / 60);
const winner = names[result.winner];
console.log("");
console.log(result.end === "ko" ? `KO in ${secs} s. ${winner} wins.` : `Time at ${secs} s. ${winner} wins.`);
console.log(chainSummary(result.log, names));
console.log(`hash ${(result.hash >>> 0).toString(16).padStart(8, "0")}, engine v${result.engineVersion}, ${result.log.length} events`);
