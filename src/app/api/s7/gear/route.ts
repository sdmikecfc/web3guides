/**
 * Season 7 — buy ONE gear tier on the web (the Guild Hall's Armory shelf).
 *
 *   POST /api/s7/gear  { t, slot }  ->  { ok, track, gold }
 *
 * The gear store (ADR-0129): Gold buys weapon/armor/trinket tiers on the
 * ACTIVE class only. MONEY PATH for play currency, so it mirrors
 * /api/s7/upgrade's hard-won discipline EXACTLY:
 *   - session-authed; never trust a client address,
 *   - server-priced (gearNextPrice); never trust a client-sent price,
 *   - spend fail-closed via s7_grant (ok:false on overspend, no throw), then
 *     RE-READ the class row fresh,
 *   - optimistic-lock the gear write on the fresh updated_at,
 *   - REFUND the spend if the write dies, so a dead write never eats Gold.
 *
 * Gear tiers feed the sims through derive() (rules core) and render as FX
 * tiers only (the panel law: gear never changes the body sprite).
 */
import { NextResponse } from "next/server";
import { s7Db, SEASON_KEY } from "@/lib/s7/server";
import { walletForSession } from "@/lib/s7/me";
import { GEAR_SLOTS, gearNextPrice, isClassId, type GearSlot } from "@/lib/s7/classes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

const SLOT_NAMES: Record<GearSlot, string> = {
  weapon: "Weapon",
  armor: "Armor",
  trinket: "Trinket",
};

export async function POST(req: Request) {
  let body: { t?: string; slot?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json");
  }
  const slot = String(body.slot || "").toLowerCase().trim() as GearSlot;
  if (!GEAR_SLOTS.includes(slot)) return bad("Unknown gear slot.");

  const db = s7Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  const { data: player } = await db
    .from("launch_wars_s7_players")
    .select("active_class, play_currency, display_name, is_test")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (!player) return bad("No adventurer for this wallet yet. Enlist at /s7/join first.", 404);
  if (!isClassId(player.active_class)) return bad("Pick a class first. Gear belongs to a class.", 409);
  const cls = player.active_class;
  const isTest = !!player.is_test;

  const { data: row } = await db
    .from("launch_wars_s7_classes")
    .select("gear, updated_at")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .eq("class_key", cls)
    .maybeSingle();
  if (!row) return bad("Class track missing. Switch classes once to heal it.", 409);
  const gear = row.gear && typeof row.gear === "object" ? (row.gear as Record<string, unknown>) : {};
  const tier = Math.max(0, Math.min(3, Number(gear[slot]) || 0));
  const price = gearNextPrice(tier);
  const name = SLOT_NAMES[slot];
  if (price === null) return bad(`${name} is already at its top tier.`);
  const gold = Math.round(Number(player.play_currency) || 0);

  // 1) Spend Gold, fail-closed (s7_grant rejects an overspend with ok:false).
  let spent = false;
  try {
    const { data } = await db.rpc("s7_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: player.display_name ?? null,
      p_points: 0,
      p_play_currency: -price,
      p_reason: "shop:gear",
      p_meta: { slot, cls, to: tier + 1, src: "web" },
      p_is_test: isTest,
    });
    const r = Array.isArray(data) ? data[0] : data;
    spent = !!(r && r.ok);
  } catch {
    spent = false;
  }
  if (!spent) {
    return bad(
      `You need ${price.toLocaleString()} Gold for the next ${name} tier. You have ${gold.toLocaleString()}. Earn more in the arcade and raids.`,
    );
  }

  // 2) Fresh read + optimistic-lock the gear write; refund on failure.
  const { data: fresh } = await db
    .from("launch_wars_s7_classes")
    .select("gear, updated_at")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .eq("class_key", cls)
    .maybeSingle();
  const freshGear = fresh?.gear && typeof fresh.gear === "object" ? (fresh.gear as Record<string, unknown>) : {};
  const freshTier = Math.max(0, Math.min(3, Number(freshGear[slot]) || 0));
  const update = {
    gear: { ...freshGear, [slot]: Math.min(3, freshTier + 1) },
    updated_at: new Date().toISOString(),
  };
  let writeQ = db
    .from("launch_wars_s7_classes")
    .update(update)
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .eq("class_key", cls);
  if (fresh?.updated_at) writeQ = writeQ.eq("updated_at", fresh.updated_at);
  const { data: written, error } = await writeQ.select("class_key, level, xp, gear");
  if (error || !written || !written.length) {
    await db
      .rpc("s7_grant", {
        p_season_key: SEASON_KEY,
        p_wallet: wallet,
        p_display_name: player.display_name ?? null,
        p_points: 0,
        p_play_currency: price,
        p_reason: "shop:refund",
        p_meta: { slot, cls, reason: "write_failed", src: "web" },
        p_is_test: isTest,
      })
      .then(null, () => {});
    return NextResponse.json(
      { ok: false, error: "Could not complete the purchase. Your Gold is untouched, try again." },
      { status: 409 },
    );
  }

  const { data: after } = await db
    .from("launch_wars_s7_players")
    .select("play_currency")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  const saved = written[0];
  return NextResponse.json({
    ok: true,
    track: {
      classKey: saved.class_key,
      level: Number(saved.level) || 1,
      xp: Number(saved.xp) || 0,
      gear: saved.gear,
    },
    gold: Math.max(0, Math.round(Number(after?.play_currency) || 0)),
  });
}
