import assert from "node:assert/strict";
import { availableDishes, COOKBOOK_UNLOCK_RULES, DISHES, dishUnlockHint, STARTER_DISH_IDS } from "../src/app/chef/game/_engine/cookbook";
import { createWorld, applyAction } from "../src/app/chef/game/_engine/world";
import { SHELL } from "../src/app/chef/game/_engine/rooms";
import { sanitizeSave, serializeSave, layoutFromSave } from "../src/app/chef/game/_engine/save";

const owner = (levels: Record<string, number> = {}) => ({ market: "software.ai", lpDays: {}, menu: { specialUnlocked: false, unlocked: [...STARTER_DISH_IDS] }, pantry: { levels } });
const ids = (levels: Record<string, number> = {}) => availableDishes(owner(levels)).map(dish => dish.id);
const thresholds: { id: string; below: Record<string, number>; earned: Record<string, number> }[] = [
  { id: "software_noodles", below: { margherita: 2 }, earned: { margherita: 2, caciopepe: 2 } },
  { id: "software_tart", below: { margherita: 2, caciopepe: 2 }, earned: { margherita: 3 } },
  { id: "boner_broth", below: { margherita: 2, caciopepe: 2 }, earned: { margherita: 2, caciopepe: 2, tiramisu: 2 } },
  { id: "boner_feast", below: { margherita: 3, caciopepe: 3 }, earned: { margherita: 3, caciopepe: 3, tiramisu: 3 } },
];
assert.deepEqual(ids(), STARTER_DISH_IDS);
for (const row of thresholds) {
  assert.ok(!ids(row.below).includes(row.id), `${row.id} stays locked below its recipe threshold`);
  assert.ok(ids(row.earned).includes(row.id), `${row.id} unlocks exactly at its recipe threshold`);
  assert.ok(dishUnlockHint(row.id)?.includes("unlock"));
}
assert.deepEqual(ids({ margherita: 3, caciopepe: 3, tiramisu: 3 }), DISHES.map(dish => dish.id), "every dish is reachable with only the three kitchen classics");
assert.equal(dishUnlockHint("margherita"), null); assert.equal(dishUnlockHint("made_up"), null);
assert.equal(dishUnlockHint("__proto__"), null);
console.log(`PASS four exact mastery thresholds and achievable full cookbook (rules v${COOKBOOK_UNLOCK_RULES.version})`);

const earned = owner({ margherita: 2, caciopepe: 2 });
for (const market of ["software.ai", "boner.com"]) {
  assert.deepEqual(availableDishes({ ...earned, market }).map(dish => dish.id), ids(earned.pantry.levels));
}
assert.ok(availableDishes({ ...owner(), menu: { specialUnlocked: false, unlocked: ["boner_feast"] } }).some(dish => dish.id === "boner_feast"), "explicit ownership remains owned below new threshold");
assert.ok(availableDishes({ ...owner(), lpDays: { "boner.com": 1 } }).some(dish => dish.id === "boner_feast"), "legacy LP ownership remains available");
assert.ok(ids({ software_noodles: 3 }).includes("software_noodles"), "legacy mastered dish cannot lock itself behind a newly added threshold");
assert.ok(!ids({ made_up_a: 3, made_up_b: 3, special: 3 }).some(id => !STARTER_DISH_IDS.includes(id)), "unknown fields and the legacy alias cannot manufacture recipe counts");
assert.deepEqual(ids({ margherita: Infinity, caciopepe: NaN, tiramisu: 999 }), STARTER_DISH_IDS);
assert.deepEqual(ids(Object.create({ margherita: 3, caciopepe: 3, tiramisu: 3 })), STARTER_DISH_IDS);
console.log("PASS market-independent access, retained ownership/mastery, and malformed/unknown-field rejection");

const world = createWorld("mastery-unlock", SHELL, { parkedUsd: 0, weeklyVolumeUsd: 0, pantry: { levels: {}, stock: { tomato: 2, herb: 1, cheese: 2, pepper: 1 } } });
assert.equal(applyAction(world, SHELL, { type: "selectMenu", keys: ["software_noodles"] }), false);
assert.ok(applyAction(world, SHELL, { type: "upgradeDish", key: "margherita" }));
assert.ok(applyAction(world, SHELL, { type: "upgradeDish", key: "caciopepe" }));
assert.ok(world.menu.unlocked.includes("software_noodles"), "real upgrade stores the earned ownership receipt immediately");
assert.ok(applyAction(world, SHELL, { type: "selectMenu", keys: ["software_noodles"] }));
const saved = sanitizeSave(serializeSave(world, "bistro"));
assert.deepEqual(saved.menu.selected, ["software_noodles"]);
const migrated = sanitizeSave({ ...saved, theme: "izakaya", market: "boner.com", menu: { ...saved.menu, unlocked: [] } });
assert.deepEqual(migrated.menu.selected, ["software_noodles"], "sanitizer recognizes earned access before filtering the selected menu");
const reloaded = createWorld("mastery-unlock", SHELL, { layout: layoutFromSave(migrated), pantry: migrated.pantry, menu: migrated.menu, market: migrated.market, lpDays: migrated.lpDays, parkedUsd: 0, weeklyVolumeUsd: 0 });
assert.ok(availableDishes(reloaded).some(dish => dish.id === "software_noodles"));
assert.deepEqual(reloaded.menu.selected, ["software_noodles"]);
assert.equal(reloaded.pantry.levels.software_noodles, 1, "unlocking access never grants dish mastery");
console.log("PASS real ingredient upgrade, ownership receipt, selected menu, theme change, and save/reload persistence");
