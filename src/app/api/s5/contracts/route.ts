/**
 * Season 5, the live STRONGHOLD feed (port of /api/s4/contracts). Public,
 * cached, tiny: each target's status, siege progress, bond-window expiry
 * (launch + 7 days), and the pool dollars its breach unlocks.
 *
 *   GET /api/s5/contracts -> { ok, now, contracts: [{ domain, status, pct, expiresAt, lockedUsd }] }
 *
 * No wallets, no payout math beyond the snapshot's shared weighting.
 */
import { NextResponse } from "next/server";
import { getSeasonSnapshot } from "@/lib/s5/data";

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
        lockedUsd: Math.round(Math.max(0, t.poolShare || 0)),
      }));
    return NextResponse.json({ ok: true, now: Date.now(), contracts });
  } catch {
    return NextResponse.json({ ok: false, contracts: [] }, { status: 200 });
  }
}
