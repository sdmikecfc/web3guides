"use client";
/**
 * Season 4 HIT LIST MAP — the painted "state of the season" surface.
 *
 * THE TIME-SPLIT BOARD (Mike's quadrant spec, 2026-07-14): one SQUARE stage
 * cut by its two diagonals into FOUR triangular quadrants, envelope-back
 * style, each a different era. Client component; the server page hands it
 * the one season snapshot. Keeps the proven S3 READABILITY grammar
 * (ADR-0008) — fixed zones, one-second parse, decoration never competes
 * with state:
 *
 *   TOP     🕴️ the Agency quadrant (hitman era): rainy noir city, layered
 *           skyline, searchlight, ice-cyan ground glow. Its team lives here.
 *   LEFT    🤠 the Frontier quadrant (wild west): sunset prairie, mesa
 *           silhouettes, plank striping, gold ground glow.
 *   RIGHT   💠 the Singularity quadrant (futuristic): neon violet warp
 *           grid radiating from the center apex, holo glow.
 *   BOTTOM  THE CONTRACTS: the featured domains as rectangular CONTRACT
 *           CARDS fanned across a dark felt floor — a "mark" portrait on top
 *           (an ORIGINAL anime character, mark-<n>.png by sortOrder index,
 *           dashed-reticle vector fallback), the domain name underneath, and
 *           the contract WORTH (the target's own bondingFdv; the shared
 *           per-bond pool share when null). Red string runs card to card.
 *           Progress is a WAX-SEAL RING pinned to the portrait corner that
 *           only ever fills (upward-only, never a countdown); a CLOSED
 *           contract gets a crimson CLOSED stamp diagonally across the card
 *           and a gold glow.
 *   RAIL    the always-visible STANDINGS rail LEFT of the board on desktop
 *           (>=1100px, S3 map parity): the three teams ranked by points
 *           (accent bar, name, points, agent count — the snapshot carries
 *           team aggregates only, so no per-player list is invented) plus
 *           the pool line and the contracts-closed count. Below 1100px it
 *           collapses to a tight horizontal strip ABOVE the board.
 *   CENTER  the TIME MACHINE: an original temporal booth (charcoal capsule,
 *           gold trim, pulsing white-gold core seam, an embedded clock dial
 *           with live hands, two counter-rotating chrono rings, crimson
 *           beacon) anchoring the diagonal cross. Three faint era-colored
 *           energy streams flow from it into the three team quadrants — the
 *           device that explains why cowgirls, spies and future agents share
 *           one map. All idle motion is reduced-motion gated.
 *
 * Quadrant positions are FIXED per stable team key (alpha LEFT, beta RIGHT,
 * gamma TOP), never standings-ordered, so nothing reshuffles run to run.
 * Color identity comes from the GROUND: each camp stands in a pool of its
 * own accent light, and the quadrant ambients take the SAME runtime accent,
 * so a theme recolor (names and accents come from snap.theme) repaints the
 * quadrant with zero code change.
 *
 * Members render as small AGENT silhouettes inside their quadrant (capped,
 * +N chip for the rest, exactly the Beach towel contract), with the team's
 * LEAD AGENT front-center and largest — a framed portrait chip that ships on
 * the existing era cast art (/s4-art/cast-<era>-1.png). Tap a camp for the
 * standings card, tap a dossier for the contract status card.
 *
 * Art hooks: every sprite keys an asset under /public/s4-art/map/ with a
 * clean vector fallback, using the S3 hydration-safe onError pattern (a 404
 * that resolves before hydration never fires onError; a ref catches the
 * already-broken image at mount). Ships on the fallbacks today, upgrades
 * automatically when the generated art lands. Slots:
 *   bg.png            full-stage painted four-era backdrop
 *   quadrant-noir.png / quadrant-west.png / quadrant-future.png
 *                     per-triangle painted era backdrops (object-fit cover,
 *                     clipped by each quadrant's clip-path, darkened via a
 *                     brightness filter so game state always reads on top,
 *                     ADR-0008)
 *   dossier-felt.png  the contracts-floor felt plate (bottom triangle)
 *   timemachine.png   the temporal booth centerpiece
 *   mark-1..5.png     the contract-card mark portraits (by sortOrder index)
 *   camp-alpha.png    the Frontier saloon        (camp-beta / camp-gamma too)
 *   agent-alpha.png   small agent silhouette, one per team key
 * The lead-agent portrait keys the EXISTING cast art at /s4-art/ root
 * (cast-frontier-1.png / cast-singularity-1.png / cast-agency-1.png).
 *
 * Copy: every player-visible WORD comes from the snapshot theme
 * (lib/s4/theme.ts DEFAULT_THEME merged with the s4_theme config row).
 * Status COLORS stay the shared data-viz semantics (green = closed,
 * amber = active) from _components/ui. Contracts are always celebrated,
 * never mocked. No dollar math here beyond the shared pool line computed in
 * lib/s4/data.ts and passed in as text (the honest prize line).
 */
import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { Snapshot, SeasonTarget, TopPlayer } from "@/lib/s4/data";
import { statusLabel } from "@/lib/s4/theme";
import { HOLD_RATE_PER_USD_DAY, POOL_FULL_USD, FRESH_BONUS, FRESH_WINDOW_DAYS, freshnessMult } from "@/lib/s4/games";
import { STATUS_COLOR, UI } from "../_components/ui";
import { SeasonCountdown } from "../_components/SeasonCountdown";

const ART_BASE = "/s4-art/map";

// Era palette (ADR-0019/0020): charcoal base, crimson wax, gold trim, ice
// glass, violet holo.
const CRIMSON = "#e33d4e";
const GOLD = "#f0b340";
const VIOLET = "#c44dff"; // ice #4dd8e6 lives in the Agency rgba values below

// ── Fixed stage geometry (fractions of the square stage box) ───────────────
// Camps hold fixed QUADRANTS (alpha LEFT, beta RIGHT, gamma TOP, one per
// stable team key). The time machine anchors the center; dossiers fan across
// the BOTTOM triangle by sortOrder index. Nothing moves with standings.
// The camp CHARACTERS live in the OPEN PLAZA of each triangle — pulled toward
// the center, in the foreground of the diorama, so they stand clear of the HQ
// building the backdrop now bakes into the terrain at the outer edge.
const CAMP_POS: Record<string, { x: number; y: number }> = {
  alpha: { x: 0.28, y: 0.52 }, // LEFT: the Frontier plaza (off the baked saloon)
  beta: { x: 0.72, y: 0.52 }, // RIGHT: the Singularity plaza
  gamma: { x: 0.5, y: 0.28 }, // TOP: the Agency plaza
};
// Quadrant ambient geometry per stable team key (color comes from the
// runtime theme accent, never from here).
const ZONE_CLASS: Record<string, string> = {
  alpha: "hl-zone--left",
  beta: "hl-zone--right",
  gamma: "hl-zone--top",
};
// Where each team's energy stream lands (just short of the plaza camp).
const STREAM_END: Record<string, { x: number; y: number }> = {
  alpha: { x: 0.37, y: 0.52 },
  beta: { x: 0.63, y: 0.52 },
  gamma: { x: 0.5, y: 0.37 },
};
// A gentle bow per stream so the energy reads as flow, not a diagram edge.
const STREAM_BOW: Record<string, { x: number; y: number }> = {
  alpha: { x: 0, y: -26 },
  beta: { x: 0, y: 26 },
  gamma: { x: 30, y: 0 },
};
// Lead-agent portrait: the era cast art that already exists under /s4-art/.
const CAST_BASE: Record<string, string> = {
  alpha: "frontier",
  beta: "singularity",
  gamma: "agency",
};
const MAX_AGENTS = 24; // cap the per-team swarm (bounds a huge community; +N covers overflow)

// Where each team's PLAYER portraits cluster: an OFFSET from the camp center
// (fraction of the square stage) into the OPEN PLAZA beside the camp, so the
// little agent squad never covers the emblem or name. Sides get a narrow
// two-column stack in their tall plaza; the top camp gets a wide band in its
// wide plaza. w = the cluster max-width in px (portraits are a fixed size, like
// the camp emblem, so they stay legible and tappable at any stage scale).
// MMO-CITY SCATTER (Mike 2026-07-15: "spread them across the quadrant's flat
// area, not one blob — like an MMO city with players around different areas").
// Each team's agents scatter across the FLAT PLAZA of its quadrant (a region per
// team key, sited on the flat ground of each triangle, clear of the center
// machine and the bottom bounty board). A Halton low-discrepancy sequence fills
// the region EVENLY without clumping; perspective sizes each agent by depth
// (lower on screen = nearer = bigger); rank 1 is largest + haloed. ALL are shown
// (capped at MAX_AGENTS); the +N chip only survives a team bigger than the roster.
const TEAM_REGION: Record<string, { cx: number; cy: number; rx: number; ry: number }> = {
  alpha: { cx: 0.15, cy: 0.61, rx: 0.115, ry: 0.09 }, // Frontier: the dirt plaza, lower-left
  beta: { cx: 0.85, cy: 0.61, rx: 0.115, ry: 0.09 }, // Singularity: the neon deck, lower-right
  gamma: { cx: 0.5, cy: 0.185, rx: 0.155, ry: 0.072 }, // Agency: the rooftop, upper-middle
};
// Halton(index, base): a deterministic, evenly-spread point in [0,1).
function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

// The overlay SVGs share the stage box: viewBox 700x700 matches the square
// stage so x and y use the same scale.
const VB = 700;

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

// Theme team names carry a leading era emoji (🤠/💠/🕴️). The SVG emblem now
// stands in for it, so strip any leading non-alphanumeric run (the emoji, its
// variation selector, and the space) up to the first word. No unicode-flag
// regex: the project's tsc targets ES3, so this matches on UTF-16 units, which
// still strips astral-plane emoji surrogate pairs cleanly.
const teamName = (name: string) => name.replace(/^[^A-Za-z0-9]+/, "").trim() || name;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "TBA";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function relDays(iso: string, now: number): string | null {
  const diff = new Date(iso).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(diff / 3600000));
  return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}

// ── Art with vector fallback (S3 hydration-safe pattern) ───────────────────
function ArtSprite({
  src,
  className,
  fallback,
}: {
  src: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={className}
      // A 404 that resolves BEFORE hydration never fires onError (the event
      // is gone by the time React attaches it); the ref catches an already
      // broken image at mount so the vector fallback still kicks in.
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}

// ── Faction emblems (rendered in code; crisp at any size) ────────────────────
// One on-brand glyph per stable team key, colored by the RUNTIME accent so a
// theme recolor repaints it. Used by the standings-rail rows AND by each
// quadrant's camp label (viewBox 0 0 32 32). The floating building sprites are
// gone — the backdrops now bake the HQ into the terrain — so these emblems are
// the faction's mark on the board.
//   alpha  FRONTIER    a 5-point sheriff/bounty star with a crosshair center
//   beta   SINGULARITY a neon diamond / circuit-node glyph
//   gamma  AGENCY      a hexagonal crest with a barcode-stripe motif

// 🤠 FRONTIER — a filled bounty star, a reticle knocked into its heart.
function FrontierEmblem({ accent, className }: { accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M16 2 L19.5 11.2 L29.3 11.7 L21.7 17.9 L24.2 27.3 L16 22 L7.8 27.3 L10.3 17.9 L2.7 11.7 L12.5 11.2 Z"
        fill={accent}
        stroke={accent}
        strokeWidth="1.1"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <circle cx="16" cy="16" r="6" fill="#0c0e15" />
      <circle cx="16" cy="16" r="4" fill="none" stroke={accent} strokeWidth="1.1" />
      <line x1="16" y1="10.4" x2="16" y2="12.6" stroke={accent} strokeWidth="1.1" strokeLinecap="round" />
      <line x1="16" y1="19.4" x2="16" y2="21.6" stroke={accent} strokeWidth="1.1" strokeLinecap="round" />
      <line x1="10.4" y1="16" x2="12.6" y2="16" stroke={accent} strokeWidth="1.1" strokeLinecap="round" />
      <line x1="19.4" y1="16" x2="21.6" y2="16" stroke={accent} strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.3" fill={accent} />
    </svg>
  );
}

// 💠 SINGULARITY — a neon diamond with circuit traces to four nodes and a core.
function SingularityEmblem({ accent, className }: { accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2 L30 16 L16 30 L2 16 Z" fill={accent} opacity="0.14" />
      <path d="M16 2 L30 16 L16 30 L2 16 Z" fill="none" stroke={accent} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 8.5 L23.5 16 L16 23.5 L8.5 16 Z" fill="none" stroke={accent} strokeWidth="1" opacity="0.5" />
      <line x1="16" y1="16" x2="16" y2="4" stroke={accent} strokeWidth="1" opacity="0.7" />
      <line x1="16" y1="16" x2="28" y2="16" stroke={accent} strokeWidth="1" opacity="0.7" />
      <line x1="16" y1="16" x2="16" y2="28" stroke={accent} strokeWidth="1" opacity="0.7" />
      <line x1="16" y1="16" x2="4" y2="16" stroke={accent} strokeWidth="1" opacity="0.7" />
      <circle cx="16" cy="3.4" r="1.5" fill={accent} />
      <circle cx="28.6" cy="16" r="1.5" fill={accent} />
      <circle cx="16" cy="28.6" r="1.5" fill={accent} />
      <circle cx="3.4" cy="16" r="1.5" fill={accent} />
      <circle cx="16" cy="16" r="3" fill="#0c0e15" stroke={accent} strokeWidth="1.2" />
      <circle cx="16" cy="16" r="1.3" fill={accent} />
    </svg>
  );
}

// 🕴️ AGENCY — a hexagonal crest with an inner barcode stripe motif.
function AgencyEmblem({ accent, className }: { accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <clipPath id="hlHexClip">
          <polygon points="16,2 28.1,9 28.1,23 16,30 3.9,23 3.9,9" />
        </clipPath>
      </defs>
      <polygon
        points="16,2 28.1,9 28.1,23 16,30 3.9,23 3.9,9"
        fill="#0c0e15"
        stroke={accent}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <g clipPath="url(#hlHexClip)">
        <rect x="7.5" y="4" width="1.5" height="24" fill={accent} opacity="0.85" />
        <rect x="10.2" y="4" width="2.3" height="24" fill={accent} opacity="0.55" />
        <rect x="13.6" y="4" width="1" height="24" fill={accent} opacity="0.9" />
        <rect x="15.6" y="4" width="2.6" height="24" fill={accent} opacity="0.5" />
        <rect x="19.4" y="4" width="1.3" height="24" fill={accent} opacity="0.85" />
        <rect x="21.8" y="4" width="1" height="24" fill={accent} opacity="0.7" />
      </g>
      <polygon
        points="16,2 28.1,9 28.1,23 16,30 3.9,23 3.9,9"
        fill="none"
        stroke={accent}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Belt-and-suspenders default (theme keys are stable; should never render).
function DefaultEmblem({ accent, className }: { accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="none" stroke={accent} strokeWidth="2" />
      <circle cx="16" cy="16" r="3.5" fill={accent} />
    </svg>
  );
}

function FactionEmblem({ teamKey, accent, className }: { teamKey: string; accent: string; className?: string }) {
  if (teamKey === "alpha") return <FrontierEmblem accent={accent} className={className} />;
  if (teamKey === "beta") return <SingularityEmblem accent={accent} className={className} />;
  if (teamKey === "gamma") return <AgencyEmblem accent={accent} className={className} />;
  return <DefaultEmblem accent={accent} className={className} />;
}

// ── Lock glyph (sealed contracts) ────────────────────────────────────────────
// A small padlock over a sealed contract's portrait: the board is closed to
// this mark until it unseals. Colored via currentColor.
function LockGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <rect x="3.4" y="7" width="9.2" height="6.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 7 V5.1 a2.5 2.5 0 0 1 5 0 V7" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="9.7" r="1.15" fill="currentColor" />
      <rect x="7.4" y="10" width="1.2" height="2.4" rx="0.6" fill="currentColor" />
    </svg>
  );
}

// ── Agent silhouettes (the member markers; the Beach towel contract) ────────
// Girl art drops in via agent-<key>.png; until then, era-accented hooded and
// hatted vector silhouettes: alpha wide-brim hat, beta cyber visor and
// antenna, gamma fedora and trench. Tiny on purpose: a headcount, not portraits.
function AgentFallback({ teamKey, accent, className }: { teamKey: string; accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 26" className={className} aria-hidden="true">
      <path
        d="M10 10 C5.5 10 3.5 14 3.5 19 L3.5 26 L16.5 26 L16.5 19 C16.5 14 14.5 10 10 10 Z"
        fill="#14161f"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="0.6"
      />
      <circle cx="10" cy="6.2" r="3.6" fill="#181b26" />
      {teamKey === "alpha" && (
        <>
          <ellipse cx="10" cy="4.4" rx="6.6" ry="1.7" fill={accent} />
          <path d="M6.8 4.4 Q10 -1.2 13.2 4.4 Z" fill={accent} />
          <rect x="8.2" y="12.5" width="3.6" height="1.4" rx="0.7" fill={accent} opacity="0.8" />
        </>
      )}
      {teamKey === "beta" && (
        <>
          <rect x="6" y="5.2" width="8" height="1.9" rx="0.95" fill={accent} />
          <line x1="12.6" y1="3" x2="14" y2="0.8" stroke={accent} strokeWidth="0.9" strokeLinecap="round" />
          <circle cx="14.2" cy="0.7" r="0.8" fill={accent} />
          <circle cx="10" cy="13.5" r="1.1" fill={accent} opacity="0.85" />
        </>
      )}
      {teamKey === "gamma" && (
        <>
          <rect x="3.6" y="4.2" width="12.8" height="1.7" rx="0.85" fill={accent} />
          <rect x="6.6" y="0.6" width="6.8" height="4" rx="1" fill={accent} />
          <rect x="9.4" y="11" width="1.2" height="7" rx="0.6" fill={accent} opacity="0.8" />
        </>
      )}
      {teamKey !== "alpha" && teamKey !== "beta" && teamKey !== "gamma" && (
        <path d="M5 6 Q10 -2 15 6 L15 9 Q10 6 5 9 Z" fill={accent} />
      )}
    </svg>
  );
}

// ── Round player-portrait fallback (missing agent art) ─────────────────────
// A neutral head-and-shoulders bust that FILLS a round portrait (slice), for
// when a player's art file has not landed yet. The team-accent ring lives on
// the portrait frame, so the silhouette itself stays quiet; it reads as a
// generic agent, never a broken image. Used inside the map portraits and the
// player card, via the same ArtSprite fallback hook.
function AgentPortraitFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="40" height="40" fill="#141826" />
      <circle cx="20" cy="15.5" r="7.4" fill="#2b3143" />
      <path d="M5 40 C5 29.5 11.4 24.5 20 24.5 C28.6 24.5 35 29.5 35 40 Z" fill="#2b3143" />
    </svg>
  );
}

// ── The TIME MACHINE centerpiece (art slot timemachine.png) ─────────────────
// An ORIGINAL temporal booth: charcoal capsule with gold trim, a pulsing
// white-gold core seam, an embedded clock dial with live hands, two
// counter-rotating chrono rings, and a crimson beacon. Deliberately NOT a
// police box: no blue, no signage, no stacked-window door. All motion lives
// in CSS classes that the reduced-motion query zeroes out.
function TimeMachineFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 170 210" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hlTmBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#262c3b" />
          <stop offset="18%" stopColor="#171b26" />
          <stop offset="50%" stopColor="#12151f" />
          <stop offset="82%" stopColor="#171b26" />
          <stop offset="100%" stopColor="#262c3b" />
        </linearGradient>
        <linearGradient id="hlTmCore" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,244,214,0.95)" />
          <stop offset="45%" stopColor="rgba(240,179,64,0.9)" />
          <stop offset="100%" stopColor="rgba(227,61,78,0.75)" />
        </linearGradient>
      </defs>
      <ellipse cx="85" cy="198" rx="54" ry="7" fill="rgba(0,0,0,0.5)" />
      {/* chrono rings: dashed tick dials, counter-rotating. The four edge
          markers keep the group bbox symmetric so fill-box centers cleanly. */}
      <g className="hl-tm-ring-a">
        <circle cx="85" cy="112" r="76" fill="none" stroke="rgba(240,179,64,0.35)" strokeWidth="1.2" strokeDasharray="2 10" />
        <circle cx="85" cy="36" r="2" fill={GOLD} opacity="0.8" />
        <circle cx="161" cy="112" r="2" fill={GOLD} opacity="0.45" />
        <circle cx="85" cy="188" r="2" fill={GOLD} opacity="0.45" />
        <circle cx="9" cy="112" r="2" fill={GOLD} opacity="0.45" />
      </g>
      <g className="hl-tm-ring-b">
        <circle cx="85" cy="112" r="62" fill="none" stroke="rgba(77,216,230,0.28)" strokeWidth="1" strokeDasharray="16 9" />
      </g>
      {/* base platform */}
      <ellipse cx="85" cy="190" rx="44" ry="8.5" fill="#0d0f16" stroke="rgba(240,179,64,0.4)" />
      <ellipse cx="85" cy="186" rx="36" ry="6.5" fill="#12151e" stroke="rgba(240,179,64,0.25)" />
      {/* beacon above the dome */}
      <rect x="81" y="24" width="8" height="8" rx="2" fill="#10131b" stroke="rgba(240,179,64,0.5)" />
      <circle cx="85" cy="28" r="2.6" fill={CRIMSON} className="hl-tm-beacon" />
      <rect x="83.6" y="31" width="2.8" height="4" fill="#10131b" />
      {/* the booth: domed capsule, gold seams and ribs */}
      <path d="M57 186 L57 66 Q57 34 85 34 Q113 34 113 66 L113 186 Z" fill="url(#hlTmBody)" stroke="rgba(240,179,64,0.55)" strokeWidth="1.4" />
      <line x1="71" y1="46" x2="71" y2="184" stroke="rgba(240,179,64,0.14)" />
      <line x1="99" y1="46" x2="99" y2="184" stroke="rgba(240,179,64,0.14)" />
      <line x1="58" y1="146" x2="112" y2="146" stroke="rgba(240,179,64,0.16)" />
      <line x1="58" y1="166" x2="112" y2="166" stroke="rgba(240,179,64,0.16)" />
      {/* the temporal core seam, pulsing */}
      <rect x="77" y="58" width="16" height="100" rx="8" fill="url(#hlTmCore)" className="hl-tm-core" />
      <rect x="77" y="58" width="16" height="100" rx="8" fill="none" stroke="rgba(255,244,214,0.5)" strokeWidth="0.8" />
      {/* embedded clock dial with live hands */}
      <circle cx="85" cy="92" r="11" fill="rgba(7,8,12,0.78)" stroke="rgba(240,179,64,0.7)" strokeWidth="1.2" />
      <line x1="85" y1="82.5" x2="85" y2="85" stroke="rgba(240,179,64,0.6)" strokeWidth="0.9" />
      <line x1="85" y1="99" x2="85" y2="101.5" stroke="rgba(240,179,64,0.6)" strokeWidth="0.9" />
      <line x1="75.5" y1="92" x2="78" y2="92" stroke="rgba(240,179,64,0.6)" strokeWidth="0.9" />
      <line x1="92" y1="92" x2="94.5" y2="92" stroke="rgba(240,179,64,0.6)" strokeWidth="0.9" />
      <line x1="85" y1="92" x2="85" y2="84.5" stroke="#ffe9b8" strokeWidth="1.3" strokeLinecap="round" className="hl-tm-hand-a" />
      <line x1="85" y1="92" x2="85" y2="87" stroke="#ffd27d" strokeWidth="1.6" strokeLinecap="round" className="hl-tm-hand-b" />
      <circle cx="85" cy="92" r="1" fill={GOLD} />
      <circle cx="105" cy="122" r="1.6" fill="rgba(240,179,64,0.7)" />
    </svg>
  );
}

// ── Era energy streams (the time machine feeding the three quadrants) ──────
// Three tapered curves from the core out to each camp ground, stroked in the
// RUNTIME team accent (theme recolors repaint them), with a slow dash flow
// on top (reduced-motion gated). Pure decoration: pointer-events none.
function TimeStreams({ camps }: { camps: Array<{ key: string; accent: string }> }) {
  const cx = VB / 2;
  const cy = VB / 2;
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="none" className="hl-streams" aria-hidden="true">
      <defs>
        {camps.map((c) => {
          const end = STREAM_END[c.key];
          if (!end) return null;
          return (
            <linearGradient
              key={c.key}
              id={`hlStream-${c.key}`}
              gradientUnits="userSpaceOnUse"
              x1={cx}
              y1={cy}
              x2={end.x * VB}
              y2={end.y * VB}
            >
              <stop offset="0%" stopColor={c.accent} stopOpacity="0.5" />
              <stop offset="100%" stopColor={c.accent} stopOpacity="0" />
            </linearGradient>
          );
        })}
      </defs>
      {camps.map((c) => {
        const end = STREAM_END[c.key];
        if (!end) return null;
        const bow = STREAM_BOW[c.key] ?? { x: 0, y: 0 };
        const ex = end.x * VB;
        const ey = end.y * VB;
        const d = `M ${cx} ${cy} Q ${((cx + ex) / 2 + bow.x).toFixed(1)} ${((cy + ey) / 2 + bow.y).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
        return (
          <g key={c.key}>
            <path d={d} fill="none" stroke={`url(#hlStream-${c.key})`} strokeWidth="9" strokeLinecap="round" />
            <path
              d={d}
              fill="none"
              stroke={c.accent}
              strokeWidth="2.2"
              opacity="0.8"
              strokeLinecap="round"
              strokeDasharray="3 27"
              className="hl-stream-flow"
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── Unknown-mark reticle (the contract-card portrait fallback) ─────────────
// When a mark portrait (mark-<n>.png) is missing, the card shows a dashed
// crimson targeting reticle over a dark bust silhouette: an unidentified mark.
function ReticleFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 76" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="100" height="76" fill="#0c0e15" />
      <path
        d="M50 22 C43.5 22 40 27 40 33.5 C40 38 42 41.5 45 43.5 C38 46 33.5 52 33.5 60 L33.5 76 L66.5 76 L66.5 60 C66.5 52 62 46 55 43.5 C58 41.5 60 38 60 33.5 C60 27 56.5 22 50 22 Z"
        fill="#151824"
      />
      <circle cx="50" cy="38" r="24" fill="none" stroke={CRIMSON} strokeOpacity="0.7" strokeWidth="1.6" strokeDasharray="6 5" />
      <circle cx="50" cy="38" r="10" fill="none" stroke="rgba(240,179,64,0.55)" strokeWidth="1" />
      <line x1="50" y1="6" x2="50" y2="17" stroke={CRIMSON} strokeOpacity="0.7" strokeWidth="1.4" />
      <line x1="50" y1="59" x2="50" y2="70" stroke={CRIMSON} strokeOpacity="0.7" strokeWidth="1.4" />
      <line x1="18" y1="38" x2="29" y2="38" stroke={CRIMSON} strokeOpacity="0.7" strokeWidth="1.4" />
      <line x1="71" y1="38" x2="82" y2="38" stroke={CRIMSON} strokeOpacity="0.7" strokeWidth="1.4" />
      <circle cx="50" cy="38" r="1.8" fill={CRIMSON} />
    </svg>
  );
}

// ── Wax-seal progress ring ──────────────────────────────────────────────────
// The contract's ONLY progress display on the stage: a ring of status color
// filling clockwise around a crimson wax center. Upward-only by contract
// (progress comes from the server bond curve and never regresses on this
// surface); a closed contract shows the full ring plus a gold star.
function SealRing({ frac, color, closed }: { frac: number; color: string; closed: boolean }) {
  const R = 13;
  const C = 2 * Math.PI * R;
  const f = closed ? 1 : Math.max(0, Math.min(1, frac));
  return (
    <svg viewBox="0 0 34 34" className="hl-seal" aria-hidden="true">
      <circle cx="17" cy="17" r={R} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
      {f > 0 && (
        <circle
          cx="17"
          cy="17"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(C * f).toFixed(2)} ${C.toFixed(2)}`}
          transform="rotate(-90 17 17)"
        />
      )}
      <circle cx="17" cy="17" r="7.5" fill="#8e1f2c" stroke="#5d141d" strokeWidth="1.2" />
      <path d="M12.5 13.5 A7 7 0 0 1 20 11" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" strokeLinecap="round" />
      {closed && (
        <text x="17" y="21" textAnchor="middle" fill={GOLD} fontSize="9.5" fontFamily="ui-sans-serif, system-ui, sans-serif">
          ✦
        </text>
      )}
    </svg>
  );
}

// ── Agency quadrant scenery: the noir city skyline (deterministic) ─────────
// Two building bands: far (blurred, quiet) and near (lit windows in gold and
// ice). Clipped by the TOP triangle so the city recedes into the seams.
const FAR_BUILDINGS: Array<[number, number, number]> = [
  // [x, width, height-from-baseline]
  [0, 52, 120], [52, 34, 88], [86, 44, 150], [130, 26, 66], [156, 48, 120],
  [204, 38, 170], [242, 30, 96], [272, 52, 134], [324, 36, 74], [360, 46, 152],
  [406, 30, 104], [436, 54, 140], [490, 34, 86], [524, 46, 166], [570, 30, 90],
  [600, 52, 126], [652, 48, 100],
];
const NEAR_BUILDINGS: Array<[number, number, number]> = [
  [0, 64, 96], [70, 42, 140], [118, 58, 80], [182, 40, 120], [228, 64, 160],
  [298, 44, 90], [348, 60, 130], [414, 36, 70], [456, 66, 150], [528, 44, 100],
  [578, 58, 128], [642, 58, 84],
];
// [x, y, palette] — palette 0 = gold window, 1 = ice window.
const NEAR_WINDOWS: Array<[number, number, number]> = [
  [78, 72, 0], [90, 88, 1], [78, 104, 0], [98, 120, 0],
  [190, 92, 1], [204, 108, 0], [190, 124, 0],
  [238, 52, 0], [254, 52, 1], [270, 68, 0], [238, 84, 1], [262, 100, 0], [246, 116, 0],
  [356, 82, 1], [372, 98, 0], [388, 114, 1], [360, 130, 0],
  [466, 62, 0], [482, 78, 1], [498, 94, 0], [466, 110, 0], [490, 126, 1],
  [586, 84, 0], [602, 100, 1], [614, 116, 0],
];

function Skyline() {
  return (
    <>
      <svg viewBox="0 0 700 240" preserveAspectRatio="none" className="hl-skyline hl-skyline--far" aria-hidden="true">
        {FAR_BUILDINGS.map(([x, w, h]) => (
          <rect key={x} x={x} y={240 - h} width={w} height={h} fill="#0d1322" />
        ))}
        <line x1="223" y1="70" x2="223" y2="52" stroke="#0d1322" strokeWidth="2" />
        <line x1="547" y1="74" x2="547" y2="56" stroke="#0d1322" strokeWidth="2" />
      </svg>
      <svg viewBox="0 0 700 200" preserveAspectRatio="none" className="hl-skyline hl-skyline--near" aria-hidden="true">
        {NEAR_BUILDINGS.map(([x, w, h]) => (
          <rect key={x} x={x} y={200 - h} width={w} height={h} fill="#060810" />
        ))}
        <line x1="260" y1="40" x2="260" y2="22" stroke="#060810" strokeWidth="2.4" />
        <circle cx="260" cy="21" r="2" fill="rgba(227,61,78,0.8)" />
        <line x1="489" y1="50" x2="489" y2="34" stroke="#060810" strokeWidth="2.4" />
        {NEAR_WINDOWS.map(([x, y, p]) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="5"
            height="6"
            fill={p === 0 ? "rgba(240,179,64,0.5)" : "rgba(77,216,230,0.42)"}
          />
        ))}
      </svg>
    </>
  );
}

// ── Frontier quadrant scenery: sunset mesas, a cactus, a fence line ────────
function FrontierScene() {
  return (
    <svg viewBox="0 0 320 340" preserveAspectRatio="none" className="hl-frontier" aria-hidden="true">
      <circle cx="34" cy="190" r="30" fill="rgba(255,170,80,0.30)" />
      <circle cx="34" cy="190" r="18" fill="rgba(255,200,120,0.30)" />
      <path d="M0 250 L38 250 L52 204 L96 204 L110 250 L150 250 L162 222 L196 222 L208 250 L320 250 L320 340 L0 340 Z" fill="#20100a" />
      <path d="M0 260 L320 260 L320 340 L0 340 Z" fill="#190c07" />
      {/* cactus */}
      <rect x="238" y="216" width="7" height="36" rx="3.5" fill="#1c1208" />
      <rect x="228" y="224" width="5" height="12" rx="2.5" fill="#1c1208" />
      <rect x="228" y="222" width="12" height="5" rx="2.5" fill="#1c1208" />
      <rect x="250" y="230" width="5" height="10" rx="2.5" fill="#1c1208" />
      <rect x="245" y="228" width="10" height="5" rx="2.5" fill="#1c1208" />
      {/* fence posts */}
      {[24, 60, 96, 132].map((x) => (
        <rect key={x} x={x} y={272} width="4" height="20" fill="#241207" />
      ))}
      <rect x="20" y="277" width="120" height="3" fill="#241207" />
    </svg>
  );
}

// ── Singularity quadrant scenery: a violet warp grid from the apex ─────────
// Rays and arcs radiate from the triangle's apex (the stage center), so the
// grid reads as space folding toward the time machine.
function SingularityGrid() {
  const rays = [0, 84, 168, 250, 332, 416, 500];
  const arcs = [110, 190, 275];
  return (
    <svg viewBox="0 0 350 500" preserveAspectRatio="none" className="hl-singularity" aria-hidden="true">
      {rays.map((y) => (
        <line key={y} x1="0" y1="250" x2="350" y2={y} stroke={VIOLET} strokeOpacity="0.12" strokeWidth="1" />
      ))}
      {arcs.map((r) => (
        <circle key={r} cx="0" cy="250" r={r} fill="none" stroke={VIOLET} strokeOpacity="0.09" strokeWidth="1" />
      ))}
      <rect x="252" y="128" width="9" height="9" rx="2" fill={VIOLET} opacity="0.28" transform="rotate(45 256.5 132.5)" />
      <rect x="286" y="352" width="7" height="7" rx="2" fill={VIOLET} opacity="0.22" transform="rotate(45 289.5 355.5)" />
    </svg>
  );
}

// ── Diagonal seams: the two cuts that read as "four triangles" ─────────────
function SeamLines() {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="none" className="hl-seams" aria-hidden="true">
      <line x1="0" y1="0" x2={VB} y2={VB} stroke="rgba(240,179,64,0.05)" strokeWidth="7" />
      <line x1={VB} y1="0" x2="0" y2={VB} stroke="rgba(240,179,64,0.05)" strokeWidth="7" />
      <line x1="0" y1="0" x2={VB} y2={VB} stroke="rgba(240,179,64,0.22)" strokeWidth="1.4" />
      <line x1={VB} y1="0" x2="0" y2={VB} stroke="rgba(240,179,64,0.22)" strokeWidth="1.4" />
    </svg>
  );
}

// ── Red string layer (dossier to dossier along the contracts fan) ──────────
// Quadratic curves with a small sag so the string reads as thread, not a
// diagram edge. Ends hide under the plates (plates render above), and each
// plate carries its own pin dot, so the connection reads pinned.
function StringChain({ points }: { points: Array<{ x: number; y: number }> }) {
  if (points.length < 2) return null;
  const seg = (x1: number, y1: number, x2: number, y2: number, sag: number) =>
    `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2 + sag).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="none" className="hl-strings" aria-hidden="true">
      {points.slice(0, -1).map((p, i) => {
        const q = points[i + 1];
        return (
          <path
            key={`s${i}`}
            d={seg(p.x * VB, p.y * VB, q.x * VB, q.y * VB, 16)}
            fill="none"
            stroke={CRIMSON}
            strokeWidth="1.5"
            opacity="0.55"
          />
        );
      })}
      {points.length >= 3 && (
        <path
          d={seg(first.x * VB, first.y * VB, last.x * VB, last.y * VB, 34)}
          fill="none"
          stroke={CRIMSON}
          strokeWidth="1.1"
          opacity="0.25"
        />
      )}
    </svg>
  );
}

export function HitListMap({ snap, poolLineText }: { snap: Snapshot; poolLineText: string }) {
  const t = snap.theme;
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const [openCamp, setOpenCamp] = useState<string | null>(null);
  // The open player card is keyed by rank (unique 1..20 across the board).
  const [openPlayer, setOpenPlayer] = useState<number | null>(null);
  const closeAll = () => {
    setOpenTarget(null);
    setOpenCamp(null);
    setOpenPlayer(null);
  };

  // ── Pan / zoom / fullscreen: the stars-map feature, DOM edition ───────────
  // The stage is the "world"; a viewport clips it. Wheel + pinch zoom toward the
  // cursor, drag to pan, buttons for touch, one tap for fullscreen. A 6px move
  // threshold keeps a plain tap opening cards. No new assets → load unchanged;
  // detail is bounded only by the art resolution already loaded.
  const ZMIN = 1;
  const ZMAX = 3.5;
  const vpRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [full, setFull] = useState(false);
  const drag = useRef({ id: -1, sx: 0, sy: 0, px: 0, py: 0, moved: false });
  const pts = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef({ dist: 0, z: 1 });

  const vpSize = useCallback(() => {
    const r = vpRef.current?.getBoundingClientRect();
    let w = r?.width ?? 0;
    let h = r?.height ?? 0;
    if (full) { const s = Math.min(w, h); w = s; h = s; } // stage is a centered square in fullscreen
    return { w, h };
  }, [full]);
  const clampPan = useCallback((x: number, y: number, z: number) => {
    const { w, h } = vpSize();
    const mx = w * (z - 1);
    const my = h * (z - 1);
    return { x: Math.min(0, Math.max(-mx, x)), y: Math.min(0, Math.max(-my, y)) };
  }, [vpSize]);
  const zoomAt = useCallback((nz: number, cx: number, cy: number) => {
    setZoom((z) => {
      const z2 = Math.min(ZMAX, Math.max(ZMIN, nz));
      setPan((p) => clampPan(p.x - ((cx - p.x) / z) * (z2 - z), p.y - ((cy - p.y) / z) * (z2 - z), z2));
      return z2;
    });
  }, [clampPan]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const r = vpRef.current?.getBoundingClientRect();
    zoomAt(zoom * (1 - e.deltaY * 0.0016), e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) {
      drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false };
    } else if (pts.current.size === 2) {
      const [a, b] = Array.from(pts.current.values());
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size >= 2) {
      const [a, b] = Array.from(pts.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = vpRef.current?.getBoundingClientRect();
      zoomAt(pinch.current.z * (d / pinch.current.dist), (a.x + b.x) / 2 - (r?.left ?? 0), (a.y + b.y) / 2 - (r?.top ?? 0));
      drag.current.moved = true;
      return;
    }
    if (drag.current.id !== e.pointerId) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.current.moved = true;
    if (zoom > 1) setPan(clampPan(drag.current.px + dx, drag.current.py + dy, zoom));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current.dist = 0;
  };
  const onStageClick = () => {
    if (drag.current.moved) { drag.current.moved = false; return; } // a pan, not a tap
    closeAll();
  };
  const stepZoom = (f: number) => {
    const { w, h } = vpSize();
    zoomAt(zoom * f, w / 2, h / 2);
  };
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Camps render in FIXED theme order at FIXED quadrants (alpha LEFT, beta
  // RIGHT, gamma TOP); standings only set the small rank chip, never the
  // position. snap.teams is standings-sorted.
  const rankOf = new Map(snap.teams.map((team, i) => [team.key, i + 1]));
  const camps = t.teams
    .filter((tt) => CAMP_POS[tt.key] !== undefined)
    .map((tt) => {
      const standing = snap.teams.find((x) => x.key === tt.key);
      return {
        key: tt.key,
        name: tt.name,
        accent: tt.accent,
        players: standing?.players ?? 0,
        points: standing?.points ?? 0,
        x: CAMP_POS[tt.key].x,
        y: CAMP_POS[tt.key].y,
      };
    });

  // Top players grouped by team, for the PLAYER PORTRAIT layer. snap.topPlayers
  // is already sorted by Bounty desc, so slicing keeps each team's highest
  // agents; unjoined players (teamKey "") and any team without a camp are
  // skipped, and the per-team cap keeps the plaza from cluttering (only top
  // players ride the map). An empty leaderboard yields empty groups → no layer.
  const playersByTeam = new Map<string, TopPlayer[]>();
  for (const p of snap.topPlayers) {
    if (!p.teamKey || !TEAM_REGION[p.teamKey]) continue;
    const arr = playersByTeam.get(p.teamKey) ?? [];
    if (arr.length < MAX_AGENTS) arr.push(p);
    playersByTeam.set(p.teamKey, arr);
  }

  // Rank-scaled camp aura: the leading team's lead agent burns brightest in its
  // own accent so the board reads at a glance and the top crew feels earned.
  // Pre-season (no Bounty yet) every camp gets the same mid glow, so there is
  // no false leader. Pure light + accent color, no layout shift.
  const leaderPoints = snap.teams[0]?.points ?? 0;
  const raceLive = leaderPoints > 0;
  const GLOW_BY_RANK: Record<number, { px: number; a: string }> = {
    1: { px: 30, a: "cc" },
    2: { px: 20, a: "99" },
    3: { px: 13, a: "66" },
  };
  const glowFor = (key: string) =>
    raceLive ? GLOW_BY_RANK[rankOf.get(key) ?? 3] ?? GLOW_BY_RANK[3] : { px: 18, a: "88" };

  // WANTED-POSTER SCATTER (Mike 2026-07-15): the featured contracts pin to the
  // WOODEN BOUNTY BOARD (the bottom triangle) as hand-tacked wanted posters.
  // The triangle is narrow at its apex and wide at its base, so the posters
  // cluster FEWER-HIGH and MORE-LOW (a 2-over-3 for the usual five) and never
  // run off the bottom edge (the old fan pushed outer cards to y=1.0, off the
  // stage — that was the "misplaced" look). Each gets a small deterministic
  // tilt so it hangs askew like a real town notice board. Indexed by slot so
  // nothing reshuffles run to run; the red string still runs slot to slot.
  const SCATTER5: Array<{ x: number; y: number; r: number }> = [
    { x: 0.385, y: 0.7, r: -3.4 },
    { x: 0.615, y: 0.698, r: 3.0 },
    { x: 0.285, y: 0.815, r: 2.4 },
    { x: 0.5, y: 0.822, r: -1.5 },
    { x: 0.715, y: 0.812, r: 3.2 },
  ];
  const fanPos = (i: number, n: number): { x: number; y: number; r: number } => {
    if (n === 5) return SCATTER5[i];
    // Generic 2-row fallback for any other count: a narrower top row, a wider
    // bottom row, matching the triangle's flare.
    const top = Math.floor(n / 2);
    const inTop = i < top;
    const row = inTop ? { y: 0.71, half: 0.14, k: i, c: top } : { y: 0.82, half: 0.24, k: i - top, c: n - top };
    const x = row.c <= 1 ? 0.5 : 0.5 + (row.k / (row.c - 1) - 0.5) * row.half * 2;
    const r = (i % 2 === 0 ? -1 : 1) * (2 + (i % 3));
    return { x, y: row.y, r };
  };
  // Contracts ALWAYS show. Real targets when the board is seeded; otherwise
  // five sealed placeholder slots so the board never looks barren pre-season.
  const hasTargets = snap.targets.length > 0;
  const contractSlots: Array<{ target: SeasonTarget | null; i: number }> = hasTargets
    ? snap.targets.map((target, i) => ({ target, i }))
    : Array.from({ length: 5 }, (_, i) => ({ target: null, i }));

  // STATUS-GROUPED BOARD (Mike 2026-07-20): ACTIVE contracts big and obvious
  // mid-board; UPCOMING medium and grayed on the row below; CLAIMED (bonded)
  // small in the bottom-LEFT corner; EXPIRED small in the bottom-RIGHT. Scales
  // to any contract count (the Week-2 wave doubles the list). Placeholders
  // (pre-season only) keep the old wanted-poster fan.
  type PlatePos = { x: number; y: number; r: number; scale: number; dim: boolean };
  const spread = (k: number, n: number, cx: number, half: number) =>
    n <= 1 ? cx : cx + (k / (n - 1) - 0.5) * half * 2;
  const platePos = new Map<string, PlatePos>();
  if (hasTargets) {
    const act = snap.targets.filter((x) => x.status === "live");
    const up = snap.targets.filter((x) => x.status === "pending");
    const won = snap.targets.filter((x) => x.status === "bonded");
    const lost = snap.targets.filter((x) => x.status === "failed");
    act.forEach((x, k) => {
      const two = act.length > 4; // one hero row up to 4 actives, two rows beyond
      const rowN = two ? Math.ceil(act.length / 2) : act.length;
      const inTop = k < rowN;
      const rk = inTop ? k : k - rowN;
      const rc = inTop ? rowN : act.length - rowN;
      platePos.set(x.domain, {
        x: spread(rk, rc, 0.5, 0.21),
        y: two ? (inTop ? 0.63 : 0.725) : 0.665,
        r: (k % 2 ? 1 : -1) * (1.5 + (k % 3)),
        scale: 1,
        dim: false,
      });
    });
    up.forEach((x, k) => {
      // Wider spread + lower row so the sealed cards never tuck under the
      // active posters (they overlapped at 0.845/half 0.18).
      platePos.set(x.domain, { x: spread(k, up.length, 0.5, 0.26), y: 0.88, r: (k % 2 ? -1 : 1) * 2, scale: 0.72, dim: true });
    });
    won.forEach((x, k) => {
      platePos.set(x.domain, { x: 0.085 + k * 0.075, y: 0.9, r: -2, scale: 0.45, dim: false });
    });
    lost.forEach((x, k) => {
      platePos.set(x.domain, { x: 0.915 - k * 0.075, y: 0.9, r: 2, scale: 0.45, dim: true });
    });
  }
  const posOf = (slot: { target: SeasonTarget | null; i: number }): PlatePos => {
    const hit = slot.target ? platePos.get(slot.target.domain) : undefined;
    return hit ?? { ...fanPos(slot.i, contractSlots.length), scale: 1, dim: false };
  };
  // The red string runs through the ACTIVE contracts only (the working cases).
  const stringPoints = hasTargets
    ? snap.targets.filter((x) => x.status === "live").map((x) => platePos.get(x.domain)!).filter(Boolean)
    : contractSlots.map((s) => fanPos(s.i, contractSlots.length));
  const wonCount = hasTargets ? snap.targets.filter((x) => x.status === "bonded").length : 0;
  const lostCount = hasTargets ? snap.targets.filter((x) => x.status === "failed").length : 0;

  const targetSub = (target: SeasonTarget): string => {
    const pct = Math.round(target.progress * 100);
    if (target.status === "bonded") return `${t.bondedWord} ✦`;
    if (target.status === "live") return `${pct}% to ${t.bondedWord}`;
    if (target.status === "failed") return `${statusLabel(t, "failed")} this season`;
    if (target.launchAt) {
      const rel = relDays(target.launchAt, snap.nowMs);
      return rel ? `Unseals ${fmtDate(target.launchAt)} · ${rel}` : `Unseals ${fmtDate(target.launchAt)}`;
    }
    return "Unseal date TBA";
  };

  // The poster REWARD is the contract's slice of the PRIZE POOL (the money
  // players actually fight for; the operator table via poolShare) — NOT the
  // bond FDV, which read as a fake "$5,000 reward" (Mike 2026-07-20). Computed
  // server-side in lib/s4/data.ts; formatting only here.
  const worthText = (target: SeasonTarget): string =>
    `$${Math.round(target.poolShare || snap.pool.perBond).toLocaleString("en-US")}`;

  // Background-keyed miniature (transparent cutout) parallel to the poster art,
  // so map portraits sit clean like the S3 ship cutouts. Falls back to the full
  // art if a cutout was not generated for that look (rembg base-look set).
  const cutArt = (a: string) => a.replace("/s4-art/", "/s4-art/cut/");

  // The tapped agent (a centered dossier modal, S3 pilot-card parity). openPlayer
  // holds the rank; look the player up in the shared top-players list.
  const openAgent = openPlayer != null ? snap.topPlayers.find((p) => p.rank === openPlayer) || null : null;
  const shareAgent = (a: TopPlayer) => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/s4/board` : "/s4/board";
    const text = `${a.name} is ${ordinal(a.rank)} on ${teamName(a.teamName)} in ${t.seasonName}.`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: t.seasonName, text, url }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
    }
  };

  return (
    <main className="hl-map">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hl-bg" />

      {openAgent && (
        <div className="hl-agent-modal-bg" onClick={() => setOpenPlayer(null)}>
          {/* Full-bleed personnel card (Mike 2026-07-15: "their full art card like
              in the me command, just different info"). The full poster art covers
              the whole card, top-anchored so the head always frames cleanly (fixes
              the old cropped-in-a-box look); name / team / rank / Bounty overlay on
              scrims, mirroring the /assassin me card with public info. */}
          <div
            className="hl-dossier"
            style={{ borderColor: `${openAgent.accent}66` }}
            onClick={(e) => e.stopPropagation()}
          >
            <ArtSprite
              src={openAgent.art}
              className="hl-dossier-art"
              fallback={<AgentPortraitFallback className="hl-dossier-art" />}
            />
            <div className="hl-dossier-scrim" />
            <button type="button" className="hl-dossier-x" aria-label="Close" onClick={() => setOpenPlayer(null)}>✕</button>
            {/* Flex column: header pinned top, art shows through the flex spacer,
                info pinned bottom. Content lays out in flow so the name/stats can
                never overlap the header, at any card size. Own class prefix
                (hl-dossier*), NOT hl-agent-card* — that name is the small on-map
                tap card (max-width:200px), which was shrinking this modal. */}
            <div className="hl-dossier-body">
              <div className="hl-dossier-top">
                <span className="hl-dossier-season">{t.seasonName}</span>
                <span className="hl-dossier-classified">Classified</span>
              </div>
              <div className="hl-dossier-spacer" />
              <div className="hl-dossier-info">
                <div className="hl-dossier-name">{openAgent.name}</div>
                <div className="hl-dossier-team" style={{ color: openAgent.accent }}>{teamName(openAgent.teamName)}</div>
                <div className="hl-dossier-stats">
                  <div className="hl-dossier-stat"><b>{ordinal(openAgent.rank)}</b><span>Rank</span></div>
                  <div className="hl-dossier-stat"><b>{openAgent.points.toLocaleString("en-US")}</b><span>{t.points}</span></div>
                </div>
                <button type="button" className="hl-dossier-share" onClick={() => shareAgent(openAgent)}>Share this {t.player.singular}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="hl-shell">
        <header className="hl-head">
          <Link href="/s4" className="hl-back">
            ‹ Season 4
          </Link>
          <div className="hl-title">
            <p className="hl-eyebrow">{t.seasonName}</p>
            <h1>The Hit List</h1>
          </div>
          <div className="hl-tally">
            <span className="hl-tally-num">
              {snap.totals.bonded}
              <span className="hl-tally-slash">/{snap.totals.total}</span>
            </span>
            <span className="hl-tally-lbl">
              {t.target.plural} {t.bondedWord.toLowerCase()}
            </span>
          </div>
        </header>

        {!snap.empty && <div className="hl-pool-line">{poolLineText}</div>}
        <SeasonCountdown
          launchAt={snap.season.launchAt}
          endAt={snap.season.endAt}
          serverNowMs={snap.nowMs}
        />

        <div className="hl-board">
          {/* The STANDINGS rail: always visible, LEFT of the board on desktop
              (>=1100px), a tight horizontal strip ABOVE the board below that.
              Team aggregates only (the snapshot carries no per-player rows).
              Rows share the camp tap-card, so the rail is also navigation. */}
          <aside className="hl-rail" aria-label={`${t.team.singular} standings`}>
            <span className="hl-rail-title">Standings</span>
            <div className="hl-rail-teams">
              {snap.teams.map((team, idx) => (
                <button
                  key={team.key}
                  type="button"
                  className="hl-rail-row"
                  aria-label={`${teamName(team.name)} · ${ordinal(idx + 1)} · ${team.points.toLocaleString("en-US")} ${t.points}`}
                  onClick={() => {
                    setOpenTarget(null);
                    setOpenPlayer(null);
                    setOpenCamp(openCamp === team.key ? null : team.key);
                  }}
                >
                  <span className="hl-rail-bar" style={{ background: team.accent }} />
                  <span className="hl-rail-rank">{idx + 1}</span>
                  <FactionEmblem teamKey={team.key} accent={team.accent} className="hl-rail-emblem" />
                  <span className="hl-rail-body">
                    <span className="hl-rail-name" style={{ color: team.accent }}>
                      {teamName(team.name)}
                    </span>
                    <span className="hl-rail-bounty">
                      <b className="hl-rail-bounty-n">{team.points.toLocaleString("en-US")}</b>
                      <span className="hl-rail-bounty-l">{t.points}</span>
                    </span>
                    <span className="hl-rail-count">
                      {team.players} {team.players === 1 ? t.player.singular : t.player.plural}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {/* INDIVIDUAL STANDINGS (Mike 2026-07-15, S3 parity — "people love
                seeing the individuals"): the top agents by Bounty, tappable to
                the same centered dossier modal the map portraits open. */}
            {snap.topPlayers.length > 0 && (
              <div className="hl-rail-agents">
                <span className="hl-rail-subtitle">Top {t.player.plural}</span>
                <ol className="hl-rail-agentlist">
                  {snap.topPlayers.slice(0, 10).map((p) => (
                    <li key={p.rank}>
                      <button
                        type="button"
                        className={`hl-rail-agent${openPlayer === p.rank ? " is-open" : ""}`}
                        aria-label={`${p.name}, ${ordinal(p.rank)}, ${p.points.toLocaleString("en-US")} ${t.points}`}
                        onClick={() => {
                          setOpenCamp(null);
                          setOpenTarget(null);
                          setOpenPlayer(openPlayer === p.rank ? null : p.rank);
                        }}
                      >
                        <span className="hl-rail-agent-rank">{p.rank}</span>
                        <span className="hl-rail-agent-dot" style={{ background: p.accent, color: p.accent }} />
                        <span className="hl-rail-agent-name">{p.name}</span>
                        <span className="hl-rail-agent-pts">{p.points.toLocaleString("en-US")}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {!snap.empty && (
              <div className="hl-rail-foot">
                <span className="hl-rail-stat">
                  <em>{snap.totals.bonded}</em> of {snap.totals.total} {t.target.plural.toLowerCase()}{" "}
                  {t.bondedWord.toLowerCase()}
                </span>
                <span className="hl-rail-pool">{poolLineText}</span>
              </div>
            )}
          </aside>

          <div
            className={`hl-viewport${full ? " hl-viewport--full" : ""}`}
            ref={vpRef}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
          <section
            className="hl-stage"
            aria-label="The hit list"
            onClick={onStageClick}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
          {/* The four era quadrants: SQUARE cut by its diagonals. Each
              triangle paints its own era scene (all decorative); the painted
              backdrop (map/bg.png) covers all four when the art lands. */}
          <div className="hl-quads" aria-hidden>
            {/* Painted era plates cover each triangle (object-fit cover,
                clipped by the quadrant clip-path, darkened by the hl-quad-art
                filter so state reads on top). A missing file renders nothing
                and the vector scene beneath stays — the built-in fallback.
                The searchlight and rain overlays stay ABOVE the noir plate. */}
            <div className="hl-quad hl-quad--top">
              <Skyline />
              <ArtSprite src={`${ART_BASE}/quadrant-noir.png`} className="hl-quad-art" fallback={null} />
              <span className="hl-search" />
              <span className="hl-rain" />
            </div>
            <div className="hl-quad hl-quad--left">
              <FrontierScene />
              <ArtSprite src={`${ART_BASE}/quadrant-west.png`} className="hl-quad-art" fallback={null} />
            </div>
            <div className="hl-quad hl-quad--right">
              <SingularityGrid />
              <ArtSprite src={`${ART_BASE}/quadrant-future.png`} className="hl-quad-art" fallback={null} />
            </div>
            <div className="hl-quad hl-quad--bottom">
              <ArtSprite src={`${ART_BASE}/dossier-felt.png`} className="hl-quad-art hl-quad-art--felt" fallback={null} />
            </div>
          </div>
          <ArtSprite src={`${ART_BASE}/bg.png`} className="hl-bg-art" fallback={null} />

          {/* THE BOUNTY BOARD: the bottom triangle is a WOODEN notice board the
              wanted posters pin to (Mike 2026-07-15). CSS planks by default; a
              painted board-wood.png upgrades it in place when it lands. Clipped
              to the bottom triangle so it never touches the three camp eras. */}
          <div className="hl-board-wood" aria-hidden>
            <ArtSprite src={`${ART_BASE}/board-wood.png`} className="hl-board-wood-art" fallback={null} />
          </div>

          <SeamLines />

          {/* Ground ambients: each team quadrant takes ITS camp's runtime
              accent (theme recolors repaint the quadrant with zero code
              change); the contracts floor glows faint crimson. */}
          <div className="hl-zones" aria-hidden>
            {camps.map((camp) => (
              <span
                key={camp.key}
                className={`hl-zone ${ZONE_CLASS[camp.key] ?? "hl-zone--top"}`}
                style={{
                  background: `radial-gradient(ellipse 58% 46% at 50% 50%, ${camp.accent}42, transparent 72%)`,
                }}
              />
            ))}
            <span
              className="hl-zone hl-zone--pool"
              style={{
                background: `radial-gradient(ellipse 58% 46% at 50% 60%, ${CRIMSON}2e, transparent 72%)`,
              }}
            />
          </div>

          {/* Era energy streams and the contracts red string, under the
              time machine, camps and plates. */}
          <TimeStreams camps={camps} />
          <StringChain points={stringPoints} />

          {/* CENTER: the time machine. Decorative, never interactive. */}
          <div className="hl-tm">
            <span className="hl-tm-glow" aria-hidden />
            <ArtSprite
              src={`${ART_BASE}/timemachine.png`}
              className="hl-tm-art"
              fallback={<TimeMachineFallback className="hl-tm-art" />}
            />
          </div>

          {/* The contracts quadrant label (the other three quadrants are
              labeled by their camp names). */}
          <span className="hl-quad-label">{t.target.plural}</span>

          {/* QUADRANTS: the three team camps (top / left / right). */}
          {camps.map((camp) => {
            const isOpen = openCamp === camp.key;
            const cardAbove = camp.y > 0.6;
            return (
              <div
                key={camp.key}
                className={`hl-camp${isOpen ? " is-raised" : ""}`}
                style={{ left: `${camp.x * 100}%`, top: `${camp.y * 100}%` }}
              >
                <button
                  type="button"
                  className="hl-camp-btn"
                  aria-label={`${camp.name} camp standings`}
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenTarget(null);
                    setOpenPlayer(null);
                    setOpenCamp(isOpen ? null : camp.key);
                  }}
                >
                  <span
                    className="hl-camp-glow"
                    style={{ background: `radial-gradient(ellipse, ${camp.accent}${glowFor(camp.key).a} 0%, transparent 68%)` }}
                  />
                  <span className="hl-camp-label">
                    <FactionEmblem teamKey={camp.key} accent={camp.accent} className="hl-camp-emblem" />
                    <span className="hl-camp-name" style={{ color: camp.accent }}>
                      {teamName(camp.name)}
                    </span>
                  </span>
                  {/* Camps are the EMBLEM + team name only (Mike): no character
                      icons. Individual agents live on the TOP AGENTS leaderboard
                      (/s4/board), each with their own card. */}
                  <span className="hl-camp-count">
                    {camp.players > 0
                      ? `${camp.players} ${camp.players === 1 ? t.player.singular : t.player.plural}`
                      : `recruiting ${t.player.plural}`}
                  </span>
                </button>

                {isOpen && (
                  <div
                    className={`hl-card${cardAbove ? " hl-card--above" : ""}`}
                    style={{ borderColor: `${camp.accent}55` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="hl-card-name" style={{ color: camp.accent }}>
                      {teamName(camp.name)}
                    </span>
                    <span className="hl-card-sub">
                      {ordinal(rankOf.get(camp.key) || camps.length)} of {camps.length} ·{" "}
                      {camp.players} {camp.players === 1 ? t.player.singular : t.player.plural}
                    </span>
                    <span className="hl-card-big">
                      {camp.points.toLocaleString("en-US")} <em>{t.points}</em>
                    </span>
                    <span className="hl-card-foot">
                      Season-end {t.team.singular} shares follow {t.points}.
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* PLAYER AGENTS: the top players as small round portraits clustered
              in the OPEN PLAZA beside their team camp (an OFFSET from the camp
              center, so they never cover the emblem or name). Each is a button
              that opens a compact card with the agent name, team, rank and
              Bounty. NEVER a wallet, never a dollar amount. Only top players
              ride the map (snap.topPlayers, capped per team); an empty
              leaderboard renders nothing. */}
          {camps.map((camp) => {
            const region = TEAM_REGION[camp.key];
            const players = playersByTeam.get(camp.key);
            if (!region || !players || players.length === 0) return null;
            const teamRaised = players.some((p) => p.rank === openPlayer);
            const more = Math.max(0, camp.players - players.length);
            // Scatter every agent across the team's flat plaza (Halton = even, no
            // clumping); perspective sizes by depth; rank 1 largest + haloed.
            const scatter = players.map((p, i) => {
              const u = halton(i + 2, 2);
              const v = halton(i + 2, 3);
              const x = region.cx + (u - 0.5) * 2 * region.rx;
              const y = region.cy + (v - 0.5) * 2 * region.ry;
              const depth = (y - (region.cy - region.ry)) / (2 * region.ry); // 0 back .. 1 front
              const scale = i === 0 ? 1.24 : 0.6 + depth * 0.42;
              return { p, i, x, y, scale };
            });
            // Paint back-to-front so nearer (lower) agents overlap the far ones.
            scatter.sort((A, B) => A.y - B.y);
            return (
              <div
                key={`agents-${camp.key}`}
                className={`hl-agents-cluster${teamRaised ? " is-raised" : ""}`}
              >
                {scatter.map(({ p, i, x, y, scale }, order) => {
                  const isOpen = openPlayer === p.rank;
                  return (
                    <div
                      key={p.rank}
                      className={`hl-agent-slot${i === 0 ? " is-lead" : ""}${isOpen ? " is-open" : ""}`}
                      style={{
                        left: `${(x * 100).toFixed(2)}%`,
                        top: `${(y * 100).toFixed(2)}%`,
                        zIndex: isOpen ? 200 : 100 + order,
                        ["--scale" as string]: scale,
                      } as React.CSSProperties}
                    >
                      <button
                        type="button"
                        className="hl-agent-portrait"
                        style={{ ["--accent" as string]: p.accent } as React.CSSProperties}
                        aria-label={`${p.name}, ${teamName(p.teamName)}, ${ordinal(p.rank)}`}
                        aria-expanded={isOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenCamp(null);
                          setOpenTarget(null);
                          setOpenPlayer(isOpen ? null : p.rank);
                        }}
                      >
                        <ArtSprite
                          src={cutArt(p.art)}
                          className="hl-agent-img"
                          fallback={<ArtSprite src={p.art} className="hl-agent-img" fallback={<AgentPortraitFallback className="hl-agent-img" />} />}
                        />
                      </button>
                    </div>
                  );
                })}
                {more > 0 && (
                  <span
                    className="hl-agent-more"
                    style={{ left: `${(region.cx * 100).toFixed(2)}%`, top: `${(region.cy + region.ry) * 100 + 1.2}%` }}
                  >
                    +{more}
                  </span>
                )}
              </div>
            );
          })}

          {/* CONTRACTS: always rendered. LIVE = a bright active card (mark
              portrait, progress ring, worth). PENDING = a dim SEALED card (wax
              seal intact, a lock glyph, the sealed label). BONDED = the CLOSED
              stamp. Placeholders fill in pre-season so the board never looks
              barren; each is captioned below. */}
          {/* Corner group captions (Mike 2026-07-20): claimed left, expired right. */}
          {wonCount > 0 && (
            <div className="hl-corner-cap" style={{ left: "8.5%", top: "84.2%" }}>
              Claimed
            </div>
          )}
          {lostCount > 0 && (
            <div className="hl-corner-cap hl-corner-cap--lost" style={{ right: "8.5%", top: "84.2%" }}>
              Expired
            </div>
          )}
          {contractSlots.map((slot) => {
            const pos = posOf(slot);
            const target = slot.target;

            // Pre-season placeholder: a dim, locked, sealed slot (non-interactive).
            if (!target) {
              return (
                <div
                  key={`ph-${slot.i}`}
                  className="hl-plate"
                  style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, ["--tilt" as string]: `${pos.r}deg` } as React.CSSProperties}
                >
                  <div className="hl-plate-btn is-sealed is-placeholder" aria-hidden>
                    <span className="hl-poster-hd">Wanted</span>
                    <span className="hl-poster-sub">Identity sealed</span>
                    <span className="hl-mark">
                      <ReticleFallback className="hl-mark-img" />
                      <SealRing frac={0} color={STATUS_COLOR.pending} closed={false} />
                      <span className="hl-mark-lock">
                        <LockGlyph className="hl-lock-lg" />
                      </span>
                    </span>
                    <span className="hl-plate-body">
                      <span className="hl-plate-name">{t.statusWord.pending}</span>
                    </span>
                  </div>
                </div>
              );
            }

            const color = STATUS_COLOR[target.status];
            const closed = target.status === "bonded";
            const sealed = target.status === "pending";
            const isOpen = openTarget === target.domain;
            const cardAbove = pos.y > 0.62;
            return (
              <div
                key={target.domain}
                className={`hl-plate${isOpen ? " is-raised" : ""}`}
                style={{
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  opacity: pos.dim ? 0.6 : undefined,
                  ["--tilt" as string]: `${pos.r}deg`,
                  ["--pscale" as string]: `${pos.scale}`,
                } as React.CSSProperties}
              >
                <button
                  type="button"
                  className={`hl-plate-btn${isOpen ? " is-open" : ""}${closed ? " is-closed" : ""}${sealed ? " is-sealed" : ""}`}
                  aria-label={`${target.name} · ${statusLabel(t, target.status)}`}
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenCamp(null);
                    setOpenPlayer(null);
                    setOpenTarget(isOpen ? null : target.domain);
                  }}
                >
                  <span className="hl-poster-hd">Wanted</span>
                  <span className="hl-poster-sub">{sealed ? "Identity sealed" : "Bounty contract"}</span>
                  <span className="hl-mark">
                    <ArtSprite
                      src={`${ART_BASE}/mark-${slot.i + 1}.png`}
                      className="hl-mark-img"
                      fallback={<ReticleFallback className="hl-mark-img" />}
                    />
                    <SealRing frac={target.progress} color={color} closed={closed} />
                    {sealed && (
                      <span className="hl-mark-lock">
                        <LockGlyph className="hl-lock-lg" />
                      </span>
                    )}
                  </span>
                  <span className="hl-plate-body">
                    <span className="hl-plate-name">{target.name}</span>
                    {sealed ? (
                      <span className="hl-plate-worth hl-plate-worth--sealed">{targetSub(target)}</span>
                    ) : (
                      <span className="hl-poster-reward"><em>Reward</em><b>{worthText(target)}</b></span>
                    )}
                  </span>
                  {closed && <span className="hl-stamp">{t.bondedWord}</span>}
                </button>

                {isOpen && (
                  <div
                    className={`hl-card${cardAbove ? " hl-card--above" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="hl-card-name">{target.name}</span>
                    <span className="hl-card-sub">{target.domain}</span>
                    <span className="hl-pill" style={{ color, background: `${color}1f`, borderColor: `${color}55` }}>
                      <span className="hl-pill-dot" style={{ background: color }} />
                      {statusLabel(t, target.status)}
                    </span>
                    <span className="hl-card-foot">{targetSub(target)}</span>
                    {/* Prize varies by bond difficulty (ADR-0026): the pricey
                        contracts unlock a bigger slice, so bonding the cheapest
                        is never the play. Only shown when the bond size is known. */}
                    {target.poolShare > 0 && (
                      <span className="hl-card-prize">
                        Bonding this unlocks{" "}
                        <strong>${Math.round(target.poolShare).toLocaleString()}</strong> of the ${POOL_FULL_USD.toLocaleString()} pool.
                      </span>
                    )}
                    {/* The earn example (Mike): plain numbers, no hidden math. */}
                    <span className="hl-card-foot" style={{ color: "#f0b340" }}>
                      {target.status === "pending"
                        ? `When it goes live it pays a fresh bonus: up to ${Math.round(5 * HOLD_RATE_PER_USD_DAY * (1 + FRESH_BONUS))} ${t.points} per $5 a day, easing to ${5 * HOLD_RATE_PER_USD_DAY} over about ${FRESH_WINDOW_DAYS} days. Before tier multipliers.`
                        : `Every $5 held here earns ${Math.round(5 * HOLD_RATE_PER_USD_DAY * freshnessMult(target.launchAt, snap.nowMs))} ${t.points} a day${freshnessMult(target.launchAt, snap.nowMs) > 1.05 ? " (fresh bonus: newer contracts pay more per $5)" : ""}, before tier multipliers.`}
                    </span>
                    {/* The buy path (Mike 2026-07-21): the poster is the storefront —
                        one tap from the map to the Doma buy page. Live = the loud
                        CTA; pending = a quiet listing link; closed/expired = none. */}
                    {target.status === "live" && (
                      <a
                        className="hl-card-buy"
                        href={`https://app.doma.xyz/domain/${target.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Buy on Doma · close this {t.target.singular} →
                      </a>
                    )}
                    {target.status === "pending" && (
                      <a
                        className="hl-card-buy hl-card-buy--quiet"
                        href={`https://app.doma.xyz/domain/${target.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View the listing on Doma →
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!hasTargets && (
            <span className="hl-seal-note">{t.target.plural} post with the season</span>
          )}

          {/* Atmosphere overlays: vignette and film grain (the rain lives
              inside the Agency quadrant). All pointer-events:none. */}
          <span className="hl-vignette" aria-hidden />
          <span className="hl-grain" aria-hidden />

          <span className="hl-hint">
            {full ? "Drag to pan · scroll or pinch to zoom · tap a contract or camp" : "Tap a " + t.target.singular + " for status · a camp for standings · " + String.fromCharCode(10530) + " for fullscreen"}
          </span>
        </section>
          <div className="hl-zoom-ctl" role="group" aria-label="Map zoom">
            <button type="button" onClick={() => stepZoom(1.4)} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => stepZoom(1 / 1.4)} aria-label="Zoom out">&minus;</button>
            <button type="button" onClick={resetView} aria-label="Reset view">&#8635;</button>
            <button type="button" onClick={() => setFull((f) => !f)} aria-label={full ? "Exit fullscreen" : "Fullscreen"}>{full ? "✕" : "⤢"}</button>
          </div>
        </div>
        </div>

        {/* Events strip, reserved for future season events (the old right
            column, relocated below the square board). */}
        <aside className="hl-events" aria-label="Season events">
          <span className="hl-events-title">Events</span>
          <span className="hl-events-copy">
            Nothing on the wire yet. Season events post to this wall when they break.
          </span>
        </aside>

        {/* Mobile legend: the floating dossiers can not fit a narrow viewport,
            so the scene stays clean up top and the details stack here. */}
        <ul className="hl-list" aria-label={t.target.plural}>
          {!hasTargets && (
            <li className="hl-row">
              <span className="hl-row-dot" style={{ background: STATUS_COLOR.pending }} />
              <span className="hl-row-body">
                <span className="hl-row-name">{t.target.plural} post with the season</span>
                <span className="hl-row-sub">
                  The board is sealed until launch. The {t.team.plural} are already in position.
                </span>
              </span>
            </li>
          )}
          {snap.targets.map((target) => {
            const color = STATUS_COLOR[target.status];
            return (
              <li key={target.domain} className="hl-row">
                <span className="hl-row-dot" style={{ background: color }} />
                <span className="hl-row-body">
                  <span className="hl-row-name">{target.name}</span>
                  <span className="hl-row-sub">
                    Worth {worthText(target)} · {targetSub(target)}
                  </span>
                </span>
                <span className="hl-pill" style={{ color, background: `${color}1f`, borderColor: `${color}55` }}>
                  {statusLabel(t, target.status)}
                </span>
              </li>
            );
          })}
        </ul>

        <footer className="hl-foot">
          <p className="hl-foot-copy">{t.pitch}</p>
          <div className="hl-cta">
            <Link href="/s4/board" className="hl-btn hl-btn--gold">
              Status Board
            </Link>
            <Link href="/s4/play" className="hl-btn">
              Games
            </Link>
            <Link href="/s4" className="hl-btn">
              Season home
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* NO BACKTICKS anywhere inside this CSS string, comments included (the S3
   build-break lesson). */
const CSS = `
.hl-map{position:relative;min-height:100vh;overflow:hidden;background:#07080c;color:${UI.text};
  font-family:${UI.sans};}
.hl-bg{position:absolute;inset:0;
  background:radial-gradient(1000px 500px at 50% -10%, #10131f 0%, #07080c 60%);}
.hl-shell{position:relative;z-index:2;max-width:1480px;margin:0 auto;padding:26px 24px 60px;}

.hl-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:10px;}
.hl-back{color:#cdd4e4;text-decoration:none;font-size:14px;font-weight:600;opacity:.85;flex:0 0 auto;
  display:inline-flex;align-items:center;min-height:44px;padding:0 10px;margin:-11px 0 -11px -10px;}
.hl-back:hover{opacity:1;}
.hl-title{text-align:center;flex:1 1 auto;}
.hl-eyebrow{margin:0;letter-spacing:.24em;font-size:11px;text-transform:uppercase;color:#f0b340;}
.hl-title h1{margin:2px 0 0;font-size:clamp(26px,5vw,40px);font-weight:800;letter-spacing:.02em;
  background:linear-gradient(180deg,#fff 0%,#ffb9c0 130%);-webkit-background-clip:text;background-clip:text;color:transparent;}
.hl-tally{flex:0 0 auto;text-align:right;line-height:1;}
.hl-tally-num{font-size:30px;font-weight:800;color:#fff;}
.hl-tally-slash{color:#6b7690;font-weight:700;font-size:20px;}
.hl-tally-lbl{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${UI.faint};margin-top:3px;}
.hl-pool-line{text-align:center;font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:#f0b340;margin:0 0 2px;}

/* ── The board: the standings rail + the square stage ──
   Mobile-first: the rail is a tight horizontal strip ABOVE the board;
   >=1100px it becomes the left column (S3 map parity), grid below. */
.hl-board{display:flex;flex-direction:column;}

/* The rail, noir dossier: charcoal panel, gold rules, crimson accents.
   Rows: an accent bar, a rank number, a faction EMBLEM, the team name on its
   own line, and the bounty value + caption in its own column — nothing ever
   overlaps (a grid on desktop guarantees the columns). */
.hl-rail{display:flex;flex-direction:column;gap:10px;width:100%;max-width:920px;margin:14px auto 0;
  padding:10px 12px;border-radius:16px;background:${UI.panel};backdrop-filter:blur(7px);
  border:1px solid ${UI.border};}
.hl-rail-title{display:none;font-size:11px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;
  color:#f0b340;padding-bottom:9px;border-bottom:1px solid rgba(240,179,64,0.28);}
.hl-rail-teams{display:flex;flex-direction:row;gap:8px;}
.hl-rail-row{position:relative;display:flex;flex:1 1 0;min-width:0;flex-direction:column;align-items:center;
  gap:5px;padding:12px 8px 10px;text-align:center;cursor:pointer;overflow:hidden;
  border-radius:12px;background:rgba(11,12,19,0.6);border:1px solid ${UI.border};
  transition:transform .15s,background .15s;-webkit-tap-highlight-color:transparent;}
.hl-rail-row:hover{transform:translateY(-1px);background:rgba(16,18,30,0.85);}
.hl-rail-bar{position:absolute;left:0;right:0;top:0;height:3px;display:block;opacity:.9;}
.hl-rail-rank{position:absolute;left:8px;top:7px;font-size:10.5px;font-weight:800;color:${UI.faint};}
.hl-rail-emblem{width:30px;height:30px;flex:0 0 auto;display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.55));}
/* Body: the team NAME gets its own full-width line (never fights the bounty);
   the bounty value + caption and the agent count sit BELOW it. */
.hl-rail-body{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;max-width:100%;}
.hl-rail-name{font-weight:800;font-size:12.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hl-rail-bounty{display:flex;align-items:baseline;gap:4px;line-height:1.05;}
.hl-rail-bounty-n{font-size:15px;font-weight:800;color:#fff;}
.hl-rail-bounty-l{font-size:8px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${UI.faint};}
.hl-rail-count{font-size:9.5px;color:${UI.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
.hl-rail-foot{display:none;flex-direction:column;gap:6px;padding-top:9px;
  border-top:1px solid rgba(240,179,64,0.28);}
.hl-rail-stat{font-size:11.5px;color:#cdd4e4;}
.hl-rail-stat em{font-style:normal;font-weight:800;color:#f0b340;}
.hl-rail-pool{font-size:10.5px;color:${UI.muted};line-height:1.55;}

/* Individual standings in the rail (S3 parity): tappable top-agent rows. */
.hl-rail-agents{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:12px;
  border-top:1px solid rgba(240,179,64,0.16);}
.hl-rail-subtitle{font-size:10px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#f0b340;}
.hl-rail-agentlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;}
.hl-rail-agent{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border-radius:8px;
  border:1px solid transparent;background:none;cursor:pointer;text-align:left;
  -webkit-tap-highlight-color:transparent;transition:background .12s,border-color .12s;}
.hl-rail-agent:hover{background:rgba(255,255,255,0.05);}
.hl-rail-agent.is-open{background:rgba(240,179,64,0.1);border-color:rgba(240,179,64,0.3);}
.hl-rail-agent-rank{font-size:10.5px;font-weight:800;color:#8b95ad;min-width:15px;text-align:right;flex:0 0 auto;
  font-variant-numeric:tabular-nums;}
.hl-rail-agent-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 6px currentColor;}
.hl-rail-agent-name{flex:1 1 auto;min-width:0;font-size:12px;font-weight:700;color:#e8ecf5;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hl-rail-agent-pts{flex:0 0 auto;font-size:11px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;}

@media (min-width:1100px){
  /* Small horizontal padding here buys the board its width beside the rail. */
  .hl-shell{padding-left:16px;padding-right:16px;}
  .hl-board{display:grid;grid-template-columns:clamp(200px,16vw,280px) minmax(0,1fr);gap:16px;align-items:start;}
  .hl-rail{position:sticky;top:18px;max-width:none;margin:0;padding:16px 13px;gap:9px;}
  .hl-rail-title{display:block;}
  .hl-rail-teams{flex-direction:column;gap:9px;}
  /* rank | emblem | body(name over bounty over count) — the name owns the
     whole 1fr column so it never clips at a narrow rail. flex:0 0 auto resets
     the mobile flex:1 1 0 so the rows size to content in this column stack
     (otherwise flex-basis:0 collapses the row and clips the emblem/body). */
  .hl-rail-row{display:grid;grid-template-columns:auto 30px minmax(0,1fr);align-items:center;
    flex:0 0 auto;column-gap:8px;row-gap:0;padding:10px 12px;text-align:left;}
  .hl-rail-bar{right:auto;bottom:0;top:0;width:3px;height:auto;}
  .hl-rail-rank{position:static;font-size:12.5px;text-align:center;color:#cdd4e4;}
  .hl-rail-emblem{width:30px;height:30px;}
  .hl-rail-body{align-items:flex-start;gap:1px;}
  .hl-rail-name{font-size:13px;}
  .hl-rail-bounty-n{font-size:16px;}
  .hl-rail-bounty-l{font-size:8.5px;}
  .hl-rail-count{font-size:10px;}
  .hl-rail-foot{display:flex;}
  /* the pool line moves INTO the rail on desktop (no double print) */
  .hl-pool-line{display:none;}
}

/* ── The stage: one SQUARE, four eras, cut on the diagonals. Sized to FILL the
   content area beside the rail (up to ~1150px), not the old 920 cap. ── */
.hl-viewport{position:relative;width:100%;max-width:1150px;aspect-ratio:1/1;margin:10px auto 16px;overflow:hidden;border-radius:22px;touch-action:none;}
.hl-viewport--full{position:fixed;inset:0;margin:auto;width:min(100vw,100vh);height:min(100vw,100vh);max-width:none;aspect-ratio:auto;z-index:9998;border-radius:0;}
.hl-viewport--full::before{content:"";position:fixed;inset:0;background:rgba(4,5,10,0.96);z-index:-1;}
.hl-stage{position:relative;width:100%;height:100%;cursor:grab;transform-origin:0 0;will-change:transform;}
.hl-stage:active{cursor:grabbing;}
.hl-zoom-ctl{position:absolute;right:12px;bottom:12px;z-index:9;display:flex;flex-direction:column;gap:6px;}
.hl-zoom-ctl button{width:38px;height:38px;border-radius:9px;border:1px solid rgba(240,179,64,0.32);background:rgba(9,11,18,0.82);color:#e8ecf5;font-size:18px;font-weight:800;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;}
.hl-zoom-ctl button:hover{background:rgba(240,179,64,0.18);}
/* Painted four-era backdrop (map/bg.png). Above the CSS quadrants, below the
   seams and every interactive layer; slightly darkened so plates and glows
   stay readable. */
.hl-bg-art{position:absolute;inset:0;z-index:1;width:100%;height:100%;object-fit:cover;
  border-radius:22px;pointer-events:none;filter:brightness(0.78) saturate(1.02);}

/* The quadrant container rounds the corners; each triangle clips itself. */
.hl-quads{position:absolute;inset:0;z-index:0;border-radius:22px;overflow:hidden;background:#04050a;}
.hl-quad{position:absolute;inset:0;}
/* TOP 🕴️ the Agency: rainy noir city, ice glass. */
.hl-quad--top{clip-path:polygon(0 0,100% 0,50% 50%);
  background:
    radial-gradient(46% 26% at 50% 24%, rgba(77,216,230,0.10), transparent 70%),
    radial-gradient(30% 14% at 72% 8%, rgba(225,238,255,0.10), transparent 70%),
    linear-gradient(180deg, #05070f 0%, #0a0e1b 55%, #0d1424 100%);}
/* LEFT 🤠 the Frontier: sunset prairie, plank striping. */
.hl-quad--left{clip-path:polygon(0 0,50% 50%,0 100%);
  background:
    radial-gradient(38% 30% at 2% 50%, rgba(255,150,60,0.30), transparent 65%),
    radial-gradient(50% 44% at 12% 50%, rgba(240,179,64,0.12), transparent 70%),
    repeating-linear-gradient(90deg, rgba(58,36,21,0.16) 0 3px, transparent 3px 26px),
    linear-gradient(90deg, #241105 0%, #180c05 55%, #0c0806 100%);}
/* RIGHT 💠 the Singularity: violet holo space. */
.hl-quad--right{clip-path:polygon(100% 0,100% 100%,50% 50%);
  background:
    radial-gradient(38% 30% at 98% 50%, rgba(196,77,255,0.24), transparent 65%),
    radial-gradient(50% 44% at 88% 50%, rgba(196,77,255,0.10), transparent 70%),
    linear-gradient(270deg, #170b26 0%, #100819 55%, #0a0710 100%);}
/* BOTTOM the contracts floor: dark felt, faint crimson weave. */
.hl-quad--bottom{clip-path:polygon(0 100%,50% 50%,100% 100%);
  background:
    repeating-linear-gradient(45deg, transparent 0 30px, rgba(227,61,78,0.028) 30px 31px),
    repeating-linear-gradient(-45deg, transparent 0 30px, rgba(227,61,78,0.02) 30px 31px),
    radial-gradient(64% 54% at 50% 100%, #1c1116 0%, #120b10 55%, #0b0709 100%);}

/* Painted per-quadrant era plates: each covers the whole stage box and the
   quadrant's clip-path cuts its triangle. The brightness filter IS the
   ADR-0008 dark overlay — decoration never competes with state. A missing
   file renders nothing (ArtSprite fallback null) so the vector scene and
   CSS gradients beneath remain the look. */
.hl-quad-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;
  filter:brightness(0.66) saturate(1.04);}
.hl-quad-art--felt{filter:brightness(0.55) saturate(0.9);}

/* THE BOUNTY BOARD: wooden planks filling the bottom (contracts) triangle, the
   surface the wanted posters pin to (Mike 2026-07-15). CSS wood by default;
   board-wood.png covers it if it lands. z-index:1 sits it above the painted
   felt/bg and below the red string, time machine, posters and header plaque.
   Clipped to the bottom triangle so it never touches the three camp eras. */
.hl-board-wood{position:absolute;inset:0;z-index:1;pointer-events:none;
  clip-path:polygon(0 100%,50% 50%,100% 100%);
  background:
    repeating-linear-gradient(90deg, rgba(0,0,0,0.26) 0 1.5px, transparent 1.5px 74px),
    repeating-linear-gradient(90deg, transparent 0 74px, rgba(58,38,18,0.18) 74px 148px),
    repeating-linear-gradient(87deg, rgba(126,88,46,0.05) 0 5px, rgba(74,48,22,0.05) 5px 11px),
    radial-gradient(82% 92% at 50% 100%, #5b3d20 0%, #4a3119 42%, #35240f 74%, #23160a 100%);
  box-shadow:inset 0 8px 26px rgba(0,0,0,0.5);}
.hl-board-wood-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 100%;
  filter:brightness(0.9) saturate(1.02);}

/* Agency scenery: the skyline bands recede into the seams. */
.hl-skyline{position:absolute;left:0;right:0;width:100%;pointer-events:none;}
.hl-skyline--far{top:24%;height:20%;filter:blur(1.2px);opacity:.85;}
.hl-skyline--near{top:31%;height:19%;opacity:.95;}
/* Frontier scenery: mesas, cactus, fence. */
.hl-frontier{position:absolute;left:0;top:24%;width:46%;height:52%;pointer-events:none;opacity:.9;}
/* Singularity scenery: the warp grid radiating from the center apex. */
.hl-singularity{position:absolute;right:0;top:14%;width:50%;height:72%;pointer-events:none;}

/* The diagonal seams: the four-triangle cut, always legible. */
.hl-seams{position:absolute;inset:0;z-index:1;width:100%;height:100%;pointer-events:none;}

.hl-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:7;
  font-size:11px;letter-spacing:.06em;color:#8d95a8;opacity:.85;pointer-events:none;}

/* Ground ambients, screen-blended so each quadrant carries its team's
   identity; they breathe very slowly. GEOMETRY only: every color is inline,
   taken from the runtime theme accent of the camp that owns the quadrant. */
.hl-zones{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;border-radius:22px;}
.hl-zone{position:absolute;display:block;filter:blur(36px);mix-blend-mode:screen;}
.hl-zone--top{left:28%;top:4%;width:44%;height:32%;animation:hl-breathe 12s ease-in-out infinite;}
.hl-zone--left{left:-6%;top:30%;width:36%;height:40%;animation:hl-breathe 13s ease-in-out infinite;}
.hl-zone--right{right:-6%;top:30%;width:36%;height:40%;animation:hl-breathe 15s ease-in-out infinite reverse;}
.hl-zone--pool{left:28%;bottom:0;width:44%;height:28%;animation:hl-breathe 14s ease-in-out infinite reverse;}
@keyframes hl-breathe{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(1.5%,-1.5%) scale(1.08);}}

/* Searchlight: one slow beam sweeping the Agency skyline. */
.hl-search{position:absolute;left:60%;top:-10%;width:6%;height:64%;pointer-events:none;
  transform-origin:50% 0;transform:rotate(-14deg);
  background:linear-gradient(180deg, rgba(190,235,246,0.20) 0%, rgba(190,235,246,0.05) 55%, transparent 85%);
  filter:blur(7px);mix-blend-mode:screen;animation:hl-sweep 26s ease-in-out infinite alternate;}
@keyframes hl-sweep{0%{transform:rotate(-26deg);}100%{transform:rotate(20deg);}}

/* Rain on glass, confined to the Agency quadrant by its clip-path. Two
   streak layers at different speeds; the travel distance is an exact
   multiple of each layer's stripe period along the 112deg axis, so the
   loop never pops. */
.hl-rain{position:absolute;inset:0;pointer-events:none;}
.hl-rain::before,.hl-rain::after{content:"";position:absolute;inset:-40% -20%;}
.hl-rain::before{
  background:repeating-linear-gradient(112deg, transparent 0 9px, rgba(170,205,225,0.05) 9px 10px, transparent 10px 22px);
  animation:hl-rain-a 2.4s linear infinite;}
.hl-rain::after{
  background:repeating-linear-gradient(112deg, transparent 0 17px, rgba(170,205,225,0.035) 17px 18px, transparent 18px 41px);
  animation:hl-rain-b 3.6s linear infinite;}
@keyframes hl-rain-a{from{background-position:0 0;}to{background-position:-1020px 412px;}}
@keyframes hl-rain-b{from{background-position:0 0;}to{background-position:-1140px 461px;}}

/* Era energy streams (center to each team quadrant) and the red string. */
.hl-streams{position:absolute;inset:0;z-index:2;width:100%;height:100%;pointer-events:none;}
.hl-stream-flow{animation:hl-flow 3.4s linear infinite;}
@keyframes hl-flow{from{stroke-dashoffset:0;}to{stroke-dashoffset:-90;}}
.hl-strings{position:absolute;inset:0;z-index:2;width:100%;height:100%;pointer-events:none;
  filter:drop-shadow(0 2px 2px rgba(0,0,0,0.4));}

/* ── The time machine (center anchor; decorative) ── */
.hl-tm{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;width:19%;pointer-events:none;}
.hl-tm-art{position:relative;z-index:1;width:100%;height:auto;display:block;
  filter:drop-shadow(0 14px 30px rgba(0,0,0,0.6));}
.hl-tm-glow{position:absolute;left:50%;top:52%;width:170%;height:150%;transform:translate(-50%,-50%);
  z-index:0;pointer-events:none;
  background:radial-gradient(ellipse, rgba(240,179,64,0.16) 0%, rgba(77,216,230,0.05) 40%, transparent 68%);
  animation:hl-tm-pulse 7s ease-in-out infinite;}
.hl-tm-ring-a{transform-box:fill-box;transform-origin:center;animation:hl-tm-spin 42s linear infinite;}
.hl-tm-ring-b{transform-box:fill-box;transform-origin:center;animation:hl-tm-spin 28s linear infinite reverse;}
.hl-tm-core{animation:hl-tm-core 3.6s ease-in-out infinite;}
.hl-tm-beacon{animation:hl-tm-core 2.2s ease-in-out infinite;}
.hl-tm-hand-a{transform-box:fill-box;transform-origin:50% 100%;animation:hl-tm-spin 12s linear infinite;}
.hl-tm-hand-b{transform-box:fill-box;transform-origin:50% 100%;animation:hl-tm-spin 48s linear infinite;}
@keyframes hl-tm-spin{to{transform:rotate(360deg);}}
@keyframes hl-tm-pulse{0%,100%{opacity:.65;}50%{opacity:1;}}
@keyframes hl-tm-core{0%,100%{opacity:.75;}50%{opacity:1;}}

/* The bounty-board header: a carved wooden plaque hung above the posters (the
   three team quadrants are labeled by their own camp names). */
.hl-quad-label{position:absolute;left:50%;top:62.5%;transform:translate(-50%,-50%);z-index:4;
  font-family:Georgia,'Times New Roman',serif;font-size:12px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;
  color:#f3dfae;padding:4px 16px;border-radius:4px;white-space:nowrap;pointer-events:none;
  background:linear-gradient(180deg,#4a3118,#2c1d0d);border:1px solid #6b4a24;
  box-shadow:0 5px 12px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,220,170,0.15);
  text-shadow:0 1px 1px rgba(0,0,0,0.75);}

/* ── Camps (fixed quadrants) ── */
.hl-camp{position:absolute;transform:translate(-50%,-50%);z-index:4;width:17%;}
.hl-camp.is-raised{z-index:9;}
.hl-camp-btn{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;
  padding:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent;}
/* Color identity from the GROUND: the accent pool the structure stands in. */
.hl-camp-glow{position:absolute;left:50%;top:64%;width:200%;height:110%;transform:translate(-50%,-50%);
  z-index:0;pointer-events:none;opacity:.85;transition:opacity .2s,transform .2s;}
.hl-camp-btn:hover .hl-camp-glow{opacity:1;transform:translate(-50%,-50%) scale(1.1);}
/* The faction LABEL: the code-drawn emblem over the (emoji-stripped) name. It
   replaces the old floating building sprite; the backdrop bakes the HQ in. */
.hl-camp-label{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:3px;}
.hl-camp-count{position:relative;z-index:1;margin-top:4px;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(174,182,200,0.82);white-space:nowrap;}
.hl-camp-emblem{width:34px;height:34px;display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.8));
  transition:transform .2s;}
.hl-camp-btn:hover .hl-camp-emblem{transform:scale(1.08);}
.hl-camp-name{position:relative;z-index:1;font-size:12.5px;font-weight:800;white-space:nowrap;
  text-shadow:0 1px 6px rgba(0,0,0,0.95);max-width:180%;overflow:hidden;text-overflow:ellipsis;}
/* Members: the LEAD agent front-center and largest (the top-Bounty slot,
   framed era cast portrait), the rest a small silhouette headcount. They stand
   in the OPEN PLAZA (camps sit toward center now), so they get real room. */
.hl-agents{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:5px;}
/* Cut-out look (Mike): no framed box; the art is feathered to transparent so the
   figure sits ON the map. The rank glow is a drop-shadow on the masked shape
   (set inline), so it hugs the silhouette, not a rectangle. */
.hl-lead{display:block;width:52px;height:72px;overflow:visible;}
.hl-lead-art{width:100%;height:100%;object-fit:cover;object-position:50% 15%;display:block;
  -webkit-mask-image:radial-gradient(ellipse 58% 86% at 50% 37%,#000 45%,rgba(0,0,0,0.28) 72%,transparent 95%);
  mask-image:radial-gradient(ellipse 58% 86% at 50% 37%,#000 45%,rgba(0,0,0,0.28) 72%,transparent 95%);}
.hl-lead-fb{width:100%;height:100%;display:block;padding:2px;}
.hl-agents-row{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:150px;align-items:flex-end;}
.hl-agent{display:block;width:19px;height:25px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.6));}
.hl-agent-more{font-size:9.5px;font-weight:800;color:#e8ecf5;background:rgba(255,255,255,0.14);
  border-radius:999px;padding:1px 6px;align-self:center;}
.hl-agent-none{font-size:9.5px;font-weight:600;color:#9aa2b5;letter-spacing:.04em;}

/* ── The WANTED posters (pinned to the wooden bounty board) ── */
.hl-plate{position:absolute;transform:translate(-50%,-50%) rotate(var(--tilt,0deg)) scale(var(--pscale,1));z-index:5;width:13%;min-width:116px;
  transition:transform .16s;}
.hl-plate.is-raised{z-index:12;--tilt:0deg;--pscale:1;}
/* The dossier buy CTA: the one loud action on a live contract's card. */
.hl-card-buy{display:block;margin-top:8px;padding:8px 10px;border-radius:8px;text-align:center;
  font-size:12px;font-weight:800;letter-spacing:.06em;text-decoration:none;
  color:#0a0709;background:#f0b340;border:1px solid #f0b340;}
.hl-card-buy:hover{background:#ffcf6a;}
.hl-card-buy--quiet{background:transparent;color:#aeb6c8;border-color:#3a4258;font-weight:600;}
.hl-card-buy--quiet:hover{background:rgba(255,255,255,0.05);}
/* Status-corner captions: CLAIMED (bottom-left) and EXPIRED (bottom-right). */
.hl-corner-cap{position:absolute;z-index:6;font-size:10px;letter-spacing:.16em;text-transform:uppercase;
  color:#34d399;font-weight:800;text-shadow:0 1px 3px rgba(0,0,0,.85);pointer-events:none;}
.hl-corner-cap--lost{color:#a8794f;}
/* Every dossier is pinned: the crimson pin the string runs to. */
.hl-plate::before{content:"";position:absolute;left:50%;top:-5px;width:10px;height:10px;border-radius:50%;
  transform:translateX(-50%);z-index:2;pointer-events:none;
  background:radial-gradient(circle at 35% 30%, #ff8896, #b81f30 70%);
  box-shadow:0 2px 4px rgba(0,0,0,0.6);}
/* The WANTED poster: aged cream paper, serif ink, a sepia mug shot, the bounty
   reward in red ink, a wax seal + a red pushpin. The whole poster is the tap
   target (well over 40px both axes). */
.hl-plate-btn{position:relative;display:flex;flex-direction:column;align-items:center;width:100%;padding:0 0 4px;
  cursor:pointer;overflow:hidden;border-radius:2px;color:#241708;text-align:center;
  background:
    radial-gradient(115% 55% at 50% 0%, rgba(255,251,238,0.6), transparent 62%),
    linear-gradient(176deg, #efe4c6 0%, #e7d6ad 54%, #dcc79a 100%);
  border:1px solid #b3965f;box-shadow:0 10px 22px rgba(0,0,0,0.55), inset 0 0 24px rgba(120,86,40,0.2);
  transition:transform .15s,box-shadow .15s;-webkit-tap-highlight-color:transparent;}
/* Aged foxing blotches on the paper. */
.hl-plate-btn::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(circle at 13% 87%, rgba(84,54,20,0.16), transparent 20%),
    radial-gradient(circle at 87% 12%, rgba(84,54,20,0.13), transparent 17%),
    radial-gradient(circle at 78% 91%, rgba(60,38,14,0.13), transparent 15%);
  mix-blend-mode:multiply;}
.hl-plate-btn:hover{transform:translateY(-3px);box-shadow:0 16px 30px rgba(0,0,0,0.6), inset 0 0 24px rgba(120,86,40,0.2);}
.hl-plate-btn.is-open{box-shadow:0 16px 34px rgba(0,0,0,0.62), inset 0 0 24px rgba(120,86,40,0.2), 0 0 0 2px rgba(240,179,64,0.55);}
/* A CLOSED contract: gold edge glow (the BONDED stamp lands over it). */
.hl-plate-btn.is-closed{border-color:#caa24a;
  box-shadow:0 0 24px rgba(240,179,64,0.32), 0 10px 22px rgba(0,0,0,0.5), inset 0 0 24px rgba(120,86,40,0.2);}
/* A SEALED contract (pending + the pre-season placeholders): older, greyer
   paper, the mug shot classified. Reads clearly apart from a bright LIVE poster. */
.hl-plate-btn.is-sealed{color:#3a2f1c;border-color:#9a8a68;
  background:
    radial-gradient(115% 55% at 50% 0%, rgba(232,224,206,0.45), transparent 62%),
    linear-gradient(176deg, #d8cdb2 0%, #cabf9f 60%, #b6ab8a 100%);}
.hl-plate-btn.is-sealed .hl-mark-img{filter:grayscale(0.7) sepia(0.3) brightness(0.72);}
.hl-plate-btn.is-placeholder{cursor:default;}
.hl-plate-btn.is-placeholder:hover{transform:none;}
/* Poster header + subhead (serif ink). */
.hl-poster-hd{position:relative;z-index:1;margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;
  font-size:16px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:inherit;
  text-shadow:0 1px 0 rgba(255,255,255,0.4);}
.hl-poster-sub{position:relative;z-index:1;margin:1px 0 4px;font-family:Georgia,serif;font-size:7px;font-weight:700;
  letter-spacing:.22em;text-transform:uppercase;color:#7a5227;}
/* The lock badge centered over a sealed mug shot. */
.hl-mark-lock{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;
  display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;
  background:rgba(40,28,12,0.72);border:1px solid rgba(240,230,200,0.3);color:#efe1c4;
  box-shadow:0 2px 8px rgba(0,0,0,0.5);}
.hl-lock-lg{width:15px;height:15px;display:block;}
/* The mug shot: a framed sepia photo inset in the paper; the wax seal presses
   its corner. */
.hl-mark{position:relative;display:block;width:calc(100% - 18px);margin:0 9px;aspect-ratio:1/1;background:#1a140c;
  flex:0 0 auto;border:1px solid #6f4f27;box-shadow:inset 0 0 0 2px rgba(244,234,206,0.55),0 1px 3px rgba(0,0,0,0.4);}
.hl-mark-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 20%;display:block;
  filter:sepia(0.5) contrast(1.03) brightness(0.95) saturate(0.85);}
.hl-mark::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg, rgba(30,20,8,0.04) 0%, transparent 32%, rgba(30,20,8,0.26) 100%);}
.hl-seal{position:absolute;right:-6px;top:-6px;width:26px;height:26px;z-index:3;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,0.55));}
/* Poster text block (ink on paper). */
.hl-plate-body{display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 8px 2px;min-width:0;width:100%;
  box-sizing:border-box;position:relative;z-index:1;text-align:center;}
.hl-plate-name{max-width:100%;font-family:Georgia,'Times New Roman',serif;font-size:13px;font-weight:800;color:inherit;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 0 rgba(255,255,255,0.3);}
.hl-plate-worth{max-width:100%;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6a4a24;
  line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.hl-plate-worth--sealed{color:#7a5a30;letter-spacing:.05em;}
/* The bounty reward (the poster's payoff line): big red serif ink. */
.hl-poster-reward{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;line-height:1;}
.hl-poster-reward em{font-style:normal;font-family:Georgia,serif;font-size:8px;font-weight:700;letter-spacing:.26em;
  text-transform:uppercase;color:#7a5227;}
.hl-poster-reward b{font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:900;color:#8a1f14;
  letter-spacing:.01em;text-shadow:0 1px 0 rgba(255,255,255,0.35);}
/* CLOSED: a red rubber BONDED stamp struck across the poster. */
.hl-stamp{position:absolute;left:50%;top:53%;transform:translate(-50%,-50%) rotate(-13deg);pointer-events:none;z-index:4;
  border:3px solid #b21f2b;color:#b21f2b;background:rgba(255,255,255,0.05);
  font-family:Georgia,'Times New Roman',serif;font-size:13px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;
  padding:2px 11px;border-radius:3px;opacity:.92;}

/* ── Tap cards (contracts + camps) ── */
.hl-card{position:absolute;left:50%;top:calc(100% + 8px);transform:translateX(-50%);
  width:max-content;max-width:210px;display:flex;flex-direction:column;align-items:center;gap:5px;
  padding:11px 14px;border-radius:12px;background:rgba(10,10,16,0.94);backdrop-filter:blur(8px);
  border:1px solid rgba(240,179,64,0.28);box-shadow:0 12px 32px rgba(0,0,0,0.6);z-index:8;text-align:center;
  animation:hl-pop .16s ease-out;}
.hl-card--above{top:auto;bottom:calc(100% + 8px);}
.hl-card-name{font-weight:800;font-size:15px;color:#fff;}
.hl-card-sub{font-size:11px;color:${UI.faint};}
.hl-card-big{font-size:19px;font-weight:800;color:#fff;}
.hl-card-big em{font-style:normal;font-size:11px;font-weight:700;color:${UI.faint};
  letter-spacing:.08em;text-transform:uppercase;}
.hl-card-foot{font-size:10.5px;color:${UI.muted};line-height:1.45;max-width:190px;}
.hl-card-prize{font-size:11px;color:${UI.text};line-height:1.45;max-width:190px;
  padding:6px 9px;border-radius:8px;background:rgba(240,179,64,0.09);
  border:1px solid rgba(240,179,64,0.28);}
.hl-card-prize strong{color:#f0b340;font-weight:800;}
.hl-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;
  padding:3px 10px;border-radius:999px;letter-spacing:.04em;text-transform:uppercase;
  border:1px solid transparent;white-space:nowrap;}
.hl-pill-dot{width:6px;height:6px;border-radius:50%;display:inline-block;box-shadow:0 0 8px currentColor;}
@keyframes hl-pop{from{opacity:0;transform:translateX(-50%) scale(.92);}to{opacity:1;transform:translateX(-50%) scale(1);}}

/* ── Player agents (the top players, clustered by their camp) ──
   The cluster is a transparent, NON-interactive box centered on the plaza
   anchor; only the portraits and the open card take pointer events, so the
   gaps between portraits still pass a tap through to the stage (which closes
   any open card). Portraits are a fixed size, like the camp emblem, so they
   stay legible and tappable at any stage scale. */
/* PHYLLOTAXIS SWARM (S3 parity, Mike 2026-07-15 — show the WHOLE team, not a
   hero trio): the cluster is a POINT anchor; each agent is absolutely positioned
   on the golden-angle spiral (inline left/top) and scaled by --scale (rank 1
   largest, center). Standing transparent cutouts, feet at the spiral point, an
   accent puddle + drop-shadow grounding each. Alternating figures mirror so the
   repeated base look reads as a crowd, not clones. */
.hl-agents-cluster{position:absolute;inset:0;z-index:4;pointer-events:none;}
.hl-agents-cluster.is-raised{z-index:12;}
/* A slot plants one figure at an absolute STAGE point (inline left/top): feet at
   that point (translate -50% x / -100% y), scaled by depth around the feet.
   z-index is set inline (back-to-front by y). */
.hl-agent-slot{position:absolute;line-height:0;transform:translate(-50%,-100%) scale(var(--scale,1));
  transform-origin:50% 100%;}
.hl-agent-portrait{position:relative;box-sizing:border-box;display:block;width:44px;height:66px;padding:0;
  border:none;border-radius:0;background:none;overflow:visible;cursor:pointer;pointer-events:auto;
  -webkit-tap-highlight-color:transparent;transition:transform .15s;}
.hl-agent-portrait::after{content:"";position:absolute;left:50%;bottom:2px;width:78%;height:8px;
  transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse,var(--accent,#f0b340),transparent 72%);
  opacity:.5;filter:blur(3px);z-index:-1;pointer-events:none;}
.hl-agent-portrait:hover{transform:translateY(-5px) scale(1.06);}
.hl-agent-slot.is-open .hl-agent-portrait{transform:translateY(-5px) scale(1.06);}
/* The lead (rank 1) gets an accent halo so the top agent pops out of the crowd. */
.hl-agent-slot.is-lead .hl-agent-img{filter:drop-shadow(0 3px 4px rgba(0,0,0,0.65)) drop-shadow(0 0 7px var(--accent,#f0b340));}
.hl-agent-img{width:100%;height:100%;object-fit:contain;object-position:50% 100%;display:block;
  filter:drop-shadow(0 3px 4px rgba(0,0,0,0.65));}
.hl-agent-slot:nth-child(even):not(.is-lead) .hl-agent-img{transform:scaleX(-1);}
.hl-agent-more{position:absolute;transform:translate(-50%,0);font-size:10px;font-weight:800;color:#eef1f8;
  background:rgba(10,12,20,0.82);border:1px solid rgba(255,255,255,0.18);border-radius:999px;padding:2px 7px;
  pointer-events:auto;white-space:nowrap;z-index:210;}
/* The agent tap card: reuses .hl-card, retuned for a portrait + identity row
   over a rank + Bounty row. It sits AFTER .hl-card so these overrides win, and
   re-enables pointer events the cluster turned off. It shows name, team, rank
   and Bounty ONLY: never a wallet, never a dollar amount. */
.hl-agent-card{max-width:200px;align-items:stretch;text-align:left;gap:9px;padding:11px 12px 12px;pointer-events:auto;}
.hl-agent-card .hl-card-name{font-size:14.5px;line-height:1.15;max-width:150px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hl-agent-card-top{display:flex;align-items:center;gap:9px;}
.hl-agent-card-portrait{position:relative;box-sizing:border-box;flex:0 0 auto;width:44px;height:44px;
  border-radius:50%;overflow:hidden;border:2px solid rgba(240,179,64,0.6);background:#0c0e15;
  box-shadow:0 2px 8px rgba(0,0,0,0.55);}
.hl-agent-card-id{display:flex;flex-direction:column;gap:2px;min-width:0;}
.hl-agent-card-team{font-size:10.5px;font-weight:800;letter-spacing:.05em;max-width:150px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hl-agent-card-stats{display:flex;align-items:center;gap:8px;padding-top:8px;
  border-top:1px solid rgba(255,255,255,0.08);}
.hl-agent-rank{font-size:12px;font-weight:800;color:#fff;background:rgba(255,255,255,0.1);
  border-radius:6px;padding:2px 8px;letter-spacing:.02em;}
.hl-agent-pts{font-size:11.5px;color:${UI.muted};letter-spacing:.02em;}
.hl-agent-pts b{color:#fff;font-weight:800;font-size:13px;}
.hl-agent-close{position:absolute;top:5px;right:6px;width:22px;height:22px;display:flex;align-items:center;
  justify-content:center;padding:0;border:0;border-radius:6px;background:transparent;color:${UI.faint};
  font-size:13px;line-height:1;cursor:pointer;-webkit-tap-highlight-color:transparent;
  transition:color .15s,background .15s;}
.hl-agent-close:hover{color:#fff;background:rgba(255,255,255,0.08);}
/* Centered agent dossier modal (S3 pilot-card parity, Mike 2026-07-15). */
.hl-agent-modal-bg{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
  background:rgba(6,7,11,0.74);backdrop-filter:blur(3px);padding:20px;animation:hl-fade .16s ease;}
@keyframes hl-fade{from{opacity:0}to{opacity:1}}
.hl-dossier{position:relative;width:min(460px,94vw);aspect-ratio:1000/1400;max-height:88vh;border-radius:22px;
  overflow:hidden;background:#0b0d14;border:1.5px solid rgba(255,255,255,0.12);
  box-shadow:0 34px 90px rgba(0,0,0,0.64);animation:hl-pop .18s ease;}
.hl-dossier-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;}
.hl-dossier-scrim{position:absolute;inset:0;pointer-events:none;background:
  linear-gradient(180deg,rgba(8,11,18,0.55) 0%,rgba(8,11,18,0) 22%,rgba(8,11,18,0) 46%,
  rgba(8,11,18,0.88) 68%,rgba(8,11,18,0.98) 100%);}
.hl-dossier-x{position:absolute;top:14px;right:14px;z-index:4;width:34px;height:34px;border-radius:999px;border:none;
  background:rgba(0,0,0,0.45);color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.hl-dossier-x:hover{background:rgba(0,0,0,0.66);}
.hl-dossier-body{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;padding:20px 22px 24px;}
.hl-dossier-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding-right:38px;}
.hl-dossier-season{font-size:13px;font-weight:800;letter-spacing:.12em;color:#f0b340;text-transform:uppercase;
  text-shadow:0 2px 8px rgba(0,0,0,0.85);max-width:62%;line-height:1.25;}
.hl-dossier-classified{font-size:11px;font-weight:800;letter-spacing:.18em;color:#e33d4e;border:2px solid #e33d4e;
  border-radius:5px;padding:3px 9px;transform:rotate(-4deg);text-transform:uppercase;background:rgba(8,11,18,0.4);white-space:nowrap;}
.hl-dossier-spacer{flex:1 1 auto;min-height:30px;}
.hl-dossier-info{display:flex;flex-direction:column;align-items:center;text-align:center;}
.hl-dossier-name{font-size:31px;font-weight:800;color:#fff;line-height:1.05;text-shadow:0 2px 14px rgba(0,0,0,0.8);overflow-wrap:anywhere;}
.hl-dossier-team{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:7px;
  text-shadow:0 2px 8px rgba(0,0,0,0.85);}
.hl-dossier-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;margin:17px 0 16px;}
.hl-dossier-stat{background:rgba(0,0,0,0.44);border:1px solid rgba(255,255,255,0.14);border-radius:14px;
  padding:12px 8px;display:flex;flex-direction:column;gap:4px;backdrop-filter:blur(3px);}
.hl-dossier-stat b{font-size:26px;font-weight:800;color:#fff;}
.hl-dossier-stat span{font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,0.64);}
.hl-dossier-share{width:100%;padding:14px;border:none;border-radius:13px;background:#f0b340;color:#0a0a0a;
  font-size:15.5px;font-weight:800;cursor:pointer;}
.hl-dossier-share:hover{filter:brightness(1.06);}

/* ── Pre-season caption (sits above the sealed placeholder contracts) ── */
.hl-seal-note{position:absolute;left:50%;top:71%;transform:translate(-50%,-50%);z-index:5;
  font-size:11px;font-weight:600;letter-spacing:.03em;color:#aeb6c8;text-align:center;white-space:nowrap;
  background:rgba(10,10,16,0.72);padding:5px 13px;border-radius:999px;
  border:1px solid rgba(240,179,64,0.18);pointer-events:none;}

/* ── Events strip (below the board, reserved) ── */
.hl-events{display:flex;align-items:center;gap:14px;margin:0 auto 16px;max-width:920px;
  border:1.5px dashed rgba(77,216,230,0.22);border-radius:14px;padding:10px 16px;}
.hl-events-title{font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#8fd8e2;flex:0 0 auto;}
.hl-events-copy{font-size:11px;color:#9aa2b5;line-height:1.55;flex:1 1 auto;}

/* ── Atmosphere overlays (all pointer-events:none) ── */
.hl-vignette{position:absolute;inset:0;z-index:6;pointer-events:none;border-radius:22px;
  background:radial-gradient(120% 100% at 50% 44%, transparent 56%, rgba(3,4,8,0.55) 100%);}
.hl-grain{position:absolute;inset:0;z-index:7;pointer-events:none;border-radius:22px;opacity:.055;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='140' height='140' filter='url(%23g)' opacity='0.55'/></svg>");
  background-size:140px 140px;}

/* ── Mobile legend list ── */
.hl-list{display:none;list-style:none;padding:0;margin:0;}
.hl-row{display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:13px;
  background:${UI.panel};border:1px solid ${UI.border};}
.hl-row-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 8px currentColor;}
.hl-row-body{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;}
.hl-row-name{font-weight:700;font-size:14px;color:#fff;}
.hl-row-sub{font-size:11px;color:${UI.muted};}

.hl-foot{margin-top:30px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px;}
.hl-foot-copy{max-width:600px;margin:0;color:#cdd4e4;font-size:14.5px;line-height:1.65;}
.hl-cta{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}
.hl-btn{padding:13px 26px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;
  background:${UI.panel};color:${UI.text};border:1px solid ${UI.border};}
.hl-btn--gold{background:#f0b340;color:#1a1205;font-weight:700;border:none;}
.hl-btn:hover{filter:brightness(1.06);}

@media (prefers-reduced-motion: reduce){
  .hl-zone,.hl-search,.hl-card,.hl-rain::before,.hl-rain::after,.hl-tm-glow,.hl-tm-ring-a,.hl-tm-ring-b,
  .hl-tm-core,.hl-tm-beacon,.hl-tm-hand-a,.hl-tm-hand-b,.hl-stream-flow{animation:none !important;}
  .hl-camp-emblem,.hl-plate,.hl-plate-btn,.hl-rail-row,.hl-camp-glow,.hl-agent-portrait,.hl-agent-close{transition:none !important;}
}
@media (max-width:680px){
  .hl-shell{padding:24px 16px 52px;}
  .hl-plate,.hl-card,.hl-hint,.hl-seal-note,.hl-strings,.hl-search{display:none;}
  .hl-camp{width:26%;}
  /* Keep the crowd visible on mobile (Mike reviews there). Agents scatter by
     stage %, so their POSITIONS already scale with the tighter stage; just shrink
     the fixed-px figures so the crowd stays in proportion. */
  .hl-agent-portrait{width:32px;height:48px;}
  .hl-tm{width:26%;}
  .hl-quad-label{font-size:9px;top:68%;}
  .hl-list{display:flex;flex-direction:column;gap:9px;margin:2px 0 18px;}
  .hl-head{flex-wrap:wrap;}
}
`;
