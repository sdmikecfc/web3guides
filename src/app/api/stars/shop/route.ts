/**
 * STARFALL — the Salvage shop (ship components + cosmetic paint).
 *
 *   GET  /api/stars/shop?t=<gameSessionToken>     → catalog + your ship + Salvage balance
 *   POST /api/stars/shop  { t, action, key }       → buy an upgrade or paint
 *
 * Auth reuses the wallet-proven 12h game-session token the games already mint
 * (sessionStorage 'sf_game_token') — no extra signature. The SERVER is authoritative
 * on every price; the client cannot set a cost. Salvage (stored/returned as 'stardust')
 * is spent atomically via s3_grant (which fails closed if the balance would go negative),
 * then the new level is written to launch_wars_s3_pilots.ship (JSONB). If the level
 * write fails after the charge, the Salvage is refunded. No new SQL.
 *
 * NOTE: holding ($) can NEVER buy upgrades or game power — this only ever spends Salvage.
 */
import { NextResponse } from "next/server";
import { starsDb, SEASON_KEY } from "@/lib/stars/server";
import {
  COMPONENTS,
  PAINTS,
  COMPONENT_KEYS,
  PAINT_KEYS,
  FIT_MAX_LEVEL,
  upgradeCost,
  lvl,
  type ShipState,
  type ComponentKey,
  type PaintKey,
} from "@/lib/stars/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = { wallet: string; is_test: boolean };

/** Resolve the wallet-proven game-session token (mirrors /api/stars/score). */
async function resolveSession(
  db: ReturnType<typeof starsDb>,
  token: string,
): Promise<Session | null> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) return null;
  const { data: sess } = await db
    .from("launch_wars_s3_game_sessions")
    .select("wallet, is_test, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) return null;
  return { wallet: String(sess.wallet), is_test: Boolean(sess.is_test) };
}

async function loadPilot(db: ReturnType<typeof starsDb>, wallet: string) {
  const { data } = await db
    .from("launch_wars_s3_pilots")
    .select("wallet, display_name, stardust, ship, crew, rank")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  return data || null;
}

/** Shape the catalog with this pilot's current levels + next costs (server truth). */
function catalogFor(ship: ShipState, balance: number) {
  const components = COMPONENTS.map((c) => {
    const level = lvl(ship, c.key);
    const maxed = level >= FIT_MAX_LEVEL;
    return {
      key: c.key,
      name: c.name,
      emoji: c.emoji,
      effect: c.effect,
      level,
      max: FIT_MAX_LEVEL,
      maxed,
      nextCost: maxed ? null : upgradeCost(c.base, level),
    };
  });
  const owned = new Set<string>([...(ship.paints || []), "crew"]);
  const paints = PAINTS.map((p) => ({
    key: p.key,
    name: p.name,
    hex: p.hex,
    price: p.price,
    owned: owned.has(p.key),
    equipped: (ship.paint || "crew") === p.key,
  }));
  return { balance: Math.round(balance), components, paints };
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const db = starsDb();
  const sess = await resolveSession(db, t);
  if (!sess) return NextResponse.json({ ok: false, error: "session expired. Sign in to play again." }, { status: 401 });
  const pilot = await loadPilot(db, sess.wallet);
  if (!pilot) return NextResponse.json({ ok: false, error: "no pilot for this wallet" }, { status: 404 });
  const ship = (pilot.ship as ShipState) || {};
  return NextResponse.json({
    ok: true,
    rank: Math.max(1, Math.min(12, Number(pilot.rank) || 1)),
    crew: pilot.crew || null,
    ...catalogFor(ship, Number(pilot.stardust) || 0),
  });
}

export async function POST(req: Request) {
  let body: { t?: string; action?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const action = String(body.action || "");
  const key = String(body.key || "");
  const db = starsDb();

  const sess = await resolveSession(db, String(body.t || ""));
  if (!sess) return NextResponse.json({ ok: false, error: "session expired. Sign in to play again." }, { status: 401 });
  const pilot = await loadPilot(db, sess.wallet);
  if (!pilot) return NextResponse.json({ ok: false, error: "no pilot for this wallet" }, { status: 404 });

  const wallet = sess.wallet;
  const ship: ShipState = { ...((pilot.ship as ShipState) || {}) };

  const spend = (cost: number, reason: string, meta: Record<string, unknown>) =>
    db.rpc("s3_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: pilot.display_name ?? null,
      p_starlight: 0,
      p_stardust: -Math.abs(cost),
      p_reason: reason,
      p_meta: meta,
      p_is_test: sess.is_test,
    });
  const refund = (cost: number, meta: Record<string, unknown>) =>
    db.rpc("s3_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: pilot.display_name ?? null,
      p_starlight: 0,
      p_stardust: Math.abs(cost),
      p_reason: "refund",
      p_meta: meta,
      p_is_test: sess.is_test,
    });
  const writeShip = (next: ShipState) =>
    db
      .from("launch_wars_s3_pilots")
      .update({ ship: next, updated_at: new Date().toISOString() })
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet);

  // ── Component upgrade ───────────────────────────────────────────────────────
  if (action === "upgrade") {
    if (!COMPONENT_KEYS.has(key)) return NextResponse.json({ ok: false, error: "unknown component" }, { status: 400 });
    const comp = COMPONENTS.find((c) => c.key === key)!;
    const level = lvl(ship, key as ComponentKey);
    if (level >= FIT_MAX_LEVEL) return NextResponse.json({ ok: false, error: "already maxed" }, { status: 400 });
    const cost = upgradeCost(comp.base, level);

    const { data: deduct, error: dErr } = await spend(cost, "upgrade", { key, from: level, to: level + 1 });
    if (dErr) return NextResponse.json({ ok: false, error: "shop error" }, { status: 500 });
    const row = Array.isArray(deduct) ? deduct[0] : deduct;
    if (!row?.ok) return NextResponse.json({ ok: false, error: "not enough Salvage", balance: Math.round(Number(row?.new_stardust) || 0) }, { status: 402 });

    ship[key as ComponentKey] = level + 1;
    const { error: wErr } = await writeShip(ship);
    if (wErr) {
      try { await refund(cost, { key, reason: "write_failed" }); } catch { /* best-effort */ }
      return NextResponse.json({ ok: false, error: "shop error (refunded)" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      action: "upgrade",
      key,
      level: level + 1,
      spent: cost,
      ...catalogFor(ship, Number(row.new_stardust) || 0),
    });
  }

  // ── Cosmetic paint (buy-to-own, re-equip free) ──────────────────────────────
  if (action === "paint") {
    if (!PAINT_KEYS.has(key)) return NextResponse.json({ ok: false, error: "unknown paint" }, { status: 400 });
    const paint = PAINTS.find((p) => p.key === key)!;
    const owned = new Set<PaintKey>([...(ship.paints || []), "crew"]);

    // Already owned (or free) → just equip, no charge.
    if (owned.has(key as PaintKey) || paint.price === 0) {
      ship.paint = key as PaintKey;
      const { error: wErr } = await writeShip(ship);
      if (wErr) return NextResponse.json({ ok: false, error: "shop error" }, { status: 500 });
      return NextResponse.json({ ok: true, action: "paint", key, equipped: true, ...catalogFor(ship, Number(pilot.stardust) || 0) });
    }

    const { data: deduct, error: dErr } = await spend(paint.price, "paint", { key });
    if (dErr) return NextResponse.json({ ok: false, error: "shop error" }, { status: 500 });
    const row = Array.isArray(deduct) ? deduct[0] : deduct;
    if (!row?.ok) return NextResponse.json({ ok: false, error: "not enough Salvage", balance: Math.round(Number(row?.new_stardust) || 0) }, { status: 402 });

    ship.paints = [...(ship.paints || []), key as PaintKey];
    ship.paint = key as PaintKey;
    const { error: wErr } = await writeShip(ship);
    if (wErr) {
      try { await refund(paint.price, { key, reason: "write_failed" }); } catch { /* best-effort */ }
      return NextResponse.json({ ok: false, error: "shop error (refunded)" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      action: "paint",
      key,
      equipped: true,
      spent: paint.price,
      ...catalogFor(ship, Number(row.new_stardust) || 0),
    });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
