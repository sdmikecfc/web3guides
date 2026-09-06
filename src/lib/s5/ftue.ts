/**
 * S5 FTUE quest chain, client-safe helpers.
 *
 * The footlocker panel is a 5-quest log that walks a new commander from first
 * tap to first hold. Quests 1 and 2 are PRE-WALLET and tracked in localStorage
 * under "s5_ftue" (merged visually with the server truth once a session
 * exists); 3 to 5 come from the session / me payload / funding detector.
 *
 * Everything is wrapped: storage being blocked must never break the HQ.
 * No IO beyond localStorage, no secrets. Copy rules: no em-dashes.
 */

import { GUEST_STORAGE_KEY } from "./games";

export const FTUE_STORAGE_KEY = "s5_ftue";

export type FtueLocal = {
  v: 1;
  /** Distinct hotspot keys whose nameplate was opened (quest 1 wants 3). */
  tour: string[];
  /** True once any arcade result screen rendered in this browser (quest 2). */
  run: boolean;
};

function emptyFtue(): FtueLocal {
  return { v: 1, tour: [], run: false };
}

export function readFtue(): FtueLocal {
  if (typeof window === "undefined") return emptyFtue();
  try {
    const raw = localStorage.getItem(FTUE_STORAGE_KEY);
    if (!raw) return emptyFtue();
    const p = JSON.parse(raw) as Partial<FtueLocal>;
    return {
      v: 1,
      tour: Array.isArray(p.tour)
        ? p.tour.filter((k): k is string => typeof k === "string" && k.length <= 24).slice(0, 24)
        : [],
      run: Boolean(p.run),
    };
  } catch {
    return emptyFtue();
  }
}

function writeFtue(f: FtueLocal) {
  try {
    localStorage.setItem(FTUE_STORAGE_KEY, JSON.stringify(f));
  } catch {
    // storage blocked: progress just does not persist
  }
}

/** Quest 1: record one nameplate open; distinct keys only. */
export function markFtueHotspot(key: string): FtueLocal {
  const f = readFtue();
  if (!f.tour.includes(key)) {
    f.tour = [...f.tour, key].slice(0, 24);
    writeFtue(f);
  }
  return f;
}

/** Quest 2: any game result screen rendered (the engine calls this on finish). */
export function markFtueRun(): void {
  const f = readFtue();
  if (!f.run) {
    f.run = true;
    writeFtue(f);
  }
}

/** Quest 1 needs this many distinct nameplate opens. */
export const FTUE_TOUR_GOAL = 3;

/**
 * Quest 2 fallback signal: any guest arcade best parked in this browser
 * (the games' GUEST_STORAGE_KEY store). Read-only, junk-tolerant.
 */
export function guestHasAnyScore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw) as { scores?: Record<string, unknown>; claimed?: unknown };
    if (p?.claimed) return true; // bests were claimed, so runs definitely happened
    const scores = p?.scores && typeof p.scores === "object" ? p.scores : {};
    return Object.values(scores).some((v) => Number(v) > 0);
  } catch {
    return false;
  }
}

// ── Decal display names (the workbench shelf) ───────────────────────────────
/** Known earned decals; anything else renders as a generic field patch. */
export const DECAL_LABELS: Record<string, string> = {
  "first-colors": "First Colors",
  "division-star": "Division Star",
  "iron-discipline": "Iron Discipline",
  convoy: "Convoy",
};

/** Display label for one decal key (known name, else a tidied generic patch). */
export function decalLabel(key: string): string {
  if (DECAL_LABELS[key]) return DECAL_LABELS[key];
  const tidy = String(key || "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return tidy || "Field Patch";
}

/** True when this decal key has a known name (unknown ones render generic). */
export function isKnownDecal(key: string): boolean {
  return Boolean(DECAL_LABELS[key]);
}

// ── War Bonds display constants (bot-owned data, web display only) ──────────
export const BONDS_TIER_MAX = 20;
/** 1 bond XP per 100 Medals (display math only; the bot owns the tier). */
export const BONDS_XP_PER_MEDALS = 100;
/** Hold-streak reward markers (days). */
export const STREAK_MARKERS = [3, 7, 14] as const;
export const STREAK_METER_MAX = 14;
