/**
 * Campaign ingest gate (M9, ADR-0111 + ADR-0113's lesson).
 *
 * This job is the closest thing in Domain Kitchen to money: it decides the
 * SHARES a human will later pay out. So the properties worth proving are not
 * "does it compute" but "can it fail in a way that looks like success".
 *
 *   * unauthenticated -> 401, and no window row is written
 *   * a campaign that cannot be measured -> the WINDOW is recorded as failed,
 *     with a reason and NO shares, and the response is non-OK
 *     (ADR-0113: a swallowed per-wallet error once paid $0 to everyone and
 *     looked completely legitimate)
 *   * running twice for the same window -> ONE row, not two (idempotent)
 *   * nothing the job writes is ever marked settled
 *   * no dollar figure is stored anywhere in a window row
 *
 * Seeds a draft campaign, drives the live route, cleans up after itself.
 * Start the dev server, then: npx tsx scripts/dk-ingest-check.mts [baseUrl]
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

const MARKET = "dk-ingest-test";
const hit = (secret?: string) =>
  fetch(`${BASE}/api/chef/campaign/ingest`, {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const windowsFor = async (campaignId: number) => {
  const { data } = await db
    .from("domain_kitchen_windows")
    .select("id, entries, shares, distributed, wallets, error, settled_at")
    .eq("campaign_id", campaignId);
  return data ?? [];
};

const cleanup = async () => {
  const { data } = await db
    .from("domain_kitchen_campaigns")
    .select("id")
    .eq("market", MARKET);
  for (const c of data ?? []) {
    await db.from("domain_kitchen_windows").delete().eq("campaign_id", c.id);
  }
  await db.from("domain_kitchen_campaigns").delete().eq("market", MARKET);
};

(async () => {
  const probe = await db.from("domain_kitchen_campaigns").select("id").limit(1);
  if (probe.error) {
    console.error("\ningest check CANNOT RUN: the campaign tables are not there yet.");
    console.error("Apply this in the Supabase SQL editor, then run this again:");
    console.error(
      "  C:\\Users\\Mike\\Desktop\\trading-bot\\doma-reporter\\sql\\domain_kitchen_003_campaigns.sql"
    );
    console.error(`\n(postgres said: ${probe.error.message})`);
    process.exit(2);
  }
  if (!env.CRON_SECRET) {
    console.error("\ningest check CANNOT RUN: CRON_SECRET is not set in .env.local.");
    console.error("The job refuses to run without one, which is the point.");
    process.exit(2);
  }
  // The route reads these from the DEV SERVER's environment, not this
  // process's, so they must be in .env.local — setting them on Vercel is not
  // enough to make this gate pass. Both make the route refuse rather than
  // guess, so without them the gate fails 9 assertions on a bare 503 and says
  // nothing about why (which is exactly how it read on 2026-08-13).
  if (env.DK_OPERATOR_WALLETS === undefined) {
    console.error("\ningest check CANNOT RUN: DK_OPERATOR_WALLETS is not set in .env.local.");
    console.error("The route returns 503 without it, so operator wallets can never be");
    console.error('silently paid (ADR-0111/0121). Add `DK_OPERATOR_WALLETS=none` to declare');
    console.error("there are none, or a comma-separated list of the operator's wallets.");
    process.exit(2);
  }
  if (!env.DOMA_API_KEY) {
    console.error("\ningest check CANNOT RUN: DOMA_API_KEY is not set in .env.local.");
    console.error("measureVolume throws without it, so every window would fail. The key");
    console.error("already exists in doma-reporter/.env and on Vercel; it just is not here.");
    process.exit(2);
  }

  await cleanup();

  console.log("── the job will not run for a stranger ──────────────────────");
  const anon = await hit();
  ok("no bearer token is refused", anon.status === 401, `${anon.status}`);
  const wrong = await hit("not-the-secret");
  ok("a wrong token is refused", wrong.status === 401, `${wrong.status}`);

  const { data: before } = await db.from("domain_kitchen_windows").select("id");
  const countBefore = (before ?? []).length;

  console.log("\n── no live campaign is a quiet no-op ────────────────────────");
  const idle = await hit(env.CRON_SECRET);
  const idleJson = (await idle.json()) as { ok?: boolean; campaigns?: number };
  ok("it succeeds with nothing to do", idle.ok && idleJson.ok === true);
  const { data: after } = await db.from("domain_kitchen_windows").select("id");
  ok("and wrote no windows", (after ?? []).length === countBefore);

  console.log("\n── AN UNMEASURABLE CAMPAIGN FAILS THE WINDOW, LOUDLY ────────");
  // live, but with no token_id: measurement cannot possibly succeed
  const { data: made, error: mkErr } = await db
    .from("domain_kitchen_campaigns")
    .insert({
      game_key: "dk",
      market: MARKET,
      token_address: "0x" + "ab".repeat(20),
      token_id: null,
      weights: {},
      start_fdv: 1000,
      ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: "live",
    })
    .select("id")
    .single();
  if (mkErr || !made) {
    console.error("could not seed a campaign:", mkErr?.message);
    process.exit(1);
  }
  const campaignId = made.id as number;

  const broken = await hit(env.CRON_SECRET);
  const brokenJson = (await broken.json()) as { ok?: boolean; results?: { error?: string }[] };
  ok("the response is NOT ok", broken.status === 500 && brokenJson.ok === false, `${broken.status}`);
  ok("and it says why", !!brokenJson.results?.[0]?.error, brokenJson.results?.[0]?.error ?? "");

  const rows = await windowsFor(campaignId);
  ok("exactly one window row was written", rows.length === 1, `${rows.length}`);
  const w = rows[0] as Record<string, unknown>;
  ok("the row records the failure", typeof w?.error === "string" && !!w.error);
  ok("with NO shares", Array.isArray(w?.shares) && (w.shares as unknown[]).length === 0);
  ok("and nothing distributed", Number(w?.distributed) === 0);
  ok("and it is NOT marked settled", w?.settled_at === null);

  console.log("\n── running it twice does not double a window ────────────────");
  await hit(env.CRON_SECRET);
  const twice = await windowsFor(campaignId);
  ok("still exactly one row", twice.length === 1, `${twice.length}`);

  console.log("\n── a window row carries no money ────────────────────────────");
  const asText = JSON.stringify(twice[0]);
  ok("no dollar figure in the row", !/\$\d/.test(asText));
  ok("no 'paid' or 'payout' field", !/"(paid|payout|amount_usd|dollars)"/i.test(asText));
  ok("shares are fractions, not amounts", Number(twice[0]?.distributed) <= 1);

  await cleanup();
  const left = await windowsFor(campaignId);
  ok("seeded rows removed", left.length === 0);

  if (failures > 0) {
    console.error(`\ningest check FAIL (${failures})`);
    process.exit(1);
  }
  console.log("\ningest check PASS");
})();
