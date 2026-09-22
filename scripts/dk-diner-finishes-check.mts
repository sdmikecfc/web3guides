/** Local finish ownership and regular selection regressions; no browser or database. */
import assert from "node:assert/strict";
import { createDiner, dispatchDiner, homeSimulationConfig, sanitizeDinerSave, type DinerCommand, type DinerState } from "../src/lib/chef/diner/progression";
import { FINISH_RULES, finishPrice, regularAvailable, regularFavourite } from "../src/lib/chef/diner/collections";
import { createDinerRecord, replayDiner, DinerAuthorityError } from "../src/lib/chef/diner/authority";
import { createSocialProfile, publicDiner } from "../src/lib/chef/diner/social";
const now = Date.UTC(2026, 8, 20, 8);
const fresh = () => createDiner(now, "finish-check");
function action(state: DinerState, command: DinerCommand) { const result = dispatchDiner(state, command, { now }); assert.equal(result.error, undefined, `${command.type}: ${result.error}`); return result.state; }
function rejected(state: DinerState, command: DinerCommand, code: string) { const result = dispatchDiner(state, command, { now }); assert.equal(result.code, code); assert.deepEqual(result.state, state); }
let groups = 0; const test = (name: string, run: () => void) => { run(); groups++; console.log(`ok ${name}`); };

test("Mr Bell accepts the mastered dish on the current menu, independent of acquisition order", () => {
  const state = fresh(); state.recipes.classic_burger.level = 10; state.recipes.coffee = { level: 10 };
  state.home.menu = { starter: [], main: [], drink: ["coffee"], dessert: [] };
  assert.equal(regularFavourite(state, "mr_bell"), "coffee"); assert.equal(regularAvailable(state, "mr_bell"), true);
  state.home.menu.drink = []; assert.equal(regularAvailable(state, "mr_bell"), false);
  state.home.menu.main = ["classic_burger"]; assert.equal(regularFavourite(state, "mr_bell"), "classic_burger");
  state.recipes.classic_burger.level = 9; assert.equal(regularAvailable(state, "mr_bell"), false);
  assert.equal(regularFavourite(state, "old_pete"), "classic_burger");
});
test("new diners own only the default floor and wall and cannot apply a locked finish", () => {
  const state = fresh(); assert.deepEqual(state.finishOwned, { floor: ["checker"], wall: ["cream"] });
  rejected(state, { type: "setCosmetic", slot: "floor", id: "terracotta" }, "finish_not_owned");
  rejected(state, { type: "setCosmetic", slot: "wall", id: "mint" }, "finish_not_owned");
  assert.equal(finishPrice("floor", "terracotta"), FINISH_RULES.prices.floor.terracotta);
});
test("purchase applies once, survives reload, and switching away and back is free", () => {
  const before = fresh(), coins = before.coins, rates = homeSimulationConfig(before);
  let state = action(before, { type: "buyFinish", slot: "floor", id: "terracotta" });
  assert.equal(state.coins, coins - FINISH_RULES.prices.floor.terracotta); assert.equal(state.cosmetics.floor, "terracotta");
  assert.equal(before.cosmetics.floor, "checker"); assert.deepEqual(homeSimulationConfig(state), rates);
  state = sanitizeDinerSave(JSON.stringify(state))!; assert.ok(state);
  state = action(state, { type: "setCosmetic", slot: "floor", id: "checker" });
  state = action(state, { type: "buyFinish", slot: "floor", id: "terracotta" });
  assert.equal(state.coins, coins - FINISH_RULES.prices.floor.terracotta); assert.deepEqual(state.finishOwned.floor, ["checker", "terracotta"]);
});
test("insufficient funds and malformed purchase payloads leave coins, finish and receipts untouched", () => {
  const state = fresh(); state.coins = FINISH_RULES.prices.wall.mint - 1;
  rejected(state, { type: "buyFinish", slot: "wall", id: "mint" }, "not_enough_coins");
  for (const command of [
    { type: "buyFinish", slot: "wall", id: "constructor" }, { type: "buyFinish", slot: "wall", id: ["mint"] },
    { type: "buyFinish", slot: "wrap", id: "sage" }, { type: "buyFinish", id: "mint" },
  ]) rejected(state, command as DinerCommand, "cosmetic_unavailable");
  rejected(state, { type: "buyFinish", slot: "wall", id: "mint", price: 0 } as DinerCommand, "invalid_command");
});
test("legacy applied colors migrate as owned without a charge or other progression changes", () => {
  const raw: any = fresh(); delete raw.finishOwned; raw.cosmetics.floor = "terracotta"; raw.cosmetics.wall = "rose"; raw.coins = 0;
  const original = structuredClone(raw), restored = sanitizeDinerSave(raw)!; assert.ok(restored); assert.deepEqual(raw, original);
  assert.deepEqual(restored.finishOwned, { floor: ["checker", "terracotta"], wall: ["cream", "rose"] });
  assert.equal(restored.coins, 0); assert.deepEqual(restored.home, original.home); assert.deepEqual(restored.recipes, original.recipes);
  const canonical = action(raw, { type: "setCosmetic", slot: "floor", id: "checker" });
  assert.equal(action(canonical, { type: "setCosmetic", slot: "floor", id: "terracotta" }).coins, 0);
  assert.deepEqual(sanitizeDinerSave(JSON.stringify(restored))!.finishOwned, restored.finishOwned);
});
test("existing ownership metadata is validated rather than silently granting applied colors", () => {
  const missing = fresh(); missing.cosmetics.wall = "rose"; assert.equal(sanitizeDinerSave(missing), null);
  for (const owned of [null, { floor: ["checker"], wall: ["cream", "mint", "mint"] }, { floor: ["checker"], wall: ["constructor"] }, { floor: ["checker"], wall: ["cream"], wrap: ["sage"] }]) {
    const state = fresh(); (state as any).finishOwned = owned; assert.equal(sanitizeDinerSave(state), null);
  }
});
test("server replay buys once, rejects the direct bypass and never exposes the private finish collection", () => {
  const initial = createDinerRecord(now, "server-finish");
  const result = replayDiner(initial, [{ type: "buyFinish", slot: "wall", id: "mint" }, { type: "buyFinish", slot: "wall", id: "mint" }], now).record;
  assert.equal(result.state.coins, initial.state.coins - FINISH_RULES.prices.wall.mint); assert.equal(result.state.cosmetics.wall, "mint");
  assert.throws(() => replayDiner(result, [{ type: "setCosmetic", slot: "wall", id: "rose" }], now), error => error instanceof DinerAuthorityError && error.code === "finish_not_owned");
  const profile = createSocialProfile("11111111-1111-4111-8111-111111111111", now); profile.published = true;
  const publicRoom = publicDiner(result.state, profile)!; assert.equal(publicRoom.cosmetics.wall, "mint"); assert.ok(!("finishOwned" in publicRoom));
});
test("truck wraps, uniforms and horns retain their existing free cosmetic behavior", () => {
  let state = fresh(); const coins = state.coins;
  for (const [slot, id] of [["wrap", "sage"], ["uniform", "mint"], ["horn", "friendly"]] as const) state = action(state, { type: "setCosmetic", slot, id });
  assert.equal(state.coins, coins); assert.ok(state.staffMembers.every(staff => staff.outfit === "mint"));
});
console.log(`Diner finishes: ${groups} groups passed.`);
