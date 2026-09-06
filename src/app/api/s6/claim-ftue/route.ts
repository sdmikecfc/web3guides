/**
 * Season 5, claim the FTUE "First Colors" decal. POST /api/s6/claim-ftue  { t }
 *
 * The last step of the footlocker quest chain: once a commander holds $5+,
 * they may claim the first-colors decal onto hq.decals. IDEMPOTENT by design:
 * the bot's crate sweep also grants first-colors, so a claim that finds it
 * already there is a graceful no-op ({ already: true }, the UI says "Already
 * flying your colors"). Cosmetic only, no ledger, no Shells.
 *
 * Discipline: session-authed; heldUsd from the player row (held_usd_total,
 * the bot's hourly ingest); the hq write SPREADS the fresh row so bot-owned
 * keys are never dropped; optimistic-lock on updated_at with one retry.
 */
import { NextResponse } from "next/server";
import { s6Db, SEASON_KEY } from "@/lib/s6/server";
import { walletForSession, hqObject, heldUsdOf } from "@/lib/s6/me";

export const runtime = "nodejs";

const DECAL = "first-colors";

export async function POST(req: Request) {
  let body: { t?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const db = s6Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: player } = await db
      .from("launch_wars_s6_players")
      .select("hq, held_usd_total, updated_at")
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet)
      .maybeSingle();
    if (!player) {
      return NextResponse.json(
        { ok: false, error: "No commander for this wallet yet. Enlist at /s6/join first." },
        { status: 404 },
      );
    }

    const hq = hqObject(player.hq);
    const decals = Array.isArray(hq.decals)
      ? (hq.decals as unknown[]).filter((d): d is string => typeof d === "string")
      : [];

    // The bot may have granted it via the crate sweep already: graceful no-op.
    if (decals.includes(DECAL)) {
      return NextResponse.json({ ok: true, already: true, decals });
    }

    const heldUsd = heldUsdOf(player as Record<string, unknown>);
    if (heldUsd < 5) {
      return NextResponse.json(
        { ok: false, error: "First Colors needs a $5 hold on the field. Arm up first." },
        { status: 400 },
      );
    }

    // SPREAD the fresh hq (bot-owned keys ride along), append the decal.
    const newHq: Record<string, unknown> = { ...hq, decals: [...decals, DECAL] };
    let writeQ = db
      .from("launch_wars_s6_players")
      .update({ hq: newHq, updated_at: new Date().toISOString() })
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet);
    if (player.updated_at) writeQ = writeQ.eq("updated_at", player.updated_at);
    const { data: written, error } = await writeQ.select("hq");
    if (!error && written && written.length) {
      const savedHq = hqObject(written[0].hq);
      const savedDecals = Array.isArray(savedHq.decals)
        ? (savedHq.decals as unknown[]).filter((d): d is string => typeof d === "string")
        : [];
      return NextResponse.json({ ok: true, granted: true, decals: savedDecals });
    }
    // Lock miss (bot sweep bumped the row): retry once with a fresh read; the
    // fresh read also re-checks whether the sweep granted the decal meanwhile.
  }
  return NextResponse.json(
    { ok: false, error: "HQ is busy right now. Nothing changed, try again." },
    { status: 409 },
  );
}
