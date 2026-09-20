/** Pure authority and SQL-structure checks. Never contacts a database. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDinerRecord, DINER_AUTHORITY_RULES, DinerAuthorityError, replayDiner, validateDinerEnvelope } from "../src/lib/chef/diner/authority";
import { dispatchDiner, type DinerCommand } from "../src/lib/chef/diner/progression";
import { SERVICE_RULES } from "../src/lib/chef/diner/content";
const now = Date.UTC(2026, 8, 20, 8);
let groups = 0; const test = (name: string, fn: () => void) => { fn(); groups++; console.log(`ok ${name}`); };
function playing() { const record = createDinerRecord(now, "authority-test"); record.state=dispatchDiner(record.state,{type:'setupLayout',stations:[...record.state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:record.state.truckConfig.tables},{now}).state; record.state = dispatchDiner(record.state, { type: "startRun" }, { now }).state; record.state = dispatchDiner(record.state, { type: "chooseNode", nodeId: record.state.run!.available[0] }, { now }).state; record.state = dispatchDiner(record.state, { type: "service", action: { type: "open" } }, { now }).state; assert.equal(record.state.run!.service!.phase,'playing');return record; }
function throws(fn: () => unknown, code: string) { assert.throws(fn, error => error instanceof DinerAuthorityError && error.code === code); }
const tick = (ticks: number): DinerCommand => ({ type: "service", action: { type: "tick", ticks } });
test("clock matches shared tick duration and spend cannot exceed server elapsed", () => {
  const record = playing(); assert.equal(DINER_AUTHORITY_RULES.tickMs, SERVICE_RULES.tickMs);
  const first = replayDiner(record, [tick(20)], now + 1000).record; assert.equal(first.state.run!.service!.tick, 20);
  throws(() => replayDiner(first, [tick(1)], now + 1000), "time_credit"); assert.equal(first.state.run!.service!.tick, 20);
  const second = replayDiner(first, [tick(20)], now + 2000).record; assert.equal(second.state.run!.service!.tick, 40);
  throws(() => replayDiner(second, [tick(1)], now), "time_credit");
});
test("failure midway through a tape never commits a partial reward or elapsed input", () => {
  const record = playing(), before = structuredClone(record);
  throws(() => replayDiner(record, [{ type: "claimCrate" }, tick(30)], now + 1000), "time_credit"); assert.deepEqual(record, before);
});
test("fractional clock credit is conserved and pause/resume cannot stockpile time", () => {
  let record = playing(); record = replayDiner(record, [tick(1)], now + 75).record; assert.equal(record.clock.creditMs, 25);
  record = replayDiner(record, [tick(1)], now + 100).record; assert.equal(record.clock.creditMs, 0);
  record = replayDiner(record, [{ type: "service", action: { type: "pause" } }], now + 150).record;
  record = replayDiner(record, [{ type: "service", action: { type: "resume" } }], now + 60_000).record;
  assert.equal(record.clock.creditMs, 0); throws(() => replayDiner(record, [tick(1)], now + 60_000), "time_credit");
});
test("long gaps auto-pause and discard stale predicted actions without paying them", () => {
  const record = playing(), result = replayDiner(record, [tick(100), { type: "claimCrate" }], now + 60_000);
  assert.equal(result.interrupted, true); assert.equal(result.record.state.run!.service!.phase, "paused");
  assert.equal(result.record.state.daily.crate, false); assert.equal(result.record.state.run!.service!.tick, 0);
  assert.deepEqual(result.accepted, [{ type: "service", action: { type: "pause" } }]);
});
test("unspent short-request credit also pauses once backlog exceeds five seconds", () => {
  let record = playing(); for (let i = 1; i <= 5; i++) record = replayDiner(record, [{ type: "settle" }], now + i * 1000).record;
  const result = replayDiner(record, [tick(1)], now + 5100); assert.equal(result.interrupted, true);
});
test("closing phase advances under identical real-time limits", () => {
  const record = playing(); record.state.run!.service!.phase = "closing";
  const next = replayDiner(record, [tick(10)], now + 500); assert.equal(next.record.state.run!.service!.tick, 10);
  throws(() => replayDiner(record, [tick(11)], now + 500), "time_credit");
});
test("envelopes reject reward fields, oversized tick tapes and malformed UUIDs", () => {
  const valid = { id: "00000000-0000-4000-8000-000000000001", revision: 0, commands: [tick(1)] }; assert.deepEqual(validateDinerEnvelope(valid), valid);
  throws(() => validateDinerEnvelope({ ...valid, coins: 99 }), "invalid_envelope");
  throws(() => validateDinerEnvelope({ ...valid, id: "guess" }), "invalid_envelope");
  throws(() => validateDinerEnvelope({ ...valid, commands: [tick(101)] }), "tape_too_long");
  throws(() => replayDiner(playing(), [{ type: "service", action: { type: "tick", ticks: 1, coins: 100 } } as any], now + 50), "invalid_service_action");
});
test("home presence uses recent server intervals and long absences use sixty percent", () => {
  const record = createDinerRecord(now, "presence-check");
  const short = replayDiner(record, [{ type: "settle" }], now + 15_000).record;
  const absent = replayDiner(record, [{ type: "settle" }], now + 60_000).record;
  assert.ok(Math.abs(short.state.home.till.coins * 4 * .6 - absent.state.home.till.coins) < 1e-9);
  throws(() => replayDiner(record, [{ type: "settle", online: true } as any], now + 60_000), "invalid_command");
});
test("SQL atomically guards receipts/revisions and preserves accepted input checkpoints", () => {
  const sql = readFileSync("supabase/migrations/20260920_diner_preview.sql", "utf8").replace(/--[^\r\n]*/g, "").replace(/\s+/g, " ").toLowerCase();
  assert.ok(!sql.includes("domain_kitchen_")); assert.ok(sql.includes("references auth.users(id)"));
  assert.ok(sql.includes("revoke all on public.diner_preview_players, public.diner_preview_commands, public.diner_preview_run_inputs from public, anon, authenticated, service_role"));
  assert.ok(sql.includes("where player_id = p_player for update")); assert.ok(sql.includes("receipt.fingerprint <> p_fingerprint"));
  assert.ok(sql.includes("player.revision <> p_expected_revision")); assert.ok(sql.includes("primary key (player_id, command_id)"));
  assert.ok(sql.includes("insert into public.diner_preview_run_inputs")); assert.ok(sql.includes("p_commands, p_state, p_server_time_ms"));
  assert.ok(sql.includes("begin;") && sql.trim().endsWith("commit;"));
});
test("online preview is explicitly gated and cannot import a guest balance", () => {
  const server = readFileSync("src/lib/chef/diner/server.ts", "utf8"), route = readFileSync("src/app/api/chef/diner/command/route.ts", "utf8"), session = readFileSync("src/app/api/chef/diner/session/route.ts", "utf8");
  assert.ok(server.includes('process.env.DINER_PREVIEW_SERVER_ENABLED === "true"')); assert.ok(server.includes(".auth.getUser(token)"));
  assert.ok(server.includes("createDinerRecord(now,")); assert.ok(!server.includes("domain_kitchen_players"));
  assert.ok(route.includes("validateDinerEnvelope(parsed)")); assert.ok(route.includes("p_commands: result.accepted"));
  assert.ok(session.includes("signInAnonymously")); assert.ok(!session.includes("wallet" + "For"));
});
console.log(`Diner authority: ${groups} groups passed.`);
