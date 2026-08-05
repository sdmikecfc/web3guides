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

import { createWorld, applyAction, stepWorld } from "../src/app/chef/game/_engine/world";
import { SHELL } from "../src/app/chef/game/_engine/rooms";
import {
  LIMITS,
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
  ok(`sanitize(${JSON.stringify(junk)?.slice(0, 18) ?? "undefined"})`, s.v === 4 && Array.isArray(s.layout));
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
