/**
 * THE JUNKYARD GATE (ADR-0141). Proves the shipped shipment module, by
 * IMPORTING it, never by restating its maths (the lesson: a gate that
 * reimplements the logic it checks reproduces the author's assumptions and
 * passes). Same report shape as scripts/bots-harness.ts: [OK] / [FAIL] per
 * gate, ALL CHECKS GREEN, exit 1 on any failure.
 *
 *   npx tsx scripts/bots-shipment-check.ts
 *   npx tsx scripts/bots-shipment-check.ts --fixture scripts/bots-shipment-60d.json
 *
 * GATES
 *  (a) the same day key always gives the same shelf
 *  (b) 60 consecutive days match the design lane's fixture exactly
 *  (c) every day has exactly 8, 4, 2, 1 body listings plus the rack
 *  (d) exactly one Tier 4 listing a day, in exactly one colour
 *  (e) every colour shows in the Tier 1 row inside any 8 day window
 *  (f) the T4 calendar walks head, torso, arms, legs, weapon, then the two
 *      repeat slots, and the repeats cover all four body slots every 2 weeks
 *  (g) the committed $200 player who buys only on the last day of the week
 *      completes a same colour Tier 4 body set in 28 days, both kinds of
 *      week, ending on 288 coins (the economy doc's arithmetic, replayed)
 *  (h) prices and the 40 percent recycle values are whole coins
 *  (i) the listing ids the shop screen shows are the ids the buy route
 *      accepts, and a weapon never carries a colour
 *  (j) the starter kit's per wallet colours are deterministic, in the
 *      palette, four body cards only, and they cover every card the real
 *      starter kit hands out
 *  (k) a part won from a fight arrives in a colour too: dropColor is
 *      deterministic, in the palette, and never colours a weapon
 *  (l) the catalogue's factory colour is art only: a card nobody gave a
 *      colour has none, and four of them never add up to a colour set
 *
 * (j), (k) and (l) call the SAME entry points the server calls
 * (starterColors, dropColor, partColor, setBonus). A gate with its own copy
 * of the colour rule would agree with the server by sharing its mistake.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { CARD_INDEX, PARTS, STARTER_PARTS } from "../src/app/bots/_engine/catalog";
import {
  BODY_SLOTS,
  PRICE_BY_TIER,
  partColor,
  setBonus,
  type Build,
  type Part,
  type Tier,
} from "../src/app/bots/_engine/parts";
import { RECYCLE_PERCENT, recycleValue } from "../src/lib/bots/fixtures";
import {
  LISTING_ID_RE,
  PALETTE,
  ROW_KEYS,
  ROW_SIZE,
  SHELF_SLOTS,
  T4_WALK,
  addDays,
  dayIndexOf,
  dropColor,
  manifestOf,
  shipmentFor,
  starterColors,
  t4Calendar,
  type Manifest,
  type Shipment,
} from "../src/lib/bots/shipment";

const arg = (flag: string, dflt: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.resolve(ROOT, arg("--fixture", "scripts/bots-shipment-60d.json"));
const DAYS = 60;

let failures = 0;
function report(ok: boolean, gate: string, msg: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "[OK] " : "[FAIL]"} junkyard ${gate} ${msg}`);
}

/* ── the fixture the design lane froze ───────────────────────────────────── */

interface Fixture {
  v: number;
  epoch: string;
  days: Manifest[];
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as Fixture;
const EPOCH = fixture.epoch;

/** The 60 days under test, built from the epoch the fixture was frozen at. */
const days: Shipment[] = [];
for (let i = 0; i < DAYS; i++) days.push(shipmentFor(addDays(EPOCH, i), i));

/* ── (a) determinism ─────────────────────────────────────────────────────── */
{
  const bad: string[] = [];
  for (const i of [0, 3, 17, 41, 59]) {
    const again = shipmentFor(addDays(EPOCH, i), i);
    if (JSON.stringify(manifestOf(again)) !== JSON.stringify(manifestOf(days[i]))) bad.push(days[i].dayKey);
  }
  // the day index must also come out of the day key on its own
  for (const i of [0, 6, 7, 59]) {
    if (dayIndexOf(addDays(EPOCH, i), EPOCH) !== i) bad.push(`dayIndexOf ${addDays(EPOCH, i)}`);
  }
  report(bad.length === 0, "(a)", bad.length === 0 ? "the same day key gives the same shelf, and the day index is the day key's" : `differed: ${bad.join(", ")}`);
}

/* ── (b) 60 days against the fixture ─────────────────────────────────────── */
{
  const bad: string[] = [];
  if (fixture.days.length !== DAYS) bad.push(`fixture holds ${fixture.days.length} days, expected ${DAYS}`);
  for (let i = 0; i < Math.min(DAYS, fixture.days.length); i++) {
    const mine = JSON.stringify(manifestOf(days[i]));
    const theirs = JSON.stringify(fixture.days[i]);
    if (mine !== theirs) bad.push(fixture.days[i].day_key);
  }
  report(bad.length === 0, "(b)", bad.length === 0 ? `${DAYS} days match ${path.relative(ROOT, FIXTURE)} exactly` : `${bad.length} day(s) differ: ${bad.slice(0, 5).join(", ")}`);
}

/* ── (c) row sizes ───────────────────────────────────────────────────────── */
{
  const bad: string[] = [];
  for (const s of days) {
    for (const row of ROW_KEYS) if (s.rows[row].length !== ROW_SIZE[row]) bad.push(`${s.dayKey} ${row}=${s.rows[row].length}`);
    if (s.listings.length !== 16) bad.push(`${s.dayKey} total=${s.listings.length}`);
    // every body slot twice in the T1 row, once in the T2 row
    for (const slot of SHELF_SLOTS) {
      if (s.rows.t1.filter((l) => l.slot === slot).length !== 2) bad.push(`${s.dayKey} T1 ${slot}`);
      if (s.rows.t2.filter((l) => l.slot === slot).length !== 1) bad.push(`${s.dayKey} T2 ${slot}`);
    }
    if (s.rows.rack[0].slot !== "weapon") bad.push(`${s.dayKey} rack is not a weapon`);
  }
  report(bad.length === 0, "(c)", bad.length === 0 ? "every day is 8 / 4 / 2 / 1 body listings plus the rack, each body slot twice in T1" : bad.slice(0, 5).join(", "));
}

/* ── (d) one T4 a day, one colour ────────────────────────────────────────── */
{
  const bad: string[] = [];
  for (const s of days) {
    const t4 = s.listings.filter((l) => l.tier === 4 && l.row === "t4");
    if (t4.length !== 1) bad.push(`${s.dayKey} has ${t4.length} T4 listings`);
    const colours = new Set(t4.map((l) => l.color));
    if (colours.size !== 1) bad.push(`${s.dayKey} T4 in ${colours.size} colours`);
    const one = t4[0];
    if (one.slot === "weapon") {
      if (one.color !== null) bad.push(`${s.dayKey} T4 weapon carries a colour`);
    } else if (one.color === null) {
      bad.push(`${s.dayKey} T4 body part has no colour`);
    }
    // and no other row ever sells a T4
    if (s.listings.some((l) => l.row !== "t4" && l.tier === 4)) bad.push(`${s.dayKey} a T4 leaked into another row`);
  }
  report(bad.length === 0, "(d)", bad.length === 0 ? "exactly one Tier 4 listing a day, in exactly one colour, nowhere else on the shelf" : bad.slice(0, 5).join(", "));
}

/* ── (e) every colour returns inside 8 days ──────────────────────────────── */
{
  const bad: string[] = [];
  for (let start = 0; start + 8 <= DAYS; start++) {
    const seen = new Set<string>();
    for (let i = start; i < start + 8; i++) for (const l of days[i].rows.t1) if (l.dayColor && l.color) seen.add(l.color);
    for (const c of PALETTE) if (!seen.has(c)) bad.push(`${days[start].dayKey}+8 misses ${c}`);
  }
  // and the three row colours never collide on a day
  for (const s of days) {
    const { t1, t2, t3 } = s.colors;
    if (t1 === t2 || t2 === t3 || t1 === t3) bad.push(`${s.dayKey} row colours collide`);
  }
  report(bad.length === 0, "(e)", bad.length === 0 ? "every colour is the Tier 1 colour of the day inside any 8 day window, and the three rows never share one" : bad.slice(0, 5).join(", "));
}

/* ── (f) the authored T4 calendar ────────────────────────────────────────── */
{
  const bad: string[] = [];
  for (let week = 1; week <= 8; week++) {
    for (let d = 0; d < 5; d++) {
      const c = t4Calendar(week, d);
      if (c.slot !== T4_WALK[d]) bad.push(`week ${week} day ${d} is ${c.slot}, expected ${T4_WALK[d]}`);
    }
    if (t4Calendar(week, 4).color !== null) bad.push(`week ${week} Friday carries a colour`);
    const weekColour = PALETTE[(week - 1) % PALETTE.length];
    for (const d of [0, 1, 2, 3, 5, 6]) {
      if (t4Calendar(week, d).color !== weekColour) bad.push(`week ${week} day ${d} is not ${weekColour}`);
    }
  }
  // over any two weeks the weekend repeats cover all four body slots
  for (let week = 1; week <= 7; week += 2) {
    const reps: string[] = [];
    for (const w of [week, week + 1]) for (const d of [5, 6]) reps.push(t4Calendar(w, d).slot);
    if (new Set(reps).size !== 4) bad.push(`weeks ${week} and ${week + 1} repeat ${reps.join(",")}`);
  }
  // the live shipments agree with the table
  for (const s of days) {
    const c = t4Calendar(s.t4.week, s.t4.weekday);
    if (c.slot !== s.t4.slot || c.color !== s.t4.color) bad.push(`${s.dayKey} left the calendar`);
  }
  // the calendar must answer for EVERY week, including the weeks at or
  // before the epoch Monday that the shop shows until an operator sets
  // shop_epoch_monday. A body day with no colour is the bug this caught.
  for (let week = -12; week <= 24; week++) {
    for (let d = 0; d < 7; d++) {
      const c = t4Calendar(week, d);
      const wantsColour = d !== 4;
      if (!T4_WALK.includes(c.slot)) bad.push(`week ${week} day ${d} has no slot`);
      if (wantsColour && (c.color === null || !PALETTE.includes(c.color))) bad.push(`week ${week} day ${d} has no colour (${String(c.color)})`);
      if (!wantsColour && c.color !== null) bad.push(`week ${week} Friday carries a colour`);
    }
    const reps = [t4Calendar(week, 5).slot, t4Calendar(week, 6).slot].join(",");
    if (reps !== "head,torso" && reps !== "arms,legs") bad.push(`week ${week} repeats ${reps}`);
  }
  report(bad.length === 0, "(f)", bad.length === 0 ? "head, torso, arms, legs, weapon, then two repeats that cover all four body slots every two weeks" : bad.slice(0, 5).join(", "));
}

/* ── (g) the week 4 Tier 4 set on the $200 player's income ───────────────── */
/**
 * The economy doc's own arithmetic, replayed day by day against the SHIPPED
 * calendar: 296 coins a day, weeks 1 to 3 saved, nothing else bought, buy
 * each part on its LAST day of the week. Both kinds of week must finish on
 * day 28 with 288 coins left. Buying greedily must FAIL an odd week, which
 * is why the shop prints when a part shows again.
 */
{
  const T4_PRICE = PRICE_BY_TIER[4];
  const DAY_INCOME = 296;
  const SAVED_DAYS = 21;
  const SET_COST = 4 * T4_PRICE;

  const replay = (week: number, policy: "last-day" | "greedy") => {
    const lastDay: Record<string, number> = {};
    for (let d = 0; d < 7; d++) lastDay[t4Calendar(week, d).slot] = d;
    const need = new Set<string>(SHELF_SLOTS);
    let coins = SAVED_DAYS * DAY_INCOME;
    for (let d = 0; d < 7; d++) {
      coins += DAY_INCOME;
      const slot = t4Calendar(week, d).slot;
      if (slot === "weapon" || !need.has(slot)) continue;
      if (policy === "last-day" && lastDay[slot] !== d) continue;
      if (coins >= T4_PRICE) {
        coins -= T4_PRICE;
        need.delete(slot);
      }
    }
    return { done: need.size === 0, coins, missing: Array.from(need) };
  };

  const bad: string[] = [];
  for (const week of [3, 4]) {
    const kind = week % 2 === 1 ? "odd (head and torso repeat)" : "even (arms and legs repeat)";
    const r = replay(week, "last-day");
    if (!r.done) bad.push(`week ${week} ${kind}: missing ${r.missing.join(",")}`);
    else if (r.coins !== 288) bad.push(`week ${week} ${kind}: ended on ${r.coins}, expected 288`);
  }
  // the earned / spent identity the doc prints
  const earned = 28 * DAY_INCOME;
  if (earned - SET_COST !== 288) bad.push(`28 x ${DAY_INCOME} minus ${SET_COST} is ${earned - SET_COST}, expected 288`);
  // greedy must fail an odd week (the reason the calendar is published)
  if (replay(3, "greedy").done) bad.push("greedy finished an odd week, so the last-day rule proves nothing");
  // without the weekend repeats there is no legal Monday to Thursday plan
  {
    let coins = SAVED_DAYS * DAY_INCOME;
    let short = 0;
    for (let d = 0; d < 4; d++) {
      coins += DAY_INCOME;
      if (coins >= T4_PRICE) coins -= T4_PRICE;
      else short += 1;
    }
    if (short !== 1) bad.push(`Monday to Thursday alone left ${short} parts unaffordable, expected 1`);
  }
  report(
    bad.length === 0,
    "(g)",
    bad.length === 0
      ? `a Tier 4 body colour set in 28 days on ${DAY_INCOME} coins a day (${earned} earned, ${SET_COST} spent, 288 left) in both kinds of week; greedy fails the odd week`
      : bad.join("; "),
  );
}

/* ── (h) whole coins ─────────────────────────────────────────────────────── */
{
  const bad: string[] = [];
  for (const tier of [1, 2, 3, 4] as Tier[]) {
    const price = PRICE_BY_TIER[tier];
    const back = recycleValue({ price });
    if (!Number.isInteger(price)) bad.push(`T${tier} price ${price}`);
    if (!Number.isInteger(back)) bad.push(`T${tier} recycle ${back}`);
    if ((price * RECYCLE_PERCENT) % 100 !== 0) bad.push(`T${tier} recycle is not a whole percent of ${price}`);
    if (back >= price) bad.push(`T${tier} recycle ${back} is not below the price ${price}`);
  }
  const prices = new Set<number>();
  for (const s of days) for (const l of s.listings) prices.add(l.price);
  for (const p of Array.from(prices)) if (!Number.isInteger(p)) bad.push(`a listing costs ${p}`);
  report(
    bad.length === 0,
    "(h)",
    bad.length === 0
      ? `prices ${[1, 2, 3, 4].map((t) => PRICE_BY_TIER[t as Tier]).join(" / ")} and ${RECYCLE_PERCENT} percent recycle ${[1, 2, 3, 4].map((t) => recycleValue({ price: PRICE_BY_TIER[t as Tier] })).join(" / ")} are whole coins`
      : bad.join(", "),
  );
}

/* ── (i) the ids the buy route accepts, and the colour rule ──────────────── */
{
  const bad: string[] = [];
  for (const s of days) {
    const ids = new Set<string>();
    for (const l of s.listings) {
      if (!LISTING_ID_RE.test(l.id)) bad.push(`${s.dayKey} ${l.id} is not a listing id the buy route accepts`);
      if (ids.has(l.id)) bad.push(`${s.dayKey} ${l.id} twice`);
      ids.add(l.id);
      if ((l.slot === "weapon") !== (l.color === null)) bad.push(`${s.dayKey} ${l.id} breaks the colour rule`);
      if (l.card.id !== l.partKey) bad.push(`${s.dayKey} ${l.id} card does not match its part key`);
      if (l.price !== PRICE_BY_TIER[l.tier]) bad.push(`${s.dayKey} ${l.id} is priced off the ladder`);
    }
  }
  // the old catalog-key ids must NOT pass: one part can sit on the shelf twice
  if (LISTING_ID_RE.test("torso.peeperBox")) bad.push("the old catalog-key listing id still passes");
  report(bad.length === 0, "(i)", bad.length === 0 ? "16 unique row:n ids a day, all accepted by the buy route, colour on every body listing and none on a weapon" : bad.slice(0, 5).join(", "));
}

/* ── (j) the starter kit's colours ───────────────────────────────────────── */
{
  const bad: string[] = [];
  const wallets = ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", "0xAbC0000000000000000000000000000000000001"];
  for (const w of wallets) {
    const a = starterColors(w);
    const b = starterColors(w);
    if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`${w} is not deterministic`);
    if (JSON.stringify(a) !== JSON.stringify(starterColors(w.toUpperCase()))) bad.push(`${w} depends on the case of the address`);
    if (a.weapon !== null) bad.push(`${w} gave the starter weapon a colour`);
    for (const slot of SHELF_SLOTS) {
      const c = a[slot];
      if (!c || !PALETTE.includes(c)) bad.push(`${w} ${slot} is ${String(c)}, not a palette colour`);
    }
  }
  // two different wallets should not all land on one colour set (a smoke check, not a stat)
  const spread = new Set(wallets.map((w) => SHELF_SLOTS.map((s) => starterColors(w)[s]).join("-")));
  if (spread.size < 2) bad.push("every wallet got the same starter colours");
  // THE KIT THAT ACTUALLY SHIPS. starterColors existing is not the same as
  // the starter kit using it: before this wave its only callers were inside
  // its own gate, so every wallet fell through to the catalogue colour and
  // got the same four. Walk the real STARTER_PARTS and demand a colour for
  // every body card in it, from this entry point.
  for (const w of wallets) {
    const colors = starterColors(w);
    for (const card of STARTER_PARTS) {
      const c = colors[card.slot];
      if (card.slot === "weapon") {
        if (c !== null) bad.push(`${w} coloured the starter weapon ${card.id}`);
      } else if (!c || !PALETTE.includes(c)) {
        bad.push(`${w} starter card ${card.id} (${card.slot}) has no colour`);
      }
    }
  }
  report(
    bad.length === 0,
    "(j)",
    bad.length === 0
      ? `four seeded body colours per wallet over ${wallets.length} wallets, every one of the ${STARTER_PARTS.length} starter cards covered, the weapon none`
      : bad.join(", "),
  );
}

/* ── (k) a drop arrives in a colour ──────────────────────────────────────── */
{
  const bad: string[] = [];
  const fights = ["f-0001", "f-0002", "0x9ab", "pve-2026-09-04-3"];
  for (const f of fights) {
    for (const card of PARTS) {
      const a = dropColor(f, card.id, card.slot);
      if (a !== dropColor(f, card.id, card.slot)) bad.push(`${f} ${card.id} is not deterministic`);
      if (card.slot === "weapon") {
        if (a !== null) bad.push(`${f} ${card.id} coloured a weapon`);
      } else if (!a || !PALETTE.includes(a)) {
        bad.push(`${f} ${card.id} dropped without a colour`);
      }
    }
  }
  // two different fights must not hand out one fixed colour
  const spread = new Set(fights.map((f) => dropColor(f, "torso.peeperBox", "torso")));
  if (spread.size < 2) bad.push("every fight dropped the same colour");
  report(
    bad.length === 0,
    "(k)",
    bad.length === 0
      ? `${fights.length} fights x ${PARTS.length} parts: a palette colour on every body card, none on a weapon, same seed same colour`
      : bad.slice(0, 5).join(", "),
  );
}

/* ── (l) the catalogue's factory colour is art only ──────────────────────── */
{
  const bad: string[] = [];
  // Four body cards from one family, each with a factory colour on its
  // catalogue card, and NOT ONE of them given a colour when it arrived. The
  // old code read the factory colour through and called this a colour set,
  // worth plus one to every stat in the fight.
  const bodyOf = (slot: (typeof BODY_SLOTS)[number]): Part => {
    const card = PARTS.find((p) => p.slot === slot);
    if (!card) throw new Error(`no catalogue card for ${slot}`);
    if (card.color === undefined) bad.push(`${card.id} carries no factory colour, so this gate proves nothing`);
    return { id: card.id, s: [card.s[0], card.s[1], card.s[2]] };
  };
  const weapon = PARTS.find((p) => p.slot === "weapon");
  if (!weapon) throw new Error("no catalogue weapon");
  const build: Build = {
    legs: bodyOf("legs"),
    arms: bodyOf("arms"),
    torso: bodyOf("torso"),
    head: bodyOf("head"),
    weapon: { id: weapon.id, s: [weapon.s[0], weapon.s[1], weapon.s[2]] },
  };
  for (const slot of BODY_SLOTS) {
    if (partColor(build[slot], CARD_INDEX) !== undefined) {
      bad.push(`${slot} reports a colour it was never given (the catalogue fallback is back)`);
    }
  }
  if (setBonus(build, CARD_INDEX).colorMatch) bad.push("four colourless body cards counted as a matched colour set");
  // and the same four, given one colour each, DO make a set: the rule still works
  const painted: Build = { ...build };
  for (const slot of BODY_SLOTS) painted[slot] = { ...build[slot], paint: "sky" };
  if (!setBonus(painted, CARD_INDEX).colorMatch) bad.push("four cards bought in one colour did not make a set");
  report(
    bad.length === 0,
    "(l)",
    bad.length === 0
      ? "a card owns only the colour it arrived in: four colourless body cards are no set, four sky ones are"
      : bad.join(", "),
  );
}

/* ── the shelf, printed, so a human can read what the gate proved ────────── */

const first = days[0];
console.log("");
console.log(`shelf ${first.dayKey} (day ${first.dayIndex}, week ${first.t4.week}): ${first.name}`);
console.log(`  colours  T1 ${first.colors.t1} . T2 ${first.colors.t2} . T3 ${first.colors.t3}`);
console.log(`  T4       ${first.t4.slot}${first.t4.color ? ` in ${first.t4.color}` : " (weapon day, no colour)"}`);
console.log(`  rack     tier ${first.rackTier}`);
for (const row of ROW_KEYS) {
  console.log(`  ${row.padEnd(4)} ${first.rows[row].map((l) => `${l.id} ${l.card.name}${l.color ? ` (${l.color})` : ""}`).join(" | ")}`);
}
const shelfDay = first.listings.reduce((a, l) => a + l.price, 0);
const shelfWeek = days.slice(0, 7).reduce((a, s) => a + s.listings.reduce((b, l) => b + l.price, 0), 0);
console.log(`  the whole shelf costs ${shelfDay.toLocaleString("en-US")} coins today, ${shelfWeek.toLocaleString("en-US")} over the first week`);
console.log("");
console.log(failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
