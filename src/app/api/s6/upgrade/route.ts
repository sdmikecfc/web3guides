/**
 * Season 5 — buy ONE stat level on the web (the Workbench's Upgrades shelf).
 *
 *   POST /api/s6/upgrade  { t, stat }  ->  { ok, stats, shells, milestoneTank? }
 *
 * The web twin of the bot's stat shop. MONEY PATH: it spends Shells, so it
 * mirrors /api/s4/upgrade's hard-won discipline EXACTLY —
 *   - session-authed (walletForSession); never trust a client address,
 *   - server-priced (statNextPrice); never trust a client-sent price,
 *   - spend fail-closed via s5_grant (ok:false, no throw, on overspend), then
 *     RE-READ the row for the post-spend updated_at (the bot bug where the
 *     pre-spend updated_at made the level write always fail + refund),
 *   - optimistic-lock the level write on that fresh updated_at,
 *   - REFUND the spend if the write dies, so a dead write never eats Shells.
 *
 * ONE addition over the S4 route: STAT MILESTONE TANKS. Maxing a stat drops
 * that stat's signature tank into hq.tanks_owned in the SAME write (levels
 * live in `skin`, garages in `hq`; one UPDATE carries both columns, so the
 * lock covers them together). The grant is idempotent by construction — a
 * tank key is added to a set — and the bot's daily sweep runs the same table
 * as a catch-up for Discord-side buys.
 */
import { NextResponse } from "next/server";
import { s6Db, SEASON_KEY } from "@/lib/s6/server";
import { walletForSession, hqObject } from "@/lib/s6/me";
import { clampStats, statNextPrice, STAT_LABELS, type StatKey } from "@/lib/s6/games";
import { ownedTankKeys, STAT_MILESTONE_TANKS } from "@/lib/s6/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAT_KEYS: StatKey[] = ["botox", "drugs", "ozempic", "aura", "optics"];

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const skinOf = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export async function POST(req: Request) {
  let body: { t?: string; stat?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json");
  }
  const stat = String(body.stat || "").toLowerCase().trim() as StatKey;
  if (!STAT_KEYS.includes(stat)) return bad("Unknown upgrade.");

  const db = s6Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  const { data: player } = await db
    .from("launch_wars_s6_players")
    .select("skin, hq, play_currency, display_name, updated_at, is_test")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (!player) return bad("No commander for this wallet yet. Enlist at /s6/join first.", 404);

  const name = STAT_LABELS[stat].name;
  const level = clampStats(player.skin)[stat];
  const price = statNextPrice(stat, level);
  if (price === null) return bad(`${name} is already at its top level.`);
  const shells = Math.round(Number(player.play_currency) || 0);
  const isTest = !!player.is_test;

  // 1) Spend Shells, fail-closed (s5_grant rejects an overspend with ok:false).
  let spent = false;
  try {
    const { data } = await db.rpc("s5_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: player.display_name ?? null,
      p_points: 0,
      p_play_currency: -price,
      p_reason: "shop:stat",
      p_meta: { stat, to: level + 1, src: "web" },
      p_is_test: isTest,
    });
    const row = Array.isArray(data) ? data[0] : data;
    spent = !!(row && row.ok);
  } catch {
    spent = false;
  }
  if (!spent) {
    return bad(
      `You need ${price.toLocaleString()} Shells for the next ${name}. You have ${shells.toLocaleString()}. Earn more in the arcade and raids.`,
    );
  }

  // 2) The spend bumped updated_at: re-read the FRESH row and merge into it.
  const { data: fresh } = await db
    .from("launch_wars_s6_players")
    .select("skin, hq, updated_at")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  const baseSkin = skinOf(fresh?.skin);
  const newSkin: Record<string, unknown> = { ...baseSkin, [stat]: level + 1 };

  // The milestone: maxing this stat drops its signature tank into the garage.
  const hq = hqObject(fresh?.hq);
  const milestone = STAT_MILESTONE_TANKS.find((m) => m.stat === stat && level + 1 >= m.atLevel);
  const alreadyOwned = milestone ? ownedTankKeys(hq).includes(milestone.tank) : true;
  const update: Record<string, unknown> = { skin: newSkin, updated_at: new Date().toISOString() };
  if (milestone && !alreadyOwned) {
    const owned = new Set<string>(Array.isArray(hq.tanks_owned) ? (hq.tanks_owned as unknown[]).filter((k): k is string => typeof k === "string") : []);
    owned.add(milestone.tank);
    // SPREAD the existing hq: bot-owned keys (crates/streak/bonds_tier/camos)
    // ride along untouched, the same rule every hq writer follows.
    update.hq = { ...hq, tanks_owned: Array.from(owned) };
  }

  // 3) Optimistic-lock the write on the fresh updated_at; refund on failure.
  let writeQ = db
    .from("launch_wars_s6_players")
    .update(update)
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet);
  if (fresh?.updated_at) writeQ = writeQ.eq("updated_at", fresh.updated_at);
  const { data: written, error } = await writeQ.select("skin, hq, play_currency");
  if (error || !written || !written.length) {
    await db
      .rpc("s5_grant", {
        p_season_key: SEASON_KEY,
        p_wallet: wallet,
        p_display_name: player.display_name ?? null,
        p_points: 0,
        p_play_currency: price,
        p_reason: "shop:refund",
        p_meta: { stat, reason: "write_failed", src: "web" },
        p_is_test: isTest,
      })
      .then(null, () => {});
    return NextResponse.json(
      { ok: false, error: "Could not complete the upgrade. Your Shells are untouched, try again." },
      { status: 409 },
    );
  }

  const saved = written[0];
  return NextResponse.json({
    ok: true,
    stats: clampStats(saved.skin),
    shells: Math.max(0, Math.round(Number(saved.play_currency) || 0)),
    ownedTanks: ownedTankKeys(hqObject(saved.hq)),
    // Named so the client can celebrate it; null when this level was not the top.
    milestoneTank: milestone && !alreadyOwned ? milestone.tank : null,
  });
}
