import assert from "node:assert/strict";
import { CATALOG_PARTS, SLOT_STATS, engineBuild, starterBuild, type OwnedPart, type Socket } from "../src/lib/bots/fixtures";
import { EQUIPMENT_KIND, EQUIPMENT_SOCKETS, socketsOf, withSockets } from "../src/lib/bots/equipment";
import { aggregates } from "../src/lib/bots/combat";
import { compareShopPart } from "../src/lib/bots/shop-comparison";
import { shipmentFor, type Listing } from "../src/lib/bots/shipment";

const family = CATALOG_PARTS.find(p => p.slot === "head")!.family;
const parts: OwnedPart[] = EQUIPMENT_SOCKETS.map(socket => {
  const card = CATALOG_PARTS.find(p => p.slot === EQUIPMENT_KIND[socket] && (p.slot === "weapon" || p.family === family))!;
  return { ...card, uid: `owned:${socket}`, provenance: "Test", ...(socket !== "weapon" ? { paint: "mint" as const } : {}) };
});
const build = withSockets(starterBuild(1), Object.fromEntries(EQUIPMENT_SOCKETS.map((socket, i) => [socket, parts[i].uid])) as Record<Socket, string>);
const unchanged = JSON.stringify({ build, parts });
const arm = parts.find(p => p.uid === socketsOf(build).armL)!;
const source = shipmentFor("2026-09-09").listings.find(l => l.slot === "arms")!;
const same: Listing = { ...source, slot: "arms", card: arm, color: "mint", partKey: arm.id, tier: arm.tier };

const identical = compareShopPart(build, parts, same, "armL");
assert(identical.partStats.every(s => s.delta === 0));
assert(identical.totals.every(s => s.delta === 0), "same part and paint preserves all matching-set bonuses");
assert.equal(identical.build.sockets!.armR, build.sockets!.armR, "a left arm comparison never replaces the right arm");

const painted = compareShopPart(build, parts, { ...same, color: "butter" }, "armR");
assert(painted.partStats.every(s => s.delta === 0), "paint never invents raw part stats");
assert(painted.totals.every(s => s.delta === -1), "breaking only the colour set removes one point from every fight stat");
assert.equal(painted.build.sockets!.armL, build.sockets!.armL);

const otherArm = CATALOG_PARTS.find(p => p.slot === "arms" && p.family !== family)!;
const mixed = compareShopPart(build, parts, { ...same, card: otherArm, partKey: otherArm.id }, "armR");
const actual = aggregates(engineBuild(mixed.build, mixed.parts));
for (const stat of mixed.totals) assert.equal(stat.after, actual[stat.key]);
assert.equal(mixed.totals.find(s => s.key === "health")!.delta, -2, "breaking family alone changes untouched body stats through the real set bonus");

const draft = withSockets(starterBuild(2), { ...socketsOf(starterBuild(2)), armR: parts.find(p => p.slot === "arms")!.uid });
const draftPreview = compareShopPart(draft, parts, same, "armL");
assert.equal(draftPreview.previous, undefined);
assert.equal(draftPreview.build.sockets!.armR, draft.sockets!.armR);
assert.equal(Object.values(draftPreview.build.sockets!).filter(Boolean).length, 2);

const rightUid = "owned:different-right";
const asymmetric = withSockets(build, { ...socketsOf(build), armR: rightUid });
const asymmetricParts = [...parts, { ...otherArm, uid: rightUid, paint: "mint" as const, provenance: "Test" }];
assert.notDeepEqual(compareShopPart(asymmetric, asymmetricParts, same, "armL").partStats, compareShopPart(asymmetric, asymmetricParts, same, "armR").partStats, "left and right read the actual chosen item");

const legacy = { ...build, sockets: undefined };
const legacyPreview = compareShopPart(legacy, parts, same, "armR");
assert(legacyPreview.totals.every(s => s.delta === 0), "older paired robots compare without a false set or stat change");
const collision = [...parts, { ...arm, uid: identical.parts.at(-1)!.uid }];
const collisionPreview = compareShopPart(build, collision, same, "armL");
assert.equal(new Set(collisionPreview.parts.map(p => p.uid)).size, collisionPreview.parts.length);

let comparisons = 0;
for (const date of ["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"]) {
  for (const listing of shipmentFor(date).listings) {
    for (const socket of EQUIPMENT_SOCKETS.filter(s => EQUIPMENT_KIND[s] === listing.slot)) {
      const preview = compareShopPart(build, parts, listing, socket);
      const raw = parts.find(p => p.uid === socketsOf(build)[socket])!;
      for (const [index, stat] of Array.from(preview.partStats.entries())) {
        assert.equal(stat.key, SLOT_STATS[listing.slot][index]);
        assert.equal(stat.delta, listing.card.s[index] - raw.s[index]);
      }
      for (const s of EQUIPMENT_SOCKETS) if (s !== socket) assert.equal(socketsOf(preview.build)[s], socketsOf(build)[s]);
      assert(preview.totals.every(s => Number.isInteger(s.after) && s.after >= 0));
      comparisons++;
    }
  }
}
assert.equal(JSON.stringify({ build, parts }), unchanged, "inspection never changes ownership, saved builds, paint or currency");
console.log(`${comparisons} shop comparisons passed: both limb sides, empty draft slots, exact fight stats, colour/family bonuses, legacy pairs and immutable inventories.`);
