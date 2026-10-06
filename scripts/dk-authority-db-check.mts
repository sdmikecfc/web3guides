/** Optional integration gate against a DISPOSABLE LOCAL Supabase only.
 * Apply supabase/migrations/20260913_domain_kitchen_authority.sql first.
 * DK_TEST_DATABASE_URL=http://127.0.0.1:54321 DK_TEST_SERVICE_KEY=<local service key>
 * node scripts/dk-check-runner.cjs scripts/dk-authority-db-check.mts
 * Never reads .env.local and refuses all non-loopback hosts.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { initializeKitchen, applyKitchenCommand, type KitchenRecord } from "../src/lib/chef/authority";
const url = process.env.DK_TEST_DATABASE_URL ?? "";
if (!url || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !process.env.DK_TEST_SERVICE_KEY)
  throw new Error("Use a disposable LOCAL Supabase with DK_TEST_DATABASE_URL and DK_TEST_SERVICE_KEY. Remote databases are refused.");
const db = createClient(url, process.env.DK_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const game = "dk-authority-test";
const a = "0x" + "a1".repeat(20), b = "0x" + "b2".repeat(20);
const now = Date.now();
const must = (result: { error: unknown }) => { if (result.error) throw result.error; };
async function seed(wallet: string) {
  const record = initializeKitchen(null, now);
  must(await db.from("domain_kitchen_players").insert({ game_key: game, wallet, state: record.save, is_test: true }));
  const { data: row } = await db.from("domain_kitchen_players").select("updated_at").eq("game_key", game).eq("wallet", wallet).single();
  must(await db.rpc("dk_initialize_authority", { p_game: game, p_wallet: wallet, p_save: record.save, p_authority: record.authority, p_expected_updated_at: row!.updated_at }));
  return record;
}
async function commit(wallet: string, before: KitchenRecord, after: KitchenRecord, id: string, fingerprint: string, target?: { wallet: string; before: KitchenRecord; after: KitchenRecord }) {
  const result = await db.rpc("dk_commit_command", {
    p_game: game, p_wallet: wallet, p_command: id, p_fingerprint: fingerprint,
    p_expected_revision: before.revision, p_save: after.save, p_authority: after.authority, p_quality: 70, p_seats: 4,
    p_target_wallet: target?.wallet ?? null, p_target_revision: target?.before.revision ?? null,
    p_target_save: target?.after.save ?? null, p_target_authority: target?.after.authority ?? null,
    p_target_quality: target ? 70 : null, p_target_seats: target ? 4 : null,
  });
  must(result); return result.data;
}
async function cleanup() {
  must(await db.from("domain_kitchen_commands").delete().eq("game_key", game));
  must(await db.from("domain_kitchen_legacy_snapshots").delete().eq("game_key", game));
  must(await db.from("domain_kitchen_players").delete().eq("game_key", game).eq("is_test", true));
}
(async () => {
  await cleanup();
  try {
    let actor = await seed(a), other = await seed(b);
    const awarded = applyKitchenCommand(actor, { type: "claimDaily" }, now, a).actor;
    const id = randomUUID();
    const duplicate = await Promise.all([commit(a, actor, awarded, id, "daily"), commit(a, actor, awarded, id, "daily")]);
    assert.ok(duplicate.every((r) => r.ok)); assert.equal(duplicate.filter((r) => r.duplicate).length, 1);
    assert.equal((await commit(a, actor, awarded, id, "different")).code, "id_reused");
    assert.equal((await commit(a, actor, awarded, randomUUID(), "stale")).code, "conflict");
    actor = awarded;
    const forged = await db.from("domain_kitchen_players").update({ state: { ...actor.save, coins: 1e9 } }).eq("game_key", game).eq("wallet", a);
    assert.ok(forged.error, "database blocks the obsolete raw save path");
    const request = applyKitchenCommand(actor, { type: "requestFriend", targetHandle: "b" }, now, a, { id: b, record: other });
    assert.ok((await commit(a, actor, request.actor, randomUUID(), "request", { wallet: b, before: other, after: request.target! })).ok);
    actor = request.actor; other = request.target!;
    const accept = applyKitchenCommand(other, { type: "acceptFriend", targetHandle: "a" }, now, b, { id: a, record: actor });
    assert.ok((await commit(b, other, accept.actor, randomUUID(), "accept", { wallet: a, before: actor, after: accept.target! })).ok);
    const { data: rows } = await db.from("domain_kitchen_players").select("wallet,authority_state,state_revision").eq("game_key", game);
    assert.equal(rows!.find((r) => r.wallet === a)!.authority_state.neighbors[b], "friend");
    assert.equal(rows!.find((r) => r.wallet === b)!.authority_state.neighbors[a], "friend");
    const { data: snapshots } = await db.from("domain_kitchen_legacy_snapshots").select("wallet").eq("game_key", game);
    assert.equal(snapshots!.length, 2);
    console.log("PASS: database replay, stale revisions, forged writes, atomic social changes, legacy snapshots");
  } finally { await cleanup(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
