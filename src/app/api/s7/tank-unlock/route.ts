/**
 * Season 5, unlock ONE tank with Shells. POST /api/s7/tank-unlock  { t, tank }
 *
 * MONEY PATH: it spends Shells, so it mirrors the proven /api/s4/upgrade
 * discipline EXACTLY:
 *   - session-authed (walletForSession); never trust a client address,
 *   - server-priced (TANK_TIER_PRICES by roster tier); never trust a client price,
 *   - tier-1 tanks are free starter picks (auto-owned): nothing to buy,
 *   - spend fail-closed via s7_grant (ok:false, no throw, on overspend), then
 *     RE-READ the fresh row for the post-spend updated_at (the bot bug where a
 *     pre-spend updated_at made the write always fail + refund),
 *   - optimistic-lock the hq write on that fresh updated_at,
 *   - REFUND the spend if the write dies, so a dead write never eats Shells,
 *   - the hq JSONB is spread-merged (bot-owned keys never dropped); the new
 *     tank joins hq.tanks_owned forever and is fielded (hq.tank) on unlock.
 */
import { NextResponse } from "next/server";
import { SHELLS_PER_RUN } from "@/lib/s7/games";
import { s7Db, SEASON_KEY } from "@/lib/s7/server";
import { walletForSession, hqObject } from "@/lib/s7/me";
import { ownedTankKeys, resolveTank } from "@/lib/s7/model";
import { tankByKey, TANK_TIER_PRICES } from "@/lib/s7/tanks";
import { DEFAULT_THEME } from "@/lib/s7/theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  let body: { t?: string; tank?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json");
  }
  const tank = tankByKey(String(body.tank || ""));
  if (!tank) return bad("Unknown tank.");

  const db = s7Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  const { data: player } = await db
    .from("launch_wars_s7_players")
    .select("hq, play_currency, display_name, updated_at, is_test")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (!player) return bad("No commander for this wallet yet. Enlist at /s7/join first.", 404);

  const isTest = !!player.is_test;
  const shells = Math.round(Number(player.play_currency) || 0);
  const owned = ownedTankKeys(player.hq);

  // Already owned (tier-1 free picks included): nothing to buy. Cosmetic
  // fielding is /api/s7/hq's job; report ownership honestly instead of
  // double-charging a race'd double tap.
  if (owned.includes(tank.key)) {
    return NextResponse.json({ ok: false, already: true, error: "Already in your garage. Field it from the tank panel." });
  }

  // SERVER price by roster tier (never the client's number).
  const price = TANK_TIER_PRICES[tank.tier];
  if (!price || price <= 0) {
    // Tier 1 and any misconfigured zero-price tier: free picks are auto-owned,
    // so reaching here means the roster changed under us. Fail closed.
    return bad("That tank is a free starter pick. Field it from the tank panel.");
  }

  // 1) Spend Shells, fail-closed (s7_grant rejects an overspend with ok:false).
  let spent = false;
  try {
    const { data } = await db.rpc("s7_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: player.display_name ?? null,
      p_points: 0,
      p_play_currency: -price,
      p_reason: "tank:unlock",
      p_meta: { tank: tank.key, tier: tank.tier, price, src: "web" },
      p_is_test: isTest,
    });
    const row = Array.isArray(data) ? data[0] : data;
    spent = !!(row && row.ok);
  } catch {
    spent = false;
  }
  if (!spent) {
    return bad(
      `You need ${price.toLocaleString()} ${DEFAULT_THEME.playCurrency} for the ${tank.name}. You have ${shells.toLocaleString()}. A banked arcade run pays ${SHELLS_PER_RUN}, and holding a stronghold pays every day.`,
    );
  }

  // 2) The spend bumped updated_at: RE-READ the fresh row and merge into it.
  const { data: fresh } = await db
    .from("launch_wars_s7_players")
    .select("hq, updated_at")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  const baseHq = hqObject(fresh?.hq);
  const priorOwned = Array.isArray(baseHq.tanks_owned)
    ? (baseHq.tanks_owned as unknown[]).filter((k): k is string => typeof k === "string")
    : [];
  const ownedSet = new Set<string>(priorOwned);
  ownedSet.add(tank.key);
  // SPREAD: bot-owned keys (crates/streak/bonds_tier/peak_usd/decals) ride along.
  const newHq: Record<string, unknown> = { ...baseHq, tanks_owned: Array.from(ownedSet), tank: tank.key };

  // 3) Optimistic-lock the write on the fresh updated_at; REFUND on failure.
  let writeQ = db
    .from("launch_wars_s7_players")
    .update({ hq: newHq, updated_at: new Date().toISOString() })
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet);
  if (fresh?.updated_at) writeQ = writeQ.eq("updated_at", fresh.updated_at);
  const { data: written, error } = await writeQ.select("hq, play_currency");
  if (error || !written || !written.length) {
    await db
      .rpc("s7_grant", {
        p_season_key: SEASON_KEY,
        p_wallet: wallet,
        p_display_name: player.display_name ?? null,
        p_points: 0,
        p_play_currency: price,
        p_reason: "tank:refund",
        p_meta: { tank: tank.key, reason: "write_failed", src: "web" },
        p_is_test: isTest,
      })
      .then(null, () => {});
    return NextResponse.json(
      { ok: false, error: `Could not complete the unlock. Your ${DEFAULT_THEME.playCurrency} are untouched, try again.` },
      { status: 409 },
    );
  }

  const savedHq = written[0].hq;
  return NextResponse.json({
    ok: true,
    tank: resolveTank(savedHq),
    ownedTanks: ownedTankKeys(savedHq),
    shells: Math.round(Number(written[0].play_currency) || 0),
  });
}
