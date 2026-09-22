/**
 * S7 PUBLIC GARAGE resolution, server-only: turns a /s7/hq/[handle] URL into
 * one player's PUBLIC-SAFE garage view.
 *
 * Handle grammar (the pure matchers live in ./handles so they unit-test with
 * plain node):
 *   - 0x + 6..40 hex chars  -> wallet PREFIX, unique-match only
 *   - anything else         -> display-name slug, first match by points desc
 *
 * PUBLIC-SAFE by construction: the returned view carries NO dollar figure of
 * any kind (no held USD, no peak USD, no projected cuts) and never the full
 * wallet (the page needs it server-side for the trophy lookup, so it rides
 * OUTSIDE the view and must never be rendered). Every read is wrapped: a
 * missing table or env resolves to null, never a throw.
 */
import "server-only";
import { cache } from "react";
import { s7Db, SEASON_KEY } from "./server";
import { resolveTank, type ResolvedTank } from "./model";
import { buildHqView, hqObject } from "./me";
import { MAX_LEVEL, getTracks, stageForLevel, xpForLevel } from "./classes";
import {
  handleForPlayer,
  isWalletPrefixHandle,
  pickBySlug,
  pickByWalletPrefix,
  publicCallsign,
  rankName,
} from "./handles";

type Db = ReturnType<typeof s7Db>;
type PlayerRow = Record<string, unknown>;

/**
 * The ACTIVE class track, public-safe. Levels, XP and gear tiers only: these
 * buy stats inside the games and nothing else, so nothing here is a money
 * figure and nothing here changes a payout (ADR-0126 untouched).
 * `stage` is the armor-stage KEY ("novice" | "veteran" | "champion" |
 * "mythic") so the page can look it up in the private hall's STAGE_META.
 */
export type PublicActiveClass = {
  classKey: string;
  className: string;
  level: number;
  xp: number;
  /** XP earned INSIDE the current level. */
  xpInto: number;
  /** XP the current level spans, so xpInto / xpNeed fills the bar. */
  xpNeed: number;
  stage: string;
  gear: { weapon: number; armor: number; trinket: number };
};

/** Everything the public garage page + card may render. Counts only, no money. */
export type PublicGarage = {
  callsign: string;
  rank: string;
  tank: ResolvedTank;
  /** The class this adventurer plays. Null when they have not picked one. */
  activeClass: PublicActiveClass | null;
  adventurerKey: string;
  bondsTier: number;
  streakDays: number;
  cratesOpened: number;
  /** Sanitized recruiter callsign from hq.enlisted_by; null when unset. */
  enlistedBy: string | null;
  /** The canonical share handle (slug or 0x + 8 hex) for og-image URLs. */
  handle: string;
};

export type PublicHqResult = {
  view: PublicGarage;
  /** SERVER-SIDE ONLY (trophy lookup). Never render or serialize to a client. */
  wallet: string;
};

const HEX_ONLY_RE = /^[a-f0-9]+$/;

async function playerByWalletPrefix(db: Db, handle: string): Promise<PlayerRow | null> {
  const prefix = handle.trim().toLowerCase();
  const hex = prefix.slice(2);
  if (!HEX_ONLY_RE.test(hex)) return null; // belt and braces: no ilike wildcards
  try {
    const { data, error } = await db
      .from("launch_wars_s7_players")
      .select("*")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .ilike("wallet", `${prefix}%`)
      .limit(3);
    if (error || !data) return null;
    const rows = data as PlayerRow[];
    return pickByWalletPrefix(
      prefix,
      rows.map((r) => ({ ...r, wallet: String(r.wallet || "") })),
    );
  } catch {
    return null;
  }
}

async function playerBySlug(db: Db, handle: string): Promise<PlayerRow | null> {
  try {
    const { data, error } = await db
      .from("launch_wars_s7_players")
      .select("*")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .not("display_name", "is", null)
      .order("points", { ascending: false })
      .limit(1000);
    if (error || !data) return null;
    const rows = data as PlayerRow[];
    return pickBySlug(
      handle,
      rows.map((r) => ({ ...r, wallet: String(r.wallet || "") })),
    );
  } catch {
    return null;
  }
}

/**
 * Display name for a class id.
 *
 * The private Class Hall owns CLASS_NAME, but that module is "use client" and
 * a server module cannot dot into a client module (React hands the server a
 * reference proxy, not the object). Every class id is one lowercase word whose
 * capitalization IS its Class Hall name, so this rebuild cannot disagree with
 * it. The public PAGE renders CLASS_NAME directly (imported), so what a player
 * reads is always the hall's own string; this one only feeds the og:image,
 * which has no client boundary to import across.
 */
function classDisplayName(classKey: string): string {
  return classKey.charAt(0).toUpperCase() + classKey.slice(1);
}

/**
 * The wallet's ACTIVE class track, read through lib/s7/classes so the level
 * curve and the stage thresholds have exactly one owner (a second copy of
 * xpForLevel here would drift the day the curve is tuned).
 *
 * FAILS SOFT to null on anything: a missing table, an env gap, a player who
 * enlisted before the class system existed. The garage must still render.
 */
async function activeClassFor(db: Db, wallet: string): Promise<PublicActiveClass | null> {
  try {
    const { active, tracks } = await getTracks(db, wallet);
    if (!active) return null;
    const tr = tracks.find((t) => t.classKey === active);
    if (!tr) return null;
    const level = Math.max(1, Math.min(MAX_LEVEL, tr.level));
    const floor = xpForLevel(level);
    // At the top level the span is 0; clamp to 1 so the bar reads full rather
    // than dividing by zero. The page prints "Top level reached" there.
    const xpNeed = Math.max(1, xpForLevel(Math.min(MAX_LEVEL, level + 1)) - floor);
    const xpInto = Math.max(0, Math.min(xpNeed, tr.xp - floor));
    return {
      classKey: tr.classKey,
      className: classDisplayName(tr.classKey),
      level,
      xp: tr.xp,
      xpInto,
      xpNeed,
      stage: stageForLevel(level),
      gear: tr.gear,
    };
  } catch {
    return null;
  }
}

function buildView(row: PlayerRow): PublicGarage {
  const hq = hqObject(row.hq);
  const hqView = buildHqView(row.hq);
  const eb = hq.enlisted_by;
  const enlistedBy = typeof eb === "string" && eb.trim() ? publicCallsign(eb) : null;
  return {
    callsign: publicCallsign(row.display_name),
    rank: rankName(hqView.bondsTier),
    tank: resolveTank(row.hq),
    // buildView is sync and has only the player row: the class track needs the
    // db, so the async resolver fills this in below.
    activeClass: null,
    adventurerKey: hqView.adventurer,
    bondsTier: hqView.bondsTier,
    streakDays: hqView.streakDays,
    cratesOpened: hqView.crates.length,
    enlistedBy,
    handle: handleForPlayer(row.display_name, String(row.wallet || "")),
  };
}

async function _resolvePublicHq(rawHandle: string): Promise<PublicHqResult | null> {
  let h = String(rawHandle || "");
  try {
    h = decodeURIComponent(h); // Next 14 dynamic params arrive percent-encoded
  } catch {
    // keep the raw form
  }
  h = h.trim().slice(0, 80);
  if (!h) return null;

  let db: Db;
  try {
    db = s7Db();
  } catch {
    return null; // env not configured: the page renders its themed not-found
  }

  const row = isWalletPrefixHandle(h)
    ? await playerByWalletPrefix(db, h)
    : await playerBySlug(db, h);
  if (!row) return null;

  const wallet = String(row.wallet || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return null;
  return { view: { ...buildView(row), activeClass: await activeClassFor(db, wallet) }, wallet };
}

/** Request-deduped (generateMetadata + the page + the card share one read). */
export const resolvePublicHq = cache(_resolvePublicHq);
