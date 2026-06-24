"use client";

/**
 * THE HEADING 🧭 · Conquer the Seas daily course-plot SERIES.
 *
 * Each captain sails a SERIES of 3 reef maps back to back (one run = the whole
 * voyage). Sail ⛵ from the bottom row to the island 🏝️ on the top row in as
 * few moves as possible on each map. Reefs 🪨 block. Current cells push you 1
 * extra cell (chains cap at 3). Par comes from a BFS over the exact same
 * move-resolution function the player uses, so every map's par is honest and
 * solvable.
 *
 * The 3 maps are deterministically seeded off the captain's daily sea variant
 * (`…:v<variant>:m<leg>`), so the voyage is identical for that captain every
 * time AND stays anti-spoiler: a posted route only ever spoils a fifth of the
 * fleet, exactly as the single-map version did.
 *
 * Scoring: each leg scores 20..100 vs. its own BFS par; the banked run is the
 * AVERAGE of the three legs, so the combined score stays on the same 0..100
 * scale the server caps `heading` at (maxScore 100 in /api/seas/score). One
 * scored run per UTC day is banked exactly once, at the end of the voyage.
 *
 * Captain stats do NOT change this puzzle: it is a fair daily race on a
 * shared voyage. The fastest-100 intel bonus arrives with the map drop.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FG,
  FG3,
  GOLD,
  GOLD_BRIGHT,
  HAIRLINE,
  INK,
  KENNEY,
  GameHeader,
  ScoreBanner,
  dayKeyUTC,
  seededRng,
  useSeasGame,
} from "../shared";

const N = 8;
const WATER = 0;
const REEF = 1;
/** Current cells store 2 + dirIndex. dirIndex: 0 up, 1 down, 2 left, 3 right. */
const DR = [-1, 1, 0, 0];
const DC = [0, 0, -1, 1];
const DIR_EMOJI = ["⬆️", "⬇️", "⬅️", "➡️"];
const MAX_PUSHES = 3;

/** A voyage is this many reef maps, scored cumulatively (averaged) as one run. */
const SERIES_LEN = 3;

/* ---------- chart art (visual only: game logic above is untouched) ---------- */

/** CSS rotation per dirIndex (up/down/left/right). Kenney sprites point UP. */
const DIR_DEG = [0, 180, 270, 90];

/** Kenney pirate pack picks (verified visually). */
const SPRITE_ROCK = KENNEY.tile(66); // wide gray water-rock cluster, green moss
const SPRITE_SAND = KENNEY.tile(69); // pale speckled sand, cropped to a disc
const SPRITE_PALM = KENNEY.tile(71); // top-down green palm star
const SPRITE_SHIP = KENNEY.ship(2); // dark pirate ship, skull sail, points up

/** Two close ink-teal shades in a checker so the grid reads without borders. */
const WATER_A = "#0a2a38";
const WATER_B = "#082431";
const REEF_WATER = "#071f29";

function svgTile(inner: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 56 56'>${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Thin wave arcs, two placements so neighboring cells do not repeat. */
const WAVES_A = svgTile(
  "<path d='M10 19q5 -4 10 0t10 0' fill='none' stroke='rgba(160,225,255,0.10)' stroke-width='1.3' stroke-linecap='round'/><path d='M24 39q5 -4 10 0t10 0' fill='none' stroke='rgba(160,225,255,0.06)' stroke-width='1.3' stroke-linecap='round'/>",
);
const WAVES_B = svgTile(
  "<path d='M22 13q5 -4 10 0t10 0' fill='none' stroke='rgba(160,225,255,0.08)' stroke-width='1.3' stroke-linecap='round'/><path d='M8 35q5 -4 10 0t10 0' fill='none' stroke='rgba(160,225,255,0.06)' stroke-width='1.3' stroke-linecap='round'/>",
);

const WATER_HIGHLIGHT =
  "radial-gradient(circle at 32% 28%, rgba(150,220,255,0.07), rgba(150,220,255,0) 58%)";

/** Parchment-dark corner tints for the chart frame. */
const FRAME_CORNERS = [
  "radial-gradient(circle at 0 0, rgba(216,180,124,0.10), rgba(216,180,124,0) 28%)",
  "radial-gradient(circle at 100% 0, rgba(216,180,124,0.10), rgba(216,180,124,0) 28%)",
  "radial-gradient(circle at 0 100%, rgba(216,180,124,0.10), rgba(216,180,124,0) 28%)",
  "radial-gradient(circle at 100% 100%, rgba(216,180,124,0.10), rgba(216,180,124,0) 28%)",
].join(", ");

// `opt` = the true BFS optimal (the "perfect line", the mastery ceiling).
// `par` = a friendlier target set a few moves ABOVE opt, so a good captain can
// sail UNDER par (golf framing) instead of only ever tying it.
type Sea = { grid: number[]; start: number; goal: number; opt: number; par: number };

function stepIdx(idx: number, dir: number): number {
  const r = Math.floor(idx / N) + DR[dir];
  const c = (idx % N) + DC[dir];
  if (r < 0 || r >= N || c < 0 || c >= N) return -1;
  return r * N + c;
}

/**
 * SINGLE SOURCE OF TRUTH for movement, used by both play and par (BFS).
 * One move = step onto an orthogonally adjacent sailable cell, then ride
 * currents: each current cell entered pushes 1 extra cell in its arrow
 * direction if that cell is sailable; chained pushes cap at MAX_PUSHES.
 * Returns every cell entered in order, or null if the step is illegal.
 */
function resolveMove(grid: number[], from: number, dir: number): number[] | null {
  let cur = stepIdx(from, dir);
  if (cur < 0 || grid[cur] === REEF) return null;
  const path = [cur];
  let pushes = 0;
  while (pushes < MAX_PUSHES && grid[cur] >= 2) {
    const next = stepIdx(cur, grid[cur] - 2);
    if (next < 0 || grid[next] === REEF) break;
    cur = next;
    path.push(cur);
    pushes++;
  }
  return path;
}

/** BFS over resolveMove. Returns the minimum move count, or -1 if unreachable. */
function computePar(grid: number[], start: number, goal: number): number {
  const dist = new Array<number>(N * N).fill(-1);
  dist[start] = 0;
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    if (pos === goal) return dist[pos];
    for (let d = 0; d < 4; d++) {
      const path = resolveMove(grid, pos, d);
      if (!path) continue;
      const next = path[path.length - 1];
      if (dist[next] === -1) {
        dist[next] = dist[pos] + 1;
        queue.push(next);
      }
    }
  }
  return -1;
}

/**
 * The straight-line floor: the fewest moves possible if the board were open
 * water (no reefs, no currents). Each move advances at most one row toward the
 * goal, so the optimal can never beat the row gap plus the column gap. A board
 * whose BFS par sits AT this floor is a trivial straight shot; the generator
 * rejects those in favor of boards whose optimal route is forced to detour.
 */
function straightLineFloor(start: number, goal: number): number {
  const rowGap = Math.floor(start / N) - Math.floor(goal / N); // start row is below
  const colGap = Math.abs((start % N) - (goal % N));
  return rowGap + colGap;
}

type Board = { grid: number[]; start: number; goal: number };

/**
 * Lay out reefs, then currents that are GUARANTEED never to point straight into
 * a rock or off the edge (the "arrows shove you into the rocks / looks broken"
 * bug). For each current we pick, from the directions whose FIRST push cell is
 * sailable, one biased toward the goal — so currents are real shortcuts to ride,
 * not dead scenery. A cell with no sailable push direction stays open water.
 */
function placeBoard(rng: () => number, reefTarget: number, currentTarget: number): Board {
  const grid = new Array<number>(N * N).fill(WATER);
  const start = (N - 1) * N + Math.floor(rng() * N);
  const goal = Math.floor(rng() * N);
  let placed = 0;
  let guard = 0;
  while (placed < reefTarget && guard++ < 600) {
    const i = Math.floor(rng() * N * N);
    if (i === start || i === goal || grid[i] !== WATER) continue;
    grid[i] = REEF;
    placed++;
  }
  const goalR = Math.floor(goal / N);
  const goalC = goal % N;
  placed = 0;
  guard = 0;
  while (placed < currentTarget && guard++ < 900) {
    const i = Math.floor(rng() * N * N);
    if (i === start || i === goal || grid[i] !== WATER) continue;
    const valid: number[] = [];
    for (let d = 0; d < 4; d++) {
      const n = stepIdx(i, d);
      if (n >= 0 && grid[n] !== REEF) valid.push(d); // never points into rock/edge
    }
    if (!valid.length) continue; // boxed in → leave it open water
    let dir = valid[Math.floor(rng() * valid.length)];
    if (rng() < 0.6) {
      // bias toward the valid push that lands closest to the goal
      let best = dir;
      let bestDist = Infinity;
      for (const d of valid) {
        const n = stepIdx(i, d);
        const dist = Math.abs(Math.floor(n / N) - goalR) + Math.abs((n % N) - goalC);
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      dir = best;
    }
    grid[i] = 2 + dir;
    placed++;
  }
  return { grid, start, goal };
}

/** BFS over resolveMove that also reconstructs ONE optimal route (landed cells). */
function solveWithPath(grid: number[], start: number, goal: number): { opt: number; landed: number[] } | null {
  const dist = new Array<number>(N * N).fill(-1);
  const prev = new Array<number>(N * N).fill(-1);
  dist[start] = 0;
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    if (pos === goal) break;
    for (let d = 0; d < 4; d++) {
      const path = resolveMove(grid, pos, d);
      if (!path) continue;
      const next = path[path.length - 1];
      if (dist[next] === -1) {
        dist[next] = dist[pos] + 1;
        prev[next] = pos;
        queue.push(next);
      }
    }
  }
  if (dist[goal] === -1) return null;
  const landed: number[] = [];
  for (let c = goal; c !== -1; c = prev[c]) landed.push(c);
  landed.reverse();
  return { opt: dist[goal], landed };
}

/** How many distinct currents the optimal route rides, and how many turns it makes. */
function analyzeRoute(grid: number[], landed: number[]): { currentsUsed: number; turns: number } {
  const currents = new Set<number>();
  const dirs: number[] = [];
  for (let k = 0; k + 1 < landed.length; k++) {
    const a = landed[k];
    const b = landed[k + 1];
    for (let d = 0; d < 4; d++) {
      const p = resolveMove(grid, a, d);
      if (p && p[p.length - 1] === b) {
        dirs.push(d);
        for (const cell of p) if (grid[cell] >= 2) currents.add(cell);
        break;
      }
    }
  }
  let turns = 0;
  for (let k = 1; k < dirs.length; k++) if (dirs[k] !== dirs[k - 1]) turns++;
  return { currentsUsed: currents.size, turns };
}

/** The optimal IGNORING currents (reefs only): the baseline the currents shortcut. */
function parWithoutCurrents(grid: number[], start: number, goal: number): number {
  const stripped = grid.map((g) => (g >= 2 ? WATER : g));
  return computePar(stripped, start, goal);
}

/**
 * Deterministic daily sea: attempt 1 seeds from the day key, retries append
 * ":2", ":3"... A board is accepted only if its BFS par clears both a minimum
 * length (parFloor) and a minimum detour over the open-water straight line
 * (detourReq) — that is what makes par a genuine target instead of a floor a
 * straight dash clears. Each relax level eases the reef count and then those
 * gates, so the generator always terminates. The absolute last fallback is an
 * open sea (no reefs, no currents), which is always solvable.
 */
// 5 seas per day: each captain is deterministically assigned one (hashed from
// their id + the date), so a posted route only spoils a fifth of the fleet.
// Guests practice on a random one.
const SEA_VARIANTS = 5;
function variantHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Par sits a few moves above the true optimal so a good captain can sail UNDER
// par (golf) instead of only tying it — the headroom that makes "perfect line"
// a real flex. Buffer = ~25% of opt, clamped to 2..4.
function seaFromBoard(board: Board, opt: number): Sea {
  const buffer = Math.min(4, Math.max(2, Math.ceil(opt * 0.25)));
  return { grid: board.grid, start: board.start, goal: board.goal, opt, par: opt + buffer };
}

function generateSea(dayKey: string, variant: number, leg: number): Sea {
  // The leg index folds into the seed so the 3 maps differ but stay keyed off
  // the captain's daily variant (still anti-spoiler) and stay identical per
  // captain. `:m0` reproduces the original single-map seed for leg 0.
  const base = leg === 0 ? `${dayKey}:heading:v${variant}` : `${dayKey}:heading:v${variant}:m${leg}`;
  let attempt = 0;
  // A good board is not just solvable — it must be FAIR (no dead currents, which
  // placeBoard guarantees by construction) and INTERESTING. We generate-then-
  // verify against quality gates and only ship a board that passes:
  //   • minOpt   — the optimal is a real voyage, not a short hop.
  //   • detour   — reefs force a winding base path (measured WITHOUT currents).
  //   • shortcut — currents genuinely cut the no-current route down (or are
  //                mandatory), so riding them is the whole point.
  //   • currents — the optimal route actually rides at least this many currents.
  //   • turns    — the optimal route bends, so it is never a straight dash.
  // Reef counts are LOWER than before (the old boards were rock-cluttered); the
  // currents now carry the puzzle. The ladder eases the gates as attempts run
  // dry so the generator always terminates on a real (never impossible) board.
  const tiers = [
    { reef: 13, cur: 6, minOpt: 7, detour: 3, shortcut: 3, currents: 3, turns: 4 },
    { reef: 12, cur: 6, minOpt: 7, detour: 3, shortcut: 2, currents: 2, turns: 3 },
    { reef: 12, cur: 5, minOpt: 6, detour: 2, shortcut: 2, currents: 2, turns: 3 },
    { reef: 11, cur: 5, minOpt: 6, detour: 2, shortcut: 1, currents: 1, turns: 2 },
    { reef: 10, cur: 4, minOpt: 5, detour: 1, shortcut: 1, currents: 1, turns: 1 },
    { reef: 9, cur: 4, minOpt: 5, detour: 0, shortcut: 0, currents: 0, turns: 0 },
  ];
  for (const t of tiers) {
    for (let i = 0; i < 120; i++) {
      attempt++;
      const seed = attempt === 1 ? base : `${base}:${attempt}`;
      const rng = seededRng(seed);
      const reefs = Math.max(7, t.reef + Math.floor(rng() * 4) - 1);
      const board = placeBoard(rng, reefs, t.cur);
      const solved = solveWithPath(board.grid, board.start, board.goal);
      if (!solved || solved.opt < t.minOpt) continue;
      const manhattan = straightLineFloor(board.start, board.goal);
      const optIgnore = parWithoutCurrents(board.grid, board.start, board.goal);
      // reefs must bend the base (no-current) route off the straight line
      if (optIgnore >= 0 && optIgnore - manhattan < t.detour) continue;
      // currents must be a real shortcut (or be outright required: optIgnore < 0)
      if (optIgnore >= 0 && optIgnore - solved.opt < t.shortcut) continue;
      const { currentsUsed, turns } = analyzeRoute(board.grid, solved.landed);
      if (currentsUsed < t.currents) continue;
      if (turns < t.turns) continue;
      return seaFromBoard(board, solved.opt);
    }
  }
  // Final fallback: a sparse-but-solvable board (still no dead currents), so a
  // real voyage always boards even in the pathological case.
  for (let i = 0; i < 200; i++) {
    attempt++;
    const board = placeBoard(seededRng(`${base}:fb${attempt}`), 9, 4);
    const solved = solveWithPath(board.grid, board.start, board.goal);
    if (solved && solved.opt >= 4) return seaFromBoard(board, solved.opt);
  }
  // Absolute last resort: open water (no reefs/currents) is always solvable.
  const open = placeBoard(seededRng(`${base}:open`), 0, 0);
  const solved = solveWithPath(open.grid, open.start, open.goal);
  return seaFromBoard(open, solved ? solved.opt : straightLineFloor(open.start, open.goal));
}

/** One completed leg of the voyage: its sea plus the tally scored against par. */
type LegResult = { sea: Sea; moves: number; score: number };

/**
 * Compact emoji share tile for the whole voyage: the viral artifact.
 *
 * One row per map so the series stays glanceable: a short progress bead strip
 * keyed to the leg result (⭐ perfect line / under par, 🟡 made par, 🔴 over par),
 * then the moves/par tally. The combined (averaged) score leads the tile.
 */
function buildShareTile(legs: LegResult[], combined: number, dayKey: string, variant: number): string {
  const rows = legs.map((leg, k) => {
    const m = leg.moves;
    const bead = m <= leg.sea.opt ? "⭐" : m <= leg.sea.par ? "🟡" : "🔴";
    return `${k + 1}️⃣ ${bead} ${m}/${leg.sea.par}`;
  });
  return (
    `🧭 The Heading · ${dayKey} · sea ${variant}/${SEA_VARIANTS}\n` +
    `Voyage of ${SERIES_LEN} · ${combined}/100\n` +
    rows.join("\n")
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Gold line icons for the thumb pad (inline SVG: arrows are never emoji). */
function ArrowIcon({ deg }: { deg: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden="true"
      style={{ display: "block", transform: deg ? `rotate(${deg}deg)` : undefined }}
    >
      <path
        d="M12 19.5 L12 4.5 M5.5 11 L12 4.5 L18.5 11"
        fill="none"
        stroke={GOLD}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M8.8 5.6 L4.4 9.9 L8.8 14.2 M4.4 9.9 H14.2 A5.2 5.2 0 0 1 14.2 20.3 H9.6"
        fill="none"
        stroke={GOLD}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M19.4 12 A7.4 7.4 0 1 1 16.9 6.45"
        fill="none"
        stroke={GOLD}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <path
        d="M17.2 2.6 L17.2 7 L12.8 7"
        fill="none"
        stroke={GOLD}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PadButton({ icon, onPress, label }: { icon: ReactNode; onPress: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      style={{
        width: 48,
        height: 48,
        padding: 0,
        background: "rgba(248,253,255,0.04)",
        border: `1px solid ${HAIRLINE}`,
        borderRadius: "50%",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "inset 0 1px 0 rgba(248,253,255,0.06), 0 2px 6px rgba(0,0,0,0.35)",
        touchAction: "manipulation",
      }}
    >
      {icon}
    </button>
  );
}

/** Aged-parchment map art served from /public/seas-art. Optional: a no-op
 * onerror plus a boolean gate keep a missing/slow file from ever breaking the
 * board; we fall back to the original solid ink styling. */
const MAP_ART_SRC = "/seas-art/bg-heading.png";

export default function HeadingPage() {
  const { captain, identityChecked, submitScore, submitState, lastResult } = useSeasGame("heading");
  const dayKey = useMemo(() => dayKeyUTC(), []);

  // Probe the parchment art once. While unverified (or on failure) the board
  // keeps its solid ink fill; once it decodes we layer the map underneath the
  // grid and let water cells go translucent so the parchment reads through.
  const [mapArtReady, setMapArtReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setMapArtReady(true);
    };
    img.onerror = () => {
      /* no-op: keep the procedural/solid fallback so the game never breaks */
    };
    img.src = MAP_ART_SRC;
    return () => {
      cancelled = true;
    };
  }, []);

  // Variant locks once play starts; before that it settles to the captain's
  // assigned sea (or a random practice sea for guests) once identity resolves.
  const [variant, setVariant] = useState(1);
  const [phase, setPhase] = useState<"start" | "play" | "won">("start");
  useEffect(() => {
    if (phase !== "start" || !identityChecked) return;
    if (captain) {
      setVariant(1 + (variantHash(`${captain.discord_id}:${dayKey}`) % SEA_VARIANTS));
    } else {
      setVariant(1 + Math.floor(Math.random() * SEA_VARIANTS));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityChecked, captain, dayKey]);

  // The voyage: all 3 seas for this captain's variant, plus which leg is live.
  const seas = useMemo(
    () => Array.from({ length: SERIES_LEN }, (_, k) => generateSea(dayKey, variant, k)),
    [dayKey, variant],
  );
  const [leg, setLeg] = useState(0);
  const sea = seas[leg];

  /** dir: ship facing for the sprite rotation only (game logic ignores it). */
  const [hist, setHist] = useState<{ pos: number; trail: number[]; dir: number }[]>([
    { pos: sea.start, trail: [sea.start], dir: 0 },
  ]);

  // Per-leg tallies accumulate across the voyage; the banked run is their mean.
  const [legResults, setLegResults] = useState<LegResult[]>([]);
  const [finalScore, setFinalScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const endedRef = useRef(false);

  // A variant change regenerates the voyage; reset to leg 0 (only happens on
  // the start screen, never mid-game).
  useEffect(() => {
    setLeg(0);
    setLegResults([]);
    setHist([{ pos: seas[0].start, trail: [seas[0].start], dir: 0 }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seas]);

  const seaParTotal = useMemo(() => seas.reduce((a, s) => a + s.par, 0), [seas]);
  const legMovesTotal = legResults.reduce((a, r) => a + r.moves, 0);
  // Total moves shown in the HUD: banked legs plus the live leg in progress.

  const cur = hist[hist.length - 1];
  const moves = hist.length - 1;

  const doMove = useCallback(
    (dir: number) => {
      if (phase !== "play" || endedRef.current) return;
      const path = resolveMove(sea.grid, cur.pos, dir);
      if (!path) return;
      const pos = path[path.length - 1];
      // Face the ship along the LAST segment traveled (currents may have
      // pushed it sideways); purely cosmetic, never feeds back into logic.
      const prevCell = path.length >= 2 ? path[path.length - 2] : cur.pos;
      const delta = pos - prevCell;
      const faced = delta === -N ? 0 : delta === N ? 1 : delta === -1 ? 2 : 3;
      const nextHist = [...hist, { pos, trail: [...cur.trail, ...path], dir: faced }];
      setHist(nextHist);
      if (pos !== sea.goal) return;

      // Leg cleared. The PERFECT LINE (m <= opt) scores 100; sailing inside the
      // friendly par band ramps 100 -> 60; over par falls off to a 20 floor. So
      // beating par (finding the true optimal) is the mastery flex, while just
      // making par is still a solid score.
      const m = moves + 1;
      const legScore =
        m <= sea.opt
          ? 100
          : m <= sea.par
            ? Math.round(100 - (40 * (m - sea.opt)) / Math.max(1, sea.par - sea.opt))
            : Math.max(20, 60 - 12 * (m - sea.par));
      const result: LegResult = { sea, moves: m, score: legScore };

      if (leg < SERIES_LEN - 1) {
        // Sail on to the next map; the voyage is not yet banked.
        const nextLeg = leg + 1;
        const nextStart = seas[nextLeg].start;
        setLegResults((prev) => [...prev, result]);
        setLeg(nextLeg);
        setHist([{ pos: nextStart, trail: [nextStart], dir: 0 }]);
        return;
      }

      // Final leg: lock the voyage and bank EXACTLY ONCE. The combined score is
      // the MEAN of the three legs, so it stays on the 0..100 scale the server
      // caps `heading` at (maxScore 100): summing would blow past that cap.
      endedRef.current = true;
      const allLegs = [...legResults, result];
      const combined = Math.round(allLegs.reduce((a, r) => a + r.score, 0) / SERIES_LEN);
      setLegResults(allLegs);
      setFinalScore(combined);
      setPhase("won");
      const movesPerLeg = allLegs.map((r) => r.moves);
      const parPerLeg = allLegs.map((r) => r.sea.par);
      // Replays call submitScore again; the API marks later runs as practice
      // (heading allows exactly 1 banked attempt per UTC day).
      void submitScore(combined, {
        series: SERIES_LEN,
        movesPerLeg,
        parPerLeg,
        movesTotal: movesPerLeg.reduce((a, b) => a + b, 0),
        parTotal: parPerLeg.reduce((a, b) => a + b, 0),
        variant,
      });
    },
    [phase, sea, cur, hist, moves, leg, seas, legResults, variant, submitScore],
  );

  const undo = useCallback(() => {
    if (phase === "play" && hist.length > 1) setHist(hist.slice(0, -1));
  }, [phase, hist]);

  // Restart re-sails ONLY the current leg; banked legs stay banked.
  const restart = useCallback(() => {
    if (phase === "play") setHist([{ pos: sea.start, trail: [sea.start], dir: 0 }]);
  }, [phase, sea]);

  // Play again restarts the WHOLE voyage from leg 1 (practice; only the first
  // run of the day banks).
  const playAgain = () => {
    endedRef.current = false;
    setCopied(false);
    setLegResults([]);
    setLeg(0);
    setHist([{ pos: seas[0].start, trail: [seas[0].start], dir: 0 }]);
    setPhase("play");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, number> = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3 };
      if (e.key in map) {
        e.preventDefault();
        doMove(map[e.key]);
      } else if (phase === "start" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        setPhase("play");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove, phase]);

  const onCellTap = (idx: number) => {
    if (phase !== "play") return;
    for (let d = 0; d < 4; d++) {
      if (stepIdx(cur.pos, d) === idx) {
        doMove(d);
        return;
      }
    }
  };

  const legalTargets = useMemo(() => {
    const s = new Set<number>();
    if (phase !== "play") return s;
    for (let d = 0; d < 4; d++) {
      const i = stepIdx(cur.pos, d);
      if (i >= 0 && sea.grid[i] !== REEF) s.add(i);
    }
    return s;
  }, [phase, cur, sea]);

  const shareText = useMemo(
    () => (phase === "won" ? buildShareTile(legResults, finalScore, dayKey, variant) : ""),
    [phase, legResults, finalScore, dayKey, variant],
  );

  const onCopy = async () => {
    if (await copyText(shareText)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const g = sea.grid[i];
    const checker = (Math.floor(i / N) + (i % N)) % 2 === 0;
    const isReef = g === REEF;
    const isCurrent = g >= 2;
    const isGoal = i === sea.goal;
    const isStart = i === sea.start;
    const isPlayer = i === cur.pos;
    const legal = legalTargets.has(i);
    cells.push(
      <button
        key={i}
        type="button"
        onClick={() => onCellTap(i)}
        tabIndex={-1}
        style={{
          position: "relative",
          overflow: "hidden",
          border: "none",
          padding: 0,
          margin: 0,
          // On parchment: a translucent teal wash so the warm map reads
          // through while currents/waves stay legible. Without art: the
          // original opaque ink checker.
          backgroundColor: mapArtReady
            ? isReef
              ? "rgba(7,31,41,0.42)"
              : checker
                ? "rgba(10,42,56,0.60)"
                : "rgba(8,36,49,0.64)"
            : isReef
              ? REEF_WATER
              : checker
                ? WATER_A
                : WATER_B,
          backgroundImage: `${WATER_HIGHLIGHT}, ${checker ? WAVES_A : WAVES_B}`,
          backgroundSize: "100% 100%, 100% 100%",
          cursor: legal ? "pointer" : "default",
          touchAction: "manipulation",
        }}
      >
        {isCurrent && (
          <div
            className="hdg-pulse"
            style={{ position: "absolute", inset: 0, transform: `rotate(${DIR_DEG[g - 2]}deg)` }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(150,224,255,0) 14%, rgba(150,224,255,0.09) 50%, rgba(150,224,255,0) 86%)",
              }}
            />
            <svg
              viewBox="0 0 24 24"
              style={{ position: "absolute", inset: 0, margin: "auto", width: "74%", height: "74%" }}
            >
              <path
                d="M7 13 L12 8 L17 13"
                fill="none"
                stroke="#a9e6ff"
                strokeWidth={2.3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 19 L12 14 L17 19"
                fill="none"
                stroke="#a9e6ff"
                strokeWidth={2.3}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.65}
              />
            </svg>
          </div>
        )}
        {isStart && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: "68%",
              height: "68%",
              borderRadius: "50%",
              border: "1.5px solid rgba(240,180,92,0.42)",
              boxShadow: "0 0 0 3px rgba(240,180,92,0.07)",
            }}
          />
        )}
        {isReef && (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: "86%",
                height: "62%",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.17)",
                background: "rgba(255,255,255,0.04)",
              }}
            />
            <img
              src={SPRITE_ROCK}
              alt=""
              draggable={false}
              style={{ position: "absolute", inset: 0, margin: "auto", width: "94%", pointerEvents: "none" }}
            />
          </>
        )}
        {isGoal && (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: "90%",
                height: "90%",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.13)",
                background: "rgba(255,255,255,0.03)",
              }}
            />
            <img
              src={SPRITE_SAND}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: "78%",
                height: "78%",
                borderRadius: "50%",
                objectFit: "cover",
                boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: "78%",
                height: "78%",
                borderRadius: "50%",
                boxShadow: "inset 0 0 0 2px rgba(122,94,52,0.30), inset 0 -3px 6px rgba(122,94,52,0.22)",
                pointerEvents: "none",
              }}
            />
            <img
              src={SPRITE_PALM}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: "52%",
                transform: "translate(-12%, -12%)",
                pointerEvents: "none",
              }}
            />
            <svg
              viewBox="0 0 12 20"
              style={{
                position: "absolute",
                top: "4%",
                right: "16%",
                width: "20%",
                height: "32%",
                pointerEvents: "none",
              }}
            >
              <path d="M2.2 1.5 V18.5" stroke="rgba(70,48,24,0.9)" strokeWidth={1.5} strokeLinecap="round" />
              <path d="M3 2 L11 5.2 L3 8.4 Z" fill={GOLD_BRIGHT} />
            </svg>
          </>
        )}
        {isPlayer && (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "radial-gradient(circle, rgba(240,180,92,0.30), rgba(240,180,92,0) 62%)",
              }}
            />
            <img
              src={SPRITE_SHIP}
              alt=""
              draggable={false}
              className="hdg-ship"
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                height: "74%",
                width: "auto",
                transform: `rotate(${DIR_DEG[cur.dir]}deg)`,
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.45))",
                pointerEvents: "none",
              }}
            />
          </>
        )}
        {legal && (
          <>
            <div style={{ position: "absolute", inset: 0, background: "rgba(240,180,92,0.06)" }} />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            >
              <path
                d="M9 30 V9 H30 M70 9 H91 V30 M91 70 V91 H70 M30 91 H9 V70"
                fill="none"
                stroke="rgba(240,180,92,0.85)"
                strokeWidth={5}
              />
            </svg>
          </>
        )}
      </button>,
    );
  }

  // Cell = min(11vw, 64px) on desktop (512px board); 88vw / 56vh keep mobile
  // and short-window sizing exactly as before.
  const boardSize = phase === "won" ? "min(60vw, 416px, 34vh)" : "min(88vw, 512px, 56vh)";

  return (
    <div
      style={{
        background: INK,
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        overscrollBehavior: "none",
        fontFamily: "system-ui, sans-serif",
        color: FG,
      }}
    >
      <style>{`
        @keyframes hdgPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.95; } }
        .hdg-pulse { animation: hdgPulse 2.6s ease-in-out infinite; }
        .hdg-ship { transition: transform 140ms ease; }
        @media (prefers-reduced-motion: reduce) {
          .hdg-pulse { animation: none; opacity: 0.85; }
          .hdg-ship { transition: none; }
        }
      `}</style>
      <GameHeader title="The Heading" captain={captain} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "12px 0 0",
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "5px 14px",
            background: "linear-gradient(180deg, #0b2531, #04161f)",
            border: "1px solid rgba(240,180,92,0.55)",
            borderRadius: 6,
            boxShadow: "inset 0 1px 0 rgba(255,207,126,0.22), 0 2px 8px rgba(0,0,0,0.45)",
            color: GOLD_BRIGHT,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {phase === "won"
            ? `VOYAGE ${legMovesTotal}/${seaParTotal} · SEA ${variant}/${SEA_VARIANTS} · ${dayKey}`
            : `MAP ${leg + 1} OF ${SERIES_LEN} · PAR ${sea.par} · SEA ${variant}/${SEA_VARIANTS}`}
        </span>
        <span style={{ color: FG3, fontSize: 13 }}>
          👣 {phase === "won" ? legMovesTotal : legMovesTotal + moves}
        </span>
      </div>

      {/* Voyage progress beads: one per map, filled as each leg is cleared. */}
      {phase !== "start" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "8px 0 0",
          }}
        >
          {seas.map((_, k) => {
            const done = phase === "won" || k < leg;
            const active = phase !== "won" && k === leg;
            return (
              <span
                key={k}
                aria-label={`Map ${k + 1} of ${SERIES_LEN}${done ? " cleared" : active ? " in progress" : ""}`}
                style={{
                  width: active ? 22 : 9,
                  height: 9,
                  borderRadius: 6,
                  background: done ? GOLD : active ? GOLD_BRIGHT : "rgba(248,253,255,0.18)",
                  boxShadow: active ? "0 0 8px rgba(255,207,126,0.55)" : undefined,
                  transition: "width 160ms ease, background 160ms ease",
                }}
              />
            );
          })}
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: phase === "won" ? "flex-start" : "center",
          gap: 18,
          padding: "14px 12px 22px",
          overflowY: phase === "won" ? "auto" : "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            width: boardSize,
            aspectRatio: "1 / 1",
            flexShrink: 0,
            touchAction: "none",
          }}
        >
          {/* Chart frame: hairline outer border + inner gold line, parchment corners. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              padding: 8,
              border: `1px solid ${HAIRLINE}`,
              borderRadius: 14,
              backgroundColor: "#03161e",
              backgroundImage: FRAME_CORNERS,
              boxShadow: "0 18px 50px rgba(0,0,0,0.50), 0 0 110px 14px rgba(14,104,134,0.22)",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                border: "1px solid rgba(240,180,92,0.32)",
                borderRadius: 8,
                overflow: "hidden",
                // The board surface itself becomes the aged treasure map; the
                // grid (with its translucent water cells) plots a course ON it.
                backgroundColor: "#03161e",
                backgroundImage: mapArtReady ? `url("${MAP_ART_SRC}")` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${N}, 1fr)`,
                  gridTemplateRows: `repeat(${N}, 1fr)`,
                  width: "100%",
                  height: "100%",
                }}
              >
                {cells}
              </div>
              <svg
                viewBox={`0 0 ${N} ${N}`}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              >
                {cur.trail.length > 1 &&
                  cur.trail.map((t, k) => (
                    <circle
                      key={k}
                      cx={(t % N) + 0.5}
                      cy={Math.floor(t / N) + 0.5}
                      r={0.08}
                      fill={GOLD}
                      opacity={0.92}
                    />
                  ))}
              </svg>
            </div>
          </div>
          {/* No drawn compass rose: the parchment art carries its own, so a
              second one would clash. Kept the frame clean. */}

          {phase === "start" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                background: "rgba(0,15,22,0.93)",
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 14,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                textAlign: "center",
                padding: 16,
              }}
            >
              <div style={{ fontSize: 44, lineHeight: 1 }}>🧭</div>
              <div style={{ color: FG, fontSize: 15 }}>⛵ ➜ 🏝️ · {SERIES_LEN} maps · fewest moves</div>
              <div style={{ color: FG3, fontSize: 13 }}>🪨 = ⛔ · ➡️ = ride a current (+1) · beat par for the perfect line</div>
              <button
                type="button"
                onClick={() => setPhase("play")}
                style={{
                  background: GOLD,
                  color: INK,
                  border: "none",
                  borderRadius: 10,
                  padding: "13px 40px",
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                }}
              >
                START
              </button>
            </div>
          )}
        </div>

        {phase === "play" && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
            <PadButton icon={<UndoIcon />} label="undo" onPress={undo} />
            <PadButton icon={<ArrowIcon deg={270} />} label="left" onPress={() => doMove(2)} />
            <PadButton icon={<ArrowIcon deg={0} />} label="up" onPress={() => doMove(0)} />
            <PadButton icon={<ArrowIcon deg={180} />} label="down" onPress={() => doMove(1)} />
            <PadButton icon={<ArrowIcon deg={90} />} label="right" onPress={() => doMove(3)} />
            <PadButton icon={<RestartIcon />} label="restart" onPress={restart} />
          </div>
        )}

        {phase === "won" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              width: "min(88vw, 416px)",
            }}
          >
            <div style={{ color: GOLD_BRIGHT, fontSize: 16, fontWeight: 600 }}>
              🏝️ Voyage complete · par {seaParTotal} · you {legMovesTotal}
              {legMovesTotal < seaParTotal
                ? ` · ${seaParTotal - legMovesTotal} under par 🏆`
                : legMovesTotal === seaParTotal
                  ? " · made par"
                  : ""}
            </div>
            <div style={{ width: "100%" }}>
              <ScoreBanner state={submitState} result={lastResult} score={finalScore} />
            </div>
            <div
              style={{
                whiteSpace: "pre",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 13,
                lineHeight: 1.25,
                textAlign: "center",
                background: "#03161e",
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 12,
                padding: "12px 18px",
                boxShadow: "inset 0 0 0 1px rgba(240,180,92,0.10), 0 10px 28px rgba(0,0,0,0.40)",
                color: FG3,
              }}
            >
              {shareText}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                onClick={onCopy}
                style={{
                  background: "rgba(240,180,92,0.10)",
                  color: GOLD,
                  border: `1px solid rgba(240,180,92,0.5)`,
                  borderRadius: 10,
                  height: 46,
                  minWidth: 132,
                  padding: "0 24px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
              <button
                type="button"
                onClick={playAgain}
                style={{
                  background: GOLD,
                  color: INK,
                  border: "none",
                  borderRadius: 10,
                  height: 46,
                  minWidth: 132,
                  padding: "0 24px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ▶ Play again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
