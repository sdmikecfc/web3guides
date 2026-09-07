/**
 * End-to-end check of the save ROUTES against a running server (M6a).
 *
 * It mints a test session row directly (as the operator, via the service
 * role) so the route logic can be exercised without a wallet signature, then
 * drives /api/chef/save exactly as a browser would — including as an ATTACKER
 * would: no token, a junk token, a forged save, an oversized body.
 *
 * Start the dev server first, then:
 *   npx tsx scripts/dk-route-check.mts [baseUrl]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
const BASE = process.argv[2] || "http://localhost:3000";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// must be REAL hex: walletForDkSession rejects anything else, which is why
// the first version of this test 401'd on its own made-up address
const WALLET = "0x" + "dc".repeat(20);
const TOKEN = "dk-route-check-token-0001";
const EXPIRED = "dk-route-check-expired-001";

let failures = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok  ${label}${detail ? " · " + detail : ""}`);
  else {
    failures++;
    console.error(`FAIL: ${label} ${detail}`);
  }
};

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/chef/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {}
  return { status: res.status, json };
}

(async () => {
  // fresh state
  await db.from("domain_kitchen_players").delete().eq("wallet", WALLET);
  await db.from("domain_kitchen_sessions").delete().in("token", [TOKEN, EXPIRED]);
  await db.from("domain_kitchen_sessions").insert([
    { token: TOKEN, wallet: WALLET, expires_at: new Date(Date.now() + 300_000).toISOString() },
    { token: EXPIRED, wallet: WALLET, expires_at: new Date(Date.now() - 60_000).toISOString() },
  ]);

  console.log("── an unauthenticated caller gets nowhere ───────────────────");
  {
    const none = await post({});
    ok("no token is refused", none.status === 401, `${none.status}`);
    const junk = await post({ t: "!!!not-a-token!!!" });
    ok("a malformed token is refused", junk.status === 401, `${junk.status}`);
    const unknown = await post({ t: "aaaaaaaaaaaaaaaaaaaa" });
    ok("an unknown token is refused", unknown.status === 401, `${unknown.status}`);
    const expired = await post({ t: EXPIRED });
    ok("an EXPIRED token is refused", expired.status === 401, `${expired.status}`);
    const stillEmpty = await db.from("domain_kitchen_players").select("id").eq("wallet", WALLET);
    ok("none of that wrote anything", (stillEmpty.data?.length ?? 0) === 0);
  }

  console.log("\n── the honest round trip ────────────────────────────────────");
  {
    const empty = await post({ t: TOKEN });
    ok("a new player loads null", empty.status === 200 && empty.json.save === null, `${empty.status}`);

    const save = {
      v: 4,
      market: "software.ai",
      lpDays: { "software.ai": 2 },
      coins: 321,
      waiters: 2,
      chefs: 1,
      layout: [{ itemId: "table_basic", gx: 3, gy: 3, facing: "sw" }],
      inventory: { chair_basic: 2 },
      pantry: { stock: { tomato: 4 }, levels: { margherita: 2 } },
      menu: { serves: { margherita: 7 }, specialUnlocked: true, specialServes: 3, specialMastered: false },
      bestQuality: 72.5,
      theme: "izakaya",
      savedAt: Date.now(),
    };
    const stored = await post({ t: TOKEN, state: save });
    ok("a save stores", stored.status === 200 && stored.json.ok === true, `${stored.status}`);

    const back = await post({ t: TOKEN });
    const got = back.json.save as Record<string, unknown>;
    ok("it loads back", back.status === 200 && !!got);
    ok("coins survived", got?.coins === 321, `${got?.coins}`);
    ok("theme survived", got?.theme === "izakaya");
    ok("layout survived", Array.isArray(got?.layout) && (got.layout as unknown[]).length === 1);
    ok("tenure survived", (got?.lpDays as Record<string, number>)?.["software.ai"] === 2);

    // a second save must overwrite, not duplicate
    const again = await post({ t: TOKEN, state: { ...save, coins: 999, savedAt: Date.now() } });
    ok("a second save succeeds", again.json.ok === true);
    const rows = await db.from("domain_kitchen_players").select("id, state").eq("wallet", WALLET);
    ok("still exactly one row", rows.data?.length === 1, `${rows.data?.length} rows`);
    ok("the newer value won", (rows.data?.[0]?.state as { coins: number })?.coins === 999);
  }

  console.log("\n── a forged save is neutered before it lands ────────────────");
  {
    const forged = await post({
      t: TOKEN,
      state: {
        coins: 999_999_999_999,
        waiters: 99,
        chefs: 99,
        market: "not-a-market",
        theme: "../../evil",
        layout: [{ itemId: "solid_gold_throne", gx: 999, gy: 999, facing: "north" }],
        inventory: { unobtainium: 500 },
        pantry: { stock: { plutonium: 9 }, levels: { margherita: 99 } },
        bestQuality: 10_000,
        savedAt: Date.now(),
      },
    });
    ok("the server accepts it without complaint", forged.json.ok === true);

    const { data } = await db
      .from("domain_kitchen_players")
      .select("state, best_quality")
      .eq("wallet", WALLET)
      .maybeSingle<{ state: Record<string, unknown>; best_quality: number }>();
    const s = data!.state;
    ok("forged coins were clamped", (s.coins as number) <= 1_000_000_000, `${s.coins}`);
    ok("the fake item never landed", (s.layout as unknown[]).length === 0, `${(s.layout as unknown[]).length} pieces`);
    ok("the unknown market was replaced", s.market === "software.ai", `${s.market}`);
    ok("the junk theme was replaced", s.theme === "trattoria", `${s.theme}`);
    ok("hires clamped to the real max", s.waiters === 2 && s.chefs === 2);
    ok("unknown inventory dropped", Object.keys(s.inventory as object).length === 0);
    ok("unknown ingredient dropped",
      Object.keys((s.pantry as { stock: object }).stock).length === 0);
    ok("dish level clamped", (s.pantry as { levels: Record<string, number> }).levels.margherita === 3);
    ok("quality capped at 100", Number(data!.best_quality) === 100, `${data!.best_quality}`);
  }

  console.log("\n── an oversized body is rejected before it is parsed ────────");
  {
    const huge = { t: TOKEN, state: { junk: "x".repeat(40_000) } };
    const res = await fetch(`${BASE}/api/chef/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(huge),
    });
    ok("a 40KB save is refused", res.status === 413, `${res.status}`);
  }

  console.log("\n── cleanup ──────────────────────────────────────────────────");
  await db.from("domain_kitchen_players").delete().eq("wallet", WALLET);
  await db.from("domain_kitchen_sessions").delete().in("token", [TOKEN, EXPIRED]);
  ok("test rows removed", true);

  if (failures > 0) {
    console.error(`\nroute check FAIL (${failures})`);
    process.exit(1);
  }
  console.log("\nroute check PASS");
})();
