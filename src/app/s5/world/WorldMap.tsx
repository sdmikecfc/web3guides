"use client";
/**
 * SEASON 5 ON THE WORLD ENGINE — the composition layer.
 *
 * This file is deliberately THIN. It owns no camera maths, no placement, no
 * sprite loading and no dialog plumbing: all of that is the season-agnostic
 * engine (src/app/_world, src/lib/world). What lives here is only the S5
 * SPECIFICS — which snapshot field drives which fort picture, what a
 * stronghold dossier says, what a game popup offers. That ratio is the whole
 * point: S6 rewrites this file and the descriptor, and nothing else.
 *
 * LOCALE, and the ISR trap it hides: the server page must NEVER call
 * getLocale(), because that reads cookies and silently opts the route into
 * dynamic rendering — which is exactly why /s5/map is dynamic today despite
 * carrying `revalidate = 60`. This is the season's highest-traffic route, so
 * it follows the /s5 landing pattern instead: English renders on the server,
 * and the cookie locale is applied client-side on mount.
 *
 * Client-safe imports ONLY. Every module below (world, games, rewards,
 * strings, locale, theme, funding) is free of `server-only` and `next/headers`.
 * Importing a VALUE from lib/s5/data.ts here would pass tsc and break
 * `next build`, so the server hands down plain JSON and this file defines its
 * own WorldTarget shape rather than importing the snapshot's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { S5_CAMPS, S5_GAME_FALLBACK, S5_TARGET_SCALE, S5_WORLD, S5_WORLD_PADS, S5_WORLD_PATHS, S5_WORLD_TRACKS } from "@/lib/s5/world";
import { siteArtUrl, targetArtFor, targetPos, type DayPhase, type WorldSite } from "@/lib/world/types";
import { GAMES, GAME_DAILY_POINTS_CAP, POINTS_PER_RUN, readSessionToken } from "@/lib/s5/games";
import { breadthPct, ceilingUsd, curveNote, holdPreview } from "@/lib/s5/rewards";
import { STRINGS, fill, type S5Dict } from "@/lib/s5/strings";
import { BOUNTY_HOLD_CHECK_H } from "@/lib/s5/games";
import { clientLocale } from "@/lib/s5/locale";
import { markFtueHotspot } from "@/lib/s5/ftue";
import { statusLabel, type TargetStatus, type Theme } from "@/lib/s5/theme";
import { buyLink } from "@/lib/s5/funding";
import { BuyPanel } from "@/app/s5/_components/BuyPanel";
import { MapHints, MAP_HINTS_CSS } from "./MapHints";
import { MapIntro, introPending } from "./MapIntro";
import { WATER_H, WATER_W, nearestDry } from "@/lib/s5/world.water";
import { WorldViewport, type PlaceChip } from "@/app/_world/WorldViewport";
import type { PanZoom } from "@/app/_world/usePanZoom";
import { WorldSprite } from "@/app/_world/WorldSprite";
import { MapPopup } from "@/app/_world/MapPopup";
import { WorldCanvas, type SmokeSource } from "@/app/_world/WorldCanvas";
import { SkyLayer } from "@/app/_world/SkyLayer";
import { WorldTerrain } from "@/app/_world/WorldTerrain";
// The garage panels, opened as cards OVER the map. They already take exactly
// { me, patchMe, dict }, so this is reuse rather than a second garage.
import { CommanderPanel, FootlockerPanel, TankPanel, WorkbenchPanel, type HqMe } from "@/app/s5/hq/panels";
import { useHqMe } from "@/app/s5/hq/useHqMe";

const GOLD = "#f0b340";
const GREY = "#87919b";
const ALERT = "#f87171";
const EMBER = "#e0662e";

/** The season's targets, flattened to plain JSON by the server page. Declared
 * here rather than imported from lib/s5/data (server-only) on purpose. */
export type WorldTarget = {
  domain: string;
  name: string;
  status: TargetStatus;
  progress: number;
  peakPct: number;
  securedUsd: number;
  poolShare: number;
  bondingFdv: number | null;
  initialFdv: number | null;
  bountyUsd: number | null;
  launchAt: string | null;
  launched: boolean;
  /** ISO time the wall broke, or null. Drives the hold-check countdown. */
  bondedAt: string | null;
  fresh: boolean;
  sprint: boolean;
};

/** A row of the season standings, flattened by the server page. */
export type StandingRow = { rank: number; name: string; points: number; handle: string };
export type GameBoardLite = {
  key: string;
  name: string;
  rows: { rank: number; name: string; score: number }[];
};

/** A commander to DRAW on the board. `domain` is the wall they hold most of,
 * lowercased, or null when they hold nothing and muster at the staging area. */
export type MapCommander = {
  rank: number;
  name: string;
  handle: string;
  tankKey: string;
  /** Earned camo; selects the recoloured map sprite. */
  camo?: string;
  commanderKey: string;
  domain: string | null;
};

export type WorldMapProps = {
  commanders: MapCommander[];
  standings: StandingRow[];
  gameBoards: GameBoardLite[];
  totalPlayers: number;
  targets: WorldTarget[];
  poolLineText: string;
  pool: { full: number; secured: number; unlocked: number; paidOutUsd: number };
  serverNowMs: number;
  theme: Theme;
  empty: boolean;
  /** The hour, computed on the SERVER so every commander sees the same sky. */
  phase: DayPhase;
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * STAGGER LABELS THAT WOULD LAND ON THE SAME LINE.
 *
 * A label sits just under its building's feet, so two sites that are close in
 * BOTH axes put their chips at the same height and overlap - which is exactly
 * what happened to "supplemintz.com" and "Walletz.xyz", whose buildings were
 * comfortably apart while their labels sat on top of each other.
 *
 * Proximity is measured in SCREEN SPACE, not listing order: strongholds are
 * hand-placed now, so t3 and t7 can be neighbours while t3 and t4 are far
 * apart. Each site drops its label one line per closer neighbour already
 * counted, so a cluster of three fans out instead of stacking.
 */
function labelLifts(pts: { x: number; y: number }[]): number[] {
  // MUST EXCEED THE LABEL HEIGHT (~25px), or a staggered label still clips the
  // one it is dodging - at 19px the stagger looked like it had not worked.
  const LINE = 29;
  // The x threshold has to exceed a LABEL width, not a building width, since
  // that is what actually collides.
  return pts.map((p, i) => {
    let n = 0;
    for (let j = 0; j < i; j++) {
      const q = pts[j];
      if (Math.abs(p.x - q.x) < 0.115 && Math.abs(p.y - q.y) < 0.085) n++;
    }
    return n * LINE;
  });
}

/*
 * A y-AWARE version of the above was tried and measured WORSE, twice:
 *
 *   requirement chained  -> lifts reached 863px, labels half a screen from
 *                           their building (median gap 308px vs 17px)
 *   capped at two lines  -> 3 overlaps instead of 2, median gap 63px
 *
 * Counting neighbours is cruder but keeps every label ON its building, which
 * matters more than the last two touching pairs. Those two are the densest
 * corners of a hand-authored layout and are better fixed by nudging a
 * coordinate in map-layout.txt than by a smarter solver.
 */

/**
 * WHERE EACH COMMANDER STANDS.
 *
 * At the stronghold they hold the MOST of, so the board shows who is fighting
 * where rather than an anonymous war. Two people on the same wall are spread
 * on a GOLDEN-ANGLE ring - successive figures can never land on each other and
 * the ring simply grows as the crowd does. That trick came from S3, which used
 * it to fix S2's buried, un-clickable pile; it is reused here rather than
 * re-derived.
 *
 * Anyone holding nothing musters beside the staging area rather than vanishing
 * from the map, because "nobody is playing" and "I hold nothing yet" must not
 * look the same.
 *
 * The ring starts OUTSIDE the fort's own footprint: a stronghold sprite is
 * `targetSize` wide and a commander figure about half that, so anything closer
 * would tuck a tank behind a wall.
 */
const GOLDEN = 2.399963; // radians; the angle that never repeats a direction

/** THE REAR, in board fractions: the friendly country south of the front,
 * the full width of the plate. Anyone holding nothing is camped across it
 * rather than stacked in one corner, then relaxed off anything solid. */
// The muster ground is AUTHORED: the `camp` line in map-layout.txt (drawn as
// the PLAYER SAFE AREA ellipse in map-editor.html) is the zone camped
// commanders scatter inside. A layout without one falls back to following the
// muster sign, so nothing per-plate lives hardcoded in this component either
// way — Mike, 2026-08-01: "that would encapsulate all issues with maps for
// future seasons."
type Zone = { x: number; y: number; rx: number; ry: number };
/** EVERY camp zone the plate authored, grown for the crowd. A board may carry
 * as many `camp` lines as it needs (Mike, 2026-08-02: "the one oval does not
 * cover all the area I need"); one is still perfectly normal, and none still
 * falls back to the muster sign. */
function rearZones(muster: { x: number; y: number } | undefined, campers = 0): Zone[] {
  if (S5_CAMPS.length > 0) {
    const grow = campGrow(campers / S5_CAMPS.length);
    return S5_CAMPS.map((c) => ({ ...c, rx: c.rx * grow, ry: c.ry * grow }));
  }
  return [rearZone(muster, campers)];
}
/** Which zone does camper `n` of `total` belong to? BY AREA, so a zone twice
 * the size takes twice the tanks and every zone ends up the same density --
 * dealing them round-robin would pack a small zone and leave a big one empty.
 * Deterministic: the same n always lands in the same zone. */
function zoneFor(zones: Zone[], n: number, total: number): Zone {
  if (zones.length === 1) return zones[0];
  const areas = zones.map((z) => Math.max(1e-6, z.rx * z.ry));
  const sum = areas.reduce((a, b) => a + b, 0);
  const want = ((n + 0.5) / Math.max(1, total)) * sum;
  let acc = 0;
  for (let i = 0; i < zones.length; i++) {
    acc += areas[i];
    if (want <= acc) return zones[i];
  }
  return zones[zones.length - 1];
}
/** How many campers land in this zone, for the phyllotaxis normalisation. */
function zoneShare(zones: Zone[], zi: number, total: number): number {
  if (zones.length === 1) return total;
  const areas = zones.map((z) => Math.max(1e-6, z.rx * z.ry));
  const sum = areas.reduce((a, b) => a + b, 0);
  return Math.max(1, Math.round((areas[zi] / sum) * total));
}
const campGrow = (perZone: number) => Math.min(1.85, Math.max(1, Math.sqrt(perZone / 24)));

function rearZone(
  muster: { x: number; y: number } | undefined,
  campers = 0,
): { x: number; y: number; rx: number; ry: number } {
  // THE CAMP GROWS WITH THE ARMY. The scatter is normalised so the same patch
  // of ground fills evenly at any crowd size, which is right up to a point and
  // wrong past it: at 75 campers the authored ellipse is standing room only and
  // figures start hiding each other whatever the relaxation does. Past two
  // dozen it widens by the square root of the crowd, so DENSITY stays put
  // instead of area, and it is capped so the camp never sprawls over the front.
  // In practice this is a guard rather than a live path: readTopCommanders
  // takes 20 (lib/s5/data.ts), so the board draws at most twenty figures and
  // measures completely clean there. ?preview=150 saturates it, as any finite
  // board would; do not tune for that case, raise the query limit first.
  const grow = campGrow(campers);
  const m = muster ?? { x: 0.7, y: 0.87 };
  // Slightly above the sign: the sign marks the camp's gate, the tents pitch
  // behind it, and the offset keeps figures off the bottom board edge.
  return {
    x: Math.min(0.83, Math.max(0.17, m.x)),
    y: Math.min(0.9, Math.max(0.1, m.y - 0.05)),
    rx: 0.13 * grow,
    ry: 0.075 * grow,
  };
}
/** A commander figure, in board fractions. Everything keeps this much air. */
const FIG_W = 0.03;
/** ...and how tall it stands, in board fractions (y is the compressed axis, so
 * this is not FIG_W: measured, not derived). */
const FIG_H = 0.04;
/** y is compressed against x on this plate, so every distance below is measured
 * in CIRCULAR space and only converted back when a point moves. DERIVED from
 * the descriptor: this was hardcoded 16/9 and the board became 2/1 on
 * 2026-08-01, which quietly skewed every ellipse and every distance test in
 * this file by 12%. */
const YSQ = S5_WORLD.aspect * 0.42;
/** How far BELOW a sign's anchor a figure's feet can be and still cover the
 * words, in board fractions. Measured off the live board rather than guessed:
 * a label spans 0.005 to 0.050 under the anchor, and a figure stands UP from
 * its feet by 0.040, so feet as low as 0.090 still put a hull across the text.
 * The first version of this number only counted the label and missed the
 * figure's own height, which is why figures kept landing on names that the
 * strips were supposed to be keeping clear. */
const LABEL_BAND = 0.09;
/** ...and how far a CAMPER's own name tag hangs below its feet, so a figure
 * standing a hair above a sign still has its tag land in the sign. Both bands
 * are worst-case at k=1: labels are counter-scaled to stay screen-constant, so
 * their board-fraction height only shrinks as the camera zooms in. */
const CMDR_TAG_BAND = 0.029;
/** Widest a name gets, in board fractions, half of it. Measured off the live
 * board rather than derived from the sprite: label width is TEXT width, and
 * "Mini Game: Armor Clash" is far wider than the arena it hangs under. A
 * sprite-derived half-width silently under-covered the longest names, which is
 * how figures kept landing on them after the strips were supposedly fixed. */
const LABEL_HALF_W_MIN = 0.078;
/** A hair of daylight past the edge, because a push that lands a figure exactly
 * ON the boundary is still touching the words. */
const STRIP_CLEAR = 0.004;
/** How much ground a wall keeps to itself, scaled: the 1.5x citadel is half
 * again wider than a plain wall. Module scope because BOTH placements need it
 * (the ring picks an angle with it, the camp relaxation pushes with it). */
const fortKeep = (i: number) => S5_WORLD.targetSize * (S5_TARGET_SCALE[i] ?? 1) * 0.95;
/** Every strip of ground that has a NAME written across it: under each wall,
 * under each site. A figure in one of these covers words. */
/** These sprites are not remotely circular: measured on the live board they
 * stand between 1.25 and 4.5 times their own width tall (y is the compressed
 * axis). 2.4 covers 15 of the 18 pieces on the board, and a circular keep-out
 * that clears a fort horizontally leaves a figure buried to the turret behind
 * it, which is half of what Mike saw as "hidden tanks". */
const ART_TALL = 2.4;
/** Would a figure standing at (x, y) be inside this sprite's picture? */
const insideArt = (x: number, y: number, bx: number, by: number, w: number) =>
  y >= by - w * ART_TALL && y - FIG_H <= by && Math.abs(x - bx) < w * 0.5 + FIG_W * 0.5;
const stripHalfW = (spriteW: number) => Math.max(spriteW * 0.75, LABEL_HALF_W_MIN) + FIG_W * 0.5;
function labelStrips(targetCount: number): Array<{ x: number; y: number; halfW: number }> {
  const out: Array<{ x: number; y: number; halfW: number }> = [];
  for (let i = 0; i < targetCount; i++) {
    const p = targetPos(S5_WORLD, i);
    out.push({ x: p.x, y: p.y, halfW: stripHalfW(S5_WORLD.targetSize * (S5_TARGET_SCALE[i] ?? 1)) });
  }
  for (const s of S5_WORLD.sites) out.push({ x: s.pos.x, y: s.pos.y, halfW: stripHalfW(s.size) });
  return out;
}
/** Is this spot standing on a name? Counts the figure's OWN tag, which hangs
 * below its feet, so a figure just above a sign is caught too. */
function onAnyLabel(strips: ReturnType<typeof labelStrips>, x: number, y: number): boolean {
  return strips.some((s) => {
    const dy = y - s.y;
    return dy > -CMDR_TAG_BAND && dy < LABEL_BAND && Math.abs(x - s.x) < s.halfW;
  });
}

/** Is this spot free of every picture and every name on the board? The one
 * predicate both the holder ring and the camp resolver ask. */
function spotClear(x: number, y: number, targetCount: number, strips: ReturnType<typeof labelStrips>): boolean {
  if (x < 0.03 || x > 0.97 || y < 0.04 || y > 0.95) return false;
  if (onAnyLabel(strips, x, y)) return false;
  for (let i = 0; i < targetCount; i++) {
    const p = targetPos(S5_WORLD, i);
    if (insideArt(x, y, p.x, p.y, S5_WORLD.targetSize * (S5_TARGET_SCALE[i] ?? 1))) return false;
  }
  for (const site of S5_WORLD.sites) {
    if (insideArt(x, y, site.pos.x, site.pos.y, site.size)) return false;
  }
  return true;
}

function commanderSpots(
  commanders: MapCommander[],
  targets: WorldTarget[],
  muster: { x: number; y: number } | undefined,
): Array<{ c: MapCommander; x: number; y: number; camped?: boolean }> {
  // NOBODY IS PLACED AT THE WALL THEY HOLD (Mike, 2026-08-04). Standing a
  // commander on their own stronghold published their holdings to anyone
  // looking at the board. Every commander now scatters across the authored
  // camps instead, so the map shows the ARMY without showing the ledger.
  const musterTotal = Math.max(1, commanders.length);
  const zones = rearZones(muster, musterTotal);
  // Every camper remembers WHICH zone it belongs to: the relaxation clamp and
  // the escape hatch both have to put it back in its own zone, not in zone 0.
  const zoneOf = new Map<{ x: number; y: number }, Zone>();
  /** How many have already been seated in each zone, so the spiral inside a
   * camp is indexed by that camp rather than by the global order. */
  const perZone = new Map<number, number>();
  const seen = new Map<string, number>();
  const out: Array<{ c: MapCommander; x: number; y: number; camped?: boolean }> = [];

  for (const c of commanders) {
    // One bucket now: the camps. `c.domain` is still carried on the commander
    // for the standings and the tap card, it just no longer decides position.
    const n = seen.get("__muster") ?? 0;
    seen.set("__muster", n + 1);

    {
      // SCATTERED ACROSS THE CAMPS. Not a grid: a grid of unheld commanders is
      // the solid slab, and on this board it marched straight through the
      // top-right fort. Phyllotaxis instead -- golden angle, radius sqrt(n) --
      // normalised against the crowd's own size so it fills the same country
      // evenly whether four are camped there or twenty, and never clamps.
      // Which zone, and where in it. The phyllotaxis is normalised against
      // that ZONE's own share of the crowd, so each one fills evenly instead
      // of the whole spiral being squeezed into whichever zone it lands in.
      const zi = Math.max(0, zones.indexOf(zoneFor(zones, n, musterTotal)));
      const zone = zones[zi];
      const share = zoneShare(zones, zi, musterTotal);
      // INDEX WITHIN THIS ZONE, counted for real.
      //
      // This used to be floor(n / zones.length), which is not the index within
      // the zone and is not even monotonic with it: on a three-camp board it
      // fed radii from a spiral of the wrong size, figures landed outside the
      // zone they had been assigned, and the relaxer then pushed them into a
      // neighbour. The visible symptom was Mike's third camp coming up EMPTY
      // (measured 16/4/0 against the 12/6/2 zoneFor actually assigns).
      //
      // Counting per zone makes t = sqrt((i + 0.5) / N) the textbook even-area
      // phyllotaxis it was always meant to be, and the angle now advances
      // within the zone so each camp gets its own spiral rather than a slice
      // of one shared one.
      const within = perZone.get(zi) ?? 0;
      perZone.set(zi, within + 1);
      const t = Math.sqrt((within + 0.5) / Math.max(1, share));
      const a = GOLDEN * within;
      const spot = {
        x: zone.x + Math.cos(a) * t * zone.rx,
        y: zone.y + Math.sin(a) * t * zone.ry,
        c,
        camped: true,
      };
      zoneOf.set(spot, zone);
      out.push(spot);
    }
  }
  // RELAX THE CAMP. Even scatter is not enough on its own: the rear has
  // eight buildings and two forts standing in it, and a figure that lands on
  // the player's own base reads exactly as badly as one standing in the river.
  // Four passes of the same push -- off forts, off buildings, off each other,
  // then back inside the rear. Fixed iteration order, so it is deterministic
  // and two players looking at the same board see the same camp.
  //
  // EVERY figure moves now: since 2026-08-04 nobody is pinned to a wall, so
  // there is no longer a class of commander whose position must be preserved.
  // Per-fort exclusion, SCALED: the 1.5x citadel is half again wider than a
  // plain wall, and an unscaled radius let campers stand on its wings the
  // moment the camp ellipse grew to cover fort country (Mike's fighting-camp
  // layout: players pitch among the walls they besiege, never ON one). The
  // radius itself is `fortKeep` at module scope, shared with the ring above.
  const push = (o: { x: number; y: number }, bx: number, by: number, keep: number) => {
    const dx = o.x - bx;
    const dy = (o.y - by) / YSQ;
    const d = Math.hypot(dx, dy);
    if (d >= keep || d < 0.0001) return;
    const k = (keep - d) / d;
    o.x += dx * k;
    o.y += dy * k * YSQ;
  };
  // OFF THE SIGNS, TOO. Every push above is a CIRCLE around a thing's feet,
  // but a fort and a site both hang their name in a strip BELOW those feet, and
  // a circle happily parks a camper right on the words: Mike, 2026-08-01,
  // "now we have a bunch of hidden tags or hidden tanks". Ring figures already
  // dodge their own wall's label by rotating; a camper has no ring to rotate
  // along, so it steps SIDEWAYS to the nearer edge of the strip. Sideways and
  // not down on purpose: down is the board edge or the next sign, and the camp
  // has room to spare left and right.
  // AND OUT FROM BEHIND THE BUILDING ITSELF. Every other push here is a
  // CIRCLE, and these sprites are not remotely circular: measured on the live
  // board they stand between 1.25 and 4.5 times their own width tall, so a
  // circular keep-out that clears a fort horizontally leaves a camper buried to
  // the turret behind it. Rectangular, and sideways for the same reason the
  // label push is: the camp has room left and right, not up and down.
  const pushOffArt = (o: { x: number; y: number }, bx: number, by: number, w: number) => {
    if (!insideArt(o.x, o.y, bx, by, w)) return;
    const halfW = w * 0.5 + FIG_W * 0.5;
    const dx = o.x - bx;
    if (Math.abs(dx) >= halfW) return;
    const right = bx + halfW + STRIP_CLEAR;
    const left = bx - halfW - STRIP_CLEAR;
    const fits = (x: number) => x > 0.03 && x < 0.97;
    const near = dx >= 0 ? right : left;
    const far = dx >= 0 ? left : right;
    o.x = fits(near) || !fits(far) ? near : far;
  };
  const pushOffLabel = (o: { x: number; y: number }, bx: number, by: number, halfW: number) => {
    const dy = o.y - by;
    if (dy <= -CMDR_TAG_BAND || dy >= LABEL_BAND) return;
    const dx = o.x - bx;
    if (Math.abs(dx) >= halfW) return;
    // Nearer side first, but only if there is board left to stand on: a sign
    // near the left edge has no room on its left, and a figure shoved that way
    // just gets clamped back onto the words it was supposed to clear.
    const right = bx + halfW + STRIP_CLEAR;
    const left = bx - halfW - STRIP_CLEAR;
    const fits = (x: number) => x > 0.03 && x < 0.97;
    const near = dx >= 0 ? right : left;
    const far = dx >= 0 ? left : right;
    o.x = fits(near) || !fits(far) ? near : far;
  };
  const camp = out.filter((o) => o.camped);
  for (let pass = 0; pass < 4; pass++) {
    for (let ci = 0; ci < camp.length; ci++) {
      const o = camp[ci];
      for (let i = 0; i < targets.length; i++) {
        const p = targetPos(S5_WORLD, i);
        push(o, p.x, p.y, fortKeep(i));
      }
      for (const site of S5_WORLD.sites) {
        push(o, site.pos.x, site.pos.y, site.size * 0.62 + FIG_W * 0.5);
      }
      for (const q of camp) {
        if (q === o) continue;
        // Half strength: the other figure gets its own turn to move away.
        const dx = o.x - q.x;
        const dy = (o.y - q.y) / YSQ;
        const d = Math.hypot(dx, dy);
        if (d < FIG_W * 1.35 && d > 0.0001) {
          const k = ((FIG_W * 1.35 - d) / d) * 0.5;
          o.x += dx * k;
          o.y += dy * k * YSQ;
        }
      }
      // The buildings and then the signs, after the crowd has finished shoving
      // each other about.
      for (let i = 0; i < targets.length; i++) {
        const p = targetPos(S5_WORLD, i);
        pushOffArt(o, p.x, p.y, S5_WORLD.targetSize * (S5_TARGET_SCALE[i] ?? 1));
        pushOffLabel(o, p.x, p.y, stripHalfW(S5_WORLD.targetSize * (S5_TARGET_SCALE[i] ?? 1)));
      }
      for (const site of S5_WORLD.sites) {
        pushOffArt(o, site.pos.x, site.pos.y, site.size);
        pushOffLabel(o, site.pos.x, site.pos.y, stripHalfW(site.size));
      }
      // Back inside the rear: the camp's own bounding box (plus a little
      // slack), derived from the muster sign like the scatter itself. The
      // fort/site pushes above keep the inside of the box honest; the box
      // keeps a pushed figure from being ejected into enemy country.
      const zn = zoneOf.get(o) ?? zones[0];
      o.x = Math.min(Math.min(0.975, zn.x + zn.rx + 0.03), Math.max(Math.max(0.025, zn.x - zn.rx - 0.03), o.x));
      o.y = Math.min(Math.min(0.955, zn.y + zn.ry + 0.03), Math.max(Math.max(0.03, zn.y - zn.ry - 0.03), o.y));
      // OUT OF THE WATER, last, so nothing above can push a figure back in.
      // The river and the lake are painted into the plate rather than
      // described in FIT_RIVERS, so this reads them off the picture itself.
      const dry = nearestDry(o.x, o.y);
      if (dry) {
        // Landing exactly on the cell centre would stack two escapees from the
        // same stretch of river, and this is the LAST step of the last pass so
        // nothing gets to separate them afterwards. A golden-angle offset
        // inside the cell keeps them apart and stays deterministic.
        const ja = GOLDEN * ci;
        o.x = dry.x + (Math.cos(ja) * 0.35) / WATER_W;
        o.y = dry.y + (Math.sin(ja) * 0.35) / WATER_H;
      }
    }
  }
  // THE HARD GUARANTEE: never ON a building, never ON a name. The water escape
  // above runs after the fort pushes, so on a board whose camp overlaps the
  // marsh AND the fort country (the fighting-camp layout) it could re-deposit a
  // figure onto a wall with nothing left to move it. This last sweep settles
  // every constraint together instead of letting the last one written win:
  // eject off walls, off sites, off each other, then sideways out of any sign
  // it is covering, and repeat until a whole round changes nothing. Board
  // bounds only — a camper a step outside the camp ring, or on a reed pixel, is
  // a smaller lie than one standing on a fortress or across a wall's name.
  for (let iter = 0; iter < 8; iter++) {
    let moved = false;
    for (let ci = 0; ci < camp.length; ci++) {
      const o = camp[ci];
      const x0 = o.x;
      const y0 = o.y;
      for (let i = 0; i < targets.length; i++) {
        const p = targetPos(S5_WORLD, i);
        const keep = fortKeep(i);
        const dx = o.x - p.x;
        const dy = (o.y - p.y) / YSQ;
        const d = Math.hypot(dx, dy);
        if (d >= keep) continue;
        const ux = d < 0.0001 ? 1 : dx / d;
        const uy = d < 0.0001 ? 0 : dy / d;
        o.x = p.x + ux * keep;
        o.y = p.y + uy * keep * YSQ;
      }
      for (const site of S5_WORLD.sites) push(o, site.pos.x, site.pos.y, site.size * 0.62 + FIG_W * 0.5);
      for (const q of camp) {
        if (q === o) continue;
        const dx = o.x - q.x;
        const dy = (o.y - q.y) / YSQ;
        const d = Math.hypot(dx, dy);
        if (d < FIG_W * 1.35 && d > 0.0001) {
          const k = ((FIG_W * 1.35 - d) / d) * 0.5;
          o.x += dx * k;
          o.y += dy * k * YSQ;
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const p = targetPos(S5_WORLD, i);
        pushOffArt(o, p.x, p.y, S5_WORLD.targetSize * (S5_TARGET_SCALE[i] ?? 1));
        pushOffLabel(o, p.x, p.y, stripHalfW(S5_WORLD.targetSize * (S5_TARGET_SCALE[i] ?? 1)));
      }
      for (const site of S5_WORLD.sites) {
        pushOffArt(o, site.pos.x, site.pos.y, site.size);
        pushOffLabel(o, site.pos.x, site.pos.y, stripHalfW(site.size));
      }
      o.x = Math.min(0.975, Math.max(0.025, o.x));
      o.y = Math.min(0.955, Math.max(0.03, o.y));
      if (Math.abs(o.x - x0) > 0.0005 || Math.abs(o.y - y0) > 0.0005) moved = true;
    }
    if (!moved) break;
  }

  // LAST RESORT: WALK TO CLEAR GROUND. Sequential single-axis pushes can settle
  // into a squeeze — one sign shoving a figure left, the next shoving it back
  // right, and the equilibrium sitting inside the first building. That is
  // exactly what left one camper buried behind hotcommerce on 2026-08-01, and
  // no amount of extra iterations fixes it, because both pushes are individually
  // correct. So anyone still standing on something searches OUTWARD from where
  // it is and takes the first clear ground it finds: golden-angle spiral,
  // stepping out to a tenth of the board, deterministic per index. If the whole
  // neighbourhood is occupied it stays put, which is no worse than before.
  const strips = labelStrips(targets.length);
  // Two figures whose boxes overlap hide each other exactly as badly as a
  // building does, so this counts as a violation as well. Boxes, not circles:
  // these are wide sprites on a compressed axis.
  const treadsOn = (x: number, y: number, self: number) =>
    out.some((q, j) => j !== self && Math.abs(q.x - x) < FIG_W && Math.abs(q.y - y) < FIG_H);
  // EVERYONE gets this pass, not just the campers. A holder placed early cannot
  // see the camper that arrives later. The two reaches below are kept because
  // the wider one is simply correct for a figure with nowhere it must stay.
  for (let ci = 0; ci < out.length; ci++) {
    const o = out[ci];
    if (spotClear(o.x, o.y, targets.length, strips) && !treadsOn(o.x, o.y, ci)) continue;
    const reach = o.camped ? 0.0022 : 0.0012;
    for (let step = 1; step <= 64; step++) {
      const rad = 0.012 + step * reach;
      const ang = GOLDEN * (step + ci);
      const nx = o.x + Math.cos(ang) * rad;
      const ny = o.y + Math.sin(ang) * rad * YSQ;
      if (!spotClear(nx, ny, targets.length, strips)) continue;
      if (treadsOn(nx, ny, ci)) continue;
      if (nearestDry(nx, ny)) continue; // never into the river to escape a wall
      o.x = nx;
      o.y = ny;
      break;
    }
  }
  return out;
}

/** Which painted fort a stronghold shows.
 *
 * The ARCHETYPE comes from the listing index, so a given wall keeps the same
 * silhouette for the whole season no matter what happens to it. The STATE
 * comes from status first, then progress — a breached wall never renders as
 * intact just because its bar reset. `failed` shows the picture its PEAK
 * earned and is greyed by CSS, never alarm red: ADR-0076 makes a failed wall a
 * partial payout, not a loss. */
function fortArt(t: WorldTarget, i: number): string {
  const a = targetArtFor(S5_WORLD, i);
  if (t.status === "bonded") return a.breached;
  if (t.status === "failed") return t.peakPct >= 50 ? a.breaching : a.sieged;
  if (t.status === "pending") return a.intact;
  return t.progress >= 0.5 ? a.breaching : a.sieged;
}

function statusColor(t: WorldTarget): string {
  if (t.status === "bonded") return GOLD;
  if (t.status === "failed") return GREY;
  if (t.sprint) return ALERT;
  if (t.status === "pending") return GREY;
  return EMBER;
}

function fmtCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "soon";
  const s = Math.floor(ms / 1000);
  const dd = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  if (dd > 0) return `${dd}d ${hh}h`;
  if (hh > 0) return `${hh}h ${mm}m`;
  return `${mm}m`;
}

type Popup =
  | { kind: "target"; t: WorldTarget }
  | { kind: "site"; site: WorldSite }
  | { kind: "newhere" };

/** The player's base, straight from the descriptor — the intro's anchor and
 * the opening camera for a first visit. Deriving it (not a literal) means the
 * plate and layout can move under this file without re-teaching the camera. */
const HOME_POS = S5_WORLD.sites.find((s) => s.kind === "home")?.pos ?? { x: 0.5, y: 0.5 };
const INTRO_CAM_BASE = { x: HOME_POS.x, y: HOME_POS.y, k: 2.4 };

/** The ambient traffic's vehicle pool: TOP-DOWN painted masters, nose up.
 * Path i (map-layout.txt order) always carries pool[i % 3]. */
const S5_VEHICLES = [
  "/s5-art/map/vehicles/tank-a.png",
  "/s5-art/map/vehicles/tank-b.png",
  "/s5-art/map/vehicles/truck-a.png",
];

/** Stashes the viewport's camera handle for siblings OUTSIDE the render prop
 * (the intro overlay flies the camera but renders over the whole screen, not
 * inside the touch-action:none world). An effect, so the write happens after
 * render rather than during it. */
function CamStash({ pz, into }: { pz: PanZoom; into: React.MutableRefObject<PanZoom | null> }) {
  useEffect(() => {
    into.current = pz;
  });
  return null;
}

/** The education popup behind the "New here?" pill. Reuses the ALREADY
 * LOCALIZED landing-band copy (hq.landing) rather than writing a second
 * explanation of the same game: three steps, the money under a disclosure,
 * and the two doors that matter — join, and the funding walkthrough — plus
 * the intro replay. The map's viewport is fixed/overflow-hidden, so a popup
 * body is the sanctioned vehicle for scrolling education here. */
function NewHerePopup({ d, onReplay, onClose }: { d: S5Dict; onReplay: () => void; onClose: () => void }) {
  const L = d.hq.landing;
  return (
    <MapPopup title={d.world.newHereTitle} ariaLabel={d.world.newHereTitle} accent="#f0b340" onClose={onClose}>
      <p className="wm-lead">{L.welcomeBody}</p>
      <div className="wm-nh-steps">
        {[
          [L.s1t, L.s1b],
          [L.s2t, L.s2b],
          [L.s3t, L.s3b],
        ].map(([t, b]) => (
          <div key={t} className="wm-nh-step">
            <h4>{t}</h4>
            <p>{b}</p>
          </div>
        ))}
      </div>
      <details className="wm-more">
        <summary>{L.payTitle}</summary>
        <p className="wm-nh-pay">{L.payBody}</p>
      </details>
      <div className="wm-nh-ctas">
        <Link href="/s5/join" className="wm-nh-cta wm-nh-cta--primary">
          {L.ctaPlay}
        </Link>
        <Link href="/s5/how-to-play" className="wm-nh-cta">
          {L.s3Cta}
        </Link>
        <button type="button" className="wm-nh-cta" onClick={onReplay}>
          {d.world.introReplay}
        </button>
      </div>
    </MapPopup>
  );
}

export function WorldMap({ targets, poolLineText, pool, serverNowMs, theme, empty, phase, standings, gameBoards, totalPlayers, commanders }: WorldMapProps) {
  // English on the server; the cookie locale lands on mount. See the header.
  const [d, setD] = useState<S5Dict>(STRINGS.en);
  useEffect(() => {
    const loc = clientLocale();
    if (loc && loc !== "en" && STRINGS[loc]) setD(STRINGS[loc]);
  }, []);

  // Clock ticks client-side off the SERVER timestamp, never Date.now() at
  // render — the S3 hydration lesson.
  const [nowMs, setNowMs] = useState(serverNowMs);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setNowMs(serverNowMs + (Date.now() - started)), 30000);
    return () => clearInterval(id);
  }, [serverNowMs]);

  const [popup, setPopup] = useState<Popup | null>(null);

  /** FTUE quest 1 ("tour three places") finally has a wire from the map:
   * watching the popup state catches EVERY open path — sprite, marker, dock
   * chip, and any future one — with a single hook. Keys stay under ftue.ts's
   * 24-char guard ("t:applications.com" is 18). */
  useEffect(() => {
    if (!popup) return;
    if (popup.kind === "site") markFtueHotspot(`site:${popup.site.key}`);
    else if (popup.kind === "target") markFtueHotspot(`t:${popup.t.domain}`);
  }, [popup]);

  /**
   * THE FIRST-RUN CAMERA + INTRO WIRING (video-game rule: never open on
   * everything at once).
   *
   * The opening camera is seated through the `initial` prop, never a mount
   * flyTo — flyTo bails before the viewport's first measure. On a first visit
   * (intro pending, motion allowed) the board WAKES UP ZOOMED ON YOUR BASE;
   * every later visit, and every reduced-motion visit, opens on the overview
   * exactly as before. Server render always uses the overview (window is
   * undefined there); the prop only matters in client effects, so SSR output
   * is identical either way.
   *
   * When the intro closes, `initial` swaps back to the overview so reset()
   * and the Home key mean "overview" again (usePanZoom tracks the prop).
   */
  const pzRef = useRef<PanZoom | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [introSignal, setIntroSignal] = useState(0);
  // The opening camera MUST be decided in the initializer, not an effect:
  // usePanZoom's measure() seats `initial` exactly once, at the FIRST VALID
  // MEASUREMENT (a placed-latch, so resizes never yank the camera) — by
  // effect time that latch is already spent, which was proven live. The
  // client-vs-server divergence this creates is confined to the data-zoom
  // presentation attribute, which the engine now marks suppressHydrationWarning
  // for precisely this personalized-opening case. Server renders the overview;
  // a first visit's first painted frame is the base close-up.
  const [camInitial, setCamInitial] = useState(() =>
    introPending() &&
    !(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      ? INTRO_CAM_BASE
      : S5_WORLD.openAt,
  );

  const handleIntroOpenChange = useCallback((o: boolean) => {
    setIntroOpen(o);
    if (!o) {
      // Home/reset mean "overview" again, and the camera actually goes there:
      // an Esc-skip on beat 3 must not strand the player zoomed into a corner
      // they never chose. (Finishing beat 7 already flies here; idempotent.)
      setCamInitial(S5_WORLD.openAt);
      pzRef.current?.flyTo(S5_WORLD.openAt.x, S5_WORLD.openAt.y, S5_WORLD.openAt.k ?? 1);
    }
  }, []);

  /** The camera choreography: one flyTo per beat. Targets are COMPUTED from
   * the live descriptor and roster (today's fort = first live wall, else the
   * first pending one), never hardcoded — the plate and slots are changing
   * under this file. Reduced motion suppresses the tour entirely: seven jump
   * cuts is not a calmer intro. */
  const handleIntroBeat = useCallback(
    (b: number) => {
      const pz = pzRef.current;
      if (!pz) return;
      if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const liveIdx = targets.findIndex((t) => t.status === "live" && t.launched);
      const pendIdx = targets.findIndex((t) => t.status === "pending");
      const todayIdx = liveIdx >= 0 ? liveIdx : pendIdx >= 0 ? pendIdx : 0;
      const today = targetPos(S5_WORLD, todayIdx);
      let fx = 0;
      let fy = 0;
      targets.forEach((_t, ti) => {
        const p = targetPos(S5_WORLD, ti);
        fx += p.x;
        fy += p.y;
      });
      const front = targets.length ? { x: fx / targets.length, y: fy / targets.length } : { x: 0.5, y: 0.3 };
      const games = S5_WORLD.sites.filter((s) => s.opens.kind === "game");
      const arcade = games.length
        ? {
            x: games.reduce((a, s) => a + s.pos.x, 0) / games.length,
            y: games.reduce((a, s) => a + s.pos.y, 0) / games.length,
          }
        : HOME_POS;
      switch (b) {
        case 0:
          pz.flyTo(HOME_POS.x, HOME_POS.y, 2.4);
          break;
        case 1:
          pz.flyTo(today.x, today.y, 2.2);
          break;
        case 2:
          pz.flyTo(today.x, today.y, 2.6);
          break;
        case 3:
          pz.flyTo(front.x, front.y, 1.35);
          break;
        case 4:
          pz.flyTo(arcade.x, arcade.y, 1.9);
          break;
        case 5:
          pz.flyTo(HOME_POS.x, HOME_POS.y, 2.2);
          break;
        default:
          pz.flyTo(S5_WORLD.openAt.x, S5_WORLD.openAt.y, S5_WORLD.openAt.k ?? 1);
          break;
      }
    },
    [targets],
  );

  /** DEV-ONLY sample roster (?preview=1). The pre-season board has no real
   * players, so "the other player tanks" were unreviewable until launch: this
   * fills the board with a dozen sample commanders — seven ringing the walls
   * they "hold", five camped at the muster — using only real tank and cast
   * keys. Compiled out of production; swapped in post-mount so SSR and
   * hydration always agree. */
  const [sampleRoster, setSampleRoster] = useState<MapCommander[] | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    // ?preview=1 for the standard dozen, ?preview=60 to stress the camp: the
    // placement rules have to hold at any crowd size, and the only way to see
    // that before launch is to conjure the crowd.
    const m = /preview=(\d+)/.exec(window.location.search);
    if (!m) return;
    const want = Math.max(1, Math.min(400, Number(m[1]) || 12));
    const base = ["Big Mike", "Sam", "Ihor", "Nikko", "Rook", "Vane", "Halloran", "KaWin", "Piran", "Klaus", "Zaky", "Cris"];
    const names = Array.from({ length: want }, (_, i) => (i < base.length ? base[i] : `${base[i % base.length]} ${Math.floor(i / base.length) + 1}`));
    const tanks = ["panther", "tiger", "sherman", "cromwell", "t34", "stuart", "chaffee", "bt7"];
    const cast = ["wrench", "vega", "havoc", "compass", "diesel", "granite", "jackal", "forge"];
    setSampleRoster(
      names.map((name, i) => ({
        rank: i + 1,
        name,
        handle: name.toLowerCase().replace(/\s+/g, "-"),
        tankKey: tanks[i % tanks.length],
        commanderKey: cast[i % cast.length],
        // Roughly half hold a wall, the rest camp, at any crowd size.
        domain: i % 2 === 0 && targets.length ? targets[i % targets.length].domain : null,
      })),
    );
  }, [targets]);
  const roster = sampleRoster ?? commanders;

  const liveGameKeys = useMemo(() => GAMES.filter((g) => !g.comingSoon).map((g) => g.key), []);
  const home = S5_WORLD.sites.find((s) => s.kind === "home");
  // Sites and strongholds share one pass: a fort's label can just as easily
  // collide with a game's as with another fort's.
  // The people on the board. Recomputed only when the roster or the season
  // moves, never per frame.
  const spots = useMemo(
    () => commanderSpots(roster, targets, S5_WORLD.sites.find((x) => x.kind === "roam")?.pos),
    [roster, targets],
  );

  /** The two front labels ride their own ranks: centroid of slots 0-4 and
   * 5-9, pushed off the nearest fort so a tight cluster cannot swallow the
   * text. Data-driven like the campground — re-dragging the board in
   * map-editor.html moves them without anyone remembering they exist. */
  const frontLabels = useMemo(() => {
    const centroid = (from: number, to: number) => {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let i = from; i < Math.min(to, targets.length); i++) {
        const p = targetPos(S5_WORLD, i);
        sx += p.x;
        sy += p.y;
        n++;
      }
      if (!n) return null;
      const pos = { x: sx / n, y: sy / n };
      for (let pass = 0; pass < 12; pass++) {
        let nx = 0;
        let ny = 0;
        let nd = Infinity;
        for (let i = 0; i < targets.length; i++) {
          const p = targetPos(S5_WORLD, i);
          // y doubled: the label is a wide strip, so vertical clearance is
          // worth twice as much as horizontal.
          const d = Math.hypot(pos.x - p.x, (pos.y - p.y) * 2);
          if (d < nd) {
            nd = d;
            nx = p.x;
            ny = p.y;
          }
        }
        if (nd >= 0.11) break;
        const dx = pos.x - nx;
        const dy = pos.y - ny;
        const len = Math.hypot(dx, dy) || 0.001;
        pos.x += (dx / len) * 0.02;
        pos.y += (dy / len) * 0.02;
      }
      pos.x = Math.min(0.9, Math.max(0.1, pos.x));
      pos.y = Math.min(0.93, Math.max(0.06, pos.y));
      return pos;
    };
    return { wk1: centroid(0, 5), wk2: centroid(5, 10) };
  }, [targets]);

  const lifts = useMemo(() => {
    const sitePts = S5_WORLD.sites.map((s) => s.pos);
    const targetPts = targets.map((_t, i) => targetPos(S5_WORLD, i));
    const all = labelLifts([...sitePts, ...targetPts]);
    return { sites: all.slice(0, sitePts.length), targets: all.slice(sitePts.length) };
  }, [targets]);
  // The player's own state, so upgrades and the garage can open as cards here
  // rather than sending anyone to another page.
  const { me, patchMe, committed, ready: meReady } = useHqMe();

  /**
   * WHAT YOU HOLD ON EACH STRONGHOLD, keyed by lowercase domain.
   *
   * The dossier's first question is "am I in this one?" and nothing on the map
   * could answer it: /api/s5/me returned a season TOTAL only. It now returns a
   * per-domain map, and this reads it.
   *
   * Signed out is the normal case, not an error - no session token means no
   * request and an empty map, and every card renders the same minus one line.
   */
  const [holdings, setHoldings] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    const token = readSessionToken() || null;
    if (!token) return;
    void fetch("/api/s5/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((resp) => {
        if (cancelled || !resp?.ok) return;
        const h = resp?.payout?.holdings;
        if (h && typeof h === "object") setHoldings(h as Record<string, number>);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * A game place's label carries its CURRENT game's name, resolved here rather
   * than written into the descriptor. "The Airfield" tells a new commander
   * nothing; "Mini Game: Warhawks" tells them what it is and what happens when
   * they click. Resolving at render also means a slate change never leaves a
   * retired game's name painted on the board.
   */
  const labelFor = (s: WorldSite): string => {
    if (s.opens.kind !== "game") return s.label;
    const key = S5_WORLD.gameSlots[s.opens.slot];
    const g = key && liveGameKeys.includes(key) ? GAMES.find((x) => x.key === key) : undefined;
    return g ? `${s.label}: ${g.name}` : `${s.label}: ${S5_GAME_FALLBACK.label}`;
  };

  /**
   * THE FRONT, SMOKING. Only walls actually under siege burn: a pending wall
   * has not been touched yet and a breached one is over. Column thickness
   * tracks how close that wall is to breaking, so the busiest part of the map
   * is genuinely where the action is, and a sprint burns red.
   */
  const smokeSources: SmokeSource[] = useMemo(
    () =>
      targets
        .map((t, i) => ({ t, p: targetPos(S5_WORLD, i) }))
        .filter(({ t }) => t.status === "live" && t.launched)
        .map(({ t, p }) => ({
          x: p.x,
          y: p.y,
          intensity: Math.max(0.15, Math.min(1, t.progress)),
          alert: t.sprint,
        })),
    [targets],
  );

  /** Your camp glows from within, and harder after dark. */
  const hearths = useMemo(
    () => S5_WORLD.sites.filter((s) => s.kind === "home").map((s) => ({ x: s.pos.x, y: s.pos.y })),
    [],
  );

  /** Suppress the click that ends a drag, so panning across the board never
   * opens whatever building your finger happened to lift over. */
  const opener = (pz: { draggingRef: React.RefObject<boolean> }, fn: () => void) => () => {
    if (pz.draggingRef.current) return;
    fn();
  };

  /**
   * WHICH WALLS GET AN ARROW.
   *
   * Exactly the ones a player can act on right now: LIVE, already launched,
   * and not yet breached. Anything else and the marker teaches players to
   * ignore markers.
   *
   * Capped at three, nearest-to-breach first, because a board with eleven
   * arrows on it is a board with no arrows on it. Ties break on listing index,
   * so the set is stable frame to frame rather than shuffling as bars move.
   */
  const marked = useMemo(
    () =>
      targets
        .map((t, i) => ({ t, i }))
        .filter(
          ({ t }) => t.status === "live" && t.launched && t.progress < 1,
        )
        .sort((a, b) => b.t.progress - a.t.progress || a.i - b.i)
        .slice(0, 3),
    [targets],
  );

  /**
   * PLAY MARKERS, on the arcade posts. Same grammar as the ATTACK arrows and
   * deliberately a different colour: one board, two kinds of invitation, and
   * a player should never have to read them to tell which is which. All four
   * are marked rather than a top-three, because unlike the front there is no
   * ordering among them -- every game is equally open, every day.
   */
  const playMarks = useMemo(
    () => S5_WORLD.sites.filter((x) => x.opens.kind === "game"),
    [],
  );

  const places: PlaceChip[] = useMemo(() => {
    const chips: PlaceChip[] = S5_WORLD.sites
      .filter((s) => s.kind !== "nav" || s.tier === 1)
      .map((s) => ({
        key: s.key,
        group: "place",
        // The SAME resolved name the board shows. The dock is what a phone
        // taps, and four chips all reading "Mini Game" is a riddle.
        label: labelFor(s),
        pos: s.pos,
        accent: s.accent,
        onOpen: () => setPopup({ kind: "site", site: s }),
      }));
    targets.forEach((t, i) => {
      chips.push({
        key: `t:${t.domain}`,
        group: "target",
        label: t.name,
        pos: targetPos(S5_WORLD, i),
        accent: statusColor(t),
        onOpen: () => setPopup({ kind: "target", t }),
      });
    });
    return chips;
    // labelFor is recomputed every render and closes over liveGameKeys, which
    // is itself memoised on an empty dep list. Listing targets alone is
    // correct and keeps the chips from rebuilding on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, liveGameKeys]);

  return (
    <>
      <WorldViewport
        config={S5_WORLD}
        initial={camInitial}
        places={places}
        ariaLabel={`${theme.seasonName} world map`}
        extraCss={MAP_HINTS_CSS}
        hud={
          // ONE COLUMN, not two absolute boxes. The pool line wraps to three
          // lines on a phone, and a hint pinned at a fixed offset sat on top
          // of it. Stacking them means the card lands under whatever the line
          // actually needs, in any language.
          <>
          {/* The always-there door back into education. A returning visitor
              who dismissed every hint used to get NOTHING; this pill is the
              one guidance surface that never expires. */}
          <button
            type="button"
            className="wm-newhere"
            onClick={() => setPopup({ kind: "newhere" })}
          >
            {d.world.newHere}
          </button>
          <div className="wm-hudcol">
          <div className="wm-topbar">
            <p className="wm-poolline">{poolLineText}</p>
            {pool.paidOutUsd > 0 ? (
              <p className="wm-paid">
                {usd(pool.paidOutUsd)} paid out so far
              </p>
            ) : null}
          </div>
          {introOpen ? null : (
          <MapHints
            labels={{
              dismiss: d.world.hintDismiss,
              reopen: d.world.hintReopen,
              help: d.world.hintKicker,
              more: d.world.hintMore,
            }}
            hints={[
              { id: "what", title: d.world.hint1Title, body: d.world.hint1Body },
              {
                id: "play",
                title: d.world.hint2Title,
                body: fill(d.world.hint2Body, {
                  points: String(POINTS_PER_RUN),
                  cap: String(GAME_DAILY_POINTS_CAP),
                }),
              },
              { id: "forts", title: d.world.hint3Title, body: d.world.hint3Body },
              { id: "camp", title: d.world.hint4Title, body: d.world.hint4Body },
            ]}
          />
          )}
          </div>
          {/* THE SLIM STANDINGS RAIL, desktop only (>=900px via CSS). The
              cross-season lesson: a leaderboard you can SEE on the board beats
              one hidden in a popup. Top five, no fetch (the data already rides
              the props), full list one tap away at the command post. */}
          {standings.length > 0 ? (
            <aside className="wm-rail" aria-label={d.world.railTitle}>
              <h3>{d.world.railTitle}</h3>
              <ol>
                {standings.slice(0, 5).map((r) => (
                  <li key={r.handle || String(r.rank)}>
                    <span className="wm-rail-rank">{r.rank}</span>
                    <span className="wm-rail-name">{r.name}</span>
                    <span className="wm-rail-pts">{r.points.toLocaleString("en-US")}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => {
                  const cp = S5_WORLD.sites.find((s) => s.key === "commandpost");
                  if (cp) setPopup({ kind: "site", site: cp });
                }}
              >
                {d.world.railAll}
              </button>
            </aside>
          ) : null}
          </>
        }
      >
        {(pz) => (
          <>
            <CamStash pz={pz} into={pzRef} />
            {/* THE GROUND NETWORK, drawn from the same polylines the ambient
                traffic patrols. First of all, so everything else sits on it. */}
            <WorldTerrain
              // THE DRAWN NETWORK, and it must stay EMPTY this season: the
              // roads are painted into the plate, so anything drawn here lands
              // a second, disagreeing set on top of them. Feeding the tank
              // routes in here by mistake is exactly what put visible lines
              // across the map. Routes belong to WorldCanvas, which follows
              // them without drawing them.
              roads={S5_WORLD.roads}
              rivers={S5_WORLD.rivers}
              crossings={S5_WORLD.crossings}
              pads={S5_WORLD_PADS}
              tracks={S5_WORLD_TRACKS}
            />

            {/* THE ALIVE LAYER. Under every building and label: atmosphere must
                never compete with the things you click. */}
            <WorldCanvas
              phase={phase}
              smoke={smokeSources}
              hearths={hearths}
              // The TRACED routes, not the drawn network: this season's roads are
              // painted into the plate, so S5_WORLD.roads is empty by design.
              roads={S5_WORLD_PATHS}
              zoomRef={pz.scaleRef}
              // Top-down painted vehicles for the patrols; path i carries
              // pool[i % 3], so every authored road has its own machine.
              vehicles={S5_VEHICLES}
            />

            {/* THE SKY. A dedicated plane-only canvas ABOVE the buildings.
                Lifting the whole alive layer put the flights in front — and
                the smoke with them, which buried the wall it was pouring
                from. Only the aircraft belong on this side. */}
            <SkyLayer className="wm-alive" sprite="/s5-art/map/vehicles/plane.png" />

            {/* THE TWO FRONTS, written on the land itself (drawn text, never
                baked into art - it has to localize). Week 1 names the lush
                river country; week 2 names the scorched west, with its opening
                date while it is still pending. They scale WITH the terrain
                (no counter-scale) and fade out at full zoom, like writing on a
                paper campaign map. DOM-early so every sprite paints over them. */}
            {frontLabels.wk1 ? (
            <div className="wm-front" aria-hidden="true" style={{ "--x": frontLabels.wk1.x, "--y": frontLabels.wk1.y } as React.CSSProperties}>
              <span className="wm-front-name">{d.world.front1Label}</span>
            </div>
            ) : null}
            {frontLabels.wk2 ? (
            <div className="wm-front" aria-hidden="true" style={{ "--x": frontLabels.wk2.x, "--y": frontLabels.wk2.y } as React.CSSProperties}>
              <span className="wm-front-name">{d.world.front2Label}</span>
              {targets[5] && targets[5].status === "pending" && targets[5].launchAt ? (
                <span className="wm-front-sub">
                  {fill(d.world.frontOpens, {
                    date: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(
                      Date.parse(targets[5].launchAt),
                    ),
                  })}
                </span>
              ) : null}
            </div>
            ) : null}

            {/* THE COMMANDERS. Depth is by GROUND CONTACT, not by paint
                order: a figure whose feet are lower than a building's is
                standing in front of it and covers it, and one standing behind
                goes behind, name and all. Document order used to decide this,
                which meant every figure covered every wall and every sign on
                the board no matter where it stood. Each one links to their own
                garage: the map is how you find people, not just territory. */}
            {spots.map(({ c, x, y, camped }) => (
              <Link
                key={`${c.rank}-${c.handle}`}
                href={`/s5/hq/${c.handle}`}
                className="wm-cmdr"
                title={c.name}
                data-camped={camped ? "1" : "0"}
                style={{ "--x": x, "--y": y, "--zi": Math.round(100 + y * 1000) } as React.CSSProperties}
                onClick={(e) => {
                  // Panning must not fire a navigation on release.
                  if (pz.draggingRef.current) e.preventDefault();
                }}
              >
                <img
                  src={`/s5-art/map/tanks/${c.tankKey}${c.camo && c.camo !== "olive" ? `-${c.camo}` : ""}.png`}
                  alt=""
                  draggable={false}
                  onError={(e) => {
                    // A garbled or retired tank key must not leave a broken
                    // image on the board; fall back to the commander portrait.
                    const img = e.currentTarget;
                    if (!img.dataset.fell) {
                      img.dataset.fell = "1";
                      img.src = `/s5-art/commander/${c.commanderKey}.png`;
                    } else {
                      img.style.display = "none";
                    }
                  }}
                />
                <span className="wm-cmdr-name">{c.name}</span>
              </Link>
            ))}

            {/* Authored destinations: your ground, the arcade country, the
                muster field, the sealed Power Station. */}
            {S5_WORLD.sites.map((s, si) => (
              <WorldSprite
                key={s.key}
                labelLift={lifts.sites[si]}
                pos={s.pos}
                size={s.size}
                art={siteArtUrl(S5_WORLD, s)}
                glyph={s.glyph}
                accent={s.accent}
                label={labelFor(s)}
                tier={s.tier}
                glow={s.life?.glow}
                // Visual weight: your camp shouts, the games and the front
                // speak up, the facilities stay quiet but findable.
                emph={s.kind === "home" ? 3 : s.kind === "game" ? 2 : 1}
                // A locked site greys out UNLESS it is glowing. "Sealed for
                // now" should recede; a teaser we want found should not.
                dimmed={s.kind === "locked" && !s.life?.glow}
                badge={s.kind === "locked" ? "COMING SOON" : undefined}
                badgeColor={s.kind === "locked" ? s.accent : undefined}
                // The RESOLVED name, same as the visible label: a screen reader
                // hearing "Mini Game" four times learns nothing the sighted
                // board does not already say.
                ariaLabel={`${labelFor(s)}. ${s.blurb ?? ""}`}
                onFocus={() => pz.flyTo(s.pos.x, s.pos.y)}
                onOpen={opener(pz, () => setPopup({ kind: "site", site: s }))}
              />
            ))}

            {/* QUEST MARKERS. A bouncing arrow over the walls that are open
                to you this minute, so a new commander is never looking at a
                beautiful board wondering which thing to touch. */}
            {marked.map(({ t, i }) => {
              const p = targetPos(S5_WORLD, i);
              return (
                <button
                  key={`mk:${t.domain}`}
                  type="button"
                  className="wm-marker"
                  style={{ "--x": p.x, "--y": p.y } as React.CSSProperties}
                  onClick={opener(pz, () => setPopup({ kind: "target", t }))}
                  aria-label={`${d.world.markerAttack}: ${t.name}`}
                >
                  {/* Always the ACTION word. The fort's own badge already
                      carries its status (SCOUTED, UNDER SIEGE), so a marker
                      that also reported status would be saying the same thing
                      twice and telling you to do nothing. */}
                  <span className="wm-marker-tag">{d.world.markerAttack}</span>
                  <span className="wm-marker-arrow" aria-hidden="true" />
                </button>
              );
            })}

            {/* PLAY markers over the arcade posts: the free thing, marked as
                loudly as the paid one. */}
            {playMarks.map((site) => (
              <button
                key={`pm:${site.key}`}
                type="button"
                className="wm-marker wm-marker--play"
                style={{ "--x": site.pos.x, "--y": site.pos.y } as React.CSSProperties}
                onClick={opener(pz, () => setPopup({ kind: "site", site }))}
                aria-label={`${d.world.markerPlay}: ${labelFor(site)}`}
              >
                <span className="wm-marker-tag">{d.world.markerPlay}</span>
                <span className="wm-marker-arrow" aria-hidden="true" />
              </button>
            ))}

            {/* The front. Position is bound to LISTING INDEX and never to
                status, so a wall that falls stays exactly where it stood. */}
            {targets.map((t, i) => {
              const p = targetPos(S5_WORLD, i);
              const label = statusLabel(theme, t.status);
              return (
                <WorldSprite
                  key={t.domain}
                  labelLift={lifts.targets[i]}
                  pos={p}
                  // Raise-driven mass, bound to the index like the position:
                  // the $25k citadel visibly dwarfs a $500 wall.
                  size={S5_WORLD.targetSize * (S5_TARGET_SCALE[i] ?? 1)}
                  art={`${S5_WORLD.artRoot}/${fortArt(t, i)}.webp`}
                  glyph="keep"
                  accent={statusColor(t)}
                  label={t.name}
                  tier={1}
                  emph={2}
                  dimmed={t.status === "failed"}
                  badge={t.sprint ? "SPRINT" : label}
                  badgeColor={statusColor(t)}
                  ariaLabel={`${t.name}, ${label}. Opens stronghold details.`}
                  onFocus={() => pz.flyTo(p.x, p.y)}
                  onOpen={opener(pz, () => setPopup({ kind: "target", t }))}
                />
              );
            })}
          </>
        )}
      </WorldViewport>

      {popup?.kind === "target" ? (
        <StrongholdPopup
          t={popup.t}
          d={d}
          theme={theme}
          nowMs={nowMs}
          heldUsd={holdings[popup.t.domain.toLowerCase()] ?? 0}
          wallsHeld={Object.keys(holdings).length}
          onClose={() => setPopup(null)}
        />
      ) : null}
      {popup?.kind === "site" ? (
        <SitePopup
          site={popup.site}
          d={d}
          liveGameKeys={liveGameKeys}
          me={me}
          patchMe={patchMe}
          standings={standings}
          gameBoards={gameBoards}
          totalPlayers={totalPlayers}
          targets={targets}
          onClose={() => setPopup(null)}
          ready={meReady}
        />
      ) : null}
      {popup?.kind === "newhere" ? (
        <NewHerePopup
          d={d}
          onReplay={() => {
            setPopup(null);
            setIntroSignal((n) => n + 1);
          }}
          onClose={() => setPopup(null)}
        />
      ) : null}

      {/* The first-run overlay. Sibling of the popups, outside the viewport:
          it flies the camera through onBeat but never lives inside the
          touch-action:none world. */}
      <MapIntro d={d} openSignal={introSignal} onOpenChange={handleIntroOpenChange} onBeat={handleIntroBeat} />

      <style dangerouslySetInnerHTML={{ __html: HUD_CSS }} />
      {empty ? null : null}
    </>
  );
}

// ── Stronghold dossier ───────────────────────────────────────────────────────

function StrongholdPopup({
  t,
  d,
  theme,
  nowMs,
  heldUsd,
  wallsHeld,
  onClose,
}: {
  t: WorldTarget;
  d: S5Dict;
  theme: Theme;
  nowMs: number;
  /** How many DISTINCT walls this wallet holds. Feeds holdPreview, whose
   * parameter is a wall COUNT and was being handed dollars. */
  wallsHeld: number;
  /** What THIS wallet holds on THIS stronghold, in USD. 0 when signed out or
   * not in it - the dossier's first question is "am I in this one?". */
  heldUsd: number;
  onClose: () => void;
}) {
  const launchMs = t.launchAt ? Date.parse(t.launchAt) : NaN;
  // Time left until this wall's bounty basis is read (breach + the hold check).
  // null when the wall has not bonded or carries no bond time.
  const bondedMs = t.bondedAt ? Date.parse(t.bondedAt) : NaN;
  const holdCheckLeftMs = Number.isFinite(bondedMs)
    ? bondedMs + BOUNTY_HOLD_CHECK_H * 3600000 - nowMs
    : null;
  const raise =
    t.bondingFdv && t.initialFdv && t.initialFdv < t.bondingFdv
      ? t.bondingFdv - t.initialFdv
      : t.bondingFdv;
  // THE BUG: holdPreview's parameter is domainsEntered (how many walls you
  // hold), not dollars. Passing heldUsd meant a $250 holder was treated as
  // holding 250 walls, which inflates the ceiling and made the "What holding
  // pays" table promise Medals nobody would get. Signed out it was right by
  // accident, because 0 dollars is also 0 walls.
  const rows = holdPreview(wallsHeld);
  const money = (n: number | null) => (n && n > 0 ? usd(n) : "TBA");

  return (
    <MapPopup
      title={t.name}
      ariaLabel="stronghold details"
      accent={statusColor(t)}
      onClose={onClose}
      headerRight={
        <span className="wm-chip" style={{ color: statusColor(t), borderColor: statusColor(t) }}>
          {statusLabel(theme, t.status)}
        </span>
      }
    >
      {/* AM I IN THIS ONE? First line of the dossier, above everything,
          because the answer changes how everything below it reads. Silent when
          you hold nothing here - an empty state on every wall you have not
          bought would be noise on most of the board. */}
      {heldUsd > 0 ? (
        <p className="wm-held">
          You hold <strong>{usd(heldUsd)}</strong> here.
        </p>
      ) : null}

      {/* WHAT IS THIS? One plain sentence before any number. The demo test
          this failed: a smart visitor tapped a fort and had no idea what they
          were looking at. Everything below assumes this sentence was read. */}
      {(t.status === "pending" || t.status === "live") && raise ? (
        <p className="wm-whatis">
          {fill(d.world.fortWhatIs, { name: t.name, raise: usd(raise) })}
        </p>
      ) : null}

      {/* WHAT THIS WALL PAYS YOU. Two lines, above the fold, status-aware.
          These facts used to live as prose inside "All the numbers", which is
          where nobody read them.

          Placed AFTER the what-is sentence and BEFORE the progress and the buy
          button: "what do I get" only parses once you know what you are looking
          at, and it has to be read before the button, not after it. Drawn as a
          callout rather than more prose, because a third paragraph in a stack
          of paragraphs is a paragraph.

          On a breached wall the hold rule becomes a COUNTDOWN, because a
          deadline you can watch is worth more than a rule you are told. */}
      {/* A BREACHED WALL GETS ITS OWN CARD. Three rows, one icon each, plain
          words. This is the moment a player's domain graduates and the only
          three questions they have are what happened, what do I get, and what
          now. The old card answered none of them above the fold: it showed the
          same prose paragraph every other wall shows.

          The ICON carries the theme so the words do not have to. No garrison,
          no founder window, no peak percent on this card - all of that still
          lives one disclosure down in "All the numbers" for anyone who wants
          it. Written to be understood without deciding to read, and to survive
          translation into ko/zh with almost no jargon. */}
      {t.status === "bonded" && t.bountyUsd ? (
        <div className="wm-br">
          <div className="wm-br-row">
            <span className="wm-br-ico" aria-hidden>&#127881;</span>
            <div>
              <p className="wm-br-h">{d.world.brWhatTitle}</p>
              <p className="wm-br-p">{d.world.brWhatBody}</p>
            </div>
          </div>

          <div className="wm-br-row">
            <span className="wm-br-ico" aria-hidden>&#128176;</span>
            <div>
              <p className="wm-br-h">{d.world.brGetTitle}</p>
              <p className="wm-br-p">{fill(d.world.brGetBody, { bounty: usd(t.bountyUsd) })}</p>
              {holdCheckLeftMs !== null && holdCheckLeftMs > 0 ? (
                <p className="wm-br-clock">
                  {fill(d.world.brGetHold, { left: fmtCountdown(holdCheckLeftMs) })}
                </p>
              ) : (
                <p className="wm-br-done">{d.world.brGetDone}</p>
              )}
            </div>
          </div>

          <div className="wm-br-row">
            <span className="wm-br-ico" aria-hidden>&#128073;</span>
            <div>
              <p className="wm-br-h">{d.world.brNextTitle}</p>
              <p className="wm-br-p">{d.world.brNextHold}</p>
              <p className="wm-br-p">{d.world.brNextMore}</p>
              <p className="wm-br-p wm-br-quiet">{d.world.brNextSell}</p>
            </div>
          </div>
        </div>
      ) : t.status !== "failed" && t.bountyUsd ? (
        <div className="wm-payout" style={{ borderLeftColor: statusColor(t) }}>
          <p className="wm-payout-line">
            {fill(d.world.fortIfItBreaks, { bounty: usd(t.bountyUsd) })}
          </p>
          <p className="wm-payout-line wm-payout-quiet">{d.world.fortKeepEarning}</p>
        </div>
      ) : null}

      {t.status === "pending" ? (
        <>
          <p className="wm-lead">
            {Number.isFinite(launchMs)
              ? fill(d.world.fortPendingLead, {
                  when: new Intl.DateTimeFormat(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                    timeZoneName: "short",
                  }).format(launchMs),
                })
              : "Listing date to be announced."}
          </p>
          {Number.isFinite(launchMs) && launchMs > nowMs ? (
            <p className="wm-note">Opens in {fmtCountdown(launchMs - nowMs)}.</p>
          ) : null}
          <Link className="wm-cta" href="/s5/how-to-play">
            {d.world.fortPendingCta}
          </Link>
        </>
      ) : (
        <>
          <div className="wm-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(Math.min(1, t.progress) * 100)}%`, background: statusColor(t) }} />
          </div>
          {/* THE SINGLE NUMBER. For a live wall that is raise progress in
              dollars (what breaks the wall), not the pool maths - the pool
              basis lives in the fold below. Bonded and failed keep their
              settled stories. */}
          <p className="wm-lead">
            {t.status === "bonded"
              ? ""
              : t.status === "failed"
                ? `Window closed at ${t.peakPct}%. Still pays ${t.peakPct}%.`
                : raise
                  ? fill(d.world.fortToGo, {
                      secured: usd(Math.min(raise, Math.round(t.progress * raise))),
                      togo: usd(Math.max(0, raise - Math.round(t.progress * raise))),
                    })
                  : `Best ${t.peakPct}% so far`}
          </p>
        </>
      )}

      {/* ONE PRIMARY CTA, directly under the number it answers. */}
      {t.status === "live" && t.launched ? (
        <BuyPanel domain={t.domain} name={t.name} strings={d.map.buy} />
      ) : t.status !== "pending" ? (
        <a className="wm-cta" href={buyLink(t.domain)} target="_blank" rel="noreferrer">
          View on Doma
        </a>
      ) : null}

      {/* The freshness hook stays VISIBLE - it is the reason to act today. */}
      {t.status === "live" && t.fresh ? (
        <p className="wm-note wm-note--good">
          Newly listed, so it pays up to double Medals per dollar right now, easing back over the first days.
        </p>
      ) : null}

      {/* EVERYTHING ELSE, folded. Nothing deleted: the facts, the pool basis,
          the earning table and its caveats all survive one disclosure down,
          where a returning commander finds them and a first-timer is not hit
          with them. */}
      <details className="wm-more">
        <summary>{d.world.fortDetails}</summary>

        {t.status === "live" ? (
          <p className="wm-note">
            Best {t.peakPct}% so far · {usd(t.securedUsd)} secured for the season pool.
          </p>
        ) : null}

        {/* "War chest share" used to sit here, which read as "this wall's
            money belongs to this wall's holders". It does not: the share goes
            INTO the season pool, and the pool splits by Medals across every
            qualified holder. The two things that really are tied to this wall
            are the founder window and the garrison, so they print right under
            it (ADR-0098). */}
        <dl className="wm-facts">
          <div><dt>Domain</dt><dd>{t.domain}</dd></div>
          <div><dt>Raise to breach</dt><dd>{money(raise)}</dd></div>
          <div><dt>{d.world.fortPoolShare}</dt><dd>{money(t.poolShare)}</dd></div>
          {t.bountyUsd ? <div><dt>{d.map.bountyLabel}</dt><dd>{money(t.bountyUsd)}</dd></div> : null}
        </dl>

        <p className="wm-note">{d.world.fortFounder}</p>
        <p className="wm-note">{d.world.fortGarrison}</p>

        {/* WHAT YOU EARN PER DAY PER DOLLAR. Medals, never dollars: your cash
            share depends on every other commander's Medals too, so no
            per-player dollar figure is knowable in advance. */}
        <section className="wm-earn">
          <h3>What holding pays</h3>
          <table>
            <thead>
              <tr><th>You hold</th><th>Medals / day</th><th>Per $1</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.usd}>
                  <td>${r.usd}</td>
                  <td>{Math.round(r.medalsPerDay).toLocaleString("en-US")}</td>
                  <td>{r.perDollar.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="wm-note">{curveNote()}</p>
          <p className="wm-note wm-note--faint">
            Holding a second stronghold adds {breadthPct(2)}% and lifts your ceiling to ${ceilingUsd(2)}.
            Medals are points, not dollars, and nothing here is guaranteed money.
          </p>
        </section>
      </details>
    </MapPopup>
  );
}

// ── Site popups: games, the radio, the sealed station ────────────────────────

function SitePopup({
  site,
  d,
  liveGameKeys,
  me,
  patchMe,
  standings,
  gameBoards,
  totalPlayers,
  targets,
  onClose,
  ready,
}: {
  site: WorldSite;
  d: S5Dict;
  liveGameKeys: string[];
  me: HqMe | null;
  patchMe: (p: Partial<HqMe>) => void;
  standings: StandingRow[];
  gameBoards: GameBoardLite[];
  totalPlayers: number;
  /** Passed straight through to the garage's decal collection, which lists a
   *  breach slot per standing wall. */
  targets: WorldTarget[];
  onClose: () => void;
  /** Threaded to the garage so it does not flash the guest CTA. */
  ready: boolean;
}) {
  if (site.opens.kind === "game") {
    const key = S5_WORLD.gameSlots[site.opens.slot];
    const game = key && liveGameKeys.includes(key) ? GAMES.find((g) => g.key === key) : undefined;
    return (
      <MapPopup title={site.label} ariaLabel="field exercise" accent={site.accent} onClose={onClose}>
        {game ? (
          <>
            <p className="wm-lead">{game.name}</p>
            <p className="wm-note">
{fill(d.world.boardGamesNote, { points: String(POINTS_PER_RUN), cap: String(GAME_DAILY_POINTS_CAP) })}
            </p>
            <Link className="wm-cta" href={`/s5/games/${game.key}`}>
              {d.world.gameJumpIn}
            </Link>
          </>
        ) : (
          // The slot is unmapped or points at a retired key. Never a dead end.
          <>
            <p className="wm-lead">{S5_GAME_FALLBACK.label}</p>
            <p className="wm-note">{S5_GAME_FALLBACK.blurb}</p>
            <Link className="wm-cta" href={S5_GAME_FALLBACK.href}>
              See the arcade
            </Link>
          </>
        )}
      </MapPopup>
    );
  }

  if (site.opens.kind === "locked") {
    // A GLOWING locked site is a TEASER, not a sealed door, so it gets the
    // hero treatment: the building itself, then the three things it does, as
    // icon rows. Three paragraphs of prose was the right weight for "sealed
    // for now" and much too thin for the first time anyone meets this.
    const teaser = !!site.life?.glow;
    return (
      <MapPopup title={site.label} ariaLabel="sealed" accent={site.accent} onClose={onClose}>
        {teaser ? (
          <>
            <div className="wm-teaser-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/s5-art/world/${site.art}.webp`} alt="" />
              <span className="wm-teaser-badge" style={{ color: site.accent, borderColor: site.accent }}>
                {d.world.dkSoon}
              </span>
            </div>
            <p className="wm-teaser-lead">{site.blurb}</p>
            <div className="wm-teaser-rows">
              <div className="wm-teaser-row">
                <span className="wm-teaser-ico" aria-hidden>&#127869;</span>
                <div>
                  <p className="wm-teaser-h">{d.world.dkTablesH}</p>
                  <p className="wm-teaser-p">{d.world.dkTablesP}</p>
                </div>
              </div>
              <div className="wm-teaser-row">
                <span className="wm-teaser-ico" aria-hidden>&#128293;</span>
                <div>
                  <p className="wm-teaser-h">{d.world.dkHeatH}</p>
                  <p className="wm-teaser-p">{d.world.dkHeatP}</p>
                </div>
              </div>
              <div className="wm-teaser-row">
                <span className="wm-teaser-ico" aria-hidden>&#11088;</span>
                <div>
                  <p className="wm-teaser-h">{d.world.dkServiceH}</p>
                  <p className="wm-teaser-p">{d.world.dkServiceP}</p>
                </div>
              </div>
            </div>
            <p className="wm-note wm-note--faint">{d.world.dkFoot}</p>
          </>
        ) : (
          <>
            <p className="wm-lead">{site.blurb}</p>
            <p className="wm-note">{site.opens.note}</p>
            <p className="wm-note wm-note--faint">{d.world.lockedNote}</p>
          </>
        )}
      </MapPopup>
    );
  }

  if (site.opens.kind === "route") {
    return (
      <MapPopup title={site.label} ariaLabel="destination" accent={site.accent} onClose={onClose}>
        {site.blurb ? <p className="wm-lead">{site.blurb}</p> : null}
        <Link className="wm-cta" href={site.opens.href}>
          {d.world.goThere}
        </Link>
      </MapPopup>
    );
  }

  // ── POPUP BODIES. Everything that used to be its own page or its own hut on
  //    the map opens here instead, as a card over the world. The map stopped
  //    being able to carry a building per link once the plate was measured
  //    (about 19 well-spaced sites against a roster that wanted 24), and
  //    popups were the direction anyway: you never leave the board.
  if (site.opens.kind === "popup") {
    const body = site.opens.body;

    if (body === "garage") {
      return (
        <GaragePopup site={site} d={d} me={me} patchMe={patchMe} targets={targets} onClose={onClose} ready={ready} />
      );
    }

    if (body === "challenges") {
      return (
        <MapPopup title={site.label} ariaLabel="challenges" accent={site.accent} onClose={onClose}>
          <p className="wm-lead">{d.world.challengeLead}</p>
          {gameBoards.length === 0 ? (
            <p className="wm-note">{d.world.boardGamesEmpty}</p>
          ) : (
            <div className="wm-chal">
              {gameBoards.map((g) => {
                const top = g.rows[0];
                return (
                  <div className="wm-chal-row" key={g.key}>
                    <div className="wm-chal-name">{g.name}</div>
                    <div className="wm-chal-score">
                      {top ? (
                        <>
                          <span className="wm-chal-num">{top.score.toLocaleString("en-US")}</span>
                          <span className="wm-chal-who">{top.name}</span>
                        </>
                      ) : (
                        <span className="wm-chal-who">{d.world.challengeOpen}</span>
                      )}
                    </div>
                    <Link className="wm-chal-go" href={`/s5/games/${g.key}`}>
                      {top ? d.world.challengeBeat : d.world.challengeClaim}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
          <p className="wm-note wm-note--faint">{d.world.challengeNote}</p>
        </MapPopup>
      );
    }

    if (body === "board") {
      return (
        <BoardPopup
          site={site}
          d={d}
          standings={standings}
          gameBoards={gameBoards}
          totalPlayers={totalPlayers}
          onClose={onClose}
        />
      );
    }

    // A body name that nothing implements must still open something useful
    // rather than an empty card - the same never-a-dead-end rule the game
    // slots follow.
    return (
      <MapPopup title={site.label} ariaLabel="dispatches" accent={site.accent} onClose={onClose}>
        {site.blurb ? <p className="wm-lead">{site.blurb}</p> : null}
        <p className="wm-note">
          {d.common?.medalsPlain ??
            "Medals are points. More points, bigger share of the pool at season end."}
        </p>
      </MapPopup>
    );
  }

  return null;
}

/**
 * YOUR BASE, as a card. Tank, commander, workbench and footlocker were four
 * separate buildings until the plate was measured; they are four tabs now.
 *
 * The panels are imported from the HQ page unchanged - they already take
 * exactly { me, patchMe, dict }, so this is reuse, not a second garage. Any
 * fix to the real garage lands here for free, which is the only reason
 * duplicating the surface is acceptable at all.
 */
function GaragePopup({
  site,
  d,
  me,
  patchMe,
  targets,
  onClose,
  ready,
}: {
  site: WorldSite;
  d: S5Dict;
  me: HqMe | null;
  patchMe: (p: Partial<HqMe>) => void;
  /** False while the session lookup is in flight, so the garage does not
   *  tell a signed-in commander to enlist. */
  ready: boolean;
  /** The season's walls. The decal collection needs them to list each standing
   *  wall's breach slot; without them this panel reported a different total
   *  here than it did in the HQ. */
  targets: WorldTarget[];
  onClose: () => void;
}) {
  const TABS = [
    { key: "tank", label: d.world.tabTank },
    { key: "commander", label: d.world.tabCommander },
    { key: "workbench", label: d.world.tabUpgrades },
    { key: "kit", label: d.world.tabKit },
  ] as const;
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tank");

  // The funding wizard is a full flow that carries real money, and it is not
  // something to reimplement inside a card. Both panels that can trigger it
  // hand off to the HQ page where it already lives and is already tested.
  const openWizard = () => {
    window.location.href = "/s5/hq#funding";
  };

  return (
    <MapPopup title={site.label} ariaLabel="your base" accent={site.accent} onClose={onClose}>
      <div className="wm-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`wm-tab${tab === t.key ? " is-on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* `me` arrives after a fetch. Saying so beats an empty card that looks
          broken on a slow connection. */}
      {!me ? (
        <p className="wm-note">{d.world.baseLoading}</p>
      ) : (
        <div className="wm-tabbody">
          {tab === "tank" ? (
            <TankPanel me={me} patchMe={patchMe} dict={d} onOpenWizard={openWizard} ready={ready} />
          ) : null}
          {tab === "commander" ? <CommanderPanel me={me} patchMe={patchMe} dict={d} /> : null}
          {tab === "workbench" ? <WorkbenchPanel me={me} patchMe={patchMe} dict={d} /> : null}
          {tab === "kit" ? (
            // `targets` is what the decal collection needs to list each
            // standing wall's breach slot. Without it (as here) the same panel
            // showed a different "N of M" on the map than in the HQ, and every
            // breach decal silently vanished on this surface.
            <FootlockerPanel
              me={me}
              patchMe={patchMe}
              dict={d}
              onOpenWizard={openWizard}
              targets={targets.map((t) => ({
                domain: t.domain,
                name: t.name,
                status: t.status,
                progress: t.progress,
              }))}
            />
          ) : null}
        </div>
      )}
    </MapPopup>
  );
}

/**
 * THE WAR BOARD. Two tabs, because there are two different competitions and
 * conflating them was the old board's problem: season standings are about
 * money committed, mini-game scores are about skill, and a player cares about
 * exactly one of them at a time.
 *
 * The standings themselves live on /s5/board, which already renders them
 * server-side against the snapshot. This card is the doorway plus the part
 * worth seeing without leaving the map.
 */
function BoardPopup({
  site,
  d,
  standings,
  gameBoards,
  totalPlayers,
  onClose,
}: {
  site: WorldSite;
  d: S5Dict;
  standings: StandingRow[];
  gameBoards: GameBoardLite[];
  totalPlayers: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"season" | "games">("season");
  return (
    <MapPopup title={site.label} ariaLabel="leaderboards" accent={site.accent} onClose={onClose}>
      <div className="wm-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "season"}
          className={`wm-tab${tab === "season" ? " is-on" : ""}`}
          onClick={() => setTab("season")}
        >
          {d.world.boardSeason}
        </button>
        <button
          role="tab"
          aria-selected={tab === "games"}
          className={`wm-tab${tab === "games" ? " is-on" : ""}`}
          onClick={() => setTab("games")}
        >
          {d.world.boardGames}
        </button>
      </div>

      {tab === "season" ? (
        <>
          <p className="wm-note">
{d.world.boardSeasonNote}
          </p>
          {standings.length === 0 ? (
            <p className="wm-note">{d.world.boardSeasonEmpty}</p>
          ) : (
            <ol className="wm-rank">
              {standings.map((c) => (
                <li key={`${c.rank}-${c.handle}`}>
                  <span className="wm-rank-n">{c.rank}</span>
                  {/* Their garage, not a profile page: the brief was to be able
                      to go and look at everyone else's rig. */}
                  <Link className="wm-rank-name" href={`/s5/hq/${c.handle}`}>
                    {c.name}
                  </Link>
                  <span className="wm-rank-v">{c.points.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="wm-note wm-note--faint">
{fill(d.world.boardPlayers, { n: totalPlayers.toLocaleString("en-US") })}
          </p>
          <Link className="wm-cta" href="/s5/board">
            {d.world.boardEveryone}
          </Link>
        </>
      ) : (
        <>
          <p className="wm-note">
{fill(d.world.boardGamesNote, { points: String(POINTS_PER_RUN), cap: String(GAME_DAILY_POINTS_CAP) })}
          </p>
          {gameBoards.length === 0 ? (
            <p className="wm-note">{d.world.boardGamesEmpty}</p>
          ) : (
            gameBoards.map((gb) => (
              <section key={gb.key} className="wm-gb">
                <Link className="wm-gb-title" href={`/s5/games/${gb.key}`}>
                  {gb.name}
                </Link>
                {gb.rows.length === 0 ? (
                  <p className="wm-note wm-note--faint">{d.world.boardGameEmpty}</p>
                ) : (
                  <ol className="wm-rank">
                    {gb.rows.map((r) => (
                      <li key={`${gb.key}-${r.rank}`}>
                        <span className="wm-rank-n">{r.rank}</span>
                        <span className="wm-rank-name">{r.name}</span>
                        <span className="wm-rank-v">{r.score.toLocaleString("en-US")}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))
          )}
        </>
      )}
    </MapPopup>
  );
}

const HUD_CSS = `
/* ── THE LAYER BAND, and why these numbers are what they are ──────────────
   GROUND OBJECTS (sites, forts, commanders) are depth-sorted by their feet:
   z-index = 100 + y * 1000, so the band they occupy is 100..1100. Anything
   that must ride ABOVE the world has to clear 1100, and anything written
   below that number disappears under a building the moment the camera moves
   over one. That is exactly what happened on 2026-08-02: markers sat at 26
   from before the band existed, so every PLAY pill went behind its own
   building and every ATTACK arrow vanished under a fort.
     1500  the alive layer (planes, drifting smoke)
     2000  markers: the calls to action, above everything in the world
   Screen furniture (the HUD, the rail, the hint cards, the New here? pill)
   lives OUTSIDE .wm-world, which has a transform and therefore its own
   stacking context, so it never competes with these at all. */

/* The alive layer sits ABOVE the buildings. Planes flew behind the forts
   without this, because the canvas precedes the sprites in the DOM. Smoke
   drifting over a wall rather than behind it is the same fix. */
.wm-alive{z-index:1500;}
.wm-tabs{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap;}
.wm-tab{
  appearance:none;border:1px solid rgba(255,255,255,0.18);
  background:rgba(255,255,255,0.05);color:#c9d2da;
  font-family:'Space Mono',ui-monospace,monospace;font-size:11.5px;font-weight:700;
  letter-spacing:0.03em;text-transform:uppercase;
  padding:7px 11px;border-radius:7px;cursor:pointer;
}
.wm-tab:hover{background:rgba(255,255,255,0.10);color:#eef2f6;}
.wm-tab.is-on{background:#e0662e;border-color:#e0662e;color:#fff;}
.wm-tabbody{max-height:min(62vh,560px);overflow-y:auto;overscroll-behavior:contain;}
.wm-list{margin:10px 0 14px;padding-left:18px;}
.wm-list li{margin:0 0 6px;}
.wm-list a{color:#f0b340;text-decoration:none;}
.wm-list a:hover{text-decoration:underline;}
.wm-rank{list-style:none;margin:8px 0 12px;padding:0;display:flex;flex-direction:column;gap:5px;
  max-height:min(46vh,380px);overflow-y:auto;overscroll-behavior:contain;}
.wm-rank li{display:grid;grid-template-columns:22px 1fr auto;gap:9px;align-items:baseline;}
.wm-rank-n{font-family:'Space Mono',ui-monospace,monospace;font-size:11px;color:#8b959f;
  font-variant-numeric:tabular-nums;text-align:right;}
.wm-rank-name{font-size:13px;color:#e7edf3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  text-decoration:none;}
a.wm-rank-name:hover{color:#f0b340;text-decoration:underline;}
.wm-rank-v{font-family:'Space Mono',ui-monospace,monospace;font-size:12.5px;font-weight:800;
  color:#f0b340;font-variant-numeric:tabular-nums;}
.wm-gb{margin:0 0 14px;}
.wm-gb-title{display:block;font-family:'Space Mono',ui-monospace,monospace;font-size:11.5px;
  font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#9fb0c0;
  text-decoration:none;margin:0 0 4px;}
.wm-gb-title:hover{color:#f0b340;}
.wm-held{
  margin:0 0 10px;padding:7px 10px;border-radius:8px;
  background:rgba(224,102,46,0.13);
  border:1px solid rgba(224,102,46,0.38);
  font-size:13px;color:#f4d9c8;
}
/* The payout callout. A left rule in the wall's own status colour plus a faint
   wash, so the one block that answers "what do I get" is not read as the third
   paragraph in a stack of paragraphs. */
.wm-teaser-art{position:relative;margin:-4px -2px 12px;border-radius:10px;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 20%,rgba(224,102,46,0.22),rgba(11,13,16,0.9));
  border:1px solid rgba(224,102,46,0.28);}
.wm-teaser-art img{display:block;width:100%;height:auto;}
.wm-teaser-badge{position:absolute;top:9px;right:9px;padding:3px 9px;border-radius:999px;
  border:1px solid currentColor;background:rgba(11,13,16,0.72);
  font-family:'Space Mono',ui-monospace,monospace;font-size:9.5px;font-weight:700;letter-spacing:0.16em;}
.wm-teaser-lead{margin:0 0 11px;font-size:14px;font-weight:700;color:#fff;line-height:1.4;}
.wm-teaser-rows{display:grid;gap:10px;margin-bottom:11px;}
.wm-teaser-row{display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:start;}
.wm-teaser-ico{font-size:19px;line-height:1.15;}
.wm-teaser-h{margin:0 0 2px;font-size:13px;font-weight:800;color:#fff;}
.wm-teaser-p{margin:0;font-size:12.5px;line-height:1.5;color:#d5dde4;}
.wm-br{margin:12px 0 14px;display:grid;gap:13px;padding:13px 14px;
  border:1px solid #f0b34033;border-radius:10px;
  background:linear-gradient(180deg,rgba(240,179,64,0.09),rgba(240,179,64,0.02));}
.wm-br-row{display:grid;grid-template-columns:30px 1fr;gap:11px;align-items:start;}
.wm-br-ico{font-size:22px;line-height:1.15;}
.wm-br-h{margin:0 0 3px;font-size:14px;font-weight:800;color:#fff;letter-spacing:-0.01em;}
.wm-br-p{margin:0 0 3px;font-size:12.5px;line-height:1.5;color:#d5dde4;}
.wm-br-quiet{color:#94a0ab;}
.wm-br-clock{margin:5px 0 0;font-size:13px;font-weight:800;color:#f0b340;}
.wm-br-done{margin:5px 0 0;font-size:13px;font-weight:800;color:#34d399;}
.wm-payout{margin:11px 0 12px;display:grid;gap:5px;padding:9px 11px;
  border-left:2px solid #8b96a1;border-radius:0 7px 7px 0;
  background:linear-gradient(90deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015));}
.wm-payout-line{margin:0;font-size:12.5px;line-height:1.5;color:#dbe2e8;}
.wm-payout-live{color:#f0b340;font-weight:700;}
.wm-payout-quiet{color:#94a0ab;}
.wm-held strong{color:#ffd9a8;font-family:'Space Mono',ui-monospace,monospace;}

/* A commander standing on the board. Anchored BOTTOM-CENTRE like every other
   sprite, counter-scaled so the name stays readable at any zoom, and small
   enough that a crowd around one wall still reads as a crowd. */
/* THE QUEST MARKER. Anchored to the fort's own board coordinate and lifted
   clear of the sprite, so it points at the building rather than floating near
   it. The bounce is the whole affordance: a still arrow reads as a label, a
   moving one reads as an instruction. */
.wm-marker{
  position:absolute;left:calc(var(--x) * 100%);top:calc(var(--y) * 100%);
  transform:translate(-50%,-100%) translateY(calc(-46px * var(--wm-inv,1))) scale(var(--wm-inv,1));
  transform-origin:50% 100%;
  display:flex;flex-direction:column;align-items:center;gap:1px;
  background:none;border:0;padding:0;cursor:pointer;
  /* Above the whole ground band (see THE LAYER BAND above): a marker is the
     one thing on this board that is telling you what to do next, and it is
     useless the instant a roof can cover it. */
  z-index:2000;
  animation:wm-marker-bob 1.15s ease-in-out infinite;
}
.wm-marker-tag{
  font:800 10px/1 ui-monospace,Menlo,monospace;letter-spacing:0.12em;
  color:#1a1205;background:#f0b340;
  border:2px solid rgba(24,18,8,0.55);border-radius:6px;
  padding:4px 7px;
  box-shadow:0 3px 10px rgba(0,0,0,0.45);
  white-space:nowrap;
}
.wm-marker-arrow{
  width:0;height:0;
  border-left:7px solid transparent;border-right:7px solid transparent;
  border-top:9px solid #f0b340;
  filter:drop-shadow(0 2px 2px rgba(0,0,0,0.5));
}
.wm-marker:focus-visible{outline:2px solid #f0b340;outline-offset:3px;border-radius:8px;}
/* PLAY is green, ATTACK is amber. Two invitations on one board have to be
   told apart without reading, and the words are the backup, not the signal. */
.wm-marker--play .wm-marker-tag{background:#34d399;}
.wm-marker--play .wm-marker-arrow{border-top-color:#34d399;}
.wm-marker--play:focus-visible{outline-color:#34d399;}
@keyframes wm-marker-bob{
  0%,100%{transform:translate(-50%,-100%) translateY(calc(-46px * var(--wm-inv,1))) scale(var(--wm-inv,1));}
  50%{transform:translate(-50%,-100%) translateY(calc(-56px * var(--wm-inv,1))) scale(var(--wm-inv,1));}
}
@media (prefers-reduced-motion: reduce){
  /* Still points at the right building, just stops moving. */
  .wm-marker{animation:none;}
}
.wm-cmdr{
  position:absolute;left:calc(var(--x) * 100%);top:calc(var(--y) * 100%);
  width:calc(var(--w, 0.030) * 100%);
  transform:translate(-50%,-100%);
  /* Same ground-contact depth the sprites use (see WorldSprite --zi), so
     figures and buildings occlude each other the way a hillside would. */
  display:block;text-decoration:none;z-index:var(--zi, 100);
}
.wm-cmdr img{display:block;width:100%;height:auto;
  filter:drop-shadow(2px 3px 3px rgba(24,18,8,0.45));}
.wm-cmdr-name{
  position:absolute;left:50%;top:100%;
  transform:translate(-50%,2px) scale(var(--wm-inv,1));
  transform-origin:50% 0;
  font-family:'Space Mono',ui-monospace,monospace;
  font-size:9.5px;font-weight:700;letter-spacing:0.02em;white-space:nowrap;
  color:#e9eef3;background:rgba(10,12,15,0.72);
  padding:1px 5px;border-radius:5px;
  opacity:0;transition:opacity 120ms ease-out;pointer-events:none;
}
/* Names appear on hover and at high zoom: forty of them at once would bury the
   board, but an anonymous crowd defeats the point. */
.wm-cmdr:hover .wm-cmdr-name,
.wm-cmdr:focus-visible .wm-cmdr-name{opacity:1;}
.wm-world[data-zoom="far"] .wm-cmdr-name{opacity:0;}
.wm-world[data-zoom="near"] .wm-cmdr-name{opacity:0.92;}
.wm-cmdr:hover img{filter:drop-shadow(0 0 6px rgba(240,179,64,0.85));}
.wm-topbar{
  position:absolute;left:0;right:0;top:0;
  display:flex;align-items:baseline;justify-content:center;gap:14px;flex-wrap:wrap;
  padding:10px 16px 14px;
  /* Heavy enough to actually hide the board. The pool line is the one number
     on this screen that must never be hard to read, and a marker pill or a
     bright stretch of river drifting under it was showing THROUGH the old
     gradient, which faded out well before the text ended. */
  background:linear-gradient(180deg, rgba(8,10,13,0.94) 0%, rgba(8,10,13,0.86) 55%, rgba(8,10,13,0) 100%);
  padding-bottom:22px;
  text-align:center;
}
.wm-poolline{
  margin:0;
  font-family:'Space Mono',ui-monospace,monospace;
  font-size:12.5px;font-weight:700;letter-spacing:0.02em;
  color:#eef2f6;text-shadow:0 1px 4px rgba(0,0,0,0.9);
}
.wm-paid{margin:0;font-family:'Space Mono',ui-monospace,monospace;font-size:11.5px;color:#f0b340;}

/* The two campaign fronts, written on the land. Scale with the terrain and
   fade at full zoom - close up you are IN a front, not reading its name. */
.wm-front{
  position:absolute;left:calc(var(--x)*100%);top:calc(var(--y)*100%);
  transform:translate(-50%,-50%);
  display:flex;flex-direction:column;align-items:center;gap:3px;
  pointer-events:none;opacity:0.8;transition:opacity 320ms ease;
  /* ABOVE THE GROUND BAND (see THE LAYER BAND). This is tracked type spanning
     a third of the board, so it will always have a fort standing somewhere
     along it: at ground-band depth "WEEK 1 FRONT" rendered as "WEEK  O T"
     with the middle letters behind a wall. It is a map annotation, not an
     object in the world, so it belongs on top of the world -- at 0.8 opacity
     with a soft shadow it reads as a legend, never as something in the way. */
  z-index:1400;
}
.wm-front-name{
  font:800 21px/1 'Space Mono',ui-monospace,monospace;letter-spacing:0.36em;
  text-transform:uppercase;color:rgba(255,246,225,0.8);
  text-shadow:0 1px 2px rgba(20,18,8,0.85), 0 2px 10px rgba(0,0,0,0.5);
  padding-left:0.36em; /* recenters tracked type */
}
.wm-front-sub{
  font:700 12px/1 'Space Mono',ui-monospace,monospace;letter-spacing:0.2em;
  color:rgba(255,246,225,0.62);text-shadow:0 1px 4px rgba(0,0,0,0.7);
  padding-left:0.2em;
}
.wm-world[data-zoom="2"] .wm-front{opacity:0;}
@media (prefers-reduced-motion: reduce){.wm-front{transition:none;}}

/* The always-there education door, top-left (hints own the top-right). */
.wm-newhere{
  position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 50px);z-index:26;
  min-height:36px;padding:7px 14px;border-radius:999px;cursor:pointer;
  border:1px solid rgba(240,179,64,0.5);background:rgba(13,15,10,0.78);color:#f0b340;
  font-size:12px;font-weight:700;letter-spacing:.06em;
}
.wm-newhere:hover{background:rgba(240,179,64,0.16);}

/* The slim standings rail: desktop only, left edge under the pill. Quiet on
   purpose - it reports, the command post explains. */
.wm-rail{display:none;}
@media (min-width:900px){
  .wm-rail{
    display:block;position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 96px);z-index:24;
    width:198px;padding:10px 12px;border-radius:12px;
    border:1px solid rgba(240,179,64,0.22);background:rgba(13,15,10,0.72);backdrop-filter:blur(2px);
  }
  .wm-rail h3{margin:0 0 6px;font-size:10.5px;font-weight:800;letter-spacing:.14em;color:#a9b3a0;}
  .wm-rail ol{list-style:none;margin:0;padding:0;display:grid;gap:4px;}
  .wm-rail li{display:flex;align-items:baseline;gap:7px;font-size:12px;}
  .wm-rail-rank{color:#f0b340;font-weight:800;min-width:12px;}
  .wm-rail-name{color:#e6ebe0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
  .wm-rail-pts{color:#a9b3a0;font-family:'Space Mono',ui-monospace,monospace;font-size:11px;}
  .wm-rail button{
    margin-top:8px;width:100%;padding:6px 0;border-radius:8px;cursor:pointer;
    border:1px solid rgba(240,179,64,0.35);background:transparent;color:#f0b340;
    font-size:11.5px;font-weight:700;
  }
  .wm-rail button:hover{background:rgba(240,179,64,0.14);}
}
.wm-nh-steps{display:grid;gap:10px;margin:0 0 12px;}
.wm-nh-step h4{margin:0 0 3px;font-size:13.5px;color:#f0b340;}
.wm-nh-step p{margin:0;font-size:13.5px;line-height:1.5;color:#cfd6c9;}
.wm-nh-pay{margin:8px 0 0;font-size:13.5px;line-height:1.55;color:#cfd6c9;}
.wm-nh-ctas{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.wm-nh-cta{
  display:inline-block;padding:9px 14px;border-radius:9px;cursor:pointer;
  border:1px solid rgba(240,179,64,0.4);background:transparent;color:#f0b340;
  font-size:13px;font-weight:700;text-decoration:none;
}
.wm-nh-cta--primary{background:#f0b340;color:#141508;border-color:#f0b340;}
.wm-nh-cta:hover{background:rgba(240,179,64,0.16);}
.wm-nh-cta--primary:hover{background:#ffc95e;}
/* Shared disclosure fold (New here + the stronghold card's "All the numbers"). */
.wm-more{margin:6px 0 0;}
.wm-more summary{
  cursor:pointer;font-size:12.5px;font-weight:700;letter-spacing:.05em;color:#a9b3a0;
  padding:6px 0;
}
.wm-more summary:hover{color:#f0b340;}
.wm-more[open] summary{color:#f0b340;}

.wm-chip{
  font-family:'Space Mono',ui-monospace,monospace;
  font-size:10px;font-weight:700;letter-spacing:0.08em;
  border:1px solid currentColor;border-radius:5px;padding:3px 7px;
}
.wm-lead{margin:0 0 12px;font-size:14.5px;line-height:1.5;color:#e9edf1;}
/* The what-is sentence: quiet, above every number, read once. */
.wm-whatis{margin:0 0 10px;font-size:13.5px;line-height:1.55;color:#cfd6c9;}
/* THE CHALLENGE BOARD. One row per game: the score to beat, who holds it, and
   a way straight into that game. Grid rather than flex so the numbers line up
   in a column and can be scanned, which is the entire point of the card. */
.wm-chal{display:flex;flex-direction:column;gap:8px;margin-top:12px;}
.wm-chal-row{
  display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;
  background:rgba(255,255,255,0.04);border:1px solid #2b333c;border-radius:10px;
  padding:9px 10px;
}
.wm-chal-name{font-size:13px;font-weight:800;color:#e9edf1;}
.wm-chal-score{display:flex;flex-direction:column;align-items:flex-end;line-height:1.2;}
.wm-chal-num{font:800 14px ui-monospace,Menlo,monospace;color:#f0b340;}
.wm-chal-who{font-size:10.5px;color:#87919b;}
.wm-chal-go{
  font-size:11.5px;font-weight:800;letter-spacing:0.04em;
  color:#1a1205;background:#e0662e;text-decoration:none;
  border-radius:8px;padding:7px 11px;white-space:nowrap;
}
.wm-chal-go:hover{filter:brightness(1.08);}
.wm-note{margin:10px 0 0;font-size:12.5px;line-height:1.55;color:#aab4bd;}
.wm-note--good{color:#8fd6a8;}
.wm-note--faint{color:#87919b;font-size:11.5px;}
.wm-bar{height:8px;border-radius:5px;background:#20262d;overflow:hidden;margin:0 0 10px;}
.wm-bar > span{display:block;height:100%;border-radius:5px;}
.wm-facts{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin:14px 0 0;}
.wm-facts > div{min-width:0;}
.wm-facts dt{font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;color:#87919b;margin:0 0 2px;}
.wm-facts dd{margin:0;font-family:'Space Mono',ui-monospace,monospace;font-size:13.5px;color:#e9edf1;word-break:break-word;}
.wm-earn{margin:18px 0 0;padding:12px;border:1px solid #232a32;border-radius:9px;background:rgba(11,13,16,0.5);}
.wm-earn h3{margin:0 0 8px;font-family:'Bungee',system-ui,sans-serif;font-size:12.5px;letter-spacing:0.04em;color:#e9edf1;}
.wm-earn table{width:100%;border-collapse:collapse;font-family:'Space Mono',ui-monospace,monospace;font-size:12.5px;}
.wm-earn th{text-align:left;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#87919b;padding:0 0 6px;font-weight:400;}
.wm-earn td{padding:3px 0;color:#e9edf1;}
.wm-earn td:not(:first-child),.wm-earn th:not(:first-child){text-align:right;}
.wm-cta{
  display:block;margin:16px 0 0;padding:12px 16px;
  background:#e0662e;color:#0b0d10;
  border-radius:9px;text-align:center;text-decoration:none;
  font-family:'Bungee',system-ui,sans-serif;font-size:14px;letter-spacing:0.03em;
}
.wm-cta:hover{background:#f0763e;}
`;
