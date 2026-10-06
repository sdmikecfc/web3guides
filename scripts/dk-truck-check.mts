import assert from "node:assert/strict";
import { createTruckProgress, createEqualTruckProgress, dispatchTruck, sanitizeTruckProgress, validateTruckLayout, truckStartError, truckMenu, TRUCK_LADDER, TRUCK_SERVICE_NODES, TRUCK_SIZES, TRUCK_TICK_RATE, type TruckAction, type TruckProgress, type TruckDish, type TruckIngredientChoice, type TruckMachineId } from "../src/app/chef/game/_engine/truck";

let groups = 0;
function check(name: string, work: () => void) { work(); groups++; console.log(`PASS ${name}`); }
function driver(initial = createTruckProgress(), initialCoins = 0) {
  let truck = initial, coins = initialCoins;
  const home: Record<string, number> = {}, stock: Record<string, number> = {};
  const act = (action: TruckAction, expectError = false) => {
    const before = JSON.stringify(truck), result = dispatchTruck(truck, action, { coins, seed: "truck-check", recipeLevels: {} });
    assert.equal(JSON.stringify(truck), before, "Reducer mutated its input");
    if (expectError) { assert.ok(result.error, `Expected rejection: ${JSON.stringify(action)}`); assert.equal(result.coinDelta, 0); assert.equal(JSON.stringify(result.truck), before); return result; }
    assert.equal(result.error, undefined, `${JSON.stringify(action)}: ${result.error}`);
    truck = result.truck; coins += result.coinDelta;
    for (const [id, count] of Object.entries(result.homeGrants)) home[id] = (home[id] ?? 0) + count;
    for (const [id, count] of Object.entries(result.stockGrants)) stock[id] = (stock[id] ?? 0) + count;
    return result;
  };
  const tick = (count = 1) => { while (count > 0) { const part = Math.min(count, 1200); act({ type: "tick", ticks: part }); count -= part; } };
  const station = (machineId: TruckMachineId) => truck.run!.stations.find(s => s.machineId === machineId)!;
  const interact = (machineId: TruckMachineId, choice?: TruckIngredientChoice) => {
    act({ type: "interact", stationId: station(machineId).id, ...(choice ? { choice } : {}) });
    let budget = 300;
    while (truck.run!.player.pending || truck.run!.player.path.length) { assert.ok(budget-- > 0, "Approach failed to finish"); tick(); }
  };
  const finishProcessing = (machineId: TruckMachineId) => {
    let budget = 500;
    while (station(machineId).processing) { assert.ok(budget-- > 0, "Station failed to finish"); tick(); }
  };
  const wash = () => { interact("pass"); assert.equal(truck.run!.player.held?.kind, "dirty_plate"); interact("sink"); finishProcessing("sink"); };
  const cook = (dish: TruckDish) => {
    if (truck.run!.cleanPlates === 0) wash();
    interact(dish === "salad" || dish === "drink" ? "fridge" : "pantry", dish);
    assert.equal(truck.run!.player.held?.kind, dish === "pasta" ? "raw_pasta" : dish === "salad" ? "raw_salad" : dish === "fries" ? "raw_potato" : "lemon_cup");
    if (dish === "salad" || dish === "fries") { interact("prep"); finishProcessing("prep"); interact("prep"); }
    if (dish !== "salad") { const machine = dish === "pasta" ? "stove" : dish === "fries" ? "fryer" : "drinks"; interact(machine); if (dish === "pasta") { interact("pantry", "tomato"); interact("sauce"); finishProcessing("sauce"); } finishProcessing(machine); interact(machine); if (dish === "pasta") interact("sauce"); }
    if (dish !== "drink") { interact("plates"); interact("plates"); }
    interact("pass");
  };
  const serveShift = () => {
    let budget = 35;
    while (truck.run!.phase === "playing") {
      assert.ok(budget-- > 0, "Service did not end");
      while (truck.run!.customers.length === 0 && truck.run!.phase === "playing") tick();
      if (truck.run!.phase === "playing") cook(truck.run!.customers[0].dish);
    }
    assert.equal(truck.run!.phase, "cleared", truck.run!.failure ?? "Shift failed");
  };
  return { act, tick, interact, station, finishProcessing, cook, wash, serveShift, get truck() { return truck; }, get coins() { return coins; }, home, stock, reload() { truck = sanitizeTruckProgress(JSON.parse(JSON.stringify(truck))); } };
}

check("12 stops contain eight real services and four safe stops", () => {
  assert.equal(TRUCK_LADDER.length, 12); assert.deepEqual(TRUCK_LADDER.filter(n => n.kind === "service").map(n => n.id), [...TRUCK_SERVICE_NODES]);
  assert.deepEqual(TRUCK_LADDER.filter(n => n.kind === "service").map(n => n.serviceDay), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(TRUCK_SIZES.map(s => [s.w, s.h, s.helpers, s.unlockNode]), [[6, 4, 1, 0], [8, 5, 2, 4], [10, 6, 3, 8]]);
  assert.equal(validateTruckLayout("small", createTruckProgress().layout), null);
  assert.equal(validateTruckLayout("small", createEqualTruckProgress().layout), null);
});

check("physical cooking, one hand, asynchronous pot, interrupted chopping, dishes and replay", () => {
  const d = driver(createEqualTruckProgress()); d.act({ type: "start", node: 1 });
  d.interact("pantry", "pasta"); d.act({ type: "interact", stationId: d.station("pantry").id }, true);
  d.interact("stove"); assert.equal(d.truck.run!.player.held, null); assert.ok(d.station("stove").processing);
  d.interact("fridge", "salad"); assert.ok(d.station("stove").processing, "Pot must run while player gets greens");
  d.interact("prep"); const remaining = d.station("prep").processing!.remaining;
  d.act({ type: "moveTo", x: 3, y: 2 }); d.tick(40); assert.equal(d.station("prep").processing!.remaining, remaining, "Chopping continues without its cook");
  d.interact("prep"); d.tick(10); const saved = JSON.parse(JSON.stringify(d.truck)); d.reload(); assert.deepEqual(d.truck, saved, "In-flight prep changed on reload");
  d.finishProcessing("prep"); d.interact("pantry", "tomato"); d.interact("sauce"); d.finishProcessing("sauce"); d.interact("stove"); d.interact("plates"); assert.equal(d.truck.run!.player.held?.kind, "cooked_pasta", "Plain noodles were incorrectly plated"); d.interact("sauce"); d.interact("plates"); d.interact("plates"); d.interact("pass");
  assert.equal(d.coins, 4); assert.equal(d.truck.run!.dirtyDishes, 1); assert.equal(d.truck.run!.cleanPlates, 5);
  d.wash(); assert.equal(d.truck.run!.cleanPlates, 6); assert.equal(d.truck.run!.dirtyDishes, 0);
  d.act({ type: "pause" }); const frozen = JSON.stringify(d.truck); d.tick(1200); assert.equal(JSON.stringify(d.truck), frozen);
  d.reload(); d.act({ type: "resume" }); d.act({ type: "abandon" }); assert.equal(d.coins, 4); assert.equal(d.truck.nextNode, 1);
  d.act({ type: "finish" }); assert.equal(d.truck.run, null);
});

let completed: TruckProgress;
check("all eight services are playable with actual four cooking chains and one-time recovered machines", () => {
  const d = driver(); const timings: number[] = [];
  for (const node of TRUCK_LADDER) {
    assert.equal(d.truck.nextNode, node.id);
    if (node.kind !== "service") {
      d.act({ type: "marketVisit", node: node.id });
      if (node.unlock) { assert.equal(d.truck.machineInventory[node.unlock], 1); d.act({ type: "place", machineId: node.unlock, x: node.unlock === "fryer" ? 5 : 3, y: 3, facing: 1 }); }
    } else {
      d.act({ type: "start", node: node.id }); d.serveShift(); timings.push(d.truck.run!.tick / TRUCK_TICK_RATE);
      const before = d.coins; d.tick(1200); assert.equal(d.coins, before, "Terminal tick repeated reward");
      d.reload(); d.act({ type: "finish" });
    }
  }
  assert.equal(d.truck.bestDay, 8); assert.equal(d.truck.nextNode, 1); assert.equal(d.truck.firstClears.length, 12);
  assert.deepEqual(d.home, { fryer_basic: 1, drinks_basic: 1 }); assert.ok(d.coins > 300);
  const firstClearCoins = d.coins;
  d.act({ type: "start", node: 1 }); d.serveShift(); assert.equal(d.coins - firstClearCoins, 28, "Repeat first service granted another first-clear reward");
  d.act({ type: "finish" }); d.act({ type: "start", node: 2 }); d.serveShift(); d.act({ type: "finish" });
  const homeBefore = JSON.stringify(d.home); d.act({ type: "marketVisit", node: 3 }); assert.equal(JSON.stringify(d.home), homeBefore);
  completed = d.truck;
  const minutes = timings.reduce((sum, n) => sum + n, 0) / 60; assert.ok(minutes >= 35 && minutes <= 45, `Unexpected route pacing: ${minutes}m`);
  console.log(`  Full route service seconds: ${timings.join(", ")}; ${minutes.toFixed(1)} minutes; earned ${d.coins} coins.`);
});

check("one abandonment fails, failure keeps equipment and served earnings, practice grants nothing", () => {
  const d = driver(completed!); d.act({ type: "start", node: 4 }); d.cook("pasta"); const earned = d.coins;
  d.tick(2400); assert.equal(d.truck.run!.phase, "failed"); assert.equal(d.truck.nextNode, 1); assert.equal(d.truck.bestDay, 8); assert.equal(d.coins, earned); assert.ok(d.truck.unlockedMachineIds.includes("fryer"));
  d.act({ type: "finish" }); const permanent = { next: d.truck.nextNode, clears: [...d.truck.firstClears], coins: d.coins };
  d.act({ type: "start", node: 12, practice: true }); d.serveShift();
  assert.equal(d.coins, permanent.coins); assert.deepEqual(d.home, {}); assert.deepEqual(d.stock, {}); assert.equal(d.truck.nextNode, permanent.next); assert.deepEqual(d.truck.firstClears, permanent.clears);
  const fresh = driver(); fresh.act({ type: "start", node: 1, practice: true }); fresh.serveShift(); fresh.reload();
  assert.deepEqual(fresh.truck.firstClears, []); assert.equal(fresh.truck.bestDay, 0); assert.equal(fresh.truck.nextNode, 1); assert.equal(fresh.coins, 0); assert.deepEqual(fresh.home, {}); assert.deepEqual(fresh.stock, {});
  fresh.act({ type: "finish" }); fresh.act({ type: "marketVisit", node: 3 }, true);
});

check("prep layout, storage, size gates, permanent upgrades, cosmetic sign and active lock", () => {
  const d = driver(createTruckProgress(), 2000); d.act({ type: "buySize", size: "medium" }, true);
  d.act({ type: "buyMachine", machineId: "fryer" }, true); d.act({ type: "buyMachine", machineId: "counter" });
  d.act({ type: "place", machineId: "counter", x: 3, y: 2 }, true); d.act({ type: "place", machineId: "counter", x: 4, y: 3 });
  const added = d.truck.nextStationId - 1; for (let i = 0; i < 4; i++) d.act({ type: "rotate", stationId: added }); assert.equal(d.truck.layout.find(s => s.id === added)!.facing, 0);
  d.act({ type: "moveStation", stationId: added, x: 4, y: 2 }); d.act({ type: "store", stationId: added }); assert.equal(d.truck.machineInventory.counter, 1);
  d.act({ type: "hire", role: "washer" }); d.act({ type: "hire", role: "prep" }, true); d.act({ type: "upgrade", tech: "cook" });
  d.act({ type: "setCosmetic", color: "sage", sign: "Noodle Comet" }); d.reload(); assert.equal(d.truck.sign, "Noodle Comet"); assert.equal(d.truck.techLevels.cook, 1);
  d.act({ type: "start", node: 1 }); d.act({ type: "store", stationId: 1 }, true); d.cook("pasta");
  const helper = d.truck.run!.helpers[0]; const start = { x: helper.x, y: helper.y };
  d.tick(150); assert.notDeepEqual({ x: d.truck.run!.helpers[0].x, y: d.truck.run!.helpers[0].y }, start); assert.equal(d.truck.run!.dirtyDishes, 0); assert.equal(d.truck.run!.cleanPlates, 6, "Washer did not physically collect and wash dish");
  const big = driver(completed!, 3000); big.act({ type: "buySize", size: "medium" }); big.act({ type: "hire", role: "washer" }); big.act({ type: "hire", role: "prep" }); big.act({ type: "buySize", size: "large" }); big.act({ type: "hire", role: "runner" }); assert.equal(big.truck.crew.length, 3);
});

check("installed machines determine menu, closing drains cohort, unattended food burns", () => {
  const p = createTruckProgress(); assert.deepEqual(truckMenu(p.layout, TRUCK_LADDER[11]), ["pasta", "salad"]);
  const optional = driver(p); optional.act({ type: "start", node: 12, practice: true }); assert.deepEqual(optional.truck.run!.menu, ["pasta", "salad"]);
  const initialCustomer = optional.truck.run!.customers[0].id;
  const nearClose = structuredClone(optional.truck); nearClose.run!.remainingTicks = 1;
  const drained = dispatchTruck(nearClose, { type: "tick", ticks: 2 }, { coins: 0 }); assert.equal(drained.truck.run!.phase, "playing"); assert.equal(drained.truck.run!.customers[0].id, initialCustomer);
  optional.interact("pantry", "pasta"); optional.interact("stove"); optional.tick(750); assert.equal(optional.station("stove").item!.kind, "burnt");
  optional.interact("stove"); optional.act({ type: "discard" }); assert.equal(optional.truck.run!.player.held, null);
  const stored = driver(p); stored.act({ type: "store", stationId: 9 }); assert.deepEqual(truckMenu(stored.truck.layout, TRUCK_LADDER[11]), ["salad"]); stored.act({ type: "start", node: 1 }, true);
  const last = createEqualTruckProgress(); last.nextNode = 12; const closing = driver(last); closing.act({ type: "start", node: 12 }); closing.serveShift(); assert.equal(closing.truck.run!.served, 24); assert.equal(closing.truck.run!.customers.length, 0, "New customers arrived beyond the day's cohort");
});

check("prep and runner helpers physically complete their bounded jobs", () => {
  const prep = driver(createTruckProgress(), 1000); prep.act({ type: "hire", role: "prep" }); prep.act({ type: "store", stationId: 3 }); prep.act({ type: "start", node: 2, practice: true });
  assert.deepEqual(prep.truck.run!.menu, ["salad"]);
  const visited = new Set<string>();
  for (let tick = 0; tick < 600 && !prep.station("plates").item; tick++) { const h = prep.truck.run!.helpers[0]; visited.add(`${h.x},${h.y}`); prep.tick(); }
  assert.ok(visited.size > 4, "Prep helper did not walk between fridge, board, and plating counter"); assert.equal(prep.station("plates").item?.kind, "plate_salad");
  const savedPrep = JSON.parse(JSON.stringify(prep.truck)); prep.reload(); assert.deepEqual(prep.truck, savedPrep);
  const runner = driver(createTruckProgress(), 1000); runner.act({ type: "hire", role: "runner" }); runner.act({ type: "start", node: 1 });
  runner.interact("pantry", "pasta"); runner.interact("stove"); runner.interact("pantry", "tomato"); runner.interact("sauce"); runner.finishProcessing("sauce"); runner.finishProcessing("stove"); runner.interact("stove"); runner.interact("sauce"); runner.interact("plates");
  const startCoins = runner.coins; const runnerCells = new Set<string>();
  for (let tick = 0; tick < 300 && runner.truck.run!.served === 0; tick++) { const h = runner.truck.run!.helpers[0]; runnerCells.add(`${h.x},${h.y}`); runner.tick(); }
  assert.equal(runner.truck.run!.served, 1); assert.equal(runner.coins - startCoins, 4); assert.ok(runnerCells.size >= 3, "Runner did not walk its dish to the pass");
});

check("invalid actions are inert, malformed runs are discarded, fixed input replay is deterministic", () => {
  const d = driver();
  for (const action of [{ type: "start", node: NaN }, { type: "tick", ticks: Infinity }, { type: "tick", ticks: 1201 }, { type: "marketVisit", node: 3 }, { type: "buySize", size: "wat" }, { type: "hire", role: "wat" }, { type: "upgrade", tech: "wat" }, { type: "setCosmetic", sign: "" }, { type: "wat" }]) d.act(action as TruckAction, true);
  d.act({ type: "start", node: 1 });
  for (const action of [{ type: "move", dx: 0, dy: 0 }, { type: "move", dx: 1, dy: 1 }, { type: "moveTo", x: NaN, y: 0 }, { type: "interact", stationId: 1, choice: "wat" }, { type: "interact", stationId: 999 }]) d.act(action as TruckAction, true);
  const valid = d.truck, malformed = structuredClone(valid); malformed.run!.player.x = 999;
  assert.equal(sanitizeTruckProgress(malformed).run, null); assert.deepEqual(sanitizeTruckProgress(malformed).layout, valid.layout);
  const tape: TruckAction[] = [{ type: "start", node: 1 }, { type: "interact", stationId: 1, choice: "pasta" }, { type: "tick", ticks: 90 }, { type: "interact", stationId: 3 }, { type: "tick", ticks: 200 }];
  const replay = () => { let p = createTruckProgress(); for (const a of tape) { const r = dispatchTruck(p, a, { coins: 0, seed: "same" }); assert.equal(r.error, undefined); p = r.truck; } return p; };
  assert.deepEqual(replay(), replay()); assert.equal(truckStartError(createTruckProgress(), 3), "Visit this stop before continuing your route.");
});

check("unreachable or overlapping layouts and duplicate reward transitions are refused", () => {
  const p = createTruckProgress();
  assert.ok(validateTruckLayout("small", [...p.layout, { id: 99, machineId: "counter", x: 0, y: 0, facing: 0 }]));
  assert.ok(validateTruckLayout("small", p.layout.map(s => s.machineId === "pass" ? { ...s, x: 4, y: 2 } : s)));
  assert.ok(validateTruckLayout("small", [...p.layout, ...Array.from({ length: 6 }, (_, x) => ({ id: 20 + x, machineId: "counter" as const, x, y: 1, facing: 0 as const }))]), "Fully enclosed appliances were accepted");
  const current = structuredClone(completed!); current.run = null; current.nextNode = 3;
  const market = driver(current); const once = market.act({ type: "marketVisit", node: 3 }); assert.deepEqual(once.homeGrants, {}); market.act({ type: "marketVisit", node: 3 }, true);
  const fresh = driver(); fresh.act({ type: "start", node: 1 }); fresh.cook("pasta");
  const servedCoins = fresh.coins; fresh.act({ type: "interact", stationId: fresh.station("pass").id }); assert.equal(fresh.truck.run!.player.held?.kind, "dirty_plate");
  fresh.act({ type: "interact", stationId: fresh.station("pass").id }, true); assert.equal(fresh.coins, servedCoins, "Repeated serve action duplicated coins");
});
console.log(`PASS ${groups} food-truck engine groups`);
