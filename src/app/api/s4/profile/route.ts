/**
 * Season 4 — the caller's OWN record for the Profile page (/s4/profile).
 *
 *   POST /api/s4/profile  { t }  ->  { points, rank, team, teamStanding, held, holdings, discordLinked }
 *
 * Gated by a play-session token (game-session on web, tg-session in Telegram).
 * The web home of the "personnel file": Bounty, team standing, holdings, and
 * whether Discord is linked (so the page can prompt to link). Team standing
 * comes from the SAME snapshot the board uses (teams sorted by Bounty). No other
 * player's data; the only dollars are the player's OWN holdings (their data,
 * behind their session) — never a projected payout.
 */
import { NextResponse } from "next/server";
import { s4Db, SEASON_KEY } from "@/lib/s4/server";
import { getSeasonSnapshot } from "@/lib/s4/data";
import { walletForSession } from "@/lib/s4/me";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
function ownName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "Agent";
  if (WALLET_RE.test(s)) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  return s.slice(0, 28);
}

export async function POST(req: Request) {
  let body: { t?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const db = s4Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
  }

  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("points, rank, team_key, held_usd_total, discord_id, display_name")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();

  let snap = null;
  try {
    snap = await getSeasonSnapshot();
  } catch {
    snap = null;
  }
  const teams = snap?.teams ?? [];
  const teamKey = typeof player?.team_key === "string" ? player.team_key : null;
  const teamIdx = teamKey ? teams.findIndex((x) => x.key === teamKey) : -1;
  const team = teamIdx >= 0 ? teams[teamIdx] : null;

  const { data: hold } = await db
    .from("launch_wars_s4_holdings")
    .select("domain, held_usd")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .gt("held_usd", 0);
  const holdings = (hold ?? [])
    .map((h) => ({ domain: String(h.domain || ""), held: Math.round(Number(h.held_usd) || 0) }))
    .sort((a, b) => b.held - a.held);

  return NextResponse.json({
    ok: true,
    enlisted: !!player,
    name: ownName(player?.display_name),
    points: Math.round(Number(player?.points) || 0),
    rank: Math.max(1, Math.min(12, Number(player?.rank) || 1)),
    team: team ? { key: team.key, name: team.name, accent: team.accent } : null,
    teamStanding: teamIdx >= 0 ? teamIdx + 1 : 0,
    teamCount: teams.length,
    heldTotal: Math.round(Number(player?.held_usd_total) || 0),
    holdings,
    discordLinked: !!player?.discord_id,
    contractsClosed: snap?.totals?.bonded ?? 0,
    contractsTotal: snap?.totals?.total ?? 0,
  });
}
