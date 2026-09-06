/**
 * Season 4 — the player's own agent state for the character picker (/s4/me).
 * Server-only. The ONE projection both /api/s4/me (read) and /api/s4/wear
 * (write) return, so the picker always re-renders from an identical shape.
 *
 * PRIVATE to the authenticated player: this returns the caller's own stat
 * levels and full owned-look collection, which the public map/board never
 * expose. It is gated by a play-session token (walletForSession); it never
 * returns the wallet address.
 */
import "server-only";
import type { s4Db } from "./server";
import { clampStats, statNextPrice, STAT_LABELS, type StatKey } from "./games";
import { artForModelKey, isModelKey, modelKey, nextUnlocks, type ModelDim } from "./model";
import type { Theme } from "./theme";

type Db = ReturnType<typeof s4Db>;

/** A single owned look tile. */
export type LookTile = { key: string; art: string; isCurrent: boolean; isWorn: boolean };
/** A previewed unlock (one more level of a gear stat from the current build). */
export type UnlockTile = { stat: ModelDim; statName: string; toLevel: number; key: string; art: string };
/** One gear stat's shop row: current level, ceiling, and the next Gold price. */
export type ShopRow = { key: StatKey; name: string; blurb: string; level: number; max: number; nextPrice: number | null };

export type ModelState = {
  ok: true;
  team: { key: string; name: string; accent: string } | null;
  gender: "f" | "m";
  gold: number; // play_currency, the shop's spend
  stats: { botox: number; drugs: number; ozempic: number; aura: number };
  shop: ShopRow[]; // the gear ladder (Armor/Ride/Gadgets/Weapon) with live prices
  currentKey: string;
  wornKey: string | null; // null = wearing the current build
  looks: LookTile[];
  next: UnlockTile[];
};

/**
 * Resolve the wallet behind a play-session token (the same token the games open
 * via /api/s4/game-session, and Telegram will mint via /api/s4/tg-session). Null
 * if the token is malformed, unknown, or expired. Never trust a client address.
 */
export async function walletForSession(db: Db, token: unknown): Promise<string | null> {
  const t = String(token || "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t)) return null;
  const { data } = await db
    .from("launch_wars_s4_game_sessions")
    .select("wallet, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return String(data.wallet).toLowerCase();
}

type PlayerRow = { skin?: unknown; team_key?: unknown; play_currency?: unknown };

const STAT_ORDER: StatKey[] = ["botox", "drugs", "ozempic", "aura"];

/** Build the picker projection from a player row + the merged theme. Pure. */
export function buildModelState(player: PlayerRow | null, theme: Theme): ModelState {
  const skin =
    player?.skin && typeof player.skin === "object" && !Array.isArray(player.skin)
      ? (player.skin as Record<string, unknown>)
      : {};
  const teamKey = typeof player?.team_key === "string" ? player.team_key : null;
  const team = theme.teams.find((x) => x.key === teamKey) || null;

  const stats = clampStats(skin);
  const gold = Math.max(0, Math.round(Number(player?.play_currency) || 0));
  const gender: "f" | "m" = skin.gender === "m" ? "m" : "f";
  const currentKey = modelKey(skin);

  const shop: ShopRow[] = STAT_ORDER.map((key) => {
    const lv = stats[key];
    return {
      key,
      name: STAT_LABELS[key].name,
      blurb: STAT_LABELS[key].blurb,
      level: lv,
      max: STAT_LABELS[key].max,
      nextPrice: statNextPrice(key, lv),
    };
  });

  const ownedSet = new Set<string>(
    (Array.isArray(skin.owned_models) ? skin.owned_models.filter(isModelKey) : []) as string[],
  );
  ownedSet.add(currentKey); // the current build is always wearable
  const wornRaw = skin.worn;
  const wornKey = isModelKey(wornRaw) && ownedSet.has(wornRaw) ? wornRaw : null;
  const shownKey = wornKey || currentKey;

  const looks: LookTile[] = Array.from(ownedSet)
    .sort()
    .map((key) => ({
      key,
      art: artForModelKey(key, gender, teamKey),
      isCurrent: key === currentKey,
      isWorn: key === shownKey,
    }));

  const next: UnlockTile[] = nextUnlocks(stats, gender, Array.from(ownedSet)).map((u) => ({
    stat: u.stat,
    statName: STAT_LABELS[u.stat].name,
    toLevel: u.toLevel,
    key: u.key,
    art: u.art,
  }));

  return {
    ok: true,
    team: team ? { key: team.key, name: team.name, accent: team.accent } : null,
    gender,
    gold,
    stats,
    shop,
    currentKey,
    wornKey,
    looks,
    next,
  };
}
