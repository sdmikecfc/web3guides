import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BEGINNER_ALLOWANCE, BEGINNER_OFFERS, BEGINNER_ORDER } from "../src/lib/bots/beginner-catalog";
import { freshGameDemo, demoWelcome, demoBuy, demoComplete, readGameDemo } from "../src/lib/bots/game-demo";
import { EQUIPMENT_KIND, socketsOf, withSockets } from "../src/lib/bots/equipment";
import { campaignEnrollment } from "../src/app/bots/_server/campaign-enrollment";
import type { BotsDb } from "../src/app/bots/_server/db";

const initial = freshGameDemo();
assert.equal(initial.coins, BEGINNER_ALLOWANCE);
assert.equal(initial.parts.length, 7);
assert(initial.parts.every(p => p.s.every(n => n === 1) && p.price === 0 && p.salvage === 0));
assert.notEqual(socketsOf(initial.builds[0]).armL, socketsOf(initial.builds[0]).armR);
let state = demoWelcome(initial);
for (const socket of BEGINNER_ORDER) {
  const offers = BEGINNER_OFFERS.filter(o => o.part.slot === EQUIPMENT_KIND[socket]);
  const chosen = offers[socket.endsWith("R") ? 1 : 0];
  const before = state.coins;
  state = demoBuy(state, socket, chosen.id);
  assert.equal(state.coins, before - chosen.price);
  assert.equal(demoBuy(state, socket, chosen.id), state, "double click is idempotent");
  const restored = readGameDemo(JSON.stringify(state));
  assert.deepEqual(restored.parts, state.parts);
  assert.deepEqual(restored.builds.map(socketsOf), state.builds.map(socketsOf));
  assert.equal(restored.onboarding.nextSocket, state.onboarding.nextSocket);
}
assert.equal(state.coins, 0);
assert.equal(state.onboarding.reservedCoins, 0);
assert.equal(state.onboarding.step, "practice");
state = demoComplete(state);
const slots = state.builds.map(socketsOf);
[slots[0].armL, slots[1].armL] = [slots[1].armL, slots[0].armL];
state = { ...state, builds: state.builds.map((b,i) => withSockets({ ...b, look: { ...b.look!, face: "happy" } }, slots[i])) };
const swapped = readGameDemo(JSON.stringify(state));
assert.deepEqual(swapped.builds.map(socketsOf), slots, "cross-robot swaps survive reload together");
assert(swapped.builds.every(b => b.look?.face === "happy"), "cosmetics survive arrangement restore");
const forged = JSON.parse(JSON.stringify(state));
forged.coins = 100000; forged.parts[0].s = [999,999,999]; forged.builds[0].look.hat = "crown";
const safe = readGameDemo(JSON.stringify(forged));
assert.equal(safe.coins, 0); assert(safe.parts.every(p => p.s.every(n => n === 1))); assert.notEqual(safe.builds[0].look?.hat, "crown");
forged.builds[0].sockets.armR = forged.builds[1].sockets.armR;
const invalid = readGameDemo(JSON.stringify(forged));
const uids = invalid.builds.flatMap(b => Object.values(socketsOf(b))).filter(Boolean);
assert.equal(new Set(uids).size, uids.length, "forged duplicate parts never restore");
console.log("Practice: seven purchases, reload at each step, swaps, cosmetics and forged claims passed.");

async function enrollmentChecks() {
  let rpcCalls = 0;
  const rpcArgs: Record<string, unknown>[] = [];
  function database(status: "draft" | "active", snapshot: "pending" | "ready" | "failed", fail = false): BotsDb {
    return {
      from(table: string) {
        let active = false;
        const q: any = { select: () => q, eq: (_key: string, value: string) => { if (value === "active") active = true; return q; }, lte: () => q, gt: () => q, order: () => q, limit: () => q,
          maybeSingle: async () => ({ data: table === "battle_bots_campaigns" ? active && status !== "active" ? null : { id: "cup-1" } : { snapshot_status: snapshot }, error: null }) };
        return q;
      },
      async rpc(_name: string, args: Record<string, unknown>) { rpcCalls++; rpcArgs.push(args); return { data: { snapshot_status: snapshot }, error: fail ? { message: "unavailable" } : null }; },
    } as unknown as BotsDb;
  }
  assert.equal((await campaignEnrollment(database("draft","pending"),"0xAbC",true)).campaignStatus,"draft");
  assert.equal(rpcCalls,0,"draft never requests a snapshot");
  assert.equal((await campaignEnrollment(database("active","ready"),"0xAbC",true,true)).snapshotStatus,"ready");
  assert.equal(rpcArgs[0].p_wallet,"0xabc");assert.equal(rpcArgs[0].p_is_test,true);
  assert.equal((await campaignEnrollment(database("active","pending"),"0xAbC",true)).snapshotStatus,"pending");
  assert.equal((await campaignEnrollment(database("active","pending",true),"0xAbC",true)).campaignStatus,"unavailable");
  assert(readFileSync("src/app/api/bots/me/route.ts","utf8").includes("campaignEnrollment(db, sess.wallet, true, !!player.is_test)"),"returning authenticated players queue active enrollment");
  console.log("Campaign enrollment: draft, returning active, ready snapshots, test flag and unavailable reporter passed.");
}
void enrollmentChecks().catch(error => { console.error(error);process.exitCode=1; });

