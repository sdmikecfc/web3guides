import { NextResponse } from "next/server";
import type { Address } from "viem";
import { dkDb, DK_GAME_KEY } from "@/lib/chef/server";
import { measureWindow } from "@/lib/chef/measure";
import { scoreWindow, type CampaignWeights } from "@/app/chef/game/_engine/campaign";

/**
 * THE 12-HOUR CAMPAIGN INGEST (M9, completes ADR-0111).
 *
 * ADR-0111 defined the scoring and `_engine/campaign.ts` implemented it as a
 * pure function that nothing ever called. This is the job that calls it:
 * measure a window, score it, store the result as an audit trail.
 *
 *   POST /api/chef/campaign/ingest      (Vercel cron, every 12h)
 *   Authorization: Bearer $CRON_SECRET
 *
 * ── WHAT THIS JOB WILL NEVER DO ──────────────────────────────────────────
 * It does not pay anybody. It does not mint, custody, transfer, or mark
 * anything as settled. It writes measurements and FRACTIONS. A human reads
 * them and sends the money, which is how four seasons have settled and is what
 * ADR-0042/0111 require. There is deliberately no code path here that can set
 * `settled_at`.
 *
 * ── FAIL THE WINDOW, NEVER A WALLET ──────────────────────────────────────
 * ADR-0113: a swallowed per-wallet error once produced "$0 to everyone,
 * looking legitimate". So if measurement throws, this stores a window with the
 * REASON and NO shares, and returns non-OK. A half-measured window is the one
 * outcome that must never be written.
 *
 * ── IDEMPOTENT ──────────────────────────────────────────────────────────
 * The window is keyed by (campaign, window_start) with a UNIQUE index, and the
 * start is floored to the 12h boundary. Running twice for the same window
 * overwrites rather than doubling, so a retry after a partial failure is safe.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** measuring a live campaign walks chain + API; give it room */
export const maxDuration = 300;

const WINDOW_MS = 12 * 60 * 60 * 1000;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** The 12h boundary a moment belongs to, so retries agree on the window. */
function windowStartFor(nowMs: number): number {
  return Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
}

interface CampaignRow {
  id: number;
  market: string;
  token_address: string;
  token_id: number | null;
  weights: Partial<CampaignWeights> | null;
  start_fdv: number | null;
  ends_at: string;
}

interface PlayerRow {
  wallet: string;
  quality_now: number | null;
  updated_at: string;
}

export async function POST(req: Request) {
  // Vercel sends the cron secret as a bearer token. No secret configured means
  // the job is OFF, not open: an unauthenticated ingest could be triggered by
  // anyone to burn API quota.
  const secret = process.env.CRON_SECRET;
  if (!secret) return bad("ingest is not configured", 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return bad("not authorised", 401);
  }

  const db = dkDb();
  const now = Date.now();
  const windowStart = windowStartFor(now);
  // score the window that just CLOSED, never the one still running
  const from = windowStart - WINDOW_MS;
  const to = windowStart;

  const { data: campaigns, error: cErr } = await db
    .from("domain_kitchen_campaigns")
    .select("id, market, token_address, token_id, weights, start_fdv, ends_at")
    .eq("game_key", DK_GAME_KEY)
    .eq("status", "live");
  if (cErr) return bad("could not read campaigns", 500);
  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ ok: true, campaigns: 0, note: "no live campaign" });
  }

  // ADR-0111: operator wallets earn nothing, and a campaign paying its own
  // operator is the exact fact pattern the counsel critique flagged.
  //
  // This used to be `process.env.DK_OPERATOR_WALLETS || ""` followed by a
  // `.filter()` on the address shape, which had TWO silent failure modes and
  // both of them PAID THE OPERATOR: an unset variable produced an empty
  // exclusion set, and a single typo'd address was quietly dropped by the
  // filter so the list still looked configured. Same family as the truncation
  // bugs in measure.ts (ADR-0121) — a guardrail that fails open, quietly.
  //
  // So the variable must be set EXPLICITLY. Set it to "none" to declare, on
  // purpose, that there are no operator wallets to exclude.
  const rawOperators = process.env.DK_OPERATOR_WALLETS;
  if (rawOperators === undefined) {
    return bad(
      "DK_OPERATOR_WALLETS is not set: refusing to score a window that might pay the operator " +
        '(set it to "none" to declare there are none)',
      503
    );
  }
  const excluded = new Set<string>();
  if (rawOperators.trim().toLowerCase() !== "none" && rawOperators.trim() !== "") {
    for (const part of rawOperators.split(",")) {
      const w = part.trim().toLowerCase();
      if (!w) continue;
      if (!/^0x[a-f0-9]{40}$/.test(w)) {
        // Never skip it: a malformed entry means somebody INTENDED to exclude
        // a wallet and it is not being excluded.
        return bad(`DK_OPERATOR_WALLETS contains a malformed address: ${part.trim()}`, 500);
      }
      excluded.add(w);
    }
  }

  const results: unknown[] = [];

  for (const c of campaigns as CampaignRow[]) {
    /** store a window row, whether it worked or not */
    const write = async (row: Record<string, unknown>) => {
      await db
        .from("domain_kitchen_windows")
        .upsert(
          {
            campaign_id: c.id,
            window_start: new Date(from).toISOString(),
            window_end: new Date(to).toISOString(),
            ...row,
          },
          { onConflict: "campaign_id,window_start" }
        );
    };

    try {
      if (!c.token_id) throw new Error("campaign has no token_id: cannot measure volume");

      // everyone with a saved kitchen is a candidate; `active` is whether they
      // actually played inside the window
      const { data: players, error: pErr } = await db
        .from("domain_kitchen_players")
        .select("wallet, quality_now, updated_at")
        .eq("game_key", DK_GAME_KEY)
        .eq("is_test", false);
      if (pErr) throw new Error("could not read players");

      const roster = ((players ?? []) as PlayerRow[]).map((p) => {
        const seen = Date.parse(p.updated_at);
        return {
          wallet: String(p.wallet).toLowerCase(),
          quality: Number(p.quality_now) || 0,
          active: Number.isFinite(seen) && seen >= from && seen < to,
        };
      });

      const measured = await measureWindow({
        token: c.token_address as Address,
        tokenId: Number(c.token_id),
        players: roster,
        fromMs: from,
        toMs: to,
        excluded,
      });

      /**
       * The FDV bonus is measured against the campaign's START, so a campaign
       * cannot be gamed by reopening it high. A missing reading pays ZERO
       * bonus rather than guessing 1: an unknown is not "flat".
       */
      const fdvRatio =
        measured.fdv && c.start_fdv && c.start_fdv > 0 ? measured.fdv / c.start_fdv : 1;

      const result = scoreWindow({
        entries: measured.entries,
        fdvRatio,
        weights: c.weights ?? {},
      });

      await write({
        fdv_ratio: fdvRatio,
        entries: measured.entries,
        shares: result.shares,
        distributed: result.distributed,
        wallets: measured.entries.length,
        error: null,
      });

      results.push({
        market: c.market,
        wallets: measured.entries.length,
        topTier: result.topTierCount,
        distributed: Number(result.distributed.toFixed(6)),
        fdvRatio: Number(fdvRatio.toFixed(4)),
      });
    } catch (e) {
      // the window is recorded as FAILED, with no shares. Loud, not silent.
      const reason = e instanceof Error ? e.message : "unknown measurement failure";
      await write({ entries: [], shares: [], distributed: 0, wallets: 0, error: reason });
      results.push({ market: c.market, error: reason });
    }
  }

  const failed = results.filter((r) => (r as { error?: string }).error).length;
  return NextResponse.json(
    {
      ok: failed === 0,
      window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      results,
    },
    { status: failed === 0 ? 200 : 500 }
  );
}

/** Vercel cron issues GET; accept it and hand off to the same code path. */
export async function GET(req: Request) {
  return POST(req);
}
