/**
 * Season 5, the HQ loadout write. POST /api/s5/hq  { t, set: { tank?, camo?, commander? } }
 *
 * COSMETIC ONLY: fields an OWNED tank, swaps camo, swaps commander. No Shells
 * move here (unlocks are /api/s5/tank-unlock, the money path). Discipline:
 *
 * - session-authed (walletForSession); never trust a client address,
 * - every field validated against the rosters (tanks.ts / CAMOS), and a tank
 *   must be OWNED (tier-1 free picks or hq.tanks_owned),
 * - the hq JSONB is SHARED with the bot (crates/streak/bonds_tier/peak_usd/
 *   decals): the write SPREADS the fresh row's hq so bot-owned keys are never
 *   dropped,
 * - optimistic-lock on updated_at with ONE re-read retry (a concurrent bot
 *   sweep bumping the row must not eat the player's pick).
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { s5Db, SEASON_KEY } from "@/lib/s5/server";
import { S5_CACHE_TAG } from "@/lib/s5/data";
import { walletForSession, hqObject } from "@/lib/s5/me";
import {
  CAMOS,
  ownedCamoKeys,
  ownedCommanderKeys,
  ownedTankKeys,
  resolveCommanderKey,
  resolveTank,
  type CamoKey,
} from "@/lib/s5/model";
import { commanderByKey, tankByKey } from "@/lib/s5/tanks";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

type SetBody = { tank?: unknown; camo?: unknown; commander?: unknown };

export async function POST(req: Request) {
  let body: { t?: string; set?: SetBody };
  try {
    body = await req.json();
  } catch {
    return bad("bad json");
  }
  const set = body.set && typeof body.set === "object" && !Array.isArray(body.set) ? body.set : null;
  if (!set) return bad("nothing to set");

  // ── Validate every requested field BEFORE any read (reject junk early) ────
  const wants: { tank?: string; camo?: CamoKey; commander?: string } = {};
  if (set.tank !== undefined) {
    const t = tankByKey(set.tank);
    if (!t) return bad("Unknown tank.");
    wants.tank = t.key;
  }
  if (set.camo !== undefined) {
    const c = String(set.camo || "");
    if (!(CAMOS as readonly string[]).includes(c)) return bad("Unknown camo.");
    wants.camo = c as CamoKey;
  }
  if (set.commander !== undefined) {
    const c = commanderByKey(set.commander);
    if (!c) return bad("Unknown commander.");
    wants.commander = c.key;
  }
  if (wants.tank === undefined && wants.camo === undefined && wants.commander === undefined) {
    return bad("nothing to set");
  }

  const db = s5Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  // Read -> merge -> optimistic-lock write, with ONE re-read retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: player } = await db
      .from("launch_wars_s5_players")
      .select("hq, updated_at")
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet)
      .maybeSingle();
    if (!player) return bad("No commander for this wallet yet. Enlist at /s5/join first.", 404);

    const hq = hqObject(player.hq);

    // A tank must be OWNED on the FRESH row (tier-1 or hq.tanks_owned).
    if (wants.tank !== undefined && !ownedTankKeys(hq).includes(wants.tank)) {
      return bad("You do not own that tank yet. Unlock it with Shells first.");
    }
    // Camo is EARNED (the daily arcade ladder): olive free, everything else
    // gated on hq.camos_owned, which only the bot's daily sweep writes.
    if (wants.camo !== undefined && !ownedCamoKeys(hq).includes(wants.camo)) {
      return bad("You have not earned that camo yet. Win a day in the arcade.");
    }
    // Prize commanders (bigmike) are gated the same way; the free cast is not.
    if (wants.commander !== undefined) {
      const c = commanderByKey(wants.commander);
      if (c?.prize && !ownedCommanderKeys(hq).includes(wants.commander)) {
        return bad("Big Mike rides with the day's top commander. Top the arcade to earn him.");
      }
    }

    // SPREAD the existing hq: bot-owned keys ride along untouched.
    const newHq: Record<string, unknown> = { ...hq };
    if (wants.tank !== undefined) newHq.tank = wants.tank;
    if (wants.camo !== undefined) newHq.camo = wants.camo;
    if (wants.commander !== undefined) newHq.commander = wants.commander;

    let writeQ = db
      .from("launch_wars_s5_players")
      .update({ hq: newHq, updated_at: new Date().toISOString() })
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet);
    if (player.updated_at) writeQ = writeQ.eq("updated_at", player.updated_at);
    const { data: written, error } = await writeQ.select("hq");
    if (!error && written && written.length) {
      const savedHq = written[0].hq;

      // THE MAP MUST SHOW THE NEW TANK NOW, not in two minutes. The world map
      // draws from getSeasonSnapshot, a 60s data cache under a 60s ISR page,
      // both stale-while-revalidate: without this, a player swapped their tank,
      // opened the map, saw the old one and concluded the feature was broken.
      //
      // Purge ONLY when something visible actually changed. Re-saving the same
      // loadout is a no-op, so idle fiddling in the garage cannot repeatedly
      // drop the whole season's cached reads.
      const changedTank = wants.tank !== undefined && wants.tank !== hq.tank;
      const changedCamo = wants.camo !== undefined && wants.camo !== hq.camo;
      const changedCmdr = wants.commander !== undefined && wants.commander !== hq.commander;
      if (changedTank || changedCamo || changedCmdr) revalidateTag(S5_CACHE_TAG);

      return NextResponse.json({
        ok: true,
        tank: resolveTank(savedHq),
        commander: resolveCommanderKey(savedHq),
        ownedTanks: ownedTankKeys(savedHq),
      });
    }
    // Lock miss (bot sweep bumped the row): loop once with a fresh read.
  }
  return NextResponse.json(
    { ok: false, error: "HQ is busy right now. Nothing changed, try again." },
    { status: 409 },
  );
}
