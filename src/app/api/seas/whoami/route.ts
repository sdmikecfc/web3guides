/**
 * Conquer the Seas — who is holding this game link?
 *
 *   GET /api/seas/whoami?t=<token>
 *
 * Resolves a launch_wars_s2_game_tokens row (minted by !seas play) to the
 * captain's ship sheet so the games can show their name and apply hull and
 * fitting effects. Expired/unknown tokens 404 (the games fall back to guest
 * practice mode). Read-only.
 */

import { NextResponse } from "next/server";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(t)) {
    return NextResponse.json({ error: "bad token" }, { status: 400 });
  }

  const db = launchWarsDb();
  const { data: tok } = await db
    .from("launch_wars_s2_game_tokens")
    .select("discord_id, season_key, is_test, expires_at")
    .eq("token", t)
    .maybeSingle();

  if (!tok || new Date(tok.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 404 });
  }

  const { data: ship } = await db
    .from("launch_wars_s2_ships")
    .select("discord_id, display_name, faction, hull_usd, fittings, is_test")
    .eq("season_key", tok.season_key)
    .eq("discord_id", tok.discord_id)
    .maybeSingle();

  return NextResponse.json({
    discord_id: tok.discord_id,
    display_name: ship?.display_name || "Captain",
    faction: ship?.faction || null,
    hull_usd: Number(ship?.hull_usd || 0),
    fittings: ship?.fittings || {},
    is_test: Boolean(tok.is_test || ship?.is_test),
  });
}
