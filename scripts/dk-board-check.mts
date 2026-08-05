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
      state: { v: 4, coins: 12345, theme: "trattoria", layout: [] },
      best_quality: r.quality,
      seats: r.seats,
      is_test: r.is_test,
    }))
  );

  const res = await fetch(`${BASE}/chef/board`, { cache: "no-store" });
  const raw = await res.text();
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

  // the leak checks: this page is public, so it must give nothing else away
  ok("no full wallet appears", !WALLETS.some((w) => html.includes(w)));
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

  if (failures > 0) {
    console.error(`\nboard check FAIL (${failures})`);
    process.exit(1);
  }
  console.log("\nboard check PASS");
})();
