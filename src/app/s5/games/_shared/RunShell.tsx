/**
 * S5 RUN SHELL — the one custom page shell every Season 5 game runs on.
 * Generalized from the PROVEN tankbuster (Gunner's Run) page shell, which
 * pioneered the franchise rules the retired GameShell (engine.tsx, since
 * deleted) could not carry:
 *
 * - THE SHARED-SEED DAILY: the first scored run each UTC day seeds from
 *   "s5-<game>-YYYY-MM-DD" (localStorage `s5_<game>_daily`, overridable for
 *   legacy keys), NOT the nonce, so everyone plays the same layout and share
 *   grids are comparable. The nonce handshake still gates every banked score;
 *   a run that ends before the floor does not consume the daily.
 * - DEATH BANKS AFTER THE FLOOR: a death before GAME_RULES[game].floorMs
 *   shows its score but never banks (page + server floor); a death after the
 *   floor banks normally. Skill extends the run; the floor only kills AFK.
 * - AUDIO BORN UNMUTED IN THE START TAP: createSfx(true) inside the user
 *   gesture (autoplay-safe), plus a DOM mute toggle (data-testid
 *   "mute-toggle") over the arena corner. prefers-reduced-motion stays
 *   silent inside the kit regardless.
 * - SHARE GRID + COPY: per-game emoji grid + copyable payload on the result
 *   screen (data-testid "emoji-grid" / "copy-grid").
 * - markFtueRun() ON EVERY RESULT (GameShell had it, the tankbuster shell
 *   did not: that FTUE gap dies here).
 * - THE DOM CONTRACT the retired GameShell established, kept verbatim so
 *   verification is uniform: game-arena[data-phase|data-mode], game-canvas,
 *   launch-overlay, result-overlay, final-score, start-button,
 *   session-panel (via SessionPanel below the arena).
 * - pointerTransform: camera-follow games convert the screen pointer to
 *   WORLD coordinates BEFORE the sim sees input, so sims stay pure
 *   world-space and input tapes replay identically headless. Identity by
 *   default (the sim reads canvas px, like Gunner's Run).
 *
 * MODES (same resolution order as the donor): ?practice=1 = zero server
 * calls; session token = real (nonce + server stats); else guest while
 * guest tries remain, practice-like after. Guest scores park in
 * localStorage until claimed (shared.tsx).
 *
 * STRINGS: chrome copy ships with English defaults matching the donor page;
 * a game may override any of it via the `strings` prop. Arena strings
 * (in-canvas fillText, intro copy) stay with the game. The i18n track wires
 * the localized pack through this prop later; this component deliberately
 * does NOT import the season dict. Six new keys were added in the S5
 * quality pass phase 0 (sprintNote, dailyRoomLeft, localBest, rotateTitle,
 * rotateBody, rotateDismiss) — English-only for now; they need matching
 * entries in src/lib/s5/strings.ts's dict for ko/zh (out of this phase's
 * scope; the merge `{...DEFAULT_STRINGS, ...strings}` degrades safely to
 * English for any key a locale pack has not caught up on yet).
 *
 * FIXED TIMESTEP (S5 quality pass phase 0): the rAF loop no longer feeds the
 * sim a variable per-frame dt. It accumulates real elapsed time and steps
 * the sim in fixed 1/60s quanta (matching scripts/s5-harness.ts's TAPE_DT
 * exactly), 0 or more times per rendered frame, clamped by MAX_SUBSTEPS
 * (spiral-of-death guard: a huge gap — e.g. a backgrounded tab — drops the
 * remainder instead of trying to catch up in one frame). This is what makes
 * the shared-seed daily genuinely the same battlefield on a 60Hz, 120Hz or
 * 144Hz display: game-time now advances in identical steps regardless of
 * how often the browser paints. Rendering is NOT interpolated between sim
 * states (that would need each sim to expose a previous-frame snapshot,
 * which none do, and sims are out of scope here) — every rAF just draws
 * whatever the sim's current state is after however many fixed steps ran
 * that frame. This is the standard, documented simplification of the fixed-
 * timestep pattern (draw-at-display-rate without true interpolation); the
 * only visible cost is a very occasional half-frame of judder on non-60Hz
 * displays, traded for byte-identical game-time everywhere.
 *
 * CANVAS SIZING: the sim's logical W x H (fixed at createSim time from the
 * canvas's CSS box at that moment) is treated as a FIXED coordinate space
 * for the rest of the run. A ResizeObserver on the canvas re-fits that fixed
 * space into the box's CURRENT CSS size (recomputing the DPR-scaled backing
 * store + the canvas transform) on every box-size change, so a mid-run
 * resize/rotation/address-bar-collapse never stretches or clips the canvas
 * — it never changes what the SIM thinks its world size is, only how many
 * device pixels that fixed space is drawn into. See fitCanvasToSim().
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  SESSION_PANEL_DEFAULTS,
  SessionPanel,
  THEME,
  guestRunsLeft,
  recordGuestScore,
  startRun,
  submitScore,
  useS5Session,
  type RunStartResult,
  type RunTank,
  type ScoreResult,
  type SessionPanelStrings,
} from "./shared";
import { createSfx, type Sfx } from "./sfx";
import { GAME_RULES, type PlayerStats } from "@/lib/s5/games";
import { markFtueRun } from "@/lib/s5/ftue";

/** The full input surface a game step may read (pointer already transformed
 * to sim coordinates; games that only use a subset just ignore the rest). */
export interface ShellInput {
  px: number | null;
  py: number | null;
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  downKey: boolean;
  space: boolean;
}

export type RunMode = "real" | "guest" | "practice";

export interface ShellView {
  w: number; // canvas CSS px
  h: number;
  /** The fielded tank (cosmetic, draw-side only; null on guest/practice —
   * games fall back to their starter hull sprite). Sims never receive this. */
  tank?: RunTank | null;
  /**
   * THE LIVE POINTER, in the same space the sim receives (pointerTransform is
   * already applied). Draw-side only and never part of sim state, so nothing
   * here can touch a replay.
   *
   * It exists so a game can show what a tap is ABOUT to do -- Armor Clash
   * draws the range ring and the legal/illegal tint of the card you are
   * holding before you commit it. `down` distinguishes a hovering desktop
   * cursor from a finger that is actually on the glass.
   */
  pointer?: { x: number; y: number; down: boolean } | null;
}

/** Extends SessionPanelStrings: the dict's arcade.shell section mirrors this
 * interface key for key, and RunShell hands the session-panel block down to
 * SessionPanel under the arena. */
export interface RunShellStrings extends SessionPanelStrings {
  startIdle: string;
  /** Keyboard controls exist in every game but were never stated. */
  keyboardHint: string;
  /** Label on the collapsed half of a briefing (see _shared/GameIntro). Lives
   * in the shell strings because every game's briefing uses the same fold. */
  howItWorks: string;
  startAgain: string;
  /** Suffix after the big score number ("damage"); empty = number only. */
  scoreUnit: string;
  dailyBadge: string;
  dailyResultNote: string;
  practiceBadge: string;
  copyIdle: string;
  copyDone: string;
  muteOn: string;
  muteOff: string;
  banking: string;
  /** {secs} */
  tooFast: string;
  /** {best} {left} {runWord} {points} */
  guestParked: string;
  guestSpent: string;
  lastRun: string;
  newBest: string;
  noImprove: string;
  /** {pts} {points} */
  bankedPlus: string;
  /** {points} */
  bankedAlready: string;
  /** {n} {runWord} */
  attemptsLeft: string;
  netFail: string;
  startFail: string;
  /** {attempts} {points} */
  footReal: string;
  footPractice: string;
  practiceLink: string;
  realLink: string;
  arcade: string;
  /** {bonus} — shown when a banked run paid the siege-sprint bonus. */
  sprintNote: string;
  /** {n} {points} — the ARCADE Medals still available to this wallet today.
   * NOT the 40/day all-activity ceiling: the arcade pays once a day. */
  dailyRoomLeft: string;
  /** {best} — a localStorage-only number to beat, shown outside the daily too. */
  localBest: string;
  rotateTitle: string;
  rotateBody: string;
  rotateDismiss: string;
}

const DEFAULT_STRINGS: RunShellStrings = {
  startIdle: "Start",
  keyboardHint: "Keyboard works too: arrows or WASD to move, space to fire.",
  howItWorks: "How it works",
  startAgain: "Play again",
  scoreUnit: "",
  dailyBadge: "Daily gauntlet",
  dailyResultNote: "The daily gauntlet · the same battlefield for everyone today",
  practiceBadge: "Practice, nothing banked",
  copyIdle: "Copy result",
  copyDone: "Copied. Paste it in the raid channel.",
  muteOn: "SFX ON",
  muteOff: "SFX OFF",
  banking: "Banking…",
  tooFast: "Too quick to count. Runs bank after {secs} seconds. Push deeper.",
  guestParked: "Parked in this browser: best {best}. {left} guest {runWord} left today. Enlist below to bank {points}.",
  guestSpent: "Guest runs for today are used. This one was practice. Enlist below to bank scores.",
  lastRun: "That was your last run today. Come back tomorrow.",
  newBest: "New daily best!",
  noImprove: "No improvement on today's best.",
  bankedPlus: "+{pts} {points} banked",
  bankedAlready: "{points} for today already banked",
  attemptsLeft: "{n} {runWord} left today",
  netFail: "Network hiccup. Your score did not bank.",
  startFail: "Could not open a run. Try again.",
  footReal: "Best of {attempts} runs a day counts, and a better score earns more {points}. Holding a domain is where the money is; the arcade earns {points} and Shells for your garage.",
  footPractice: "Practice arena. Scores here never save and never bank.",
  practiceLink: "Warm up in practice mode",
  realLink: "Ready to run it for real?",
  arcade: "‹ Arcade",
  sprintNote: "The front is reacting today: this run banked a +{bonus} bonus.",
  dailyRoomLeft: "{n} {points} left in the arcade today.",
  localBest: "Browser best: {best}",
  rotateTitle: "Turn your device",
  rotateBody: "This arena needs more height than your screen has right now. Rotate to portrait, or continue anyway.",
  rotateDismiss: "Continue anyway",
  ...SESSION_PANEL_DEFAULTS,
};

function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Live reduced-motion for RENDER paths: starts false (so SSR and the first
 * client render agree), syncs in an effect, and follows an OS toggle without
 * a reload. The module const above stays for imperative//client-only reads. */
function useReducedMotionLive(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);
  return reduced;
}

// ── fixed timestep + canvas sizing constants ────────────────────────────────
const FIXED_DT = 1 / 60; // matches scripts/s5-harness.ts's TAPE_DT exactly
const MAX_SUBSTEPS = 8; // spiral-of-death guard: drop the remainder past this
// 2, and it was briefly 3: on a DPR-3 phone a 400x700 canvas rasterises ~2.5M
// pixels a frame through 200-330 vector ops, and nobody can see the third
// pixel of density on a 6-inch screen. Half the fill budget back for free
// (the 2026-08 mini-game upgrade plan, renderer fix #1).
const DPR_CAP = 2;
/** Below this viewport height, the arena's own 3:4 formula collapses toward
 * the ~116px-wide arena the audit flagged; show the rotate guard instead. */
const SHORT_VIEWPORT_H = 480;

/**
 * Fit the sim's fixed logical W x H (baked in at createSim time; every draw
 * call and every hit-test is expressed in it) into the canvas's CURRENT CSS
 * box, scaling the backing store to the box's real device-pixel size. The
 * sim's coordinate space keeps meaning the same thing for the whole run —
 * only the zoom into it changes — so a mid-run box resize (rotation, an
 * address bar collapsing, a window drag) never stretches, clips or
 * re-centers anything. Called once at run start and again on every
 * ResizeObserver tick. Returns the box's current CSS px size so the caller
 * can keep viewRef in sync (ShellView.w/h stays "canvas CSS px", as
 * documented on the interface, even though the sim's own logical size may
 * now differ from it).
 */
function fitCanvasToSim(cv: HTMLCanvasElement, simW: number, simH: number): { cssW: number; cssH: number } {
  const rect = cv.getBoundingClientRect();
  const cssW = rect.width >= 50 ? rect.width : simW;
  const cssH = rect.height >= 50 ? rect.height : simH;
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const scale = Math.min((cssW * dpr) / simW, (cssH * dpr) / simH) || dpr;
  cv.width = Math.max(1, Math.round(simW * scale));
  cv.height = Math.max(1, Math.round(simH * scale));
  const ctx = cv.getContext("2d");
  if (ctx) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }
  return { cssW, cssH };
}

// ── localStorage personal-best layer (real + guest modes; practice stays
// fully ephemeral, matching its own "never saves" promise) ─────────────────
const LS_PB_PREFIX = "s5_pb_";
function readLocalBest(game: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(LS_PB_PREFIX + game);
    const n = raw ? Number(JSON.parse(raw)) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
function writeLocalBest(game: string, score: number): void {
  try {
    localStorage.setItem(LS_PB_PREFIX + game, JSON.stringify(Math.max(0, Math.round(score))));
  } catch {
    // storage blocked: the local-best layer just does not persist
  }
}

/** Animate a number counting up to `target` while `active`; snaps straight
 * to `target` under reduced motion or while inactive. Module-scope hook,
 * used only by the "new best" celebration on the result screen. */
function useCountUp(target: number, active: boolean, ms = 700): number {
  const [display, setDisplay] = useState(target);
  useEffect(() => {
    if (!active || REDUCED_MOTION) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, ms]);
  return display;
}

/** A small DOM/CSS confetti burst for the "new best" moment. No @keyframes
 * (this file's whole styling convention is inline `style` objects): pieces
 * mount at their start position, then flip to their end position one rAF
 * later so the CSS `transition` animates between the two (classic two-render
 * FLIP), which is why it needs no injected stylesheet. Gated by the caller
 * on REDUCED_MOTION — this component always renders its pieces motionless
 * and instantly, so only mount it when motion is wanted. */
interface ConfettiPiece {
  dx: number;
  dy: number;
  rot: number;
  color: string;
  delay: number;
}
function ConfettiBurst({ n = 18, colors }: { n?: number; colors: string[] }) {
  const [armed, setArmed] = useState(false);
  const piecesRef = useRef<ConfettiPiece[] | null>(null);
  if (!piecesRef.current) {
    piecesRef.current = Array.from({ length: n }, () => ({
      dx: (Math.random() - 0.5) * 220,
      dy: -40 - Math.random() * 170,
      rot: (Math.random() - 0.5) * 480,
      color: colors[Math.floor(Math.random() * colors.length)] ?? "#f0b340",
      delay: Math.random() * 130,
    }));
  }
  const pieces: ConfettiPiece[] = piecesRef.current;
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden="true">
      {pieces.map((p, i) => {
        const style: React.CSSProperties = {
          position: "absolute",
          left: "50%",
          top: "30%",
          width: 6,
          height: 10,
          background: p.color,
          borderRadius: 1,
          transform: armed ? `translate(${p.dx}px, ${p.dy}px) rotate(${p.rot}deg)` : "translate(0,0) rotate(0deg)",
          opacity: armed ? 0 : 1,
          transition: `transform 900ms cubic-bezier(.15,.7,.3,1) ${p.delay}ms, opacity 700ms ease-in ${p.delay + 260}ms`,
        };
        return <span key={i} style={style} />;
      })}
    </div>
  );
}

export interface RunShellProps<S> {
  /** Stable registry key (GAME_RULES / routes / storage). */
  game: string;
  title: string;
  accent: string;
  /** Legacy localStorage override; default `s5_<game>_daily`. */
  dailyLsKey?: string;
  /** Build one run's sim. Called inside the Start flow with the resolved
   * seed and the server-clamped stats (null on guest/practice). Games reset
   * their own per-run page state (fx caches, audio prevs) in here. */
  createSim: (w: number, h: number, seed: string, reduced: boolean, stats: PlayerStats | null) => S;
  step: (s: S, dt: number, input: ShellInput) => void;
  draw: (ctx: CanvasRenderingContext2D, s: S, view: ShellView) => void;
  done: (s: S) => boolean;
  score: (s: S) => number;
  /** Sim/world dimensions from the canvas CSS size; identity when omitted. */
  worldSize?: (cssW: number, cssH: number) => { w: number; h: number };
  /** Arena box aspect (width / height). Default 3/4, the franchise portrait
   * standard every game shipped on. ROLL OUT is a side-scroller and passes
   * 16/10: fitCanvasToSim sizes the backing store to the SIM's aspect and
   * CSS-stretches it into this box, so the box aspect and the sim aspect have
   * to agree or the picture distorts. Changing this alone is not enough for a
   * landscape game: pass `worldSize` too, so the sim dims are pinned rather
   * than read off whatever the CSS box happened to measure. */
  aspect?: number;
  /** Screen (canvas CSS px) -> sim/world input coords, applied every frame
   * BEFORE the sim sees the pointer. Identity when omitted. */
  pointerTransform?: (x: number, y: number, s: S) => { x: number; y: number };
  /** Per-frame page-side reactions (audio on sim deltas). Never step logic. */
  onFrame?: (s: S, sfx: Sfx) => void;
  /** Extra meta posted with a banked score. */
  runMeta?: (s: S, ctx: { daily: boolean; grid: string }) => Record<string, unknown>;
  /** Emoji grid + copyable payload for the result screen. */
  shareBuild?: (s: S, dayKey: string) => { grid: string; payload: string };
  resultHeadline?: (s: S) => string;
  resultSub?: (s: S) => string;
  /** Idle-card body under the title (instructions; the game's own copy). */
  intro?: React.ReactNode;
  strings?: Partial<RunShellStrings>;
  /** Sound names to warm via sfx.prefetch() at run start (see _shared/audio.ts
   * + _shared/sfx.ts). Optional: a game that omits this still works fine —
   * every sfx.play()/loop() call warms its own name on first use anyway,
   * this just avoids a possible first-play synth fallback for that name. */
  sfxPack?: readonly string[];
}

export function RunShell<S>({
  game,
  title,
  accent,
  dailyLsKey,
  createSim,
  step,
  draw,
  done,
  score,
  worldSize,
  aspect = 3 / 4,
  pointerTransform,
  onFrame,
  runMeta,
  shareBuild,
  resultHeadline,
  resultSub,
  intro,
  strings,
  sfxPack,
}: RunShellProps<S>) {
  const T: RunShellStrings = { ...DEFAULT_STRINGS, ...strings };
  const LS_DAILY = dailyLsKey ?? `s5_${game}_daily`;

  const session = useS5Session();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<S | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0); // fixed-timestep accumulator, seconds
  const nonceRef = useRef<string | null>(null);
  const statsRef = useRef<PlayerStats | null>(null);
  const modeRef = useRef<RunMode>("practice");
  const dailyRef = useRef(false);
  const dayRef = useRef(dayKeyUTC());
  const startedAtRef = useRef(0);
  const sfxRef = useRef<Sfx | null>(null);
  const mutedRef = useRef(false);
  const simSizeRef = useRef<{ w: number; h: number } | null>(null);
  const viewRef = useRef<ShellView>({ w: 360, h: 480 });
  const pointerRef = useRef<{ x: number | null; y: number | null; down: boolean }>({ x: null, y: null, down: false });
  const keysRef = useRef({ left: false, right: false, up: false, downKey: false, space: false });
  const payloadRef = useRef("");
  // the game's callbacks, re-read every frame so inline props stay fresh
  const fnsRef = useRef({ step, draw, done, onFrame, pointerTransform });
  fnsRef.current = { step, draw, done, onFrame, pointerTransform };
  const onOverRef = useRef<(s: S) => void>(() => {});

  const reducedLive = useReducedMotionLive(); // render-path motion gate (SSR-safe)
  const [phase, setPhase] = useState<"idle" | "playing" | "over">("idle");
  const [finalScore, setFinalScore] = useState(0);
  const [headline, setHeadline] = useState("");
  const [sub, setSub] = useState("");
  const [grid, setGrid] = useState("");
  const [isDaily, setIsDaily] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [guestNote, setGuestNote] = useState<string | null>(null);
  const [banking, setBanking] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [muted, setMuted] = useState(false);
  const [practice, setPractice] = useState(false);
  useEffect(() => {
    setPractice(new URLSearchParams(window.location.search).get("practice") === "1");
  }, []);

  // ── celebration layer state ────────────────────────────────────────────
  const [localBest, setLocalBest] = useState(0);
  const [celebrate, setCelebrate] = useState(false); // this result beat localBest
  const [lastRunToday, setLastRunToday] = useState(false); // this bank was the day's last attempt
  const [resultArmed, setResultArmed] = useState(false); // drives the entrance fade/scale
  useEffect(() => {
    setLocalBest(readLocalBest(game));
  }, [game]);
  useEffect(() => {
    if (phase !== "over") {
      setResultArmed(false);
      return;
    }
    if (REDUCED_MOTION) {
      setResultArmed(true);
      return;
    }
    setResultArmed(false);
    const id = requestAnimationFrame(() => setResultArmed(true));
    return () => cancelAnimationFrame(id);
  }, [phase, finalScore]);
  const shownScore = useCountUp(finalScore, phase === "over" && celebrate);

  // ── landscape guard: a short viewport gets a dismissible prompt instead of
  // the ~116px arena the audit flagged; never traps (always dismissible, and
  // a desktop user with a short window sees the same one-tap dismiss) ──────
  const [shortViewport, setShortViewport] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  useEffect(() => {
    const check = () => setShortViewport(window.innerHeight < SHORT_VIEWPORT_H);
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  const rules = GAME_RULES[game];
  const floorMs = rules ? rules.floorMs : 60000;
  const attempts = rules ? rules.attempts : 3;
  const floorSecs = Math.round(floorMs / 1000);

  const finish = useCallback(
    async (s: S) => {
      const sc = Math.round(score(s));
      const share = shareBuild ? shareBuild(s, dayRef.current) : null;
      payloadRef.current = share ? share.payload : "";
      setFinalScore(sc);
      setGrid(share ? share.grid : "");
      setHeadline(resultHeadline ? resultHeadline(s) : "");
      setSub(resultSub ? resultSub(s) : "");
      setCopied(false);
      setCelebrate(false);
      setLastRunToday(false);
      setPhase("over");
      markFtueRun(); // FTUE quest 2: a result screen rendered in this browser
      sfxRef.current?.stopAll(); // the run just ended: every loop dies here, no exceptions
      const mode = modeRef.current;
      const tooFast = Date.now() - startedAtRef.current < floorMs;
      // the daily is consumed by any run that could bank or park; a sub-floor
      // death does not burn it
      if (!tooFast && dailyRef.current) {
        try {
          localStorage.setItem(LS_DAILY, dayRef.current);
        } catch {
          // storage blocked: the next run just plays the daily again
        }
      }
      // the local personal-best layer: real + guest only (practice stays
      // fully ephemeral, matching its existing "never saves" promise)
      let beatLocal = false;
      if (mode !== "practice" && !tooFast) {
        const prevBest = readLocalBest(game);
        if (sc > prevBest) {
          writeLocalBest(game, sc);
          setLocalBest(sc);
          beatLocal = true;
        }
      }
      if (beatLocal) {
        setCelebrate(true);
        sfxRef.current?.play("fanfare");
        sfxRef.current?.play("pb");
        sfxRef.current?.buzz([16, 40, 16]);
      } else if (!tooFast && mode !== "practice") {
        sfxRef.current?.play("score");
      }
      if (mode === "practice") {
        setGuestNote(null);
        setResult(null);
        return;
      }
      if (tooFast) {
        const msg = fill(T.tooFast, { secs: floorSecs });
        setGuestNote(mode === "guest" ? msg : null);
        setResult(mode === "real" ? { ok: false, error: msg } : null);
        return;
      }
      if (mode === "guest") {
        const { best, left } = recordGuestScore(game, sc);
        setLastRunToday(left === 0);
        setGuestNote(
          fill(T.guestParked, { best, left, runWord: left === 1 ? "run" : "runs", points: THEME.points }),
        );
        return;
      }
      if (!session.token || !nonceRef.current) return;
      setBanking(true);
      const meta = runMeta ? runMeta(s, { daily: dailyRef.current, grid: share ? share.grid : "" }) : { v: 1 };
      const r = await submitScore(session.token, game, sc, nonceRef.current, meta).catch(
        () => ({ ok: false, error: T.netFail }) as ScoreResult,
      );
      setResult(r);
      setLastRunToday(Boolean(r.ok && (r.attemptsLeft ?? -1) === 0));
      setBanking(false);
    },
    // T is rebuilt every render from props; the pieces used here are stable strings
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.token, game, floorMs, floorSecs, score, shareBuild, resultHeadline, resultSub, runMeta, LS_DAILY],
  );
  onOverRef.current = finish;

  // ── the rAF loop (canvas always mounted; the sim exists per run) ──────────
  // FIXED TIMESTEP: the sim is stepped in fixed FIXED_DT quanta via an
  // accumulator, 0+ times per rendered frame, so game-time advances
  // identically regardless of display refresh rate (see the header comment
  // for the full rationale). Rendering just draws whatever the sim's latest
  // state is; it is not interpolated between steps (see header comment).
  // PAUSED (not just throttled) while the tab is hidden via
  // visibilitychange, mirroring HqCanvas's donor pattern: no time
  // accumulates and no audio/CPU runs while the player cannot see it.
  useEffect(() => {
    let raf = 0;
    let running = false;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const cv = canvasRef.current;
      const s = stateRef.current;
      const simDims = simSizeRef.current;
      if (!cv || !s || !simDims) {
        lastRef.current = now;
        return;
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      let frameDt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!(frameDt > 0) || frameDt > 0.25) frameDt = FIXED_DT; // first tick / huge-gap guard
      accRef.current += frameDt;
      const fns = fnsRef.current;
      let steps = 0;
      while (accRef.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
        const p = pointerRef.current;
        let px = p.x;
        let py = p.y;
        if (px != null && py != null && fns.pointerTransform) {
          const w = fns.pointerTransform(px, py, s);
          px = w.x;
          py = w.y;
        }
        const k = keysRef.current;
        const input: ShellInput = {
          px,
          py,
          down: p.down,
          left: k.left,
          right: k.right,
          up: k.up,
          downKey: k.downKey,
          space: k.space,
        };
        fns.step(s, FIXED_DT, input);
        accRef.current -= FIXED_DT;
        steps++;
      }
      if (steps >= MAX_SUBSTEPS) accRef.current = 0; // spiral-of-death guard: drop the remainder
      const sfx = sfxRef.current;
      if (sfx && fns.onFrame) fns.onFrame(s, sfx);
      const view = viewRef.current;
      // The pointer the DRAW pass sees is the same one the sim just stepped
      // with: transformed into world space, and null when it has left the
      // canvas entirely.
      {
        const p = pointerRef.current;
        let px = p.x;
        let py = p.y;
        if (px != null && py != null && fns.pointerTransform) {
          const w = fns.pointerTransform(px, py, s);
          px = w.x;
          py = w.y;
        }
        view.pointer = px != null && py != null ? { x: px, y: py, down: p.down } : null;
      }
      ctx.clearRect(0, 0, simDims.w, simDims.h);
      fns.draw(ctx, s, view);
      if (fns.done(s)) {
        const finished = s;
        stateRef.current = null;
        void onOverRef.current(finished);
      }
    };

    function start() {
      if (running) return;
      running = true;
      lastRef.current = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      sfxRef.current?.stopAll(); // unmount: every loop dies, no exceptions
    };
  }, []);

  // ── ResizeObserver: keep the canvas's backing store fit to its CURRENT CSS
  // box without ever changing what the running sim thinks its world size is
  // (see fitCanvasToSim's header comment). A no-op until a sim exists. ──────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const sim = simSizeRef.current;
      if (!sim || !stateRef.current) return;
      const { cssW, cssH } = fitCanvasToSim(cv, sim.w, sim.h);
      viewRef.current.w = cssW;
      viewRef.current.h = cssH;
    });
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  // ── begin a run: mode -> seed (daily / nonce / entropy) -> sim ────────────
  const begin = useCallback(async () => {
    // AUDIO MUST NEVER BLOCK PLAY. createSfx opens an AudioContext, and a
    // browser is entitled to refuse that (no user gesture yet, autoplay
    // policy, a device with no output). Unguarded, the throw escaped `begin`
    // before it ever reached setPhase, so the Start button did nothing at all
    // and said nothing about why. A silent dead button is the worst failure
    // this shell can have; a silent run without sound is the best one.
    try {
      if (!sfxRef.current) {
        sfxRef.current = createSfx(true); // born unmuted in the Start tap
        sfxRef.current.setMuted(mutedRef.current); // honor a pre-run toggle
      } else {
        sfxRef.current.stopAll(); // no loop from a previous run survives into this one
      }
      if (sfxPack && sfxPack.length) sfxRef.current.prefetch(sfxPack);
    } catch {
      sfxRef.current = null;
    }
    let mode: RunMode;
    let seed: string;
    let daily = false;
    const today = dayKeyUTC();
    dayRef.current = today;
    let dailyOpen = false;
    try {
      dailyOpen = localStorage.getItem(LS_DAILY) !== today;
    } catch {
      dailyOpen = false;
    }
    statsRef.current = null; // guest + practice runs play the stock tank
    viewRef.current.tank = null; // cosmetic fielded tank: real runs re-set it below
    if (practice) {
      mode = "practice";
      nonceRef.current = null;
      seed = `practice-${Date.now()}-${Math.random()}`;
    } else if (session.token) {
      mode = "real";
      setStartError(null);
      const rs: RunStartResult = await startRun(session.token, game).catch(() => ({ ok: false, error: "network" }));
      if (!rs.ok || !rs.nonce) {
        if (/session expired|sign in|fresh run/i.test(rs.error || "")) {
          session.reset();
          return;
        }
        setStartError(rs.error || T.startFail);
        return;
      }
      nonceRef.current = rs.nonce;
      // /api/s5/run-start reads the hq JSONB SERVER-side and returns
      // clampStats() output; every sim re-clamps and every modifier is
      // ceiling-neutral, so taking it from the response is safe.
      statsRef.current = rs.stats ?? null;
      viewRef.current.tank = rs.tank ?? null;
      daily = dailyOpen;
      seed = daily ? `s5-${game}-${today}` : rs.nonce;
    } else if (guestRunsLeft(game) > 0) {
      mode = "guest";
      nonceRef.current = null;
      daily = dailyOpen;
      seed = daily ? `s5-${game}-${today}` : `guest-${Date.now()}-${Math.random()}`;
    } else {
      mode = "practice"; // guest tries spent: keep playing, nothing parks
      nonceRef.current = null;
      seed = `practice-${Date.now()}-${Math.random()}`;
    }
    modeRef.current = mode;
    dailyRef.current = daily;
    setIsDaily(daily);
    startedAtRef.current = Date.now();
    setResult(null);
    setGuestNote(null);
    setPhase("playing");
    requestAnimationFrame(() => {
      const cv = canvasRef.current;
      if (!cv) return;
      // degenerate layouts (hidden tab, mid-transition) fall back to 3:4
      const W = cv.clientWidth >= 50 ? cv.clientWidth : 360;
      const H = cv.clientHeight >= 50 ? cv.clientHeight : 480;
      const sim = worldSize ? worldSize(W, H) : { w: W, h: H };
      simSizeRef.current = sim;
      const { cssW, cssH } = fitCanvasToSim(cv, sim.w, sim.h);
      viewRef.current = { w: cssW, h: cssH, tank: viewRef.current.tank ?? null };
      stateRef.current = createSim(sim.w, sim.h, seed, REDUCED_MOTION, statsRef.current);
      pointerRef.current.down = false;
      accRef.current = 0; // fresh run: no leftover accumulator from a previous one
      lastRef.current = performance.now();
    });
    // T.startFail is a stable default unless overridden per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, practice, game, LS_DAILY, createSim, worldSize, sfxPack]);

  // ── pointer (screen px -> sim px; world transform happens in the loop) ────
  // setPointerCapture on down (below, in the JSX) + onPointerCancel here fix
  // two real input bugs: without capture, a drag off the canvas edge (or a
  // browser gesture stealing the pointer) drops the move/up events entirely
  // and the shell never sees the release, so `down` sticks true and the gun
  // "fires forever"; onPointerCancel (fired for exactly that kind of
  // interruption, plus things like an incoming call or a palm-rejection
  // reroute) is the one release path a canvas can receive even when the
  // pointer never generates a normal pointerup over it.
  const setPointer = (e: React.PointerEvent<HTMLCanvasElement>, down: boolean | null) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const sim = simSizeRef.current;
    const scale = sim ? sim.w / (r.width || 1) : 1;
    pointerRef.current.x = (e.clientX - r.left) * scale;
    pointerRef.current.y = (e.clientY - r.top) * scale;
    if (down != null) pointerRef.current.down = down;
  };
  useEffect(() => {
    const setKey = (e: KeyboardEvent, v: boolean) => {
      // Never steal keys aimed at a real control: this handler is on window,
      // so without this guard Space on a focused button was preventDefault'd
      // and the button never activated.
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === "function" && t.closest("button,a,input,textarea,select")) return;
      const k = keysRef.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "ArrowLeft" || key === "a") k.left = v;
      else if (key === "ArrowRight" || key === "d") k.right = v;
      else if (key === "ArrowUp" || key === "w") k.up = v;
      else if (key === "ArrowDown" || key === "s") k.downKey = v;
      else if (key === " ") {
        k.space = v;
        if (v) e.preventDefault();
      }
    };
    const kd = (e: KeyboardEvent) => setKey(e, true);
    const ku = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const toggleMute = useCallback(() => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    sfxRef.current?.setMuted(m);
  }, []);

  const copyShare = useCallback(async () => {
    const text = payloadRef.current;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  }, []);

  const arena = (
    <>
      <div
        data-testid="game-arena"
        data-phase={phase}
        data-mode={practice ? "practice" : session.token ? "real" : "guest"}
        style={{
          position: "relative",
          width: `min(100%, calc((100dvh - 220px) * ${aspect}))`,
          margin: "0 auto",
          aspectRatio: String(aspect),
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #232a32",
          background: "#0b0d10",
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="game-canvas"
          onPointerDown={(e) => {
            setPointer(e, true);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // unsupported in this environment: input still works, just
              // without the drag-off-the-edge guarantee
            }
          }}
          onPointerMove={(e) => setPointer(e, null)}
          onPointerUp={(e) => setPointer(e, false)}
          onPointerCancel={() => {
            pointerRef.current.down = false;
          }}
          onPointerLeave={() => {
            pointerRef.current.down = false;
          }}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            cursor: phase === "playing" ? "crosshair" : "default",
          }}
        />
        <button
          data-testid="mute-toggle"
          data-muted={muted ? "1" : "0"}
          onClick={toggleMute}
          aria-label={muted ? T.muteOff : T.muteOn}
          style={{
            position: "absolute",
            top: 44,
            right: 10,
            zIndex: 3,
            padding: "5px 9px",
            background: "rgba(10,13,17,0.85)",
            color: "#c9d4dc",
            border: "1px solid #2c333d",
            borderRadius: 7,
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: 1.2,
            cursor: "pointer",
          }}
        >
          {muted ? T.muteOff : T.muteOn}
        </button>
        {phase === "playing" && isDaily && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 2,
              color: accent,
              textTransform: "uppercase",
              pointerEvents: "none",
              textShadow: "0 1px 4px #000",
            }}
          >
            {T.dailyBadge}
          </div>
        )}
        {phase !== "playing" && (
          <div
            data-testid={phase === "over" ? "result-overlay" : "launch-overlay"}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "safe center",
              // Nothing in this overlay may be pushed out of reach. The
              // briefing block below has its own scroll, so this is the
              // backstop for the result panel and for very small viewports.
              overflowY: "auto",
              minHeight: 0,
              gap: 10,
              background: "rgba(8,10,13,0.8)",
              textAlign: "center",
              padding: 24,
            }}
          >
            {practice && (
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(94,234,212,0.5)",
                  color: "#5eead4",
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {T.practiceBadge}
              </div>
            )}
            {phase === "over" && (
              <div
                role="status"
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  opacity: reducedLive || resultArmed ? 1 : 0,
                  transform: reducedLive || resultArmed ? "scale(1)" : "scale(0.94)",
                  transition: reducedLive ? undefined : "opacity 260ms ease, transform 260ms cubic-bezier(.2,.8,.3,1.2)",
                }}
              >
                {celebrate && !reducedLive && <ConfettiBurst colors={[accent, "#ffd98a", "#f0b340"]} />}
                {headline && (
                  <div style={{ fontSize: 13, color: "#aab4bd", letterSpacing: 2, textTransform: "uppercase" }}>
                    {headline}
                  </div>
                )}
                <div
                  data-testid="final-score"
                  style={{
                    fontSize: 40,
                    fontWeight: 800,
                    color: celebrate ? accent : "#fff",
                    lineHeight: 1,
                    transform: celebrate && !reducedLive && resultArmed ? "scale(1.1)" : "scale(1)",
                    transition: reducedLive ? undefined : "transform 340ms cubic-bezier(.2,.8,.3,1.4), color 340ms ease",
                  }}
                >
                  {shownScore}
                  {T.scoreUnit && <span style={{ fontSize: 14, color: "#aab4bd", fontWeight: 700 }}> {T.scoreUnit}</span>}
                </div>
                {sub && <div style={{ fontSize: 12.5, color: "#c9d4dc" }}>{sub}</div>}
                {isDaily && (
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: accent, textTransform: "uppercase" }}>
                    {T.dailyResultNote}
                  </div>
                )}
                {grid && (
                  <div
                    data-testid="emoji-grid"
                    style={{ fontSize: 19, letterSpacing: 3, lineHeight: 1.25, display: "flex", flexDirection: "column", alignItems: "center" }}
                  >
                    {grid.split("\n").map((row, i) => (
                      <div
                        key={i}
                        style={{
                          whiteSpace: "pre",
                          opacity: reducedLive || resultArmed ? 1 : 0,
                          transform: REDUCED_MOTION || resultArmed ? "translateY(0)" : "translateY(5px)",
                          transition: REDUCED_MOTION
                            ? undefined
                            : `opacity 240ms ease ${i * 70}ms, transform 240ms ease ${i * 70}ms`,
                        }}
                      >
                        {row}
                      </div>
                    ))}
                  </div>
                )}
                {grid && (
                  <button
                    data-testid="copy-grid"
                    onClick={copyShare}
                    style={{
                      padding: "9px 20px",
                      background: "transparent",
                      color: "#e9edf1",
                      border: "1px solid #3d4454",
                      borderRadius: 9,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {copied ? T.copyDone : T.copyIdle}
                  </button>
                )}
                {guestNote ? (
                  <div data-testid="guest-note" style={{ color: "#c9d4dc", fontSize: 13, lineHeight: 1.5, maxWidth: 300 }}>
                    {guestNote}
                    {lastRunToday && <div style={{ marginTop: 6, fontWeight: 700 }}>{T.lastRun}</div>}
                  </div>
                ) : banking ? (
                  <div style={{ color: "#aab4bd", fontSize: 14 }}>{T.banking}</div>
                ) : result?.ok ? (
                  <div style={{ color: "#86f0c4", fontSize: 13.5, lineHeight: 1.5 }}>
                    {(result.points ?? 0) > 0
                      ? fill(T.bankedPlus, { pts: result.points ?? 0, points: THEME.points })
                      : fill(T.bankedAlready, { points: THEME.points })}
                    {(result.shells ?? 0) > 0 ? (
                      <span style={{ color: "#f0b340", fontWeight: 700 }}>
                        {"  +" + (result.shells ?? 0) + " " + THEME.playCurrency}
                      </span>
                    ) : null}
                    <br />
                    <span style={{ color: result.improved ? accent : "#87919b", fontWeight: result.improved ? 700 : 400 }}>
                      {result.improved ? T.newBest : T.noImprove}{" "}
                      {"· " +
                        fill(T.attemptsLeft, {
                          n: result.attemptsLeft ?? 0,
                          runWord: (result.attemptsLeft ?? 0) === 1 ? "run" : "runs",
                        })}
                    </span>
                    {Boolean(result.sprint) && (result.sprintBonus ?? 0) > 0 && (
                      <div style={{ color: accent, marginTop: 4 }}>
                        {fill(T.sprintNote, { bonus: result.sprintBonus ?? 0 })}
                      </div>
                    )}
                    {typeof result.dailyPointsLeft === "number" && (
                      <div style={{ color: "#87919b", marginTop: 4 }}>
                        {fill(T.dailyRoomLeft, { n: result.dailyPointsLeft, points: THEME.points })}
                      </div>
                    )}
                    {lastRunToday && <div style={{ color: "#c9d4dc", marginTop: 6, fontWeight: 700 }}>{T.lastRun}</div>}
                  </div>
                ) : result?.already ? (
                  <div style={{ color: "#87919b", fontSize: 13.5 }}>{T.lastRun}</div>
                ) : result?.error ? (
                  <div style={{ color: "#f8b37a", fontSize: 13, lineHeight: 1.5 }}>{result.error}</div>
                ) : modeRef.current === "practice" && !practice ? (
                  <div style={{ color: "#87919b", fontSize: 13, maxWidth: 300, lineHeight: 1.5 }}>{T.guestSpent}</div>
                ) : null}
              </div>
            )}
            {phase === "idle" && (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, color: accent }}>{title}</div>
                {/* THE BRIEFING SCROLLS, THE BUTTON DOES NOT. Every game was
                    portrait until Roll Out, which is 16:10: the same briefing
                    in a box half as tall pushed the start button off the
                    bottom, where it could not be reached at all. Bounding the
                    copy keeps the one control that matters on screen at any
                    aspect, without cutting a word of the briefing. */}
                <div style={{ overflowY: "auto", minHeight: 0, maxWidth: "100%" }}>{intro}</div>
                {localBest > 0 && (
                  <div style={{ fontSize: 12, color: "#87919b" }}>{fill(T.localBest, { best: localBest })}</div>
                )}
                <div style={{ fontSize: 11.5, color: "#87919b" }}>{T.keyboardHint}</div>
              </>
            )}
            <button
              data-testid="start-button"
              onClick={begin}
              style={{
                marginTop: 4,
                padding: "13px 30px",
                background: accent,
                color: "#1a1205",
                border: "none",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {phase === "over" ? T.startAgain : T.startIdle}
            </button>
            {startError && <div style={{ color: "#f87171", fontSize: 13 }}>{startError}</div>}
          </div>
        )}
        {shortViewport && !rotateDismissed && (
          <div
            data-testid="rotate-prompt"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "rgba(8,10,13,0.94)",
              textAlign: "center",
              padding: 24,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, color: accent }}>{T.rotateTitle}</div>
            <p style={{ fontSize: 13, color: "#c9d4dc", lineHeight: 1.5, maxWidth: 280, margin: 0 }}>{T.rotateBody}</p>
            <button
              data-testid="rotate-dismiss"
              onClick={() => setRotateDismissed(true)}
              style={{
                marginTop: 4,
                padding: "11px 22px",
                background: "transparent",
                color: "#e9edf1",
                border: "1px solid #3d4454",
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {T.rotateDismiss}
            </button>
          </div>
        )}
      </div>
      <p style={{ color: "#87919b", fontSize: 12, marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
        {practice ? T.footPractice : fill(T.footReal, { attempts, points: THEME.points })}
        <br />
        {practice ? (
          <a
            href={`/s5/games/${game}`}
            style={{ color: "#aab4bd", display: "inline-block", padding: "13px 10px", margin: "-13px -10px" }}
          >
            {T.realLink}
          </a>
        ) : (
          <a
            href={`/s5/games/${game}?practice=1`}
            style={{ color: "#aab4bd", display: "inline-block", padding: "13px 10px", margin: "-13px -10px" }}
          >
            {T.practiceLink}
          </a>
        )}
      </p>
    </>
  );

  return (
    <main
      id="s5-content"
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(1000px 500px at 50% -10%, #171c22 0%, #0b0d10 60%)",
        color: "#e9edf1",
        padding: "84px 16px 56px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Link
            href="/s5/play"
            style={{
              color: "#c9d4dc",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              padding: "0 10px",
              margin: "-11px 0 -11px -10px",
            }}
          >
            {T.arcade}
          </Link>
          <span style={{ fontSize: 12, letterSpacing: 2, color: accent, textTransform: "uppercase", fontWeight: 700 }}>
            {title}
          </span>
        </div>

        {arena}
        {!practice && <SessionPanel session={session} accent={accent} game={game} strings={T} />}
      </div>
    </main>
  );
}

export function dayKeyUTC(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
