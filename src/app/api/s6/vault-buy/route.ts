/**
 * Season 5, the ARMORY VAULT daily deal (#221, ADR-0067).
 * POST /api/s6/vault-buy  { t, item }
 *
 * MONEY PATH: it spends Shells, so it mirrors the proven /api/s6/tank-unlock
 * discipline EXACTLY:
 *   - session-authed (walletForSession); never trust a client address,
 *   - SERVER-priced AND server-scheduled: today's deal comes from the fixed
 *     VAULT_ITEMS rotation (lib/s5/vault.ts) indexed by the UTC day number.
 *     The client's `item` must NAME today's deal; a stale tab across the UTC
 *     boundary gets an honest "rotated" error, never yesterday's price. No
 *     randomness anywhere (ADR-0067: deterministic, contents always visible),
 *   - cosmetics only (a decal into hq.decals), Shells only (0 points),
 *   - spend fail-closed via s5_grant (ok:false, no throw, on overspend), then
 *     RE-READ the fresh row for the post-spend updated_at (the bot bug where a
 *     pre-spend updated_at made the write always fail + refund),
 *   - RACED-GRANT GUARD (one hardening over the donor): if the fresh row
 *     already carries the decal (a second tab, or the bot's crate sweep landed
 *     it between the pre-check and the spend), REFUND and report ownership: a
 *     cosmetic is never paid for twice,
 *   - optimistic-lock the hq write on that fresh updated_at,
 *   - REFUND the spend if the write dies, so a dead write never eats Shells,
 *   - the hq JSONB is spread-merged (bot-owned keys never dropped); the decal
 *     joins hq.decals exactly like the crate sweep and claim-ftue grants do.
 */
import { NextResponse } from "next/server";
import { SHELLS_PER_RUN } from "@/lib/s6/games";
import { s6Db, SEASON_KEY } from "@/lib/s6/server";
import { walletForSession, hqObject } from "@/lib/s6/me";
import { vaultDayNumber, vaultDealForDay } from "@/lib/s6/vault";
import { decalLabel } from "@/lib/s6/ftue";
import { DEFAULT_THEME } from "@/lib/s6/theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/** hq.decals as a clean string list (same clamp as resolveTank's read). */
function decalsOf(hq: unknown): string[] {
  const src = hqObject(hq);
  return Array.isArray(src.decals)
    ? src.decals.filter((d): d is string => typeof d === "string" && d.length > 0 && d.length <= 40)
    : [];
}

export async function POST(req: Request) {
  let body: { t?: string; item?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json");
  }

  // THE SERVER OWNS THE SCHEDULE: today's deal, computed here from the fixed
  // rotation. The client may only confirm it, never choose or price it.
  const day = vaultDayNumber(Date.now());
  const deal = vaultDealForDay(day);
  if (String(body.item || "") !== deal.key) {
    return bad("That deal has rotated. Today's deal is on the workbench.");
  }
  const price = deal.price;
  if (!Number.isFinite(price) || price <= 0) {
    // A zero/garbled registry entry must fail closed, never sell for free.
    return bad("Today's deal is misconfigured. Nothing was charged.");
  }

  const db = s6Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  const { data: player } = await db
    .from("launch_wars_s6_players")
    .select("hq, play_currency, display_name, updated_at, is_test")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (!player) return bad("No commander for this wallet yet. Enlist at /s6/join first.", 404);

  const isTest = !!player.is_test;
  const shells = Math.round(Number(player.play_currency) || 0);

  // Already owned: nothing to sell. Report ownership honestly instead of
  // charging a race'd double tap (the tank-unlock rule, decal edition).
  if (decalsOf(player.hq).includes(deal.key)) {
    return NextResponse.json({ ok: false, already: true, error: "Already in your collection. Tomorrow brings a new deal." });
  }

  const grant = (delta: number, reason: string, meta: Record<string, unknown>) =>
    db.rpc("s5_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: player.display_name ?? null,
      p_points: 0,
      p_play_currency: delta,
      p_reason: reason,
      p_meta: meta,
      p_is_test: isTest,
    });

  // 1) Spend Shells, fail-closed (s5_grant rejects an overspend with ok:false).
  let spent = false;
  try {
    const { data } = await grant(-price, "vault:buy", { item: deal.key, price, day, src: "web" });
    const row = Array.isArray(data) ? data[0] : data;
    spent = !!(row && row.ok);
  } catch {
    spent = false;
  }
  if (!spent) {
    return bad(
      `You need ${price.toLocaleString()} ${DEFAULT_THEME.playCurrency} for today's deal. You have ${shells.toLocaleString()}. A banked arcade run pays ${SHELLS_PER_RUN}, and holding a stronghold pays every day.`,
    );
  }

  // 2) The spend bumped updated_at: RE-READ the fresh row and merge into it.
  const { data: fresh } = await db
    .from("launch_wars_s6_players")
    .select("hq, updated_at")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  const baseHq = hqObject(fresh?.hq);
  const priorDecals = decalsOf(baseHq);

  // RACED-GRANT GUARD: the decal landed some other way while we were paying.
  // Refund and report ownership; the player keeps the decal and the Shells.
  if (priorDecals.includes(deal.key)) {
    await grant(price, "vault:refund", { item: deal.key, reason: "already_owned", src: "web" }).then(null, () => {});
    return NextResponse.json({ ok: false, already: true, error: "Already in your collection. Tomorrow brings a new deal." });
  }

  // SPREAD: bot-owned keys (crates/streak/bonds_tier/peak_usd) ride along.
  const newHq: Record<string, unknown> = { ...baseHq, decals: [...priorDecals, deal.key] };

  // 3) Optimistic-lock the write on the fresh updated_at; REFUND on failure.
  let writeQ = db
    .from("launch_wars_s6_players")
    .update({ hq: newHq, updated_at: new Date().toISOString() })
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet);
  if (fresh?.updated_at) writeQ = writeQ.eq("updated_at", fresh.updated_at);
  const { data: written, error } = await writeQ.select("hq, play_currency");
  if (error || !written || !written.length) {
    await grant(price, "vault:refund", { item: deal.key, reason: "write_failed", src: "web" }).then(null, () => {});
    return NextResponse.json(
      { ok: false, error: `Could not complete the deal. Your ${DEFAULT_THEME.playCurrency} are untouched, try again.` },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    item: { key: deal.key, label: decalLabel(deal.key), price },
    decals: decalsOf(written[0].hq),
    shells: Math.round(Number(written[0].play_currency) || 0),
  });
}
