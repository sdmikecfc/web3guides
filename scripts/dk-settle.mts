/**
 * CAMPAIGN SETTLEMENT — auto-prepare, a human presses send (ADR-0113 shape).
 *
 * The ingest measures and scores every 12h window. This turns a campaign's
 * windows into ONE payout: a CSV in the same shape the S5 payout tool reads,
 * plus the numbers to check it against. It moves no money and marks nothing
 * paid. That last mile is a person, deliberately, as it has been for four
 * seasons.
 *
 *   npx tsx scripts/dk-settle.mts <campaignId>            dry run, prints only
 *   npx tsx scripts/dk-settle.mts <campaignId> --csv      also writes the CSV
 *   npx tsx scripts/dk-settle.mts <campaignId> --mark-settled
 *                                                         AFTER paying, records it
 *
 * ── WHY ONE PAYOUT AND NOT TWENTY-EIGHT ──────────────────────────────────
 * A trial pot of a couple of hundred dollars over a fortnight is 28 windows at
 * about $7 each. Per window that is cents per player, which is not payable and
 * would mean hundreds of transfers. Measuring every 12h is what stops
 * front-running and rewards sustained behaviour; SETTLING is a separate
 * question, and nothing in the schema ever forced them to match.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────
 * If any window failed to measure, this STOPS. A failed window is not a window
 * that paid nothing; it is a window nobody knows about. The ingest is
 * idempotent and keyed by window_start, and the swaps API can look backwards,
 * so the answer is to RE-RUN that window, not to quietly write it off and pay
 * everyone slightly less. `--force` exists, prints loudly, and should be rare.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { formatUnits, settleShares, trimUnits } from "../src/app/chef/game/_engine/settle";

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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CAMPAIGN_ID = Number(process.argv[2]);
const WRITE_CSV = process.argv.includes("--csv");
const FORCE = process.argv.includes("--force");
const MARK = process.argv.includes("--mark-settled");
/** below this a row is reported but still paid; gas on Doma is ~free */
const DUST_USD = 0.05;

interface Share {
  wallet: string;
  share: number;
  topTier?: boolean;
}
interface WindowRow {
  id: number;
  window_start: string;
  window_end: string;
  shares: Share[] | null;
  distributed: number | null;
  wallets: number | null;
  error: string | null;
  settled_at: string | null;
}


(async () => {
  if (!Number.isFinite(CAMPAIGN_ID)) {
    console.error("usage: npx tsx scripts/dk-settle.mts <campaignId> [--csv] [--mark-settled] [--force]");
    process.exit(2);
  }

  const { data: campaign, error: cErr } = await db
    .from("domain_kitchen_campaigns")
    .select("id, market, token_address, pot_kind, pot_units, pot_decimals, pot_usd, status, starts_at, ends_at")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (cErr || !campaign) {
    console.error(`campaign ${CAMPAIGN_ID} not found${cErr ? `: ${cErr.message}` : ""}`);
    process.exit(1);
  }

  const { data: rows, error: wErr } = await db
    .from("domain_kitchen_windows")
    .select("id, window_start, window_end, shares, distributed, wallets, error, settled_at")
    .eq("campaign_id", CAMPAIGN_ID)
    .order("window_start", { ascending: true });
  if (wErr) {
    console.error(`could not read windows: ${wErr.message}`);
    process.exit(1);
  }
  const windows = (rows ?? []) as WindowRow[];

  /**
   * The pot is a SET AMOUNT in MINOR UNITS: cents for a dollar pot, base units
   * for a token pot. Parsed straight to BigInt and never through a float — 1%
   * of a billion-token supply at 18 decimals is about a billion times past
   * what a float holds exactly.
   */
  const kind = String(campaign.pot_kind || "usd");
  const decimals = Number(campaign.pot_decimals ?? 2);
  let potUnits: bigint;
  try {
    potUnits = BigInt(String(campaign.pot_units ?? "0"));
  } catch {
    console.error(`pot_units is not an integer: ${campaign.pot_units}`);
    process.exit(1);
  }
  const amount = (u: bigint) =>
    kind === "usd" ? `$${formatUnits(u, decimals)}` : `${trimUnits(u, decimals, 6)} tokens`;

  console.log(
    `campaign ${campaign.id} · ${campaign.market} · pot ${amount(potUnits)} (${kind}) · ${campaign.status}`
  );
  console.log(`windows: ${windows.length}`);
  if (windows.length === 0) {
    console.error("no windows recorded. Nothing to settle.");
    process.exit(1);
  }
  if (potUnits <= BigInt(0)) {
    console.error("this campaign has no pot. Set pot_units before settling.");
    process.exit(1);
  }

  // ── the refusal ──────────────────────────────────────────────────────────
  const failed = windows.filter((w) => w.error);
  const already = windows.filter((w) => w.settled_at);
  if (failed.length > 0) {
    console.error(`\n${failed.length} window(s) FAILED to measure:`);
    for (const w of failed.slice(0, 8)) {
      console.error(`  ${w.window_start}  ${w.error}`);
    }
    console.error(
      "\nA failed window is not a window that paid nothing, it is a window nobody"
    );
    console.error("knows about. Re-run the ingest for it (the job is idempotent and the");
    console.error("swaps API looks backwards), then settle. Use --force only deliberately.");
    if (!FORCE) process.exit(1);
    console.error("\n--force given: continuing with those windows worth NOTHING.\n");
  }
  if (already.length > 0 && !MARK) {
    console.error(`\n⚠ ${already.length} window(s) are already marked settled.`);
    console.error("Paying again would double. Check before continuing.");
    if (!FORCE) process.exit(1);
  }

  /**
   * Every window is an equal slice of the pot, so a wallet's share of the
   * CAMPAIGN is the average of its shares across windows. A window that failed
   * is worth nothing and its slice stays UNSPENT rather than being spread over
   * the others, because inflating the rest would invent a measurement that was
   * never taken.
   */
  const shareOf = new Map<string, number>();
  const seen = new Map<string, number>();
  let distributedFraction = 0;
  for (const w of windows) {
    if (w.error) continue;
    for (const s of w.shares ?? []) {
      const wallet = String(s.wallet || "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(wallet)) continue;
      const share = Number(s.share) || 0;
      if (!(share > 0)) continue;
      // one window is 1/N of the campaign
      shareOf.set(wallet, (shareOf.get(wallet) ?? 0) + share / windows.length);
      seen.set(wallet, (seen.get(wallet) ?? 0) + 1);
    }
    distributedFraction += Number(w.distributed) || 0;
  }

  if (shareOf.size === 0) {
    console.error("\nno wallet earned anything across these windows. Nothing to pay.");
    process.exit(1);
  }

  // the money math lives in _engine/settle.ts as a pure function with a gate:
  // this script must not be the only place the rounding is written down
  const settlement = settleShares(
    [...shareOf.entries()].map(([wallet, share]) => ({
      wallet,
      share,
      windows: seen.get(wallet) ?? 0,
    })),
    potUnits
  );
  const pay = settlement.rows;
  const total = settlement.totalUnits;
  const unspent = settlement.unspentUnits;

  // ── the report ───────────────────────────────────────────────────────────
  console.log(`\n── what the windows say ─────────────────────────────────────`);
  console.log(`each window is worth ${amount(potUnits / BigInt(windows.length))} (pot / ${windows.length})`);
  if (failed.length) console.log(`failed windows, worth nothing: ${failed.length}`);
  console.log(
    `average distribution per window: ${(
      distributedFraction / Math.max(1, windows.length - failed.length)
    ).toFixed(3)} of 1`
  );
  console.log(`\nwallets to pay: ${pay.length}`);
  console.log(`TOTAL: ${amount(total)}`);
  const unspentPct = potUnits > BigInt(0) ? Number((unspent * BigInt(1000)) / potUnits) / 10 : 0;
  console.log(`UNSPENT: ${amount(unspent)} (${unspentPct.toFixed(1)}% of the pot)`);
  console.log("  ADR-0111: with few players the per-wallet cap deliberately leaves a");
  console.log("  window under-distributed. Unspent is expected, not a bug.");

  if (kind === "usd") {
    const dust = pay.filter((r) => r.units < BigInt(Math.round(DUST_USD * 100)));
    if (dust.length) {
      console.log(`\n${dust.length} wallet(s) under $${DUST_USD.toFixed(2)}. Still listed, still paid.`);
    }
  }

  console.log(`\ntop rows:`);
  for (const r of pay.slice(0, 10)) {
    console.log(`  ${r.wallet}  ${amount(r.units).padStart(16)}  ${r.windows} window(s)`);
  }

  // the arithmetic has to close, or nothing else here is trustworthy
  console.log(`\nsums exactly: ${settlement.exact ? "yes" : "NO"}`);
  if (!settlement.exact) {
    console.error("the rows do not sum to the intended total. Refusing to write a CSV.");
    process.exit(1);
  }

  // ── the CSV ──────────────────────────────────────────────────────────────
  if (WRITE_CSV) {
    /**
     * A DOLLAR pot uses the header the S5 payout tool already reads, so the
     * existing pipeline takes it unchanged. A TOKEN pot deliberately does NOT:
     * it gets its own columns, because handing a token payout to a tool that
     * reads `total_usd` would pay dollars for an amount denominated in tokens.
     * Different money, different file.
     */
    const csv =
      kind === "usd"
        ? ["wallet_address,display_name,discord_id,campaign_usd,total_usd"]
            .concat(
              pay.map((r) => {
                const v = formatUnits(r.units, decimals);
                return `${r.wallet},,,${v},${v}`;
              })
            )
            .join("\n") + "\n"
        : ["wallet_address,token_address,token_decimals,amount_base_units,amount_tokens"]
            .concat(
              pay.map(
                (r) =>
                  `${r.wallet},${campaign.token_address},${decimals},${r.units.toString()},${formatUnits(r.units, decimals)}`
              )
            )
            .join("\n") + "\n";
    const dir = join(process.cwd(), "scripts", "payouts");
    mkdirSync(dir, { recursive: true });
    const file = join(
      dir,
      `dk_campaign_${CAMPAIGN_ID}_${campaign.market}_${kind}.csv`
    );
    writeFileSync(file, csv, "utf8");
    console.log(`\nCSV written: ${file}`);
    console.log(`  ${pay.length} rows, ${amount(total)}`);
    if (kind === "token") {
      console.log("  TOKEN payout: base units are the source of truth, not the");
      console.log("  human column. Do not feed this to the USD payout tool.");
    }
  } else {
    console.log(`\n(dry run. Add --csv to write the payout file.)`);
  }

  // ── marking settled: only ever a human, only ever after paying ───────────
  if (MARK) {
    const { error } = await db
      .from("domain_kitchen_windows")
      .update({ settled_at: new Date().toISOString() })
      .eq("campaign_id", CAMPAIGN_ID)
      .is("settled_at", null);
    if (error) {
      console.error(`could not mark settled: ${error.message}`);
      process.exit(1);
    }
    console.log(`\nmarked ${windows.length - already.length} window(s) settled.`);
  } else {
    console.log("\nNothing was marked settled and no money moved.");
    console.log("After you have paid, record it:");
    console.log(`  npx tsx scripts/dk-settle.mts ${CAMPAIGN_ID} --mark-settled`);
  }
})();
