/**
 * Domain Kitchen save/sanitizer gate (M6).
 *
 * The server accepts saves from anyone, so `sanitizeSave` IS the security
 * boundary. This proves it holds against the attacks a modified client would
 * actually try — forged coins, invented furniture, out-of-bounds placements,
 * impossible dish levels, unknown markets — and that an honest round trip
 * survives untouched.
 *
 * Run: npx tsx scripts/dk-save-check.mts
 */

import {
  createWorld,
  applyAction,
  GUEST_VARIANTS,
  hashWorld,
  MAX_REGULARS,
  qualityOf,
  stepWorld,
} from "../src/app/chef/game/_engine/world";
import { DAILY_SPECIALS, RECIPES } from "../src/app/chef/game/_engine/pantry";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHELL } from "../src/app/chef/game/_engine/rooms";
import {
  CHEF_NAME_MAX, ROOM_NAME_MAX,
  CREW_LOOKS,
  INTRO_STEPS_DONE,
  LIMITS,
  SAVE_VERSION,
  layoutFromSave,
  newerSave,
  sanitizeSave,
  serializeSave,
} from "../src/app/chef/game/_engine/save";

let failures = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok  ${label}${detail ? " · " + detail : ""}`);
  else {
    failures++;
    console.error(`FAIL: ${label} ${detail}`);
  }
};

console.log("── an honest save survives a round trip ─────────────────────");
{
  const w = createWorld("dk-save", SHELL, { parkedUsd: 120, weeklyVolumeUsd: 300 });
  applyAction(w, SHELL, { type: "buyItem", itemId: "table_basic" });
  applyAction(w, SHELL, { type: "edit", on: true });
  applyAction(w, SHELL, { type: "place", itemId: "table_basic", gx: 8, gy: 4, facing: "sw" });
  applyAction(w, SHELL, { type: "edit", on: false });
  for (let i = 0; i < 4000; i++) stepWorld(w, SHELL);

  const save = serializeSave(w, "izakaya");
  const round = sanitizeSave(JSON.parse(JSON.stringify(save)));
  ok("layout length preserved", round.layout.length === save.layout.length, `${round.layout.length}`);
  ok("facing preserved", round.layout.some((p) => p.facing === "sw"));
  ok("coins preserved", round.coins === save.coins, `${round.coins}`);
  ok("theme preserved", round.theme === "izakaya");
  ok("market preserved", round.market === save.market);
  ok("dish levels preserved", JSON.stringify(round.pantry.levels) === JSON.stringify(save.pantry.levels));

  // and it reloads into a world that still works
  const w2 = createWorld("dk-save", SHELL, {
    playMoney: round.coins,
    hires: { waiters: round.waiters, chefs: round.chefs },
    layout: layoutFromSave(round),
    inventory: round.inventory,
    market: round.market,
    lpDays: round.lpDays,
  });
  for (let i = 0; i < 600; i++) stepWorld(w2, SHELL);
  ok("a reloaded world still serves", w2.seats.length > 0 && w2.entities.length > 0,
    `${w2.seats.length} seats, ${w2.entities.length} people`);
}

/**
 * THE FULL LOOP: save -> sanitize -> LOAD -> save again.
 *
 * Everything above stops at sanitize, and that is exactly how the M8 bug hid
 * for three milestones. The pantry, the dish levels and the best-quality mark
 * were serialized correctly and validated correctly; nothing ever handed them
 * back to createWorld, so every reload silently emptied the pantry and reset
 * all four dishes to level one. The 600ms save poll then wrote the wiped
 * version over the good one, in the browser and in the cloud.
 *
 * A round trip that never reloads cannot see that. This one reloads.
 */
console.log("\n── a reload keeps what a save promised ──────────────────────");
{
  const w = createWorld("dk-reload", SHELL, {
    parkedUsd: 250,
    weeklyVolumeUsd: 400,
    playMoney: 30_000,
  });
  applyAction(w, SHELL, { type: "newDay", utcDay: 20_000, banked: 3, tenure: 2 });
  // a room that has GROWN is the interesting one to reload
  applyAction(w, SHELL, { type: "expand" });
  // cook the pantry up until dishes have genuinely levelled
  for (let i = 0; i < 30_000; i++) {
    stepWorld(w, SHELL);
    for (const key of ["margherita", "caciopepe", "tiramisu"]) {
      applyAction(w, SHELL, { type: "upgradeDish", key });
    }
  }
  // guarantee today's board can actually be cooked, whichever one was rolled
  for (const [id, n] of Object.entries(DAILY_SPECIALS[w.daily.idx].needs)) {
    w.pantry.stock[id] = (w.pantry.stock[id] ?? 0) + n;
  }
  ok("the special was prepped before saving", applyAction(w, SHELL, { type: "prepSpecial" }));

  const before = serializeSave(w, "diner", { chef: 2, waiter: 3, chefName: "Nonna" });
  ok("the test actually built something to lose",
    Object.keys(before.pantry.stock).length > 0 &&
      Object.values(before.pantry.levels).some((l) => l > 1) &&
      before.bestQuality > 0,
    `${Object.keys(before.pantry.stock).length} kinds in stock, best ${before.bestQuality}`);

  const round = sanitizeSave(JSON.parse(JSON.stringify(before)));
  const reloaded = createWorld("dk-reload", SHELL, {
    parkedUsd: round.dials.parkedUsd,
    weeklyVolumeUsd: round.dials.weeklyVolumeUsd,
    playMoney: round.coins,
    hires: { waiters: round.waiters, chefs: round.chefs },
    layout: layoutFromSave(round),
    inventory: round.inventory,
    market: round.market,
    lpDays: round.lpDays,
    courses: round.courses,
    pantry: round.pantry,
    menu: round.menu,
    bestQuality: round.bestQuality,
    utcDay: round.utcDay,
    daily: round.daily,
    regulars: round.regulars,
    shellIdx: round.shell,
  });
  const after = serializeSave(reloaded, "diner", round.crew);

  ok("pantry stock survives the reload",
    JSON.stringify(after.pantry.stock) === JSON.stringify(before.pantry.stock),
    JSON.stringify(after.pantry.stock));
  ok("dish levels survive the reload",
    JSON.stringify(after.pantry.levels) === JSON.stringify(before.pantry.levels),
    JSON.stringify(after.pantry.levels));
  ok("serve counts survive the reload",
    JSON.stringify(after.menu.serves) === JSON.stringify(before.menu.serves));
  ok("the house special stays unlocked",
    after.menu.specialUnlocked === before.menu.specialUnlocked);
  ok("the service record survives the reload",
    after.bestQuality === before.bestQuality, `${after.bestQuality}`);
  ok("the dials survive the reload",
    after.dials.parkedUsd === 250 && after.dials.weeklyVolumeUsd === 400,
    `$${after.dials.parkedUsd} / $${after.dials.weeklyVolumeUsd}`);
  ok("the real day survives the reload", after.utcDay === 20_000, `${after.utcDay}`);
  ok("the shell survives the reload", after.shell === before.shell, `${after.shell}`);
  ok("today's special is still prepped after a reload",
    after.daily.prepped && after.daily.idx === before.daily.idx);
}

console.log("\n── the day bus hands over goods, and only once ──────────────");
{
  const w = createWorld("dk-day", SHELL, {});
  const count = () => Object.values(w.pantry.stock).reduce((a, b) => a + b, 0);
  ok("a fresh pantry is empty", count() === 0);

  ok("a first day is accepted",
    applyAction(w, SHELL, { type: "newDay", utcDay: 19_000, banked: 1, tenure: 0 }));
  const afterOne = count();
  ok("one day delivers", afterOne > 0, `${afterOne} jars`);

  ok("the same day again is refused",
    !applyAction(w, SHELL, { type: "newDay", utcDay: 19_000, banked: 3, tenure: 9 }));
  ok("nothing arrived the second time", count() === afterOne);

  // a week away: banked at three days, plus the one the crew put by
  applyAction(w, SHELL, { type: "newDay", utcDay: 19_007, banked: 3, tenure: 7 });
  const afterWeek = count() - afterOne;
  ok("a week away banks three days and no more", afterWeek === 7, `${afterWeek} jars`);
  ok("tenure is credited in real days", (w.lpDays[w.market] ?? 0) === 7, `${w.lpDays[w.market]}`);
  ok("a new day puts a fresh special on the board", w.daily.prepped === false);
  ok("Gus is due this session", w.gusDueIn > 0, `${w.gusDueIn.toFixed(0)}s`);
}

/**
 * REGULARS (M8b) are earned progression that feeds the CROWD, so a forged
 * roster is worth something to an attacker: six copies of one name would
 * multiply the arrivals bonus. These are the properties that stop it.
 */
/**
 * THE INTRO CONSTANT IS DUPLICATED, so prove it agrees (M10).
 *
 * `INTRO_STEPS_DONE` (save.ts, the security boundary, must not import React)
 * and `INTRO_DONE` (Coach.tsx) have to be the same number. If they drift, the
 * sanitizer clamps `intro` below the real last step, that step can never
 * persist as finished, and the coach reappears on every single load forever.
 *
 * Read out of the source rather than imported, because pulling in a .tsx here
 * would drag React into a node gate.
 */
console.log("\n── the two intro constants agree ────────────────────────────");
{
  const coach = readFileSync(
    join(process.cwd(), "src/app/chef/game/Coach.tsx"),
    "utf8"
  );
  const m = coach.match(/INTRO_DONE\s*=\s*(\d+)/);
  const steps = coach.match(/export const INTRO_STEPS[\s\S]*?\n\];/);
  const stepCount = steps ? (steps[0].match(/^\s{2}\{$/gm) || []).length : -1;
  ok("Coach.tsx declares INTRO_DONE", !!m, m?.[1]);
  ok(
    "save.ts INTRO_STEPS_DONE matches Coach.tsx INTRO_DONE",
    !!m && Number(m[1]) === INTRO_STEPS_DONE,
    `coach ${m?.[1]} vs save ${INTRO_STEPS_DONE}`
  );
  ok(
    "and it is one past the number of steps",
    stepCount > 0 && INTRO_STEPS_DONE === stepCount + 1,
    `${stepCount} steps, done = ${INTRO_STEPS_DONE}`
  );
}

console.log("\n── a forged regulars roster cannot buy a crowd ──────────────");
{
  const forged = sanitizeSave({
    regulars: [
      { n: 0, look: 1, fav: "margherita", served: 5 },
      { n: 0, look: 1, fav: "margherita", served: 5 },   // the same person again
      { n: 0, look: 1, fav: "margherita", served: 5 },
      { n: 999, look: 999, fav: "solid_gold_dish", served: -4 }, // out of range everywhere
      { n: 3, look: 2, fav: "caciopepe", served: 2 },
      ...Array.from({ length: 40 }, (_, i) => ({ n: i, look: 0, fav: "tiramisu", served: 0 })),
    ],
  });
  ok("roster capped", forged.regulars.length <= MAX_REGULARS, `${forged.regulars.length}`);
  const names = forged.regulars.map((r) => r.n);
  ok("duplicates collapsed", new Set(names).size === names.length, JSON.stringify(names));
  ok("looks the sim can actually roll",
    forged.regulars.every((r) => r.look >= 0 && r.look < GUEST_VARIANTS));
  ok("invented dishes replaced with a real one",
    forged.regulars.every((r) => !!RECIPES[r.fav]));
  ok("negative serve counts floored", forged.regulars.every((r) => r.served >= 0));

  // and an honest roster survives intact
  const w = createWorld("dk-reg-save", SHELL, {
    regulars: [{ n: 4, look: 3, fav: "tiramisu", served: 7 }],
  });
  const round = sanitizeSave(JSON.parse(JSON.stringify(serializeSave(w, "bistro"))));
  ok("an honest regular round-trips",
    round.regulars.length === 1 &&
      round.regulars[0].n === 4 &&
      round.regulars[0].fav === "tiramisu" &&
      round.regulars[0].served === 7,
    JSON.stringify(round.regulars));
}

console.log("\n── the special spends stock, and refuses when short ─────────");
{
  const w = createWorld("dk-special", SHELL, {});
  applyAction(w, SHELL, { type: "newDay", utcDay: 19_100, banked: 1, tenure: 0 });
  w.pantry.stock = {};
  ok("an empty pantry cannot prep", !applyAction(w, SHELL, { type: "prepSpecial" }));
  ok("and nothing was silently spent", Object.keys(w.pantry.stock).length === 0);

  // stock exactly what today's board asks for
  const spec = DAILY_SPECIALS[w.daily.idx];
  for (const [id, n] of Object.entries(spec.needs)) w.pantry.stock[id] = n;
  ok("a stocked pantry preps", applyAction(w, SHELL, { type: "prepSpecial" }));
  ok("the commons were spent", Object.keys(w.pantry.stock).length === 0);
  ok("prepping twice is refused", !applyAction(w, SHELL, { type: "prepSpecial" }));

  /**
   * THE FIREWALL. Prep is the one thing in M8 that spends a resource for an
   * advantage, so it is the one place quality could leak in. It may widen the
   * window a heart lands in and add a coin to a tip; it may not add a point of
   * quality. Toggling the flag on a settled world is the direct test: if the
   * score moves at all, the firewall is breached.
   */
  const qPrepped = qualityOf(w);
  w.daily.prepped = false;
  const qPlain = qualityOf(w);
  w.daily.prepped = true;
  ok("prep adds no quality points", qPrepped === qPlain, `${qPrepped} either way`);
}

/**
 * THE DAILY BEAT LEDGER (the inversion). served + the two paid flags are
 * money state now: if a reload drops them, every refresh re-pays the day's
 * beats; if a forged save sets them, a stranger's client can... pay itself
 * slightly less, which is why the sanitizer only has to clamp junk to
 * defaults rather than treat this as a jackpot. The property that matters is
 * the honest round trip: paid stays paid across a reload.
 */
console.log("\n── the daily beat ledger survives a reload, junk does not ───");
{
  const w = createWorld("dk-beats", SHELL, {});
  applyAction(w, SHELL, { type: "newDay", utcDay: 19_200, banked: 1, tenure: 0 });
  w.daily.served = 3;
  w.daily.firstServePaid = true;
  w.daily.potPaid = false;
  const round = sanitizeSave(JSON.parse(JSON.stringify(serializeSave(w, "trattoria"))));
  ok("served round-trips", round.daily.served === 3, `${round.daily.served}`);
  ok("firstServePaid round-trips", round.daily.firstServePaid === true);
  ok("potPaid round-trips", round.daily.potPaid === false);

  // and the ledger actually reaches a reloaded world (the M8 lesson: a field
  // serialized but never handed back is a field silently reset every boot)
  const reloaded = createWorld("dk-beats", SHELL, { utcDay: round.utcDay, daily: round.daily });
  ok("the ledger reaches the reloaded world",
    reloaded.daily.served === 3 && reloaded.daily.firstServePaid && !reloaded.daily.potPaid);

  // a v5 save has no ledger at all: it must load unchanged, on the defaults
  const v5 = sanitizeSave({ daily: { idx: 2, prepped: true } });
  ok("an old save lands on the defaults",
    v5.daily.idx === 2 && v5.daily.prepped &&
      v5.daily.served === 0 && !v5.daily.potPaid && !v5.daily.firstServePaid);

  // forged junk is clamped, never trusted
  const forged = sanitizeSave({
    daily: { idx: 999, prepped: "yes", served: -8, potPaid: "sure", firstServePaid: 1 },
  });
  ok("negative served floored", forged.daily.served === 0, `${forged.daily.served}`);
  ok("truthy junk potPaid is not true", forged.daily.potPaid === false);
  ok("truthy junk firstServePaid is not true", forged.daily.firstServePaid === false);
  const huge = sanitizeSave({ daily: { served: 9e15 } });
  ok("absurd served clamped", huge.daily.served === LIMITS.serves, `${huge.daily.served}`);
  const junk = sanitizeSave({ daily: "not an object" });
  ok("junk daily falls back whole",
    junk.daily.served === 0 && !junk.daily.potPaid && !junk.daily.firstServePaid);
}

console.log("\n── a hostile save cannot get anything past it ───────────────");
{
  const evil = sanitizeSave({
    v: 999,
    coins: 999_999_999_999,            // forged fortune
    waiters: 99, chefs: 99,            // an army
    market: "not-a-market",            // unknown market
    theme: "../../etc/passwd",         // path-ish junk
    lpDays: { "not-a-market": 9999, "software.ai": 99999 },
    layout: [
      { itemId: "table_basic", gx: 999, gy: -50, facing: "north" },  // out of bounds
      { itemId: "solid_gold_throne", gx: 1, gy: 1, facing: "se" },   // invented item
      { itemId: "chair_basic", gx: 2, gy: 2, facing: "sw" },         // the one legal piece
      ...Array.from({ length: 500 }, () => ({ itemId: "table_basic", gx: 1, gy: 1, facing: "se" })),
    ],
    inventory: { table_basic: 999999, unobtainium: 5 },
    pantry: { stock: { saffron: 99999, plutonium: 7 }, levels: { margherita: 99, fake: 3 } },
    menu: { serves: { margherita: -5 }, specialUnlocked: "yes", specialMastered: 1 },
    courses: ["range", "range", "not-a-course", 42, "quality"], // dupes + junk
    bestQuality: 1000,
    extraKeyNobodyAskedFor: { nested: true },
  });

  ok("coins clamped", evil.coins === LIMITS.coins, `${evil.coins}`);
  ok("hires clamped to the real max", evil.waiters === 2 && evil.chefs === 2);
  ok("unknown market rejected", evil.market === "software.ai", evil.market);
  ok("junk theme rejected", evil.theme === "trattoria", evil.theme);
  ok("tenure only for real markets", !("not-a-market" in evil.lpDays) && evil.lpDays["software.ai"] === LIMITS.lpDays);
  ok("layout capped", evil.layout.length <= LIMITS.layout, `${evil.layout.length}`);
  ok("invented item dropped", !evil.layout.some((p) => p.itemId === "solid_gold_throne"));
  ok("out-of-bounds clamped", evil.layout.every((p) => p.gx >= 0 && p.gy >= 0 && p.gx < 64 && p.gy < 64));
  ok("bogus facing normalised", evil.layout.every((p) => p.facing === "se" || p.facing === "sw"));
  ok("inventory count clamped", evil.inventory.table_basic === LIMITS.perItem, `${evil.inventory.table_basic}`);
  ok("unknown inventory item dropped", !("unobtainium" in evil.inventory));
  ok("pantry stock clamped", evil.pantry.stock.saffron === LIMITS.stock);
  ok("unknown ingredient dropped", !("plutonium" in evil.pantry.stock));
  ok("dish level clamped to 3", evil.pantry.levels.margherita === 3);
  ok("unknown dish dropped", !("fake" in evil.pantry.levels));
  ok("negative serves floored", evil.menu.serves.margherita === 0);
  ok("truthy junk is not true", evil.menu.specialUnlocked === false && evil.menu.specialMastered === false);
  ok("quality capped at 100", evil.bestQuality === 100);
  ok("invented courses dropped, dupes collapsed",
    evil.courses.length === 2 && evil.courses.includes("range") && evil.courses.includes("quality"),
    JSON.stringify(evil.courses));
  ok("unknown keys do not survive", !("extraKeyNobodyAskedFor" in (evil as Record<string, unknown>)));

  // the sanitized hostile save must still load into a working game
  const w = createWorld("dk-evil", SHELL, {
    playMoney: evil.coins,
    hires: { waiters: evil.waiters, chefs: evil.chefs },
    layout: layoutFromSave(evil),
    inventory: evil.inventory,
    market: evil.market,
    lpDays: evil.lpDays,
  });
  for (let i = 0; i < 600; i++) stepWorld(w, SHELL);
  ok("a sanitized hostile save still boots", w.grid.cells.length === SHELL.w * SHELL.h);
}

console.log("\n── junk input never throws ──────────────────────────────────");
for (const junk of [null, undefined, 42, "a string", [], { layout: "not an array" }, { pantry: 7 }]) {
  const s = sanitizeSave(junk);
  ok(`sanitize(${JSON.stringify(junk)?.slice(0, 18) ?? "undefined"})`, s.v === SAVE_VERSION && Array.isArray(s.layout));
}


console.log("\n── your crew is COSMETIC: it must never reach the sim ───────");
{
  // 1. an honest pick round-trips
  const s = sanitizeSave({ crew: { chef: 3, waiter: 5, chefName: "Rosa" } });
  ok("crew survives a round trip", s.crew.chef === 3 && s.crew.waiter === 5);
  ok("chef name survives", s.crew.chefName === "Rosa");

  // 2. a forged pick is clamped into the real roster, never trusted
  // the ROOM name (CUTE+VIRAL): the first player string that goes PUBLIC, so
  // the forged-input coverage matters more than the round-trip
  const named = sanitizeSave({ name: "Trattoria Grande" });
  ok("room name survives", named.name === "Trattoria Grande");
  const evilName = sanitizeSave({
    name: "<img src=x>" + "‮" + "y".repeat(400),
  });
  ok("room name keeps markup as inert text, strips bidi, caps length",
    !evilName.name.includes("‮") && evilName.name.length <= ROOM_NAME_MAX);
  ok("missing room name defaults empty", sanitizeSave({}).name === "");

  const evil = sanitizeSave({ crew: { chef: 99, waiter: -4, chefName: "x".repeat(400) } });
  ok("out-of-roster chef clamped", evil.crew.chef === CREW_LOOKS - 1);
  ok("negative waiter clamped", evil.crew.waiter === 0);
  ok("name capped", evil.crew.chefName.length === CHEF_NAME_MAX);

  // 3. the name is the ONE free-text field. Invisible characters that could
  //    reorder a rendered line are stripped, but real names in any script live.
  const nasty = sanitizeSave({
    crew: { chefName: "a" + String.fromCharCode(0x202e) + "b" + String.fromCharCode(0) + "c" },
  });
  ok("bidi override stripped", !nasty.crew.chefName.includes(String.fromCharCode(0x202e)));
  ok("control char stripped", !nasty.crew.chefName.includes(String.fromCharCode(0)));
  ok("the actual letters survive", nasty.crew.chefName === "abc");
  ok(
    "non-Latin names are not mangled",
    sanitizeSave({ crew: { chefName: "\u5c0f\u6797" } }).crew.chefName === "\u5c0f\u6797"
  );
  ok("junk crew falls back to look 0", sanitizeSave({ crew: "nope" }).crew.chef === 0);

  // 4. THE LOAD-BEARING ONE. A cosmetic must not move a sim number, so two
  //    worlds differing only in crew and theme must hash identically. This is
  //    the M3c "sim hash unchanged across all five themes" property, extended
  //    to the crew picker — and the reason crew lives in the save rather than
  //    in WorldState, which hashWorld covers wholesale.
  const build = (crew: { chef: number; waiter: number; chefName: string }, theme: string) => {
    const save = sanitizeSave({ coins: 500, crew, theme });
    const w = createWorld("dk-crew", SHELL, {
      playMoney: save.coins,
      layout: layoutFromSave(save),
      inventory: save.inventory,
      market: save.market,
      lpDays: save.lpDays,
    });
    for (let i = 0; i < 4000; i++) stepWorld(w, SHELL);
    return hashWorld(w);
  };
  const plain = build({ chef: 0, waiter: 0, chefName: "" }, "trattoria");
  const fancy = build({ chef: 5, waiter: 3, chefName: "Rosa" }, "izakaya");
  ok("changing crew and theme leaves the sim hash byte-identical", plain === fancy, String(plain));
}

console.log("\n── newest-wins picks the right copy ─────────────────────────");
{
  const a = sanitizeSave({ savedAt: 1000, coins: 10 });
  const b = sanitizeSave({ savedAt: 2000, coins: 20 });
  ok("newer of two wins", newerSave(a, b)?.coins === 20);
  ok("older does not win", newerSave(b, a)?.coins === 20);
  ok("null-safe", newerSave(null, a)?.coins === 10 && newerSave(a, null)?.coins === 10);
  ok("both null", newerSave(null, null) === null);
}

if (failures > 0) {
  console.error(`\nsave check FAIL (${failures})`);
  process.exit(1);
}
console.log("\nsave check PASS");
