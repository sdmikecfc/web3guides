/**
 * S7 TROPHY SHELF, server-only: relics a wallet earned in PAST seasons.
 *
 * Reads (all read-only, all is_test=false, every read wrapped so a missing
 * table or column returns null, never throws):
 *
 *   S4  launch_wars_s4_players by wallet: the agent figure. skin resolves
 *       through the EXISTING S4 resolveModel and renders the /s4-art/cut/
 *       transparent cutout (the same substitution HitListMap uses).
 *   S3  launch_wars_s3_adventurers by wallet: the Starfall hull. ship.hull (a
 *       1..12 hull number when the shop set one) falls back to the adventurer's
 *       rank; art is /stars-art/hull-NN.png.
 *   S2  launch_wars_s2_ships by DISCORD ID, and ONLY when this wallet has a
 *       linked Discord (S2 predates wallet-first identity). cosmetics.skin
 *       maps to /seas-art/ship-<skin>.png; a skinless sailor gets their
 *       hull-class vessel sprite.
 *
 * Returns { s2, s3, s4 } each nullable { art, label }, plus discordLinked so
 * the shelf can tell "never sailed" from "ship not linked yet" (the
 * earned-not-shamed empty lines in HqScene).
 */
import "server-only";
import { s7Db } from "./server";
import { resolveModel } from "@/lib/s4/model";

export type Trophy = { art: string; label: string };
export type Trophies = {
  s2: Trophy | null;
  s3: Trophy | null;
  s4: Trophy | null;
  /** true when the wallet has a Discord linked anywhere we can see. */
  discordLinked: boolean;
};

type Db = ReturnType<typeof s7Db>;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

async function s4Trophy(db: Db, wallet: string): Promise<{ trophy: Trophy | null; discordId: string | null }> {
  try {
    const { data } = await db
      .from("launch_wars_s4_players")
      .select("skin, team_key, discord_id")
      .eq("season_key", "s4")
      .eq("wallet", wallet)
      .eq("is_test", false)
      .maybeSingle();
    if (!data) return { trophy: null, discordId: null };
    const teamKey = typeof data.team_key === "string" ? data.team_key : null;
    // The transparent cutout set mirrors /s4-art/ under /s4-art/cut/ (the same
    // substitution the S4 map uses for figures on a scene).
    const art = resolveModel(data.skin, teamKey).art.replace("/s4-art/", "/s4-art/cut/");
    const discordId = typeof data.discord_id === "string" && data.discord_id ? data.discord_id : null;
    return { trophy: { art, label: "S4 The Hit List agent" }, discordId };
  } catch {
    return { trophy: null, discordId: null };
  }
}

async function s3Trophy(db: Db, wallet: string): Promise<{ trophy: Trophy | null; discordId: string | null }> {
  try {
    const { data } = await db
      .from("launch_wars_s3_adventurers")
      .select("ship, rank, discord_id")
      .eq("season_key", "s3")
      .eq("wallet", wallet)
      .eq("is_test", false)
      .maybeSingle();
    if (!data) return { trophy: null, discordId: null };
    const ship =
      data.ship && typeof data.ship === "object" && !Array.isArray(data.ship)
        ? (data.ship as Record<string, unknown>)
        : {};
    const hullRaw = Number(ship.hull);
    const rank = Number(data.rank);
    const hull = clamp(
      Number.isFinite(hullRaw) && hullRaw >= 1 ? Math.floor(hullRaw) : Number.isFinite(rank) && rank >= 1 ? Math.floor(rank) : 1,
      1,
      12,
    );
    const art = `/stars-art/hull-${String(hull).padStart(2, "0")}.png`;
    const discordId = typeof data.discord_id === "string" && data.discord_id ? data.discord_id : null;
    return { trophy: { art, label: "S3 Starfall hull" }, discordId };
  } catch {
    return { trophy: null, discordId: null };
  }
}

/** Fallback wallet -> discord lookup via the canonical link table. */
async function linkedDiscordId(db: Db, wallet: string): Promise<string | null> {
  try {
    const { data } = await db
      .from("linked_wallets")
      .select("discord_id")
      .ilike("wallet_address", wallet)
      .maybeSingle();
    return typeof data?.discord_id === "string" && data.discord_id ? data.discord_id : null;
  } catch {
    return null;
  }
}

function s2HullVessel(hullUsd: number): string {
  if (hullUsd >= 100) return "/seas-art/vessel-flagship.png";
  if (hullUsd >= 50) return "/seas-art/vessel-galleon.png";
  if (hullUsd >= 25) return "/seas-art/vessel-frigate.png";
  if (hullUsd >= 5) return "/seas-art/vessel-sloop.png";
  return "/seas-art/vessel-dinghy.png";
}

async function s2Trophy(db: Db, discordId: string): Promise<Trophy | null> {
  try {
    const { data } = await db
      .from("launch_wars_s2_ships")
      .select("cosmetics, hull_usd")
      .eq("discord_id", discordId)
      .eq("is_test", false)
      .maybeSingle();
    if (!data) return null;
    const skin = (data.cosmetics as { skin?: unknown } | null)?.skin;
    const art =
      typeof skin === "string" && /^[a-z0-9-]{2,32}$/.test(skin)
        ? `/seas-art/ship-${skin}.png`
        : s2HullVessel(Number(data.hull_usd) || 0);
    return { art, label: "S2 Conquer the Seas ship" };
  } catch {
    return null;
  }
}

/** All past-season relics for one wallet (lowercased 0x address). */
export async function getTrophies(wallet: string): Promise<Trophies> {
  const empty: Trophies = { s2: null, s3: null, s4: null, discordLinked: false };
  let db: Db;
  try {
    db = s7Db();
  } catch {
    return empty;
  }
  const w = String(wallet || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(w)) return empty;

  // SEQUENTIAL (2026-08-17): concurrent first-flight reads through the
  // cookie-based server client come back empty with no error - the same
  // defect that made the live feed print nothing all evening. A profile
  // would have shown a decorated veteran as trophy-less, silently.
  const s4r = await s4Trophy(db, w);
  const s3r = await s3Trophy(db, w);
  const discordId = s4r.discordId || s3r.discordId || (await linkedDiscordId(db, w));
  const s2 = discordId ? await s2Trophy(db, discordId) : null;

  return {
    s2,
    s3: s3r.trophy,
    s4: s4r.trophy,
    discordLinked: !!discordId,
  };
}
