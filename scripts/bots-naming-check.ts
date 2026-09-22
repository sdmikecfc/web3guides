/**
 * BATTLE BOTS NAMING CHECK - the merge gate for what a player READS.
 *
 * scripts/bots-harness.ts proves the engine did not move and validateCatalog
 * proves a name came from a table. Neither one can tell you whether the name
 * MEANS anything, which is the thing that went wrong: the shop shipped
 * "Piston Hammer", "Kettle Shins" and "Sprocket Pegs", and a player could not
 * tell an arm from a leg from any of them, nor what the first word was
 * supposed to be good at.
 *
 * Mike, 2026-09-04: "Too much jargon, doesn't explain which part it is (arm,
 * leg, etc) has weird names like Gremlin and a second name Big Rig? ... Why
 * not have a naming convention like they do in other games? Where there is a
 * brand, part and color? Brands represent speed focused on strength focused,
 * etc. Instead of Big Rig Gremlin that means literally nothing."
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/bots-naming-check.ts            verify
 *   npx tsx scripts/bots-naming-check.ts --table    also print every card
 *
 * GATES (all must pass; any red line blocks the merge):
 *  (1) SLOT WORD: every part name ENDS in the plain word for the socket it
 *      fills, so a player reading one word knows what they are holding.
 *  (2) BRAND PROMISE: every brand's parts really do lead on the stat the
 *      brand promised, at EVERY model number, and the lead is strict.
 *  (3) TITLE SHAPE: brand, model number, part; the model number equals the
 *      part's tier, so a bigger number is always a better part.
 *  (4) UNIQUE: no two parts share a name.
 *  (5) NAME SPACES: no word appears in two of the seven name spaces (brand,
 *      part word, weapon kind, colour, house opponent, reference fighter,
 *      bot name, owner name), so no screen can print "Big Rig Gremlin".
 *  (6) LENGTH: nothing this lane can generate is longer than the shop card
 *      title, the garage tray chip or the fight name plate can hold.
 *  (7) BANNED WORDS: jargon, stat short forms, idioms, retired words and the
 *      characters that must never reach a player surface.
 *  (8) COVERAGE: every family and every weapon maps to a brand, every brand
 *      has a promise for every slot it sells, and every stat word has a
 *      plain sentence saying what it does.
 *
 * This gate IMPORTS THE SHIPPED CATALOG rather than restating it (the Domain
 * Kitchen lesson: a gate that reimplements the thing it checks reproduces
 * the author's assumptions and passes).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PAINT_IDS, SLOT_STATS, SLOTS, partTotal, partTier, type PartCard, type Slot, type StatName } from "../src/app/bots/_engine/parts";
import { CANON_NAMES, FAMILIES, FAMILY_INDEX, HOUSE_ROSTER, PARTS, SHAPES, STARTER_PARTS } from "../src/app/bots/_engine/catalog";
import {
  BANNED_CHARS,
  BANNED_WORDS,
  BOT_FIRST_WORDS,
  BOT_SECOND_WORDS,
  BRANDS,
  BRAND_INDEX,
  BRAND_OF_FAMILY,
  BRAND_OF_WEAPON,
  BRAND_PROMISE,
  HOUSE_NAME,
  NAME_LIMITS,
  OWNER_FIRST_WORDS,
  OWNER_SECOND_WORDS,
  PART_WORD,
  SCRAP_WORD,
  STAT_MEANING,
  WEAPON_KIND,
  playerCopy,
  trayLines,
  type BrandId,
} from "../src/lib/bots/naming";

// ---------------------------------------------------------------------------
// report machinery (the shape scripts/bots-harness.ts uses)
// ---------------------------------------------------------------------------

let failures = 0;
function report(ok: boolean, gate: string, msg: string): void {
  const tag = ok ? "[OK] " : "[FAIL]";
  if (!ok) failures += 1;
  console.log(`${tag} bots naming ${gate} ${msg}`);
}

const ALL_CARDS: readonly PartCard[] = [...PARTS, ...STARTER_PARTS];

/** The brand a shipped card belongs to, or null for starter scrap. */
function brandOf(card: PartCard): BrandId | null {
  if (card.slot === "weapon") return BRAND_OF_WEAPON[card.id] ?? null;
  return card.family ? (BRAND_OF_FAMILY[card.family] ?? null) : null;
}

const isStarter = (card: PartCard): boolean => card.id.startsWith("starter.");

// ---------------------------------------------------------------------------
// (1) every part name says its slot in a plain word
// ---------------------------------------------------------------------------

const WEAPON_KINDS: readonly string[] = Object.values(WEAPON_KIND);

function gateSlotWord(): void {
  const bad: string[] = [];
  for (const card of ALL_CARDS) {
    const words = card.name.split(" ");
    const last = words[words.length - 1];
    if (card.slot === "weapon") {
      // a weapon says its own kind, which is itself a weapon word
      if (!WEAPON_KINDS.includes(last)) {
        bad.push(`${card.id}: "${card.name}" ends in "${last}", which is not one of the weapon kinds`);
        continue;
      }
      const want = WEAPON_KIND[card.id];
      if (want && last !== want) bad.push(`${card.id}: "${card.name}" ends in "${last}", the kind table says "${want}"`);
      continue;
    }
    if (last !== PART_WORD[card.slot]) {
      bad.push(`${card.id}: "${card.name}" ends in "${last}", the plain word for a ${card.slot} is "${PART_WORD[card.slot]}"`);
    }
  }
  report(
    bad.length === 0,
    "(1)",
    bad.length === 0
      ? `all ${ALL_CARDS.length} part names end in the plain word for their socket (${SLOTS.map((s) => PART_WORD[s]).join(", ")}, or a weapon kind)`
      : `${bad.length} name does not say its slot: ${bad.slice(0, 4).join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// (2) the brand promise is true, at every model number
// ---------------------------------------------------------------------------

interface PromiseRow {
  brand: BrandId;
  slot: Slot;
  model: number;
  card: PartCard;
  promised: StatName;
  value: number;
  strict: boolean;
  runnerUp: StatName;
  runnerValue: number;
}

function promiseRows(): PromiseRow[] {
  const rows: PromiseRow[] = [];
  for (const card of PARTS) {
    const brand = brandOf(card);
    if (!brand) continue;
    const promised = BRAND_PROMISE[brand][card.slot];
    if (!promised) continue;
    const names = SLOT_STATS[card.slot];
    const idx = names.indexOf(promised);
    const value = card.s[idx];
    let runner = -1;
    for (let i = 0; i < 3; i++) {
      if (i === idx) continue;
      if (runner < 0 || card.s[i] > card.s[runner]) runner = i;
    }
    rows.push({
      brand, slot: card.slot, model: card.tier, card, promised, value,
      strict: value > card.s[runner],
      runnerUp: names[runner], runnerValue: card.s[runner],
    });
  }
  return rows;
}

function gatePromise(showTable: boolean): void {
  const rows = promiseRows();
  const broken = rows.filter((r) => !r.strict);
  // every brand must be checked at every model number it sells
  const missing: string[] = [];
  for (const b of BRANDS) {
    for (const slot of b.sells) {
      for (const model of [1, 2, 3, 4]) {
        if (!rows.some((r) => r.brand === b.id && r.slot === slot && r.model === model)) {
          missing.push(`${b.name} ${model} ${PART_WORD[slot]}`);
        }
      }
    }
  }
  if (showTable) {
    console.log(`  ${"card".padEnd(17)} ${"promised".padEnd(13)} ${"value".padStart(5)}  next biggest`);
    for (const r of rows) {
      console.log(
        `  ${r.card.name.padEnd(17)} ${r.promised.padEnd(13)} ${String(r.value).padStart(5)}  ${r.runnerUp} ${r.runnerValue}${r.strict ? "" : "   <- NOT A STRICT LEAD"}`,
      );
    }
  }
  report(
    broken.length === 0 && missing.length === 0,
    "(2)",
    broken.length === 0 && missing.length === 0
      ? `all ${rows.length} launch parts lead on the stat their brand promised, strictly, at every model number ` +
        `(Spark: speed / damage / luck / accuracy, Anvil: strength / block / health / dodge, Forge: damage, Jet: attack speed)`
      : [
          broken.length ? `${broken.length} broken promise: ${broken.map((r) => `${r.card.name} promises ${r.promised} ${r.value} but ${r.runnerUp} is ${r.runnerValue}`).join("; ")}` : "",
          missing.length ? `${missing.length} model not on the shelf: ${missing.join(", ")}` : "",
        ].filter(Boolean).join(" | "),
  );
}

// ---------------------------------------------------------------------------
// (3) the title is brand, model number, part; the number IS the tier
// ---------------------------------------------------------------------------

function gateTitleShape(): void {
  const bad: string[] = [];
  for (const card of ALL_CARDS) {
    if (isStarter(card)) {
      if (!card.name.startsWith(`${SCRAP_WORD} `) || card.name.split(" ").length !== 2) {
        bad.push(`${card.id}: starter title "${card.name}" is not "${SCRAP_WORD}" plus one part word`);
      }
      continue;
    }
    const brand = brandOf(card);
    if (!brand) {
      bad.push(`${card.id}: "${card.name}" has no brand`);
      continue;
    }
    const words = card.name.split(" ");
    if (words.length !== 3) {
      bad.push(`${card.id}: "${card.name}" is ${words.length} words, want brand, model number, part`);
      continue;
    }
    if (words[0] !== BRAND_INDEX[brand].name) bad.push(`${card.id}: "${card.name}" starts with "${words[0]}", brand is ${BRAND_INDEX[brand].name}`);
    const model = Number(words[1]);
    if (!Number.isInteger(model) || model < 1 || model > 4) bad.push(`${card.id}: "${card.name}" has no model number in the middle`);
    else if (model !== card.tier) bad.push(`${card.id}: "${card.name}" says model ${model}, the part's tier is ${card.tier}`);
    // the tier must itself be the honest one for the points on the card
    if (partTier(partTotal(card)) !== card.tier) bad.push(`${card.id}: tier ${card.tier} does not match ${partTotal(card)} points`);
    // a body part's brand plus model IS its family, so the set key reads off the title
    if (card.slot !== "weapon" && card.family) {
      const fam = FAMILY_INDEX[card.family];
      if (!fam) bad.push(`${card.id}: unknown family ${card.family}`);
      else if (fam.name !== `${BRAND_INDEX[brand].name} ${model}`) {
        bad.push(`${card.id}: family reads "${fam.name}", title reads "${BRAND_INDEX[brand].name} ${model}"; the set line would not match the card`);
      }
    }
  }
  report(
    bad.length === 0,
    "(3)",
    bad.length === 0
      ? `every launch title is brand, model number, part, the model number equals the tier, and a body part's brand plus number is its set key`
      : `${bad.length} broken title: ${bad.slice(0, 4).join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// (4) no two parts share a name
// ---------------------------------------------------------------------------

function gateUnique(): void {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const card of ALL_CARDS) {
    const prev = seen.get(card.name);
    if (prev) dupes.push(`"${card.name}" on both ${prev} and ${card.id}`);
    else seen.set(card.name, card.id);
  }
  report(
    dupes.length === 0,
    "(4)",
    dupes.length === 0 ? `${ALL_CARDS.length} part names, all different` : `${dupes.length} duplicate: ${dupes.join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// (5) the name spaces never share a word
// ---------------------------------------------------------------------------

const lower = (xs: readonly string[]): string[] => xs.flatMap((x) => x.split(" ")).map((x) => x.toLowerCase()).filter(Boolean);

function gateNameSpaces(): void {
  const spaces: [string, string[]][] = [
    ["brand", lower([...BRANDS.map((b) => b.name), SCRAP_WORD])],
    ["part word", lower(Object.values(PART_WORD))],
    ["weapon kind", lower(WEAPON_KINDS)],
    ["colour", lower([...PAINT_IDS])],
    ["house opponent", lower(Object.values(HOUSE_NAME))],
    ["reference fighter", lower(Object.values(CANON_NAMES))],
    ["bot name", lower([...BOT_FIRST_WORDS, ...BOT_SECOND_WORDS])],
    ["owner name", lower([...OWNER_FIRST_WORDS, ...OWNER_SECOND_WORDS])],
  ];
  const clashes: string[] = [];
  for (let i = 0; i < spaces.length; i++) {
    for (let j = i + 1; j < spaces.length; j++) {
      const a = new Set(spaces[i][1]);
      for (const w of spaces[j][1]) if (a.has(w)) clashes.push(`"${w}" is both a ${spaces[i][0]} and a ${spaces[j][0]}`);
    }
  }
  // the nine shape names in the catalog must be the nine in the copy table
  for (const sh of SHAPES) {
    if (HOUSE_NAME[sh.id] !== sh.name) clashes.push(`house shape ${sh.id}: catalog says "${sh.name}", naming.ts says "${HOUSE_NAME[sh.id] ?? "nothing"}"`);
  }
  report(
    clashes.length === 0,
    "(5)",
    clashes.length === 0
      ? `${spaces.length} name spaces (${spaces.map((s) => s[0]).join(", ")}) share no word, so a screen cannot print two kinds of name side by side and mean nothing by it`
      : `${clashes.length} clash: ${Array.from(new Set(clashes)).slice(0, 6).join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// (6) everything fits the card, the chip and the name plate
// ---------------------------------------------------------------------------

function longest(xs: readonly string[]): string {
  let best = "";
  for (const x of xs) if (x.length > best.length) best = x;
  return best;
}

function gateLength(): void {
  const bad: string[] = [];
  for (const card of ALL_CARDS) {
    if (card.name.length > NAME_LIMITS.title) bad.push(`title "${card.name}" is ${card.name.length}, the card holds ${NAME_LIMITS.title}`);
    const brand = brandOf(card);
    const lines = brand
      ? trayLines(brand, card.tier, card.slot, card.slot === "weapon" ? card.id : undefined)
      : ([SCRAP_WORD, card.name.split(" ").slice(-1)[0]] as [string, string]);
    for (const line of lines) {
      if (line.length > NAME_LIMITS.chipLine) bad.push(`tray line "${line}" (${card.id}) is ${line.length}, the chip holds ${NAME_LIMITS.chipLine}`);
    }
  }
  // the longest name the bot and owner tables can ever generate, plus " 99"
  const longestBot = `${longest(BOT_FIRST_WORDS)} ${longest(BOT_SECOND_WORDS)} 99`;
  const longestOwner = `${longest(OWNER_FIRST_WORDS)} ${longest(OWNER_SECOND_WORDS)} 99`;
  for (const [what, name] of [["bot name", longestBot], ["owner name", longestOwner]] as const) {
    if (name.length > NAME_LIMITS.plate) bad.push(`longest possible ${what} "${name}" is ${name.length}, the name plate holds ${NAME_LIMITS.plate}`);
  }
  for (const name of Object.values(HOUSE_NAME)) {
    if (name.length > NAME_LIMITS.plate) bad.push(`house opponent "${name}" is ${name.length}, the name plate holds ${NAME_LIMITS.plate}`);
  }
  report(
    bad.length === 0,
    "(6)",
    bad.length === 0
      ? `longest title "${longest(ALL_CARDS.map((c) => c.name))}" (of ${NAME_LIMITS.title}), longest bot name "${longestBot}" (of ${NAME_LIMITS.plate}), ` +
        `longest owner name "${longestOwner}" (of ${NAME_LIMITS.plate}), every tray line ${NAME_LIMITS.chipLine} or under`
      : `${bad.length} too long: ${bad.slice(0, 4).join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// (7) banned words and characters
// ---------------------------------------------------------------------------

/** Every string this lane owns that a player can read. */
function laneCopy(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const card of ALL_CARDS) {
    out.push({ where: `${card.id} name`, text: card.name });
    out.push({ where: `${card.id} lore`, text: card.lore });
  }
  for (const fam of FAMILIES) out.push({ where: `family ${fam.id}`, text: `${fam.name} ${fam.feel}` });
  for (const sh of SHAPES) out.push({ where: `house shape ${sh.id}`, text: `${sh.name} ${sh.feel}` });
  for (const [d, r] of Object.entries(HOUSE_ROSTER)) out.push({ where: `house roster ${d}`, text: r.title });
  for (const [k, v] of Object.entries(CANON_NAMES)) out.push({ where: `reference fighter ${k}`, text: v });
  for (const text of playerCopy()) out.push({ where: "naming.ts", text });
  return out;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function gateBanned(): void {
  const bad: string[] = [];
  const copy = laneCopy();
  for (const word of BANNED_WORDS) {
    const re = new RegExp(`\\b${escapeRe(word)}\\b`, "i");
    for (const c of copy) if (re.test(c.text)) bad.push(`banned word "${word}" in ${c.where}: "${c.text}"`);
  }
  for (const { char, why } of BANNED_CHARS) {
    for (const c of copy) if (c.text.includes(char)) bad.push(`${why} in ${c.where}: "${c.text}"`);
  }
  // a lore line is one plain line, and it never carries a number: the numbers
  // are printed from the engine so a card can never disagree with itself
  for (const card of ALL_CARDS) {
    if (/\d/.test(card.lore)) bad.push(`${card.id} lore carries a number, which can drift from the part: "${card.lore}"`);
  }
  report(
    bad.length === 0,
    "(7)",
    bad.length === 0
      ? `${copy.length} player strings clean of ${BANNED_WORDS.length} banned words (stat short forms, game and money jargon, idioms, the retired ranks), ` +
        `of em-dashes, dollar figures and wallet addresses, and of numbers inside a lore line`
      : `${bad.length} problem: ${bad.slice(0, 5).join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// (8) coverage: nothing in the catalog is outside the convention
// ---------------------------------------------------------------------------

function gateCoverage(): void {
  const bad: string[] = [];
  for (const fam of FAMILIES) {
    const brand = BRAND_OF_FAMILY[fam.id];
    if (!brand) bad.push(`family ${fam.id} has no brand`);
    else if (fam.name !== `${BRAND_INDEX[brand].name} ${fam.tier}`) bad.push(`family ${fam.id} reads "${fam.name}", want "${BRAND_INDEX[brand].name} ${fam.tier}"`);
    if (!fam.feel) bad.push(`family ${fam.id} has no line of character`);
  }
  for (const card of PARTS) {
    if (card.slot !== "weapon") continue;
    if (!BRAND_OF_WEAPON[card.id]) bad.push(`weapon ${card.id} has no brand`);
    if (!WEAPON_KIND[card.id]) bad.push(`weapon ${card.id} has no kind word`);
  }
  for (const b of BRANDS) {
    if (!b.short || !b.character) bad.push(`brand ${b.id} is missing its short line or its character line`);
    for (const slot of b.sells) if (!BRAND_PROMISE[b.id][slot]) bad.push(`brand ${b.id} sells ${slot} and promises nothing`);
  }
  for (const slot of SLOTS) {
    for (const name of SLOT_STATS[slot]) if (!STAT_MEANING[name]) bad.push(`stat "${name}" has no plain sentence`);
  }
  // the difficulty titles rank themselves, and none of them is a name
  const titles = Object.values(HOUSE_ROSTER).map((r) => r.title);
  const houseWords = new Set(lower(Object.values(HOUSE_NAME)));
  for (const t of titles) for (const w of lower([t])) if (houseWords.has(w)) bad.push(`difficulty title "${t}" reuses the opponent name word "${w}"`);
  report(
    bad.length === 0,
    "(8)",
    bad.length === 0
      ? `${FAMILIES.length} families and 8 weapons all map to one of ${BRANDS.length} brands, every brand promises a stat for every slot it sells, ` +
        `all 9 stat words have a plain sentence, and the 3 difficulty titles (${titles.join(", ")}) share no word with an opponent name`
      : `${bad.length} gap: ${bad.slice(0, 4).join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "src", "app", "bots", "_engine"))) {
  console.error("Run from the web3guides repo root (src/app/bots/_engine not found under cwd).");
  process.exit(2);
}

const showTable = process.argv.slice(2).includes("--table");
const t0 = Date.now();

gateSlotWord();
gatePromise(showTable);
gateTitleShape();
gateUnique();
gateNameSpaces();
gateLength();
gateBanned();
gateCoverage();

if (showTable) {
  console.log("\n  the shelf, as a player reads it:");
  for (const card of PARTS) {
    const brand = brandOf(card);
    const promised = brand ? BRAND_PROMISE[brand][card.slot] : undefined;
    const idx = promised ? SLOT_STATS[card.slot].indexOf(promised) : -1;
    console.log(
      `  ${card.name.padEnd(16)} ${(card.color ?? "no color").padEnd(9)} ${String(card.price).padStart(5)} coins  ` +
        `${promised ? `${promised} ${card.s[idx]}` : ""}`,
    );
  }
}

console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s wall clock`);
console.log(failures === 0 ? "ALL NAMING CHECKS GREEN" : `${failures} NAMING CHECK(S) FAILED`);
if (failures > 0) process.exit(1);
