import { NextResponse } from "next/server";
import { dkDb, DK_GAME_KEY, walletForDkSession } from "@/lib/chef/server";
import { walletForHandle } from "@/lib/chef/board";

/**
 * Cheer another player's kitchen (M8c) — the game's first social verb.
 *
 *   POST { t, target }  -> cheer that wallet's restaurant, once today
 *
 * Same contract as api/chef/save: the session token travels in the BODY, and
 * the CHEERER is resolved from the token, never named by the request. The only
 * thing a caller may choose is who to cheer, which is public information (it
 * is a row on the board).
 *
 * What a cheer can carry is exactly +1. There is no message, no rating and no
 * way to cheer AT somebody, which is what keeps this free of the moderation
 * problem that keeps names off the board in the first place.
 *
 * The "once per target per day" rule lives in the table's UNIQUE key rather
 * than in a check here: a route can forget, an index cannot. A duplicate comes
 * back as a kind "already cheered" rather than an error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How many kitchens one player can cheer in a day.
 *
 * NOT exported: a Next route module may only export its handlers and a fixed
 * set of config keys, and exporting this failed the build. `dk-cheer-check`
 * reads the number out of this file's source instead, so the two still cannot
 * drift apart.
 */
const CHEERS_PER_DAY = 5;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

const utcDay = (): string => new Date().toISOString().slice(0, 10);

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > 2_000) return bad("that request is too large", 413);
  let body: { t?: unknown; handle?: unknown };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return bad("bad json");
  }

  const db = dkDb();
  const wallet = await walletForDkSession(db, body.t);
  if (!wallet) return bad("session expired: sign in again", 401);

  /**
   * The caller names a kitchen by the HANDLE the board showed them, not by
   * address, so the page never has to carry a full wallet into the browser.
   * Resolution is server-side and refuses anything not currently ON the board,
   * which also means a cheer cannot be aimed at a wallet that never opted in
   * by playing.
   */
  const handle = String(body.handle ?? "");
  if (!handle || handle.length > 64) return bad("that is not a kitchen");
  const target = await walletForHandle(handle);
  if (!target) return bad("that kitchen is not on the board");
  // You need a kitchen of your own to cheer one, and you cannot cheer your own.
  if (target === wallet) return bad("that one is yours already");

  const day = utcDay();

  // the daily allowance, so cheering is a thing you spend attention on
  const { count, error: countErr } = await db
    .from("domain_kitchen_cheers")
    .select("id", { count: "exact", head: true })
    .eq("game_key", DK_GAME_KEY)
    .eq("cheerer_wallet", wallet)
    .eq("day", day);
  if (countErr) return bad("could not reach the board", 500);
  if ((count ?? 0) >= CHEERS_PER_DAY) {
    return NextResponse.json(
      { ok: false, error: "that is all your cheers for today. More tomorrow." },
      { status: 429 }
    );
  }

  const { error: insErr } = await db.from("domain_kitchen_cheers").insert({
    game_key: DK_GAME_KEY,
    cheerer_wallet: wallet,
    target_wallet: target,
    day,
  });
  if (insErr) {
    // 23505 = the unique key did its job. Not an error the player caused.
    if (String((insErr as { code?: string }).code) === "23505") {
      return NextResponse.json({ ok: true, already: true });
    }
    return bad("could not send that cheer", 500);
  }

  const left = CHEERS_PER_DAY - ((count ?? 0) + 1);
  return NextResponse.json({ ok: true, left });
}
