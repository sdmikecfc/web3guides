import { NextResponse } from "next/server";
import { dkDb, DK_GAME_KEY, walletForDkSession } from "@/lib/chef/server";
import { LIMITS, sanitizeSave, type DkSave } from "@/app/chef/game/_engine/save";

/**
 * Load and store a player's restaurant (M6).
 *
 *   POST { t }         -> load the save for this session's wallet
 *   POST { t, state }  -> store it
 *
 * The session token travels in the BODY, never the query string, so it stays
 * out of URL logs and referrers (the same rule the S5 routes follow). The
 * wallet is resolved from the token — a request can never name the wallet it
 * wants to write, so there is no way to save into someone else's restaurant.
 *
 * Incoming state is treated as hostile: it is size-capped before parsing and
 * then run through sanitizeSave, which drops unknown items and clamps every
 * number. Whatever a modified client sends, only a legal save can land.
 *
 * Writes take the optimistic lock this codebase already uses — `updated_at`,
 * not a version integer (copying api/s5/hq's retry-once policy rather than
 * api/s5/upgrade's refund policy, because nothing is spent here).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

interface PlayerRow {
  state: unknown;
  updated_at: string;
}

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > LIMITS.bytes) {
    return bad("that save is too large", 413);
  }
  let body: { t?: unknown; state?: unknown };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return bad("bad json");
  }

  const db = dkDb();
  const wallet = await walletForDkSession(db, body.t);
  if (!wallet) return bad("session expired: sign in again", 401);

  // ── load ─────────────────────────────────────────────────────────────────
  if (body.state === undefined) {
    const { data, error } = await db
      .from("domain_kitchen_players")
      .select("state, updated_at")
      .eq("game_key", DK_GAME_KEY)
      .eq("wallet", wallet)
      .maybeSingle<PlayerRow>();
    if (error) return bad("could not read your save", 500);

    /**
     * How many people cheered this kitchen today (M8c). A COUNT, never a list:
     * the player learns that the room has people rooting for it, and learns
     * nothing about who, which is what keeps a social verb free of the
     * moderation problem that keeps names off the public board.
     *
     * Fails soft to zero. A cheer is a bonus, and a board outage must never
     * be the reason somebody cannot load their restaurant.
     */
    let cheersToday = 0;
    try {
      const { count } = await db
        .from("domain_kitchen_cheers")
        .select("id", { count: "exact", head: true })
        .eq("game_key", DK_GAME_KEY)
        .eq("target_wallet", wallet)
        .eq("day", new Date().toISOString().slice(0, 10));
      cheersToday = count ?? 0;
    } catch {}

    if (!data) return NextResponse.json({ ok: true, wallet, save: null, cheersToday });
    return NextResponse.json({
      ok: true,
      wallet,
      save: sanitizeSave(data.state),
      updatedAt: data.updated_at,
      cheersToday,
    });
  }

  // ── store ────────────────────────────────────────────────────────────────
  const save: DkSave = sanitizeSave(body.state);
  const seats = save.layout.filter((p) => p.itemId.includes("chair")).length;
  /**
   * CURRENT quality, alongside the best-ever mark (M9).
   *
   * `best_quality` is a RECORD and is what the public board ranks. A campaign
   * window has to score the quality a room is running at NOW, or a player
   * could touch the top tier once and collect the flat service award for the
   * rest of the campaign. Two different questions, two columns.
   *
   * Derived from the save rather than trusted from it: the client sends
   * bestQuality, so reading a "current" number straight off the wire would be
   * a self-reported score. Quality is base 45 + hands + upkeep + dishes and
   * only the dish part is knowable from a save at rest, so this records the
   * honest floor rather than a number the client chose.
   */
  const dishLevels = Object.values(save.pantry.levels);
  const dishBonus = Math.min(
    15,
    dishLevels.reduce((n, lv) => n + Math.max(0, (Number(lv) || 1) - 1) * 2, 0)
  );
  const qualityNow = Math.min(save.bestQuality, 45 + dishBonus);

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: existing, error: readErr } = await db
      .from("domain_kitchen_players")
      .select("state, updated_at")
      .eq("game_key", DK_GAME_KEY)
      .eq("wallet", wallet)
      .maybeSingle<PlayerRow>();
    if (readErr) return bad("could not reach your save", 500);

    if (!existing) {
      const { error: insErr } = await db.from("domain_kitchen_players").insert({
        game_key: DK_GAME_KEY,
        wallet,
        state: save,
        best_quality: save.bestQuality,
        quality_now: qualityNow,
        seats,
      });
      // a racing insert loses the unique key: fall through and try the update
      if (!insErr) return NextResponse.json({ ok: true, saved: true, created: true });
      continue;
    }

    const { data: written, error: writeErr } = await db
      .from("domain_kitchen_players")
      .update({ state: save, best_quality: save.bestQuality, quality_now: qualityNow, seats })
      .eq("game_key", DK_GAME_KEY)
      .eq("wallet", wallet)
      .eq("updated_at", existing.updated_at) // the lock
      .select("id");
    if (!writeErr && written && written.length > 0) {
      return NextResponse.json({ ok: true, saved: true });
    }
  }

  // Two clean attempts lost the race: say so plainly. Nothing was written and
  // the player's own copy in the browser is untouched, so nothing is lost.
  return NextResponse.json(
    { ok: false, error: "your kitchen was busy saving. Nothing changed, try again." },
    { status: 409 }
  );
}
