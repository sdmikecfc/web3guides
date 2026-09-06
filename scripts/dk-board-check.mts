/**
 * Spotlight board check (ADR-0111). Seeds a few rooms, confirms the board
 * ranks and labels them correctly and — the part that matters — that it
 * leaks NOTHING it should not: no money, no full wallets, no save contents.
 * Cleans up after itself.
 *
 * Start the dev server, then: npx tsx scripts/dk-board-check.mts [baseUrl]
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

let failures = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok  ${label}${detail ? " · " + detail : ""}`);
  else {
    failures++;
    console.error(`FAIL: ${label} ${detail}`);
  }
};

// three rooms: a star, a middling one, and one that must be excluded
const ROOMS = [
  { wallet: "0x" + "a1".repeat(20), quality: 92, seats: 10, is_test: false },
  { wallet: "0x" + "b2".repeat(20), quality: 64, seats: 4, is_test: false },
  { wallet: "0x" + "c3".repeat(20), quality: 99, seats: 12, is_test: true }, // test row
];
const WALLETS = ROOMS.map((r) => r.wallet);

(async () => {
  await db.from("domain_kitchen_players").delete().in("wallet", WALLETS);
  await db.from("domain_kitchen_players").insert(
    ROOMS.map((r) => ({
      game_key: "dk",
      wallet: r.wallet,
      state: {
        v: 6,
        coins: 12345,
        theme: "trattoria",
        layout: [{ itemId: "table_basic", gx: 2, gy: 3, facing: "se" }],
        // a forged public name: markup plus a bidi override. The board and
        // the visit route must both emit it defanged.
        name: "<b>Grand</b>‮ Cafe",
        crew: { chef: 1, waiter: 2, chefName: "PRIVATE NAME" },
        dials: { parkedUsd: 777, weeklyVolumeUsd: 888 },
      },
      best_quality: r.quality,
      seats: r.seats,
      is_test: r.is_test,
    }))
  );

  /**
   * WAIT FOR THE SEEDED ROWS TO BE VISIBLE, don't just fetch once.
   *
   * /chef/board is ISR with `revalidate = 60`. That cache lives on the SERVER,
   * so `cache: "no-store"` on this fetch does nothing about it: a request made
   * straight after seeding gets the previous render, and the gate fails with
   * "the star room is listed" even though everything works.
   *
   * This is the flake that was previously written off as leftover state. It
   * was the revalidation window all along. Polling until the row appears makes
   * the gate deterministic rather than a coin flip.
   */
  const star = `${ROOMS[0].wallet.slice(0, 6)}…${ROOMS[0].wallet.slice(-4)}`;
  let res!: Response;
  let raw = "";
  const deadline = Date.now() + 90_000;
  for (;;) {
    res = await fetch(`${BASE}/chef/board`, { cache: "no-store" });
    raw = await res.text();
    if (raw.includes(star) || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  ok("the board renders", res.status === 200, `${res.status}`);
  // Next serialises its RSC payload inside <script> tags using $-prefixed
  // refs ("$8", "$undefined"), which look like money to a naive regex. The
  // leak checks below must read what a PERSON sees, not the framework's
  // bookkeeping.
  const html = raw.replace(/<script[\s\S]*?<\/script>/gi, "");

  const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
  ok("the star room is listed", html.includes(short(ROOMS[0].wallet)));
  ok("the middling room is listed", html.includes(short(ROOMS[1].wallet)));
  ok("a TEST room is excluded", !html.includes(short(ROOMS[2].wallet)));

  ok("the top tier is marked", html.includes("The best table in town"));
  ok("the ladder is published", html.includes("THE LADDER") && html.includes("Well run"));

  /**
   * The leak checks. This page is public, so it must give nothing else away.
   *
   * ⚠️ The WALLET check reads `raw`, not the script-stripped `html`. The strip
   * exists for the money regex (Next's RSC refs look like "$8"), and it had
   * quietly weakened this check to nothing: a full wallet handed to a client
   * component lands in the RSC payload, INSIDE a <script>, which is precisely
   * where the strip stopped looking. Caught while adding the Cheer button,
   * which is why that button sends a HANDLE and the server resolves it.
   */
  ok("no full wallet anywhere, INCLUDING the RSC payload",
    !WALLETS.some((w) => raw.includes(w)));
  ok("no coin balance leaks", !html.includes("12345"));
  ok("no dollar figure anywhere", !/\$\d/.test(html));
  ok("no 'win' promise", !/\bwin \$|\bwin a\b/i.test(html));

  // ordering: the 92 must come before the 64
  const iA = html.indexOf(short(ROOMS[0].wallet));
  const iB = html.indexOf(short(ROOMS[1].wallet));
  ok("ranked best first", iA >= 0 && iB >= 0 && iA < iB, `${iA} < ${iB}`);

  await db.from("domain_kitchen_players").delete().in("wallet", WALLETS);
  const { data } = await db.from("domain_kitchen_players").select("id").in("wallet", WALLETS);
  ok("seeded rows removed", (data?.length ?? 0) === 0);

  /**
   * VISIT ROUTE ATTACKER PASS (CUTE+VIRAL). Runs AFTER the board pass and its
   * cleanup in the same flow (the two share the star wallet, so concurrency
   * would race). Same law as the board: assert what IS there, the allowlist
   * exactly, and what can NEVER be there: wallets, money, the private chef
   * name.
   */
  const { handleOf } = await import("../src/lib/chef/board");
  const starWallet = "0x" + "a1".repeat(20);
  const handle = handleOf(starWallet);

  // re-seed just the star (the main pass cleaned up after itself)
  await db.from("domain_kitchen_players").insert({
    game_key: "dk",
    wallet: starWallet,
    state: {
      v: 6,
      coins: 9999,
      theme: "izakaya",
      layout: [{ itemId: "table_basic", gx: 2, gy: 3, facing: "se" }],
      name: "<img src=x>Casa‮ Mia",
      crew: { chef: 1, waiter: 2, chefName: "PRIVATE NAME" },
      dials: { parkedUsd: 777, weeklyVolumeUsd: 888 },
      waiters: 2,
      chefs: 1,
    },
    best_quality: 92,
    seats: 10,
    is_test: false,
  });
  try {
    const res = await fetch(`${BASE}/api/chef/visit/${handle}`, { cache: "no-store" });
    ok("visit: a seeded kitchen answers", res.status === 200, `${res.status}`);
    const raw = await res.text();
    const body = JSON.parse(raw) as Record<string, unknown>;

    const keys = Object.keys(body).sort().join(",");
    ok(
      "visit: the response is EXACTLY the allowlist",
      keys === "crew,hires,layout,name,ok,shell,theme,tier",
      keys
    );
    ok("visit: no wallet anywhere in the raw body", !raw.toLowerCase().includes(starWallet.slice(2, 10)));
    ok("visit: no coins, dials, or pantry", !/"coins"|"dials"|"parkedUsd"|"pantry"/.test(raw));
    ok("visit: the private chef name stays private", !raw.includes("PRIVATE NAME"));
    ok(
      "visit: the forged room name comes out defanged",
      String(body.name).includes("Casa") && !String(body.name).includes("‮"),
      String(body.name)
    );
    ok("visit: layout survives the scrub", Array.isArray(body.layout) && (body.layout as unknown[]).length === 1);

    const bogus = await fetch(`${BASE}/api/chef/visit/zz-not-a-handle-zz`, { cache: "no-store" });
    ok("visit: a bogus handle is a plain 404", bogus.status === 404, `${bogus.status}`);
  } finally {
    await db.from("domain_kitchen_players").delete().eq("wallet", starWallet);
  }

  if (failures > 0) {
    console.error(`\nboard check FAIL (${failures})`);
    process.exit(1);
  }
  console.log("\nboard check PASS");
})();
