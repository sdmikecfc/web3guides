import assert from "node:assert/strict";
import { BEGINNER_OFFERS, BEGINNER_ORDER, STYLE_BEGINNER_OFFERS, beginnerOrderFor, gameCard } from "../src/lib/bots/beginner-catalog";
import { freshGameDemo, demoWelcome, demoBuy, demoFinish, readGameDemo, demoSave } from "../src/lib/bots/game-demo";
import { draftPreview, parseDraftOffers } from "../src/lib/bots/onboarding-draft";
import { parsePracticeDraft, practiceDraftOf } from "../src/lib/bots/practice-handoff";
import { EQUIPMENT_KIND, socketsOf, equipmentPaints, withSockets } from "../src/lib/bots/equipment";
import { engineBuild, starterBuild, type Socket, type OwnedPart } from "../src/lib/bots/fixtures";
import { styleCardOf, STYLE_CATALOG } from "../src/lib/bots/style-catalog";
import { FIGHTING_STYLES } from "../src/lib/bots/style-guide";
import { buildStatsForUI, styleRobotPreviewHref, styleAssemblyIssue } from "../src/lib/bots/style-preview";
import { styleShipmentFor, STYLE_LISTING_ID_RE } from "../src/lib/bots/style-shipment";
import { shipmentFor, type Listing } from "../src/lib/bots/shipment";
import { compareShopPart } from "../src/lib/bots/shop-comparison";
import { statsV5, snapshotBuildV5 } from "../src/lib/bots/v5";
import { NO_LOOK, NO_MARKS } from "../src/lib/bots/look";

let checks = 0;
const pass = (message: string) => { checks++; console.log(`PASS ${message}`); };
const starter = (socket: Socket, style = "tank") => STYLE_BEGINNER_OFFERS.find(o => o.part.slot === EQUIPMENT_KIND[socket] && styleCardOf(o.id)?.style === style)!;
assert.equal(BEGINNER_OFFERS.length, 40);
assert(BEGINNER_OFFERS.every(o => o.part.s.join() === "1,1,1" && o.id.startsWith("beginner.v1.")));
assert.equal(STYLE_BEGINNER_OFFERS.length, 15);
for (const slot of ["torso", "head", "arms", "legs", "weapon"]) {
  const cards = STYLE_BEGINNER_OFFERS.filter(o => o.part.slot === slot);
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map(c => c.part.s.join())).size, 3, `${slot} offers real style differences`);
  for (const card of cards) {
    assert.deepEqual([...card.part.s].sort(), [0, 1, 2]);
    assert.deepEqual(gameCard(card.id)?.s, card.part.s);
    assert.equal(card.color, slot === "weapon" ? null : styleCardOf(card.id)?.color);
  }
}
assert.equal(beginnerOrderFor(2)[0], "torso");
assert.equal(BEGINNER_ORDER.reduce((total, s) => total + starter(s).price, 0), 250);
pass("15 differentiated equal-budget starters; old 40 cards immutable; body-first seven choices cost 250");

for (const style of FIGHTING_STYLES) {
  let state = demoWelcome(freshGameDemo(2, 2));
  assert.equal(state.parts.length, 0);
  assert.equal(state.onboarding.nextSocket, "torso");
  for (const socket of beginnerOrderFor(2)) state = demoBuy(state, socket, starter(socket, style).id);
  assert.equal(state.coins, 250);
  assert.equal(state.onboarding.step, "shop");
  const prior = JSON.stringify(socketsOf(state.builds[0]));
  const finished = demoFinish(state);
  assert.equal(finished.coins, 0);
  assert.equal(finished.parts.length, 7);
  assert.equal(finished.builds.length, 1);
  assert.equal(JSON.stringify(socketsOf(finished.builds[0])), prior);
  assert.equal(demoFinish(finished), finished);
  assert.equal(demoBuy(finished, "torso", starter("torso", style === "tank" ? "speed" : "tank").id), finished);
  assert.equal(snapshotBuildV5(engineBuild(finished.builds[0], finished.parts)).style, style);
  assert.deepEqual(buildStatsForUI(finished.builds[0], finished.parts), statsV5(engineBuild(finished.builds[0], finished.parts)));
  assert.deepEqual(readGameDemo(JSON.stringify(finished), 2), finished);
  const corrupted = JSON.parse(JSON.stringify(finished)); corrupted.coins = 999999; corrupted.parts.forEach((p: OwnedPart) => { p.s = [12, 12, 12]; });
  assert.deepEqual(readGameDemo(JSON.stringify(corrupted), 2), finished);
  assert.equal(practiceDraftOf(finished, finished.builds[0])?.catalogueVersion, 2);
}
pass("all three styles finish once with exact stats, immutable parts, matching preview/fight totals, safe hydration and no imported money");

let mixed = demoWelcome(freshGameDemo(2, 2));
mixed = demoBuy(mixed, "torso", starter("torso", "ranged").id);
mixed = demoBuy(mixed, "head", starter("head", "tank").id);
const partial = practiceDraftOf(mixed, mixed.builds[0]);
assert(partial && partial.catalogueVersion === 2 && !partial.complete);
assert.deepEqual(parsePracticeDraft(partial), partial);
assert.equal(parsePracticeDraft({ ...partial, catalogueVersion: 1 }), null);
assert.equal(parseDraftOffers(partial.offers, 1), null);
assert.equal(demoBuy(mixed, "armL", BEGINNER_OFFERS.find(o => o.part.slot === "arms")!.id), mixed);
for (const s of ["armL", "armR", "legL", "legR"] as const) mixed = demoBuy(mixed, s, starter(s, s.endsWith("L") ? "speed" : "tank").id);
const bodyBefore = JSON.stringify(mixed.onboarding.draftOffers);
mixed = demoBuy(mixed, "weapon", starter("weapon", "ranged").id);
const noWeapon = { ...mixed.onboarding.draftOffers, weapon: null };
assert.equal(JSON.stringify(noWeapon), bodyBefore);
mixed = demoSave(mixed, { ...mixed.builds[0], name: { first: "Tiny", second: "Biscuit", num: 8 } });
const complete = demoFinish(mixed);
assert.equal(complete.builds[0].name.num, 8);
assert.equal(snapshotBuildV5(engineBuild(complete.builds[0], complete.parts)).style, "ranged");
const encoded = new URL(styleRobotPreviewHref(engineBuild(complete.builds[0], complete.parts), { look: NO_LOOK, marks: NO_MARKS, paints: equipmentPaints(complete.builds[0], complete.parts), wins: 0 }), "http://localhost");
assert.deepEqual(JSON.parse(encoded.searchParams.get("robot")!), engineBuild(complete.builds[0], complete.parts));
assert.deepEqual(draftPreview(mixed.onboarding).parts.map(p => p.s), mixed.parts.map(p => p.s));
pass("mixed limbs and final weapon preserve earlier choices; partial handoff keeps catalogue version and name; practice link keeps the exact robot");

const savedPublic = process.env.NEXT_PUBLIC_BOTS_STYLES_V1;
process.env.NEXT_PUBLIC_BOTS_STYLES_V1 = "1";
assert.equal(freshGameDemo(2).onboarding.catalogueVersion, 2);
for (const version of [1, 2] as const) {
  const old = demoWelcome(freshGameDemo(version, 1));
  const withoutVersion = JSON.parse(JSON.stringify(old)); delete withoutVersion.onboarding.catalogueVersion;
  const resumed = readGameDemo(JSON.stringify(withoutVersion), 2);
  assert.equal(resumed.version, version);
  assert.equal(resumed.onboarding.catalogueVersion ?? 1, 1);
  assert.equal(resumed.onboarding.offers[0].id, BEGINNER_OFFERS[0].id);
  assert.equal(resumed.parts.length, old.parts.length);
}
if (savedPublic === undefined) delete process.env.NEXT_PUBLIC_BOTS_STYLES_V1; else process.env.NEXT_PUBLIC_BOTS_STYLES_V1 = savedPublic;
pass("flag-on enrollment uses new offers; old saved v1 and v2 drafts keep the legacy catalogue");

const legacyBefore = JSON.stringify(shipmentFor("2026-09-12"));
const found = new Set<string>();
for (let day = 0; day < 105; day++) {
  const date = new Date(Date.UTC(2026, 8, 7 + day)).toISOString().slice(0, 10), shipment = styleShipmentFor(date, day);
  assert.deepEqual(styleShipmentFor(date, day), shipment);
  assert.equal(shipment.listings.length, 16);
  assert.deepEqual(Object.values(shipment.rows).map(r => r.length).sort(), [1, 3, 3, 3, 6]);
  assert(shipment.listings.every(l => STYLE_LISTING_ID_RE.test(l.id) && gameCard(l.partKey)?.price === l.price));
  for (const style of FIGHTING_STYLES) {
    assert.equal(shipment.rows.t1.filter(l => styleCardOf(l.partKey)?.style === style).length, 2);
    assert.equal(shipment.rows.rack.filter(l => styleCardOf(l.partKey)?.style === style).length, 1);
    assert.equal(shipment.rows.t2.filter(l => styleCardOf(l.partKey)?.style === style).length, 1);
    assert.equal(shipment.rows.t3.filter(l => styleCardOf(l.partKey)?.style === style).length, 1);
  }
  shipment.listings.forEach(l => found.add(l.partKey));
}
assert.equal(JSON.stringify(shipmentFor("2026-09-12")), legacyBefore);
assert(STYLE_CATALOG.every(c => found.has(c.id)), "rotation offers every canonical tier/style/slot and paired weapon");
pass("105 deterministic daily shelves keep 16 approved listings, every style's weapon, full catalogue coverage and unchanged old shipments");

const snapshot = JSON.stringify(complete), torso = STYLE_CATALOG.find(c => c.style === "ranged" && c.tier === 3 && c.slot === "torso")!;
const listing: Listing = { id: "test", row: "t3", partKey: torso.id, tier: 3, slot: "torso", color: "sky", price: torso.price, needsLevel: 5, dayColor: true, card: torso };
const comparison = compareShopPart(complete.builds[0], complete.parts, listing);
assert(comparison.capabilities.find(c => c.key === "special-effect")?.changed);
assert.equal(comparison.capabilities.find(c => c.key === "special-effect")?.after, torso.special?.description);
assert.equal(comparison.capabilities.find(c => c.key === "special")?.after, torso.special?.name);
assert.equal(comparison.capabilities.find(c => c.key === "upgrade")?.after, "Unlocked");
assert.deepEqual(comparison.totals.map(s => s.after), Object.keys(statsV5(engineBuild(comparison.build, comparison.parts))).map(k => statsV5(engineBuild(comparison.build, comparison.parts))[k as keyof ReturnType<typeof statsV5>]));
const arm = STYLE_CATALOG.find(c => c.style === "ranged" && c.tier === 2 && c.slot === "arms")!;
for (const target of ["armL", "armR"] as const) {
  const p = compareShopPart(complete.builds[0], complete.parts, { ...listing, partKey: arm.id, card: arm, slot: "arms", tier: 2, price: arm.price }, target);
  for (const s of BEGINNER_ORDER) if (s !== target) assert.equal(socketsOf(p.build)[s], socketsOf(complete.builds[0])[s]);
  assert(p.totals.every(s => s.after === statsV5(engineBuild(p.build, p.parts))[s.key]));
}
assert.equal(JSON.stringify(complete), snapshot);
pass("shop comparisons match v5 aggregation, preserve the opposite limb and inventory, and report the actual Tier 3 special unlock");

const oldSpares: OwnedPart[] = BEGINNER_ORDER.map(socket => ({
  ...BEGINNER_OFFERS.find(o => o.part.slot === EQUIPMENT_KIND[socket])!.part,
  uid: `spare-old-${socket}`, provenance: "Earlier spare",
}));
const styledSpares = ["torso", "arms"].map(slot => ({
  ...STYLE_BEGINNER_OFFERS.find(o => o.part.slot === slot)!.part,
  uid: `spare-style-${slot}`, provenance: "New spare",
}));
const spareState = { ...complete, parts: [...complete.parts, ...oldSpares, ...styledSpares], builds: [...complete.builds, starterBuild(2)] };
const legacySockets = Object.fromEntries(BEGINNER_ORDER.map(socket => [socket, `spare-old-${socket}`])) as ReturnType<typeof socketsOf>;
const compatible = withSockets(starterBuild(2), { ...legacySockets, torso: "spare-style-torso" });
assert.equal(styleAssemblyIssue(compatible, spareState.parts), null);
assert.equal(snapshotBuildV5(engineBuild(compatible, spareState.parts)).style, "tank");
const savedMixed = demoSave(spareState, compatible);
assert.equal(savedMixed.parts, spareState.parts);
assert.equal(savedMixed.coins, spareState.coins);
assert.equal(savedMixed.builds[1], compatible);
assert.deepEqual(buildStatsForUI(compatible, spareState.parts), statsV5(engineBuild(compatible, spareState.parts)));
assert.equal(demoSave(savedMixed, withSockets(compatible, { ...socketsOf(compatible), head: null })), savedMixed);
const incompatible = withSockets(starterBuild(2), { ...legacySockets, armL: "spare-style-arms" });
assert(styleAssemblyIssue(incompatible, spareState.parts));
assert.equal(demoSave(spareState, incompatible), spareState);
const partialStyled = withSockets(incompatible, { ...socketsOf(incompatible), torso: null });
const savedPartial = demoSave(spareState, partialStyled);
assert.equal(savedPartial.builds[1], partialStyled);
assert.equal(demoSave(savedPartial, incompatible), savedPartial);
const wrongComparison = compareShopPart(withSockets(starterBuild(2), legacySockets), spareState.parts, { ...listing, partKey: arm.id, card: arm, slot: "arms", tier: 2, price: arm.price }, "armL");
assert(wrongComparison.assemblyIssue, "mixed legacy body comparison explains the required body instead of claiming valid style totals");
pass("new styled bodies accept older spares, empty-body drafts persist, incompatible legacy bodies cannot lock, and finished mixed robots stay permanent without money changes");
console.log(`${checks} styled onboarding/shop integration groups passed.`);
