import assert from "node:assert/strict";
import { createInspectionWorld, REVIEW_COLLECTIONS } from "../src/app/chef/art-review/fixture";
import { SHELL, SHELL_SIZES, LEGACY_STARTER_LAYOUT, GROWTH_SLOTS, SECOND_STOVE, starterLayout, starterDesign } from "../src/app/chef/game/_engine/rooms";
import { defaultDesign } from "../src/app/chef/game/_engine/building";
import { findPath } from "../src/app/chef/game/_engine/path";
import { itemDef } from "../src/app/chef/game/_engine/items";
import { applyAction, createWorld, effSpeed, layoutForCounts, previewPlace, stepWorld, validateLayout, WORLD_FIXED_DT, type WorldState } from "../src/app/chef/game/_engine/world";
import { layoutFromSave, sanitizeSave, serializeSave } from "../src/app/chef/game/_engine/save";
import { capacityFor } from "../src/lib/chef/offline";
import { initializeKitchen } from "../src/lib/chef/authority";

let count = 0;
for (const collection of REVIEW_COLLECTIONS) for (let shell = 0; shell < SHELL_SIZES.length; shell++) {
  const label = `${collection}/${shell}`;
  const { world, room } = createInspectionWorld(collection, shell, "se", "starter");
  assert.equal(validateLayout(room, world.layout), "", `${label}: layout validation`);
  assert.equal(world.layout.length, 15, `${label}: minimal starter pieces`);
  assert.equal(world.toilets.length, 2, `${label}: two restrooms`);
  assert.equal(world.seats.length, 4, `${label}: four accessible dining seats`);
  assert.deepEqual(world.toilets.map(t=>[t.gx,t.gy]), [[room.w-3,0],[room.w-1,0]], `${label}: back-right corners`);
  for (const toilet of world.toilets) {
    // Art inspection explicitly selects its working-toilet view; the actual
    // daily repair contract is tested below and in dk-launch-check.mts.
    assert.equal(toilet.broken, false, `${label}: working bathroom inspection view`);
    assert.ok(toilet.workX >= 0 && toilet.workY >= 0, `${label}: valid interaction position`);
    assert.notEqual(findPath(world.grid, room.door.x, room.door.y, toilet.workX, toilet.workY), null, `${label}: entry reaches bathroom`);
    assert.notEqual(findPath(world.grid, world.passAnchor.x, world.passAnchor.y, toilet.workX, toilet.workY), null, `${label}: staff reaches bathroom`);
  }
  assert.deepEqual(world.layout.filter(p=>itemDef(p.itemId)?.kind==="partition").map(p=>[p.gx,p.gy]), [[room.w-2,0],[room.w-2,1]], `${label}: shared divider`);
  assert.equal(Object.keys(world.design.tiles).length, 6, `${label}: only bathroom floor painted`);
  assert.equal(Object.keys(world.design.wallTiles).length, 3, `${label}: only bathroom wall painted`);
  const mat=world.layout.find(p=>itemDef(p.itemId)?.kind==="doormat")!;
  assert.deepEqual([mat.gx,mat.gy],[room.door.x,room.door.y],`${label}: doormat follows shell entry`);
  assert.ok(world.stats.served>0,`${label}: actual 90-second service produced a plate`);
  assert.ok(capacityFor(serializeSave(world,"trattoria"))>0, `${label}: offline capacity positive`);
  count++;
  console.log(`${label}: ${world.stats.served} plates, 2 accessible toilets, 4 seats`);
}
const a=starterLayout(), b=starterLayout(); a[0].gx=99;
assert.notEqual(b[0].gx,99,"starter layout calls return independent pieces");
const da=starterDesign(),db=starterDesign(); da.tiles["7,0"]="checker";
assert.equal(db.tiles["7,0"],"sage","starter design calls return independent state");
console.log(`PASS ${count} collection/shell starter fixtures; independent defaults`);

const now=Date.UTC(2026,8,13);
const fresh=initializeKitchen(null,now);
assert.equal(fresh.save.layout.length,15,"new authoritative account receives new starter");
assert.deepEqual(fresh.save.design,starterDesign(SHELL),"new authoritative account receives staged bathroom finishes");
const customized=sanitizeSave({v:7,layout:LEGACY_STARTER_LAYOUT.map(p=>p.itemId==="plant_basic"?{...p,gx:0,gy:5}:p),inventory:{toilet_basic:2},design:{floor:"oak",wall:"rose",tiles:{"1,1":"checker"},wallTiles:{"left,2":"sky"},storefront:{awning:"blue",sign:"My kitchen"}},coins:231,pantry:{levels:{margherita:3}}});
const before=JSON.stringify(customized);
for(const raw of [customized,{...customized,v:6},{...customized,layout:[]}]) {
  const loaded=initializeKitchen(raw,now);
  assert.deepEqual(loaded.save.layout,sanitizeSave(raw).layout,"existing layout preserved exactly by authority migration");
  assert.deepEqual(loaded.save.design,customized.design,"existing custom design preserved by authority migration");
  assert.deepEqual(loaded.save.inventory,customized.inventory,"stored restrooms remain stored");
  assert.equal(loaded.authority.verifiedBestQuality,0,"legacy score is not verified history");
}
assert.equal(JSON.stringify(customized),before,"authority migration does not mutate original snapshot source");
console.log("PASS authoritative fresh bootstrap and v6/v7/custom/empty-save preservation");

assert.equal(fresh.save.coins, 20, "fresh coin balance remains unchanged");
assert.deepEqual([fresh.save.waiters, fresh.save.chefs], [1, 1]);
assert.deepEqual(fresh.save.inventory, {});
assert.ok(Object.values(fresh.save.pantry.levels).every((level) => level === 1));
for (let tables = 2; tables <= 5; tables++) for (let stoves = 1; stoves <= 2; stoves++) {
  const expected = [...LEGACY_STARTER_LAYOUT, ...(stoves === 2 ? [SECOND_STOVE] : []), ...GROWTH_SLOTS.slice(0, (tables - 2) * 3)];
  assert.deepEqual(layoutForCounts(tables, stoves), expected);
  const world = createWorld("legacy-counts", SHELL, { layout: layoutForCounts(tables, stoves) });
  assert.equal(validateLayout(SHELL, world.layout), "");
  assert.equal(world.toilets.length, 0, "count migration cannot add starter bathrooms");
  assert.equal(world.seats.length, tables * 2);
  assert.deepEqual(world.design, defaultDesign(), "explicit old layouts keep neutral missing-design default");
}
const empty = sanitizeSave({ ...customized, layout: [] });
assert.deepEqual(createWorld("empty-reload", SHELL, { layout: layoutFromSave(empty), design: empty.design }).layout, []);
console.log("PASS unchanged fresh progress, eight legacy count layouts, explicit empty layout reload");

const service = createWorld("starter-nook", SHELL, { parkedUsd: 0, weeklyVolumeUsd: 0 });
const saved = sanitizeSave(serializeSave(service, "trattoria"));
const reloaded = createWorld("starter-nook", SHELL, { layout: layoutFromSave(saved), design: saved.design, launch: saved.launch, parkedUsd: 0, weeklyVolumeUsd: 0, playMoney: saved.coins });
assert.deepEqual(reloaded.layout, service.layout);
assert.deepEqual(reloaded.design, service.design);
for (const world of [service, reloaded]) {
  const job = world.launch.careTasks.find(task => task.kind === "repair")!;
  for (let step = 0; step < job.steps; step++) {
    assert.ok(applyAction(world, SHELL, { type: "careTask", taskId: job.id }));
    for (let tick = 0; tick < 42; tick++) stepWorld(world, SHELL);
  }
  assert.ok(world.toilets.every(toilet => !toilet.broken), "daily repair is complete before testing incidental breakdowns");
  const repairTimes = [0, 0];
  world.toilets.forEach((toilet) => { toilet.broken = true; });
  for (let tick = 0; tick < 600 / WORLD_FIXED_DT; tick++) {
    const previous = new Map(world.entities.map((e) => [e.id, { x: e.x, y: e.y, walkDist: e.walkDist }]));
    stepWorld(world, SHELL);
    world.toilets.forEach((toilet, i) => { if (!toilet.broken && !repairTimes[i]) repairTimes[i] = world.timeSec; });
    for (const entity of world.entities) {
      const x = Math.round(entity.x), y = Math.round(entity.y);
      if (x >= 0 && x < SHELL.w && y >= 0 && y < SHELL.h) assert.notEqual(world.grid.cells[y * SHELL.w + x], 1, `${entity.kind} crosses furniture`);
      const before = previous.get(entity.id);
      if (!before) continue;
      const distance = Math.hypot(entity.x - before.x, entity.y - before.y);
      const walked = entity.walkDist - before.walkDist;
      const budget = effSpeed(entity) * WORLD_FIXED_DT;
      assert.ok(distance <= budget + 1e-6, "no teleport");
      assert.ok(walked <= budget + 1e-6 && walked + 1e-6 >= distance, "walking matches traveled route");
      if (distance === 0) assert.ok(walked < 1e-6, "stationary actors never slide");
    }
  }
  assert.ok(repairTimes.every((time) => time > 0 && time < 30), "both toilets repaired promptly");
  assert.ok(world.stats.served >= 20, "unassisted starter continues serving");
  assert.equal(world.stats.toiletFixedAuto, 2 + world.stats.toiletBreaks - world.toilets.filter((toilet) => toilet.broken).length);
  console.log(`PASS ${world === service ? "fresh" : "reloaded"} ten-minute service: ${world.stats.served} plates, initial repairs at ${repairTimes.map((time) => time.toFixed(2)).join("/")}s, ${world.stats.toiletBreaks} natural breaks`);
}

function assertActorsClear(world: WorldState) {
  for (const actor of world.entities) {
    const x = Math.round(actor.x), y = Math.round(actor.y);
    if (x >= 0 && y >= 0 && x < SHELL.w && y < SHELL.h) assert.notEqual(world.grid.cells[y * SHELL.w + x], 1, `${actor.kind} occupies solid furniture`);
  }
}
for (const itemId of ["toilet_basic", "partition_basic"]) {
  const world = createWorld("minimal-occupied-placement", SHELL);
  const waiter = world.entities.find((e) => e.kind === "waiter")!;
  const oldPosition = { x: waiter.x, y: waiter.y, walk: waiter.walkDist };
  applyAction(world, SHELL, { type: "edit", on: true });
  const piece = world.layout.find((p) => p.itemId === itemId)!;
  assert.equal(previewPlace(world, SHELL, piece.itemId, 6, 1, piece.uid, piece.facing), "");
  assert.equal(applyAction(world, SHELL, { type: "move", uid: piece.uid, gx: 6, gy: 1 }), true);
  assertActorsClear(world);
  assert.equal(waiter.walkDist, oldPosition.walk, "editor repositioning never advances animation");
  const distance = Math.hypot(waiter.x - oldPosition.x, waiter.y - oldPosition.y);
  assert.equal(distance, 1, "covered waiter moves to nearest open tile");
  assert.ok(findPath(world.grid, SHELL.door.x, SHELL.door.y, waiter.x, waiter.y));
  for (let tick = 0; tick < 300; tick++) { stepWorld(world, SHELL); assertActorsClear(world); }
}
const exiting = createWorld("minimal-exit-path", SHELL);
for (let tick = 0; tick < 600; tick++) stepWorld(exiting, SHELL);
applyAction(exiting, SHELL, { type: "edit", on: true });
const guest = exiting.entities.find((e) => e.kind === "guest" && e.x === 4 && e.y === 3)!;
assert.ok(guest, "reproduce departing diner");
assert.ok(guest.path.some((p) => p.x === 4 && p.y === 4));
const partition = exiting.layout.find((p) => p.itemId === "partition_basic")!;
assert.equal(previewPlace(exiting, SHELL, partition.itemId, 4, 4, partition.uid, partition.facing), "");
assert.equal(applyAction(exiting, SHELL, { type: "move", uid: partition.uid, gx: 4, gy: 4 }), true);
assert.ok(!guest.path.some((p) => p.x === 4 && p.y === 4), "exiting guest avoids freshly committed divider");
for (let tick = 0; tick < 900; tick++) { stepWorld(exiting, SHELL); assertActorsClear(exiting); }
assert.ok(!exiting.entities.some((e) => e.id === guest.id), "guest still reaches the exit");
console.log("PASS occupied editor placement and departing-guest route regression checks");

// Commit a divider directly onto a departing guest, rather than just ahead of
// the guest's route. The edit may reposition them, but must not advance a walk
// cycle or leave them embedded in the newly committed furniture.
const coveredGuestWorld = createWorld("minimal-exit-path", SHELL);
for (let tick = 0; tick < 600; tick++) stepWorld(coveredGuestWorld, SHELL);
applyAction(coveredGuestWorld, SHELL, { type: "edit", on: true });
const coveredGuest = coveredGuestWorld.entities.find((e) => e.kind === "guest" && e.x === 4 && e.y === 3)!;
assert.ok(coveredGuest, "direct-overlap fixture has a departing diner");
for (let tick = 0; tick < 30; tick++) stepWorld(coveredGuestWorld, SHELL);
const coveredCell = { x: Math.round(coveredGuest.x), y: Math.round(coveredGuest.y) };
assert.deepEqual(coveredCell, { x: 4, y: 4 }, "diner has left the chair and occupies open floor");
const coveredWalk = coveredGuest.walkDist;
const coveringDivider = coveredGuestWorld.layout.find((p) => p.itemId === "partition_basic")!;
assert.equal(previewPlace(coveredGuestWorld, SHELL, coveringDivider.itemId, coveredCell.x, coveredCell.y, coveringDivider.uid, coveringDivider.facing), "");
assert.equal(applyAction(coveredGuestWorld, SHELL, { type: "move", uid: coveringDivider.uid, gx: coveredCell.x, gy: coveredCell.y }), true);
assertActorsClear(coveredGuestWorld);
assert.equal(coveredGuest.walkDist, coveredWalk, "direct guest relocation does not fake walking");
assert.equal(coveredGuest.state, "leave", "covered guest continues departing");
assert.ok(findPath(coveredGuestWorld.grid, SHELL.door.x, SHELL.door.y, Math.round(coveredGuest.x), Math.round(coveredGuest.y)), "relocated guest stands on reachable floor");
assert.ok(!coveredGuest.path.some((p) => p.x === coveredCell.x && p.y === coveredCell.y), "guest's new exit route avoids the covering divider");
for (let tick = 0; tick < 900; tick++) { stepWorld(coveredGuestWorld, SHELL); assertActorsClear(coveredGuestWorld); }
assert.ok(!coveredGuestWorld.entities.some((e) => e.id === coveredGuest.id), "directly covered guest reaches the exit");

// Closing the last side of an island does not cover the actor's own floor
// tile. They still need a reachable position, or rerouting cannot free them.
const island = createWorld("minimal-open-island", SHELL, { layout: LEGACY_STARTER_LAYOUT, inventory: { partition_basic: 3 } });
const islandWaiter = island.entities.find((e) => e.kind === "waiter")!;
assert.deepEqual([islandWaiter.x, islandWaiter.y], [6, 1]);
applyAction(island, SHELL, { type: "edit", on: true });
for (const cell of [{ x: 5, y: 1 }, { x: 7, y: 1 }]) {
  assert.equal(previewPlace(island, SHELL, "partition_basic", cell.x, cell.y), "");
  assert.equal(applyAction(island, SHELL, { type: "place", itemId: "partition_basic", gx: cell.x, gy: cell.y }), true);
}
assert.deepEqual([islandWaiter.x, islandWaiter.y], [6, 1], "waiter remains on reachable floor before the final side closes");
assert.ok(findPath(island.grid, SHELL.door.x, SHELL.door.y, 6, 1));
const islandWalk = islandWaiter.walkDist;
assert.equal(previewPlace(island, SHELL, "partition_basic", 6, 2), "");
assert.equal(applyAction(island, SHELL, { type: "place", itemId: "partition_basic", gx: 6, gy: 2 }), true);
assert.equal(validateLayout(SHELL, island.layout), "", "enclosure leaves restaurant stations reachable");
assert.equal(island.grid.cells[1 * SHELL.w + 6], 0, "original actor tile remains physically open");
assert.equal(findPath(island.grid, SHELL.door.x, SHELL.door.y, 6, 1), null, "divider commits have disconnected the original floor tile");
assert.notDeepEqual([islandWaiter.x, islandWaiter.y], [6, 1], "waiter is rescued from the open island");
assert.equal(islandWaiter.walkDist, islandWalk, "island relocation does not fake walking");
assert.ok(findPath(island.grid, SHELL.door.x, SHELL.door.y, islandWaiter.x, islandWaiter.y), "waiter's replacement position is door-reachable");
for (let tick = 0; tick < 300; tick++) { stepWorld(island, SHELL); assertActorsClear(island); }
console.log("PASS directly covered guest and enclosed-open-floor editor regressions");
