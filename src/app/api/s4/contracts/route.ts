/**
 * Season 4 — the live CONTRACT COUNTDOWN feed for the global ticker (Mike
 * 2026-07-18: "Countdowns very obvious everywhere. It should shill these
 * contracts"). Public, cached, tiny: each target's status, progress, and the
 * bond-window expiry (launch + 7 days, the protocol's bonding window).
 *
 *   GET /api/s4/contracts -> { ok, now, contracts: [{ domain, status, pct, expiresAt, lockedUsd }] }
 *
 * No wallets, no payout math — but each contract DOES carry its weighted pool
 * dollar (Mike 2026-07-20: "these people speak money"): locked while live,
 * unlocked once bonded. The client ticks locally; this refreshes on the
 * snapshot's 60s cadence.
 */
import { NextResponse } from "next/server";
import { getSeasonSnapshot } from "@/lib/s4/data";

export const revalidate = 60;

const BOND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // launch + 7 days to bond

export async function GET() {
  try {
    const snap = await getSeasonSnapshot();
    const contracts = (snap.targets || [])
      .filter((t) => t.launched && (t.status === "live" || t.status === "bonded" || t.status === "failed"))
      .map((t) => ({
        domain: t.domain,
        status: t.status,
        pct: Math.round(Math.max(0, Math.min(1, t.progress)) * 100),
        expiresAt:
          t.status === "live" && t.launchAt
            ? new Date(new Date(t.launchAt).getTime() + BOND_WINDOW_MS).toISOString()
            : null,
        // The contract's weighted slice of the pool (FDV-raise weighting): the
        // number players fight for. Locked while live, banked once bonded.
        lockedUsd: Math.round(Math.max(0, t.poolShare || 0)),
      }));
    return NextResponse.json({ ok: true, now: Date.now(), contracts });
  } catch {
    return NextResponse.json({ ok: false, contracts: [] }, { status: 200 });
  }
}
