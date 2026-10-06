/** Pure onboarding authority regressions. No network, credentials, or database writes. */
import assert from "node:assert/strict";
import { applyKitchenCommand, initializeKitchen, KitchenCommandError, publicAuthority, syncDeliveryFromAuthority } from "../src/lib/chef/authority";
import { createOnboarding, createDelivery, deliveryContents, welcomeIngredientBundle } from "../src/app/chef/game/_engine/onboarding";
import { KITCHEN_RULES, utcKitchenDay } from "../src/lib/chef/rules";

const now = Date.UTC(2026, 8, 14, 12);
const fresh = () => initializeKitchen(null, now);
const run = (name: string, fn: () => void) => { fn(); console.log(`ok ${name}`); };
const rejects = (fn: () => unknown, code: string) => assert.throws(fn, (error) => error instanceof KitchenCommandError && error.code === code);
const sum = (stock: Record<string, number>) => Object.values(stock).reduce((a, b) => a + b, 0);
const delta = (before: Record<string, number>, after: Record<string, number>) => Object.fromEntries(Object.keys(after).filter((id) => after[id] !== (before[id] ?? 0)).map((id) => [id, after[id] - (before[id] ?? 0)]));

run("only fresh server-issued accounts begin unfinished with welcome and design-import eligibility", () => {
  const record = fresh();
  assert.equal(record.save.intro, 1);
  assert.deepEqual(record.save.onboarding, createOnboarding(false));
  assert.deepEqual(record.save.delivery, createDelivery());
  assert.equal(record.authority.welcomeClaimed, false);
  assert.equal(publicAuthority(record, now).canImportGuestDesign, true);
  assert.equal(record.authority.verifiedPlates, 0);
});

run("welcome plus ordinary daily delivery are exact and persist once across reload", () => {
  const record = fresh();
  const claimed = applyKitchenCommand(record, { type: "claimDaily" }, now, "alice").actor;
  const expected = { ...welcomeIngredientBundle() };
  for (const [id, count] of Object.entries(deliveryContents(utcKitchenDay(now)))) expected[id] = (expected[id] ?? 0) + count;
  assert.deepEqual(delta(record.save.pantry.stock, claimed.save.pantry.stock), expected);
  assert.deepEqual(claimed.save.delivery, createDelivery(utcKitchenDay(now), true));
  assert.equal(sum(deliveryContents(utcKitchenDay(now))), KITCHEN_RULES.dailyIngredients);
  const reload = JSON.parse(JSON.stringify(claimed));
  rejects(() => applyKitchenCommand(reload, { type: "claimDaily" }, now + 1, "alice"), "already_claimed");
  reload.save.layout = []; // Isolate parcel contents from service achievements.
  const nextDay = applyKitchenCommand(reload, { type: "claimDaily" }, now + 86_400_000, "alice").actor;
  assert.deepEqual(delta(claimed.save.pantry.stock, nextDay.save.pantry.stock), deliveryContents(utcKitchenDay(now) + 1));
  assert.equal(nextDay.authority.welcomeClaimed, true);
  assert.deepEqual(record.save.delivery, createDelivery(), "reducers never mutate the input record");
});

run("legacy client receipts and absent old authority fields never reissue welcome", () => {
  const legacy = fresh().save;
  legacy.delivery = createDelivery(-1, false);
  legacy.onboarding = createOnboarding(false);
  const migrated = initializeKitchen(legacy, now);
  assert.equal(migrated.authority.welcomeClaimed, true);
  assert.equal(publicAuthority(migrated, now).canImportGuestDesign, false);
  const claimed = applyKitchenCommand(migrated, { type: "claimDaily" }, now, "alice").actor;
  assert.deepEqual(delta(migrated.save.pantry.stock, claimed.save.pantry.stock), deliveryContents(utcKitchenDay(now)));
  const oldAuthority = fresh();
  delete oldAuthority.authority.welcomeClaimed; delete oldAuthority.authority.guestDesignImported;
  oldAuthority.save.delivery = createDelivery(-1, false);
  syncDeliveryFromAuthority(oldAuthority);
  assert.equal(oldAuthority.save.delivery.welcomeClaimed, true);
  assert.equal(publicAuthority(oldAuthority, now).canImportGuestDesign, false);
  const oldClaim = applyKitchenCommand(oldAuthority, { type: "claimDaily" }, now, "alice").actor;
  assert.deepEqual(delta(oldAuthority.save.pantry.stock, oldClaim.save.pantry.stock), deliveryContents(utcKitchenDay(now)));
});

run("cosmetic onboarding cannot forge inventory, receipts, decoration, mastery, or verified service", () => {
  const record = fresh();
  const marked = applyKitchenCommand(record, { type: "appearance", appearance: {
    onboarding: { version: 1, served: true, decorated: true, upgraded: true, finished: true, goalDishId: "margherita" },
    delivery: { claimedDay: -1, welcomeClaimed: false }, pantry: { stock: { tomato: 999 } },
    authority: { welcomeClaimed: false },
  } } as any, now, "alice").actor;
  assert.equal(marked.save.onboarding.served, true); assert.equal(marked.save.onboarding.finished, true);
  assert.equal(marked.save.onboarding.decorated, false); assert.equal(marked.save.onboarding.upgraded, false);
  assert.equal(marked.authority.verifiedPlates, 0);
  assert.deepEqual(marked.save.pantry, record.save.pantry);
  assert.deepEqual(marked.save.delivery, record.save.delivery);
  rejects(() => applyKitchenCommand(record, { type: "appearance", appearance: { onboarding: { goalDishId: "software_tart" } } }, now, "alice"), "invalid_goal");
  rejects(() => applyKitchenCommand(record, { type: "appearance", appearance: { onboarding: { goalDishId: "made-up" } } }, now, "alice"), "invalid_goal");
  const claimed = applyKitchenCommand(record, { type: "claimDaily" }, now, "alice").actor;
  const forged = applyKitchenCommand(claimed, { type: "appearance", appearance: { delivery: createDelivery() }, delivery: createDelivery(), authority: { welcomeClaimed: false } } as any, now, "alice").actor;
  assert.equal(forged.save.delivery.welcomeClaimed, true);
  rejects(() => applyKitchenCommand(forged, { type: "claimDaily" }, now, "alice"), "already_claimed");
});

run("only an actual changed and valid layout commit completes decorating", () => {
  const record = fresh(), original = structuredClone(record);
  // Cancel submits nothing; a discarded draft cannot alter its source record.
  const draft = structuredClone(record.save.design); draft.floor = "sage";
  assert.deepEqual(record, original);
  const unchanged = applyKitchenCommand(record, { type: "layout", layout: [...record.save.layout].reverse(), design: record.save.design }, now, "alice").actor;
  assert.equal(unchanged.save.onboarding.decorated, false, "array ordering is not decoration");
  assert.equal(unchanged.authority.guestDesignImported, false, "unchanged commits preserve the one-time import choice");
  const changed = applyKitchenCommand(record, { type: "layout", layout: record.save.layout, design: draft }, now, "alice").actor;
  assert.equal(changed.save.onboarding.decorated, true); assert.equal(changed.save.design.floor, "sage");
  assert.equal(publicAuthority(changed, now).canImportGuestDesign, false, "a connected design now exists");
  rejects(() => applyKitchenCommand(changed, { type: "adoptGuestDesign", layout: record.save.layout, appearance: { name: "Stale guest" } }, now, "alice"), "design_import_unavailable");
  assert.equal(changed.save.coins, record.save.coins, "free finishes need no coin wait");
  const forgedLayout = [...record.save.layout, { itemId: "plant_basic", gx: 8, gy: 6, facing: "se" as const }];
  rejects(() => applyKitchenCommand(record, { type: "layout", layout: forgedLayout, design: draft }, now, "alice"), "not_owned");
  const blocked = record.save.layout.map((piece, i) => i === 1 ? { ...piece, gx: record.save.layout[0].gx, gy: record.save.layout[0].gy } : piece);
  rejects(() => applyKitchenCommand(record, { type: "layout", layout: blocked, design: draft }, now, "alice"), "blocked_layout");
  assert.equal(record.authority.guestDesignImported, false, "failed commits never consume the choice");
  assert.deepEqual(record, original);
});

run("welcome ingredients enable the selected starter goal and an actual upgrade marks it", () => {
  const record = fresh();
  const goal = applyKitchenCommand(record, { type: "appearance", appearance: { onboarding: { goalDishId: "margherita" } } }, now, "alice").actor;
  rejects(() => applyKitchenCommand(goal, { type: "upgradeDish", dishId: "margherita" }, now, "alice"), "ingredients_needed");
  const claimed = applyKitchenCommand(goal, { type: "claimDaily" }, now, "alice").actor;
  const upgraded = applyKitchenCommand(claimed, { type: "upgradeDish", dishId: "margherita" }, now, "alice").actor;
  assert.equal(upgraded.save.onboarding.upgraded, true); assert.equal(upgraded.save.pantry.levels.margherita, 2);
  const newGoal = applyKitchenCommand(upgraded, { type: "appearance", appearance: { onboarding: { goalDishId: "tiramisu", upgraded: true } } }, now, "alice").actor;
  assert.equal(newGoal.save.onboarding.upgraded, false, "a different goal cannot inherit another dish's completion");
  const previousGoal = applyKitchenCommand(newGoal, { type: "appearance", appearance: { onboarding: { goalDishId: "margherita", upgraded: false } } }, now, "alice").actor;
  assert.equal(previousGoal.save.onboarding.upgraded, true, "stored authoritative mastery satisfies a previously upgraded goal");
  previousGoal.save.pantry.levels.tiramisu = 3;
  const mastered = applyKitchenCommand(previousGoal, { type: "appearance", appearance: { onboarding: { goalDishId: "tiramisu", upgraded: false } } }, now, "alice").actor;
  assert.equal(mastered.save.onboarding.upgraded, true, "a mastered dish must not require an impossible additional upgrade");
  const cleared = applyKitchenCommand(mastered, { type: "appearance", appearance: { onboarding: { goalDishId: null, upgraded: true } } }, now, "alice").actor;
  assert.equal(cleared.save.onboarding.upgraded, false, "client flag cannot complete an absent goal");
});

run("guest room adoption preserves owned design once without importing progress", () => {
  const record = fresh();
  const command = { type: "adoptGuestDesign", layout: record.save.layout, design: { ...record.save.design, wall: "rose" },
    appearance: { name: "Guest Garden", theme: "trattoria", coins: 1e9, pantry: { stock: { tomato: 999 } }, onboarding: { finished: true }, intro: 6 } } as any;
  const adopted = applyKitchenCommand(record, command, now, "alice").actor;
  assert.equal(adopted.save.name, "Guest Garden"); assert.equal(adopted.save.design.wall, "rose");
  assert.deepEqual(adopted.save.layout, record.save.layout); assert.deepEqual(adopted.save.pantry, record.save.pantry);
  assert.equal(adopted.save.coins, record.save.coins); assert.equal(adopted.save.onboarding.finished, false);
  assert.equal(adopted.save.onboarding.decorated, true); assert.equal(adopted.save.intro, 1);
  assert.equal(adopted.authority.verifiedPlates, 0); assert.equal(adopted.authority.welcomeClaimed, false);
  assert.equal(publicAuthority(adopted, now).canImportGuestDesign, false);
  rejects(() => applyKitchenCommand(adopted, command, now, "alice"), "design_import_unavailable");
  const old = initializeKitchen(record.save, now);
  rejects(() => applyKitchenCommand(old, command, now, "alice"), "design_import_unavailable");
  const forged = { ...command, layout: [...record.save.layout, { itemId: "plant_basic", gx: 8, gy: 6, facing: "se" }] };
  rejects(() => applyKitchenCommand(record, forged, now, "alice"), "not_owned");
  const overlapping = { ...command, layout: record.save.layout.map((piece, i) => i === 1 ? { ...piece, gx: record.save.layout[0].gx, gy: record.save.layout[0].gy } : piece) };
  rejects(() => applyKitchenCommand(record, overlapping, now, "alice"), "blocked_layout");
  assert.equal(record.authority.guestDesignImported, false);
});

run("server time rejects rollback and invalid clocks; a client timestamp never grants another day", () => {
  const record = fresh();
  for (const clock of [now - 1, -1, NaN, Infinity]) rejects(() => applyKitchenCommand(record, { type: "claimDaily" }, clock, "alice"), "invalid_time");
  const claimed = applyKitchenCommand(record, { type: "claimDaily", now: now + 86_400_000 } as any, now, "alice").actor;
  assert.equal(claimed.save.delivery.claimedDay, utcKitchenDay(now));
  rejects(() => applyKitchenCommand(claimed, { type: "claimDaily", now: now + 86_400_000 } as any, now, "alice"), "already_claimed");
});

console.log("Domain Kitchen authoritative onboarding checks passed.");
