/**
 * Season 5, the HQ loadout write. POST /api/s7/hq  { t, set: { tank?, camo?, commander? } }
 *
 * COSMETIC ONLY: fields an OWNED tank, swaps camo, swaps commander. No Shells
 * move here (unlocks are /api/s7/tank-unlock, the money path). Discipline:
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
import { s7Db, SEASON_KEY } from "@/lib/s7/server";
import { S7_CACHE_TAG } from "@/lib/s7/data";
import { walletForSession, hqObject, ensurePlayer } from "@/lib/s7/me";
import {
  CAMOS,
  ownedCamoKeys,
  ownedAdventurerKeys,
  ownedTankKeys,
  resolveAdventurerKey,
  resolveTank,
  type CamoKey,
} from "@/lib/s7/model";
import { adventurerByKey, tankByKey } from "@/lib/s7/tanks";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

type SetBody = { tank?: unknown; camo?: unknown; adventurer?: unknown };

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
  const wants: { tank?: string; camo?: CamoKey; adventurer?: string } = {};
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
  if (set.adventurer !== undefined) {
    const c = adventurerByKey(set.adventurer);
    if (!c) return bad("Unknown commander.");
    wants.adventurer = c.key;
  }
  if (wants.tank === undefined && wants.camo === undefined && wants.adventurer === undefined) {
    return bad("nothing to set");
  }

  const db = s7Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  // Read -> merge -> optimistic-lock write, with ONE re-read retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    // ensurePlayer, not a plain read: the launch wipe removes player rows
    // while sessions survive, and a signed-in wallet with no row could not
    // field a hero (the 2026-08-17 "Field does nothing" report).
    const player = await ensurePlayer(db, wallet);
    if (!player) return bad("No commander for this wallet yet. Enlist at /s7/join first.", 404);

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
    if (wants.adventurer !== undefined) {
      const c = adventurerByKey(wants.adventurer);
      if (c?.prize && !ownedAdventurerKeys(hq).includes(wants.adventurer)) {
        return bad("Big Mike rides with the day's top commander. Top the arcade to earn him.");
      }
    }

    // SPREAD the existing hq: bot-owned keys ride along untouched.
    const newHq: Record<string, unknown> = { ...hq };
    if (wants.tank !== undefined) newHq.tank = wants.tank;
    if (wants.camo !== undefined) newHq.camo = wants.camo;
    if (wants.adventurer !== undefined) newHq.adventurer = wants.adventurer;

    let writeQ = db
      .from("launch_wars_s7_players")
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
      const changedCmdr = wants.adventurer !== undefined && wants.adventurer !== hq.adventurer;
      if (changedTank || changedCamo || changedCmdr) revalidateTag(S7_CACHE_TAG);

      return NextResponse.json({
        ok: true,
        tank: resolveTank(savedHq),
        // the client reads `adventurer` off this response (panels.tsx); returning
        // `commander` made a adventurer swap look like it worked until reload
        adventurer: resolveAdventurerKey(savedHq),
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
