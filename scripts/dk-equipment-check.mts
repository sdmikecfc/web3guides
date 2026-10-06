import assert from "node:assert/strict";
import { createWorld, deriveService, stepWorld, applyAction, WORLD_FIXED_DT, type WorldState } from "../src/app/chef/game/_engine/world";
import { sanitizeSave, serializeSave, layoutFromSave, type DkSave } from "../src/app/chef/game/_engine/save";
import { SHELL, starterLayout, GROWTH_SLOTS, SECOND_STOVE } from "../src/app/chef/game/_engine/rooms";
import { deriveKitchenOperations, reconcileEquipmentLayout, sanitizeEquipment, sellStoredEquipment, homeTechnology, EQUIPMENT_RULES } from "../src/app/chef/game/_engine/equipment";
import { capacityFor, operativeMenuForSave, settleRestaurant, type SettlementState } from "../src/lib/chef/offline";
import { initializeKitchen, applyKitchenCommand } from "../src/lib/chef/authority";

const start = Date.UTC(2026, 8, 19, 1), HOUR = 3_600_000;
let checks = 0;
function check(name: string, work: () => void) { work(); checks++; console.log(`PASS ${name}`); }
function close(a: number, b: number, what: string, tolerance = 1e-8) { assert.ok(Math.abs(a - b) < tolerance, `${what}: ${a} versus ${b}`); }
function fixture(extra = false): DkSave {
  const world = createWorld("equipment-regression", SHELL, { utcDay: Math.floor(start / 86_400_000), careJobsActive: false,
    layout: [...starterLayout(), ...(extra ? [{ itemId: "fryer_basic", gx: 4, gy: 0, facing: "se" as const }] : [])] });
  const save = sanitizeSave(serializeSave(world, "trattoria")); save.savedAt = start;
  assert.ok(capacityFor(save) > 0); return save;
}
const uidFor = (save: DkSave, itemId: string) => save.layout.find(p => p.itemId === itemId)!.uid!;
function settlement(save: DkSave): SettlementState { return { condition: { cleanliness: 100, equipment: 100, lastSettledAt: start }, coinRemainder: 0, plateRemainder: 0, equipment: structuredClone(save.equipment) }; }
function split(save: DkSave, initial: SettlementState, duration: number, interval: number) {
  let result = initial, plates = 0, coins = 0; const dishPlates: Record<string, number> = {};
  for (let elapsed = Math.min(interval, duration); ; elapsed = Math.min(duration, elapsed + interval)) {
    const next = settleRestaurant(save, result, initial.condition.lastSettledAt + elapsed); plates += next.plates; coins += next.coins; result = next;
    for (const [id, count] of Object.entries(next.dishPlates)) dishPlates[id] = (dishPlates[id] ?? 0) + count;
    if (elapsed === duration) break;
  }
  return { ...result, plates, coins, dishPlates };
}
function worldFrom(save: DkSave): WorldState {
  return createWorld("equipment-regression", SHELL, { layout: layoutFromSave(save), equipment: save.equipment, inventory: save.inventory, pantry: save.pantry, truck: save.truck, menu: save.menu, hires: { chefs: save.chefs, waiters: save.waiters }, careJobsActive: false });
}

check("offline wear is invariant under settlement splitting, including a mid-step break", () => {
  for (const nearBreak of [false, true, "floor"]) {
    const save = fixture(true), initial = settlement(save), fryer = uidFor(save, "fryer_basic");
    if (nearBreak === true) initial.equipment!.instances[String(fryer)].condition = 0.01;
    if (nearBreak === "floor") { initial.condition.cleanliness = 20.3; initial.condition.equipment = 20.5; }
    const whole = settleRestaurant(save, initial, start + 20 * 60_000), parts = split(save, initial, 20 * 60_000, 7_300);
    close(whole.plates + whole.plateRemainder, parts.plates + parts.plateRemainder, `produced plates (nearBreak=${nearBreak})`);
    close(whole.condition.cleanliness, parts.condition.cleanliness, "cleanliness"); close(whole.condition.equipment, parts.condition.equipment, "general upkeep");
    for (const [uid, instance] of Object.entries(whole.equipment!.instances)) close(instance.condition, parts.equipment!.instances[uid].condition, `machine ${uid}`);
    assert.deepEqual(whole.dishPlates, parts.dishPlates);
    for (const [id, fraction] of Object.entries(whole.dishRemainders!)) close(fraction, parts.dishRemainders![id], `dish ${id}`);
    close(whole.coins + whole.coinRemainder, parts.coins + parts.coinRemainder, `coin carry (nearBreak=${nearBreak})`);
  }
});

check("service attribution stops at each machine's break and survives canonical settlement", () => {
  const save = fixture(true), fryer = uidFor(save, "fryer_basic"), initial = settlement(save);
  initial.equipment!.instances[String(fryer)].condition = 0.01;
  const whole = settleRestaurant(save, initial, start + 2 * HOUR);
  assert.equal(whole.dishPlates.fries ?? 0, 0); close(whole.dishRemainders!.fries, 0.01 / EQUIPMENT_RULES.wearPerPlate, "actual fries before break");
  assert.ok(whole.plates > 30); assert.ok(Object.values(whole.dishPlates).reduce((a, b) => a + b, 0) > 20);
  const carry = structuredClone(initial); carry.dishRemainders = { fries: 0.95 };
  const carried = settleRestaurant(save, carry, start + 2 * HOUR); assert.equal(carried.dishPlates.fries, 1); close(carried.dishRemainders!.fries, 0.95 + 0.01 / EQUIPMENT_RULES.wearPerPlate - 1, "fries carry");
  save.equipment.instances[String(fryer)].condition = 0.01;
  const record = initializeKitchen(save, start), original = record.save.menu.serves.fries ?? 0;
  const next = applyKitchenCommand(record, { type: "settle" }, start + 2 * HOUR, "equipment-check").actor;
  assert.equal(next.save.menu.serves.fries ?? 0, original); assert.ok(next.authority.verifiedPlates > 30);
  close(next.authority.settlement.dishRemainders!.fries, 0.01 / EQUIPMENT_RULES.wearPerPlate, "canonical dish carry");
  const repeated = applyKitchenCommand(next, { type: "settle" }, start + 2 * HOUR, "equipment-check").actor;
  assert.deepEqual(repeated.save.menu.serves, next.save.menu.serves);
});

check("UTC midnight and purse carry do not make split settlement more profitable", () => {
  const save = fixture(true), initial = settlement(save), duration = 180_000;
  initial.condition.lastSettledAt = Date.UTC(2026, 8, 19, 23, 58, 30);
  initial.condition.cleanliness = 51; initial.condition.equipment = 60;
  const whole = settleRestaurant(save, initial, initial.condition.lastSettledAt + duration), parts = split(save, initial, duration, 7_300);
  close(whole.coins + whole.coinRemainder, parts.coins + parts.coinRemainder, "midnight coin carry"); assert.equal(whole.passive!.day, parts.passive!.day);
  close(whole.plates + whole.plateRemainder, parts.plates + parts.plateRemainder, "midnight plate carry");
});

check("a near-broken only machine stops sales and does not wear stored machines", () => {
  const save = fixture(), stove = uidFor(save, "stove_basic"), initial = settlement(save);
  initial.equipment!.instances[String(stove)].condition = EQUIPMENT_RULES.wearPerPlate * 0.4;
  initial.equipment!.instances[999] = { uid: 999, itemId: "fryer_basic", condition: 41 };
  const result = settleRestaurant(save, initial, start + 8 * HOUR);
  close(result.plates + result.plateRemainder, 0.4, "exhausted capacity"); assert.equal(result.plates, 0); assert.equal(result.coins, 0);
  assert.equal(result.equipment!.instances[String(stove)].condition, 0); assert.equal(result.equipment!.instances[999].condition, 41);
  const again = settleRestaurant(save, result, start + 9 * HOUR); assert.equal(again.plates, 0); assert.equal(again.coins, 0); assert.deepEqual(again.equipment, result.equipment);
});

check("broken and unreachable production never advertises unsupported dishes", () => {
  const save = fixture(true), fryer = uidFor(save, "fryer_basic");
  assert.ok(operativeMenuForSave(save).includes("fries")); save.equipment.instances[String(fryer)].condition = 0;
  assert.ok(!operativeMenuForSave(save).includes("fries")); assert.ok(capacityFor(save) > 0);
  const initial = settlement(save), settled = settleRestaurant(save, initial, start + HOUR); assert.ok(!settled.producedMenu.includes("fries"));
  const world = worldFrom(fixture(true)), blocked = structuredClone(world.grid); blocked.cells.fill(1); blocked.cells[world.door.y * blocked.w + world.door.x] = 0;
  const operations = deriveKitchenOperations(world.layout, blocked, world.door, world.equipment, ["margherita", "fries"]);
  assert.deepEqual(operations.menu, []); assert.equal(operations.stations.length, 0); assert.ok(operations.unavailable.some(p => p.reason === "blocked"));
  const noPass = fixture(true); noPass.layout = noPass.layout.filter(p => p.itemId !== "counter_basic"); assert.equal(capacityFor(noPass), 0); assert.deepEqual(operativeMenuForSave(noPass), []);
});

check("storage and reload preserve condition, sale removes identity, replacement is fresh", () => {
  const save = fixture(), stoveUid = uidFor(save, "stove_basic"); save.equipment.instances[String(stoveUid)].condition = 11.25;
  const world = worldFrom(save); world.playMoney = 2000;
  assert.ok(applyAction(world, SHELL, { type: "edit", on: true })); assert.ok(applyAction(world, SHELL, { type: "store", uid: stoveUid }));
  assert.equal(world.equipment.instances[String(stoveUid)].condition, 11.25);
  const round = sanitizeSave(JSON.parse(JSON.stringify(serializeSave(world, "trattoria")))), reloaded = worldFrom(round); reloaded.playMoney = 2000;
  assert.equal(reloaded.equipment.instances[String(stoveUid)].condition, 11.25);
  assert.ok(applyAction(reloaded, SHELL, { type: "edit", on: true })); assert.ok(applyAction(reloaded, SHELL, { type: "place", itemId: "stove_basic", gx: 2, gy: 0, facing: "se" }));
  assert.equal(reloaded.layout.find(p => p.itemId === "stove_basic")!.uid, stoveUid); assert.equal(reloaded.equipment.instances[String(stoveUid)].condition, 11.25);
  assert.ok(applyAction(reloaded, SHELL, { type: "store", uid: stoveUid })); assert.ok(applyAction(reloaded, SHELL, { type: "sellItem", itemId: "stove_basic" }));
  assert.ok(!reloaded.equipment.instances[String(stoveUid)]); assert.equal(reloaded.inventory.stove_basic, undefined);
  assert.ok(applyAction(reloaded, SHELL, { type: "buyItem", itemId: "stove_basic" })); assert.ok(applyAction(reloaded, SHELL, { type: "place", itemId: "stove_basic", gx: 2, gy: 0, facing: "se" }));
  const replacement = reloaded.layout.find(p => p.itemId === "stove_basic")!; assert.notEqual(replacement.uid, stoveUid); assert.equal(reloaded.equipment.instances[String(replacement.uid)].condition, 100);
});

check("same-type identities cannot reset wear through anonymous layouts or selling placed machines", () => {
  const equipment = sanitizeEquipment({ instances: { a: { uid: 21, itemId: "stove_basic", condition: 9 }, b: { uid: 22, itemId: "stove_basic", condition: 75 } } });
  const layout = reconcileEquipmentLayout([{ itemId: "stove_basic" }], equipment); assert.equal(layout[0].uid, 21); assert.equal(equipment.instances[21].condition, 9);
  sellStoredEquipment(equipment, layout, "stove_basic"); assert.ok(equipment.instances[21]); assert.ok(!equipment.instances[22]);
  const again = reconcileEquipmentLayout([{ itemId: "stove_basic" }], equipment); assert.equal(again[0].uid, 21);
  const two = reconcileEquipmentLayout([{ itemId: "stove_basic" }, { itemId: "stove_basic" }], equipment); assert.equal(two[0].uid, 21); assert.notEqual(two[1].uid, 21); assert.equal(equipment.instances[String(two[1].uid)].condition, 100);
});

check("live cooking charges the producing machine only and stops after it breaks", () => {
  const save = fixture(), stoveUid = uidFor(save, "stove_basic"); save.equipment.instances[String(stoveUid)].condition = EQUIPMENT_RULES.wearPerPlate;
  const world = worldFrom(save), cooked: { tick: number; dish: string }[] = []; let ready = 0;
  for (let tick = 0; tick < 180 / WORLD_FIXED_DT; tick++) {
    stepWorld(world, SHELL);
    const currentReady = world.orders.filter(o => o.stage === "ready").length;
    if (currentReady > ready) for (const order of world.orders.filter(o => o.stage === "ready")) cooked.push({ tick, dish: order.dishId });
    ready = currentReady;
  }
  assert.equal(world.equipment.instances[String(stoveUid)].condition, 0); assert.ok(cooked.length <= 1); assert.ok(world.stats.served <= 1); assert.equal(world.operations.stations.length, 0);
});

check("shared prep, cook, and service technology improve live and offline home work exactly once", () => {
  assert.deepEqual(homeTechnology(), { cook: 1, service: 1 });
  close(homeTechnology({ prep: 1 }).cook, 1.06, "prep rate"); close(homeTechnology({ cook: 1 }).cook, 1.12, "cook rate");
  close(homeTechnology({ prep: 3, cook: 3, service: 3 }).cook, 1.54, "bounded combined cooking rate");
  close(homeTechnology({ prep: Infinity, cook: -10, service: NaN }).cook, 1, "invalid levels");

  const kitchen = createWorld("home-technology", SHELL, { layout: [...starterLayout(), ...GROWTH_SLOTS], hires: { chefs: 1, waiters: 4 }, careJobsActive: false });
  const save = sanitizeSave(serializeSave(kitchen, "trattoria")), base = capacityFor(save);
  assert.equal(kitchen.seats.length, 10); close(base, 50, "fixture is chef-limited, not seat-limited");
  save.truck.techLevels.prep = 1; close(capacityFor(save) / base, 1.06, "offline prep benefit");
  save.truck.techLevels.cook = 1; close(capacityFor(save) / base, 1.18, "offline cook+prep benefit once");
  const liveBase = worldFrom({ ...save, truck: { ...save.truck, techLevels: { cook: 0, prep: 0, service: 0 } } });
  const liveUpgrade = worldFrom(save);
  close(deriveService(liveBase).cookDur / deriveService(liveUpgrade).cookDur, 1.18, "live cooking duration");
  close(deriveService(liveUpgrade).speed / deriveService(liveBase).speed, 1.18, "live displayed throughput");
  const firstCook = (world: WorldState) => {
    for (let tick = 0; tick < 120 / WORLD_FIXED_DT; tick++) {
      stepWorld(world, SHELL);
      const order = world.orders.find(entry => entry.stage === "cooking");
      if (order) return world.entities.find(entity => entity.id === order.chefId)!.cookT;
    }
    assert.fail("A guest never reached a cooking station");
  };
  close(firstCook(liveBase) / firstCook(liveUpgrade), 1.18, "actual cooking job applies the bonus once");

  const serviceWorld = createWorld("home-service-technology", SHELL, { layout: [...starterLayout(), ...GROWTH_SLOTS, SECOND_STOVE], hires: { chefs: 2, waiters: 1 }, careJobsActive: false });
  const serviceSave = sanitizeSave(serializeSave(serviceWorld, "trattoria")), slow = capacityFor(serviceSave);
  assert.ok(slow > 0 && slow < 50, "fixture should be waiter-limited"); serviceSave.truck.techLevels.service = 3;
  close(capacityFor(serviceSave) / slow, 1.24, "offline service benefit");
  const firstStep = (level: number) => {
    const world = worldFrom(save); world.truck.techLevels.service = level;
    const staff = world.entities.filter(entity => entity.kind !== "guest");
    for (const entity of staff) {
      const candidates = [{ x: entity.x + 1, y: entity.y }, { x: entity.x, y: entity.y + 1 }, { x: entity.x - 1, y: entity.y }, { x: entity.x, y: entity.y - 1 }];
      const target = candidates.find(point => point.x >= 0 && point.y >= 0 && point.x < world.grid.w && point.y < world.grid.h && world.grid.cells[point.y * world.grid.w + point.x] === 0)!;
      assert.ok(target); entity.state = "toAnchor"; entity.path = [target]; entity.walkDist = 0;
    }
    stepWorld(world, SHELL); return staff.map(entity => entity.walkDist);
  };
  const baselineMovement = firstStep(0), improvedMovement = firstStep(3);
  baselineMovement.forEach((distance, index) => { assert.ok(distance > 0); close(improvedMovement[index] / distance, 1.24, "live staff walking benefit"); });
});

console.log(`PASS ${checks} equipment persistence and production groups`);
