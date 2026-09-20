/** Pure two-party social checks and SQL guard review; never accesses a database. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDinerRecord, DinerAuthorityError } from "../src/lib/chef/diner/authority";
import { createSocialProfile, publicDiner, replayDinerSocial, socialPair, validateSocialCommand, type DinerSocialInput } from "../src/lib/chef/diner/social";
const now = Date.UTC(2026, 8, 20, 8), a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
const id = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(): DinerSocialInput { const actor = createDinerRecord(now, "a"), target = createDinerRecord(now, "b"), actorProfile = createSocialProfile(a, now), targetProfile = createSocialProfile(b, now); actorProfile.published = targetProfile.published = true; return { actorId: a, targetId: b, actor, target, actorProfile, targetProfile, friendship: socialPair(a, b) }; }
function reverse(input: DinerSocialInput): DinerSocialInput { return { actorId: input.targetId!, targetId: input.actorId, actor: input.target!, target: input.actor, actorProfile: input.targetProfile!, targetProfile: input.actorProfile, friendship: input.friendship, trade: input.trade }; }
function rejects(action: () => unknown, code: string) { assert.throws(action, error => error instanceof DinerAuthorityError && error.code === code); }
let groups = 0; const test = (name: string, action: () => void) => { action(); groups++; console.log(`ok ${name}`); };
test("publication is opt-in and public payload excludes every private progression surface", () => {
  const input = fixture(); input.actorProfile.published = false; assert.equal(publicDiner(input.actor.state, input.actorProfile), null);
  const published = replayDinerSocial(input, { type: "publish", enabled: true }, { now, commandId: id() });
  published.actor.state.pantry.beef = 99; published.actor.state.coins = 999999; published.actor.state.recipes.apple_pie = { level: 10 };
  (published.actor.state.home.menu as any).privateMarker = "do-not-project"; (published.actor.state.cosmetics as any).privateMarker = "do-not-project";
  const payload = publicDiner(published.actor.state, published.actorProfile)!;
  for (const key of ["coins", "pantry", "till", "run", "seed", "daily", "createdAt", "updatedAt", "reputation"]) assert.ok(!JSON.stringify(payload).includes(`"${key}"`), key);
  assert.ok(!payload.recipes.apple_pie); assert.ok(!payload.equipment.fryer); assert.ok(!payload.simulation.recipeLevels.apple_pie); assert.ok(payload.simulation.equipment.grill);
  assert.ok(!JSON.stringify(payload).includes("do-not-project"));
  assert.equal(input.actorProfile.published, false);
});
test("a friend request needs the other player's acceptance and blocked pairs cannot interact", () => {
  const input = fixture(), requested = replayDinerSocial(input, { type: "request", targetHandle: input.targetProfile!.handle }, { now, commandId: id() });
  assert.equal(requested.friendship!.accepted, false); rejects(() => replayDinerSocial(requested, { type: "accept", targetHandle: requested.targetProfile!.handle }, { now, commandId: id(2) }), "request_unavailable");
  const accepted = replayDinerSocial(reverse(requested), { type: "accept", targetHandle: requested.actorProfile.handle }, { now, commandId: id(2) }); assert.equal(accepted.friendship!.accepted, true);
  const blocked = replayDinerSocial(accepted, { type: "block", targetHandle: accepted.targetProfile!.handle }, { now, commandId: id(3) });
  rejects(() => replayDinerSocial(reverse(blocked), { type: "visitGift", targetHandle: blocked.actorProfile.handle }, { now, commandId: id(4) }), "diner_unavailable");
  const unblocked = replayDinerSocial(blocked, { type: "unblock", targetHandle: blocked.targetProfile!.handle }, { now, commandId: id(5) }); assert.deepEqual(unblocked.friendship!.blockedBy, []); assert.equal(unblocked.friendship!.accepted, false);
});
test("friendship parcels share the recipient-wide regular kindness allowance", () => {
  const input = fixture(); input.friendship!.accepted = true;
  const claimed = replayDinerSocial(input, { type: "visitGift", targetHandle: input.targetProfile!.handle }, { now, commandId: id() });
  assert.equal(claimed.actor.state.daily.minted, 1); assert.equal(claimed.actor.state.daily.kindness, true); assert.equal(claimed.target!.state.daily.minted, 0);
  for (let i = 0; i < 20; i++) { const other = fixture(); other.actor = claimed.actor; rejects(() => replayDinerSocial({ ...other, friendship: { ...other.friendship!, accepted: true } }, { type: "visitGift", targetHandle: other.targetProfile!.handle }, { now, commandId: id(i + 2) }), "already_claimed"); }
});
test("stickers use fixed names and daily pair receipts and never grant ingredients", () => {
  const input = fixture(), stamped = replayDinerSocial(input, { type: "sticker", targetHandle: input.targetProfile!.handle, stickerId: "cosy" }, { now, commandId: id() });
  assert.equal(stamped.targetProfile!.stickers.cosy, 1); assert.equal(stamped.actor.state.daily.minted, 0);
  rejects(() => replayDinerSocial(stamped, { type: "sticker", targetHandle: input.targetProfile!.handle, stickerId: "cosy" }, { now, commandId: id(2) }), "sticker_used");
  rejects(() => validateSocialCommand({ type: "sticker", targetHandle: input.targetProfile!.handle, stickerId: "my text" }), "invalid_sticker");
});
function traders() { const input = fixture(); input.friendship!.accepted = true; input.actor.state.restaurantLevel = input.target!.state.restaurantLevel = 8; input.actor.state.pantry.beef = 10; input.target!.state.pantry.tomato = 10; return input; }
test("trade escrows exactly one ingredient; only the named recipient can accept the exact terms", () => {
  const input = traders(), offered = replayDinerSocial(input, { type: "offerTrade", targetHandle: input.targetProfile!.handle, give: "beef", receive: "tomato" }, { now, commandId: id() });
  assert.equal(offered.actor.state.pantry.beef, 9); assert.equal(offered.target!.state.pantry.beef, undefined); assert.equal(offered.trade!.status, "pending");
  rejects(() => replayDinerSocial(offered, { type: "acceptTrade", tradeId: id() }, { now, commandId: id(2) }), "trade_unavailable");
  const accepted = replayDinerSocial(reverse(offered), { type: "acceptTrade", tradeId: id() }, { now, commandId: id(2) });
  assert.equal(accepted.actor.state.pantry.beef, 1); assert.equal(accepted.actor.state.pantry.tomato, 9); assert.equal(accepted.target!.state.pantry.tomato, 1);
  assert.equal(accepted.actorProfile.trades, 1); assert.equal(accepted.targetProfile!.trades, 1); assert.equal(accepted.trade!.status, "accepted");
  assert.equal(accepted.actor.state.daily.minted, 0); assert.equal(accepted.target!.state.daily.minted, 0); assert.equal(accepted.actor.state.coins, input.target!.state.coins);
  rejects(() => replayDinerSocial(accepted, { type: "acceptTrade", tradeId: id() }, { now, commandId: id(3) }), "trade_unavailable");
});
test("trade rejection/cancellation refunds escrow even after a block; expiry never exchanges items", () => {
  const input = traders(), offered = replayDinerSocial(input, { type: "offerTrade", targetHandle: input.targetProfile!.handle, give: "beef", receive: "tomato" }, { now, commandId: id() });
  offered.friendship!.blockedBy = [b];
  const cancelled = replayDinerSocial(reverse(offered), { type: "cancelTrade", tradeId: id() }, { now, commandId: id(2) }); assert.equal(cancelled.target!.state.pantry.beef, 10); assert.equal(cancelled.actor.state.pantry.tomato, 10); assert.deepEqual(cancelled.actorProfile.pendingTrades, []);
  offered.friendship!.blockedBy = [];
  const expired = replayDinerSocial(reverse(offered), { type: "acceptTrade", tradeId: id() }, { now: now + 86_400_000, commandId: id(3) }); assert.equal(expired.trade!.status, "expired"); assert.equal(expired.target!.state.pantry.beef, 10); assert.equal(expired.actorProfile.trades, 0);
});
test("both level gates and both five-trade budgets apply across counterparties", () => {
  let input = traders(); input.target!.state.restaurantLevel = 7;
  rejects(() => replayDinerSocial(input, { type: "offerTrade", targetHandle: input.targetProfile!.handle, give: "beef", receive: "tomato" }, { now, commandId: id() }), "trade_locked");
  input = traders(); input.targetProfile!.trades = 5;
  rejects(() => replayDinerSocial(input, { type: "offerTrade", targetHandle: input.targetProfile!.handle, give: "beef", receive: "tomato" }, { now, commandId: id() }), "trade_limit");
  input = traders(); const offered = replayDinerSocial(input, { type: "offerTrade", targetHandle: input.targetProfile!.handle, give: "beef", receive: "tomato" }, { now, commandId: id() }); offered.actorProfile.trades = 5;
  rejects(() => replayDinerSocial(reverse(offered), { type: "acceptTrade", tradeId: id() }, { now, commandId: id(2) }), "trade_limit");
});
test("social payloads reject private progress, free text, quantities and unknown ingredients", () => {
  for (const command of [{ type: "publish", enabled: true, coins: 999 }, { type: "offerTrade", targetHandle: createSocialProfile(b, now).handle, give: "beef", receive: "tomato", count: 100 }, { type: "sticker", targetHandle: createSocialProfile(b, now).handle, stickerId: "cosy", message: "text" }]) rejects(() => validateSocialCommand(command), "invalid_social_action");
  rejects(() => validateSocialCommand({ type: "offerTrade", targetHandle: createSocialProfile(b, now).handle, give: "__proto__", receive: "tomato" }), "invalid_trade");
});
test("pair SQL locks both canonical revisions before any escrow/reward update", () => {
  const sql = readFileSync("supabase/migrations/20260921_diner_preview_social.sql", "utf8").replace(/--[^\r\n]*/g, "").replace(/\s+/g, " ").toLowerCase();
  assert.ok(sql.includes("order by player_id for update")); assert.ok(sql.includes("actor.revision<>p_actor_revision")); assert.ok(sql.includes("target.revision<>p_target_revision"));
  assert.ok(sql.indexOf("actor.revision<>p_actor_revision") < sql.indexOf("update public.diner_preview_players")); assert.ok(sql.includes("receipt.fingerprint<>p_fingerprint"));
  assert.ok(sql.includes("revoke all on public.diner_preview_profiles, public.diner_preview_friendships, public.diner_preview_trades from public, anon, authenticated, service_role"));
  assert.ok(sql.includes("p_target_revision+1")); assert.ok(!sql.includes("domain_kitchen")); assert.ok(sql.trim().endsWith("commit;"));
  assert.ok(sql.includes("drop constraint if exists diner_preview_run_inputs_player_id_command_id_key"));
  const account = readFileSync("src/app/api/chef/diner/account/route.ts", "utf8"), recovery = readFileSync("src/app/api/chef/diner/account/recover/route.ts", "utf8"), session = readFileSync("src/app/api/chef/diner/session/route.ts", "utf8");
  assert.ok(account.includes("dinerPlayer(req)")); assert.ok(account.includes("requireDinerWalletSession")); assert.ok(!account.includes("admin.updateUserById"));
  assert.ok(recovery.includes("wallet_required") && recovery.includes("410")); assert.ok(!recovery.includes("signInWithOtp"));
  assert.ok(session.includes("requireDinerWalletSession")); assert.ok(!session.includes("signInAnonymously"));
});
console.log(`Diner social: ${groups} groups passed.`);
