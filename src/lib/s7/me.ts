/**
 * Season 5, the session -> player helpers shared by the authed s7 API routes
 * (/api/s7/me, /api/s7/hq, /api/s7/tank-unlock, /api/s7/funding-status,
 * /api/s7/claim-ftue). Server-only.
 *
 * The hq JSONB is SHARED with the bot: the web owns hq.tank / hq.camo /
 * hq.adventurer / hq.tanks_owned, the bot owns hq.crates / hq.streak /
 * hq.bonds_tier / hq.peak_usd / hq.decals (and grants first-colors via the
 * crate sweep). Every write route must SPREAD the existing hq so bot-owned
 * keys are never dropped; the read view here is junk-tolerant and display-safe
 * (never a wallet).
 */
import "server-only";
import type { s7Db } from "./server";
import { ownedCamoKeys, ownedAdventurerKeys, ownedTankKeys, resolveAdventurerKey } from "./model";

type Db = ReturnType<typeof s7Db>;

/**
 * Resolve the wallet behind a play-session token (the token /api/s7/game-session
 * mints). Null if malformed, unknown, or expired. Never trust a client address.
 */
import { SEASON_KEY } from "@/lib/s7/server";

export async function walletForSession(db: Db, token: unknown): Promise<string | null> {
  const t = String(token || "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t)) return null;
  const { data } = await db
    .from("launch_wars_s7_game_sessions")
    .select("wallet, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return String(data.wallet).toLowerCase();
}

/**
 * THE ZOMBIE SESSION HEAL (Mike 2026-08-17: "the field button works now but
 * it doesn't actually switch it").
 *
 * The auto-launch fresh-start DELETES every player row by design, but game
 * sessions survive it - so anyone who signed in before launch came back with
 * a valid token pointing at a wallet that no longer had a commander. Every
 * write route 404'd ("No commander for this wallet yet"), which the garage
 * showed as a small note under the fold: the button appeared to work and
 * nothing changed.
 *
 * A valid session is proof of wallet ownership (the token is only minted
 * after a verified SIWE sign-in), and join itself tolerates pre-existing
 * teamless rows ("a grant created it before enlist"), so re-creating a BARE
 * zero-everything row here restores exactly what the wipe removed. It grants
 * nothing: no points, no currency, no unlocks.
 *
 * Returns the row's hq/updated_at so callers continue with a real row.
 */
export async function ensurePlayer(
  db: Db,
  wallet: string,
): Promise<{ hq: unknown; updated_at: string | null } | null> {
  const read = async () =>
    (
      await db
        .from("launch_wars_s7_players")
        .select("hq, updated_at")
        .eq("season_key", SEASON_KEY)
        .eq("wallet", wallet)
        .maybeSingle()
    ).data as { hq: unknown; updated_at: string | null } | null;

  const existing = await read();
  if (existing) return existing;
  // team_key stays NULL: join assigns the front on the next enlist, and the
  // bot's autoAssignTeams sweep covers anyone who never returns to it.
  await db
    .from("launch_wars_s7_players")
    .insert({ season_key: SEASON_KEY, wallet, is_test: false });
  return await read(); // re-read (also resolves an insert race)
}

/** The hq JSONB as a plain object (junk in, empty object out). */
export function hqObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Display-safe projection of the hq JSONB (bot-owned keys read, never echoed
 * raw). Everything clamps; junk never throws. */
export type HqView = {
  adventurer: string;
  ownedTanks: string[];
  /** Earned camo keys, olive always included (hq.camos_owned, bot-swept). */
  ownedCamos: string[];
  /** Earned prize adventurers (hq.adventurers_owned; today bigmike or nothing). */
  ownedAdventurers: string[];
  /** War Bonds tier 0..20 (bot-written hq.bonds_tier). */
  bondsTier: number;
  /** Hold-streak days (bot-written hq.streak.days). */
  streakDays: number;
  /** Opened crate keys (bot-written hq.crates), display only. */
  crates: string[];
  /** Season peak held dollars (bot-written hq.peak_usd), display only. */
  peakUsd: number;
};

export function buildHqView(hqRaw: unknown): HqView {
  const hq = hqObject(hqRaw);
  const bondsTier = Math.max(0, Math.min(20, Math.floor(Number(hq.bonds_tier) || 0)));
  const streak = hqObject(hq.streak);
  const streakDays = Math.max(0, Math.min(3650, Math.floor(Number(streak.days) || 0)));
  const crates = Array.isArray(hq.crates)
    ? hq.crates
        .filter((c): c is string => typeof c === "string" && c.length > 0 && c.length <= 40)
        .slice(0, 60)
    : [];
  const peakRaw = Number(hq.peak_usd);
  const peakUsd = Number.isFinite(peakRaw) && peakRaw > 0 ? Math.round(peakRaw * 100) / 100 : 0;
  return {
    adventurer: resolveAdventurerKey(hq),
    ownedTanks: ownedTankKeys(hq),
    ownedCamos: ownedCamoKeys(hq),
    ownedAdventurers: ownedAdventurerKeys(hq),
    bondsTier,
    streakDays,
    crates,
    peakUsd,
  };
}

/** The player's cached held dollars. The schema column is held_usd_total;
 * held_usd is read as a fallback so an older row shape never breaks this. */
export function heldUsdOf(player: Record<string, unknown> | null): number {
  const v = Number(player?.held_usd_total ?? player?.held_usd);
  return Number.isFinite(v) && v > 0 ? v : 0;
}
