import { NextResponse } from "next/server";
import { dkDb, DK_GAME_KEY } from "@/lib/chef/server";

/**
 * WHICH CAMPAIGNS ARE LIVE (M10). Public, unauthenticated, and deliberately
 * thin.
 *
 * Public because play is never wallet-gated (ADR-0048): somebody with no
 * wallet still deserves to know a campaign is running, since that is the
 * reason to go and get one. The authenticated save route is the wrong place
 * for it.
 *
 * ── WHAT IT WILL NEVER RETURN ────────────────────────────────────────────
 * The pot. Anyone's share. Any dollar figure at all. ADR-0042: the ladder is
 * public and the payout math is private, and a live mid-week forecast is
 * forbidden outright because pro-rata estimates can go DOWN. This returns
 * which market is running and when the current window closes. That is all a
 * player needs and all they may have.
 */

export const runtime = "nodejs";
// a campaign changes at most twice a day; a minute of staleness is nothing
export const revalidate = 60;

const WINDOW_MS = 12 * 60 * 60 * 1000;

export async function GET() {
  try {
    const db = dkDb();
    const { data, error } = await db
      .from("domain_kitchen_campaigns")
      .select("market, ends_at")
      .eq("game_key", DK_GAME_KEY)
      .eq("status", "live");
    if (error) return NextResponse.json({ ok: true, campaigns: [] });

    const now = Date.now();
    // the boundary the ingest also floors to, so the countdown the player sees
    // is the same window the job will actually score
    const windowEnds = Math.ceil(now / WINDOW_MS) * WINDOW_MS;

    const campaigns = (data ?? [])
      .filter((c) => {
        const ends = Date.parse(String(c.ends_at));
        return !Number.isFinite(ends) || ends > now;
      })
      .map((c) => ({
        market: String(c.market),
        endsAt: String(c.ends_at),
        windowEndsAt: new Date(windowEnds).toISOString(),
      }));

    return NextResponse.json({ ok: true, campaigns });
  } catch {
    // a campaign lookup that fails is a card that does not appear, never a
    // broken game
    return NextResponse.json({ ok: true, campaigns: [] });
  }
}
