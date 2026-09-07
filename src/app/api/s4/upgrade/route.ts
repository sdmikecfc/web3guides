/**
 * Season 4 — buy ONE gear level on the WEB character page (/s4/me shop).
 *
 *   POST /api/s4/upgrade  { t, stat }  ->  ModelState (refreshed)
 *
 * The web twin of the bot's handleStatBuy (modules/season4). MONEY PATH: it
 * spends Gold, so it mirrors that command's hard-won discipline EXACTLY —
 *   - session-authed (walletForSession); never trust a client address,
 *   - server-priced (statNextPrice); never trust a client-sent price,
 *   - spend fail-closed via s4_grant (ok:false, no throw, when it would go
 *     negative), then RE-READ the row for the post-spend updated_at (the bot bug
 *     where the pre-spend updated_at made the level write always fail + refund),
 *   - optimistic-lock the level write on that fresh updated_at,
 *   - REFUND the spend if the write dies, so a dead write never eats Gold,
 *   - the post-buy combo joins owned_models forever (ADR-0015 collection).
 * Prices live in lib/s4/games (mirrored from the bot ECONOMY). Cosmetic looks
 * are handled by /api/s4/wear; this is the only web route that moves Gold.
 */
import { NextResponse } from "next/server";
import { s4Db, SEASON_KEY } from "@/lib/s4/server";
import { getTheme } from "@/lib/s4/data";
import { buildModelState, walletForSession } from "@/lib/s4/me";
import { clampStats, statNextPrice, STAT_LABELS, type StatKey } from "@/lib/s4/games";
import { isModelKey, modelKey } from "@/lib/s4/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAT_KEYS: StatKey[] = ["botox", "drugs", "ozempic", "aura"];

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

  const db = s4Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("skin, play_currency, display_name, updated_at, is_test")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (!player) return bad("No agent for this wallet yet. Enlist at /s4/join first.", 404);

  const name = STAT_LABELS[stat].name;
  const level = clampStats(player.skin)[stat];
  const price = statNextPrice(stat, level);
  if (price === null) return bad(`${name} is already at its top level.`);
  const gold = Math.round(Number(player.play_currency) || 0);
  const isTest = !!player.is_test;

  // 1) Spend Gold, fail-closed (s4_grant rejects an overspend with ok:false).
  let spent = false;
  try {
    const { data } = await db.rpc("s4_grant", {
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
    return bad(`You need ${price.toLocaleString()} Gold for the next ${name}. You have ${gold.toLocaleString()}. Earn more by playing.`);
  }

  // 2) The spend bumped updated_at, so re-read the FRESH row and merge into it
  //    (the exact bug that failed every bot stat buy). Bank the new look.
  const { data: fresh } = await db
    .from("launch_wars_s4_players")
    .select("skin, updated_at")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  const baseSkin = skinOf(fresh?.skin);
  const newSkin: Record<string, unknown> = { ...baseSkin, [stat]: level + 1 };
  const preLv = clampStats(baseSkin);
  const postLv = { ...preLv, [stat]: level + 1 };
  const priorOwned = Array.isArray(baseSkin.owned_models)
    ? (baseSkin.owned_models as unknown[]).filter(isModelKey)
    : null;
  const ownedSet = new Set<string>((priorOwned === null ? [modelKey(preLv)] : priorOwned) as string[]);
  ownedSet.add(modelKey(postLv));
  newSkin.owned_models = Array.from(ownedSet);

  // 3) Optimistic-lock the level write on the fresh updated_at; refund on failure.
  let writeQ = db
    .from("launch_wars_s4_players")
    .update({ skin: newSkin, updated_at: new Date().toISOString() })
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet);
  if (fresh?.updated_at) writeQ = writeQ.eq("updated_at", fresh.updated_at);
  const { data: written, error } = await writeQ.select("skin, team_key, play_currency");
  if (error || !written || !written.length) {
    await db
      .rpc("s4_grant", {
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
      { ok: false, error: "Could not complete the upgrade. Your Gold is untouched, try again." },
      { status: 409 },
    );
  }

  const theme = await getTheme();
  return NextResponse.json(buildModelState(written[0], theme));
}
