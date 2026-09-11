import assert from "node:assert/strict";
import { cardV6, presetV6, snapshotBuildV6, statsV6 } from "../src/lib/bots/v6";
import { BUILD_ORDER, collectionBuildQuote, emptySeasonDraft, readSeasonDraft, seasonComparison, seasonDraftSummary, seasonHeroStill, trySeasonPart } from "../src/lib/bots/season/workshop";
import { clearFightQuery, fightRoomHref } from "../src/lib/bots/fight-navigation";
import type { SeasonDraft } from "../src/lib/bots/season/types";

let checks = 0;
const pass = (name: string) => { checks++; console.log(`PASS ${name}`); };
const asDraft = (style: "tank" | "speed" | "ranged", tier: 1 | 2 | 3 | 4): SeasonDraft => { const build = presetV6(style, tier); return { revision: 9, name: "Tiny & Mighty", defensePlan: "balanced", parts: Object.fromEntries(BUILD_ORDER.map(s => [s, build.parts[s].id])) }; };

for (const style of ["tank", "speed", "ranged"] as const) {
  const draft = asDraft(style, 1), summary = seasonDraftSummary(draft);
  assert(summary.complete); assert.equal(summary.price, 250); assert.equal(summary.stats.gp, 100);
  assert.deepEqual(summary.stats, snapshotBuildV6(summary.build).stats);
  assert.deepEqual(summary.stats, statsV6(presetV6(style, 1).appearanceBuild));
}
pass("Every starter style costs 250, totals 100 GP and matches the fight snapshot’s actual stats");

const mixed = trySeasonPart(asDraft("tank", 1), "armL", cardV6("mk6.t1.owl_ranger.arms")!);
const original = JSON.parse(JSON.stringify(mixed)), change = seasonComparison(mixed, "armR", cardV6("mk6.t1.roller_daredevil.arms")!);
assert.deepEqual(mixed, original); assert.equal(change.afterDraft.parts.armL, mixed.parts.armL);
assert.equal(change.afterDraft.parts.armR, "mk6.t1.roller_daredevil.arms");
assert(change.deltas.some(v => v.change !== 0)); assert.deepEqual(change.after.stats, snapshotBuildV6(change.after.build).stats);
assert.equal(change.gp, 0); assert.equal(change.coins, 0);
pass("Independent left/right try-ons preserve the original build and use actual aggregate deltas");

const weapon = trySeasonPart(mixed, "weapon", cardV6("mk6.t1.weapon.ap_rifle")!);
for (const socket of BUILD_ORDER.filter(s => s !== "weapon")) assert.equal(weapon.parts[socket], mixed.parts[socket]);
assert.throws(() => trySeasonPart(mixed, "head", cardV6("mk6.t1.weapon.hammer")!));
const incompatible = trySeasonPart(asDraft("speed", 3), "weapon", cardV6("mk6.t3.signature.piledriver")!);
assert.equal(seasonDraftSummary(incompatible).complete, false); assert.match(seasonDraftSummary(incompatible).compatibility.reason!, /Tank/);
assert.equal(incompatible.parts.torso, "mk6.t3.roller_daredevil.torso");
pass("Last weapon never replaces body parts; incompatible signatures remain explicit instead of auto-changing the robot");

const partial = readSeasonDraft(JSON.stringify({ ...emptySeasonDraft(), name: "My first robot", parts: { torso: "mk6.t1.boiler_knight.torso", armL: "mk6.t1.owl_ranger.arms", head: "mk6.t1.weapon.hammer", armR: "beginner.v1.1", coins: 999999 }, defensePlan: "last-stand", coins: 999999, revision: 99 }));
assert(partial); assert.deepEqual(partial.parts, { torso: "mk6.t1.boiler_knight.torso", armL: "mk6.t1.owl_ranger.arms" });
assert.equal(partial.revision, 0); assert.equal("coins" in partial, false); assert.equal(partial.defensePlan, "last-stand");
assert.equal(readSeasonDraft('{"name":"x","parts":{},"defensePlan":"cheat"}'), null);
assert.equal(seasonDraftSummary(emptySeasonDraft()).count, 0);
pass("Browser drafts accept only canonical slot choices, never balances, old catalogue IDs or server revisions");

const archivedDraft = asDraft("tank", 1), freshQuote = collectionBuildQuote(archivedDraft, []);
assert.equal(freshQuote.coins, 200); assert.equal(freshQuote.missing.length, 5);
const archived = [{ seasonId: "past", name: "Past season", coins: 500, spendable: 500, correctionDue: 0, parts: [archivedDraft.parts.armL!, archivedDraft.parts.legR!], botCount: 4 }];
assert.equal(collectionBuildQuote(archivedDraft, archived).coins, 150);
const allOwned = [{ ...archived[0], parts: Object.values(archivedDraft.parts) as string[] }];
assert.equal(collectionBuildQuote(archivedDraft, allOwned).coins, 0); assert.equal(collectionBuildQuote(archivedDraft, allOwned).missing.length, 0);
pass("Archived builds reuse designs across collections and charge each missing design only once");

const hero = presetV6("tank", 3, { signature: true });
assert.equal(seasonHeroStill(hero), "/bots-art/3d/season-v6/tank-three-quarter.png");
assert.equal(seasonHeroStill(presetV6("tank", 1)), null);
assert.equal(seasonHeroStill({ parts: { ...hero.parts, head: presetV6("speed", 3).parts.head } }), null);
assert.equal(seasonHeroStill(presetV6("tank", 3, { weapon: "shotgun_wide" })), null);
pass("Only an exact authored hero gets its still; mixed bodies, unreviewed tiers and different weapons never borrow another robot's picture");

const name = "Tiny & Mighty + 7?", raw = JSON.stringify(presetV6("ranged", 3).appearanceBuild);
const href = fightRoomHref(6, { robot: raw, name, seed: "75", session: "test/id" }), query = new URL(href, "http://test").searchParams;
assert.equal(query.get("robot"), raw); assert.equal(query.get("name"), name); assert.equal(query.get("session"), "test/id"); assert.equal(query.get("combat"), "6");
query.set("collection", "classic"); query.set("replay", "saved"); clearFightQuery(query);
assert.equal(query.get("collection"), "classic"); for (const key of ["combat", "robot", "name", "session", "replay"]) assert.equal(query.has(key), false);
pass("Fight links preserve exact identity and room navigation clears fight state without clearing collection choice");
console.log(`${checks} season workshop checks passed.`);
