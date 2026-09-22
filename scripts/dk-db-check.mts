/**
 * Verifies the Domain Kitchen save tables against the REAL database (M6a).
 * Proves the migration landed correctly and that the pieces the save route
 * depends on actually behave: the unique key, the updated_at trigger, and
 * the optimistic lock.
 *
 * Everything it writes is marked is_test and deleted again at the end.
 * Run: npx tsx scripts/dk-db-check.mts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// read .env.local by hand: this script runs outside Next's env loading
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

const env = { ...loadEnv(), ...process.env } as Record<string, string>;
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok  ${label}${detail ? " · " + detail : ""}`);
  else {
    failures++;
    console.error(`FAIL: ${label} ${detail}`);
  }
};

if (!url || !key) {
  console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const WALLET = "0x00000000000000000000000000000000dktest01";
const TOKEN = "dk-db-check-token-0001";

(async () => {
  console.log("── the tables exist and the service role can reach them ─────");
  {
    const { error: e1 } = await db.from("domain_kitchen_players").select("id").limit(1);
    ok("domain_kitchen_players is readable", !e1, e1?.message ?? "");
    const { error: e2 } = await db.from("domain_kitchen_sessions").select("id").limit(1);
    ok("domain_kitchen_sessions is readable", !e2, e2?.message ?? "");
    if (e1 || e2) {
      console.error("\nthe migration has not been applied — stopping here");
      process.exit(1);
    }
  }

  // clean any leftovers from a previous run
  await db.from("domain_kitchen_players").delete().eq("wallet", WALLET);
  await db.from("domain_kitchen_sessions").delete().eq("token", TOKEN);

  console.log("\n── a session row behaves like the auth layer expects ────────");
  {
    const expires = new Date(Date.now() + 60_000).toISOString();
    const { error } = await db
      .from("domain_kitchen_sessions")
      .insert({ token: TOKEN, wallet: WALLET, expires_at: expires });
    ok("a session inserts", !error, error?.message ?? "");

    const { data } = await db
      .from("domain_kitchen_sessions")
      .select("wallet, expires_at")
      .eq("token", TOKEN)
      .maybeSingle();
    ok("it reads back by token", !!data && data.wallet === WALLET);

    const dup = await db
      .from("domain_kitchen_sessions")
      .insert({ token: TOKEN, wallet: WALLET, expires_at: expires });
    ok("a duplicate token is refused", !!dup.error, dup.error ? "unique key held" : "NO UNIQUE KEY");
  }

  console.log("\n── the save row, its unique key, and the lock ───────────────");
  {
    const state = { v: 4, coins: 100, layout: [], theme: "trattoria", savedAt: Date.now() };
    const ins = await db
      .from("domain_kitchen_players")
      .insert({ game_key: "dk", wallet: WALLET, state, best_quality: 61.5, seats: 4, is_test: true });
    ok("a save inserts", !ins.error, ins.error?.message ?? "");

    const dup = await db
      .from("domain_kitchen_players")
      .insert({ game_key: "dk", wallet: WALLET, state, is_test: true });
    ok("one row per (game_key, wallet)", !!dup.error, dup.error ? "unique key held" : "NO UNIQUE KEY");

    const { data: first } = await db
      .from("domain_kitchen_players")
      .select("state, updated_at, best_quality, seats")
      .eq("game_key", "dk")
      .eq("wallet", WALLET)
      .maybeSingle<{ state: { coins: number }; updated_at: string; best_quality: number; seats: number }>();
    ok("JSONB state round-trips", first?.state?.coins === 100, `coins=${first?.state?.coins}`);
    ok("the denormalised columns landed", Number(first?.best_quality) === 61.5 && first?.seats === 4);

    const staleStamp = first!.updated_at;
    // a real write: lock on the stamp we just read, so it must succeed
    await new Promise((r) => setTimeout(r, 1100)); // let the clock move
    const good = await db
      .from("domain_kitchen_players")
      .update({ state: { ...first!.state, coins: 250 }, best_quality: 70 })
      .eq("game_key", "dk")
      .eq("wallet", WALLET)
      .eq("updated_at", staleStamp)
      .select("id");
    ok("a write with the current stamp succeeds", !good.error && !!good.data?.length);

    const { data: second } = await db
      .from("domain_kitchen_players")
      .select("updated_at, state")
      .eq("game_key", "dk")
      .eq("wallet", WALLET)
      .maybeSingle<{ updated_at: string; state: { coins: number } }>();
    ok("the trigger moved updated_at", second!.updated_at !== staleStamp,
      `${staleStamp} -> ${second!.updated_at}`);
    ok("the new state stuck", second!.state.coins === 250);

    // THE LOCK: the same stale stamp must now match nothing
    const conflict = await db
      .from("domain_kitchen_players")
      .update({ state: { coins: 999 } })
      .eq("game_key", "dk")
      .eq("wallet", WALLET)
      .eq("updated_at", staleStamp)
      .select("id");
    ok("a stale write is refused by the lock", !conflict.error && conflict.data?.length === 0,
      `${conflict.data?.length ?? "err"} rows touched`);

    const { data: third } = await db
      .from("domain_kitchen_players")
      .select("state")
      .eq("wallet", WALLET)
      .maybeSingle<{ state: { coins: number } }>();
    ok("the refused write changed nothing", third!.state.coins === 250, `coins=${third!.state.coins}`);
  }

  console.log("\n── cleanup ──────────────────────────────────────────────────");
  {
    await db.from("domain_kitchen_players").delete().eq("wallet", WALLET);
    await db.from("domain_kitchen_sessions").delete().eq("token", TOKEN);
    const { data } = await db.from("domain_kitchen_players").select("id").eq("wallet", WALLET);
    ok("test rows removed", !data || data.length === 0);
  }

  if (failures > 0) {
    console.error(`\ndb check FAIL (${failures})`);
    process.exit(1);
  }
  console.log("\ndb check PASS");
})();
