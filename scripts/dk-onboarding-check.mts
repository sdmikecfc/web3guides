/** Pure onboarding persistence and parcel checks. No storage or network calls. */
import assert from "node:assert/strict";
import { createOnboarding, createDelivery, onboardingStep, sanitizeOnboarding, sanitizeDelivery, welcomeIngredientBundle, deliveryContents, claimGuestDelivery, DAILY_PARCEL_INGREDIENTS, DELIVERY_DAY_LIMIT, WELCOME_DISH_ID } from "../src/app/chef/game/_engine/onboarding";
import { sanitizeSave, serializeSave, LIMITS } from "../src/app/chef/game/_engine/save";
import { createWorld, hashWorld, applyAction } from "../src/app/chef/game/_engine/world";
import { SHELL } from "../src/app/chef/game/_engine/rooms";
import { nextRecipe, COMMONS } from "../src/app/chef/game/_engine/pantry";
import { MAX_BANKED_DAYS, utcDayOf } from "../src/app/chef/game/_engine/wallclock";

const now = Date.UTC(2026, 8, 14, 12), day = utcDayOf(now);
const sum = (stock: Record<string, number>) => Object.values(stock).reduce((a, b) => a + b, 0);
const fresh = sanitizeSave({});
assert.deepEqual(fresh.onboarding, createOnboarding());
assert.deepEqual(fresh.delivery, createDelivery());
assert.equal(onboardingStep(fresh.onboarding, fresh.delivery), 1);
assert.deepEqual(sanitizeSave({ savedAt: 0, intro: 0, utcDay: day }).delivery, createDelivery());
for (const intro of [0, 6]) {
  const old = sanitizeSave({ savedAt: now, intro, utcDay: day });
  assert.equal(old.onboarding.finished, true);
  assert.equal(onboardingStep(old.onboarding, old.delivery), 6);
  assert.deepEqual(old.delivery, createDelivery(day, true));
  assert.equal(claimGuestDelivery(old, now), null, "legacy current-day delivery cannot be paid twice");
}
for (const intro of [1, 2, 3, 4, 5]) {
  const old = sanitizeSave({ savedAt: now, intro, utcDay: day });
  assert.equal(old.onboarding.finished, false);
  assert.equal(old.onboarding.served, intro >= 3);
  assert.equal(old.onboarding.decorated, intro >= 4);
  assert.equal(old.onboarding.goalDishId, null);
  assert.equal(old.onboarding.upgraded, false);
  assert.deepEqual(old.delivery, createDelivery(day, true), "unfinished legacy coach cannot reset rewards");
}
console.log("PASS fresh, completed/skipped legacy, and unfinished legacy onboarding migration");

const state = createOnboarding(), receipt = createDelivery();
state.served = true; assert.equal(onboardingStep(state, receipt), 2);
state.decorated = true; assert.equal(onboardingStep(state, receipt), 3);
receipt.welcomeClaimed = true; assert.equal(onboardingStep(state, receipt), 4);
state.goalDishId = WELCOME_DISH_ID; assert.equal(onboardingStep(state, receipt), 4, "opening or selecting a recipe alone never completes an upgrade");
state.upgraded = true; assert.equal(onboardingStep(state, receipt), 5);
state.finished = true; assert.equal(onboardingStep(state, receipt), 6);
const world = createWorld("onboarding-persistence", SHELL);
const beforeHash = hashWorld(world);
const saved = serializeSave(world, "trattoria", undefined, 3, "Little Kitchen", { onboarding: { ...state, upgraded: false, finished: false }, delivery: receipt });
const round = sanitizeSave(JSON.parse(JSON.stringify(saved)));
assert.deepEqual(round.onboarding, saved.onboarding);
assert.deepEqual(round.delivery, saved.delivery);
assert.equal(hashWorld(world), beforeHash, "metadata never changes simulation state/hash");
state.goalDishId = "caciopepe"; receipt.welcomeClaimed = false;
assert.equal(saved.onboarding.goalDishId, WELCOME_DISH_ID);
assert.equal(saved.delivery.welcomeClaimed, true);
assert.equal(serializeSave(world, "trattoria").onboarding.finished, true, "old serializer callers remain completed");
console.log("PASS milestones require actions, survive reload, and stay outside WorldState");

for (const id of ["unknown", "special", "software_noodles", "__proto__"]) {
  const invalid = sanitizeSave({ onboarding: { ...createOnboarding(), goalDishId: id, upgraded: true }, pantry: { levels: { [id]: 3 } } });
  assert.equal(invalid.onboarding.goalDishId, null); assert.equal(invalid.onboarding.upgraded, false);
}
assert.equal(sanitizeOnboarding({ ...createOnboarding(), goalDishId: "margherita", upgraded: true }, { levels: { margherita: 1 } }).upgraded, false);
assert.equal(sanitizeSave({ onboarding: { ...createOnboarding(), goalDishId: "margherita", upgraded: true }, pantry: { levels: { margherita: 2 } } }).onboarding.upgraded, true);
assert.equal(sanitizeSave({ onboarding: { ...createOnboarding(), goalDishId: "software_noodles" }, menu: { unlocked: ["software_noodles"] } }).onboarding.goalDishId, "software_noodles");
assert.deepEqual(sanitizeDelivery({ claimedDay: Infinity, welcomeClaimed: "false" }, { existing: true, utcDay: day }), createDelivery(day, true));
assert.deepEqual(sanitizeDelivery({ claimedDay: -50, welcomeClaimed: false }), createDelivery(-1, false));
assert.equal(sanitizeDelivery({ claimedDay: 1e9 }).claimedDay, DELIVERY_DAY_LIMIT);
console.log("PASS goal availability, real mastery, receipt ranges, and malformed metadata validation");

const welcome = welcomeIngredientBundle();
assert.deepEqual(welcome, nextRecipe(WELCOME_DISH_ID, 1));
welcome.tomato = 999;
assert.deepEqual(welcomeIngredientBundle(), { tomato: 2, herb: 1 }, "welcome calls return independent bundles");
for (let d = day; d < day + 100; d++) {
  const contents = deliveryContents(d);
  assert.equal(sum(contents), DAILY_PARCEL_INGREDIENTS);
  assert.ok(Object.keys(contents).every((id) => COMMONS.includes(id)));
  assert.deepEqual(contents, deliveryContents(d));
}
assert.deepEqual(deliveryContents(NaN), {}); assert.deepEqual(deliveryContents(-1), {});
const untouched = JSON.stringify(fresh);
const claimed = claimGuestDelivery(fresh, now)!;
assert.ok(claimed);
assert.equal(JSON.stringify(fresh), untouched, "claim is pure and never mutates the source");
assert.equal(sum(claimed.pantry.stock), sum(welcomeIngredientBundle()) + DAILY_PARCEL_INGREDIENTS);
assert.deepEqual(claimed.delivery, createDelivery(day, true));
assert.equal(claimGuestDelivery(claimed, now), null);
assert.equal(claimGuestDelivery(sanitizeSave(JSON.parse(JSON.stringify(claimed))), now + 5000), null);
assert.equal(claimGuestDelivery(claimed, now - 86_400_000), null);
for (const invalid of [NaN, Infinity, -1]) assert.equal(claimGuestDelivery(fresh, invalid), null);
const tomorrow = claimGuestDelivery(claimed, now + 86_400_000)!;
assert.equal(sum(tomorrow.pantry.stock) - sum(claimed.pantry.stock), DAILY_PARCEL_INGREDIENTS);
const later = claimGuestDelivery(tomorrow, now + 100 * 86_400_000)!;
assert.equal(sum(later.pantry.stock) - sum(tomorrow.pantry.stock), DAILY_PARCEL_INGREDIENTS * MAX_BANKED_DAYS);
assert.equal(claimGuestDelivery(later, now + 100 * 86_400_000), null, "long absence cap is consumed once");
const full = { ...fresh, pantry: { ...fresh.pantry, stock: Object.fromEntries(COMMONS.map((id) => [id, LIMITS.stock])) } };
const fullClaim = claimGuestDelivery(full, now)!;
assert.ok(Object.values(fullClaim.pantry.stock).every((n) => n === LIMITS.stock));
assert.equal(claimGuestDelivery(fullClaim, now), null, "full pantry cannot keep a redeemable receipt");
const upgradeWorld = createWorld("welcome-upgrade", SHELL, { pantry: claimed.pantry });
assert.equal(applyAction(upgradeWorld, SHELL, { type: "upgradeDish", key: WELCOME_DISH_ID }), true);
assert.equal(upgradeWorld.pantry.levels[WELCOME_DISH_ID], 2);
assert.equal(upgradeWorld.playMoney, 20, "welcome changes no coins");
console.log("PASS welcome upgrade, deterministic daily contents, bounded banking, replay/reload/rollback, and pantry caps");
console.log("onboarding checks PASS");
