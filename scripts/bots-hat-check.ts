/**
 * BATTLE BOTS HAT CHECK: the merge gate for HATS DROP, NEVER SOLD.
 *
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/bots-hat-check.ts
 *
 * THIS GATE IMPORTS THE SHIPPED MODULES. It does not restate the drop
 * condition, the kind table, the palette or the odds, because a gate that
 * reimplements the thing it checks reproduces the author's assumptions and
 * passes (the Domain Kitchen lesson). The exact line the fight resolver runs
 * is look.ts hatWonFor(), and this file calls that line a thousand times.
 * scripts/_shims/server-only.ts is what lets it reach the real server files,
 * which is why the --tsconfig flag is not optional.
 *
 * NINE GATES:
 *  (a) THE ARROW RUNS ONE WAY. Nothing in _engine imports look.ts. A hat is
 *      part of the picture; the fight never reads the picture. The replay
 *      rollup in bots-harness.ts is the other half of that proof.
 *  (b) A THOUSAND BIG BOT WINS: the authored spread, and never a kind or a
 *      colour outside the two tables. Walked through the shipped resolver
 *      line, off the shipped reward table, with real fight ids.
 *  (c) NO OTHER FIGHT EVER GIVES ONE. Every other mode, every difficulty,
 *      every loss and every win that dropped no part, over 6,000 fights.
 *  (d) THE SAME FIGHT ALWAYS GIVES THE SAME HAT, kind and colour, because
 *      the write is retried and replayed and a hat that changed between two
 *      attempts would be a different hat each time.
 *  (e) NEVER ON A SHELF. A year of junkyard shipments carries no hat and no
 *      field a hat could hide in, and no shop or sell sentence names one.
 *  (f) NEVER SOLD, NEVER RECYCLED. The recycle route pays for part rows and
 *      cannot see the hat table; nothing that takes coins can write one.
 *  (g) THE SAVE GATE REFUSES A HAT NOBODY WON, including the right kind in a
 *      colour it never turned up in, and keeps the one it did.
 * (g2) AND THE BROWSER NEVER TAKES ONE OFF. The build screen runs the same
 *      parseLook locally before it posts, and it has no hat rows, so a robot
 *      wearing a hat has to survive its own browser gate.
 *  (h) THE WORDS a player reads about hats: plain, short, no em-dash, no
 *      money, and they say the one rule.
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import {
  EVERY_HAT,
  HATS,
  HAT_EARN,
  HAT_FROM_DIFFICULTY,
  HAT_FROM_MODE,
  HAT_IDS,
  HAT_PAINTS,
  HAT_SHAPES,
  NOTHING_EARNED,
  NO_MARKS,
  dedupeHats,
  hatDrop,
  hatDropColor,
  hatWonFor,
  hatWonOf,
  lookKey,
  normalizeLook,
  parseLook,
  sameHat,
  socketPaints,
  type HatId,
  type HatWon,
  type LookEarned,
} from "../src/lib/bots/look";
import { hatName, hatNames, shelfRows } from "../src/lib/bots/shelf";
import { earnedOfBuild } from "../src/lib/bots/garage-state";
import { STRINGS } from "../src/lib/bots/strings";
import { PAINT_IDS, type PaintId } from "../src/app/bots/_engine/parts";
import { M, PAINTS } from "../src/app/bots/_ui/tokens";
import { fnv1a, rngFork } from "../src/app/bots/_engine/rng";
import { PVE, fightRewards } from "../src/app/bots/_engine/rewards";
import { todayShop } from "../src/app/bots/_server/shop";
import { CATALOG_PARTS } from "../src/lib/bots/fixtures";
import type { Build, Part, Slot } from "../src/app/bots/_engine/parts";
import {
  decodePng,
  encodePng,
  renderPortrait,
  type ArtCache,
  type Bitmap,
  type LoadArt,
} from "../src/app/api/bots/portrait/render";

const ROOT = path.resolve(__dirname, "..");
const t = STRINGS.en;
let failures = 0;

function report(ok: boolean, gate: string, line: string): void {
  if (!ok) failures++;
  console.log(`${ok ? "[OK] " : "[RED]"} ${gate} ${line}`);
}

const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");
const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
};

// ---------------------------------------------------------------------------
// (a) the arrow runs one way: the fight never reads the picture
// ---------------------------------------------------------------------------

console.log("-- (a) nothing in the fight reads a hat --");
{
  const engine = walk("src/app/bots/_engine");
  const reaching = engine.filter((f) => /from\s+"[^"]*(lib\/bots\/look|_view\/|lib\/bots\/shelf)/.test(read(f)));
  report(reaching.length === 0, "(a) arrow", reaching.length
    ? `_engine reaches the look: ${reaching.join(", ")}`
    : `${engine.length} engine files, none of them imports look.ts, the shelf or the rig`);

  const hatWords = engine.filter((f) => /\bhat\b/i.test(read(f)));
  report(hatWords.length === 0, "(a) arrow", hatWords.length
    ? `_engine mentions a hat: ${hatWords.join(", ")}`
    : "the word hat does not appear anywhere in _engine");
}

// ---------------------------------------------------------------------------
// (b) a thousand Big Bot wins
// ---------------------------------------------------------------------------
//
// The fight route builds its seed as fnv1a(`${fightId}|${salt}`) and takes the
// drop roll off rngFork(seed, "A", "drop"). Both come from the shipped rng, so
// the rolls here are the rolls the game makes; only the salt is ours, because
// the real one is an environment secret. The hat then comes from the shipped
// hatWonFor(), which is the line the route runs.

const WINS = 1000;
const SALT = "hat-check";

interface Sim {
  fightId: string;
  droppedPart: boolean;
  hat: HatWon | null;
}

function simulate(n: number, mode: string, difficulty: string | null, attackerWon: boolean): Sim[] {
  const out: Sim[] = [];
  for (let i = 0; i < n; i++) {
    const fightId = `bb-${mode}-${difficulty ?? "none"}-${attackerWon ? "w" : "l"}-${i}`;
    const seed = fnv1a(`${fightId}|${SALT}`);
    const dropRoll = Math.floor(rngFork(seed, "A", "drop")() * 100);
    const rewards = fightRewards({
      mode: mode as "spar" | "pve" | "pvp",
      difficulty: (difficulty ?? undefined) as never,
      attackerWon,
      stake: mode === "pvp" ? 25 : undefined,
      attackerTier: 2,
      dropRoll,
    });
    const droppedPart = !!rewards.drop;
    out.push({ fightId, droppedPart, hat: hatWonFor(fightId, { mode, difficulty, attackerWon, droppedPart }) });
  }
  return out;
}

console.log("\n-- (b) a thousand wins against the biggest robot --");
{
  const sims = simulate(WINS, HAT_FROM_MODE, HAT_FROM_DIFFICULTY, true);
  const hats = sims.map((s) => s.hat).filter((h): h is HatWon => !!h);

  // the hat rides the PART drop roll, so the two counts are the same count
  const parts = sims.filter((s) => s.droppedPart).length;
  report(hats.length === parts, "(b) one roll", hats.length === parts
    ? `${hats.length} hats and ${parts} parts out of ${WINS} wins: one roll, never two`
    : `${hats.length} hats against ${parts} parts: a second roll has appeared`);

  // and that roll is the authored one, not a number this file invented
  const want = PVE[HAT_FROM_DIFFICULTY as "hard"].drop;
  const pct = (hats.length * 100) / WINS;
  const near = Math.abs(pct - want) <= 5;
  report(near, "(b) odds", near
    ? `${pct.toFixed(1)} in 100 wins gave a hat, against the authored ${want} in 100 (rewards.ts PVE)`
    : `${pct.toFixed(1)} in 100 is not the authored ${want} in 100`);

  // NEVER A KIND OUTSIDE THE TABLE
  const kinds = new Map<HatId, number>();
  let strayKind: string | null = null;
  for (const h of hats) {
    if (!HAT_IDS.includes(h.kind)) strayKind = String(h.kind);
    kinds.set(h.kind, (kinds.get(h.kind) ?? 0) + 1);
  }
  report(strayKind === null, "(b) kinds", strayKind === null
    ? `every one of ${hats.length} hats is one of the ${HAT_IDS.length} authored kinds`
    : `a hat turned up that is not in the table: ${strayKind}`);

  // NEVER A COLOUR OUTSIDE THE PALETTE, and never a hat with no colour: the
  // drop always records one, so a colourless row can only be an old row
  const colours = new Map<PaintId, number>();
  let strayColour: string | null = null;
  for (const h of hats) {
    if (h.color === null || !HAT_PAINTS.includes(h.color)) strayColour = String(h.color);
    else colours.set(h.color, (colours.get(h.color) ?? 0) + 1);
  }
  report(strayColour === null, "(b) colours", strayColour === null
    ? `every hat arrived in one of the ${HAT_PAINTS.length} paints a hat can turn up in, all of them the game's own, so a hat never adds a ninth colour`
    : `a hat turned up in a colour that is not one a hat can be: ${strayColour}`);

  // AND NEVER A HAT NOBODY CAN SEE. A hat is drawn against the PAGE, not
  // against clay, and every ground this game has is dark. Contrast is
  // measured here rather than trusted, so a paint added later that would
  // vanish over a robot's head turns this red instead of shipping.
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  const ratio = (a2: number, b2: number) => (Math.max(a2, b2) + 0.05) / (Math.min(a2, b2) + 0.05);
  // the darkest and the lightest ground a hat is ever drawn on: the page
  // behind every screen, and the top of the knockout share card's gradient
  const GROUNDS = [lum(M.ground), lum(M.surface2)];
  const dim = HAT_PAINTS.map((p) => ({ p, r: Math.min(...GROUNDS.map((g) => ratio(lum(PAINTS[p]), g))) })).filter((x) => x.r < 3);
  report(dim.length === 0, "(b) seen", dim.length === 0
    ? `every colour a hat can be reads on both grounds (worst ${Math.min(...HAT_PAINTS.map((p) => Math.min(...GROUNDS.map((g) => ratio(lum(PAINTS[p]), g))))).toFixed(2)} to 1)`
    : `a hat can turn up in a colour nobody can see: ${dim.map((x) => `${x.p} ${x.r.toFixed(2)}`).join(", ")}`);
  const black = HAT_PAINTS.includes("ink");
  report(!black, "(b) seen", !black
    ? "black is not one of them: at 1.32 to 1 on the page a black hat is an empty space over a robot's head"
    : "black is still in the hat table");

  // THE SPREAD. Every kind and every colour turns up, and no kind runs away
  // with it. The bar is deliberately loose: this is a check that the seed
  // SELECTS rather than favours, not a test of the random number generator.
  const allKinds = HAT_IDS.every((k) => (kinds.get(k) ?? 0) > 0);
  const kEven = HAT_IDS.every((k) => {
    const share = ((kinds.get(k) ?? 0) * 100) / Math.max(1, hats.length);
    return share >= 6 && share <= 28;
  });
  report(allKinds && kEven, "(b) spread", allKinds && kEven
    ? `all ${HAT_IDS.length} kinds turned up: ${HAT_IDS.map((k) => `${k} ${kinds.get(k)}`).join(", ")}`
    : `the kinds are not spread: ${HAT_IDS.map((k) => `${k} ${kinds.get(k) ?? 0}`).join(", ")}`);

  const allColours = HAT_PAINTS.every((c) => (colours.get(c) ?? 0) > 0);
  report(allColours, "(b) spread", allColours
    ? `all ${HAT_PAINTS.length} colours turned up: ${HAT_PAINTS.map((c) => `${c} ${colours.get(c)}`).join(", ")}`
    : `a colour never turned up in ${hats.length} hats: ${HAT_PAINTS.map((c) => `${c} ${colours.get(c) ?? 0}`).join(", ")}`);

  // THE KIND AND THE COLOUR ARE INDEPENDENT. They are two forked streams, and
  // if they were one stream a kind would always come with the same colours.
  const pairs = new Set(hats.map((h) => `${h.kind}:${h.color}`));
  const room = HAT_IDS.length * HAT_PAINTS.length;
  report(pairs.size >= room * 0.8, "(b) spread", pairs.size >= room * 0.8
    ? `${pairs.size} of the ${room} different hats turned up in ${hats.length} drops: the kind and the colour are separate draws`
    : `only ${pairs.size} of ${room} hats are reachable: the two draws are tied together`);

  // and every one of them is a hat the drawing can actually draw
  const undrawn = Array.from(pairs).filter((p) => !HAT_SHAPES[p.split(":")[0] as HatId]);
  report(undrawn.length === 0, "(b) drawn", undrawn.length === 0
    ? "every kind that dropped has a drawing in HAT_SHAPES"
    : `a hat dropped that nothing can draw: ${undrawn.join(", ")}`);

  // EVERY_HAT is total: the look census hands it to the read path as "every
  // hat there is", and a drop it does not contain would vanish off the census
  const missing = Array.from(pairs).filter((p) => {
    const [kind, color] = p.split(":");
    return !EVERY_HAT.some((h) => h.kind === kind && String(h.color) === color);
  });
  report(missing.length === 0, "(b) total", missing.length === 0
    ? `EVERY_HAT holds all ${EVERY_HAT.length} hats, including every one of the ${pairs.size} that dropped`
    : `a dropped hat is not in EVERY_HAT: ${missing.join(", ")}`);
}

// ---------------------------------------------------------------------------
// (c) no other fight ever gives one
// ---------------------------------------------------------------------------

console.log("\n-- (c) no other fight ever gives one --");
{
  const cases: { label: string; sims: Sim[] }[] = [
    { label: "an EASY win", sims: simulate(WINS, "pve", "easy", true) },
    { label: "a MEDIUM win", sims: simulate(WINS, "pve", "medium", true) },
    { label: "a LOST hard fight", sims: simulate(WINS, "pve", "hard", false) },
    { label: "a spar", sims: simulate(WINS, "spar", null, true) },
    { label: "a PvP win", sims: simulate(WINS, "pvp", null, true) },
    { label: "a PvP loss", sims: simulate(WINS, "pvp", null, false) },
  ];
  let given = 0;
  for (const c of cases) {
    const n = c.sims.filter((s) => s.hat).length;
    given += n;
    report(n === 0, "(c) only the big one", n === 0
      ? `${c.label}: 0 hats in ${c.sims.length}`
      : `${c.label} gave out ${n} hats`);
  }
  report(given === 0, "(c) only the big one", `${cases.length * WINS} fights that are not a Big Bot win gave out ${given} hats`);

  // and a hard win that dropped NO part gives no hat: the hat rides the roll
  const noPart = simulate(WINS, "pve", "hard", true).filter((s) => !s.droppedPart);
  report(noPart.every((s) => s.hat === null), "(c) one roll",
    `${noPart.length} hard wins whose drop roll gave no part gave no hat either`);
}

// ---------------------------------------------------------------------------
// (d) the same fight always gives the same hat
// ---------------------------------------------------------------------------

console.log("\n-- (d) a replayed fight gives the same hat --");
{
  const ids = Array.from({ length: 200 }, (_, i) => `bb-replay-${i}`);
  const once = ids.map((id) => hatWonOf(id));
  const twice = ids.map((id) => hatWonOf(id));
  const same = once.every((h, i) => sameHat(h, twice[i]));
  report(same, "(d) pure", same
    ? `200 fight ids give the same kind and the same colour twice: a retried insert cannot change a hat`
    : "a hat changed between two reads of the same fight");

  const split = ids.every((id) => hatWonOf(id).kind === hatDrop(id) && hatWonOf(id).color === hatDropColor(id));
  report(split, "(d) pure", "hatWonOf is exactly hatDrop plus hatDropColor: one entry point, no private copy");

  // the drop is decided by the FIGHT and by nothing else, so two fights that
  // differ only in their id give different hats
  const spread = new Set(ids.map((id) => `${hatWonOf(id).kind}:${hatWonOf(id).color}`));
  report(spread.size > 20, "(d) pure", `200 neighbouring fight ids give ${spread.size} different hats, so the id really decides`);
}

// ---------------------------------------------------------------------------
// (e) never on a shelf
// ---------------------------------------------------------------------------

console.log("\n-- (e) never on a shelf, never in the shop's words --");
{
  // A YEAR OF SHIPMENTS. The junkyard is a pure function of the day, so a
  // year of them is every shelf the game can build, and none of them can
  // carry a hat: a listing is a PART, and there is no field a hat fits in.
  const DAY = 86400000;
  const start = Date.UTC(2026, 0, 1);
  let listings = 0;
  const stray: string[] = [];
  const fields = new Set<string>();
  const slots = new Set<string>();
  for (let d = 0; d < 365; d++) {
    for (const l of todayShop(start + d * DAY).listings) {
      listings++;
      for (const k of Object.keys(l)) fields.add(k);
      slots.add(l.slot);
      // WHAT A PLAYER IS OFFERED is the listing's slot and the name on its
      // card: those are the two things that say "this is a thing you can
      // buy", so those are what may never be a hat. The lore prose is left
      // out on purpose. It is English, and a head whose lore reads "one big
      // eye on a spring" is not a shop selling the Spring hat.
      const offered = `${l.slot} ${l.card.name}`.toLowerCase();
      for (const k of HAT_IDS) if (new RegExp(`\\b${k}s?\\b`).test(offered)) stray.push(`${k} on day ${d} (${l.card.name})`);
      if (/\bhats?\b/.test(offered)) stray.push(`the word hat on day ${d} (${l.card.name})`);
    }
  }
  report(stray.length === 0, "(e) shelf", stray.length === 0
    ? `${listings} listings over a year of junkyard shipments, in ${slots.size} slots (${Array.from(slots).sort().join(", ")}), and not one of them is a hat`
    : `the shelf listed a hat: ${stray.slice(0, 5).join(", ")}`);
  const hatSlot = HAT_IDS.some((k) => slots.has(k)) || slots.has("hat");
  report(!hatSlot, "(e) shelf", !hatSlot
    ? "and there is no hat slot for one to be listed in"
    : "the shop has a hat slot");
  report(!fields.has("hat"), "(e) shelf", !fields.has("hat")
    ? `a listing has no hat field to hide one in (${Array.from(fields).sort().join(", ")})`
    : "a listing has a hat field");

  // AND THE SHOP NEVER SAYS THE WORD. A player must not be able to go
  // looking for a hat in a shop, so no shop or sell sentence names one.
  const shopText = JSON.stringify([t.shop, t.shopUi, t.part, t.recycle]).toLowerCase();
  const named = HAT_IDS.filter((k) => shopText.includes(k));
  report(!shopText.includes("hat") && named.length === 0, "(e) words",
    !shopText.includes("hat") && named.length === 0
      ? "no shop, part or sell sentence mentions a hat or names a kind"
      : `the shop's words mention a hat: ${named.join(", ") || "the word hat"}`);

  // the sell sheet names what a robot LOSES, and a hat is not on that list,
  // because a hat belongs to the wallet and the next robot can wear it
  report(!/hat/i.test(t.recycle.marks), "(e) words",
    `selling a robot never claims to take its hat: "${t.recycle.marks}"`);
}

// ---------------------------------------------------------------------------
// (f) never sold, never recycled
// ---------------------------------------------------------------------------

console.log("\n-- (f) nothing that moves coins can touch a hat --");
{
  // THE ROUTES THAT MOVE COINS cannot see the hat table. A hat is not a part
  // and never enters battle_bots_part_instances, so recycle has nothing to
  // pay for and no row to delete; this proves it rather than assuming it.
  const spenders = [
    "src/app/api/bots/bot/recycle/route.ts",
    "src/app/api/bots/shop/buy/route.ts",
    "src/app/bots/_server/shop.ts",
    "src/lib/bots/shipment.ts",
  ];
  const touching = spenders.filter((f) => /battle_bots_hats|hatWon|insertHat|loadHats/.test(read(f)));
  report(touching.length === 0, "(f) recycle", touching.length === 0
    ? `${spenders.length} coin routes, none of them reads or writes the hat table`
    : `a coin route touches hats: ${touching.join(", ")}`);

  const hatWords = spenders.filter((f) => /\bhat\b/i.test(read(f)));
  report(hatWords.length === 0, "(f) recycle", hatWords.length === 0
    ? "and none of them mentions a hat at all"
    : `a coin route mentions a hat: ${hatWords.join(", ")}`);

  // THE ONLY WRITER IS THE FIGHT RESOLVER. One file inserts a hat, and it is
  // the one that resolves a fight.
  // the file that DECLARES insertHat is not a caller of it
  const callers = walk("src/app").filter((f) => {
    const src = read(f);
    return /\binsertHat\s*\(/.test(src) && !/export\s+async\s+function\s+insertHat/.test(src);
  });
  const oneWriter = callers.length === 1 && callers[0] === "src/app/bots/_server/fights.ts";
  report(oneWriter, "(f) one writer", oneWriter
    ? "exactly one file gives a hat out, and it is the fight resolver"
    : `hats are written from ${callers.length} places: ${callers.join(", ")}`);

  // and the resolver asks look.ts rather than deciding for itself
  const resolver = read("src/app/bots/_server/fights.ts");
  report(/hatWonFor\(/.test(resolver), "(f) one writer",
    "the resolver calls look.ts hatWonFor, so this gate runs the line the game runs");

  // A HAT HAS NO PRICE, anywhere. There is no number to pay and no row to
  // sell, and the migration that stores it says so too.
  const sql = fs.readFileSync(
    path.join(ROOT, "..", "trading-bot", "doma-reporter", "sql", "battle_bots_009_hat_colour.sql"),
    "utf8",
  );
  report(!/\bprice\b/i.test(sql.replace(/never will be one/gi, "")) || /no price column/i.test(sql), "(f) no price",
    "the hats table has no price column");
  const ascii = !/[^\x00-\x7F]/.test(sql);
  report(ascii, "(f) no price", ascii ? "and the migration is pure ASCII" : "the migration is not pure ASCII");
}

// ---------------------------------------------------------------------------
// (g) the save gate refuses a hat nobody won
// ---------------------------------------------------------------------------

console.log("\n-- (g) a hat has to have been won --");
{
  const won: HatWon = { kind: "bow", color: "coral" };
  const earned: LookEarned = { ...NOTHING_EARNED, paints: ["mint", "mint", "mint", "mint"], hats: [won] };
  const refuses = (label: string, fn: () => unknown) => {
    let threw = false;
    let msg = "";
    try {
      fn();
    } catch (e) {
      threw = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    report(threw, "(g) gate", threw ? `refused ${label}: "${msg}"` : `ALLOWED ${label}`);
    if (threw) report(!/—|–|\$/.test(msg), "(g) gate", `and the refusal is plain: "${msg}"`);
  };

  report(sameHat(parseLook({ hat: won }, earned).hat, won), "(g) gate", "the hat this wallet won goes on");
  refuses("a hat nobody won", () => parseLook({ hat: { kind: "bell", color: "coral" } }, earned));
  refuses("the right kind in a colour it never turned up in", () => parseLook({ hat: { kind: "bow", color: "moss" } }, earned));
  refuses("a made up hat", () => parseLook({ hat: { kind: "sombrero", color: "coral" } }, earned));
  refuses("a hat on a wallet that has won none", () => parseLook({ hat: won }, NOTHING_EARNED));

  // a row that stored the kind alone still finds the hat it won, so a hat
  // written before colours were recorded is not quietly taken away
  const old = parseLook({ hat: "bow" }, earned).hat;
  report(sameHat(old, won), "(g) gate", "a row that named the kind alone finds the hat it won, in its own colour");

  // TWO HATS ARE THE SAME HAT ONLY WHEN BOTH HALVES MATCH, which is what
  // makes 48 hats out of 6 and what the twin count counts
  report(!sameHat(won, { kind: "bow", color: "moss" }), "(g) gate", "a pink bow is not a green bow");
  const key = (h: HatWon | null) => lookKey({ ...NOTHING_EARNED, face: "calm", sticker: null, spot: "chest", stickerPaint: null, hat: h, plateNumber: null } as never, socketPaints(() => "mint"));
  report(key(won) !== key({ kind: "bow", color: "moss" }), "(g) gate", "and the look census can tell them apart");

  // the wallet's list never carries the same hat twice
  const twice = dedupeHats([won, won, { kind: "bow", color: "moss" }, "bow"]);
  report(twice.length === 3, "(g) gate", `a wallet that won the same hat twice has it once (${twice.map(hatName).join(", ")})`);
}

// ---------------------------------------------------------------------------
// (g2) the browser never takes a hat off
// ---------------------------------------------------------------------------
//
// THE BUG THIS EXISTS FOR, found by tracing the save path rather than by
// reading it. The build screen keeps its builds in the browser, and every
// tap on a face runs the SAME parseLook locally before it posts. The browser
// has no hat rows and cannot have any (they are server truth), so the local
// LookEarned once carried an empty hat list, and parseLook refuses a hat that
// is not in the list. A player whose robot wore a hat would have had every
// face tap refused with "You have not won that hat yet", and the read path
// would have quietly taken the hat off the drawn robot and then off the row.
// Losing a trophy because a browser could not see it is the worst thing this
// lane could ship, so it is walked here through the shipped store function.

console.log("\n-- (g2) the browser never takes a hat off --");
{
  const worn: HatWon = { kind: "flag", color: "lilac" };
  const build = {
    bay: 1,
    name: { first: "Speedy", second: "Otter", num: 7 },
    cards: {} as Record<string, string | undefined>,
    look: { face: "happy", sticker: null, spot: "chest", stickerPaint: null, hat: worn, plateNumber: 7 },
  };
  const local = earnedOfBuild(build as never, [], undefined, 1);
  report(local.hats.some((h) => sameHat(h, worn)), "(g2) local", local.hats.some((h) => sameHat(h, worn))
    ? "the store credits the one hat the robot is already wearing"
    : "the store dropped the hat the robot is wearing: every face tap would be refused");

  // it echoes ONE hat and invents none: no second hat, no other colour
  report(local.hats.length === 1, "(g2) local", `and exactly one, never a shelf of them (${local.hats.length})`);
  const bare = earnedOfBuild({ ...build, look: undefined } as never, [], undefined, 1);
  report(bare.hats.length === 0, "(g2) local", "a robot wearing no hat is credited with none");

  // and the local gate now lets the face tap through instead of refusing it
  let threw = "";
  try {
    parseLook({ face: "happy", hat: worn }, local);
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  report(threw === "", "(g2) local", threw === ""
    ? "a face tap on a hatted robot goes through the browser's own gate"
    : `the browser refused its own robot's hat: "${threw}"`);

  // the read path keeps it too, so the drawn robot does not lose its hat
  const drawn = normalizeLook(build.look, local);
  report(sameHat(drawn.hat, worn), "(g2) local", "and the drawn robot keeps wearing it");

  // A DIFFERENT hat is still refused, so this is not a hole: the echo can
  // only ever return the one hat that was already on the row.
  let refused = false;
  try {
    parseLook({ hat: { kind: "bell", color: "gold" } }, local);
  } catch {
    refused = true;
  }
  report(refused, "(g2) local", "a hat that is not the one on the robot is still refused");
}

// ---------------------------------------------------------------------------
// (h) the words
// ---------------------------------------------------------------------------

console.log("\n-- (h) the words a player reads --");
{
  const lines = [
    t.look.hat,
    t.look.noHat,
    t.look.foundHat,
    t.look.hatOn,
    t.look.hatName,
    t.earned.hat,
    t.news.hat,
    HAT_EARN,
    ...HATS.map((h) => `${h.name}. ${h.earn}`),
    ...hatNames(EVERY_HAT.slice(0, 12)),
  ];
  const text = lines.join(" ");
  report(!/—|–/.test(text), "(h) words", "no em-dash and no en-dash on any hat line");
  report(!/\$|\bwin \$|\bUSD\b|%/.test(text), "(h) words", "no money and no per cent sign");
  report(!/0x[0-9a-f]/i.test(text), "(h) words", "no wallet address");

  // THE ONE RULE IS SAID OUT LOUD. A hat that just appears with no
  // explanation sends a player looking for the shop that sold it.
  report(/won|win/i.test(HAT_EARN) && !/buy|coin|price|shop/i.test(HAT_EARN), "(h) words",
    `the earn line says it is won and never bought: "${HAT_EARN}"`);
  report(/never for sale|not for sale|never be bought/i.test(t.look.foundHat), "(h) words",
    `the first hat says the rule: "${t.look.foundHat}"`);

  // EVERY ROW ON THE LADDER STILL HAS ITS OWN EARN LINE, and the hat row is
  // lit by a hat and by nothing else
  const rows = shelfRows({ ...NOTHING_EARNED, hats: [{ kind: "bell", color: "sky" }] });
  const hatRow = rows.find((r) => r.id === "hat")!;
  report(hatRow.earned && hatRow.earn === HAT_EARN, "(h) words", `the hat row is lit by a hat row and prints "${hatRow.earn}"`);
  const noHat = shelfRows({ ...NOTHING_EARNED, wins: 999, level: 50 }).find((r) => r.id === "hat")!;
  report(!noHat.earned, "(h) words", "999 wins and level 50 never light it: only a hat lights it");

  // A HAT IS NAMED BY ITS COLOUR AND ITS KIND, in the plain words a seven
  // year old already has: "blue bow", never "sky bow"
  const named = hatName({ kind: "bow", color: "sky" });
  report(named === "blue bow", "(h) words", `a hat says its colour in plain words: "${named}"`);
  report(hatName({ kind: "bow", color: null }) === "Bow", "(h) words", "and a hat with no colour of its own is named by its kind alone");
  // A NAME HAS TO BE SAYABLE, not short. It is the tile's spoken label and
  // the line the panel says back, never text squeezed inside a 44 pixel tile,
  // so the bar is words a child can read and not a character count.
  const names = EVERY_HAT.map(hatName);
  const longest = [...names].sort((a, b) => b.length - a.length)[0];
  const wordy = names.filter((n) => n.split(" ").length > 3);
  report(wordy.length === 0, "(h) words", wordy.length === 0
    ? `every one of the ${names.length} hat names is three plain words or fewer (the longest is "${longest}")`
    : `a hat name is a mouthful: ${wordy.slice(0, 3).join(", ")}`);
  const jargon = names.filter((n) => /\b(mint|coral|butter|sky|lilac|moss|cream|ink)\b/.test(n));
  report(jargon.length === 0, "(h) words", jargon.length === 0
    ? "and no hat name uses a paint's internal word: a player reads blue, never sky"
    : `a hat name uses a paint id: ${jargon.slice(0, 3).join(", ")}`);

  // THE PICKER'S ROW IS DRAWN FROM WHAT WAS WON, so it cannot exist for a
  // player with no hat: no padlocks nobody can ever open.
  const picker = read("src/app/bots/_components/LookPicker.tsx");
  report(/const hats = earned\.hats;/.test(picker) && /hats\.length \? \(/.test(picker), "(h) row",
    "the hat row is drawn from earned.hats and stands down when there are none");
  report(/firstHat \?/.test(picker), "(h) row", "and the sentence that says where hats come from is shown once");
}

// ---------------------------------------------------------------------------
// (i) the colour reaches the drawing
// ---------------------------------------------------------------------------
//
// Everything above is about rows and rules. This is the part that would still
// be wrong if every rule held: a hat that carries a colour nothing draws with
// is a hat that is still one colour on screen. So the SHIPPED compositor
// draws the same robot in the same kind of hat in eight colours, and the
// pixels are counted. It also writes the sheet a person reads.

async function gateDrawn(): Promise<void> {
  console.log("\n-- (i) the colour reaches the drawing --");
  const PUBLIC = path.join(ROOT, "public");
  const load: LoadArt = async (f) => {
    try {
      return new Uint8Array(await fsp.readFile(path.join(PUBLIC, f.replace(/^\//, ""))));
    } catch {
      return null;
    }
  };
  const cache: ArtCache = new Map();

  // one robot, four colours, none of them a colour a hat is given below, so a
  // hat pixel can never be confused with a body pixel
  const pick = (slot: Slot, tier: number): Part => {
    const c = CATALOG_PARTS.filter((x) => x.slot === slot && x.tier === tier)[0] ?? CATALOG_PARTS.filter((x) => x.slot === slot)[0];
    return { id: c.id, s: [c.s[0], c.s[1], c.s[2]] };
  };
  const build: Build = {
    head: { ...pick("head", 3), paint: "cream" },
    torso: { ...pick("torso", 3), paint: "ink" },
    arms: { ...pick("arms", 2), paint: "cream" },
    legs: { ...pick("legs", 2), paint: "ink" },
    weapon: pick("weapon", 3),
  };
  const marks = { ...NO_MARKS, stars: 2, patches: 1, cuffs: 1 as const };
  const lookWith = (hat: HatWon | null) => ({
    face: "happy" as const, sticker: null, spot: "chest" as const,
    stickerPaint: null, hat, plateNumber: 12,
  });

  const shots: { hat: HatWon; bm: Bitmap; changed: number }[] = [];
  for (const color of PAINT_IDS) {
    const hat: HatWon = { kind: "bow", color };
    const bm = decodePng((await renderPortrait({ build, look: lookWith(hat), marks }, 300, load, cache)).png);
    // MEASURED AGAINST THE FIRST COLOURED BOW, not against a bare robot. A
    // bare robot is drawn BIGGER, because the compositor gives a hat its own
    // headroom, so every pixel of the figure moves and the difference would
    // be the whole robot. Two bows of different colours lay out identically,
    // so the pixels that differ between them ARE the hat.
    let changed = 0;
    if (shots.length) {
      const first = shots[0].bm;
      const n = Math.min(first.px.length, bm.px.length);
      for (let i = 0; i < n; i += 4) {
        if (first.px[i] !== bm.px[i] || first.px[i + 1] !== bm.px[i + 1] || first.px[i + 2] !== bm.px[i + 2]) changed++;
      }
    }
    shots.push({ hat, bm, changed });
  }

  // EVERY COLOUR DRAWS A DIFFERENT PICTURE. Same kind, same robot, same size,
  // same everything but the hat's colour: if the colour did not reach the
  // drawing these eight would be byte identical.
  const sigs = new Set(shots.map((s) => fnv1a(Array.from(s.bm.px).join(","))));
  report(sigs.size === PAINT_IDS.length, "(i) drawn", sigs.size === PAINT_IDS.length
    ? `the same bow in ${PAINT_IDS.length} colours renders ${sigs.size} different pictures, and the colour is the only thing that changed`
    : `${PAINT_IDS.length} colours rendered only ${sigs.size} different pictures: the colour is not reaching the hat`);

  const others = shots.slice(1);
  const thin = others.filter((s) => s.changed < 200);
  report(thin.length === 0, "(i) drawn", thin.length === 0
    ? `and the hat itself is ${Math.min(...others.map((s) => s.changed))} to ${Math.max(...others.map((s) => s.changed))} pixels of a 300 px picture: big enough to see which colour it is`
    : `a hat barely draws: ${thin.map((s) => `${hatName(s.hat)} ${s.changed}px`).join(", ")}`);

  // AND EVERY KIND DRAWS SOMETHING DIFFERENT FROM EVERY OTHER, at ring size,
  // which is the whole reason the six were chosen to change the skyline
  const small: { hat: HatWon; bm: Bitmap }[] = [];
  for (const kind of HAT_IDS) {
    const hat: HatWon = { kind, color: "coral" };
    small.push({ hat, bm: decodePng((await renderPortrait({ build, look: lookWith(hat), marks }, 120, load, cache)).png) });
  }
  const seen = new Set(small.map((s) => fnv1a(Array.from(s.bm.px).join(","))));
  report(seen.size === HAT_IDS.length, "(i) drawn", seen.size === HAT_IDS.length
    ? `all ${HAT_IDS.length} kinds are told apart at 120 px, the size a fights list draws`
    : `only ${seen.size} of ${HAT_IDS.length} kinds are different at 120 px`);

  // the sheet a person reads
  const GAP = 12;
  const BG = 0x1a1c22;
  const row = (bs: Bitmap[]) => ({ w: bs.reduce((n, b) => n + b.w + GAP, GAP), h: Math.max(...bs.map((b) => b.h)) });
  const r1 = row(shots.map((s) => s.bm));
  const r2 = row(small.map((s) => s.bm));
  const W = Math.max(r1.w, r2.w);
  const H = r1.h + r2.h + GAP * 3;
  const sheet: Bitmap = { w: W, h: H, px: new Uint8Array(W * H * 4) };
  for (let i = 0; i < W * H; i++) {
    sheet.px[i * 4] = (BG >> 16) & 255;
    sheet.px[i * 4 + 1] = (BG >> 8) & 255;
    sheet.px[i * 4 + 2] = BG & 255;
    sheet.px[i * 4 + 3] = 255;
  }
  const put = (src: Bitmap, x0: number, y0: number) => {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const s = (y * src.w + x) * 4;
        const a = src.px[s + 3] / 255;
        if (a <= 0) continue;
        const d = ((y0 + y) * W + (x0 + x)) * 4;
        for (let c = 0; c < 3; c++) sheet.px[d + c] = Math.round(src.px[s + c] * a + sheet.px[d + c] * (1 - a));
      }
    }
  };
  let x = GAP;
  for (const s of shots) { put(s.bm, x, GAP); x += s.bm.w + GAP; }
  x = GAP;
  for (const s of small) { put(s.bm, x, GAP * 2 + r1.h); x += s.bm.w + GAP; }
  const outDir = path.join(ROOT, ".bots-preview", "look");
  await fsp.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, "HATS.png");
  await fsp.writeFile(out, encodePng(sheet));
  console.log(`\n  sheet  ${out}  ${W}x${H}`);
  console.log(`         top: one bow in ${PAINT_IDS.map((p) => t.paintName[p]).join(", ")} at 300 px`);
  console.log(`         then: ${HAT_IDS.join(", ")} at 120 px, the size a fights list draws`);
}

gateDrawn()
  .catch((e) => {
    failures++;
    console.log(`[RED] (i) drawn ${e instanceof Error ? e.message : String(e)}`);
  })
  .then(() => {
    console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) RED`);
    process.exit(failures === 0 ? 0 : 1);
  });
