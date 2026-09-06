/**
 * BATTLE BOTS COPY CHECK - the merge gate for the WORDS a player reads.
 *
 * scripts/bots-naming-check.ts proves a part NAME means something.
 * scripts/bots-harness.ts proves the engine did not move.
 * Neither one can tell you whether the sentence around the name is a sentence a
 * seven year old, or an adult reading in their third language on a phone, can
 * read without ever being taught.
 *
 * Mike, 2026-09-04: "Spar makes no sense as well compared to fight. Really go
 * through and make it so a 7 year old can understand it, not so only a no lifer
 * with 10000 hours in the game knows what's going on."
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/bots-copy-check.ts             verify
 *   npx tsx scripts/bots-copy-check.ts --list      print the whole corpus
 *   npx tsx scripts/bots-copy-check.ts --json      machine readable findings
 *
 * FIVE GATES, all must pass:
 *  (1) BANNED WORD    jargon, stat short forms, idioms and retired words on any
 *                     player surface. Whole words, case insensitive.
 *  (2) BANNED CHAR    em-dash, en-dash, a dollar sign, a per cent sign, a
 *                     wallet address, and the lone full stop used as a divider.
 *  (3) WIDTH          every string measured against its surface's character
 *                     budget, with placeholders filled from a worst case table.
 *  (4) ONE IDEA ONE   two different approved words for the same idea must never
 *      WORD           both appear in the shipped copy.
 *  (5) GLOSSARY       each of the seven words the game is allowed to teach must
 *                     carry its exact teaching sentence, present once.
 *
 * THIS GATE IMPORTS THE SHIPPED TABLES rather than restating them (the Domain
 * Kitchen lesson: a gate that reimplements the thing it checks reproduces the
 * author's assumptions and passes). naming.ts already exports playerCopy(),
 * which is the honest list of what that file shows a player, and this gate uses
 * it instead of walking the file's internals.
 *
 * TWO LIMITS, written down so nobody trusts this further than it goes:
 *  - The four .tsx screens cannot be imported outside React, so their strings
 *    come from a source scan. A sentence assembled at runtime out of three
 *    fragments is invisible to it. Every such sentence in the pack is listed in
 *    ASSEMBLED_LINES below and checked as a whole.
 *  - A character count is a proxy for pixels. It catches the disasters. The
 *    seven tightest strings still want a human eye on a 390 wide phone.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { STRINGS } from "../src/lib/bots/strings";
import { SCREEN_WORDS } from "../src/lib/bots/naming-screens";
import { playerCopy, modelWord, HOUSE_TIERS, BRANDS, STAT_MEANING, SET_LINES, SHELF_WORDS, TEACH } from "../src/lib/bots/naming";
import { TEMPLATES, VARIANTS, EFFECT_LINES } from "../src/app/bots/_engine/commentary";
import { HOUSE_ROSTER, SHAPES, PARTS, STARTER_PARTS } from "../src/app/bots/_engine/catalog";
import { WEIGHT_CLASS_NAMES, gapWords } from "../src/app/bots/_engine/rewards";

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const WANT_LIST = argv.includes("--list");
const WANT_JSON = argv.includes("--json");

// ---------------------------------------------------------------------------
// the corpus
// ---------------------------------------------------------------------------

interface Entry {
  file: string;
  line: number;
  key: string;
  text: string;
  surface: Surface;
}

type Surface =
  | "nav_word"
  | "eyebrow_label"
  | "section_heading"
  | "house_rank_label"
  | "bot_chip_line2"
  | "bay_status_chip"
  | "tray_stat_item"
  | "tray_chip_line"
  | "shop_card_title"
  | "shop_row_heading"
  | "fight_name_plate"
  | "commentary_line"
  | "practice_button"
  | "ko_card_chip"
  | "ko_card_right_column"
  | "lore_line"
  | "wrapping";

/**
 * The widest string each surface can hold, in characters, measured off the
 * shipped CSS. Where a number came from a component, the source is named so the
 * next person can re-measure instead of re-guessing.
 */
const BUDGET: Readonly<Record<Surface, number>> = {
  nav_word: 8, //                BotsTopNav
  eyebrow_label: 12, //          a BADGE at mono 10-12 uppercase, 0.32em
  section_heading: 26, //        a heading that owns its own full width row
  house_rank_label: 13, //       mono 10 at 0.22em; SAME SIZE BOT ships at 13
  bot_chip_line2: 16, //         mono 11 nowrap inside a scrolling row
  bay_status_chip: 30, //        measured 2026-09-04 in the browser at 390:
  //                             the garage bay row leaves 286px at mono 12
  //                             (about 43 characters), and the canvas tag
  //                             sizes its own background to the text
  //                             (_view/garage.ts drawTag)
  tray_stat_item: 7, //          about 58px per item at mono 12
  tray_chip_line: 8, //          naming.ts NAME_LIMITS.chipLine
  shop_card_title: 16, //        naming.ts NAME_LIMITS.title
  shop_row_heading: 26, //       display 12 uppercase at 0.32em on a 390 phone
  fight_name_plate: 20, //       naming.ts NAME_LIMITS.plate
  commentary_line: 52, //        fight.module.css .commentary, 14px on a phone
  practice_button: 9, //         battles.module.css 108-113, 139-145
  ko_card_chip: 18, //           the chips on the share image
  ko_card_right_column: 58, //   600px at 19 to 22px
  lore_line: 90, //              catalog.ts LORE_MAX_CHARS
  wrapping: 200, //              a block that wraps freely; still one clause
};

/** Key path prefix to surface. First match wins; anything unmatched wraps. */
const SURFACE_BY_KEY: readonly [string, Surface][] = [
  // an aria label is read aloud, never drawn, so no pixel budget applies to
  // it. Every key whose path ends in "Aria" or "aria" is one.
  ["nav.aria", "wrapping"],
  ["nav.coinsAria", "wrapping"],
  ["nav.walletAria", "wrapping"],
  ["coach.aria", "wrapping"],
  ["nav.wordmark", "wrapping"],
  ["nav.", "nav_word"],
  ["ui.statShort", "tray_stat_item"],
  ["ui.stat.", "tray_stat_item"],
  ["ui.total", "tray_stat_item"],
  ["ui.pts", "tray_stat_item"],
  ["ui.tierWord", "tray_stat_item"],
  ["ui.tierBadge", "eyebrow_label"],
  // measured 2026-09-04: these five are Panel TITLES (primitives.tsx Panel:
  // Syne 12, letterspaced, on a flex row of its own beside an aside), not
  // badges, so the row is theirs and the badge budget never applied.
  ["ui.parts", "section_heading"],
  ["ui.yourBot", "section_heading"],
  ["ui.color", "section_heading"],
  ["ui.bayLabel", "tray_chip_line"],
  ["garageUi.chip.", "bay_status_chip"],
  ["garageUi.bays", "section_heading"],
  ["garageUi.toolBoard", "section_heading"],
  ["garageUi.total", "tray_stat_item"],
  ["garageUi.bayDot", "tray_chip_line"],
  // the two headings on a robot's own page, each on a row of its own
  ["earned.title", "section_heading"],
  ["earned.cards", "section_heading"],
  // the Morning Paper's own button (padding 0 12px at 12.5px), never the
  // eight character top nav
  ["garageUi.shopLink", "wrapping"],
  ["shopUi.yard", "section_heading"],
  ["shopUi.calendar", "section_heading"],
  ["shopUi.row", "shop_row_heading"],
  ["set.title", "section_heading"],
  ["battles.live", "section_heading"],
  ["battles.recent", "section_heading"],
  // measured 2026-09-04 on the shipped LockChip (Coach.tsx): it is an
  // inline-flex row of its own that now WRAPS, so the reason is a sentence,
  // not a chip line.
  ["battles.needsStrategy", "wrapping"],
  ["board.tabs", "section_heading"],
  ["strategyUi.status", "section_heading"],
  ["commentary.", "commentary_line"],
  ["houseTier.label", "house_rank_label"],
  ["weightClass.", "bot_chip_line2"],
  ["brand.short", "shop_card_title"],
  ["shelf.row", "shop_row_heading"],
  ["shelf.badge", "eyebrow_label"],
  ["part.name", "shop_card_title"],
  ["part.lore", "lore_line"],
  ["shape.name", "fight_name_plate"],
];

function surfaceOf(key: string): Surface {
  for (const [prefix, s] of SURFACE_BY_KEY) if (key.startsWith(prefix)) return s;
  return "wrapping";
}

const SOURCE_CACHE = new Map<string, string[]>();
function sourceLines(rel: string): string[] {
  let v = SOURCE_CACHE.get(rel);
  if (!v) {
    v = fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);
    SOURCE_CACHE.set(rel, v);
  }
  return v;
}

/**
 * The same file with every COMMENT blanked out, line numbers kept.
 *
 * A comment is not a player surface. These files carry their own history in
 * prose ("was Tier 2 bot. 51 points.", "Spar hid its own rule in a hover
 * title"), which is exactly the retired vocabulary this gate hunts, so
 * scanning comments turns every honest note about a fixed bug into a fresh
 * failure and pushes the next person to delete the note. Line comments,
 * block comments and JSX comments all go.
 */
const SCAN_CACHE = new Map<string, string[]>();
function scanLines(rel: string): string[] {
  const had = SCAN_CACHE.get(rel);
  if (had) return had;
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (two === "/*") {
      while (i < src.length && src.slice(i, i + 2) !== "*/") {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += src[i];
    i++;
  }
  const v = out.split(/\r?\n/);
  SCAN_CACHE.set(rel, v);
  return v;
}

/**
 * The same string with every interpolation blanked out.
 *
 * What sits inside `${...}` is CODE: one line reads "tier" only because it
 * calls starWord(bot.tier), and another reads "stake" only because that is
 * the variable's name. Neither word reaches a player. The width gate still
 * fills them in (render, below); the word, character and synonym gates must
 * never see them.
 */
function codeless(text: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "$" && text[i + 1] === "{") {
      depth++;
      i++;
      continue;
    }
    if (depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      // one WORD, not a space: "${a}. ${b}" is two sentences and must not
      // read as the lone full stop divider, while "${a} . ${b}" still does
      if (depth === 0) out += "x";
      continue;
    }
    out += text[i];
  }
  return out;
}

/** The first line of `rel` that contains `text`, or 0. Line numbers move under
 * three parallel lanes, so this is found fresh on every run and never stored. */
function lineOf(rel: string, text: string): number {
  const probe = text.split("\n")[0].slice(0, 60);
  if (!probe) return 0;
  const lines = sourceLines(rel);
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(probe)) return i + 1;
  return 0;
}

const corpus: Entry[] = [];

function add(file: string, key: string, text: unknown, surface?: Surface): void {
  if (typeof text !== "string" || text.trim() === "") return;
  corpus.push({ file, line: lineOf(file, text), key, text, surface: surface ?? surfaceOf(key) });
}

/** Walk a plain string table, keeping the key path so a surface can be read off it. */
function walk(file: string, prefix: string, node: unknown): void {
  if (typeof node === "string") return add(file, prefix, node);
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(file, `${prefix}[${i}]`, v));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(file, prefix ? `${prefix}.${k}` : k, v);
    }
  }
}

function collect(): void {
  // 1. the string table
  walk("src/lib/bots/strings.ts", "", STRINGS.en);

  // 2. the screen words
  walk("src/lib/bots/naming-screens.ts", "", SCREEN_WORDS);

  // 3. naming.ts, through its own honest list of what it shows a player
  for (const s of playerCopy()) add("src/lib/bots/naming.ts", "naming.playerCopy", s);
  for (const b of BRANDS) add("src/lib/bots/naming.ts", "brand.short", b.short);
  for (const h of HOUSE_TIERS) {
    add("src/lib/bots/naming.ts", "houseTier.label", h.label);
    add("src/lib/bots/naming.ts", "houseTier.line", h.line);
  }
  for (const v of Object.values(STAT_MEANING)) add("src/lib/bots/naming.ts", "statMeaning", v);
  for (const [k, v] of Object.entries(SET_LINES)) add("src/lib/bots/naming.ts", `setLines.${k}`, v);
  for (const [k, v] of Object.entries(SHELF_WORDS)) add("src/lib/bots/naming.ts", `shelf.${k}`, v);
  for (const [k, v] of Object.entries(TEACH)) add("src/lib/bots/naming.ts", `teach.${k}`, v);
  for (const t of [1, 2, 3, 4] as const) add("src/lib/bots/naming.ts", "shelf.badge", modelWord(t));

  // 4. the fight commentary
  for (const [k, v] of Object.entries(TEMPLATES)) add("src/app/bots/_engine/commentary.ts", `commentary.${k}`, v);
  for (const [k, v] of Object.entries(VARIANTS)) add("src/app/bots/_engine/commentary.ts", `commentary.${k}`, v);
  EFFECT_LINES.forEach((e, i) => {
    add("src/app/bots/_engine/commentary.ts", `commentary.effect${i}.first`, e.first);
    add("src/app/bots/_engine/commentary.ts", `commentary.effect${i}.second`, e.second);
  });

  // 5. the catalog: part names, story lines, opponent names and feels
  for (const c of [...PARTS, ...STARTER_PARTS]) {
    add("src/app/bots/_engine/catalog.ts", "part.name", c.name);
    add("src/app/bots/_engine/catalog.ts", "part.lore", c.lore);
  }
  for (const s of SHAPES) {
    add("src/app/bots/_engine/catalog.ts", "shape.name", s.name);
    add("src/app/bots/_engine/catalog.ts", "shape.feel", s.feel);
  }
  for (const r of Object.values(HOUSE_ROSTER)) add("src/app/bots/_engine/catalog.ts", "houseTier.label", r.title);

  // 6. rewards
  for (const [k, v] of Object.entries(WEIGHT_CLASS_NAMES)) add("src/app/bots/_engine/rewards.ts", `weightClass.${k}`, v);
  for (const gap of [-2, -1, 0, 1, 2]) add("src/app/bots/_engine/rewards.ts", "rewards.gapWords", gapWords(gap));

  // 7. the four screens, by source scan
  for (const rel of SCREEN_FILES) scanScreen(rel);

  // 8. sentences the screens build out of fragments, which no scan can see
  for (const a of ASSEMBLED_LINES) add(a.file, a.key, a.text, a.surface);

  dedupe();
}

/**
 * The same string reaches this gate twice when a table is exported two ways
 * (naming.ts playerCopy() and HOUSE_TIERS both carry the rank labels). Keep one
 * copy per file and text, and keep the TIGHTEST surface, so a string is always
 * measured against the narrowest place it is drawn.
 */
function dedupe(): void {
  const best = new Map<string, Entry>();
  for (const e of corpus) {
    const k = `${e.file}|${e.text}`;
    const had = best.get(k);
    if (!had || BUDGET[e.surface] < BUDGET[had.surface]) best.set(k, e);
  }
  corpus.length = 0;
  corpus.push(...Array.from(best.values()));
}

// ---------------------------------------------------------------------------
// the source scan for .tsx and the server files
// ---------------------------------------------------------------------------

const SCREEN_FILES: readonly string[] = [
  "src/app/bots/battles/BattlesClient.tsx",
  "src/app/bots/fight/FightClient.tsx",
  "src/app/bots/shop/ShopClient.tsx",
  "src/app/bots/garage/build/BuildClient.tsx",
  "src/app/bots/board/BoardTable.tsx",
  "src/app/api/bots/card/ko/route.tsx",
  "src/app/bots/_server/battles.ts",
  "src/app/bots/_server/fights.ts",
  "src/app/bots/_server/paper.ts",
  "src/app/bots/_server/fight-read.ts",
  "src/app/bots/battles/session.ts",
  "src/app/bots/battles/useBotsSession.ts",
  // the authored look tables: the one line that says how a face, a sticker
  // spot, a hat and every earned mark is earned lives beside the thing it
  // belongs to (src/lib/bots/look.ts FACES, SPOTS, HAT_EARN, MARK_EARN,
  // twinWords, markWords) rather than in the string table, and a shelf row
  // prints it straight. Those sentences are player copy and were reaching a
  // player ungated.
  "src/lib/bots/look.ts",
];

/** Lines that are plainly code, not copy. A candidate on one of these is skipped. */
const CODE_LINE = /^\s*(import|export\s+(type|interface)|\/\/|\*|\/\*|const\s+\w+\s*=\s*(require|await)|type\s|interface\s)/;

/** A candidate string that is plainly a value, an id or a CSS word. */
const TECHNICAL = new RegExp(
  [
    "^[#.]",                                    // hex colours, class names
    "^https?:",                                 // urls
    "^[a-z-]+$",                                // single lower case token: css, ids
    "^[A-Z_]+$",                                // constants
    "^[\\d\\s.,%px]+$",                         // measurements
    "^(flex|grid|none|auto|nowrap|hidden|ellipsis|uppercase|center|column|row|solid|bold|normal|absolute|relative|block|inline)\\b",
    "^\\w+/\\w+",                               // mime types, paths
    "^\\$\\{[^}]+\\}$",                         // a bare interpolation
    "gradient\\(|rgba?\\(|cubic-bezier",        // CSS colour and easing values
    "\\dpx\\b",                                 // a CSS length: "2px solid ..."
    "^\\$\\{[^}]*\\}%$",                        // a CSS length built from a number
    "^[a-z][a-z0-9_]*(,\\s*[a-z][a-z0-9_]*){3,}$", // a database column list
    "Math\\.|padStart\\(|toString\\(|JSON\\.",  // code, not copy
  ].join("|"),
);

function scanScreen(rel: string): void {
  const lines = scanLines(rel);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (CODE_LINE.test(raw)) continue;
    for (const text of candidates(raw)) {
      if (TECHNICAL.test(text)) continue;
      if (!/[a-z]/.test(text)) continue;
      if (text.length < 3) continue;
      // a player string is a sentence or a label: it has a space, or it is a
      // capitalised word sitting in a JSX slot
      if (!text.includes(" ") && !/^[A-Z]/.test(text)) continue;
      corpus.push({ file: rel, line: i + 1, key: "screen", text, surface: surfaceOfScreenLine(raw) });
    }
  }
}

/** Double quoted strings, template literals, and JSX text between tags. */
function candidates(raw: string): string[] {
  const out: string[] = [];
  for (const m of Array.from(raw.matchAll(/"([^"\\]{2,200})"/g))) out.push(m[1]);
  for (const m of Array.from(raw.matchAll(/`([^`\\]{2,200})`/g))) out.push(m[1]);
  for (const m of Array.from(raw.matchAll(/>\s*([A-Za-z][^<>{}]{2,200}?)\s*</g))) out.push(m[1].trim());
  return out;
}

function surfaceOfScreenLine(raw: string): Surface {
  if (/mono\(1[01]\)/.test(raw) && /nowrap/.test(raw)) return "bot_chip_line2";
  if (/letterSpacing:\s*"0\.32em"/.test(raw)) return "eyebrow_label";
  if (/letterSpacing:\s*"0\.22em"/.test(raw)) return "house_rank_label";
  return "wrapping";
}

/**
 * Sentences a screen assembles from fragments at runtime. The scan sees the
 * pieces; a reader sees the whole, so the whole is what has to pass. Add a row
 * here whenever a screen joins two strings with anything but a full stop.
 */
const ASSEMBLED_LINES: readonly { file: string; key: string; text: string; surface: Surface }[] = [
  {
    // the defender row's third line WRAPS now (it used to ellipsise mid word
    // on every phone), so it is a sentence in a card, not a chip line
    file: "src/app/bots/battles/BattlesClient.tsx",
    key: "assembled.defenderLine3",
    text: "Medium, size 62, 3 wins, 2 losses",
    surface: "wrapping",
  },
  {
    file: "src/app/bots/battles/BattlesClient.tsx",
    key: "assembled.ladderReward",
    text: "10 fight points, 40 coins if you win",
    surface: "wrapping",
  },
  {
    file: "src/app/bots/battles/BattlesClient.tsx",
    key: "assembled.ladderLose",
    text: "8 coins if you lose. You win a free part in about 1 fight out of 3.",
    surface: "wrapping",
  },
  {
    file: "src/app/bots/battles/BattlesClient.tsx",
    key: "assembled.stakeSentence",
    text: "If you win you get 100 coins back. You get 25 extra coins too. If you lose, you do not get them back. Your 50 coins go to Speedy Otter 41.",
    surface: "wrapping",
  },
  {
    // the stat tile is a 44px flex row with the WORD at one end and the
    // NUMBER at the other (BuildClient StatTile, justify-content: space
    // between), so the budget is the word, never the word plus the number
    file: "src/app/bots/garage/build/BuildClient.tsx",
    key: "assembled.trayStat",
    text: "Swings",
    surface: "tray_stat_item",
  },
  {
    file: "src/app/bots/shop/ShopClient.tsx",
    key: "assembled.cardLine",
    text: "Legs, 2 stars, Size 9",
    surface: "wrapping",
  },
];

// ---------------------------------------------------------------------------
// (1) banned words
// ---------------------------------------------------------------------------

/**
 * A banned word is one of five things: game jargon, finance jargon, a stat
 * short form, an idiom that does not survive translation, or a word this game
 * deliberately retired. The list in src/lib/bots/naming.ts is imported by that
 * lane's own gate; this one carries the copy pack's additions so the two lists
 * can be merged later without either gate going quiet in the meantime.
 */
const BANNED: readonly string[] = [
  // stat short forms
  "spd", "str", "dge", "dmg", "blk", "hp", "lck", "acc", "asp", "atk", "def", "dps", "xp",
  // the retired vocabulary
  "spar", "sparring", "ghost", "stake", "the pot", "house bonus", "bracket", "bankroll",
  "tier", "t1", "t2", "t3", "t4", "model number", "set bonus", "style set", "color set",
  "seat cap", "roi", "counted volume", "settle", "settlement", "payout",
  "the rack", "the shelf", "shelf", "shelves", "attribution", "denominator", "keeper",
  "repair", "recycle", "level gate", "damage", "body armor", "build points", "pts",
  "decal", "equip", "bay", "bays", "shipment", "the pit", "upset", "class", "weight class",
  "tool board", "crew", "fill", "fills", "strategy", "pvp", "pve", "ko", "hash", "nonce",
  "signature", "gas", "approvals", "enlist", "replay", "listings",
  // idioms
  "square up", "hangs on", "land easier", "gave out", "dead even", "held off",
  "fell off the truck", "on time at", "headshot", "is done", "no brainer",
  "under the hood", "out of the box", "game changer", "rule of thumb", "sweet spot",
];

/** Strings that may keep a banned word, and the reason. Anything not on this
 * list fails, so an exception has to be argued once and written down. */
const BANNED_ALLOW: readonly { text: string; why: string }[] = [
  { text: "BATTLE BOTS", why: "the game's own name; a brand is not vocabulary" },
  { text: "Sign in to play Battle Bots. This only proves it is you. It moves no money and costs nothing.", why: "the wallet popup; 'Battle Bots' is the product name" },
  { text: "Fight code {h}", why: "the one engineering token a player may see, and it is labelled" },
];

const wordRe = (w: string): RegExp => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");

// ---------------------------------------------------------------------------
// (2) banned characters
// ---------------------------------------------------------------------------

const BANNED_CHAR: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\u2014/, why: "em-dash" },
  { pattern: /\u2013/, why: "en-dash" },
  { pattern: /\$(?!\{)/, why: "a dollar figure never appears on a player surface" },
  { pattern: /%/, why: "a per cent sign never appears on a player surface" },
  { pattern: /0x[0-9a-f]{4}/i, why: "a wallet address never appears on a player surface" },
  { pattern: / \. /, why: "the lone full stop used as a divider: translation memories and screen readers read it as the end of a sentence" },
];

// ---------------------------------------------------------------------------
// (3) width
// ---------------------------------------------------------------------------

/** Worst case fillers, so a budget is measured against the widest real render. */
const SAMPLE: Readonly<Record<string, string>> = {
  A: "Speedy Otter", B: "Rusty Beetle", bot: "Speedy Otter", name: "Speedy Otter",
  winner: "Speedy Otter", loser: "Rusty Beetle", who: "Speedy Otter",
  part: "right arm", arm: "right arm", slot: "right arm", piece: "right arm",
  dmg: "12", lost: "12", n: "12", t: "4", w: "12", l: "12", pts: "62", size: "62", score: "62", total: "62",
  coins: "500", time: "14 hours", color: "light green", colour: "light green",
  family: "Spark 3", brand: "Spark", model: "3", kind: "Buy low, sell high",
  day: "Wednesday", yes: "yes", updown: "up a little", have: "3", shown: "8",
  fills: "9", roi: "up a little", url: "battlebots.example", x: "3",
};

function render(text: string): string {
  return text
    .replace(/\{(\w+)\}/g, (m, k: string) => SAMPLE[k] ?? m)
    .replace(/\$\{[^}]+\}/g, "Speedy Otter");
}

// ---------------------------------------------------------------------------
// (4) one idea, one word
// ---------------------------------------------------------------------------

const SYNONYMS: readonly { idea: string; approved: string; variants: readonly string[] }[] = [
  { idea: "how good a part is", approved: "stars", variants: ["tier", "model number", "class of 4"] },
  { idea: "three numbers added up", approved: "size", variants: ["build points", "power", "pts", "total"] },
  { idea: "the weekly score", approved: "fight points", variants: ["battle points"] },
  { idea: "the buy screen", approved: "parts", variants: ["junkyard", "the shop", "the shelf", "the rack"] },
  { idea: "your loose parts", approved: "your parts", variants: ["tool board", "spares"] },
  { idea: "a garage slot", approved: "spot", variants: ["bay"] },
  { idea: "broken and waiting", approved: "being fixed", variants: ["in the shop", "repair", "hurt", "resting"] },
  { idea: "what a hit takes off", approved: "life", variants: ["damage", "body armor", "health"] },
  { idea: "the free fight", approved: "practice", variants: ["spar", "sparring"] },
  { idea: "the offline opponent", approved: "saved copy", variants: ["ghost"] },
  { idea: "coins at risk", approved: "coins you put in", variants: ["stake", "the pot"] },
  { idea: "robot size band", approved: "size", variants: ["weight class", "class"] },
  { idea: "auto trading", approved: "auto trading", variants: ["strategy", "plan"] },
  { idea: "a completed trade", approved: "trade", variants: ["fill", "fills"] },
  { idea: "the sign in button", approved: "play", variants: ["sign in to fight", "enlist"] },
  { idea: "the fight floor", approved: "the ring", variants: ["the pit"] },
  { idea: "a sticker", approved: "sticker", variants: ["decal"] },
  { idea: "putting a part on", approved: "put on", variants: ["equip"] },
  { idea: "turning it back into coins", approved: "sell", variants: ["recycle", "break up"] },
  { idea: "the leaderboard", approved: "leaders", variants: ["the board"] },
  { idea: "a player row", approved: "player", variants: ["garage column", "wallet name"] },
];

// ---------------------------------------------------------------------------
// (5) the glossary
// ---------------------------------------------------------------------------

const GLOSSARY: readonly { word: string; sentence: string }[] = [
  { word: "coins", sentence: "Coins are the money inside the game. You buy parts with them." },
  { word: "stars", sentence: "Stars show how good a part is. 1 star is the worst. 4 stars is the best. The number in the part's name is its stars." },
  { word: "size", sentence: "Size is a robot's numbers added up. A bigger robot is a stronger robot." },
  { word: "matching", sentence: "Four body parts with the same name make your robot stronger. Four in the same colour do too." },
  { word: "fight points", sentence: "Fight points are your score for the week. The best scores win the prizes." },
  { word: "a saved copy", sentence: "You fight a saved copy of their robot. That player is not here, and their robot cannot break." },
  { word: "being fixed", sentence: "A robot that loses a real fight is being fixed for one day. It cannot fight until it is ready." },
];

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

interface Finding {
  gate: string;
  file: string;
  line: number;
  key: string;
  text: string;
  message: string;
}

const findings: Finding[] = [];
function fail(gate: string, e: Pick<Entry, "file" | "line" | "key" | "text">, message: string): void {
  findings.push({ gate, file: e.file, line: e.line, key: e.key, text: e.text, message });
}

function gateBannedWords(): void {
  const allow = new Set(BANNED_ALLOW.map((a) => a.text));
  for (const e of corpus) {
    if (allow.has(e.text)) continue;
    const words = codeless(e.text);
    for (const w of BANNED) {
      if (wordRe(w).test(words)) {
        fail("banned word", e, `the word "${w}" is banned on a player surface`);
        break;
      }
    }
  }
}

function gateBannedChars(): void {
  for (const e of corpus) {
    const words = codeless(e.text);
    for (const b of BANNED_CHAR) {
      if (b.pattern.test(words)) {
        fail("banned char", e, b.why);
        break;
      }
    }
  }
}

function gateWidth(): void {
  for (const e of corpus) {
    const shown = render(e.text);
    const max = BUDGET[e.surface];
    if (shown.length > max) {
      fail("width", e, `${shown.length} characters on the ${e.surface} surface, which holds ${max}: "${shown}"`);
    }
  }
}

function gateOneWord(): void {
  for (const s of SYNONYMS) {
    const hits = new Map<string, Entry[]>();
    for (const e of corpus) {
      const words = codeless(e.text);
      for (const v of s.variants) {
        if (wordRe(v).test(words)) {
          const list = hits.get(v) ?? [];
          list.push(e);
          hits.set(v, list);
        }
      }
    }
    if (hits.size === 0) continue;
    for (const [variant, entries] of Array.from(hits.entries())) {
      for (const e of entries) {
        fail("one idea one word", e, `"${variant}" is a second word for ${s.idea}; the approved word is "${s.approved}"`);
      }
    }
  }
}

function gateGlossary(): void {
  for (const g of GLOSSARY) {
    const found = corpus.filter((e) => e.text === g.sentence);
    if (found.length === 0) {
      findings.push({
        gate: "glossary",
        file: "src/lib/bots/strings.ts",
        line: 0,
        key: `teach.${g.word}`,
        text: g.sentence,
        message: `the game teaches "${g.word}" and the teaching sentence is not in the shipped copy`,
      });
    } else if (found.length > 1) {
      for (const e of found) {
        fail("glossary", e, `the teaching sentence for "${g.word}" appears ${found.length} times; it is said once, where the word first appears`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

function main(): void {
  collect();

  if (WANT_LIST) {
    for (const e of corpus.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      const shown = render(e.text);
      console.log(`${e.file}:${e.line}  [${e.surface} ${shown.length}/${BUDGET[e.surface]}]  ${e.key}  ${e.text}`);
    }
    console.log(`\n${corpus.length} player strings.`);
    return;
  }

  gateBannedWords();
  gateBannedChars();
  gateWidth();
  gateOneWord();
  gateGlossary();

  if (WANT_JSON) {
    console.log(JSON.stringify({ strings: corpus.length, findings }, null, 2));
    process.exit(findings.length === 0 ? 0 : 1);
  }

  const byGate = new Map<string, Finding[]>();
  for (const f of findings) byGate.set(f.gate, [...(byGate.get(f.gate) ?? []), f]);

  for (const gate of ["banned word", "banned char", "width", "one idea one word", "glossary"]) {
    const list = byGate.get(gate) ?? [];
    if (list.length === 0) {
      console.log(`[OK]   bots copy ${gate}`);
      continue;
    }
    console.log(`[FAIL] bots copy ${gate}: ${list.length}`);
    for (const f of list.slice(0, 40)) {
      console.log(`         ${f.file}:${f.line} ${f.key}`);
      console.log(`           "${f.text}"`);
      console.log(`           ${f.message}`);
    }
    if (list.length > 40) console.log(`         ... and ${list.length - 40} more`);
  }

  console.log(`\n${corpus.length} player strings checked, ${findings.length} problems.`);
  process.exit(findings.length === 0 ? 0 : 1);
}

main();
