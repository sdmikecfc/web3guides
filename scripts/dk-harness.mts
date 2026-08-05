/**
 * Domain Kitchen M4a harness (ADR-0101/0102/0103/0104): the NO-SLIDING gate,
 * the earn-and-spend economy, THE LAYOUT ENGINE, and determinism with a full
 * player-action tape — headless, the same discipline as scripts/s5-harness.ts.
 *
 * Per-tick invariants for every entity:
 *   1. NO TELEPORTS (bounded by effSpeed — hustle uses the same bound).
 *   2. WALK == MOVE (walkDist grows by exactly the position delta).
 *   3. MOTION => LOCOMOTION STATE (either side of a transition tick).
 *   4. STILLNESS => FROZEN CYCLE.
 *   5. HEADING FACES THE NEXT WAYPOINT.
 *   6. NOBODY STANDS INSIDE FURNITURE (layout and bodies never disagree).
 *
 * The tape: broke purchase rejected -> dials up -> buy furniture + hires ->
 * ARRANGE (place table + chairs, move, rotate, store/replace, three refusal
 * cases incl. sealing the door) -> back to service -> a seeded LAYOUT FUZZ of
 * random moves, asserting after every accepted edit that the room is still
 * valid and every seat still has a reachable serve tile.
 *
 * Run: npx tsx scripts/dk-harness.mts
 */

import {
  applyAction,
  collectionUnlocked,
  createWorld,
  deriveService,
  effSpeed,
  hashWorld,
  hireCost,
  itemPurchasable,
  lpDaysAt,
  previewPlace,
  stepWorld,
  validateLayout,
  WORLD_FIXED_DT,
  type Action,
  type WorldState,
} from "../src/app/chef/game/_engine/world";
import { COLLECTION_LP_DAYS, itemDef, MARKETS } from "../src/app/chef/game/_engine/items";
import {
  canUpgradeDish,
  CLEAN_MAX,
  qualityParts,
  TRASH_VISIBLE_CAP,
} from "../src/app/chef/game/_engine/world";
import {
  MAX_DISH_LEVEL,
  QUALITY_DISH_CAP,
  RARE_DROP_CAP,
  VOLUME_DROP_CAP,
} from "../src/app/chef/game/_engine/pantry";
import { SHELL } from "../src/app/chef/game/_engine/rooms";

// 35 real-minutes = 70 game-hours from 17:00, so the run crosses THREE day
// rollovers — the minimum needed to prove the ADR-0105 LP-tenure gate opens
const TICKS = 60 * 60 * 35;
const EPS = 1e-6;
const LOCOMOTION = new Set([
  "enter", "leave", "toStove", "toPass", "toTable", "toAnchor", "toBus", "clockOut",
  "toBench", "toChore",
]);

let failures = 0;
function fail(msg: string): void {
  failures++;
  if (failures <= 14) console.error("FAIL: " + msg);
}

interface Prev { x: number; y: number; walkDist: number; state: string }

interface TapeResult {
  brokeRejected: boolean;
  bought: string[];
  placed: number;
  moved: boolean;
  rotated: boolean;
  storedAndReplaced: boolean;
  refusedOverlap: boolean;
  refusedSeal: boolean;
  refusedUnowned: boolean;
  floorClearedInEdit: boolean;
  editBlockedOutside: boolean;
  fuzzAccepted: number;
  fuzzRejected: number;
  sawTwoWaiters: boolean;
  sawTwoChefs: boolean;
  sawNight: boolean;
  seatsAfterArrange: number;
  seatsAfterFuzz: number;
  /** ADR-0105 domain collections */
  lockedBuyRefused: boolean;
  unlockedBuyOk: boolean;
  daysToUnlock: number;
  marketSwitched: boolean;
  tenureKeptAfterSwitch: boolean;
  domainPiecePlaced: boolean;
  /** ADR-0107 waiting area */
  benchPlaced: boolean;
  maxWaiting: number;
  sawBenchOverflow: boolean;
  /** ADR-0106 pantry */
  upgrades: number;
  maxVolumeDropsInADay: number;
  maxRareDropsInADay: number;
  qualityFromDishes: number;
  /** ADR-0106 upkeep */
  maxTrash: number;
  toiletPlaced: boolean;
}

/** simple seeded rng for the fuzz (harness-side only, never the sim's) */
function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** every derived-state invariant that must hold after any layout change */
function checkLayoutInvariants(w: WorldState, when: string): void {
  if (validateLayout(SHELL, w.layout) !== "") {
    fail(`layout invalid after ${when}: ${validateLayout(SHELL, w.layout)}`);
  }
  for (const s of w.seats) {
    if (s.serveX < 0) fail(`seat (${s.gx},${s.gy}) has no serve tile after ${when}`);
    const t = w.tables[s.tableIdx];
    if (!t) fail(`seat (${s.gx},${s.gy}) points at a missing table after ${when}`);
  }
  for (const t of w.tables) {
    const stillThere = w.layout.some((p) => p.uid === t.uid);
    if (!stillThere) fail(`table uid ${t.uid} survived removal after ${when}`);
  }
  // the grid must agree with the layout
  for (const p of w.layout) {
    const def = itemDef(p.itemId);
    if (!def || !def.solid) continue;
    for (let i = 0; i < def.cells; i++) {
      const cell = w.grid.cells[p.gy * SHELL.w + (p.gx + i)];
      if (cell === 0) fail(`grid says open where ${p.itemId} stands after ${when}`);
    }
  }
}

const BUY_PLAN = [
  "table_basic", "chair_basic", "chair_basic",
  "stove_basic",
  "plant_basic", "plant_basic", "plant_basic",
  "bench_basic",
  "toilet_basic",
];

function run(seed: string, check: boolean): { w: WorldState; r: TapeResult } {
  const w = createWorld(seed, SHELL, { parkedUsd: 25, weeklyVolumeUsd: 60 });
  const prev = new Map<number, Prev>();
  const r: TapeResult = {
    brokeRejected: false, bought: [], placed: 0, moved: false, rotated: false,
    storedAndReplaced: false, refusedOverlap: false, refusedSeal: false,
    refusedUnowned: false, floorClearedInEdit: false, editBlockedOutside: false,
    fuzzAccepted: 0, fuzzRejected: 0, sawTwoWaiters: false, sawTwoChefs: false,
    sawNight: false, seatsAfterArrange: 0, seatsAfterFuzz: 0,
    lockedBuyRefused: false, unlockedBuyOk: false, daysToUnlock: -1,
    marketSwitched: false, tenureKeptAfterSwitch: false, domainPiecePlaced: false,
    benchPlaced: false, maxWaiting: 0, sawBenchOverflow: false,
    upgrades: 0, maxVolumeDropsInADay: 0, maxRareDropsInADay: 0, qualityFromDishes: 0,
    maxTrash: 0, toiletPlaced: false,
  };
  const HOME = MARKETS[0].id;
  const OTHER = MARKETS[1].id;
  const DOMAIN_TABLE = `${MARKETS[0].collection}_table`;
  const rnd = mulberry(1337);
  let editPhase = 0;
  let editT = 0;
  let unlockT = -1;
  let hiredWaiter = false;
  let hiredChef = false;

  const act = (a: Action) => applyAction(w, SHELL, a);

  for (let t = 0; t < TICKS; t++) {
    // ── the action tape ────────────────────────────────────────────────────
    if (t === 200) {
      // a layout edit outside edit mode must be refused (ADR-0104 guard)
      r.editBlockedOutside = !act({ type: "move", uid: w.layout[0].uid, gx: 1, gy: 1 });
    }
    if (t === 300) {
      if (!act({ type: "buyHire", hire: "chef" })) r.brokeRejected = true;
      else fail("broke hire was ACCEPTED");
    }
    if (t === 600) act({ type: "dials", parkedUsd: 500, weeklyVolumeUsd: 1000 });

    // ── ADR-0105: the domain collection is LOCKED until LP tenure ──────────
    if (t === 700) {
      // rich, but no tenure yet: the buy must be refused
      r.lockedBuyRefused =
        !collectionUnlocked(w, HOME) && !act({ type: "buyItem", itemId: DOMAIN_TABLE });
    }
    if (r.daysToUnlock < 0 && collectionUnlocked(w, HOME)) {
      r.daysToUnlock = w.day;
      unlockT = t;
      r.unlockedBuyOk = act({ type: "buyItem", itemId: DOMAIN_TABLE });
      // switching markets is free and must not erase banked tenure
      r.marketSwitched = act({ type: "market", id: OTHER });
      r.tenureKeptAfterSwitch =
        collectionUnlocked(w, HOME) && lpDaysAt(w, HOME) >= COLLECTION_LP_DAYS;
      act({ type: "market", id: HOME });
    }

    if (t > 1200 && r.bought.length < BUY_PLAN.length) {
      const id = BUY_PLAN[r.bought.length];
      const def = itemDef(id);
      if (def && w.playMoney >= def.cost && act({ type: "buyItem", itemId: id })) {
        r.bought.push(id);
      }
    }
    if (!hiredWaiter && t > 1200 && (hireCost(w, "waiter") ?? 1e9) <= w.playMoney) {
      hiredWaiter = act({ type: "buyHire", hire: "waiter" });
    }
    if (!hiredChef && t > 1200 && deriveService(w).stoves >= 2 &&
        (hireCost(w, "chef") ?? 1e9) <= w.playMoney) {
      hiredChef = act({ type: "buyHire", hire: "chef" });
    }

    // ── the ARRANGE tape (phase-driven: the buy plan finishes when income
    // allows, not on a fixed tick) ─────────────────────────────────────────
    if (editPhase === 0 && t >= 9000 && r.bought.length === BUY_PLAN.length) {
      act({ type: "edit", on: true });
      editPhase = 1;
      editT = t;
    }
    // 600 ticks = 10s: long enough for a guest at the far corner to reach the
    // door at 1.6 tiles/sec, which is what "the floor empties" actually costs
    if (editPhase === 1 && t === editT + 600) {
      // the floor should be empty of guests by now (they walked out)
      r.floorClearedInEdit = w.entities.every((e) => e.kind !== "guest");
      // place a table with two chairs in the open south-east area
      if (act({ type: "place", itemId: "table_basic", gx: 8, gy: 4 })) r.placed++;
      if (act({ type: "place", itemId: "chair_basic", gx: 8, gy: 3, facing: "sw" })) r.placed++;
      if (act({ type: "place", itemId: "chair_basic", gx: 7, gy: 4, facing: "se" })) r.placed++;
      // the second stove goes in beside the first so a second chef can be hired
      if (act({ type: "place", itemId: "stove_basic", gx: 3, gy: 0 })) r.placed++;
      // a waiting bench by the door (ADR-0107)
      r.benchPlaced = act({ type: "place", itemId: "bench_basic", gx: 6, gy: 7 });
      if (r.benchPlaced) r.placed++;
      // a restroom in the corner (ADR-0106)
      r.toiletPlaced = act({ type: "place", itemId: "toilet_basic", gx: 9, gy: 0 });
      if (r.toiletPlaced) r.placed++;
      if (check) checkLayoutInvariants(w, "placing the new table set");

      // REFUSAL 1: something is already there
      r.refusedOverlap = !act({ type: "place", itemId: "plant_basic", gx: 8, gy: 4 });
      // REFUSAL 2: you do not own one of those
      r.refusedUnowned = !act({ type: "place", itemId: "counter_basic", gx: 1, gy: 5 });

      // move an existing table, then bring its chairs along — a table that
      // walks away from its chairs really does orphan them (they stop being
      // seats), which is the layout mechanic working, so the tape moves all
      // three the way a player would
      const table = w.layout.find((p) => p.itemId === "table_basic" && p.gx === 5 && p.gy === 3);
      if (table) r.moved = act({ type: "move", uid: table.uid, gx: 5, gy: 5 });
      const c1 = w.layout.find((p) => p.itemId === "chair_basic" && p.gx === 5 && p.gy === 2);
      if (c1) act({ type: "move", uid: c1.uid, gx: 5, gy: 4, facing: "sw" });
      const c2 = w.layout.find((p) => p.itemId === "chair_basic" && p.gx === 4 && p.gy === 3);
      if (c2) act({ type: "move", uid: c2.uid, gx: 4, gy: 5, facing: "se" });
      if (check) checkLayoutInvariants(w, "moving a table and its chairs");
      const chair = w.layout.find((p) => p.itemId === "chair_basic");
      if (chair) r.rotated = act({ type: "rotate", uid: chair.uid });

      // store a plant and put it back down elsewhere
      const plant = w.layout.find((p) => p.itemId === "plant_basic");
      if (plant && act({ type: "store", uid: plant.uid })) {
        r.storedAndReplaced = act({ type: "place", itemId: "plant_basic", gx: 9, gy: 6 });
      }
      if (check) checkLayoutInvariants(w, "store and replace");

      // REFUSAL 3: sealing the door off from the room
      const seal = [
        { gx: 3, gy: 7 },
        { gx: 5, gy: 7 },
        { gx: 4, gy: 6 },
      ];
      let placedSeal = 0;
      for (const s of seal) {
        if (act({ type: "place", itemId: "plant_basic", gx: s.gx, gy: s.gy })) placedSeal++;
        else break;
      }
      // the LAST one must have been refused (it would trap the doorway)
      r.refusedSeal = placedSeal === 2;
      // tidy up: put the two blockers back in storage
      for (const s of seal.slice(0, placedSeal)) {
        const p = w.layout.find((q) => q.gx === s.gx && q.gy === s.gy && q.itemId === "plant_basic");
        if (p) act({ type: "store", uid: p.uid });
      }
      if (check) checkLayoutInvariants(w, "the door-seal refusal");
      // seats measured HERE: after the deliberate arrangement, before the
      // fuzz deliberately scatters the room
      r.seatsAfterArrange = w.seats.length;
      editPhase = 2;
    }

    // ── the LAYOUT FUZZ (still inside edit mode) ───────────────────────────
    if (editPhase === 2 && t > editT + 620 && t < editT + 1200 && t % 20 === 0) {
      const movable = w.layout.filter((p) => p.itemId !== "doormat_basic");
      if (movable.length > 0) {
        const p = movable[Math.floor(rnd() * movable.length) % movable.length];
        const gx = Math.floor(rnd() * SHELL.w);
        const gy = Math.floor(rnd() * SHELL.h);
        const before = previewPlace(w, SHELL, p.itemId, gx, gy, p.uid);
        const ok = act({ type: "move", uid: p.uid, gx, gy });
        if (ok) {
          r.fuzzAccepted++;
          if (before !== "") fail(`fuzz: preview said "${before}" but the move was accepted`);
          if (check) checkLayoutInvariants(w, `fuzz move to (${gx},${gy})`);
        } else {
          r.fuzzRejected++;
          if (before === "") fail(`fuzz: preview said OK but the move was refused (${gx},${gy})`);
        }
      }
    }
    if (editPhase === 2 && t === editT + 1200) {
      act({ type: "edit", on: false });
      editPhase = 3;
      r.seatsAfterFuzz = w.seats.length;
    }

    // ── a second arrange session, to put the unlocked DOMAIN piece down ────
    if (editPhase === 3 && unlockT >= 0 && t === unlockT + 600) {
      act({ type: "edit", on: true });
      editPhase = 4;
    }
    if (editPhase === 4 && t === unlockT + 1200) {
      // find any legal cell for it rather than assuming the fuzzed room's shape
      for (let gy = 0; gy < SHELL.h && !r.domainPiecePlaced; gy++) {
        for (let gx = 0; gx < SHELL.w && !r.domainPiecePlaced; gx++) {
          if (previewPlace(w, SHELL, DOMAIN_TABLE, gx, gy) === "") {
            r.domainPiecePlaced = act({ type: "place", itemId: DOMAIN_TABLE, gx, gy });
          }
        }
      }
      if (check) checkLayoutInvariants(w, "placing a domain-collection table");
      act({ type: "edit", on: false });
      editPhase = 5;
    }

    stepWorld(w, SHELL);

    if (w.entities.filter((e) => e.kind === "waiter" && e.state !== "clockOut").length >= 2) {
      r.sawTwoWaiters = true;
    }
    if (w.entities.filter((e) => e.kind === "chef" && e.state !== "clockOut").length >= 2) {
      r.sawTwoChefs = true;
    }
    if (deriveService(w).night) r.sawNight = true;
    // ── ADR-0106: upgrade a dish the moment the pantry can afford it ───────
    for (const key of ["margherita", "caciopepe", "tiramisu", "special"]) {
      if (canUpgradeDish(w, key) && applyAction(w, SHELL, { type: "upgradeDish", key })) {
        r.upgrades += 1;
      }
    }
    // the player pitches in: sweep the first litter and fix the first break
    if (w.stats.trashSweptByPlayer === 0 && w.trash.length > 0) {
      applyAction(w, SHELL, { type: "sweep", trashId: w.trash[0].id });
    }
    if (w.stats.toiletFixedByPlayer === 0) {
      const broken = w.toilets.find((x) => x.broken);
      if (broken) applyAction(w, SHELL, { type: "fixToilet", uid: broken.uid });
    }
    r.maxTrash = Math.max(r.maxTrash, w.trash.length);
    r.maxVolumeDropsInADay = Math.max(r.maxVolumeDropsInADay, w.pantry.volumeDrops);
    r.maxRareDropsInADay = Math.max(r.maxRareDropsInADay, w.pantry.rareDrops);
    r.qualityFromDishes = Math.max(r.qualityFromDishes, qualityParts(w).dishes);

    const waiting = w.entities.filter((e) => e.state === "wait" || e.state === "toBench").length;
    if (waiting > r.maxWaiting) r.maxWaiting = waiting;
    if (w.benches.some((b) => b.slots.every((s) => s !== 0))) r.sawBenchOverflow = true;
    if (!check) continue;

    for (const e of w.entities) {
      // nobody may stand inside furniture (layout vs bodies)
      if (e.y >= 0 && e.y < SHELL.h && e.x >= -0.5 && e.x < SHELL.w) {
        const gx = Math.round(e.x);
        const gy = Math.round(e.y);
        if (gx >= 0 && gy >= 0 && gx < SHELL.w && gy < SHELL.h) {
          if (w.grid.cells[gy * SHELL.w + gx] === 1) {
            fail(`${e.kind}#${e.id} stands inside solid furniture at (${gx},${gy}) state ${e.state} tick ${t}`);
          }
        }
      }
      const p = prev.get(e.id);
      if (p) {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const dPos = Math.hypot(dx, dy);
        const dWalk = e.walkDist - p.walkDist;

        if (dPos > effSpeed(e) * WORLD_FIXED_DT + 0.05) {
          fail(`teleport: ${e.kind}#${e.id} moved ${dPos.toFixed(4)} in one tick (state ${e.state}, tick ${t})`);
        }
        if (Math.abs(dPos - dWalk) > 0.05 + EPS) {
          fail(`slide: ${e.kind}#${e.id} dPos=${dPos.toFixed(4)} dWalk=${dWalk.toFixed(4)} (state ${e.state}, tick ${t})`);
        }
        if (dPos > 1e-9 && !LOCOMOTION.has(e.state) && !LOCOMOTION.has(p.state)) {
          fail(`motion without locomotion state: ${e.kind}#${e.id} "${p.state}"->"${e.state}" (tick ${t})`);
        }
        if (dPos <= 1e-9 && dWalk > 1e-9) {
          fail(`cycle advanced while still: ${e.kind}#${e.id} "${e.state}" (tick ${t})`);
        }
        if (dPos > 1e-9 && LOCOMOTION.has(e.state) && e.path.length > 0) {
          const wp = e.path[0];
          const tx = wp.x - e.x;
          const ty = wp.y - e.y;
          const ax = Math.abs(tx);
          const ay = Math.abs(ty);
          if (ax > ay * 1.5) {
            const want = tx > 0 ? "se" : "nw";
            if (e.heading !== want) fail(`heading mismatch: ${e.kind}#${e.id} wants ${want} faces ${e.heading} (tick ${t})`);
          } else if (ay > ax * 1.5) {
            const want = ty > 0 ? "sw" : "ne";
            if (e.heading !== want) fail(`heading mismatch: ${e.kind}#${e.id} wants ${want} faces ${e.heading} (tick ${t})`);
          }
        }
      }
      prev.set(e.id, { x: e.x, y: e.y, walkDist: e.walkDist, state: e.state });
    }
    for (const id of [...prev.keys()]) {
      if (!w.entities.some((e) => e.id === id)) prev.delete(id);
    }
  }
  return { w, r };
}

const t0 = performance.now();
const A = run("dk-m4a", true);
const t1 = performance.now();
const B = run("dk-m4a", false);
const C = run("dk-m4a-other", false);

const s = A.w.stats;
const svc = deriveService(A.w);
console.log(
  `coverage: arrived=${s.arrived} cooked=${s.cooked} served=${s.served} departed=${s.departed} ` +
  `dirtied=${s.dirtied} busedAuto=${s.busedAuto} gus=${s.gusVisits} hearts=${s.hearts} ` +
  `purchases=${s.purchases} placements=${s.placements} coinsFromPosition=${s.coinsFromPosition}`
);
console.log(
  `room: seats=${svc.seatsOpen} tables=${svc.openTables} stoves=${svc.stoves} ` +
  `hires=${A.w.hires.waiters}w/${A.w.hires.chefs}c layout=${A.w.layout.length} pieces ` +
  `inventory=${JSON.stringify(A.w.inventory)} coins=${A.w.playMoney} tier=${svc.tier.name}`
);
console.log(
  `tape: brokeRejected=${A.r.brokeRejected} bought=${A.r.bought.length}/${BUY_PLAN.length} ` +
  `placed=${A.r.placed} moved=${A.r.moved} rotated=${A.r.rotated} storeReplace=${A.r.storedAndReplaced}`
);
console.log(
  `refusals: overlap=${A.r.refusedOverlap} unowned=${A.r.refusedUnowned} doorSeal=${A.r.refusedSeal} ` +
  `editOutsideBlocked=${A.r.editBlockedOutside} floorClearedInEdit=${A.r.floorClearedInEdit}`
);
console.log(`fuzz: ${A.r.fuzzAccepted} accepted, ${A.r.fuzzRejected} refused (all previews agreed)`);
console.log(
  `collections: lockedBuyRefused=${A.r.lockedBuyRefused} unlockedOnDay=${A.r.daysToUnlock} ` +
  `boughtAfterUnlock=${A.r.unlockedBuyOk} placed=${A.r.domainPiecePlaced} ` +
  `marketSwitch=${A.r.marketSwitched} tenureKept=${A.r.tenureKeptAfterSwitch} ` +
  `lpDays=${JSON.stringify(A.w.lpDays)} market=${A.w.market}`
);

// service still works
if (s.arrived < 5) fail(`too few arrivals: ${s.arrived}`);
if (s.served < 3) fail(`too few serves: ${s.served}`);
if (s.departed < 2) fail(`too few departures: ${s.departed}`);
if (s.busedAuto < 1) fail("staff never auto-bused a table");
if (s.gusVisits < 1) fail("Gus never visited");
if (!A.r.sawNight) fail("night never arrived");
if (s.coinsFromPosition < 300) fail(`position income too low: ${s.coinsFromPosition}`);

// the economy
if (!A.r.brokeRejected) fail("the broke hire was not rejected");
if (A.r.bought.length !== BUY_PLAN.length) fail(`buy plan incomplete: ${A.r.bought.length}`);
if (!A.r.sawTwoWaiters) fail("second waiter never clocked in");
if (!A.r.sawTwoChefs) fail("second chef never clocked in");

// the layout engine
if (!A.r.editBlockedOutside) fail("a layout edit outside edit mode was ACCEPTED");
if (!A.r.floorClearedInEdit) fail("guests were still on the floor after entering edit mode");
if (A.r.placed !== 6) fail(`expected 6 placements in the arrange tape, got ${A.r.placed}`);
if (!A.r.moved) fail("the table move was refused");
if (!A.r.rotated) fail("the chair rotate was refused");
if (!A.r.storedAndReplaced) fail("store-then-replace failed");
if (!A.r.refusedOverlap) fail("placing onto an occupied tile was ACCEPTED");
if (!A.r.refusedUnowned) fail("placing an unowned item was ACCEPTED");
if (!A.r.refusedSeal) fail("sealing the door off was ACCEPTED");
if (A.r.fuzzAccepted < 3) fail(`fuzz accepted too few moves (${A.r.fuzzAccepted}) to prove anything`);
// the DELIBERATE arrangement must produce a working room: 3 tables x 2 chairs.
// (The fuzz afterwards scatters it on purpose — that run only has to stay
// VALID, which checkLayoutInvariants asserts after every accepted move.)
if (A.r.seatsAfterArrange < 6) {
  fail(`the arranged room had only ${A.r.seatsAfterArrange} seats, expected 6`);
}
console.log(`seats: ${A.r.seatsAfterArrange} after arranging, ${A.r.seatsAfterFuzz} after the fuzz scattered it`);
checkLayoutInvariants(A.w, "the end of the run");

// the pantry + quality v2 (ADR-0106)
const q = qualityParts(A.w);
console.log(
  `pantry: upgrades=${s.dishUpgrades} levels=${JSON.stringify(A.w.pantry.levels)} ` +
  `commons=${s.commonsDropped} rares=${s.raresDropped} stock=${JSON.stringify(A.w.pantry.stock)}`
);
console.log(
  `quality: base=${q.base} + presence=${q.presence.toFixed(1)} + dishes=${q.dishes} = ${q.total.toFixed(1)} ` +
  `(peak dish bonus ${A.r.qualityFromDishes})`
);
if (s.commonsDropped < 4) fail(`the pantry barely stocked: ${s.commonsDropped} commons`);
if (s.dishUpgrades < 1) fail("no dish was ever upgraded despite a stocked pantry");
if (A.r.maxVolumeDropsInADay > VOLUME_DROP_CAP) {
  fail(`trading dropped ${A.r.maxVolumeDropsInADay} commons in a day, cap is ${VOLUME_DROP_CAP}`);
}
if (A.r.maxRareDropsInADay > RARE_DROP_CAP) {
  fail(`${A.r.maxRareDropsInADay} rares dropped in a day, cap is ${RARE_DROP_CAP}`);
}
// rares are PLAY-EARNED: one can only ever come from a moment of great
// service, so they can never outnumber the hearts that produced them
if (s.raresDropped > s.hearts) {
  fail(`${s.raresDropped} rares from only ${s.hearts} hearts — rares leaked a non-play source`);
}
if (q.dishes > QUALITY_DISH_CAP) fail(`dish quality ${q.dishes} exceeds its cap ${QUALITY_DISH_CAP}`);
for (const [k, lv] of Object.entries(A.w.pantry.levels)) {
  if (lv < 1 || lv > MAX_DISH_LEVEL) fail(`dish ${k} sits at level ${lv}`);
}
for (const [id, n] of Object.entries(A.w.pantry.stock)) {
  if (n < 0) fail(`pantry went negative on ${id}: ${n}`);
}
// THE FIREWALL: no coin path may ever reach an ingredient (ADR-0043/0106)
{
  const before = { ...A.w.pantry.stock };
  const coins = A.w.playMoney;
  applyAction(A.w, SHELL, { type: "buyItem", itemId: "tomato" });
  applyAction(A.w, SHELL, { type: "buyItem", itemId: "saffron" });
  if (JSON.stringify(A.w.pantry.stock) !== JSON.stringify(before) || A.w.playMoney !== coins) {
    fail("coins bought an ingredient — the firewall leaked");
  }
}

// upkeep: cleanliness + restrooms (ADR-0106, M4e)
console.log(
  `upkeep: toiletPlaced=${A.r.toiletPlaced} breaks=${s.toiletBreaks} fixedAuto=${s.toiletFixedAuto} ` +
  `fixedByPlayer=${s.toiletFixedByPlayer} · litter dropped=${s.trashDropped} sweptAuto=${s.trashSweptAuto} ` +
  `maxOnFloor=${A.r.maxTrash} · bestQuality=${A.w.stats.bestQuality.toFixed(1)}`
);
if (!A.r.toiletPlaced) fail("the restroom was never placed");
if (s.trashDropped < 3) fail(`litter barely appeared: ${s.trashDropped}`);
if (s.trashSweptAuto < 1) fail("staff never swept a bit of litter on their own");
if (A.r.maxTrash > TRASH_VISIBLE_CAP) {
  fail(`litter reached ${A.r.maxTrash} on the floor, cap is ${TRASH_VISIBLE_CAP}`);
}
if (s.toiletBreaks < 1) fail("the restroom never broke in 70 game-hours");
if (s.toiletFixedAuto < 1) fail("staff never fixed the restroom on their own");
if (s.trashSweptByPlayer < 1) fail("the player-sweep action never landed");
if (s.toiletFixedByPlayer < 1) fail("the player-fix action never landed");
if (A.w.stats.bestQuality > 100) fail(`bestQuality ${A.w.stats.bestQuality} exceeds 100`);
if (q.cleanliness > CLEAN_MAX + 1e-9) fail(`cleanliness ${q.cleanliness} exceeds its cap ${CLEAN_MAX}`);

// THE AFK GATE (ADR-0102/0106): a room left entirely alone must still look
// after itself. No player actions at all, and quality must never sag under
// the kind baseline.
{
  // funded so it can actually own the restroom it is meant to look after
  const afk = createWorld("dk-afk", SHELL, {
    parkedUsd: 120,
    weeklyVolumeUsd: 200,
    playMoney: 500,
  });
  applyAction(afk, SHELL, { type: "edit", on: true });
  applyAction(afk, SHELL, { type: "buyItem", itemId: "toilet_basic" });
  applyAction(afk, SHELL, { type: "place", itemId: "toilet_basic", gx: 9, gy: 0 });
  applyAction(afk, SHELL, { type: "edit", on: false });
  let minQ = 100;
  let maxLitter = 0;
  for (let t = 0; t < 60 * 60 * 20; t++) {
    stepWorld(afk, SHELL);
    minQ = Math.min(minQ, qualityParts(afk).total);
    maxLitter = Math.max(maxLitter, afk.trash.length);
  }
  const AFK_FLOOR = 50;
  console.log(
    `AFK soak (20 real-min, zero input): quality never below ${minQ.toFixed(1)}, ` +
    `max litter ${maxLitter}, breaks=${afk.stats.toiletBreaks} fixed=${afk.stats.toiletFixedAuto}, ` +
    `served=${afk.stats.served}`
  );
  if (minQ < AFK_FLOOR) {
    fail(`an untouched room sagged to quality ${minQ.toFixed(1)}, below the kind floor ${AFK_FLOOR}`);
  }
  if (maxLitter >= TRASH_VISIBLE_CAP) {
    fail(`an untouched room let litter reach ${maxLitter} — absence must never read as filth`);
  }
  if (afk.stats.trashSweptByPlayer > 0 || afk.stats.toiletFixedByPlayer > 0) {
    fail("the AFK soak somehow performed player actions");
  }
  if (afk.toilets.length !== 1) fail("the AFK room never got its restroom placed");
  if (afk.stats.toiletBreaks < 1) fail("the AFK restroom never broke, so upkeep went untested");
  if (afk.stats.toiletFixedAuto < afk.stats.toiletBreaks - 1) {
    fail(`AFK staff fixed only ${afk.stats.toiletFixedAuto} of ${afk.stats.toiletBreaks} breaks`);
  }
}

// the waiting area (ADR-0107)
console.log(
  `waiting: benchPlaced=${A.r.benchPlaced} maxWaiting=${A.r.maxWaiting} benchFull=${A.r.sawBenchOverflow} ` +
  `waited=${s.waited} seatedFromBench=${s.seatedFromBench} leftWaiting=${s.leftWaiting} turnedAway=${s.turnedAway}`
);
if (!A.r.benchPlaced) fail("the waiting bench was never placed");
if (s.waited < 1) fail("no guest ever waited on the bench");
if (s.seatedFromBench < 1) fail("no waiting guest was ever seated when a table freed");
if (A.r.maxWaiting < 1) fail("the waiting area was never occupied");
// benches hold at most their slots, and a bench slot is never double-booked
for (const b of A.w.benches) {
  const taken = b.slots.filter((x) => x !== 0);
  if (new Set(taken).size !== taken.length) fail(`bench uid ${b.uid} double-booked a slot`);
  for (const id of taken) {
    const e = A.w.entities.find((x) => x.id === id);
    if (e && e.state !== "wait" && e.state !== "toBench") {
      fail(`bench uid ${b.uid} still holds ${e.kind}#${e.id} in state ${e.state}`);
    }
  }
}
// nobody sits in two places at once
const seatIds = A.w.seats.map((x) => x.occupiedBy).filter((x) => x !== 0);
const benchIds = A.w.benches.flatMap((b) => b.slots).filter((x) => x !== 0);
for (const id of benchIds) {
  if (seatIds.includes(id)) fail(`guest#${id} holds a table seat AND a bench slot`);
}

// domain collections + the LP-tenure gate (ADR-0105)
if (!A.r.lockedBuyRefused) fail("a domain piece was buyable with NO liquidity tenure");
if (A.r.daysToUnlock !== COLLECTION_LP_DAYS) {
  fail(`collection unlocked on day ${A.r.daysToUnlock}, expected day ${COLLECTION_LP_DAYS}`);
}
if (!A.r.unlockedBuyOk) fail("the domain piece was still refused after tenure was earned");
if (!A.r.domainPiecePlaced) fail("the unlocked domain piece never made it into the room");
if (!A.r.marketSwitched) fail("switching markets was refused");
if (!A.r.tenureKeptAfterSwitch) fail("banked tenure was lost when switching markets");
if (!A.w.layout.some((p) => p.itemId.startsWith(MARKETS[0].collection))) {
  fail("no domain-collection piece in the final layout");
}
// the firewall: an unearned collection stays unbuyable
if (itemPurchasable(A.w, `${MARKETS[1].collection}_table`) && lpDaysAt(A.w, MARKETS[1].id) < COLLECTION_LP_DAYS) {
  fail("the second market's collection is purchasable without its own tenure");
}

// determinism
const ha = hashWorld(A.w);
const hb = hashWorld(B.w);
const hc = hashWorld(C.w);
console.log(`hash same-seed+tape: ${ha} vs ${hb} -> ${ha === hb ? "MATCH" : "MISMATCH"}`);
console.log(`hash other-seed: ${hc} -> ${hc !== ha ? "DIFFERS (good)" : "SAME (bad)"}`);
if (ha !== hb) fail("determinism: same seed + same tape diverged");
if (hc === ha) fail("determinism: different seed identical");

const ms = t1 - t0;
console.log(`perf: ${TICKS} ticks in ${ms.toFixed(1)}ms (${Math.round(TICKS / (ms / 1000)).toLocaleString()} ticks/sec)`);

if (failures > 0) {
  console.error(`harness FAIL (${failures} assertion${failures === 1 ? "" : "s"})`);
  process.exit(1);
}
console.log("harness PASS");
