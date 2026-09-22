/**
 * BATTLE BOTS EARNED CHECK: the merge gate for WHAT A ROBOT EARNED.
 *
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/bots-earned-check.ts
 *
 * THIS GATE IMPORTS THE SHIPPED MODULES. It does not restate one ladder step,
 * one earn line or one count, because a gate that reimplements the thing it
 * checks reproduces the author's assumptions and passes (the Domain Kitchen
 * lesson). scripts/_shims/server-only.ts is what lets it reach into the real
 * server files; that is why the --tsconfig flag is not optional.
 *
 * SEVEN GATES:
 *  (a) THE ARROW RUNS ONE WAY. Nothing in _engine imports the shelf, the look
 *      census or the earned route. What a robot earned is a picture; the sim
 *      never reads a picture. The replay rollup in bots-harness.ts is the
 *      other half of that proof.
 *  (b) A ROW LIGHTS ON ITS OWN STEP and not one fight before it, walked over
 *      real wins, lost fights and levels through the shipped findsOf.
 *  (c) HANDED NOTHING, EVERYTHING IS LOCKED. The garage draws before the
 *      server answers and for a player who never connected a wallet, and in
 *      both cases the honest answer is that nothing has been earned.
 *  (d) NOTHING CAPS. Past the last drawn star and the third patch the words
 *      keep counting, at 25 wins, at 137 and at 1000.
 *  (e) THE NEWS IS A DIFFERENCE, never a re-announcement: one line per step
 *      actually gained, nothing when nothing moved, and the true count.
 *  (f) A CARD THAT DOES NOT MATCH ITS OWN SIGNATURE IS NOT SHOWN. That is the
 *      whole reason the rows were signed.
 *  (g) THE LOOK COUNT IS A COUNT OF ROBOTS: it takes the robot itself back
 *      off, and it answers null rather than a wrong number when the census
 *      cannot see every robot.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  CUFF_LEVELS,
  PATCHES_DRAWN,
  SPARKLE_LEVEL,
  STAR_STEPS,
  earnedMarks,
  markWords,
  twinWords,
  type LookEarned,
} from "../src/lib/bots/look";
import { markNews, patchCount, shelfNothing, shelfRows, shelfSummary, starSteps } from "../src/lib/bots/shelf";
import { STRINGS } from "../src/lib/bots/strings";
import { dedupeHats, marksOf, type HatWon } from "../src/lib/bots/look";
import { earnedFor, type BotRow, type PartRow } from "../src/app/bots/_server/bots";
import { CARD_FIRST_WIN, canonicalJson, loadCards, signCard, type CardPayload } from "../src/app/bots/_server/cards";
import { BOT_CAP, censusKey, forgetCensus, twinCounts } from "../src/app/bots/_server/twins";
import type { CardSlot } from "../src/lib/bots/fixtures";
import type { PaintId } from "../src/app/bots/_engine/parts";

const ROOT = path.resolve(__dirname, "..");
let failures = 0;

function report(ok: boolean, tag: string, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${tag}  ${detail}`);
}

// ---------------------------------------------------------------------------
// row builders: the real shapes, so the gate exercises the shipped readers
// ---------------------------------------------------------------------------

let nextPartId = 1;
function part(slot: CardSlot, partKey: string, tier: 1 | 2 | 3 | 4, paint?: PaintId, botId = 1): PartRow {
  return {
    id: nextPartId++,
    wallet: "0xtest",
    part_key: partKey,
    slot_kind: slot,
    tier,
    stats: { s: [tier, tier, tier], paint },
    bot_id: botId,
    source: "shop",
    list_price: 50,
    recycled_at: null,
    is_test: true,
    created_at: "2026-09-05T00:00:00.000Z",
  };
}

function idsOf(parts: readonly PartRow[]): Record<CardSlot, number | null> {
  const ids = { legs: null, arms: null, torso: null, head: null, weapon: null } as Record<CardSlot, number | null>;
  for (const p of parts) ids[p.slot_kind] = p.id;
  return ids;
}

function bot(o: Partial<BotRow> & { parts: PartRow[] }): BotRow {
  return {
    id: o.id ?? 1,
    wallet: "0xtest",
    slot: o.slot ?? 1,
    name: "Speedy Otter 7",
    build: { parts: idsOf(o.parts) as never, name: { first: "Speedy", second: "Otter", num: 7 }, ...(o.build || {}) },
    total: 0,
    tier: 1,
    weight_class: "light",
    level: o.level ?? 1,
    xp: 0,
    wins: o.wins ?? 0,
    losses: o.losses ?? 0,
    broken_until: null,
    attacks_day_key: null,
    attacks_today: 0,
    defenses_today: 0,
    listed: true,
    recycled_at: null,
    is_test: true,
    created_at: "2026-09-05T00:00:00.000Z",
  };
}

/** four colours, the normal robot: head mint, body coral, arms sky, legs butter */
const fourColour = (botId = 1): PartRow[] => [
  part("head", "head.hornetScope", 2, "mint", botId),
  part("torso", "torso.kettleChest", 2, "coral", botId),
  part("arms", "arms.kettleGrips", 2, "sky", botId),
  part("legs", "legs.kettleShins", 2, "butter", botId),
  part("weapon", "weapon.steelSaw", 2, undefined, botId),
];

/** all four body parts mint: what unlocks the wink */
const allMint = (botId = 1): PartRow[] => [
  part("head", "head.hornetScope", 2, "mint", botId),
  part("torso", "torso.kettleChest", 2, "mint", botId),
  part("arms", "arms.kettleGrips", 2, "mint", botId),
  part("legs", "legs.kettleShins", 2, "mint", botId),
  part("weapon", "weapon.steelSaw", 2, undefined, botId),
];

/** one four star part: what unlocks the star eyes. The star count is read off
 * the catalogue, never off the row this file wrote. */
const oneFourStar = (botId = 1): PartRow[] => [
  part("head", "head.bulldozerHelm", 4, "ink", botId),
  part("torso", "torso.hornetFrame", 3, "coral", botId),
  part("arms", "arms.kettleGrips", 2, "moss", botId),
  part("legs", "legs.kettleShins", 2, "sky", botId),
  part("weapon", "weapon.steelSaw", 2, undefined, botId),
];

/** What the routes hand the shelf: a LookEarned built by the shipped reader
 * out of rows, never a hand written object. */
function earnedOfRows(
  parts: readonly PartRow[],
  o: { wins?: number; losses?: number; level?: number; crown?: boolean; hats?: HatWon[] } = {},
): LookEarned {
  return earnedFor(
    {
      wins: o.wins ?? 0,
      losses: o.losses ?? 0,
      level: o.level ?? 1,
      crown: !!o.crown,
      partIds: idsOf(parts) as never,
      plateNumber: 7,
    },
    parts,
    // a bare kind is the pre-009 row: a hat with no colour recorded, which
    // is a real case and stays under test beside the coloured ones
    dedupeHats(o.hats ?? []),
  );
}

const rowOf = (e: LookEarned, id: string) => shelfRows(e).find((r) => r.id === id)!;

// ---------------------------------------------------------------------------
// (a) the arrow runs one way
// ---------------------------------------------------------------------------

function gateOneWay(): void {
  const dir = path.join(ROOT, "src/app/bots/_engine");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
  const bad: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of Array.from(src.matchAll(/from\s+"([^"]+)"/g))) {
      const spec = m[1];
      if (/\/shelf$|\/twins$|_server\/|_view\/|api\/bots/.test(spec)) bad.push(`${f} imports ${spec}`);
    }
  }
  report(bad.length === 0, "(a) one way", bad.length ? bad.join("; ") : `${files.length} engine files import no shelf, no census and no route`);

  // and the other direction is allowed to reach the engine for its ids only
  const shelf = fs.readFileSync(path.join(ROOT, "src/lib/bots/shelf.ts"), "utf8");
  report(
    !/_engine/.test(shelf),
    "(a) one way",
    "the shelf reaches the engine through look.ts and never directly",
  );
}

// ---------------------------------------------------------------------------
// (b) a row lights on its own step, and not one fight before it
// ---------------------------------------------------------------------------

function gateSteps(): void {
  // the chest star: the first step is the first win
  const first = STAR_STEPS[0];
  const before = rowOf(earnedOfRows(fourColour(), { wins: first - 1 }), "star");
  const on = rowOf(earnedOfRows(fourColour(), { wins: first }), "star");
  report(!before.earned && on.earned, "(b) stars", `locked at ${first - 1} wins, lit at ${first}`);

  // the patch: one lost fight
  const p0 = rowOf(earnedOfRows(fourColour(), { losses: 0 }), "patch");
  const p1 = rowOf(earnedOfRows(fourColour(), { losses: 1 }), "patch");
  report(!p0.earned && p1.earned, "(b) patches", "locked with no lost fights, lit after one");

  // the cuff bands and the sparkle, on the level the ladder names
  const cuffAt = CUFF_LEVELS[0];
  const c0 = rowOf(earnedOfRows(fourColour(), { level: cuffAt - 1 }), "cuff");
  const c1 = rowOf(earnedOfRows(fourColour(), { level: cuffAt }), "cuff");
  report(!c0.earned && c1.earned, "(b) cuffs", `locked at level ${cuffAt - 1}, lit at ${cuffAt}`);
  const s0 = rowOf(earnedOfRows(fourColour(), { level: SPARKLE_LEVEL - 1 }), "sparkle");
  const s1 = rowOf(earnedOfRows(fourColour(), { level: SPARKLE_LEVEL }), "sparkle");
  report(!s0.earned && s1.earned, "(b) sparkle", `locked at level ${SPARKLE_LEVEL - 1}, lit at ${SPARKLE_LEVEL}`);

  // the two earned faces come off the PARTS, not off a number anybody types
  const wink = rowOf(earnedOfRows(allMint()), "wink");
  const winkNot = rowOf(earnedOfRows(fourColour()), "wink");
  report(wink.earned && !winkNot.earned, "(b) wink", "lit by four body parts in one colour, locked by four colours");
  const eyes = rowOf(earnedOfRows(oneFourStar()), "starEyes");
  const eyesNot = rowOf(earnedOfRows(fourColour()), "starEyes");
  report(eyes.earned && !eyesNot.earned, "(b) star eyes", "lit by a four star part, locked without one");

  // a hat and a crown are rows, so nothing but a row lights them
  const hat = rowOf(earnedOfRows(fourColour(), { hats: [{ kind: "bow", color: "coral" }] }), "hat");
  const hatNot = rowOf(earnedOfRows(fourColour(), { wins: 99, level: 20 }), "hat");
  report(hat.earned && !hatNot.earned, "(b) hat", "lit by a hat row, and 99 wins alone never lights it");
  const crown = rowOf(earnedOfRows(fourColour(), { crown: true }), "crown");
  const crownNot = rowOf(earnedOfRows(fourColour(), { wins: 500 }), "crown");
  report(crown.earned && !crownNot.earned, "(b) crown", "lit by a champion card, and 500 wins alone never lights it");

  // every row carries the sentence that says how it is earned
  const all = shelfRows(earnedOfRows(fourColour()));
  const missing = all.filter((r) => !r.name.trim() || !r.earn.trim() || !/[.]$/.test(r.earn));
  report(missing.length === 0, "(b) rows", `${all.length} rows, each with a name and one earn sentence`);
}

// ---------------------------------------------------------------------------
// (c) handed nothing, everything is locked
// ---------------------------------------------------------------------------

function gateNothing(): void {
  const rows = shelfRows(null);
  report(rows.every((r) => !r.earned), "(c) no answer", `all ${rows.length} rows locked when the server has not answered`);
  report(rows.every((r) => !!r.earn), "(c) no answer", "and every locked row still says how it is earned");
  const marks = earnedMarks(earnedOfRows(fourColour()));
  report(shelfSummary(marks, 0) === "", "(c) no answer", "a brand new robot has no summary line, not a row of zeroes");
  report(/[a-z]/.test(shelfNothing("Speedy Otter")), "(c) no answer", `and one plain line instead: "${shelfNothing("Speedy Otter")}"`);
}

// ---------------------------------------------------------------------------
// (d) nothing caps
// ---------------------------------------------------------------------------

function gateNoCap(): void {
  const last = STAR_STEPS[STAR_STEPS.length - 1];
  for (const wins of [last, 137, 1000]) {
    const m = marksOf(wins, 0, 1, false);
    const line = shelfSummary(m, wins);
    report(line.includes(String(wins)), "(d) no cap", `at ${wins} wins the words carry the number: "${line}"`);
    report(starSteps(m) >= STAR_STEPS.length, "(d) no cap", `and the ladder has reached ${starSteps(m)} steps, past the ${STAR_STEPS.length} drawn ones`);
  }
  for (const losses of [PATCHES_DRAWN, PATCHES_DRAWN + 1, 40]) {
    const m = marksOf(0, losses, 1, false);
    report(patchCount(m) === losses, "(d) no cap", `${losses} lost fights are ${patchCount(m)} patches, ${m.patches} drawn and ${m.patchesBeyond} counted`);
  }
  const many = shelfSummary(marksOf(0, 40, 1, false), 0);
  report(many.includes("40") || many.includes("37"), "(d) no cap", `and the words say the rest out loud: "${many}"`);
}

// ---------------------------------------------------------------------------
// (e) the news is a difference
// ---------------------------------------------------------------------------

function gateNews(): void {
  const at = (wins: number, losses: number) => marksOf(wins, losses, 1, false);

  report(markNews("Speedy Otter", 3, at(3, 0), at(3, 0)).length === 0, "(e) news", "nothing moved, nothing printed");

  // a win that is not a step is not news
  const between = markNews("Speedy Otter", 3, at(2, 0), at(3, 0));
  report(between.length === 0, "(e) news", "a win between two steps says nothing");

  // the step itself is one line, and it prints the true count
  const step = markNews("Speedy Otter", STAR_STEPS[1], at(STAR_STEPS[0], 0), at(STAR_STEPS[1], 0));
  report(step.length === 1 && step[0].includes(String(STAR_STEPS[1])), "(e) news", `the step is one line: "${step[0]}"`);

  // the gold star is announced once and never again
  const goldAt = STAR_STEPS[STAR_STEPS.length - 1];
  const gold = markNews("Speedy Otter", goldAt, at(goldAt - 1, 0), at(goldAt, 0));
  const after = markNews("Speedy Otter", goldAt + 1, at(goldAt, 0), at(goldAt + 1, 0));
  report(gold.length === 1 && gold[0] === STRINGS.en.news.goldStar.replace("{name}", "Speedy Otter").replace("{n}", String(goldAt)), "(e) news", `the gold star: "${gold[0]}"`);
  report(after.length === 0, "(e) news", "and the next win does not announce it again");

  // several steps at once are one line that says how many
  const jump = markNews("Speedy Otter", STAR_STEPS[2], at(0, 0), at(STAR_STEPS[2], 0));
  report(jump.length === 1 && jump[0].includes("3"), "(e) news", `three steps in one night read as one line: "${jump[0]}"`);

  // a patch and a star can both land in the same night
  const both = markNews("Speedy Otter", STAR_STEPS[0], at(0, 0), at(STAR_STEPS[0], 1));
  report(both.length === 2, "(e) news", `a win and a loss give two lines: "${both.join(" ")}"`);

  // NOTHING EVER SAYS "1 wins". Every line that carries a number is walked at
  // every count a ladder can hand it, because a template cannot count.
  const plural: string[] = [];
  for (let w = 1; w <= 60; w++) {
    for (let l = 0; l <= 5; l++) {
      for (const line of markNews("Speedy Otter", w, at(Math.max(0, w - 1), Math.max(0, l - 1)), at(w, l))) {
        if (/\b1 (wins|stars|patches)\b/.test(line)) plural.push(line);
        if (/\b([02-9]|\d\d+) (win|star|patch)\b/.test(line)) plural.push(line);
      }
    }
  }
  report(plural.length === 0, "(e) news", plural.length ? plural.slice(0, 3).join(" | ") : "60 wins and 5 lost fights walked: no line ever says \"1 wins\"");

  // past the drawn patches the news still lands
  const beyond = markNews("Speedy Otter", 0, at(0, PATCHES_DRAWN), at(0, PATCHES_DRAWN + 2));
  report(beyond.length === 1 && beyond[0].includes("2"), "(e) news", `past the drawn patches it still counts: "${beyond[0]}"`);

  // and the paper reads only fights that moved a record
  const paper = fs.readFileSync(path.join(ROOT, "src/app/bots/_server/paper.ts"), "utf8");
  report(/neq\("mode", "spar"\)/.test(paper), "(e) news", "practice is left out of the count, because practice moves no record");
}

// ---------------------------------------------------------------------------
// (f) a card that does not match its own signature is not shown
// ---------------------------------------------------------------------------

interface StubRow {
  [k: string]: unknown;
}

/** The smallest thing that answers like the supabase builder chain: every
 * filter returns itself and the whole thing is awaited for { data, error }. */
function stubDb(answer: (table: string) => { data: StubRow[] | null; error: { message: string } | null }) {
  const make = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "not", "gte", "like", "order", "limit"]) {
      chain[m] = () => chain;
    }
    chain.then = (res: (v: unknown) => void) => Promise.resolve(answer(table)).then(res);
    return chain;
  };
  return { from: (table: string) => make(table) } as never;
}

function cardPayload(botId: number, fightId: string): CardPayload {
  return {
    kind: CARD_FIRST_WIN,
    fightId,
    botId,
    botName: "Speedy Otter 7",
    walletName: "Cog Lantern 66",
    beat: "Rusty Beetle 3",
    beatWallet: "Steam Wren 12",
    at: "2026-09-05T00:00:00.000Z",
    hash: "fe93b410",
    engineVersion: 2,
  };
}

async function gateCards(): Promise<void> {
  const good = cardPayload(1, "10");
  const tampered = cardPayload(2, "11");
  const goodSig = signCard(good);
  const tamperedSig = signCard(tampered);
  // the row is edited AFTER it was signed, which is what a signature exists
  // to catch: the payload now names a robot the card was never made for
  const edited = { ...tampered, botName: "Somebody Else 9" };
  report(canonicalJson(edited) !== canonicalJson(tampered), "(f) cards", "the edited payload really is different");

  const db = stubDb(() => ({
    data: [
      { id: 2, wallet: "0xtest", bot_id: 2, kind: CARD_FIRST_WIN, window_key: "", payload: edited, signature: tamperedSig, claimed_at: null, is_test: true, created_at: "2026-09-05T00:00:00.000Z" },
      { id: 1, wallet: "0xtest", bot_id: 1, kind: CARD_FIRST_WIN, window_key: "", payload: good, signature: goodSig, claimed_at: null, is_test: true, created_at: "2026-09-05T00:00:00.000Z" },
      { id: 3, wallet: "0xtest", bot_id: 3, kind: CARD_FIRST_WIN, window_key: "", payload: null, signature: null, claimed_at: null, is_test: true, created_at: "2026-09-05T00:00:00.000Z" },
    ],
    error: null,
  }));
  const out = await loadCards(db, "0xTEST");
  report(out.length === 1 && out[0].id === 1, "(f) cards", `${out.length} of 3 rows shown: the signed one, not the edited one and not the empty one`);
}

// ---------------------------------------------------------------------------
// (g) the look count is a count of robots
// ---------------------------------------------------------------------------

async function gateTwins(): Promise<void> {
  // three robots: two identical, one in different colours
  const p1 = fourColour(1);
  const p2 = fourColour(2).map((p) => ({ ...p, bot_id: 2 }));
  const p3 = allMint(3).map((p) => ({ ...p, bot_id: 3 }));
  const b1 = bot({ id: 1, slot: 1, parts: p1 });
  const b2 = bot({ id: 2, slot: 2, parts: p2 });
  const b3 = bot({ id: 3, slot: 3, parts: p3 });
  const allParts = [...p1, ...p2, ...p3];

  report(censusKey(b1, p1) === censusKey(b2, p2), "(g) twins", "two robots in the same four colours share one key");
  report(censusKey(b1, p1) !== censusKey(b3, p3), "(g) twins", "and a robot in one colour does not");

  const db = stubDb((table) => ({
    data: (table === "battle_bots_bots" ? [b1, b2, b3] : allParts) as unknown as StubRow[],
    error: null,
  }));
  forgetCensus();
  const counts = await twinCounts(db, [b1, b3], allParts, true);
  report(counts.get(1) === 1, "(g) twins", `the robot itself is taken back off: ${counts.get(1)} other robot looks like it`);
  report(counts.get(3) === 0, "(g) twins", `and the one nobody copied answers ${counts.get(3)}`);
  report(twinWords(counts.get(3) ?? 0) === "Only yours looks like this.", "(g) twins", `which reads "${twinWords(counts.get(3) ?? 0)}"`);
  report(twinWords(counts.get(1) ?? 0) === "1 other robot looks like this one.", "(g) twins", `and "${twinWords(counts.get(1) ?? 0)}"`);

  // a census that cannot see every robot answers null, never a number
  const tooMany = Array.from({ length: BOT_CAP + 1 }, (_, i) => bot({ id: i + 1, parts: p1 }));
  const bigDb = stubDb((table) => ({
    data: (table === "battle_bots_bots" ? tooMany : []) as unknown as StubRow[],
    error: null,
  }));
  forgetCensus();
  const capped = await twinCounts(bigDb, [b1], [], true);
  report(capped.get(1) === null, "(g) twins", `past ${BOT_CAP} robots the answer is no line at all, never a wrong number`);

  // and a read that fails takes nothing down with it
  const deadDb = stubDb(() => ({ data: null, error: { message: "relation does not exist" } }));
  forgetCensus();
  const dead = await twinCounts(deadDb, [b1], [], true);
  report(dead.get(1) === null, "(g) twins", "a failed read answers null and never throws");
  forgetCensus();
}

// ---------------------------------------------------------------------------
// (h) the words
// ---------------------------------------------------------------------------

function gateWords(): void {
  const rows = shelfRows(earnedOfRows(fourColour(), { wins: 5, losses: 2, level: 10, hats: [{ kind: "bell", color: "sky" }], crown: true }));
  const text = [...rows.map((r) => `${r.name}. ${r.earn}`), STRINGS.en.recycle.marks, STRINGS.en.earned.nothing, STRINGS.en.earned.connect, ...Object.values(STRINGS.en.news)].join(" ");
  report(!/—|–/.test(text), "(h) words", "no em-dash and no en-dash anywhere on the list");
  report(!/\$|%/.test(text), "(h) words", "no money and no per cent sign");
  report(/star/i.test(STRINGS.en.recycle.marks) && /patch/i.test(STRINGS.en.recycle.marks), "(h) words", `selling says what goes with it: "${STRINGS.en.recycle.marks}"`);
  // the summary is the SAME sentence markWords gives everywhere else
  const m = marksOf(5, 2, 10, true);
  report(shelfSummary(m, 5) === markWords(m, 5).join(" "), "(h) words", "the summary line is markWords and nothing else");
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n-- the arrow runs one way --");
  gateOneWay();
  console.log("\n-- a row lights on its own step --");
  gateSteps();
  console.log("\n-- handed nothing, everything is locked --");
  gateNothing();
  console.log("\n-- nothing caps --");
  gateNoCap();
  console.log("\n-- the news is a difference --");
  gateNews();
  console.log("\n-- a card has to match its own signature --");
  await gateCards();
  console.log("\n-- how many robots look like this one --");
  await gateTwins();
  console.log("\n-- the words --");
  gateWords();

  console.log("");
  if (failures) {
    console.log(`${failures} CHECK${failures === 1 ? "" : "S"} FAILED`);
    process.exit(1);
  }
  console.log("ALL CHECKS GREEN");
}

void main();
