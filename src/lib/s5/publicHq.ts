/**
 * S5 PUBLIC GARAGE resolution, server-only: turns a /s5/hq/[handle] URL into
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
import { s5Db, SEASON_KEY } from "./server";
import { resolveTank, type ResolvedTank } from "./model";
import { buildHqView, hqObject } from "./me";
import {
  handleForPlayer,
  isWalletPrefixHandle,
  pickBySlug,
  pickByWalletPrefix,
  publicCallsign,
  rankName,
} from "./handles";

type Db = ReturnType<typeof s5Db>;
type PlayerRow = Record<string, unknown>;

/** Everything the public garage page + card may render. Counts only, no money. */
export type PublicGarage = {
  callsign: string;
  rank: string;
  tank: ResolvedTank;
  commanderKey: string;
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
      .from("launch_wars_s5_players")
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
      .from("launch_wars_s5_players")
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

function buildView(row: PlayerRow): PublicGarage {
  const hq = hqObject(row.hq);
  const hqView = buildHqView(row.hq);
  const eb = hq.enlisted_by;
  const enlistedBy = typeof eb === "string" && eb.trim() ? publicCallsign(eb) : null;
  return {
    callsign: publicCallsign(row.display_name),
    rank: rankName(hqView.bondsTier),
    tank: resolveTank(row.hq),
    commanderKey: hqView.commander,
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
    db = s5Db();
  } catch {
    return null; // env not configured: the page renders its themed not-found
  }

  const row = isWalletPrefixHandle(h)
    ? await playerByWalletPrefix(db, h)
    : await playerBySlug(db, h);
  if (!row) return null;

  const wallet = String(row.wallet || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return null;
  return { view: buildView(row), wallet };
}

/** Request-deduped (generateMetadata + the page + the card share one read). */
export const resolvePublicHq = cache(_resolvePublicHq);
