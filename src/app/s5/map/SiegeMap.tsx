"use client";
/**
 * Season 5 SIEGE MAP — the painted "state of the front" surface (/s5/map).
 *
 * A full-bleed dark battlefield drawn ENTIRELY in code (CSS grid washes + one
 * terrain SVG: contour blobs, a hatched no-man's-land band, edge survey ticks)
 * in the house gunmetal/steel/ember palette. No art plates, no image requests.
 * Keeps the S3/S4 map READABILITY grammar (fixed zones, one-second parse,
 * decoration never competes with state) translated to the siege:
 *
 *   STAGE    the 11 STRONGHOLD nodes as walled-fort chips along a serpentine
 *            FRONT LINE in LISTING ORDER (launch_at order = the campaign's
 *            advance): bottom rank first, doubling back across the middle,
 *            crossing the hatched no-man's-land into the top rank. A dashed
 *            ember advance route with direction chevrons ties them together.
 *   NODE     ring = the state. PENDING dim ring + a live "Lists in 2d 4h"
 *            clock (ticked client-side off the SERVER timestamp, the S3
 *            nowMs lesson). LIVE ember ring with the % progress arc, plus
 *            "Best {peak}% so far · {usd} secured" (peak is the PAID basis:
 *            the whole-% floor from lib/s5/data paidPeakPct, so no node can
 *            ever show a percent settlement would not pay). BREACHED gold
 *            full ring + rotated gold stamp + "{usd} paid in full". FAILED
 *            grey ring stopped at the peak + "Window closed at {peak}%.
 *            Still pays {peak}%." (ADR-0076: a failed wall is a partial
 *            payout, so it renders quiet grey, never alarm red).
 *   SPRINT   the FRONT REACTS: a wall inside its 48h siege sprint gets a red
 *            alert ring + tag, and a red banner sits above the map naming it.
 *            Pulse animation is reduced-motion gated (static ring instead).
 *   CARD     tap a node for the dossier: FDVs, the raise, war-chest share,
 *            secured-so-far, breach bounty, the freshness note for new
 *            listings, the buy link to app.doma.xyz, and the existing WAR
 *            EFFORT declare control (the same component the scaffold page
 *            carried, so nothing regresses).
 *   CHEST    above the map: war chest $ · secured-so-far (a count-up counter,
 *            reduced-motion gated) · paid-out ticker, with the ONE shared
 *            pool line under it. The ADR-0076 tagline sits under the title.
 *   MOBILE   under 760px the stage swaps (CSS only, hydration-safe) for a
 *            vertical front-line column in the same listing order.
 *
 * Copy: every word through the s5 dict (en/ko/zh, passed from the server
 * page); status words keep the S4-proven seam (en = THEME words so operator
 * overrides work, ko/zh = dict). No em-dashes, never "win $X". Dollar math
 * NEVER happens here: every number arrives computed by lib/s5/data.
 * ISR discipline: no data fetching in this component beyond the existing
 * WarEffortControl pattern; only the clock ticks client-side.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Theme, TargetStatus } from "@/lib/s5/theme";
import { statusLabel } from "@/lib/s5/theme";
import { fill, type S5Dict } from "@/lib/s5/strings";
import { buyLink } from "@/lib/s5/funding";
import { BuyPanel } from "@/app/s5/_components/BuyPanel";
import { FRESH_WINDOW_DAYS } from "@/lib/s5/games";
import { track } from "@/lib/s5/track";
import { Eyebrow, Panel, ProgressBar, StatusChip, UI } from "../_components/ui";
import type { TopCommander } from "@/lib/s5/data";
import { WarEffortControl } from "./WarEffort";
import { MapTerrain } from "./MapTerrain";

const GOLD = "#f0b340";
const GREY = "#87919b";
const ALERT = "#f87171";

/** One stronghold node, fully computed server-side (lib/s5/data + warEffort):
 * plain JSON across the server/client seam, nothing recomputed here. */
export type SiegeNode = {
  domain: string;
  name: string;
  status: TargetStatus;
  /** Spot bond progress 0..1 (the arc + card bar). */
  progress: number;
  /** PAID-basis peak percent (whole-% floor; bonded = 100). */
  peakPct: number;
  securedUsd: number;
  poolShare: number;
  bondingFdv: number | null;
  initialFdv: number | null;
  bountyUsd: number | null;
  launchAt: string | null;
  launched: boolean;
  /** Inside the bot's freshness window (extra Medals per $ for new listings). */
  fresh: boolean;
  /** Inside its 48h siege sprint (red alert). */
  sprint: boolean;
  /** War Effort window open (server-computed; the button grey only). */
  weOpen: boolean;
  weCommitted: number;
  weCommanders: number;
};

export type SiegeMapProps = {
  nodes: SiegeNode[];
  empty: boolean;
  pool: { full: number; secured: number; unlocked: number; paidOutUsd: number };
  poolLineText: string;
  sprint: { active: boolean; domains: string[] };
  serverNowMs: number;
  theme: Theme;
  d: S5Dict;
  localized: boolean;
  /** Dev-only sample data (?preview=1); renders the TEST PREVIEW badge. */
  preview?: boolean;
  weMin: number;
  weMax: number;
  weMult: number;
  /** Top commanders, drawn ON the front and listed in the standings rail. */
  commanders: TopCommander[];
};

// ── Fixed stage geometry ────────────────────────────────────────────────────
// Fractions of the 1200x760 stage. The serpentine advance: rank 1 (bottom,
// first listings) marches left to right, rank 2 doubles back right to left,
// rank 3 crosses no-man's-land into the top. Positions are FIXED by listing
// index; nothing ever reshuffles with status (the S3/ADR-0008 rule).
const NODE_POS: Array<{ x: number; y: number }> = [
  { x: 0.115, y: 0.8 },
  { x: 0.345, y: 0.865 },
  { x: 0.575, y: 0.8 },
  { x: 0.8, y: 0.865 },
  { x: 0.885, y: 0.56 },
  { x: 0.66, y: 0.495 },
  { x: 0.435, y: 0.56 },
  { x: 0.21, y: 0.495 },
  { x: 0.135, y: 0.205 },
  { x: 0.405, y: 0.15 },
  { x: 0.675, y: 0.205 },
];
const VBW = 1200;
const VBH = 760;

/** Position for node index i; a 12th+ target (never expected this season)
 * wraps with a small offset instead of stacking exactly. */
function nodePos(i: number): { x: number; y: number } {
  const base = NODE_POS[i % NODE_POS.length];
  const wrap = Math.floor(i / NODE_POS.length);
  return { x: Math.min(0.94, base.x + wrap * 0.03), y: Math.min(0.92, base.y + wrap * 0.04) };
}

/** THE COMMANDERS ON THE FRONT.
 *
 * Both prior seasons put every player on the map and Mike locked it twice in
 * S4 ("the standings don't show the individuals like S3, people love this").
 * S5 shipped without it: the map showed the war and not the people fighting
 * it. This puts them back.
 *
 * Each commander stands at the stronghold they hold the MOST of. Two people on
 * the same wall are spread on a golden-angle ring, which is the same trick S3
 * used to fix S2's buried, un-clickable pile of ships: successive figures can
 * never land on each other and the ring grows as the crowd does. Anyone
 * holding nothing musters at the staging area rather than vanishing.
 */
/** PROGRESS AS ART, not just an arc.
 *
 * S3's map looked better than S4's largely because a domain's progress was a
 * PICTURE that changed (a fogged planet terraforming into a lit one), not a
 * bar. This is the siege equivalent: the same fort, painted at four states of
 * damage, so a wall at 15% and a wall at 80% do not look alike.
 *
 * The state is picked off the PAID basis (the same whole-percent floor the
 * node text uses), so the picture can never claim more progress than
 * settlement would actually pay. A failed wall keeps the picture its peak
 * earned and is greyed by CSS rather than shown burning, because ADR-0076
 * made a failed wall a PARTIAL PAYOUT and it must never read as alarm.
 */
function fortPlate(status: string, pct: number): string {
  if (status === "bonded") return "breached";
  if (status === "pending") return "intact";
  if (pct >= 0.7) return "breaching";
  if (pct >= 0.35) return "sieged";
  return "intact";
}

const MUSTER = { x: 0.045, y: 0.655 }; // open ground: no NODE_POS entry is within 0.1 of this

function commanderSpots(
  commanders: TopCommander[],
  order: string[],
): Array<{ c: TopCommander; x: number; y: number }> {
  const idx = new Map(order.map((dm, i) => [dm, i]));
  const seen = new Map<string, number>();
  const placed = commanders.map((c) => {
    const key = c.domain && idx.has(c.domain) ? c.domain : "__muster";
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const base = key === "__muster" ? MUSTER : nodePos(idx.get(key) as number);
    if (key === "__muster") {
      // A staging block: 3 across, stepping down. No node-avoidance needed
      // because MUSTER is sited on empty ground by construction.
      const col = n % 3;
      const row = Math.floor(n / 3);
      return {
        c,
        // 0.075 not 0.055: a tank cutout measures ~0.05 of stage width, so the
        // tighter step left a 5px gap that the widest sprites closed.
        x: Math.min(0.97, Math.max(0.03, base.x + col * 0.075)),
        y: Math.min(0.96, Math.max(0.08, base.y + row * 0.05)),
      };
    }
    // MEASURED, not eyeballed (2026-07-28, live DOM at 1440x900). The node
    // block -- fort plate + ring + name + percent line -- occupies 0.148 x
    // 0.185 of the stage centred on its point, and a commander figure is
    // 0.05 x 0.04 anchored BOTTOM-centre. So clearing it horizontally needs
    // |dx| > 0.148/2 + 0.05/2 = 0.099. The old ring used 0.105 at an angle
    // whose cosine gave only 0.090 of real clearance, which is why a tank
    // parked on the bunker.
    //
    // A ring cannot solve this on the bottom rank either: those nodes sit at
    // y 0.80-0.87, so "below the label" falls off the stage. Commanders
    // therefore fall in beside the wall, alternating left and right and
    // stepping down in tiers. Deterministic, no overlap by construction, and
    // it reads like troops formed up either side of the position.
    // Near an edge only ONE side has room, so the left/right alternation has
    // to collapse -- and when it does, every commander must still get its own
    // row or they land on the exact same pixel (measured: Rook and Vane both
    // at 0.166/0.322, stacked, 43% over hypnotise.ai). So: when a side is
    // forced, tier steps once per commander instead of once per pair.
    const probe = 0.108 + Math.floor(n / 2) * 0.013;
    const forced = base.x - probe < 0.05 ? 1 : base.x + probe > 0.95 ? -1 : 0;
    const side = forced !== 0 ? forced : n % 2 === 0 ? -1 : 1;
    const tier = forced !== 0 ? n : Math.floor(n / 2);
    const dx = 0.108 + tier * 0.013;
    return {
      c,
      x: Math.min(0.97, Math.max(0.03, base.x + side * dx)),
      y: Math.min(0.96, Math.max(0.08, base.y + 0.022 + tier * 0.052)),
    };
  });

  // SEPARATION PASS. Each wall only knows how to avoid ITS OWN node block, so
  // two commanders flanking ADJACENT walls can still land on each other (
  // measured: Big Mike on braking.io and a commander on supplemintz, 53px of
  // overlap). One deterministic relaxation over the finished list catches every
  // such case regardless of which nodes are neighbours. Fixed iteration count
  // and no randomness, so the board is identical for every player.
  const MINX = 0.058; // a tank cutout is ~0.05 wide
  const MINY = 0.045; // and ~0.04 tall
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        if (Math.abs(ddx) >= MINX || Math.abs(ddy) >= MINY) continue;
        // Push apart along the axis that needs the LEAST movement.
        const needX = MINX - Math.abs(ddx);
        const needY = MINY - Math.abs(ddy);
        if (needX <= needY) {
          const dir = ddx >= 0 ? 1 : -1;
          a.x = Math.max(0.03, a.x - dir * needX * 0.5);
          b.x = Math.min(0.97, b.x + dir * needX * 0.5);
        } else {
          const dir = ddy >= 0 ? 1 : -1;
          a.y = Math.max(0.08, a.y - dir * needY * 0.5);
          b.y = Math.min(0.96, b.y + dir * needY * 0.5);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return placed;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The map sprite for a commander's tank AND camo. Camo is EARNED in the
 * arcade (ADR-0099), so it has to be visible to everyone else on the board:
 * a Parade Gold winner rendering identically to every other tank defeats the
 * point of the prize. Olive is the untouched base file. */
function mapTankSrc(tankKey: string, camo?: string): string {
  const suffix = camo && camo !== "olive" ? `-${camo}` : "";
  return `/s5-art/map/tanks/${tankKey}${suffix}.png`;
}

/** "2d 4h" / "4h 12m" / "3m 09s" (the chip clock; uppercased by CSS). */
function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

/** Locale-neutral listing moment: "7/28 10:00" (digits only, UTC). */
function fmtDateUtc(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()} ${hh}:${mm}`;
}

/** Server-anchored clock (the S4 SeasonCountdown pattern): first render uses
 * the server timestamp so hydration matches; after mount it ticks on the
 * client clock corrected by the initial offset. */
function useNowMs(serverNowMs: number): number {
  const [nowMs, setNowMs] = useState(serverNowMs);
  useEffect(() => {
    const offset = serverNowMs - Date.now();
    const id = setInterval(() => setNowMs(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [serverNowMs]);
  return nowMs;
}

/** Defaults to REDUCED (true) so the pre-hydration render and any failed read
 * never animate; flips to the real preference on mount. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    try {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      setReduced(false);
    }
  }, []);
  return reduced;
}

/** Ring + % colors per status: the siege-map's own visual language (task-fixed:
 * live = ember siege ring, breached = gold, failed = quiet grey since a failed
 * wall still pays its peak). The StatusChip in the card keeps the house
 * data-viz colors; the two never conflict on one element. */
const RING_COLOR: Record<TargetStatus, string> = {
  pending: "rgba(154,167,180,0.4)",
  live: UI.ember,
  bonded: GOLD,
  failed: GREY,
};

// ── Code-drawn fort glyph (no art plate) ────────────────────────────────────
function FortGlyph({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 20" className={className} aria-hidden="true">
      <path
        d="M2 19 L2 9 L5 9 L5 6 L8 6 L8 9 L11 9 L11 6 L13 6 L13 9 L16 9 L16 6 L19 6 L19 9 L22 9 L22 19 Z"
        fill="rgba(11,13,16,0.55)"
        stroke={tone}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M10 19 L10 15.4 A2 2 0 0 1 14 15.4 L14 19" fill="none" stroke={tone} strokeWidth="1.2" />
      <line x1="12" y1="6" x2="12" y2="2.2" stroke={tone} strokeWidth="1.1" />
      <path d="M12 2.2 L16 2.2 L14.6 3.6 L16 5 L12 5 Z" fill={tone} opacity="0.9" />
    </svg>
  );
}

// ── The status ring around the fort ─────────────────────────────────────────
function FortRing({ node, reduced }: { node: SiegeNode; reduced: boolean }) {
  const R = 24;
  const C = 2 * Math.PI * R;
  const color = RING_COLOR[node.status];
  // The arc: live fills to the SPOT progress; failed freezes at the paid peak;
  // bonded is the full gold circle; pending draws no arc at all.
  const arcPct =
    node.status === "live"
      ? Math.max(0, Math.min(1, node.progress))
      : node.status === "bonded"
        ? 1
        : node.status === "failed"
          ? Math.max(0, Math.min(1, node.peakPct / 100))
          : 0;
  return (
    <span className="sg-ringwrap">
      {node.sprint ? <span className={"sg-alertring" + (reduced ? "" : " sg-alertring--pulse")} aria-hidden /> : null}
      <svg viewBox="0 0 58 58" className="sg-ringsvg" aria-hidden="true">
        <circle cx="29" cy="29" r={R} fill="rgba(11,13,16,0.5)" stroke="rgba(255,255,255,0.09)" strokeWidth="3" />
        {arcPct > 0 ? (
          <circle
            cx="29"
            cy="29"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${C * arcPct} ${C}`}
            transform="rotate(-90 29 29)"
          />
        ) : null}
      </svg>
      <FortGlyph tone={node.status === "pending" ? "rgba(154,167,180,0.55)" : color} className="sg-fort" />
      {node.status === "live" ? (
        <span className="sg-pct" style={{ color: UI.ember, borderColor: `${UI.ember}66` }}>
          {Math.round(Math.max(0, Math.min(1, node.progress)) * 100)}%
        </span>
      ) : node.status === "failed" ? (
        <span className="sg-pct" style={{ color: GREY, borderColor: `${GREY}55` }}>
          {node.peakPct}%
        </span>
      ) : null}
    </span>
  );
}

/** The one-line state under a node's name (per-status dict template). */
function nodeSub(node: SiegeNode, d: S5Dict, nowMs: number): string {
  if (node.status === "bonded") return fill(d.map.subBonded, { usd: usd(node.poolShare) });
  if (node.status === "failed") return fill(d.map.subFailed, { peak: node.peakPct });
  if (node.status === "live") {
    if (node.peakPct <= 0 && node.securedUsd <= 0) return d.map.subJustListed;
    return fill(d.map.subLive, { peak: node.peakPct, usd: usd(node.securedUsd) });
  }
  const launchMs = node.launchAt ? new Date(node.launchAt).getTime() : NaN;
  if (!Number.isFinite(launchMs)) return d.map.tba;
  return fill(d.map.subPending, { t: fmtCountdown(launchMs - nowMs) });
}

function statusWord(node: SiegeNode, d: S5Dict, theme: Theme, localized: boolean): string {
  return localized ? d.status[node.status] : statusLabel(theme, node.status);
}

// ── The secured-so-far counter (the "live counter" on the chest strip) ──────
// Server markup carries the FINAL value (hydration-safe); after mount, motion
// permitting, it runs one 700ms count-up. Reduced motion = static, no pulse,
// no count (the task's reduced-motion rule).
function SecuredCounter({ value, reduced }: { value: number; reduced: boolean }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduced || value <= 0) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 700;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <>{usd(shown)}</>;
}

// ── Terrain (all code: contours, hatch band, survey ticks, advance route) ───
function Terrain({ nodeCount, advanceTitle }: { nodeCount: number; advanceTitle: string }) {
  const pts = useMemo(
    () => Array.from({ length: nodeCount }, (_, i) => ({ x: nodePos(i).x * VBW, y: nodePos(i).y * VBH })),
    [nodeCount],
  );
  const steel = UI.steel;
  return (
    <svg className="sg-terrain" viewBox={`0 0 ${VBW} ${VBH}`} aria-hidden="true">
      <defs>
        <pattern id="sgHatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="8" stroke={UI.ember} strokeWidth="1" />
        </pattern>
      </defs>

      {/* Contour clusters: nested closed blobs, pure decoration under state. */}
      <g fill="none" stroke={steel} strokeWidth="1">
        <path
          opacity="0.1"
          d="M70,170 C95,95 225,70 305,112 C385,152 375,240 285,268 C195,296 100,255 78,205 C70,188 66,180 70,170 Z"
        />
        <path
          opacity="0.07"
          d="M110,172 C132,120 226,100 288,132 C348,162 338,222 272,242 C206,262 128,232 112,198 C106,186 106,180 110,172 Z"
        />
        <path opacity="0.05" d="M150,175 C165,145 225,132 265,152 C305,170 298,205 255,218 C212,231 162,212 152,192 Z" />
        <path
          opacity="0.1"
          d="M1000,250 C1065,215 1150,240 1168,300 C1185,358 1120,405 1048,392 C976,378 950,320 968,285 C978,265 985,258 1000,250 Z"
        />
        <path
          opacity="0.07"
          d="M1020,275 C1065,252 1122,270 1135,310 C1147,348 1102,378 1052,368 C1002,358 985,318 998,295 Z"
        />
        <path
          opacity="0.1"
          d="M240,600 C290,560 390,565 425,610 C458,652 420,700 340,702 C260,704 205,665 215,632 C220,615 226,610 240,600 Z"
        />
        <path opacity="0.06" d="M275,615 C310,590 375,595 398,625 C420,653 395,682 340,683 C285,684 250,656 258,635 Z" />
        {/* Ridge hatching: two short clusters of parallel strokes. */}
        <g opacity="0.09">
          <path d="M545,262 l26,-12 M560,274 l26,-12 M575,286 l26,-12 M590,298 l26,-12" />
          <path d="M905,640 l24,-11 M918,651 l24,-11 M931,662 l24,-11" />
        </g>
      </g>

      {/* No-man's-land: the hatched band the advance crosses into the top rank. */}
      <rect x="0" y="270" width={VBW} height="52" fill="url(#sgHatch)" opacity="0.055" />
      <line x1="0" y1="270" x2={VBW} y2="270" stroke={UI.ember} strokeOpacity="0.16" strokeDasharray="12 9" />
      <line x1="0" y1="322" x2={VBW} y2="322" stroke={UI.ember} strokeOpacity="0.16" strokeDasharray="12 9" />

      {/* Survey ticks along the top and bottom edges: digits only (locale-neutral). */}
      <g stroke={steel} strokeOpacity="0.22">
        {Array.from({ length: 11 }, (_, i) => (i + 1) * 100).map((x) => (
          <g key={x}>
            <line x1={x} y1="0" x2={x} y2={x % 200 === 0 ? 10 : 6} />
            <line x1={x} y1={VBH} x2={x} y2={VBH - (x % 200 === 0 ? 10 : 6)} />
          </g>
        ))}
      </g>
      <g fill={steel} opacity="0.2" fontSize="10" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {[200, 400, 600, 800, 1000].map((x) => (
          <text key={x} x={x + 4} y={16}>
            {String(x / 100).padStart(2, "0")}
          </text>
        ))}
      </g>

      {/* Emplacement pads: a dashed ground circle under every node position. */}
      <g fill="none" stroke={steel} strokeOpacity="0.1" strokeDasharray="4 5">
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="42" />
        ))}
      </g>

      {/* THE ADVANCE: dashed ember route through the nodes in listing order,
          chevrons pointing the direction of the campaign. */}
      {pts.length > 1 ? (
        <g>
          <title>{advanceTitle}</title>
          <polyline
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={UI.ember}
            strokeOpacity="0.45"
            strokeWidth="2"
            strokeDasharray="7 8"
            strokeLinejoin="round"
          />
          {pts.slice(0, -1).map((p, i) => {
            const q = pts[i + 1];
            const mx = (p.x + q.x) / 2;
            const my = (p.y + q.y) / 2;
            const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
            return (
              <path
                key={i}
                d="M-5,-4.5 L5,0 L-5,4.5"
                fill="none"
                stroke={UI.ember}
                strokeOpacity="0.6"
                strokeWidth="2"
                strokeLinejoin="round"
                transform={`translate(${mx} ${my}) rotate(${ang})`}
              />
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}

// ── The node chip (stage mode) and the row (mobile column mode) ─────────────
function NodeChip({
  node,
  index,
  d,
  theme,
  localized,
  nowMs,
  reduced,
  onOpen,
}: {
  node: SiegeNode;
  index: number;
  d: S5Dict;
  theme: Theme;
  localized: boolean;
  nowMs: number;
  reduced: boolean;
  onOpen: (domain: string) => void;
}) {
  const pos = nodePos(index);
  const sub = nodeSub(node, d, nowMs);
  const word = statusWord(node, d, theme, localized);
  return (
    <button
      type="button"
      className={"sg-node" + (node.sprint ? " sg-node--sprint" : "")}
      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
      onClick={() => onOpen(node.domain)}
      aria-label={`${node.name}. ${word}. ${sub}`}
      aria-haspopup="dialog"
    >
      <span className="sg-idx">{String(index + 1).padStart(2, "0")}</span>
      {node.sprint ? <span className="sg-sprtag">{d.sprint.tag}</span> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`sg-fortpic sg-fortpic--${node.status}`}
        src={`/s5-art/map/fort-${fortPlate(node.status, node.peakPct / 100)}.png`}
        alt=""
        aria-hidden
      />
      <FortRing node={node} reduced={reduced} />
      <span className="sg-name">{node.name}</span>
      <span className="sg-sub">{sub}</span>
      {node.status === "bonded" ? (
        <span className="sg-stamp" aria-hidden>
          {localized ? d.status.bonded : theme.bondedWord}
        </span>
      ) : null}
    </button>
  );
}

function NodeRow({
  node,
  index,
  d,
  theme,
  localized,
  nowMs,
  reduced,
  onOpen,
}: {
  node: SiegeNode;
  index: number;
  d: S5Dict;
  theme: Theme;
  localized: boolean;
  nowMs: number;
  reduced: boolean;
  onOpen: (domain: string) => void;
}) {
  const sub = nodeSub(node, d, nowMs);
  const word = statusWord(node, d, theme, localized);
  return (
    <li className="sg-colitem">
      <span className="sg-coldot" style={{ background: RING_COLOR[node.status] }} aria-hidden />
      <button
        type="button"
        className={"sg-row" + (node.sprint ? " sg-row--sprint" : "")}
        onClick={() => onOpen(node.domain)}
        aria-label={`${node.name}. ${word}. ${sub}`}
        aria-haspopup="dialog"
      >
        <FortRing node={node} reduced={reduced} />
        <span className="sg-rowbody">
          <span className="sg-rowname">
            <span className="sg-rowidx">{String(index + 1).padStart(2, "0")}</span> {node.name}
            {node.sprint ? <span className="sg-sprtag sg-sprtag--inline">{d.sprint.tag}</span> : null}
          </span>
          <span className="sg-rowsub">{sub}</span>
        </span>
        <StatusChip theme={theme} status={node.status} label={localized ? d.status[node.status] : undefined} />
      </button>
    </li>
  );
}

// ── The dossier card ────────────────────────────────────────────────────────
function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <dt className="sg-fact-l">{label}</dt>
      <dd className={"sg-fact-v" + (strong ? " sg-fact-v--strong" : "")}>{value}</dd>
    </>
  );
}

function DetailCard({
  node,
  d,
  theme,
  localized,
  nowMs,
  weMin,
  weMax,
  weMult,
  onClose,
}: {
  node: SiegeNode;
  d: S5Dict;
  theme: Theme;
  localized: boolean;
  nowMs: number;
  weMin: number;
  weMax: number;
  weMult: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Focus restoration (2026-07-27 audit): on close, focus used to fall to
    // <body>, dropping a keyboard user at the top of the document instead of
    // back on the node they opened.
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const launchMs = node.launchAt ? new Date(node.launchAt).getTime() : NaN;
  const raise =
    node.bondingFdv && node.initialFdv && node.initialFdv < node.bondingFdv
      ? node.bondingFdv - node.initialFdv
      : node.bondingFdv;
  const money = (n: number | null) => (n && n > 0 ? usd(n) : d.map.tba);

  return (
    <div
      className="sg-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${node.name} · ${d.map.detailAria}`}
        className="sg-card"
        tabIndex={-1}
        ref={(el) => {
          ref.current = el;
        }}
      >
        <header className="sg-card-head">
          <span className="sg-card-name">{node.name}</span>
          <span className="sg-card-headright">
            <StatusChip theme={theme} status={node.status} label={localized ? d.status[node.status] : undefined} />
            <button type="button" className="sg-x" aria-label={d.map.close} onClick={onClose}>
              ✕
            </button>
          </span>
        </header>

        {node.status === "pending" ? (
          <div className="sg-card-pending">
            <p className="sg-card-count">
              {Number.isFinite(launchMs) ? fill(d.map.subPending, { t: fmtCountdown(launchMs - nowMs) }) : d.map.tba}
            </p>
            {node.launchAt ? (
              <p className="sg-card-when">{fill(d.map.listsOn, { date: fmtDateUtc(node.launchAt) })}</p>
            ) : null}
          </div>
        ) : (
          <div className="sg-card-progress">
            <ProgressBar value={node.progress} color={RING_COLOR[node.status]} />
            <p className="sg-card-progline">
              <span style={{ color: RING_COLOR[node.status], fontWeight: 800 }}>
                {Math.round(Math.max(0, Math.min(1, node.progress)) * 100)}%
              </span>
              <span className="sg-card-peak">
                {node.status === "bonded"
                  ? fill(d.map.subBonded, { usd: usd(node.poolShare) })
                  : node.status === "failed"
                    ? fill(d.map.subFailed, { peak: node.peakPct })
                    : fill(d.map.subLive, { peak: node.peakPct, usd: usd(node.securedUsd) })}
              </span>
            </p>
          </div>
        )}

        {node.fresh ? <p className="sg-fresh">{fill(d.map.freshNote, { days: FRESH_WINDOW_DAYS })}</p> : null}

        <dl className="sg-facts">
          <Fact label={d.map.initialFdvLabel} value={money(node.initialFdv)} />
          <Fact label={d.map.bondingFdvLabel} value={money(node.bondingFdv)} />
          <Fact label={d.map.raiseLabel} value={money(raise)} />
          <Fact label={d.map.shareLabel} value={node.poolShare > 0 ? usd(node.poolShare) : d.map.tba} strong />
          <Fact label={d.map.statSecured} value={usd(node.securedUsd)} strong />
          <Fact label={d.map.bountyLabel} value={money(node.bountyUsd)} />
        </dl>

        {node.status === "live" ? (
          /* THE BUY, IN HERE. BuyPanel quotes the wall's own bonding curve and
             spends from the wallet the player already connected to enlist, so
             a stronghold is one tap instead of "leave, land on a stranger's
             form, work out what to type". It resolves the venue server-side
             first and renders the old link-out itself if the wall is not on
             its curve, so this branch is always safe. */
          <BuyPanel domain={node.domain} name={node.name} strings={d.map.buy} />
        ) : node.status !== "pending" ? (
          <a
            className="sg-view"
            href={buyLink(node.domain)}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("cta_click", { ref: "map-view", domain: node.domain })}
          >
            {d.map.viewCta} ↗
          </a>
        ) : (
          /* A SCOUTED node used to be a dead end: full stat card, no button,
             no explanation (2026-07-27 audit, F4). On launch day most of the
             roster is pending, so this is the first thing a new player taps. */
          <p className="sg-pending" data-testid="node-pending-note">
            {d.map.pendingNote}
          </p>
        )}

        <WarEffortControl
          row={{
            domain: node.domain,
            name: node.name,
            status: node.status,
            open: node.weOpen,
            committed: node.weCommitted,
            commanders: node.weCommanders,
          }}
          dict={d}
          min={weMin}
          max={weMax}
          mult={weMult}
        />
      </section>
    </div>
  );
}

// ── The page body ───────────────────────────────────────────────────────────
export function SiegeMap({
  nodes,
  empty,
  pool,
  poolLineText,
  sprint,
  serverNowMs,
  theme,
  d,
  localized,
  preview,
  weMin,
  weMax,
  weMult,
  commanders,
}: SiegeMapProps) {
  const nowMs = useNowMs(serverNowMs);
  const reduced = useReducedMotion();
  const [sel, setSel] = useState<string | null>(null);
  const [cmdr, setCmdr] = useState<TopCommander | null>(null);
  const cmdrCardRef = useRef<HTMLElement | null>(null);
  // The commander card declared role="dialog" but never took focus and had no
  // Escape (2026-07-27 audit). Same contract as DetailCard above.
  useEffect(() => {
    if (!cmdr) return;
    const previous = document.activeElement as HTMLElement | null;
    cmdrCardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCmdr(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [cmdr]);
  const selNode = sel ? nodes.find((n) => n.domain === sel) || null : null;
  const spots = useMemo(
    () => commanderSpots(commanders, nodes.map((n) => n.domain)),
    [commanders, nodes],
  );

  const sprintNames = useMemo(() => {
    const byDomain = new Map(nodes.map((n) => [n.domain, n.name]));
    return sprint.domains.map((x) => byDomain.get(x.toLowerCase()) || x).join(" · ");
  }, [nodes, sprint.domains]);
  const firstSprint = nodes.find((n) => n.sprint) || null;

  return (
    <main id="s5-content" className="sg-main">
      <div className="sg-shell">
        <header className="sg-head">
          <Eyebrow>{theme.seasonName}</Eyebrow>
          <h1 className="sg-title">{d.map.title}</h1>
          {/* The ADR-0076 tagline, right under the title. */}
          <p className="sg-tagline">{d.common.onlyBreachedPay}</p>
          <p className="sg-subtitle">{d.map.subtitle}</p>
          {preview ? <p className="sg-preview">{d.map.previewBadge}</p> : null}
        </header>

        {empty ? (
          <Panel style={{ textAlign: "center", padding: "34px 24px" }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: UI.text, marginBottom: 8 }}>
              {d.common.emptyFrontTitle}
            </div>
            <p style={{ fontSize: 14, color: UI.muted, margin: 0, lineHeight: 1.6 }}>{d.map.emptyBody}</p>
          </Panel>
        ) : (
          <>
            {/* THE WAR CHEST: pool · secured (count-up) · paid out, then the
                ONE shared pool sentence (computed in lib/s5/data). */}
            <section className="sg-chest" aria-label={d.map.statPool}>
              <div className="sg-chest-stats">
                <div className="sg-stat">
                  <span className="sg-stat-l">{d.map.statPool}</span>
                  <span className="sg-stat-v">{usd(pool.full)}</span>
                </div>
                <div className="sg-stat sg-stat--ember">
                  <span className="sg-stat-l">{d.map.statSecured}</span>
                  <span className="sg-stat-v">
                    <SecuredCounter value={pool.secured} reduced={reduced} />
                  </span>
                </div>
                <div className="sg-stat">
                  <span className="sg-stat-l">{d.map.statPaid}</span>
                  <span className="sg-stat-v">{usd(pool.paidOutUsd)}</span>
                </div>
              </div>
              <p className="sg-poolline">{poolLineText}</p>
            </section>

            {/* THE FRONT REACTS: the sprint banner (red alert on the wall). */}
            {sprint.active && sprintNames ? (
              <div className="sg-alert" role="status">
                <span className="sg-alert-tag">{d.sprint.tag}</span>
                <span className="sg-alert-body">
                  <strong>{fill(d.sprint.frLead, { domain: sprintNames })}.</strong> {d.sprint.frNote}
                </span>
                {firstSprint ? (
                  <button type="button" className="sg-alert-cta" onClick={() => setSel(firstSprint.domain)}>
                    {d.sprint.frCta}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Desktop: the battlefield stage. Mobile: the front-line column.
                CSS swaps them under 760px; both render the same nodes. */}
            <div className="sg-stage">
              <MapTerrain className="sg-relief" />
              <Terrain nodeCount={nodes.length} advanceTitle={d.map.advanceLegend} />
              {nodes.map((n, i) => (
                <NodeChip
                  key={n.domain}
                  node={n}
                  index={i}
                  d={d}
                  theme={theme}
                  localized={localized}
                  nowMs={nowMs}
                  reduced={reduced}
                  onOpen={setSel}
                />
              ))}
              {spots.map(({ c, x, y }) => (
                <button
                  key={`${c.rank}-${c.handle}`}
                  className={`sg-cmdr${c.tankKey ? " sg-cmdr--tank" : ""}`}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                  onClick={() => setCmdr(c)}
                  data-testid={`map-cmdr-${c.rank}`}
                  aria-label={`${c.name} · ${c.points} ${theme.points}`}
                  title={c.name}
                >
                  {/* THE MAP SHOWS MACHINES (Mike 2026-07-27, the ADR-0083
                      open item): each commander stands as the TANK they field
                      (rembg-cut from the studio renders); the PERSON stays on
                      the tap card. A missing cutout (a future tank with no
                      render yet) falls back to the portrait via onError. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="sg-cmdr-img"
                    src={c.tankKey ? mapTankSrc(c.tankKey, c.camo) : `/s5-art/commander/${c.commanderKey}.png`}
                    onError={(e) => {
                      const el = e.currentTarget;
                      const fallback = `/s5-art/commander/${c.commanderKey}.png`;
                      if (!el.src.endsWith(fallback)) el.src = fallback;
                    }}
                    alt=""
                  />
                  {c.rank <= 3 ? <span className="sg-cmdr-rank">{c.rank}</span> : null}
                </button>
              ))}
              <span className="sg-legend">{d.map.advanceLegend}</span>
            </div>

            {commanders.some((c) => c.points > 0 && !/^0x/i.test(c.name) && c.name.trim().length > 0) ? (
              <div className="sg-rail" data-testid="map-standings">
                <p className="sg-rail-h">{d.map.standings}</p>
                {commanders.slice(0, 10).map((c) => (
                  /* Buttons, not divs: under 760px the painted stage is hidden,
                     so this rail is the ONLY way to reach a commander's card
                     and their garage link on a phone or by keyboard at a narrow
                     width (2026-07-27 audit, item 23). */
                  <button
                    type="button"
                    className="sg-rail-row"
                    key={`r-${c.rank}-${c.handle}`}
                    onClick={() => setCmdr(c)}
                    aria-label={`${c.name}. ${c.points.toLocaleString("en-US")} ${theme.points}. ${c.tankName}`}
                  >
                    <span className="sg-rail-n">{c.rank}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="sg-rail-fig" src={`/s5-art/commander/${c.commanderKey}.png`} alt="" />
                    <span className="sg-rail-name">
                      {c.name} <span className="sg-rail-tank">{c.tankName}</span>
                    </span>
                    <span className="sg-rail-pts">{c.points.toLocaleString("en-US")}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="sg-rail-empty" data-testid="map-roster-empty">
                {d.map.rosterSoon}
              </p>
            )}

            <ol className="sg-column" aria-label={d.map.advanceLegend}>
              {nodes.map((n, i) => (
                <NodeRow
                  key={n.domain}
                  node={n}
                  index={i}
                  d={d}
                  theme={theme}
                  localized={localized}
                  nowMs={nowMs}
                  reduced={reduced}
                  onOpen={setSel}
                />
              ))}
            </ol>

            <p className="sg-footnote">{d.map.footnote}</p>
            <p className="sg-footnote">
              <strong style={{ color: UI.muted }}>{d.warEffort.title}.</strong> {d.warEffort.intro} {d.warEffort.note}
            </p>
          </>
        )}

        <p className="sg-links">
          <Link href="/s5" style={{ color: UI.muted }}>
            {d.common.back}
          </Link>
          {" · "}
          <Link href="/s5/board" style={{ color: UI.muted }}>
            {d.links.board}
          </Link>
          {" · "}
          <Link href="/s5/join" style={{ color: UI.muted }}>
            {d.links.enlist}
          </Link>
        </p>
      </div>

      {selNode ? (
        <DetailCard
          node={selNode}
          d={d}
          theme={theme}
          localized={localized}
          nowMs={nowMs}
          weMin={weMin}
          weMax={weMax}
          weMult={weMult}
          onClose={() => setSel(null)}
        />
      ) : null}

      {cmdr ? (
        <div
          className="sg-scrim"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCmdr(null);
          }}
        >
          <section
            ref={cmdrCardRef}
            role="dialog"
            aria-modal="true"
            aria-label={cmdr.name}
            className="sg-card sg-ccard"
            tabIndex={-1}
            data-testid="map-commander-card"
          >
            <div className="sg-ccard-hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="sg-ccard-fig" src={`/s5-art/commander/${cmdr.commanderKey}.png`} alt="" />
              {/* The tank they actually field, the same cutout the map draws. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="sg-ccard-tank"
                src={mapTankSrc(cmdr.tankKey, cmdr.camo)}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                alt=""
              />
              <span className="sg-ccard-badge">#{cmdr.rank}</span>
            </div>
            <div className="sg-ccard-body">
              <h3 className="sg-ccard-name">{cmdr.name}</h3>
              <dl className="sg-ccard-stats">
                <div className="sg-ccard-stat">
                  <dt>{theme.points}</dt>
                  <dd>{cmdr.points.toLocaleString("en-US")}</dd>
                </div>
                <div className="sg-ccard-stat">
                  <dt>{d.map.cardTank}</dt>
                  <dd>{cmdr.tankName}</dd>
                </div>
                <div className="sg-ccard-stat">
                  <dt>{d.map.cardHolding}</dt>
                  <dd>{cmdr.domain || d.map.cardStaging}</dd>
                </div>
              </dl>
              <div className="sg-ccard-actions">
                <a className="sg-ccard-link" href={`/s5/hq/${cmdr.handle}`}>
                  {d.map.viewGarage}
                </a>
                <a
                  className="sg-ccard-share"
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                    `#${cmdr.rank} ${cmdr.name} · ${cmdr.points.toLocaleString("en-US")} Medals · fielding the ${cmdr.tankName} in Launch Wars IRON SIEGE. Free to play in your browser: https://tanks.web3guides.com`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="cmdr-share"
                  onClick={() => track("cta_click", { ref: "cmdr-share" })}
                >
                  {d.map.cardShare}
                </a>
              </div>
            </div>
            <button className="sg-ccard-x" onClick={() => setCmdr(null)} aria-label={d.map.closeCard}>
              ×
            </button>
          </section>
        </div>
      ) : null}

      {/* dangerouslySetInnerHTML (static local const, no user input): the house
          pattern (HqScene, the public garage). A plain <style> text child
          hydration-mismatches because SSR escapes the quotes in content: "". */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </main>
  );
}

/* NO BACKTICKS anywhere inside this CSS string, comments included (the S3
   build-break lesson). */
const CSS = `
.sg-main{min-height:100dvh;color:${UI.text};font-family:${UI.sans};padding:84px 0 72px;background-color:#0b0d10;
  background-image:
    repeating-linear-gradient(0deg, rgba(154,167,180,0.03) 0 1px, transparent 1px 56px),
    repeating-linear-gradient(90deg, rgba(154,167,180,0.03) 0 1px, transparent 1px 56px),
    radial-gradient(1100px 540px at 50% -10%, #171c22 0%, #0b0d10 62%);}
/* THE BACK LAYER, shared with the HQ so the two pages read as one world
   rather than a painting and a diagram. Same plate, same scrim, fixed so it
   does not scroll. The map's own grid washes stay ON TOP of it, so the
   readability grammar is untouched. */
.sg-main{position:relative;}
.sg-main::before{
  /* Same atmosphere as the HQ, and for the same reason: a painted camp plate
     behind the page read as the hero's own background stretched across the
     site. Pure CSS, no scene, nothing to compete with the board. */
  content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
  background:
    radial-gradient(120% 60% at 50% 108%, rgba(224,102,46,0.11) 0%, rgba(224,102,46,0.04) 38%, rgba(224,102,46,0) 68%),
    radial-gradient(140% 110% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.5) 100%);}
.sg-main>*{position:relative;z-index:1;}
/* Commanders standing on the front. Sized as a % of the stage so they scale
   with it; translate(-50%,-100%) plants each one BY THE FEET at its spot, so a
   figure reads as standing on the ground rather than floating at its middle.
   The grade knocks them back into the map's key the same way the HQ does. */
/* The fort picture sits BEHIND the ring and the words: ADR-0008's rule is that
   decoration never competes with state, so the ring, the percent and the
   status word stay the things you read. Pending is fogged (S3's "inaccessible
   until it lists"), failed is greyed and quiet, never alarm. */
.sg-fortpic{width:104px;height:auto;margin-bottom:-74px;opacity:.96;pointer-events:none;
  filter:saturate(.72) brightness(.86) drop-shadow(0 4px 7px rgba(0,0,0,.6));}
.sg-fortpic--pending{filter:saturate(.2) brightness(.62) blur(.6px);opacity:.55;}
.sg-fortpic--failed{filter:saturate(.18) brightness(.68);opacity:.7;}
.sg-fortpic--bonded{filter:saturate(.85) brightness(.98) drop-shadow(0 0 9px ${GOLD}55) drop-shadow(0 4px 7px rgba(0,0,0,.6));}
/* min sizes: the portrait fallback is a narrow cutout (9-24px wide at desktop
   widths) and tank spots were 18px tall on a small laptop, both under the
   24x24 pointer-target floor (SC 2.5.8, 2026-07-27 audit). */
.sg-cmdr{position:absolute;height:5.8%;min-width:24px;min-height:24px;transform:translate(-50%,-100%);background:none;border:0;padding:0;cursor:pointer;z-index:6;line-height:0;}
/* Tank spots: tanks are ~2.2x wider than tall, so a shorter box keeps their
   visual mass near the old portrait's and the golden-angle scatter uncrowded. */
.sg-cmdr--tank{height:4%;}
.sg-cmdr-img{height:100%;width:auto;filter:saturate(.6) brightness(.9) contrast(1.02) sepia(.14) drop-shadow(0 3px 5px rgba(0,0,0,.65));}
.sg-cmdr:hover .sg-cmdr-img,.sg-cmdr:focus-visible .sg-cmdr-img{filter:saturate(.8) brightness(1.06) contrast(1.02) drop-shadow(0 0 10px ${UI.ember}aa) drop-shadow(0 3px 5px rgba(0,0,0,.65));}
.sg-cmdr:focus-visible{outline:2px solid ${UI.ember};outline-offset:2px;border-radius:6px;}
.sg-cmdr-rank{position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);
  font:700 9px/1 ui-monospace,Menlo,monospace;color:#14100c;background:${UI.ember};
  border-radius:999px;padding:2px 5px;box-shadow:0 1px 3px rgba(0,0,0,.6);}

/* The standings rail. S3 had a top-captains rail and S4 had individual
   standings; the S5 map shipped with neither. */
.sg-ccard{display:block;position:relative;width:min(420px,86vw);padding:0;overflow:hidden;}
.sg-ccard-fig{height:132px;width:auto;filter:saturate(.7) brightness(.95) sepia(.1) drop-shadow(0 6px 12px rgba(0,0,0,.6));}
.sg-ccard-body{min-width:0;}
.sg-ccard-name{margin:0 0 2px;}
.sg-ccard-rank{font:700 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:${UI.ember};margin:0 0 4px;}
.sg-ccard-name{margin:0 0 6px;font-size:20px;overflow:hidden;text-overflow:ellipsis;}
.sg-ccard-line{margin:0 0 3px;font-size:13.5px;color:#dfe6ec;}
.sg-ccard-muted{color:${UI.muted};}
.sg-ccard-link{display:inline-block;margin-top:8px;font-size:13px;color:${UI.ember};text-decoration:none;border-bottom:1px solid ${UI.ember}66;}
.sg-ccard-x{position:absolute;top:2px;right:6px;background:none;border:0;color:${UI.muted};font-size:20px;cursor:pointer;line-height:1;padding:6px;min-width:32px;min-height:32px;}
.sg-rail{margin:14px auto 0;max-width:760px;border:1px solid ${UI.border};border-radius:12px;
  background:linear-gradient(180deg,rgba(24,29,35,.92),rgba(15,18,22,.92));padding:12px 14px;}
.sg-ccard-hero{position:relative;height:196px;overflow:hidden;
  background:
    radial-gradient(120% 80% at 30% 100%, rgba(224,102,46,.20), transparent 62%),
    linear-gradient(180deg, rgba(20,26,32,.92), rgba(11,13,16,.55));
  border-bottom:1px solid rgba(154,167,180,.2);}
/* One ground line under both figures so they read as standing in the same shot. */
.sg-ccard-hero::after{content:"";position:absolute;left:0;right:0;bottom:14px;height:22px;
  background:radial-gradient(60% 100% at 50% 0%, rgba(0,0,0,.55), transparent 70%);}
.sg-ccard-hero .sg-ccard-fig{position:absolute;left:14px;bottom:-4px;height:188px;width:auto;
  z-index:2;filter:drop-shadow(0 8px 16px rgba(0,0,0,.65));}
.sg-ccard-tank{position:absolute;right:8px;bottom:22px;width:60%;max-width:236px;height:auto;
  z-index:1;filter:drop-shadow(0 6px 12px rgba(0,0,0,.7));}
.sg-ccard-badge{position:absolute;top:10px;right:12px;z-index:3;font:800 12px/1 ${UI.mono};color:#14100c;
  background:${UI.ember};border-radius:999px;padding:5px 10px;}
.sg-ccard-body{padding:14px 18px 16px;}
.sg-ccard-stats{margin:10px 0 12px;display:grid;gap:7px;}
.sg-ccard-stat{display:flex;justify-content:space-between;gap:12px;align-items:baseline;
  border-bottom:1px solid rgba(154,167,180,.12);padding-bottom:6px;}
.sg-ccard-stat dt{font:700 10px/1.2 ${UI.mono};letter-spacing:.12em;text-transform:uppercase;color:${UI.faint};margin:0;}
.sg-ccard-stat dd{margin:0;font-size:13.5px;font-weight:800;color:${UI.text};font-variant-numeric:tabular-nums;
  text-align:right;overflow:hidden;text-overflow:ellipsis;}
.sg-ccard-actions{display:flex;flex-wrap:wrap;gap:8px;}
.sg-ccard-share{display:inline-block;font:800 12px/1 ${UI.sans};color:#14100c;background:${UI.ember};
  border-radius:8px;padding:9px 12px;text-decoration:none;}
.sg-ccard-share:hover{filter:brightness(1.07);}
.sg-ccard-share:focus-visible{outline:2px solid #fff6ee;outline-offset:2px;}
.sg-rail-empty{font-size:12.5px;color:${UI.muted};text-align:center;padding:14px 12px;border:1px dashed rgba(154,167,180,.22);border-radius:10px;margin:10px 0 0;}
.sg-rail-h{font:700 10.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:${UI.muted};margin:0 0 8px;}
/* now a <button>: reset the UA chrome so it stays visually identical to the
   old row, and give it a real 40px touch target. */
.sg-rail-row{display:flex;align-items:center;gap:10px;padding:5px 0;border-top:1px solid rgba(154,167,180,.10);
  width:100%;min-height:40px;background:none;border-left:0;border-right:0;border-bottom:0;
  color:inherit;font:inherit;text-align:left;cursor:pointer;}
.sg-rail-row:first-of-type{border-top:0;}
.sg-rail-row:hover .sg-rail-name,.sg-rail-row:focus-visible .sg-rail-name{color:${UI.ember};}
.sg-rail-n{font:700 11px/1 ui-monospace,Menlo,monospace;color:${UI.muted};width:22px;flex:0 0 22px;}
.sg-rail-fig{height:26px;width:auto;filter:saturate(.6) brightness(.92) sepia(.14);}
.sg-rail-name{flex:1;font-size:13.5px;color:#dfe6ec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sg-rail-tank{font-size:11.5px;color:${UI.muted};}
.sg-rail-pts{font:700 12.5px/1 ui-monospace,Menlo,monospace;color:${UI.ember};}
.sg-shell{max-width:1200px;margin:0 auto;padding:0 20px;}
.sg-head{text-align:center;margin-bottom:20px;}
.sg-title{font-size:clamp(28px,6vw,44px);font-weight:800;margin:0 0 6px;color:${UI.text};}
.sg-tagline{font-size:13px;font-weight:700;letter-spacing:0.05em;color:#e8935f;margin:0 0 8px;}
.sg-subtitle{font-size:14.5px;color:${UI.muted};margin:0;}
.sg-preview{display:inline-block;margin:12px auto 0;font-size:10.5px;font-weight:800;letter-spacing:0.14em;
  text-transform:uppercase;color:${GOLD};border:1px dashed ${GOLD}88;border-radius:999px;padding:4px 12px;
  font-family:${UI.mono};}

.sg-chest{background:${UI.panel};border:1px solid ${UI.border};border-radius:14px;padding:14px 18px 12px;margin-bottom:14px;}
.sg-chest-stats{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 34px;margin-bottom:8px;}
.sg-stat{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:110px;}
.sg-stat-l{font-size:10.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${UI.faint};}
.sg-stat-v{font-size:22px;font-weight:800;color:${UI.text};font-variant-numeric:tabular-nums;font-family:${UI.mono};}
.sg-stat--ember .sg-stat-v{color:${UI.ember};}
.sg-poolline{text-align:center;font-size:12.5px;color:${UI.muted};margin:0;border-top:1px solid ${UI.border};padding-top:9px;line-height:1.6;}

.sg-alert{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;border:1px solid ${ALERT}55;
  background:linear-gradient(90deg, ${ALERT}14 0%, rgba(18,22,27,0.85) 55%, ${ALERT}0d 100%);
  border-radius:12px;padding:10px 14px;margin-bottom:14px;}
.sg-alert-tag{font-family:${UI.mono};font-size:10px;font-weight:800;letter-spacing:0.16em;color:${ALERT};
  border:1px solid ${ALERT}88;border-radius:999px;padding:3px 10px;white-space:nowrap;}
.sg-alert-body{flex:1 1 260px;font-size:12.5px;color:${UI.text};line-height:1.55;}
.sg-alert-cta{background:transparent;border:1px solid ${ALERT}88;color:${ALERT};border-radius:8px;
  padding:6px 12px;font-size:11.5px;font-weight:800;cursor:pointer;white-space:nowrap;}
.sg-alert-cta:hover{background:${ALERT}1a;}

.sg-stage{position:relative;width:100%;aspect-ratio:1200/760;margin:6px auto 4px;}
.sg-relief{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;}
.sg-terrain{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1;}
/* opacity:0.8 dropped this to 4.27:1; without it the same token reads 6.07:1. */
.sg-legend{position:absolute;left:8px;bottom:6px;font-family:${UI.mono};font-size:9.5px;letter-spacing:0.12em;
  text-transform:uppercase;color:${UI.faint};}

.sg-node{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;
  gap:5px;background:transparent;border:0;padding:0;cursor:pointer;width:172px;color:inherit;
  -webkit-tap-highlight-color:transparent;}
.sg-node:focus-visible{outline:2px solid ${GOLD};outline-offset:6px;border-radius:14px;}
.sg-node:hover .sg-name{color:#fff;}
.sg-idx{position:absolute;top:-4px;left:50%;transform:translate(-46px,0);font-family:${UI.mono};font-size:9.5px;
  color:${UI.faint};opacity:0.85;}
.sg-ringwrap{position:relative;width:58px;height:58px;flex:0 0 auto;}
.sg-ringsvg{position:absolute;inset:0;width:100%;height:100%;}
.sg-fort{position:absolute;left:50%;top:50%;width:26px;height:22px;transform:translate(-50%,-50%);}
.sg-pct{position:absolute;right:-14px;bottom:-3px;font-family:${UI.mono};font-size:10px;font-weight:700;
  background:rgba(11,13,16,0.9);border:1px solid;border-radius:999px;padding:1px 6px;
  font-variant-numeric:tabular-nums;}
.sg-name{font-size:15px;font-weight:800;color:${UI.text};max-width:172px;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;text-shadow:0 1px 5px rgba(0,0,0,0.85);}
.sg-sub{font-size:11.5px;color:${UI.muted};text-transform:uppercase;letter-spacing:0.05em;text-align:center;
  line-height:1.5;max-width:186px;font-variant-numeric:tabular-nums;text-shadow:0 1px 4px rgba(0,0,0,0.85);}
.sg-stamp{position:absolute;top:2px;left:50%;transform:translate(-50%,0) rotate(-11deg);border:2px solid ${GOLD};
  color:${GOLD};font-weight:900;font-size:11px;letter-spacing:0.16em;padding:2px 8px;border-radius:4px;
  background:rgba(11,13,16,0.6);text-transform:uppercase;white-space:nowrap;
  box-shadow:0 0 14px rgba(240,179,64,0.25);}
.sg-sprtag{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-size:8.5px;font-weight:800;
  letter-spacing:0.14em;color:${ALERT};border:1px solid ${ALERT}88;background:${ALERT}1a;border-radius:999px;
  padding:1px 7px;white-space:nowrap;font-family:${UI.mono};}
.sg-sprtag--inline{position:static;transform:none;margin-left:8px;}
.sg-alertring{position:absolute;inset:-5px;border-radius:999px;border:2px solid ${ALERT};opacity:0.85;}
.sg-alertring--pulse{animation:sgPulse 1.6s ease-in-out infinite;}
@keyframes sgPulse{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,0);opacity:0.9;}
  50%{box-shadow:0 0 15px 4px rgba(248,113,113,0.35);opacity:0.55;}}

.sg-column{display:none;list-style:none;margin:14px 0 6px;padding:0 0 0 26px;position:relative;
  flex-direction:column;gap:10px;}
.sg-column::before{content:"";position:absolute;left:10px;top:10px;bottom:10px;border-left:2px dashed ${UI.ember}55;}
.sg-colitem{position:relative;}
.sg-coldot{position:absolute;left:-20px;top:50%;width:9px;height:9px;border-radius:999px;transform:translate(-3.5px,-50%);
  box-shadow:0 0 0 3px #0b0d10;}
.sg-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:${UI.panel};
  border:1px solid ${UI.border};border-radius:14px;padding:10px 12px;cursor:pointer;color:inherit;font-family:inherit;}
.sg-row:focus-visible{outline:2px solid ${GOLD};outline-offset:2px;}
.sg-row--sprint{border-color:${ALERT}66;}
.sg-rowbody{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;}
.sg-rowname{font-size:13.5px;font-weight:800;color:${UI.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sg-rowidx{font-family:${UI.mono};font-size:10px;color:${UI.faint};margin-right:2px;}
.sg-rowsub{font-size:11px;color:${UI.muted};text-transform:uppercase;letter-spacing:0.04em;line-height:1.5;
  font-variant-numeric:tabular-nums;}

.sg-footnote{font-size:12.5px;color:${UI.faint};margin-top:12px;line-height:1.6;}
.sg-links{text-align:center;font-size:13px;color:${UI.faint};margin-top:30px;}
.sg-links a{color:${UI.muted};}

.sg-scrim{position:fixed;inset:0;z-index:1200;background:rgba(5,7,9,0.66);backdrop-filter:blur(3px);
  display:flex;align-items:center;justify-content:center;padding:18px;}
.sg-card{width:min(440px,100%);max-height:min(80dvh,660px);overflow:auto;background:#12161c;
  border:1px solid ${UI.border};border-radius:16px;padding:18px 20px;box-shadow:0 18px 60px rgba(0,0,0,0.55);outline:none;}
.sg-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}
.sg-card-name{font-size:19px;font-weight:800;color:${UI.text};word-break:break-all;}
.sg-card-headright{display:flex;align-items:center;gap:10px;flex:0 0 auto;}
.sg-x{background:transparent;border:1px solid ${UI.border};color:${UI.muted};border-radius:8px;width:30px;height:30px;
  cursor:pointer;font-size:13px;line-height:1;}
.sg-x:hover{color:${UI.text};}
.sg-card-pending{text-align:center;margin:6px 0 12px;}
.sg-card-count{font-family:${UI.mono};font-size:20px;font-weight:800;color:${UI.text};margin:0 0 4px;
  text-transform:uppercase;letter-spacing:0.05em;font-variant-numeric:tabular-nums;}
.sg-card-when{font-size:12px;color:${UI.faint};margin:0;font-variant-numeric:tabular-nums;}
.sg-card-progress{margin:4px 0 12px;}
.sg-card-progline{display:flex;align-items:baseline;gap:10px;margin:8px 0 0;font-size:12.5px;
  font-variant-numeric:tabular-nums;}
.sg-card-peak{color:${UI.muted};line-height:1.5;}
.sg-fresh{font-size:12px;color:#e8935f;border:1px solid ${UI.ember}44;background:${UI.ember}12;border-radius:10px;
  padding:8px 12px;line-height:1.55;margin:0 0 12px;}
.sg-facts{display:grid;grid-template-columns:1fr auto;gap:7px 16px;margin:0 0 14px;font-size:12.5px;}
.sg-fact-l{color:${UI.faint};}
.sg-fact-v{color:${UI.text};text-align:right;font-variant-numeric:tabular-nums;font-family:${UI.mono};margin:0;}
.sg-fact-v--strong{color:${UI.good};font-weight:700;}
.sg-buy{display:block;text-align:center;background:${UI.ember};color:#12161b;font-weight:800;border-radius:9px;
  padding:10px 14px;text-decoration:none;font-size:13.5px;margin-bottom:4px;}
.sg-buy:hover{filter:brightness(1.07);}
.sg-pending{margin:10px 0 0;padding:10px 12px;border:1px dashed ${UI.border};border-radius:9px;
  font-size:12.5px;line-height:1.55;color:${UI.muted};background:rgba(255,255,255,0.02);}
.sg-view{display:block;text-align:center;border:1px solid ${UI.border};color:${UI.muted};font-weight:700;
  border-radius:9px;padding:9px 14px;text-decoration:none;font-size:13px;margin-bottom:4px;}
.sg-view:hover{color:${UI.text};}

@media (max-width:759px){
  .sg-stage{display:none;}
  .sg-column{display:flex;}
}
@media (max-width:479px){
  .sg-chest-stats{gap:8px 18px;}
  .sg-stat{min-width:88px;}
  .sg-stat-v{font-size:18px;}
}
@media (prefers-reduced-motion: reduce){
  .sg-alertring--pulse{animation:none;}
  .sg-buy:hover{filter:none;}
}
`;
