/**
 * Cheer route check (M8c). The first social verb touches a public page and
 * another player's game, so every refusal it makes is worth proving:
 *
 *   * no session         -> 401, nothing written
 *   * a kitchen not on the board -> refused (you cannot cheer an arbitrary
 *     address, only somebody who opted in by playing)
 *   * your own kitchen   -> refused
 *   * the same kitchen twice today -> accepted ONCE, then "already"
 *   * past the daily allowance -> 429, and the count stops climbing
 *
 * Mints its own sessions as the operator, drives the live route, and cleans up
 * after itself. Start the dev server, then:
 *   npx tsx scripts/dk-cheer-check.mts [baseUrl]
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * Read the allowance out of the route's SOURCE rather than importing it: the
 * route imports `server-only`, which node cannot resolve. Parsing it means the
 * gate still fails if the number is changed without updating this file.
 */
function cheersPerDay(): number {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/chef/cheer/route.ts"),
    "utf8"
  );
  const m = src.match(/CHEERS_PER_DAY\s*=\s*(\d+)/);
  if (!m) throw new Error("could not find CHEERS_PER_DAY in the cheer route");
  return Number(m[1]);
}

// same env loader the other dk-* gates use; this repo has no dotenv dependency
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
const CHEERS_PER_DAY = cheersPerDay();
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

/** real hex: walletForDkSession regex-gates the shape before the db is touched */
const w = (seed: string) => "0x" + seed.repeat(20);
const CHEERER = w("d1");
const TARGETS = ["e1", "e2", "e3", "e4", "e5", "e6", "e7"].map(w);
const ALL = [CHEERER, ...TARGETS];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = new Date().toISOString().slice(0, 10);

async function session(wallet: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.from("domain_kitchen_sessions").insert({
    token,
    wallet,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  return token;
}

const cheer = (t: string, handle: string) =>
  fetch(`${BASE}/api/chef/cheer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ t, handle }),
  });

const countFor = async (target: string) => {
  const { count } = await db
    .from("domain_kitchen_cheers")
    .select("id", { count: "exact", head: true })
    .eq("target_wallet", target)
    .eq("day", day);
  return count ?? 0;
};

(async () => {
  /**
   * PREFLIGHT. Without the table every insert 500s and the run turns into a
   * dozen confusing failures that all mean one thing. Say the one thing.
   */
  const probe = await db.from("domain_kitchen_cheers").select("id").limit(1);
  if (probe.error) {
    console.error("\ncheer check CANNOT RUN: the cheers table is not there yet.");
    console.error("Apply this in the Supabase SQL editor, then run this again:");
    console.error(
      "  C:\\Users\\Mike\\Desktop\\trading-bot\\doma-reporter\\sql\\domain_kitchen_002_cheers.sql"
    );
    console.error(`\n(postgres said: ${probe.error.message})`);
    process.exit(2);
  }

  // clean slate
  await db.from("domain_kitchen_cheers").delete().in("cheerer_wallet", ALL);
  await db.from("domain_kitchen_cheers").delete().in("target_wallet", ALL);
  await db.from("domain_kitchen_players").delete().in("wallet", ALL);
  await db.from("domain_kitchen_sessions").delete().in("wallet", ALL);

  // everyone needs a room ON the board to be cheerable
  await db.from("domain_kitchen_players").insert(
    ALL.map((wallet, i) => ({
      game_key: "dk",
      wallet,
      state: {},
      best_quality: 70 - i,
      seats: 4,
      is_test: false,
    }))
  );
  // the board is ISR-cached; wait for the seeds to be visible before relying
  // on handle resolution (the same window that used to flake dk-board-check)
  const deadline = Date.now() + 90_000;
  for (;;) {
    const html = await (await fetch(`${BASE}/chef/board`, { cache: "no-store" })).text();
    if (html.includes(short(TARGETS[0])) || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 3_000));
  }

  console.log("── a cheer needs a session, and a real kitchen ──────────────");
  const anon = await cheer("not-a-real-token", short(TARGETS[0]));
  ok("no session is refused", anon.status === 401, `${anon.status}`);
  ok("and nothing was written", (await countFor(TARGETS[0])) === 0);

  const t = await session(CHEERER);
  const ghost = await cheer(t, "0xdead…beef");
  ok("a kitchen not on the board is refused", ghost.status === 400, `${ghost.status}`);

  const self = await cheer(t, short(CHEERER));
  ok("cheering your own kitchen is refused", self.status === 400, `${self.status}`);
  ok("and still nothing written", (await countFor(CHEERER)) === 0);

  console.log("\n── one cheer per kitchen per day ────────────────────────────");
  const first = await cheer(t, short(TARGETS[0]));
  const firstJson = (await first.json()) as { ok?: boolean; already?: boolean };
  ok("the first cheer lands", first.ok && firstJson.ok === true && !firstJson.already);
  ok("the recipient's count is 1", (await countFor(TARGETS[0])) === 1);

  const again = await cheer(t, short(TARGETS[0]));
  const againJson = (await again.json()) as { ok?: boolean; already?: boolean };
  ok("cheering the same kitchen again is kind, not an error", againJson.already === true);
  ok("and it did NOT double-count", (await countFor(TARGETS[0])) === 1);

  console.log("\n── the daily allowance ─────────────────────────────────────");
  let landed = 1; // TARGETS[0] already
  for (let i = 1; i < TARGETS.length; i++) {
    const r = await cheer(t, short(TARGETS[i]));
    if (r.ok) landed++;
    else ok(`cheer ${i + 1} past the allowance is refused`, r.status === 429, `${r.status}`);
  }
  ok(`the allowance holds at ${CHEERS_PER_DAY}`, landed === CHEERS_PER_DAY, `${landed} landed`);

  const { count: spent } = await db
    .from("domain_kitchen_cheers")
    .select("id", { count: "exact", head: true })
    .eq("cheerer_wallet", CHEERER)
    .eq("day", day);
  ok("the table agrees", (spent ?? 0) === CHEERS_PER_DAY, `${spent}`);

  // cleanup
  await db.from("domain_kitchen_cheers").delete().in("cheerer_wallet", ALL);
  await db.from("domain_kitchen_cheers").delete().in("target_wallet", ALL);
  await db.from("domain_kitchen_players").delete().in("wallet", ALL);
  await db.from("domain_kitchen_sessions").delete().in("wallet", ALL);
  const { data: left } = await db.from("domain_kitchen_players").select("id").in("wallet", ALL);
  ok("seeded rows removed", (left?.length ?? 0) === 0);

  if (failures > 0) {
    console.error(`\ncheer check FAIL (${failures})`);
    process.exit(1);
  }
  console.log("\ncheer check PASS");
})();
