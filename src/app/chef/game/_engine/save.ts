/**
 * The save shape, and the sanitizer that makes a save SAFE TO TRUST (M6).
 *
 * This module is shared by the browser and the server on purpose: the client
 * writes saves and the server accepts them, and both must agree on exactly
 * what a legal save is. The server treats every incoming save as hostile —
 * anyone can POST anything — so `sanitizeSave` is the only way state enters
 * the game, and it drops unknown keys rather than trusting them.
 *
 * Renderer-free and React-free: importable from a route handler.
 */

import { COURSES } from "./academy";
import { itemDef, MARKETS } from "./items";
import { DAILY_SPECIALS, INGREDIENTS, MAX_DISH_LEVEL, RECIPES } from "./pantry";
import { SHELL_SIZES } from "./rooms";
import {
  GUEST_VARIANTS,
  HIRE_SHOP,
  MAX_REGULARS,
  REGULAR_NAMES,
  type Facing,
  type PlacedSpec,
  type WorldState,
} from "./world";

export const SAVE_VERSION = 6;

/**
 * YOUR CREW (M7d): which chef and waiter look the player picked, and what
 * they named their chef.
 *
 * Deliberately stored HERE and not in WorldState. hashWorld is fnv1a over the
 * whole world, so anything added there lands in the sim hash — and a cosmetic
 * must never move a sim number (ADR-0067/0090/0103/0105). `theme` already
 * follows this exact pattern: persisted and cloud-synced, never hashed.
 */
export const CREW_LOOKS = 6;
export const CHEF_NAME_MAX = 16;
export const ROOM_NAME_MAX = 24;
/**
 * The value of DkSave.intro meaning "finished or skipped" (M8).
 *
 * ⚠️ MUST EQUAL `INTRO_DONE` in Coach.tsx. It is duplicated because this file
 * is the save boundary and must not import a React component, so the two are
 * checked against each other in `dk-save-check.mts` instead. If they drift,
 * the sanitizer clamps `intro` below the real last step and that step can
 * never persist as finished — the coach would reappear forever.
 *
 * 5 -> 6 in M10, which added a fifth step.
 */
export const INTRO_STEPS_DONE = 6;

/** Hard ceilings. A save that exceeds them is clamped, never rejected. */
export const LIMITS = {
  layout: 120,
  inventoryKinds: 60,
  perItem: 999,
  coins: 1_000_000_000,
  stock: 999,
  serves: 1_000_000,
  lpDays: 3650,
  /** ceiling for a practice dial; a live wallet read is not clamped by this */
  dial: 5000,
  /** whole days since the epoch; comfortably past any real date */
  utcDay: 100_000,
  /** biggest JSON we will accept over the wire, before parsing */
  bytes: 24_000,
} as const;

export interface DkSave {
  v: number;
  market: string;
  lpDays: Record<string, number>;
  coins: number;
  waiters: number;
  chefs: number;
  layout: { itemId: string; gx: number; gy: number; facing: Facing }[];
  inventory: Record<string, number>;
  pantry: { stock: Record<string, number>; levels: Record<string, number> };
  menu: {
    serves: Record<string, number>;
    specialUnlocked: boolean;
    specialServes: number;
    specialMastered: boolean;
  };
  bestQuality: number;
  /**
   * The practice dials (M8). These persisted back in M2 and were dropped when
   * the save shape grew; the cost was that every reload reset the player's
   * position to $25/$60, and the offline grant paid out against those
   * hard-coded numbers rather than what the player had actually set.
   */
  dials: { parkedUsd: number; weeklyVolumeUsd: number };
  /** the real UTC day this save last saw, and today's special (M8) */
  utcDay: number;
  /**
   * v6: `served` and the two beat flags persist so a reload mid-day cannot
   * pay a daily beat twice -- or lose one the player already earned. Old
   * saves have none of them and land on 0/false, which pays the beats on the
   * next serve: kind, and worth at most one day's beats once ever.
   */
  daily: {
    idx: number;
    prepped: boolean;
    served: number;
    potPaid: boolean;
    firstServePaid: boolean;
    plates: number;
    greeted: boolean;
    goalPlatesPaid: boolean;
    goalSpecialPaid: boolean;
    goalGreetPaid: boolean;
  };
  /**
   * The people who keep coming back (M8b). Earned by hearts, so this is a
   * record of how well the room was actually run. Names are INDICES into a
   * fixed table, never free text — the same reasoning that keeps the chef's
   * name off the public board.
   */
  regulars: { n: number; look: number; fav: string; served: number }[];
  /** which shell the room grew into, an index into SHELL_SIZES (M8b) */
  shell: number;
  theme: string;
  /** cosmetic only: never read by the sim, never hashed (M7d) */
  crew: { chef: number; waiter: number; chefName: string };
  /** the restaurant's public name; "" until the player sets one */
  name: string;
  /** Academy courses finished (ADR-0050) */
  courses: string[];
  /**
   * How far the first-run coach got: 0 not started, 1..4 the step showing,
   * 5 finished or skipped (M8). Cloud-synced so a player who starts on a
   * phone and comes back on a laptop is not taught the same thing twice.
   */
  intro: number;
  savedAt: number;
}

const THEMES = ["trattoria", "izakaya", "taqueria", "diner", "bistro"];
const MARKET_IDS = MARKETS.map((m) => m.id);
const IGREDIENT_IDS = new Set(INGREDIENTS.map((i) => i.id));
const DISH_KEYS = Object.keys(RECIPES);
const COURSE_IDS = new Set(COURSES.map((c) => c.id));

function num(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function bool(v: unknown): boolean {
  return v === true;
}

/**
 * The one free-text field in the whole save. Letters, digits, spaces and a
 * couple of name punctuation marks; everything else is dropped rather than
 * escaped, so nothing downstream has to remember to escape it. Capped hard.
 *
 * This name is LOCAL COLOUR. It renders over the player's own chef and is
 * never published: /chef/board ranks shortened wallets, and putting arbitrary
 * user text on a public page is a different problem with a different answer.
 */
function cleanName(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    // Denylist, not an allowlist: an ASCII allowlist would quietly delete
    // every non-Latin name. Strip control characters, then the invisible
    // troublemakers -- zero-width joiners and bidi overrides, which render
    // as nothing but can reorder a whole line.
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function chefName(v: unknown): string {
  return cleanName(v, CHEF_NAME_MAX);
}

/**
 * The restaurant's name (CUTE+VIRAL push). Unlike chefName this one IS
 * published: it renders on the door sign, the board, postcards and visits.
 * Same denylist sanitizer (non-Latin names survive, control and bidi
 * characters do not), and dk-board-check asserts a forged save cannot smuggle
 * markup through it onto the public page.
 */
export function roomName(v: unknown): string {
  return cleanName(v, ROOM_NAME_MAX);
}

/** Serialize a live world into the save shape. */
export function serializeSave(
  w: WorldState,
  theme: string,
  crew?: DkSave["crew"],
  intro = INTRO_STEPS_DONE,
  name = ""
): DkSave {
  const serves: Record<string, number> = {};
  for (const d of w.menu.dishes) serves[d.key] = d.serves;
  return {
    v: SAVE_VERSION,
    market: w.market,
    lpDays: { ...w.lpDays },
    coins: Math.floor(w.playMoney),
    waiters: w.hires.waiters,
    chefs: w.hires.chefs,
    layout: w.layout.map((p) => ({ itemId: p.itemId, gx: p.gx, gy: p.gy, facing: p.facing })),
    inventory: { ...w.inventory },
    pantry: { stock: { ...w.pantry.stock }, levels: { ...w.pantry.levels } },
    menu: {
      serves,
      specialUnlocked: w.menu.specialUnlocked,
      specialServes: w.menu.specialServes,
      specialMastered: w.menu.specialMastered,
    },
    // A WHOLE number on purpose: `num` floors everything on the way back in,
    // so a saved 60.5 used to reload as 60 and the record drifted down a
    // little on every reload. Everything that displays this shows an integer
    // anyway. Caught by the reload property in dk-save-check.
    bestQuality: Math.round(w.stats.bestQuality),
    dials: {
      parkedUsd: Math.round(w.dials.parkedUsd),
      weeklyVolumeUsd: Math.round(w.dials.weeklyVolumeUsd),
    },
    utcDay: w.utcDay,
    daily: {
      idx: w.daily.idx,
      prepped: w.daily.prepped,
      served: Math.max(0, Math.floor(w.daily.served)),
      potPaid: w.daily.potPaid,
      firstServePaid: w.daily.firstServePaid,
      plates: Math.max(0, Math.floor(w.daily.plates)),
      greeted: w.daily.greeted,
      goalPlatesPaid: w.daily.goalPlatesPaid,
      goalSpecialPaid: w.daily.goalSpecialPaid,
      goalGreetPaid: w.daily.goalGreetPaid,
    },
    regulars: w.regulars.map((r) => ({ n: r.n, look: r.look, fav: r.fav, served: r.served })),
    shell: w.shellIdx,
    theme,
    crew: crew ?? { chef: 0, waiter: 0, chefName: "" },
    name: roomName(name),
    courses: [...w.courses],
    intro: Math.max(0, Math.min(INTRO_STEPS_DONE, Math.floor(intro))),
    savedAt: Date.now(),
  };
}

/**
 * Turn anything at all into a legal save. Unknown items, out-of-range
 * numbers, junk keys and oversized collections are dropped or clamped; the
 * result is always safe to hand to createWorld.
 */
export function sanitizeSave(raw: unknown): DkSave {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // layout: only real catalog items, only inside the room, only known facings
  const rawLayout = Array.isArray(src.layout) ? src.layout.slice(0, LIMITS.layout) : [];
  const layout: DkSave["layout"] = [];
  for (const entry of rawLayout) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const itemId = typeof e.itemId === "string" ? e.itemId : "";
    if (!itemDef(itemId)) continue; // an item we do not sell cannot be placed
    layout.push({
      itemId,
      gx: num(e.gx, 0, 63),
      gy: num(e.gy, 0, 63),
      facing: e.facing === "sw" ? "sw" : "se",
    });
  }

  // inventory: known items only, sane counts
  const inventory: Record<string, number> = {};
  const rawInv = (src.inventory && typeof src.inventory === "object" ? src.inventory : {}) as Record<string, unknown>;
  for (const [id, n] of Object.entries(rawInv).slice(0, LIMITS.inventoryKinds)) {
    if (!itemDef(id)) continue;
    const c = num(n, 0, LIMITS.perItem);
    if (c > 0) inventory[id] = c;
  }

  // pantry: known ingredients, levels inside their real bounds
  const stock: Record<string, number> = {};
  const rawStock = (src.pantry && typeof src.pantry === "object"
    ? ((src.pantry as Record<string, unknown>).stock ?? {})
    : {}) as Record<string, unknown>;
  for (const [id, n] of Object.entries(rawStock)) {
    if (!IGREDIENT_IDS.has(id)) continue;
    const c = num(n, 0, LIMITS.stock);
    if (c > 0) stock[id] = c;
  }
  const levels: Record<string, number> = {};
  const rawLevels = (src.pantry && typeof src.pantry === "object"
    ? ((src.pantry as Record<string, unknown>).levels ?? {})
    : {}) as Record<string, unknown>;
  for (const key of DISH_KEYS) levels[key] = num(rawLevels[key], 1, MAX_DISH_LEVEL, 1);

  // tenure: known markets only
  const lpDays: Record<string, number> = {};
  const rawDays = (src.lpDays && typeof src.lpDays === "object" ? src.lpDays : {}) as Record<string, unknown>;
  for (const id of MARKET_IDS) {
    const d = num(rawDays[id], 0, LIMITS.lpDays);
    if (d > 0) lpDays[id] = d;
  }

  const rawMenu = (src.menu && typeof src.menu === "object" ? src.menu : {}) as Record<string, unknown>;
  const rawServes = (rawMenu.serves && typeof rawMenu.serves === "object" ? rawMenu.serves : {}) as Record<string, unknown>;
  const serves: Record<string, number> = {};
  for (const key of DISH_KEYS) {
    if (key === "special") continue;
    serves[key] = num(rawServes[key], 0, LIMITS.serves);
  }

  const rawDials = (src.dials && typeof src.dials === "object" ? src.dials : {}) as Record<string, unknown>;
  const rawDaily = (src.daily && typeof src.daily === "object" ? src.daily : {}) as Record<string, unknown>;

  /**
   * Regulars: a fixed-size roster of indices into a fixed name table, each
   * with a real dish key. A forged entry cannot invent a person, a name, or a
   * dish -- and duplicates are collapsed, so nobody can stuff the roster with
   * six copies of the same regular to inflate the crowd bonus.
   */
  const regulars: DkSave["regulars"] = [];
  const seenRegular = new Set<number>();
  const rawRegulars = Array.isArray(src.regulars) ? src.regulars.slice(0, MAX_REGULARS) : [];
  for (const entry of rawRegulars) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const n = num(r.n, 0, REGULAR_NAMES.length - 1, -1);
    if (n < 0 || seenRegular.has(n)) continue;
    const fav = typeof r.fav === "string" && DISH_KEYS.includes(r.fav) ? r.fav : DISH_KEYS[0];
    seenRegular.add(n);
    regulars.push({
      n,
      look: num(r.look, 0, GUEST_VARIANTS - 1),
      fav,
      served: num(r.served, 0, LIMITS.serves),
    });
  }

  const marketRaw = typeof src.market === "string" ? src.market : "";
  const themeRaw = typeof src.theme === "string" ? src.theme : "";
  const rawCrew = (src.crew && typeof src.crew === "object" ? src.crew : {}) as Record<string, unknown>;

  return {
    v: SAVE_VERSION,
    market: MARKET_IDS.includes(marketRaw) ? marketRaw : MARKET_IDS[0],
    lpDays,
    coins: num(src.coins, 0, LIMITS.coins, 20),
    waiters: num(src.waiters, 1, HIRE_SHOP.waiter.max, 1),
    chefs: num(src.chefs, 1, HIRE_SHOP.chef.max, 1),
    layout,
    inventory,
    pantry: { stock, levels },
    menu: {
      serves,
      specialUnlocked: bool(rawMenu.specialUnlocked),
      specialServes: num(rawMenu.specialServes, 0, LIMITS.serves),
      specialMastered: bool(rawMenu.specialMastered),
    },
    bestQuality: num(src.bestQuality, 0, 100),
    dials: {
      parkedUsd: num(rawDials.parkedUsd, 0, LIMITS.dial, 25),
      weeklyVolumeUsd: num(rawDials.weeklyVolumeUsd, 0, LIMITS.dial, 60),
    },
    utcDay: num(src.utcDay, 0, LIMITS.utcDay),
    daily: {
      idx: num(rawDaily.idx, 0, DAILY_SPECIALS.length - 1),
      prepped: bool(rawDaily.prepped),
      served: num(rawDaily.served, 0, LIMITS.serves),
      potPaid: bool(rawDaily.potPaid),
      firstServePaid: bool(rawDaily.firstServePaid),
      plates: num(rawDaily.plates, 0, 100000),
      greeted: bool(rawDaily.greeted),
      goalPlatesPaid: bool(rawDaily.goalPlatesPaid),
      goalSpecialPaid: bool(rawDaily.goalSpecialPaid),
      goalGreetPaid: bool(rawDaily.goalGreetPaid),
    },
    regulars,
    shell: num(src.shell, 0, SHELL_SIZES.length - 1),
    theme: THEMES.includes(themeRaw) ? themeRaw : THEMES[0],
    crew: {
      chef: num(rawCrew.chef, 0, CREW_LOOKS - 1),
      waiter: num(rawCrew.waiter, 0, CREW_LOOKS - 1),
      chefName: chefName(rawCrew.chefName),
    },
    name: roomName((src as { name?: unknown }).name),
    // only real course ids, each at most once
    courses: Array.isArray(src.courses)
      ? Array.from(
          new Set(
            (src.courses as unknown[])
              .filter((c): c is string => typeof c === "string")
              .filter((c) => COURSE_IDS.has(c))
          )
        )
      : [],
    // defaults to 0 = "not started". A save written before M8 has no `intro`
    // at all and also lands on 0, so the boot code distinguishes the two by
    // savedAt: an existing player has played, and is not taught to play.
    intro: num(src.intro, 0, INTRO_STEPS_DONE, 0),
    savedAt: num(src.savedAt, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** The layout in the shape createWorld wants. */
export function layoutFromSave(save: DkSave): PlacedSpec[] {
  return save.layout.map((p) => ({ itemId: p.itemId, gx: p.gx, gy: p.gy, facing: p.facing }));
}

/** Which of two saves to trust when local and cloud disagree. */
export function newerSave(a: DkSave | null, b: DkSave | null): DkSave | null {
  if (!a) return b;
  if (!b) return a;
  return b.savedAt > a.savedAt ? b : a;
}
