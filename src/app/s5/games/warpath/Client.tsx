/**
 * SEASON 5 · IRON SIEGE — WARPATH client (game key stays "warpath")
 * Top-down last-stand defence in a river valley, WORLD-SPACE edition (slate
 * plan section 6): the sim runs a world 1.9x the view wide and 1.6x tall, the
 * convoy spreads over 1.4 view widths of road, and this renderer drives a
 * CAMERA over it — velocity-led follow cam, off-screen truck chevrons
 * (hp-tinted, magenta ping when threatened) and a top minimap strip (road,
 * trucks, player, drop, the Optics next-bank flag) so the supply-drop triage
 * reads from anywhere on the line. DRIVING is the core verb now.
 *
 * SIM/DRAW SPLIT: all rules live in ./sim (pure, node-runnable, two RNG
 * streams so cosmetics never shift a gameplay roll). Scoring, the wave table
 * and the exact maxScore ceiling math are documented there; ceiling() now
 * computes 6357 (the VARIETY & ARC pass, see sim.ts). The camera is PAGE state:
 * RunShell's pointerTransform converts the held screen point to WORLD
 * coordinates before the sim sees input, so the sim stays pure world-space
 * and the harness tapes (./tape.ts) replay identically headless.
 *
 * SHELL: RunShell (../_shared/RunShell) — shared-seed daily
 * ("s5-warpath-YYYY-MM-DD"), 3x5 wave-grid share + copyable payload,
 * death-banks-after-the-60s-floor, audio born unmuted in the Start tap, the
 * DOM mute toggle, markFtueRun on every result, guest and practice modes,
 * the nonce handshake on every banked score.
 *
 * ART: painted sprites via loadManifest("warpath", ...) with the primitive
 * vector fallback on every draw (art can land or slip with zero code risk).
 * The sim's "sapper" renders as a tracked DEMOLITION DRONE — the S5 roster is
 * machines-only, so the re-skin is display-side; the sim keeps its internal
 * name.
 *
 * B+ PASS (2026-07-26): this file adopts the shared page-fx layer
 * (../_shared/pagefx — camera shake/recoil, ambient motes/streaks, the cheer
 * flourish) and the shared SFX loop API (eng-tank for the hull, rate rising
 * with speed; eng-truck for the convoy, gain following trucks alive), plus
 * ../_shared/art's longShadow/casing helpers. On top of that:
 *  - GROUND SHADOWS on every truck, foe and the player hull.
 *  - TELEGRAPHS drawn ON cars/heavies (a body glow reading f.telegraph, the
 *    sim's own fireCd countdown — no UI rectangle).
 *  - IDLE ANIMATION on every foe: a state-tiered blink for drones (slow while
 *    walking, fast while planting), an idle bob for cars/heavies at range,
 *    tread-stripe scroll while any of them are moving.
 *  - TWO TYPOGRAPHIC REGISTERS: DISPLAY_FONT (a stencil/era face) for every
 *    diegetic banner/plate title, HUD_FONT (neutral sans) for the HUD and for
 *    plate subtitles — both appear on the SAME plate on purpose.
 *  - THE FINAL ASSAULT GATE UI: two tap zones (IRON HULL / HOT SHELLS) with a
 *    countdown ring, reading sim.choicePending/choiceT.
 *  - CINEMATICS: the RELIEF COLUMN win is a camera push-in + pan toward the
 *    convoy + a warm wash + the cheer flourish, not a frozen world with
 *    words; FINAL ASSAULT's entrance gets a punch-in zoom pulse; a convoy
 *    loss gets a somber red wash. All keyed off sim state edges, computed
 *    here (cineRef), never in the sim.
 *  - A WAVE-INCOMING drum roll: while waveBreakT counts down between waves
 *    (and it is not the choice gate), a shrinking ring + a soft tap-tick
 *    fills what used to be ~1.8s of dead air.
 *  - Ejected shell casings (art.ts's casing() factory) on every shot — pure
 *    page cosmetic, Math.random is fine here (this file is never imported by
 *    the sim).
 *
 * FEEL: tread marks, chute drift, demolition fuses that tick before they
 * blow, a dashed gun-range ring so the triage constraint is visible rather
 * than guessed at. Hostiles carry a MAGENTA glow (the S3 colorblind lesson).
 * prefers-reduced-motion kills shake/flash/zoom and thins particles (fx
 * stream only; gameplay rolls untouched). Cartoon KOs, zero blood, machines
 * only.
 */
"use client";

import { useCallback, useRef } from "react";
import { RunShell, type RunShellStrings, type ShellView } from "../_shared/RunShell";
import { GameIntro } from "../_shared/GameIntro";
import { type Sfx, type SfxLoopHandle } from "../_shared/sfx";
import { canvasTex,casing, type CasingParticle, loadManifest, ready, spr, sprRot, stripRot } from "../_shared/art";
import {
  beginCameraFx,
  createPageFx,
  drawCheer,
  drawMotes,
  drawStreaks,
  endCameraFx,
  stepPageFx,
  type PageFx,
} from "../_shared/pagefx";
import { type PlayerStats } from "@/lib/s5/games";
import {
  BOOST_T,
  CHOICE_CONFIRM_T,
  CHOICE_T,
  DROP_FALL_T,
  DROP_LIFE,
  FUSE_T,
  HASTE_T,
  RANGE_T,
  RAPID_T,
  RUN_MAX_WAVES,
  SPREAD_T,
  TRUCKS,
  TRUCK_HP,
  WAVE_BREAK,
  createWarpath,
  effRange,
  gridEmoji,
  warpathDone,
  warpathScore,
  warpathSquadAlive,
  nextSpawnPreview,
  sharePayload,
  stepWarpath,
  type Drop,
  type DropKind,
  type Foe,
  type WarpathState,
} from "./sim";

const GAME = "warpath"; // the stable registry key
const TITLE = "Warpath";
const ACCENT = "#34d399"; // the arcade tile accent for warpath
const MAGENTA = "#e879f9"; // hostile glow (colorblind-safe vs the green player)
const AMBER = "#f0b340";
const GOLD = "#f0b340";
const WHITE = "#eef2f8";
const MUTED = "#aab4bd";
/* THE CARTOON REGISTER (ADR-0086). These were near-black -- #12161a floor,
 * #161b18 banks -- from the grimdark wave, and were only ever seen through a
 * bright painted plate laid over the top of them. With the plate gone they are
 * the actual picture, so they are the daylight valley the game is set in. Kept
 * a clear step duller and darker than any unit, which is what lets a tank read
 * against them. */
const GROUND = "#6f9b4e";

/** Baked once: grass speckle and blade chop for the valley floor. */
let FIELD_TEX: CanvasImageSource | null = null;
function bakeField() {
  if (FIELD_TEX) return;
  let seed = 0x85ebca6b;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  FIELD_TEX = canvasTex(96, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      const a = 0.045 + rnd() * 0.075;
      g.fillStyle = rnd() < 0.5 ? `rgba(34,58,26,${a})` : `rgba(196,224,152,${a})`;
      g.fillRect(rnd() * w, rnd() * h, 0.8 + rnd() * 1.5, 0.8 + rnd() * 1.5);
    }
    for (let i = 0; i < 34; i++) {
      g.strokeStyle = `rgba(40,68,30,${0.04 + rnd() * 0.05})`;
      g.lineWidth = 0.7 + rnd() * 1.0;
      const x = rnd() * w;
      const y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 1.5 + rnd() * 4, y - 3 - rnd() * 5);
      g.stroke();
    }
  });
}
/** frames per baked strip (art-src/baked/strips/manifest.json) */
const STRIP_FRAMES = 4;
/** the turret cap's centre sits 12.9% of the cell aft of model centre in the
 * bake — measured, not tuned. The turret pivots THERE, riding the hull. */
const TURRET_RING_AFT = 0.129;

/** A soft CONTACT shadow hugging the feet, same recipe Armor Clash settled
 * on: the franchise longShadow threw a hard evening ellipse a full radius
 * sideways, which under small pieces read as pasted puddles. */
function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = "rgba(26,38,18,0.32)";
  ctx.beginPath();
  ctx.ellipse(x + r * 0.1, y, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Frame-invariant gradients, built once per world size (the plan's "hoist
 * gradients out of the draw loop" fix). Keyed on H because every one of these
 * is a function of the world rect and the road line only. */
const GRADS: {
  h?: number;
  floor?: CanvasGradient;
  bankTop?: CanvasGradient;
  bankBot?: CanvasGradient;
  roadG?: CanvasGradient;
  vig?: CanvasGradient;
  vigW?: number;
} = {};

const BANK = "#5b7f42";
const ROAD = "#b9a577";
const TRUCK_BODY = "#a2793f";
const TRUCK_CAB = "#7d5b2d";
// Lifted from #2f6b52. That was dark enough that a 24px hull under a
// near-white rim read as a black box with a neon outline, not a tank.
const PLAYER_BODY = "#4f9b74";
/** THE ALLY LIVERY. Your squad and you share it, so "mine" is one colour and
 * "theirs" is one colour, and neither depends on reading a silhouette. */
const ALLY_BODY = "#3f9e63";
const ALLY_DARK = "#2c7a4b";
const ALLY_RIM = "#d8f5e4";

// two typographic registers (checklist): DISPLAY_FONT is the diegetic
// stencil/era face for every banner/plate title; HUD_FONT is the neutral
// sans everything else (score, labels, plate subtitles) already used. A
// system font stack, deliberately: zero new assets, zero load risk.
const DISPLAY_FONT = "Impact, 'Arial Narrow Bold', sans-serif";
const HUD_FONT = "ui-sans-serif, system-ui, sans-serif";

// mirrors sim.ts constants that are not exported (display-only approximations;
// a drift here only ever costs a slightly-off animation curve, never a
// gameplay or determinism bug, since none of this feeds back into the sim)
const MUZZLE_T = 0.07; // fireGun()'s s.muzzle starting value
const PLAYER_SPEED_APPROX = 140; // PLAYER_SPEED, for the engine-loop rate curve

/** Display names only: the sim's internal kind strings are unchanged. The
 * sapper is re-skinned as a tracked demolition drone (machines-only rule). */
const KIND_LABEL: Record<Foe["kind"], string> = { sapper: "DRONE", car: "CAR", heavy: "HEAVY", boss: "SIEGEBREAKER" };

/** One tint + label per crate kind (crate paint, floor label, HUD pill and
 * minimap diamond all agree). Repair green, the six power-ups each their own
 * lane; nothing here reuses the hostile magenta. */
const DROP_TINT: Record<DropKind, string> = {
  repair: ACCENT,
  ammo: AMBER,
  twin: "#7dd3fc",
  spread: "#fb923c",
  rapid: "#fde047",
  haste: "#22d3ee",
  range: "#a3e635",
};
// ── ARENA i18n (page-side only; sim text is tape-frozen English) ─────────────
// AR comes from strings.ts (en = {}); the component assigns it before any
// draw. Patterns localize the sim's "WAVE n: NAME" banner; misses fall back
// to the English key so a new sim string can never blank the HUD.
let AR: Record<string, string> = {};
const T = (x: string): string => {
  const hit = AR[x];
  if (hit) return hit;
  const wm = /^WAVE (\d+): (.+)$/.exec(x);
  if (wm && AR["WAVE_FMT"]) return `${AR["WAVE_FMT"].replace("{n}", wm[1])}: ${AR[wm[2]] ?? wm[2]}`;
  return x;
};
const waveFmt = (n: number): string => (AR["WAVE_FMT"] ?? "WAVE {n}").replace("{n}", String(n));

const DROP_LABEL: Record<DropKind, string> = {
  repair: "REPAIR",
  ammo: "AMMO",
  twin: "TWIN",
  spread: "SPREAD",
  rapid: "DOUBLE",
  haste: "SPEED",
  range: "RANGE",
};

/** Minimap enemy dot colors by kind (Mike round-2: "the enemies need to show
 * up easily seen on the map"). Red drones (the truck-killers), magenta cars,
 * gold heavies; fresh spawns blink for a second so the eye catches the walk-in. */
const MM_FOE_TINT: Record<Foe["kind"], string> = { sapper: "#f87171", car: MAGENTA, heavy: "#f0b340", boss: "#c084fc" };
const MM_SPAWN_FLASH_T = 1.1; // seconds a fresh spawn blinks on the strip

/** Fielded-tank cosmetic (spec 2.5 via ShellView.tank): the DRIVEN hull picks
 * a class-tinted paint job and a touch of visual bulk, and the intro card
 * prints the real tank's name. Draw-side only: the sim's PLAYER_R hitbox and
 * every speed are untouched, guests/practice fall back to the starter
 * (M3 Stuart, scout class). The scale stays subtle on purpose so the art
 * never lies about the hitbox. */
const HULL_STYLE: Record<string, { body: string; scale: number }> = {
  scout: { body: PLAYER_BODY, scale: 1 },
  cavalry: { body: "#55a07d", scale: 1.04 },
  battle: { body: "#5aa374", scale: 1.08 },
  siege: { body: "#63a76b", scale: 1.12 },
  superheavy: { body: "#6cac66", scale: 1.16 },
};
const STARTER_NAME = "M3 Stuart";

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// painted cutouts; every draw keeps its vector fallback (art.ts contract)
/* NO truck/truck-cab. Those are the previous game's supply lorries; this
 * game's `trucks` are three friendly TANKS (the sim keeps the old field name,
 * see its header). Drawn below so they read as armour, and as ALLIES. */
const ART = loadManifest("warpath", [
  // NEW for the art pass. Every one of these has a vector fallback at its draw
  // site, so a name that never lands costs nothing.
  "foe-bruiser",
  // the player is BAKED (tank1 hull strip + turret sprite from /dev/bake);
  // the AI-painted player plates are retired, the vector tank is the fallback
  "units/hull-mine",
  "units/turret-mine",
  // BAKED SCENERY (2026-08-02): boulders and conifers, replacing the AI rock
  // plates and the drawn crest discs. rock-a/rock-b stay as the fallback tier.
  "scn/rock-a",
  "scn/rock-b",
  "scn/tree-a",
  "scn/tree-b",
  "rock-a",
  "rock-b",
  "wreck",
  "truck",
  /* NO bg-valley. Same call as Armor Clash's pitch: an AI painting tiled at
   * 256px reads as smeared dirt next to crisp baked units. The floor is drawn
   * below out of the baked speckle + deterministic ground life. */
  "foe-car",
  "foe-heavy",
  "foe-drone",
  "drop-chute",
  "drop-crate",
  "fx-muzzle",
  "fx-boom",
  /* NO bg-field. It was a painted village, and the sim has no village: you
   * drove through cottages because there were no cottages, and every prop was
   * drawn at the same size and contrast as a tank, so the tanks vanished into
   * the scenery. The floor is drawn below, out of things that exist. */
] as const);

// the sfx pack this game actually calls (RunShell prefetches it at run start)
const SFX_PACK = [
  "cannon",
  "hit",
  "clank",
  "explode",
  "blast",
  "hurt",
  "warn",
  "reload",
  "pickup",
  "powerup",
  "alarm",
  "score",
  "banner",
  "boss",
  "fanfare",
  "tap",
  "ko",
  "eng-tank",
  "eng-truck",
] as const;

// ── page-side camera (cosmetic; the sim never sees it) ──────────────────────
interface Cam {
  x: number; // world coords of the view's top-left corner
  y: number;
  vx: number; // smoothed player velocity, world px/s (drives the lead)
  vy: number;
  zoom: number; // cinematic push-in (1 = normal); eased toward cine.zoomTarget
}
const CAM_LEAD = 0.42; // seconds of velocity lead
const CAM_EASE = 5.5; // approach rate, 1/s
const ZOOM_EASE = 2.4; // 1/s

/** Draw-cadence cinematic edge tracking (separate from the audio pass's own
 * prevRef, which runs on whatever cadence onFrame does — see the file
 * header's substep note). Reset per run in createSim. */
interface CineState {
  wave: number;
  win: boolean;
  phase: WarpathState["phase"];
  bannerBigTxt: string | null;
  choicePending: boolean;
  choicePick: -1 | 0 | 1;
  zoomTarget: number;
  pulseT: number; // seconds left on a self-reverting punch-in (FINAL ASSAULT)
  reliefActive: boolean;
  lossActive: boolean;
  washT: number; // 0..1, the relief/loss color wash strength
}

/** DOM-probe hook: canvas pixels cannot be asserted structurally, so the
 * renderer publishes its camera/world numbers each frame. Read-only, tiny,
 * and never consumed by the game itself. */
interface WpDebug {
  phase: WarpathState["phase"];
  px: number;
  py: number;
  camX: number;
  camY: number;
  screenX: number; // player position in view space (camera applied)
  screenY: number;
  worldW: number;
  worldH: number;
  viewW: number;
  viewH: number;
  chevrons: number; // off-screen truck chevrons drawn this frame
  minimap: boolean;
  minimapFoes: number; // live hostiles pinged on the strip this frame
  pills: string[]; // active power-up HUD pills (labels, draw order)
  ringR: number; // firing-radius ring, world px (0 = not drawn this frame)
  ringHot: boolean; // a live target is inside the ring
  drop: { x: number; y: number; kind: string; fall: number } | null;
  wave: number;
  choicePending: boolean;
  bannerBig: boolean;
}
declare global {
  interface Window {
    __wp?: WpDebug;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** RANGING SHOT's crit window, drawn: gold corner brackets on the marked
 * heavy (the tankbuster mark grammar; gold never competes with magenta). */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  const arm = Math.max(2.4, r * 0.42);
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4 * k;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * r, y + sy * r - sy * arm);
    ctx.lineTo(x + sx * r, y + sy * r);
    ctx.lineTo(x + sx * r - sx * arm, y + sy * r);
    ctx.stroke();
  }
  ctx.restore();
}

/** A charging telegraph drawn ON the hostile's own body (checklist: never a
 * UI rectangle). f.telegraph is a pure read of the sim's own fireCd, so this
 * never lies about when the shot actually lands. */
function drawTelegraph(ctx: CanvasRenderingContext2D, f: Foe, k: number) {
  if (f.telegraph <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.3 + f.telegraph * 0.6;
  ctx.strokeStyle = "#fff2c9";
  ctx.lineWidth = (1.2 + f.telegraph * 1.6) * k;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r + 4 * k + f.telegraph * 3 * k, 0, Math.PI * 2);
  ctx.stroke();
  if (f.telegraph > 0.6) {
    ctx.fillStyle = `rgba(255,220,150,${(f.telegraph - 0.6) * 1.6})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Tread-stripe scroll: a state-machine animation rate (checklist) — the
 * stripes advance while the entity actually moves, driven by the sim's own
 * clock, and sit still (never twitching) the instant speed hits 0. */
function drawTreadStripes(ctx: CanvasRenderingContext2D, w: number, h: number, phase: number, k: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.32)";
  ctx.lineWidth = 1.4 * k;
  const step = 5 * k;
  const off = ((phase % step) + step) % step;
  for (let x = -w / 2 - step + off; x < w / 2 + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, -h / 2);
    ctx.lineTo(x, h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function hpTint(frac: number): string {
  return frac > 0.55 ? ACCENT : frac > 0.28 ? AMBER : "#f87171";
}

// ── world-space draws ───────────────────────────────────────────────────────

function drawTruck(ctx: CanvasRenderingContext2D, s: WarpathState, i: number) {
  const tk = s.trucks[i];
  const k = s.k;
  const w = 30 * k;
  const h = 15 * k;
  // PAINTED HULLS, alive and dead. The burn ramp and the smoke wisp below are
  // untouched: tk.burn runs 0 -> 1 over the frames after a kill so a destroyed
  // truck SETTLES into its final look rather than popping, and the smoke is
  // sim-driven. Only the hull under those effects changes.
  const truckArt = tk.alive ? ART.truck : ART.wreck || ART.truck;
  if (ready(truckArt)) {
    contactShadow(ctx, tk.x, tk.y + 7 * k, 12 * k);
    ctx.save();
    ctx.globalAlpha = tk.alive ? 1 : 0.85;
    sprRot(ctx, truckArt, tk.x, tk.y, w * 3.2, tk.a ?? 0, () => {});
    ctx.restore();
    return;
  }
  if (!tk.alive) {
    // burnt-out wreck: tk.burn ramps 0->1 on the frames right after the kill,
    // so the wreck settles into its final look instead of popping there
    // (checklist: never a flat opacity-adjusted sprite) - plus a periodic
    // smoke wisp (sim-driven, see damageTruck/tk.smokeCd) keeps it a living
    // scene rather than a static picture.
    ctx.save();
    contactShadow(ctx, tk.x, tk.y + h * 0.5, w * 0.4);
    ctx.translate(tk.x, tk.y);
    ctx.globalAlpha = 0.72 - tk.burn * 0.22;
    ctx.fillStyle = tk.burn < 1 ? "#4a2c1c" : "#2a2320";
    roundRect(ctx, -w / 2, -h / 2, w, h, 3 * k);
    ctx.fill();
    ctx.strokeStyle = "#3a2c22";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    return;
  }
  contactShadow(ctx, tk.x, tk.y + h * 0.55, w * 0.42);
  ctx.save();
  ctx.translate(tk.x, tk.y);
  if (tk.hit > 0) {
    ctx.shadowColor = "#ffd98a";
    ctx.shadowBlur = 14;
  }
  // A FRIENDLY TANK, plan view, gun forward. Ally green with a pale rim, so
  // one glance separates your squad from the enemy at any distance.
  {
    ctx.lineJoin = "round";
    ctx.fillStyle = "#1f2a24";
    ctx.fillRect(-w / 2, -h / 2 - h * 0.2, w, h * 0.26); // treads
    ctx.fillRect(-w / 2, h / 2 - h * 0.06, w, h * 0.26);
    ctx.fillStyle = ALLY_BODY;
    ctx.strokeStyle = ALLY_RIM;
    ctx.lineWidth = 2;
    roundRect(ctx, -w / 2, -h / 2, w, h, 3 * k);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = ALLY_DARK;
    ctx.beginPath(); // turret
    ctx.arc(-w * 0.06, 0, h * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ALLY_DARK;
    ctx.fillRect(w * 0.02, -h * 0.1, w * 0.52, h * 0.2); // gun
  }
  ctx.shadowBlur = 0;
  ctx.restore();
  // hp strip above the truck
  const frac = Math.max(0, tk.hp / TRUCK_HP);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(tk.x - w / 2, tk.y - h / 2 - 6 * k, w, 2.6 * k);
  ctx.fillStyle = hpTint(frac);
  ctx.fillRect(tk.x - w / 2, tk.y - h / 2 - 6 * k, w * frac, 2.6 * k);
}

function drawFoe(ctx: CanvasRenderingContext2D, s: WarpathState, f: Foe) {
  const k = s.k;
  if (f.ko <= 0) contactShadow(ctx, f.x, f.y + f.r * 0.45, f.r * 1.0);
  if (f.ko <= 0) drawTelegraph(ctx, f, k);
  ctx.save();
  if (f.ko > 0) {
    ctx.globalAlpha = Math.min(1, f.ko * 2.2);
    ctx.translate(f.x, f.y);
    ctx.rotate((0.6 - f.ko) * f.spin);
  } else {
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
  }
  if (f.hit > 0) {
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 12;
  } else if (f.ko <= 0) {
    // Pulled back from 9. The S3 colourblind lesson holds -- hostiles need a
    // tell that does not lean on red vs green -- but a 9px magenta bloom around
    // a small red hull just washes the whole vehicle pink, which is how the
    // enemies ended up reading as sticky notes.
    ctx.shadowColor = MAGENTA;
    ctx.shadowBlur = 5;
  }
  // idle animation: an engine-idle bob while stopped in range (state-tiered:
  // 0 while closing, a slow bob once it settles to shoot) - a pure read of
  // vx/vy, never new sim state
  const moving = f.ko <= 0 && (Math.abs(f.vx) > 1 || Math.abs(f.vy) > 1);
  if (f.ko <= 0 && f.kind !== "sapper" && !moving) {
    const bob = Math.sin(s.t * 3.4 + f.x * 0.03) * 0.9 * k;
    ctx.translate(0, bob);
  }
  // Hostile red, not the old near-black purple: that colour was picked
  // against a near-black floor and is mud on a daylit one.
  const body = f.ko > 0 ? "#6b3a34" : f.kind === "heavy" ? "#c4302a" : "#e8443c";
  if (f.kind === "sapper") {
    // DEMOLITION DRONE (display re-skin; the sim calls it sapper internally):
    // a squat tracked robot lugging a breaching charge. Machines only.
    spr(ctx, ART["foe-drone"], 0, 0, f.r * 3.6, () => {
      ctx.fillStyle = "#1a1218";
      ctx.fillRect(-f.r * 0.95, -f.r * 0.85, f.r * 1.9, f.r * 0.5); // treads
      ctx.fillRect(-f.r * 0.95, f.r * 0.35, f.r * 1.9, f.r * 0.5);
      if (moving) drawTreadStripes(ctx, f.r * 1.9, f.r * 1.9, s.t * f.speed * 0.5, k);
      ctx.fillStyle = body;
      roundRect(ctx, -f.r * 0.8, -f.r * 0.55, f.r * 1.6, f.r * 1.1, 2 * k);
      ctx.fill();
      ctx.shadowBlur = 0;
      // the breaching charge on its back plate
      ctx.fillStyle = "#c9d4dc";
      ctx.fillRect(f.r * 0.15, -f.r * 0.3, f.r * 0.6, f.r * 0.6);
      // sensor eye: a state-tiered blink rate is the whole animation-rate
      // state machine (checklist) - dark while dead/KO, a slow idle blink
      // while walking, an urgent fast blink while the fuse is lit
      const rate = f.plant > 0 ? 8 : 2.2;
      const hot = Math.floor(s.t * rate) % 2 === 0;
      ctx.fillStyle = f.plant > 0 ? (hot ? "#ff8a8a" : "#241528") : hot ? "#7a5a66" : "#241528";
      ctx.beginPath();
      ctx.arc(-f.r * 0.45, 0, f.r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    // A bruiser is a heavy that came the long way round, and it has its own
    // hull: bigger, plated, unmistakable. Falls back to the heavy's art, then
    // to vectors, so each step down still reads as the right KIND of thing.
    const im = f.bruiser
      ? ART["foe-bruiser"] || ART["foe-heavy"]
      : f.kind === "heavy"
        ? ART["foe-heavy"]
        : ART["foe-car"];
    // nose-right plates (rotated 2026-08-02: they were authored nose-up and
    // every mover slid sideways); size = length, chosen per plate aspect so
    // the on-screen footprint matches the old tall draw exactly
    spr(ctx, im, 0, 0, f.r * (f.bruiser ? 3.0 : f.kind === "heavy" ? 5.5 : 4.8), () => {
      const w = f.r * 1.9;
      const h = f.r * 1.3;
      ctx.fillStyle = "#1a1218";
      ctx.fillRect(-w / 2, -h / 2 - h * 0.22, w, h * 0.28);
      ctx.fillRect(-w / 2, h / 2 - h * 0.06, w, h * 0.28);
      if (moving) drawTreadStripes(ctx, w, h * 1.6, s.t * f.speed * 0.5, k);
      // The magenta was a colourblind-safety call (it separates from the green
      // player without leaning on red vs green) and that reasoning holds. But
      // as a hard 2px outline it turned every hostile into a pink sticky note.
      // It becomes an UNDER-glow instead: the tell survives, and the hull gets
      // the same dark ink line as everything else on the field, so an enemy
      // reads as a vehicle first and as hostile second.
      ctx.fillStyle = body;
      ctx.strokeStyle = "rgba(26,16,20,0.7)";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      roundRect(ctx, -w / 2, -h / 2, w, h, 2.5 * k);
      ctx.fill();
      ctx.stroke();
      // a lit top face, so the hull has a direction and some mass
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      roundRect(ctx, -w / 2 + 1.5, -h / 2 + 1.5, w - 3, h * 0.38, 2 * k);
      ctx.fill();
      ctx.shadowBlur = 0;
      // BOLTED PLATE. A bruiser is 37% wider than a heavy, which is invisible
      // in motion. The plate is the tell: this one is armoured, it came in from
      // the side, and it is going to take a while.
      if (f.bruiser) {
        ctx.fillStyle = "rgba(24,18,22,0.55)";
        ctx.fillRect(-w / 2 + 1.5, -h * 0.34, w - 3, h * 0.2);
        ctx.fillRect(-w / 2 + 1.5, h * 0.14, w - 3, h * 0.2);
        ctx.fillStyle = "rgba(255,214,232,0.7)";
        for (let bx = -w / 2 + 4; bx < w / 2 - 2; bx += 5.5) {
          ctx.fillRect(bx, -h * 0.3, 1.6, 1.6);
          ctx.fillRect(bx, h * 0.18, 1.6, 1.6);
        }
      }
      ctx.fillStyle = "#5c1f1c";
      ctx.beginPath();
      ctx.arc(0, 0, f.r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = f.telegraph > 0.5 ? "#ffd9a0" : body;
      ctx.fillRect(f.r * 0.2, -f.r * (f.kind === "heavy" ? 0.16 : 0.11), f.r * 1.35, f.r * (f.kind === "heavy" ? 0.32 : 0.22));
    });
  }
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.globalAlpha = 1;
  // the KO cook-off (painted if the art landed; the particle burst carries it
  // regardless, so there is no vector fallback to draw here)
  if (f.ko > 0.3) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (f.ko - 0.3) * 2.4);
    spr(ctx, ART["fx-boom"], f.x, f.y, f.r * 3.1, () => {});
    ctx.restore();
  }
  // heavies carry visible hit points: they are the "commit to this" target
  if (f.kind === "heavy" && f.ko <= 0) {
    const max = 7;
    for (let i = 0; i < Math.min(max, Math.max(0, f.hp)); i++) {
      ctx.fillStyle = MAGENTA;
      ctx.fillRect(f.x - f.r + i * 3.4 * k, f.y - f.r - 6 * k, 2.4 * k, 3 * k);
    }
    // RANGING SHOT's mark: the crit window you can see
    if (f.marked) drawMark(ctx, f.x, f.y, f.r + 7 * k, k);
  }
  // a lit fuse: the emergency that has to break your current commitment
  if (f.plant > 0) {
    const p = 1 - f.plant / FUSE_T;
    ctx.strokeStyle = p > 0.6 ? "#ff8a8a" : AMBER;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r + 7 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.stroke();
  }
}

function drawDrop(ctx: CanvasRenderingContext2D, s: WarpathState, d: Drop) {
  const k = s.k;
  const tint = DROP_TINT[d.kind];
  const label = DROP_LABEL[d.kind];
  ctx.save();
  if (d.fall > 0) {
    // still under the chute: it drifts down into place
    const p = 1 - d.fall / DROP_FALL_T;
    const yOff = -34 * k * (1 - p);
    ctx.globalAlpha = 0.92;
    spr(ctx, ART["drop-chute"], d.x, d.y + yOff - 13 * k, 30 * k, () => {
      ctx.strokeStyle = "rgba(238,242,248,0.5)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(d.x - 9 * k, d.y + yOff - 12 * k);
      ctx.lineTo(d.x, d.y + yOff);
      ctx.moveTo(d.x + 9 * k, d.y + yOff - 12 * k);
      ctx.lineTo(d.x, d.y + yOff);
      ctx.stroke();
      ctx.fillStyle = "rgba(238,242,248,0.75)";
      ctx.beginPath();
      ctx.arc(d.x, d.y + yOff - 12 * k, 12 * k, Math.PI, 0);
      ctx.fill();
    });
    spr(ctx, ART["drop-crate"], d.x, d.y + yOff, 13 * k, () => {
      ctx.fillStyle = tint;
      ctx.fillRect(d.x - 5 * k, d.y + yOff - 5 * k, 10 * k, 10 * k);
    });
    ctx.restore();
    return;
  }
  contactShadow(ctx, d.x, d.y + 9 * k, 10 * k);
  // landed: a life ring counts the seconds you have to come and get it
  const frac = Math.max(0, d.life / DROP_LIFE);
  ctx.strokeStyle = frac > 0.35 ? tint : "#f87171";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(d.x, d.y, 15 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  ctx.stroke();
  spr(ctx, ART["drop-crate"], d.x, d.y, 19 * k, () => {
    ctx.fillStyle = "#20262c";
    ctx.fillRect(d.x - 8 * k, d.y - 8 * k, 16 * k, 16 * k);
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(d.x - 8 * k, d.y - 8 * k, 16 * k, 16 * k);
    ctx.fillStyle = tint;
    ctx.fillRect(d.x - 8 * k, d.y - 2 * k, 16 * k, 4 * k);
  });
  ctx.fillStyle = tint;
  ctx.font = `800 ${Math.max(8, 8.5 * k)}px ${HUD_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(T(label), d.x, d.y + 28 * k);
  ctx.textAlign = "left";
  ctx.restore();
}

/** A diegetic PLATE: a stencil-face title (DISPLAY_FONT) plus an optional
 * neutral-sans instruction subtitle (HUD_FONT) on the same card — the two
 * typographic registers side by side on purpose. `big` plates (act titles,
 * FINAL ASSAULT, the choice gate, RELIEF COLUMN) get the letterbox + bigger
 * type; small ones (WAVE N, TRUCK DOWN...) stay the slim banner they always
 * were. */
function drawPlate(ctx: CanvasRenderingContext2D, vw: number, vh: number, banner: NonNullable<WarpathState["banner"]>) {
  const alpha = Math.min(1, banner.t * 2.4);
  const danger =
    banner.txt === "CONVOY LOST" ||
    banner.txt === "CONVOY UNDEFENDED" ||
    banner.txt.startsWith("TRUCK") ||
    banner.txt === "ONE TRUCK LEFT";
  const tri = banner.txt === "RELIEF COLUMN ARRIVES";
  const color = danger ? "#ff8a8a" : tri ? ACCENT : "#ffd98a";
  ctx.save();
  ctx.globalAlpha = alpha;
  if (banner.big) {
    const by = vh * 0.3;
    ctx.fillStyle = "rgba(8,10,13,0.6)";
    ctx.fillRect(0, by - 30, vw, banner.sub ? 66 : 44);
    ctx.fillStyle = danger ? "rgba(255,138,138,0.6)" : "rgba(240,179,64,0.55)";
    ctx.fillRect(0, by - 30, vw, 1.6);
    ctx.fillRect(0, by + (banner.sub ? 36 : 14), vw, 1.6);
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    const bTxt = T(banner.txt);
    ctx.font = `900 ${bTxt.length > 18 ? 24 : 30}px ${DISPLAY_FONT}`;
    ctx.fillText(bTxt, vw / 2, by);
    if (banner.sub) {
      ctx.fillStyle = "rgba(238,242,248,0.85)";
      ctx.font = `600 12.5px ${HUD_FONT}`;
      ctx.fillText(T(banner.sub), vw / 2, by + 24);
    }
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.font = `800 21px ${DISPLAY_FONT}`;
    ctx.fillText(T(banner.txt), vw / 2, vh * 0.34);
  }
  ctx.restore();
  ctx.textAlign = "left";
}

/** THE FINAL ASSAULT GATE: two tap zones, a shared countdown ring. Resolves
 * on the sim's own pendingTap (a quick tap left or right of the hull); this
 * draw is a pure read of choiceT/CHOICE_T, no local state of its own. */
function drawChoiceGate(ctx: CanvasRenderingContext2D, s: WarpathState, vw: number, vh: number) {
  const frac = clamp(s.choiceT / CHOICE_T, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.9;
  const midY = vh * 0.56;
  const bandH = Math.min(150, vh * 0.34);
  const pulse = 0.5 + Math.sin(performance.now() / 220) * 0.5;
  // left zone: IRON HULL
  let g = ctx.createLinearGradient(0, 0, vw * 0.5, 0);
  g.addColorStop(0, `rgba(52,211,153,${0.22 + pulse * 0.1})`);
  g.addColorStop(1, "rgba(52,211,153,0.02)");
  ctx.fillStyle = g;
  ctx.fillRect(0, midY - bandH / 2, vw / 2, bandH);
  // right zone: HOT SHELLS
  g = ctx.createLinearGradient(vw, 0, vw * 0.5, 0);
  g.addColorStop(0, `rgba(240,179,64,${0.22 + pulse * 0.1})`);
  g.addColorStop(1, "rgba(240,179,64,0.02)");
  ctx.fillStyle = g;
  ctx.fillRect(vw / 2, midY - bandH / 2, vw / 2, bandH);
  ctx.strokeStyle = "rgba(238,242,248,0.25)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(vw / 2, midY - bandH / 2);
  ctx.lineTo(vw / 2, midY + bandH / 2);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = ACCENT;
  ctx.font = `900 20px ${DISPLAY_FONT}`;
  ctx.fillText(T("IRON HULL"), vw * 0.25, midY - 8);
  ctx.fillStyle = "rgba(238,242,248,0.85)";
  ctx.font = `600 10.5px ${HUD_FONT}`;
  ctx.fillText(T("+18% max hull, refilled"), vw * 0.25, midY + 12);
  ctx.fillStyle = AMBER;
  ctx.font = `900 20px ${DISPLAY_FONT}`;
  ctx.fillText(T("HOT SHELLS"), vw * 0.75, midY - 8);
  ctx.fillStyle = "rgba(238,242,248,0.85)";
  ctx.font = `600 10.5px ${HUD_FONT}`;
  ctx.fillText(T("+25% shell damage"), vw * 0.75, midY + 12);
  // shared countdown ring
  ctx.strokeStyle = frac > 0.3 ? "rgba(238,242,248,0.7)" : "#ff8a8a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(vw / 2, midY + bandH / 2 + 26, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.restore();
}

// ── the frame ───────────────────────────────────────────────────────────────

function drawScene(ctx: CanvasRenderingContext2D, s: WarpathState, view: ShellView, cam: Cam, fx: PageFx, cine: CineState) {
  const k = s.k;
  const vw = view.w;
  const vh = view.h;
  const road = s.roadY;

  // ── PARALLAX PLANE A: slow cloud-shadow drift, far behind the ground,
  // scrolling at a fraction of the camera rate (the "distance" cue a
  // top-down camera can still sell) ──
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "#0a1f16";
  for (let i = 0; i < 6; i++) {
    const bx = ((i * 977 + 210) % (s.W + 500)) - 250 - cam.x * 0.12 + s.t * 3.5 * (i % 2 === 0 ? 1 : -1);
    const by = ((i * 611 + 90) % s.H) - cam.y * 0.12;
    const wrapx = ((bx % (vw + 400)) + (vw + 400)) % (vw + 400) - 200;
    ctx.beginPath();
    ctx.ellipse(wrapx, by % (vh + 200), 130, 60, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── camera fx (screen-space shake + recoil punch), wraps the whole
  // world draw; the cinematic zoom is a separate, inner transform pivoted on
  // the player so the HUD/plates drawn later stay crisp and unscaled ──
  const recoil = clamp(s.muzzle / MUZZLE_T, 0, 1);
  beginCameraFx(
    ctx,
    fx,
    { w: vw, h: vh, k },
    {
      shake: s.shake,
      recoil,
      recoilFrom: { x: s.px, y: s.py },
      recoilTo: { x: s.px + Math.cos(s.ta) * 30 * k, y: s.py + Math.sin(s.ta) * 30 * k },
    },
  );

  ctx.save(); // world scroll + cinematic zoom
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  if (Math.abs(cam.zoom - 1) > 0.001) {
    ctx.translate(s.px, s.py);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-s.px, -s.py);
  }

  // THE VALLEY FLOOR. Drawn, not plated, and made only of things the sim
  // actually has: the floor, the two banks the enemy comes down, the road.
  // Nothing here can be driven through, because nothing here is solid.
  // A GRADIENT, not a flat fill. The single cheapest thing that stops a field
  // reading as construction paper -- same call as the crowd runner's road.
  if (GRADS.h !== s.H) {
    GRADS.h = s.H;
    GRADS.floor = ctx.createLinearGradient(0, -12, 0, s.H + 12);
    // one notch brighter than the old stops: half of "PS1 dirt" is a muddy base
    GRADS.floor.addColorStop(0, "#63914a");
    GRADS.floor.addColorStop(0.45, GROUND);
    GRADS.floor.addColorStop(1, "#5e8a45");
    const bandH = s.H * 0.14 + 12;
    GRADS.bankTop = ctx.createLinearGradient(0, -12, 0, -12 + bandH);
    GRADS.bankTop.addColorStop(0, "#453f24");
    GRADS.bankTop.addColorStop(1, "#5f5734");
    GRADS.bankBot = ctx.createLinearGradient(0, s.H * 0.86, 0, s.H * 0.86 + bandH);
    GRADS.bankBot.addColorStop(0, "#5f5734");
    GRADS.bankBot.addColorStop(1, "#453f24");
    GRADS.roadG = ctx.createLinearGradient(0, s.roadY - 30 * s.k, 0, s.roadY + 30 * s.k);
    GRADS.roadG.addColorStop(0, "#7d6840");
    GRADS.roadG.addColorStop(0.2, "#8e7749");
    GRADS.roadG.addColorStop(0.5, ROAD);
    GRADS.roadG.addColorStop(0.8, "#8e7749");
    GRADS.roadG.addColorStop(1, "#7d6840");
  }
  ctx.fillStyle = GRADS.floor!;
  ctx.fillRect(-12, -12, s.W + 24, s.H + 24);
  // GRASS, BAKED ONCE. The pasture ellipses below were kept "within a few
  // percent of the floor colour" so they would not compete with the tanks, and
  // at that contrast they stopped being pasture and became smudges on green
  // paper. Texture does the job they were meant to do -- it gives the eye
  // something to judge movement against -- without any large shape at all.
  bakeField();
  if (FIELD_TEX) {
    for (let ty = -12; ty < s.H + 24; ty += 96) {
      for (let tx = -12; tx < s.W + 24; tx += 96) ctx.drawImage(FIELD_TEX, tx, ty);
    }
  }
  // THE TWO BANKS the enemy comes down. They used to be two OPAQUE FLAT FILLS
  // painted straight over the plate and the baked grain above -- 14% of the
  // world each, which is ~21% of the screen at WORLD_SCALE_Y, and the reason
  // the bottom of the field read as construction paper while the middle read
  // as ground (Mike 2026-08-01: "the scenery is broken with some background
  // being solid green"). They get exactly what the road gets: a gradient for
  // shape, then the same grain clipped inside, so a bank is the valley rising
  // rather than a different material.
  {
    const bandH = s.H * 0.14 + 12;
    const drawBank = (top: number, downhill: 1 | -1) => {
      // The darker stop is the crest, the lighter one meets the valley floor —
      // same earth family as the floor (the "solid green" fix), now cached.
      ctx.fillStyle = downhill > 0 ? GRADS.bankTop! : GRADS.bankBot!;
      ctx.fillRect(-12, top, s.W + 24, bandH);
      if (FIELD_TEX) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.rect(-12, top, s.W + 24, bandH);
        ctx.clip();
        for (let ty = top - 96; ty < top + bandH + 96; ty += 96) {
          for (let tx = -12; tx < s.W + 24; tx += 96) ctx.drawImage(FIELD_TEX, tx, ty);
        }
        ctx.restore();
      }
    };
    drawBank(-12, 1);
    drawBank(s.H * 0.86, -1);
  }
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(-12, s.H * 0.14, s.W + 24, 3 * k);
  ctx.fillRect(-12, s.H * 0.86 - 3 * k, s.W + 24, 3 * k);

  // GROUND LIFE, deterministic off position and culled to the camera (this
  // world scrolls): dry scrub, stones, dust fades, yarrow — the Armor Clash
  // recipe in valley colours. The crests get dark brush so the two banks
  // frame the arena the way the forest edge frames the pitch.
  {
    const h2 = (ix: number, iy: number, salt: number) => {
      let v = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
      v = Math.imul(v ^ (v >>> 15), 0x85ebca6b);
      v ^= v >>> 13;
      return (v >>> 0) / 4294967296;
    };
    const x0 = Math.floor((cam.x - 60) / 40) * 40;
    const x1 = cam.x + vw + 60;
    for (let gx = Math.max(0, x0); gx < Math.min(s.W, x1); gx += 40) {
      for (let gy = 0; gy < s.H; gy += 40) {
        const py2 = gy + h2(gx, gy, 7) * 36;
        if (py2 > s.H * 0.14 - 10 && py2 < s.H * 0.14 + 26) continue; // crest band
        if (py2 > s.H * 0.86 - 26 && py2 < s.H * 0.86 + 10) continue;
        if (Math.abs(py2 - road) < 40 * k) continue; // the road stays a road
        const r0 = h2(gx, gy, 3);
        const px2 = gx + h2(gx, gy, 5) * 36;
        if (r0 < 0.05) {
          // A SHELL CRATER. This valley is a front line: raised lip, dark
          // bowl, a few clods. The one prop that says "war" without a corpse.
          // A CRATER IS EARTH, NOT GRASS. The first pass drew the lip and the
          // bowl in the same olive family as the field, so at play size they
          // read as green donuts lying on the grass (found live 2026-08-02).
          // Blown soil: a scorch halo, a raised brown lip, a dark bowl with
          // the shadow on the near side, and clods of the same soil.
          const cr = 6 + h2(gx, gy, 15) * 6;
          const halo = ctx.createRadialGradient(px2, py2, cr * 0.8, px2, py2, cr * 2.1);
          halo.addColorStop(0, "rgba(48,40,24,0.34)");
          halo.addColorStop(1, "rgba(48,40,24,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(px2, py2, cr * 2.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(120,98,60,0.85)";
          ctx.lineWidth = cr * 0.36;
          ctx.beginPath();
          ctx.arc(px2, py2, cr, 0, Math.PI * 2);
          ctx.stroke();
          const cg = ctx.createRadialGradient(px2 - cr * 0.25, py2 - cr * 0.3, cr * 0.1, px2, py2, cr);
          cg.addColorStop(0, "rgba(96,76,44,0.95)");
          cg.addColorStop(0.55, "rgba(58,44,24,0.95)");
          cg.addColorStop(1, "rgba(34,26,14,0.95)");
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(px2, py2, cr * 0.86, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(112,92,56,0.8)";
          for (let t2 = 0; t2 < 5; t2++) {
            const ca = h2(gx, gy, 17 + t2) * Math.PI * 2;
            const cd = cr * (1.3 + h2(gx + t2, gy, 19) * 0.5);
            ctx.beginPath();
            ctx.arc(px2 + Math.cos(ca) * cd, py2 + Math.sin(ca) * cd * 0.9, 1.2 + h2(gx, gy + t2, 21) * 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (r0 < 0.17) {
          // dry scrub tuft: taller, darker, reads at game zoom
          ctx.strokeStyle = "rgba(58,78,32,0.62)";
          ctx.lineWidth = 1.8;
          for (let t2 = 0; t2 < 4; t2++) {
            ctx.beginPath();
            ctx.moveTo(px2 + t2 * 2.6 - 3.9, py2);
            ctx.quadraticCurveTo(px2 + t2 * 2.6 - 2.2, py2 - 6, px2 + t2 * 2.6 + 1.8, py2 - 9);
            ctx.stroke();
          }
        } else if (r0 < 0.23) {
          // a stone pair
          ctx.fillStyle = "rgba(126,128,112,0.8)";
          ctx.beginPath();
          ctx.ellipse(px2, py2, 3.6, 2.6, 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(96,98,86,0.75)";
          ctx.beginPath();
          ctx.ellipse(px2 + 4.6, py2 + 2.2, 2.3, 1.6, 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(220,224,210,0.35)";
          ctx.beginPath();
          ctx.ellipse(px2 - 1, py2 - 0.9, 1.5, 1.0, 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (r0 < 0.3) {
          // dust fade: bare earth showing through
          const dg = ctx.createRadialGradient(px2, py2, 1, px2, py2, 18);
          dg.addColorStop(0, "rgba(140,122,80,0.26)");
          dg.addColorStop(1, "rgba(140,122,80,0)");
          ctx.fillStyle = dg;
          ctx.beginPath();
          ctx.arc(px2, py2, 18, 0, Math.PI * 2);
          ctx.fill();
        } else if (r0 < 0.33) {
          // yarrow: a dry-yellow cluster, the valley's one flower
          ctx.fillStyle = "rgba(214,196,110,0.9)";
          for (let t2 = 0; t2 < 4; t2++) {
            ctx.beginPath();
            ctx.arc(px2 + h2(gx + t2, gy, 9) * 7 - 3.5, py2 + h2(gx, gy + t2, 11) * 5 - 2.5, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // crest brush along both banks: dark olive blobs with a shadowed foot
      for (const [cy2, salt] of [
        [s.H * 0.14, 31],
        [s.H * 0.86, 37],
      ] as const) {
        const r1 = h2(gx, 0, salt);
        if (r1 < 0.62) {
          const bx2 = gx + h2(gx, 1, salt) * 34;
          const by2 = cy2 + (h2(gx, 2, salt) - 0.5) * 10;
          const br = 5.5 + h2(gx, 3, salt) * 5;
          // REAL CONIFERS on the crests where the bake landed, the drawn disc
          // where it did not: the ridgelines are what frame this arena.
          const crestArt = ART[h2(gx, 5, salt) < 0.5 ? "scn/tree-a" : "scn/tree-b"];
          ctx.fillStyle = "rgba(20,32,12,0.35)";
          ctx.beginPath();
          ctx.ellipse(bx2 + 1.5, by2 + 2, br * 1.05, br * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
          if (ready(crestArt)) {
            const tw = br * 2.6;
            const th = tw * (crestArt.naturalHeight / crestArt.naturalWidth);
            ctx.drawImage(crestArt, bx2 - tw / 2, by2 - th * 0.9, tw, th);
            continue;
          }
          ctx.fillStyle = ["#42622e", "#3a5828", "#4c6f34"][Math.floor(h2(gx, 4, salt) * 3)];
          ctx.beginPath();
          ctx.arc(bx2, by2, br, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,225,0.12)";
          ctx.beginPath();
          ctx.arc(bx2 - br * 0.3, by2 - br * 0.3, br * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  // the valley road the convoy is stalled on: markings are gameplay reading
  // A CROWNED DIRT SURFACE, not a tan rectangle. Ruts either side, lifted down
  // the middle where nothing drives, with the same grain the crowd runner uses.
  ctx.fillStyle = GRADS.roadG!;
  ctx.fillRect(0, road - 30 * k, s.W, 60 * k);
  if (FIELD_TEX) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.rect(0, road - 30 * k, s.W, 60 * k);
    ctx.clip();
    for (let tx = -12; tx < s.W + 24; tx += 96) ctx.drawImage(FIELD_TEX, tx, road - 48 * k);
    ctx.restore();
  }
  // shoulders: the road sits IN the valley, it is not laid on top of it
  ctx.fillStyle = "rgba(38,44,26,0.34)";
  ctx.fillRect(0, road - 32 * k, s.W, 2.5 * k);
  ctx.fillRect(0, road + 29.5 * k, s.W, 2.5 * k);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, road - 30 * k, s.W, 1.5);
  ctx.fillRect(0, road + 30 * k - 1.5, s.W, 1.5);
  ctx.fillStyle = "rgba(238,242,248,0.13)";
  for (let x = 8 * k; x < s.W; x += 30 * k) ctx.fillRect(x, road - 1 * k, 14 * k, 2 * k);

  // ── COVER. Drawn before everything that moves, because it is the thing
  // they move AROUND. A rock you cannot see is a shell stopping in mid-air
  // for no reason, which is worse than having no cover at all.
  for (const o of s.rocks) {
    contactShadow(ctx, o.x, o.y + o.r * 0.3, o.r * 0.95);
    // Painted boulder if one landed, else the drawn one below. Which variant
    // appears is read off the existing seeded `shape`, so it stays a pure
    // function of the level and the replay cannot desync.
    // A REAL BOULDER, tilt-baked: it carries its height ABOVE the anchor, so
    // the foot sits on the collision circle and the mass rises up-screen from
    // it. Which variant is read off the seeded o.shape, so the level is still
    // a pure function of the seed and no replay can desync.
    const baked = ART[o.shape % 2 === 0 ? "scn/rock-a" : "scn/rock-b"];
    if (ready(baked)) {
      const w = o.r * 2.7;
      const h = w * (baked.naturalHeight / baked.naturalWidth);
      ctx.drawImage(baked, o.x - w / 2, o.y - h * 0.82, w, h);
      continue;
    }
    const rockArt = ART[o.shape % 2 === 0 ? "rock-a" : "rock-b"];
    if (ready(rockArt)) {
      spr(ctx, rockArt, o.x, o.y, o.r * 2.4, () => {});
      continue;
    }
    ctx.save();
    ctx.translate(o.x, o.y);
    // body: lit from the top-left, like everything else on this board
    const g = ctx.createLinearGradient(-o.r, -o.r, o.r * 0.6, o.r);
    g.addColorStop(0, "#9aa0a4");
    g.addColorStop(0.5, "#74797d");
    g.addColorStop(1, "#4c5054");
    ctx.fillStyle = g;
    ctx.beginPath();
    // three silhouettes so a field of seven does not read as seven copies
    const lobes = o.shape === 0 ? 5 : o.shape === 1 ? 6 : 7;
    for (let i = 0; i <= lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const rr = o.r * (0.82 + 0.18 * Math.cos(a * 2 + o.shape));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * 0.86;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(20,24,26,0.65)";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.stroke();
    // a lit cap, so it reads as a solid thing standing up off the ground
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    ctx.beginPath();
    ctx.ellipse(-o.r * 0.18, -o.r * 0.34, o.r * 0.5, o.r * 0.26, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // tread marks
  for (const tr of s.treads) {
    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.a);
    ctx.globalAlpha = tr.life * 0.15;
    ctx.fillStyle = "#000";
    ctx.fillRect(-9 * k, -11 * k, 18 * k, 4 * k);
    ctx.fillRect(-9 * k, 7 * k, 18 * k, 4 * k);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // supply drop (under the units, above the ground)
  if (s.drop) drawDrop(ctx, s, s.drop);

  // convoy
  for (let i = 0; i < s.trucks.length; i++) drawTruck(ctx, s, i);

  // your gun range: the constraint, ALWAYS drawn (round-2: "your firing
  // radius must be shown"). The radius is the sim's effRange, so Caliber and
  // the RANGE BOOST crate visibly grow it; it brightens while a live target
  // is inside, and while the boost runs it takes the boost's lime tint.
  let ringR = 0;
  let ringHot = false;
  if (s.phase === "play" || s.phase === "intro") {
    ringR = effRange(s) * k;
    for (const f of s.foes) {
      if (f.hp <= 0 || f.ko > 0) continue;
      if (Math.hypot(f.x - s.px, f.y - s.py) <= ringR) {
        ringHot = true;
        break;
      }
    }
    const dead = s.disabled > 0;
    const alpha = dead ? 0.1 : ringHot ? 0.55 : 0.26;
    // SHOW IT ONLY WHEN IT HAS SOMETHING TO SAY.
    //
    // Two failed attempts got this right by elimination. As a dashed wireframe
    // it was a 360px teal hoop that owned the frame; as a filled wash it became
    // a teal dome, which was worse. The mistake in both was drawing it at all
    // times. Its entire job is to answer "can I hit that yet" -- so when
    // nothing is near it, it should not be on screen.
    //
    // A thin rim, only while a hostile is inside it or RANGING SHOT is up, and
    // it fades in over its own quarter second so it never pops.
    if (ringHot || s.rangeT > 0) {
      const hue = s.rangeT > 0 ? "163,230,53" : "52,211,153";
      ctx.save();
      ctx.strokeStyle = `rgba(${hue},${dead ? 0.1 : 0.4})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(s.px, s.py, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // hostiles
  for (const f of s.foes) drawFoe(ctx, s, f);

  // DUST CLOUD: the combo you can see. Deterministic swirl off s.t.
  if (s.dustT > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.42, s.dustT * 0.42);
    ctx.fillStyle = "#8d8677";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + s.t * 1.7;
      ctx.beginPath();
      ctx.arc(s.px + Math.cos(a) * 15 * k, s.py + Math.sin(a) * 15 * k, 10 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // your tank: hull and turret move independently. The fielded tank tints
  // the paint and adds a touch of bulk (ShellView.tank, cosmetic only).
  const hull = HULL_STYLE[view.tank?.hullClass ?? "scout"] ?? HULL_STYLE.scout;
  const hs = hull.scale;
  const blink = s.iframes > 0 && Math.floor(s.t * 12) % 2 === 0;
  const playerMoving = Math.hypot(cam.vx, cam.vy) > 6;
  contactShadow(ctx, s.px, s.py + 8 * k * hs, 12 * k * hs);
  ctx.save();
  if (s.disabled > 0) ctx.globalAlpha = 0.5;
  else if (blink) ctx.globalAlpha = 0.5;
  ctx.save();
  ctx.translate(s.px, s.py);
  ctx.rotate(s.pa);
  // PAINTED HULL. Drawn turretless on purpose: the turret is a separate sprite
  // on its own bearing (s.ta) a few lines below, because the two rotate
  // independently and one combined tank could only ever be right when the
  // turret happened to point where the hull did.
  if (ready(ART["units/hull-mine"])) {
    // odometer frames: distance drives the track cycle, so it animates only
    // when the tank moves and identically on every replay (draw stays pure)
    const hullFrame = Math.floor((Math.abs(s.px) + Math.abs(s.py)) / 6);
    // A GROUND RING, not a glow. ACCENT is green and so is this valley, so a
    // green bloom around a green field separated nothing and just softened the
    // hull's edge (seen live 2026-08-02). A crisp ring on the deck is the
    // marker every top-down game uses, and it survives any background.
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.6 * k;
    ctx.beginPath();
    ctx.ellipse(0, 1.5 * k * hs, 20 * k * hs, 13 * k * hs, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    stripRot(ctx, ART["units/hull-mine"]!, STRIP_FRAMES, hullFrame, 0, 0, 38 * k * hs, 0, () => {});
  } else {
  ctx.fillStyle = "#161b21";
  ctx.fillRect(-13 * k * hs, -13 * k * hs, 26 * k * hs, 6.6 * k * hs);
  ctx.fillRect(-13 * k * hs, 6.4 * k * hs, 26 * k * hs, 6.6 * k * hs);
  if (playerMoving) {
    drawTreadStripes(ctx, 26 * k * hs, 6.6 * k * hs, -s.t * 60 * k, k);
    ctx.save();
    ctx.translate(0, 6.4 * k * hs);
    drawTreadStripes(ctx, 26 * k * hs, 6.6 * k * hs, -s.t * 60 * k, k);
    ctx.restore();
  }
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 11;
  ctx.fillStyle = hull.body;
  roundRect(ctx, -12 * k * hs, -8 * k * hs, 24 * k * hs, 16 * k * hs, 3 * k);
  ctx.fill();
  ctx.shadowBlur = 0;
  // A BRIGHT RIM, so the tank you actually steer is the loudest thing on the
  // field. It was a dark hull with a soft glow, which read quieter than the
  // squad standing next to it: the one unit that must never be hard to find.
  ctx.strokeStyle = ALLY_RIM;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.stroke();
  }
  ctx.restore();
  // turret on its own bearing, barrel recoil on firing (checklist: static
  // presentation fix) — the barrel pulls back into the mantlet the instant
  // the shell leaves, then eases back out with s.muzzle's own decay
  const kick = recoil * 4.2 * k;
  ctx.save();
  ctx.translate(s.px, s.py);
  // BAKED TURRET, on s.ta -- its OWN bearing, not the hull's s.pa. The two
  // diverge constantly (you drive one way and shoot another), which is exactly
  // why the art is a turretless hull plus a detached turret from the SAME
  // model: composed at the same cell scale they agree by construction.
  //
  // The pivot rides the hull first: the ring sits TURRET_RING_AFT behind the
  // hull's centre (measured off the bake), so the turret is carried where the
  // model actually carries it, then aims on its own bearing. The recoil kick
  // stays in code because per-frame state cannot be baked into a still.
  if (ready(ART["units/turret-mine"])) {
    const S = 38 * k * hs;
    ctx.rotate(s.pa);
    ctx.translate(-TURRET_RING_AFT * S, 0);
    ctx.rotate(s.ta - s.pa);
    // a soft pool under the cap: the one cue that says the turret sits ABOVE
    // the hull rather than being printed on it
    ctx.fillStyle = "rgba(10,16,10,0.30)";
    ctx.beginPath();
    ctx.ellipse(1.2, 1.8, S * 0.17, S * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    spr(ctx, ART["units/turret-mine"], TURRET_RING_AFT * S - kick, 0, S, () => {});
    if (s.twinT > 0) {
      // the twin-cannon tell rides OVER the baked gun as two bright rails
      ctx.fillStyle = "#7dd3fc";
      ctx.fillRect(0.12 * S - kick, -4.6 * k, 17 * k, 3 * k);
      ctx.fillRect(0.12 * S - kick, 1.6 * k, 17 * k, 3 * k);
    }
    if (s.muzzle > 0) {
      sprRot(ctx, ART["fx-muzzle"], 0.58 * S - kick, 0, 16 * k, 0, () => {
        ctx.fillStyle = "#ffd98a";
        ctx.beginPath();
        ctx.moveTo(0.5 * S - kick, 0);
        ctx.lineTo(0.64 * S - kick, -5 * k);
        ctx.lineTo(0.64 * S - kick, 5 * k);
        ctx.closePath();
        ctx.fill();
      });
    }
    ctx.restore();
    ctx.restore();
    ctx.globalAlpha = 1;
  } else {
  ctx.rotate(s.ta);
  {
  // THE TURRET WAS EATING THE TANK. A near-black #13181d disc at r=7k sits on
  // a hull only 16k tall, so it covered almost every visible pixel of paint and
  // the whole vehicle read as a black box with a neon outline. Painted like a
  // turret instead: hull colour, lifted, with a dark ring to seat it.
  ctx.fillStyle = "rgba(12,18,22,0.5)";
  ctx.beginPath();
  ctx.arc(0, 0, 6.4 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hull.body;
  ctx.beginPath();
  ctx.arc(0, 0, 5.4 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(-1.1 * k, -1.3 * k, 3.1 * k, 0, Math.PI * 2);
  ctx.fill();
  }
  ctx.fillStyle = s.twinT > 0 ? "#7dd3fc" : hull.body;
  if (s.twinT > 0) {
    ctx.fillRect(4 * k - kick, -4.6 * k, 17 * k, 3 * k);
    ctx.fillRect(4 * k - kick, 1.6 * k, 17 * k, 3 * k);
  } else {
    ctx.fillRect(4 * k - kick, -1.9 * k, 18 * k, 3.8 * k);
  }
  if (s.muzzle > 0) {
    sprRot(ctx, ART["fx-muzzle"], 27 * k - kick, 0, 16 * k, 0, () => {
      ctx.fillStyle = "#ffd98a";
      ctx.beginPath();
      ctx.moveTo(23 * k - kick, 0);
      ctx.lineTo(32 * k - kick, -5 * k);
      ctx.lineTo(32 * k - kick, 5 * k);
      ctx.closePath();
      ctx.fill();
    });
  }
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
  }

  // shells
  for (const b of s.bullets) {
    ctx.shadowColor = b.mine ? ACCENT : MAGENTA;
    ctx.shadowBlur = 8;
    ctx.fillStyle = b.mine ? "#c8ffe8" : MAGENTA;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // particles
  for (const p of s.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.8));
    ctx.fillStyle = p.kind === "smoke" ? "#565e6e" : "#ffd98a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // floaters (world-anchored) — the scoring vocabulary (checklist): every
  // named event (DRONE/CAR/HEAVY DOWN, CONVOY HELD, REPAIR KIT, MARKED, the
  // combo names) speaks through this one channel
  ctx.textAlign = "center";
  for (const f of s.floats) {
    ctx.globalAlpha = Math.min(1, f.life * 1.6);
    ctx.fillStyle = f.big ? "#ffd98a" : WHITE;
    ctx.font = `${f.big ? 800 : 700} ${f.big ? 14 : 12}px ${HUD_FONT}`;
    ctx.fillText(T(f.txt), f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  ctx.restore(); // end world scroll + zoom
  endCameraFx(ctx); // end screen shake/recoil

  // ── screen space from here ──

  // THE VIGNETTE: corners fall off, the middle breathes — drawn in screen
  // space so it never scrolls with the world (same grammar as Armor Clash).
  if (!GRADS.vig || GRADS.vigW !== vw) {
    GRADS.vigW = vw;
    GRADS.vig = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.36, vw / 2, vh / 2, vh * 0.8);
    GRADS.vig.addColorStop(0, "rgba(0,0,0,0)");
    GRADS.vig.addColorStop(1, "rgba(10,18,8,0.32)");
  }
  ctx.fillStyle = GRADS.vig;
  ctx.fillRect(0, 0, vw, vh);

  // ambient page-fx: motes (dust drifting through the valley) and speed
  // streaks while driving fast — a real parallax plane at "screen rate"
  // (independent of world scroll), the third depth band alongside the world
  // (rate 1x) and the cloud shadows above (rate ~0.12x)
  drawMotes(ctx, fx, { w: vw, h: vh, k });
  drawStreaks(ctx, fx, { w: vw, h: vh, k });

  // OPTICS: the bank the next one walks down, flagged at the view edge
  const sp = nextSpawnPreview(s);
  if (sp) {
    const bandH = vh * 0.15;
    const y0 = sp.side < 0 ? 0 : vh - bandH;
    ctx.save();
    ctx.globalAlpha = 0.16 + sp.heat * 0.34;
    const grad = ctx.createLinearGradient(0, sp.side < 0 ? 0 : vh, 0, sp.side < 0 ? bandH : vh - bandH);
    grad.addColorStop(0, MAGENTA);
    grad.addColorStop(1, "rgba(232,121,249,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0, vw, bandH);
    ctx.globalAlpha = 0.3 + sp.heat * 0.55;
    ctx.fillStyle = MAGENTA;
    ctx.font = `800 ${Math.max(9, 9.5 * k)}px ${HUD_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(T(KIND_LABEL[sp.kind]), vw / 2, sp.side < 0 ? 14 * k : vh - 8 * k);
    ctx.textAlign = "left";
    ctx.restore();
  }

  // wave-incoming: fills the old ~1.8s dead air between waves with a
  // shrinking ring (the choice gate has its own dedicated UI, so this only
  // shows for the ordinary break)
  if (s.waveBreakT > 0 && !s.choicePending && s.phase === "play") {
    // the ONE breather that is CHOICE_CONFIRM_T instead of a normal WAVE_BREAK
    // is the one after the wave14->15 gate resolves, and that is the only
    // break that ever runs while s.wave still reads RUN_MAX_WAVES-1 (a normal
    // break always sits between wave N clearing and startWave() incrementing
    // to N+1) - an exact read, not a magic-number guess at the two constants'
    // relative sizes (the VARIETY & ARC pass shortened WAVE_BREAK enough that
    // the old "waveBreakT > 2.4" heuristic no longer holds).
    const total = s.wave === RUN_MAX_WAVES - 1 ? CHOICE_CONFIRM_T : WAVE_BREAK;
    const frac = clamp(s.waveBreakT / Math.max(total, 0.001), 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "rgba(238,242,248,0.55)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(vw / 2, vh * 0.5, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - frac));
    ctx.stroke();
    ctx.fillStyle = "rgba(170,180,189,0.85)";
    ctx.font = `700 9px ${HUD_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(T("NEXT WAVE"), vw / 2, vh * 0.5 + 3);
    ctx.textAlign = "left";
    ctx.restore();
  }

  // off-screen truck chevrons, hp-tinted; magenta ping when threatened
  let chevrons = 0;
  if (s.phase === "play" || s.phase === "ko") {
    for (let i = 0; i < s.trucks.length; i++) {
      const tk = s.trucks[i];
      if (!tk.alive) continue;
      const sx = tk.x - cam.x;
      const sy = tk.y - cam.y;
      if (sx >= -16 && sx <= vw + 16 && sy >= -16 && sy <= vh + 16) continue;
      const cx = clamp(sx, 26, vw - 26);
      const cy = clamp(sy, 88, vh - 62);
      const ang = Math.atan2(sy - cy, sx - cx);
      let threatened = false;
      for (const f of s.foes) {
        if (f.hp <= 0 || f.ko > 0 || f.target !== i) continue;
        if (f.plant > 0 || Math.hypot(f.x - tk.x, f.y - tk.y) < 150 * k) {
          threatened = true;
          break;
        }
      }
      ctx.save();
      ctx.translate(cx, cy);
      if (threatened) {
        const pulse = 0.45 + Math.sin(s.t * 9) * 0.3;
        ctx.strokeStyle = `rgba(232,121,249,${Math.max(0, pulse)})`;
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.arc(0, 0, 13 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(ang);
      ctx.fillStyle = hpTint(Math.max(0, tk.hp / TRUCK_HP));
      ctx.beginPath();
      ctx.moveTo(10 * k, 0);
      ctx.lineTo(-7 * k, -7 * k);
      ctx.lineTo(-3.5 * k, 0);
      ctx.lineTo(-7 * k, 7 * k);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      chevrons++;
    }
  }

  // top minimap strip: road, trucks, player, drop, the Optics next-bank flag
  const mmW = Math.round(124 * Math.min(1.35, vw / 360));
  const mmH = Math.round(mmW * (s.H / s.W) * 0.52);
  const mx = Math.round((vw - mmW) / 2);
  const my = 22;
  ctx.save();
  // GLASS, NOT A HOLE. At 0.68 alpha this was effectively opaque black: a
  // 168x85 slab parked dead centre at the top of a green field, and the second
  // most prominent object in the game after the range ring. It is a reference
  // panel, so it should sit ON the scene rather than punching through it.
  ctx.fillStyle = "rgba(12,18,14,0.40)";
  ctx.strokeStyle = "rgba(226,238,228,0.22)";
  ctx.lineWidth = 1;
  roundRect(ctx, mx, my, mmW, mmH, 5);
  ctx.fill();
  ctx.stroke();
  // a top highlight, so it reads as a pane of glass and not a cut-out
  const mmg = ctx.createLinearGradient(0, my, 0, my + mmH);
  mmg.addColorStop(0, "rgba(255,255,255,0.10)");
  mmg.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.fillStyle = mmg;
  roundRect(ctx, mx, my, mmW, mmH, 5);
  ctx.fill();
  const mmx = (x: number) => mx + (x / s.W) * mmW;
  const mmy = (y: number) => my + (y / s.H) * mmH;
  // road
  ctx.fillStyle = "rgba(238,242,248,0.22)";
  ctx.fillRect(mx + 1, mmy(road) - 1, mmW - 2, 2);
  // camera window
  ctx.strokeStyle = "rgba(238,242,248,0.28)";
  ctx.strokeRect(mmx(cam.x), mmy(cam.y), (vw / s.W) * mmW, (vh / s.H) * mmH);
  // trucks
  for (const tk of s.trucks) {
    ctx.fillStyle = tk.alive ? hpTint(Math.max(0, tk.hp / TRUCK_HP)) : "rgba(120,110,100,0.55)";
    ctx.fillRect(mmx(tk.x) - 2, mmy(tk.y) - 1.5, 4, 3);
  }
  // every live hostile pings on the strip: colored dot by kind (see
  // MM_FOE_TINT), a touch bigger for heavies, and a fresh spawn BLINKS for
  // its first second so the walk-in is caught at a glance
  let mmFoes = 0;
  for (const f of s.foes) {
    if (f.hp <= 0 || f.ko > 0) continue;
    const fresh = f.age < MM_SPAWN_FLASH_T;
    if (fresh && Math.floor(s.t * 8) % 2 === 1) continue; // the spawn blink
    const fx2 = clamp(mmx(f.x), mx + 2, mx + mmW - 2);
    const fy = clamp(mmy(f.y), my + 2, my + mmH - 2);
    ctx.fillStyle = MM_FOE_TINT[f.kind];
    ctx.beginPath();
    ctx.arc(fx2, fy, (f.kind === "heavy" ? 2.2 : 1.6) + (fresh ? 0.8 : 0), 0, Math.PI * 2);
    ctx.fill();
    mmFoes++;
  }
  // drop (blinks while falling)
  if (s.drop && (s.drop.fall <= 0 || Math.floor(s.t * 4) % 2 === 0)) {
    const d = s.drop;
    ctx.fillStyle = DROP_TINT[d.kind];
    ctx.save();
    ctx.translate(mmx(d.x), mmy(d.y));
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2.2, -2.2, 4.4, 4.4);
    ctx.restore();
  }
  // player
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(mmx(s.px), mmy(s.py), 2.4, 0, Math.PI * 2);
  ctx.fill();
  // the Optics flag on the spawning bank
  if (sp) {
    ctx.fillStyle = `rgba(232,121,249,${0.35 + sp.heat * 0.55})`;
    const fy = sp.side < 0 ? my + 1 : my + mmH - 3;
    ctx.fillRect(mx + 1, fy, mmW - 2, 2);
  }
  ctx.restore();

  // relief/loss cinematic wash (checklist: the ending is a cinematic, not a
  // frozen world with words) — a warm wash easing in on a win, a somber red
  // wash on a loss, both driven by cine.washT (eased in the component)
  if (cine.washT > 0.001) {
    ctx.save();
    ctx.globalAlpha = cine.washT;
    ctx.fillStyle = cine.reliefActive ? "rgba(240,179,64,0.14)" : "rgba(140,20,26,0.22)";
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
  }

  // vignette
  const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.44, vw / 2, vh / 2, Math.max(vw, vh) * 0.74);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.44)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, vw, vh);

  // ── HUD ──
  ctx.fillStyle = WHITE;
  ctx.font = `800 18px ${HUD_FONT}`;
  ctx.fillText(`${Math.round(s.score)}`, 14, 28);
  ctx.fillStyle = MUTED;
  ctx.font = `700 11px ${HUD_FONT}`;
  ctx.fillText(`${waveFmt(Math.max(1, s.wave))} / ${RUN_MAX_WAVES}`, 14, 44);
  // Convoy pips, one per truck, in road order. TRUCKS is 0 now (you are the
  // spearhead), so this loop and its label draw nothing -- both are kept
  // behind the length check so restoring the squad is still one constant.
  for (let i = 0; i < s.trucks.length; i++) {
    const tk = s.trucks[i];
    const frac = tk.alive ? Math.max(0.12, tk.hp / TRUCK_HP) : 0;
    const x = vw - 16 - (s.trucks.length - 1 - i) * 15;
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.fillRect(x - 10, 16, 10, 13);
    if (tk.alive) {
      ctx.fillStyle = hpTint(frac);
      ctx.fillRect(x - 10, 16 + 13 * (1 - frac), 10, 13 * frac);
    }
  }
  if (s.trucks.length > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `700 9.5px ${HUD_FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(T("SQUAD"), vw - 14, 40);
    ctx.textAlign = "left";
  }
  // your hull integrity (Armor/IRON HULL can raise the max, so the bar is
  // over s.maxHp)
  const hpFrac = Math.max(0, s.hp / s.maxHp);
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.fillRect(14, vh - 24, 92, 6);
  ctx.fillStyle = s.disabled > 0 ? "#f87171" : hpFrac > 0.4 ? ACCENT : AMBER;
  ctx.fillRect(14, vh - 24, 92 * (s.disabled > 0 ? 0 : hpFrac), 6);
  ctx.fillStyle = MUTED;
  ctx.font = `700 9.5px ${HUD_FONT}`;
  ctx.fillText(s.disabled > 0 ? (AR["REPAIRING_FMT"] ?? "REPAIRING {t}s").replace("{t}", s.disabled.toFixed(1)) : T("HULL"), 14, vh - 30);
  // active power-ups: one HUD PILL each with a live countdown (round-2 ask),
  // wrapping to a second row so a greedy crate run never paints off-canvas
  const pills: { label: string; t: number; total: number; tint: string }[] = [];
  if (s.ammoT > 0) pills.push({ label: DROP_LABEL.ammo, t: s.ammoT, total: BOOST_T, tint: DROP_TINT.ammo });
  if (s.twinT > 0) pills.push({ label: DROP_LABEL.twin, t: s.twinT, total: BOOST_T, tint: DROP_TINT.twin });
  if (s.spreadT > 0) pills.push({ label: DROP_LABEL.spread, t: s.spreadT, total: SPREAD_T, tint: DROP_TINT.spread });
  if (s.rapidT > 0) pills.push({ label: DROP_LABEL.rapid, t: s.rapidT, total: RAPID_T, tint: DROP_TINT.rapid });
  if (s.hasteT > 0) pills.push({ label: DROP_LABEL.haste, t: s.hasteT, total: HASTE_T, tint: DROP_TINT.haste });
  if (s.rangeT > 0) pills.push({ label: DROP_LABEL.range, t: s.rangeT, total: RANGE_T, tint: DROP_TINT.range });
  for (let i = 0; i < pills.length; i++) {
    const p = pills[i];
    const pw = 64;
    const px0 = 118 + (i % 3) * (pw + 6);
    const py0 = vh - 34 - Math.floor(i / 3) * 24;
    ctx.save();
    ctx.fillStyle = "rgba(10,13,17,0.66)";
    roundRect(ctx, px0, py0, pw, 20, 5);
    ctx.fill();
    ctx.strokeStyle = p.tint;
    ctx.lineWidth = 1;
    roundRect(ctx, px0, py0, pw, 20, 5);
    ctx.stroke();
    ctx.fillStyle = p.tint;
    ctx.font = `800 8.5px ${HUD_FONT}`;
    ctx.fillText(`${T(p.label)} ${Math.ceil(p.t)}s`, px0 + 5, py0 + 9.5);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(px0 + 5, py0 + 13.5, pw - 10, 3);
    ctx.fillStyle = p.tint;
    ctx.fillRect(px0 + 5, py0 + 13.5, (pw - 10) * clamp(p.t / p.total, 0, 1), 3);
    ctx.restore();
  }
  // the choice gate (drawn above the HUD, below the banner/plate)
  if (s.choicePending) drawChoiceGate(ctx, s, vw, vh);
  // pagefx cheer: the gold ring + confetti, edge-triggered by the component
  // on a wave held / combo unlocked / FINAL ASSAULT resolved / relief win
  drawCheer(ctx, fx, { w: vw, h: vh, k });
  // banner / plate
  if (s.banner) drawPlate(ctx, vw, vh, s.banner);
  if (s.phase === "intro") {
    ctx.textAlign = "center";
    // fielded-tank nameplate (ShellView.tank; starter for guests/practice)
    ctx.fillStyle = ACCENT;
    ctx.font = `900 15px ${DISPLAY_FONT}`;
    ctx.fillText(`${(view.tank?.name ?? STARTER_NAME).toUpperCase()} · ${T("WARPATH")}`, vw / 2, vh - 64);
    ctx.fillStyle = "rgba(170,180,189,0.92)";
    ctx.font = `600 12px ${HUD_FONT}`;
    ctx.fillText(T("hold to drive, quick tap to fire, the turret has to swing"), vw / 2, vh - 44);
    ctx.fillText(T("the line is longer than your screen. read the map, chase the chevrons"), vw / 2, vh - 26);
    ctx.textAlign = "left";
  }
  // hit flash
  if (s.flash > 0 && !REDUCED_MOTION) {
    ctx.fillStyle = `rgba(232,61,78,${s.flash * 0.28})`;
    ctx.fillRect(0, 0, vw, vh);
  }

  return { chevrons, mmFoes, pills: pills.map((p) => p.label), ringR, ringHot };
}

// ── component ───────────────────────────────────────────────────────────────

/** Localized copy pack, built by ./page.tsx from dict(getLocale()).arcade:
 * the shared shell chrome + this game's overrides in `shell`, plus the
 * idle-card instruction copy. Optional so a bare <Client /> still renders
 * its English defaults (the literals below stay as the fallback). */
export type WarpathStrings = {
  intro: string;
  introDaily: string;
  shell: Partial<RunShellStrings>;
  /** EXACT-english-string -> localized arena vocabulary (en sends {}). */
  arena?: Record<string, string>;
};

export default function HoldTheLineClient({ strings }: { strings?: WarpathStrings }) {
  AR = strings?.arena ?? {}; // arena i18n map for the module-level draw code
  const camRef = useRef<Cam>({ x: 0, y: 0, vx: 0, vy: 0, zoom: 1 });
  const prevPosRef = useRef({ x: 0, y: 0 });
  const lastTRef = useRef(0);
  const fxRef = useRef<PageFx | null>(null);
  const cineRef = useRef<CineState>({
    wave: 0,
    win: false,
    phase: "intro",
    bannerBigTxt: null,
    choicePending: false,
    choicePick: -1,
    zoomTarget: 1,
    pulseT: 0,
    reliefActive: false,
    lossActive: false,
    washT: 0,
  });
  const engRef = useRef<{ tank: SfxLoopHandle | null; truck: SfxLoopHandle | null; trucksAlive: number }>({
    tank: null,
    truck: null,
    trucksAlive: TRUCKS,
  });
  const casingsRef = useRef<CasingParticle[]>([]);
  const prevRef = useRef({
    score: 0,
    kills: 0,
    wave: 0,
    muzzle: 0,
    trucks: TRUCKS,
    drops: 0,
    hp: 0,
    dropActive: false,
    fuse: 0,
    win: false,
    over: false,
    sawDust: false,
    sawRam: false,
    sawRanging: false,
    choicePending: false,
    waveBreakBucket: 0,
  });

  const createSim = useCallback(
    (w: number, h: number, seed: string, reduced: boolean, stats: PlayerStats | null) => {
      const st = createWarpath(w, h, seed, reduced, stats);
      // snap the camera onto the player (no first-frame lurch)
      camRef.current = {
        x: clamp(st.px - w / 2, 0, Math.max(0, st.W - w)),
        y: clamp(st.py - h / 2, 0, Math.max(0, st.H - h)),
        vx: 0,
        vy: 0,
        zoom: 1,
      };
      prevPosRef.current = { x: st.px, y: st.py };
      lastTRef.current = 0;
      // a fresh PageFx per run: cheer edge-detection state must never leak
      // from a previous run into a new one (the shared module's own note)
      fxRef.current = createPageFx(seed, { accent: ACCENT, reducedMotion: reduced, effects: { lean: false, banner: false } });
      cineRef.current = {
        wave: 0,
        win: false,
        phase: "intro",
        bannerBigTxt: null,
        choicePending: false,
        choicePick: -1,
        zoomTarget: 1,
        pulseT: 0,
        reliefActive: false,
        lossActive: false,
        washT: 0,
      };
      engRef.current = { tank: null, truck: null, trucksAlive: TRUCKS };
      casingsRef.current = [];
      prevRef.current = {
        score: 0,
        kills: 0,
        wave: 0,
        muzzle: 0,
        trucks: TRUCKS,
        drops: 0,
        hp: st.hp, // Armor can start the hull above stock
        dropActive: false,
        fuse: 0,
        win: false,
        over: false,
        sawDust: false,
        sawRam: false,
        sawRanging: false,
        choicePending: false,
        waveBreakBucket: 0,
      };
      return st;
    },
    [],
  );

  // camera update + render (page-side cosmetics; the sim is already stepped)
  const draw = useCallback((ctx: CanvasRenderingContext2D, s: WarpathState, view: ShellView) => {
    const cam = camRef.current;
    const fx = fxRef.current;
    const cine = cineRef.current;
    if (!fx) return;
    const now = performance.now();
    const dt = lastTRef.current > 0 ? Math.min(0.05, (now - lastTRef.current) / 1000) : 1 / 60;
    lastTRef.current = now;
    // velocity-led follow: the camera looks where the hull is going
    const ivx = dt > 0 ? (s.px - prevPosRef.current.x) / dt : 0;
    const ivy = dt > 0 ? (s.py - prevPosRef.current.y) / dt : 0;
    prevPosRef.current = { x: s.px, y: s.py };
    const vf = Math.min(1, dt * 6);
    cam.vx += (ivx - cam.vx) * vf;
    cam.vy += (ivy - cam.vy) * vf;

    // ── cinematic edge detection (draw cadence: once per paint, immune to
    // the shell's substep cadence — see the file header) ──
    const bigTxt = s.banner?.big ? s.banner.txt : null;
    if (s.win && !cine.win) {
      cine.reliefActive = true;
      cine.zoomTarget = 1.16;
    }
    if (!s.win && s.phase === "ko" && cine.phase !== "ko") {
      cine.lossActive = true;
    }
    if (bigTxt && bigTxt !== cine.bannerBigTxt && bigTxt === "FINAL ASSAULT") {
      cine.pulseT = 0.55; // a punch-in that self-reverts (the major-entrance beat)
    }
    cine.wave = s.wave;
    cine.win = s.win;
    cine.phase = s.phase;
    cine.bannerBigTxt = bigTxt;
    cine.choicePending = s.choicePending;
    cine.choicePick = s.choicePick;

    // zoom target: relief sustains, a FINAL ASSAULT entrance pulses & reverts
    let zoomTarget = 1;
    if (cine.reliefActive) zoomTarget = REDUCED_MOTION ? 1 : 1.16;
    else if (cine.pulseT > 0) {
      cine.pulseT = Math.max(0, cine.pulseT - dt);
      zoomTarget = REDUCED_MOTION ? 1 : 1.09;
    }
    cam.zoom += (zoomTarget - cam.zoom) * Math.min(1, dt * ZOOM_EASE);

    // the relief/loss wash eases in, then just sits (the results screen
    // takes over the DOM shortly after; this canvas stops mattering)
    const washTarget = cine.reliefActive || cine.lossActive ? 1 : 0;
    cine.washT += (washTarget - cine.washT) * Math.min(1, dt * 2.6);

    // camera pan target: normal follow, EXCEPT during the relief cinematic,
    // which pans toward the midpoint of the hero and the convoy you held —
    // a deliberate, event-triggered camera MOVE, not the ambient follow
    let targetX = s.px;
    let targetY = s.py;
    if (cine.reliefActive) {
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const tk of s.trucks) {
        if (!tk.alive) continue;
        cx += tk.x;
        cy += tk.y;
        n++;
      }
      if (n > 0) {
        targetX = (s.px + cx / n) / 2;
        targetY = (s.py + cy / n) / 2;
      }
    }
    const tx = clamp(targetX + cam.vx * CAM_LEAD - view.w / 2, 0, Math.max(0, s.W - view.w));
    const ty = clamp(targetY + cam.vy * CAM_LEAD - view.h / 2, 0, Math.max(0, s.H - view.h));
    const cf = Math.min(1, dt * CAM_EASE);
    cam.x += (tx - cam.x) * cf;
    cam.y += (ty - cam.y) * cf;

    // page-fx step: motes/streaks/cheer. `rolling` also covers HASTE (the
    // speed streaks visibly thicken under a speed boost)
    const rolling = Math.hypot(cam.vx, cam.vy) > 20 && s.phase === "play";
    stepPageFx(fx, { clock: s.t, w: view.w, h: view.h, k: s.k, rolling });

    // ejected shell casings: page-only cosmetic, Math.random is fine here
    // (this file is never imported by the sim)
    if (s.muzzle > 0.065 && casingsRef.current.length < 24) {
      const c = casing(
        s.px + Math.cos(s.ta) * 14 * s.k,
        s.py + Math.sin(s.ta) * 14 * s.k,
        s.ta,
        () => Math.random(),
      );
      casingsRef.current.push(c);
    }
    if (!REDUCED_MOTION) {
      for (const c of casingsRef.current) {
        c.vy += 260 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += c.rv * dt;
        c.life += dt;
      }
    }
    casingsRef.current = casingsRef.current.filter((c) => c.life < c.maxLife);

    const frame = drawScene(ctx, s, view, cam, fx, cine);

    // casings render in world space; simplest correct approach is a second
    // tiny pass using the SAME camera transform math as drawScene's world
    // block (cheap: this array is capped at 24)
    if (casingsRef.current.length) {
      ctx.save();
      ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
      ctx.fillStyle = GOLD;
      for (const c of casingsRef.current) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.globalAlpha = Math.max(0, 1 - c.life / c.maxLife);
        ctx.fillRect(-2 * s.k, -0.9 * s.k, 4 * s.k, 1.8 * s.k);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // DOM-probe hook (see WpDebug above)
    window.__wp = {
      phase: s.phase,
      px: s.px,
      py: s.py,
      camX: cam.x,
      camY: cam.y,
      screenX: s.px - cam.x,
      screenY: s.py - cam.y,
      worldW: s.W,
      worldH: s.H,
      viewW: view.w,
      viewH: view.h,
      chevrons: frame.chevrons,
      minimap: true,
      minimapFoes: frame.mmFoes,
      pills: frame.pills,
      ringR: frame.ringR,
      ringHot: frame.ringHot,
      drop: s.drop ? { x: s.drop.x, y: s.drop.y, kind: s.drop.kind, fall: s.drop.fall } : null,
      wave: s.wave,
      choicePending: s.choicePending,
      bannerBig: !!s.banner?.big,
    };
  }, []);

  // audio on sim deltas (page-side; the sim stays pure). RunShell owns the
  // Sfx instance and births it unmuted inside the Start tap.
  const onFrame = useCallback((s: WarpathState, sfx: Sfx) => {
    const prev = prevRef.current;

    // engine loops: eng-tank revs with hull speed (derived from the camera's
    // own velocity lead, already computed every draw frame), eng-truck's
    // gain follows how much of the convoy is still running
    const eng = engRef.current;
    if (s.phase === "play" && !eng.tank) {
      eng.tank = sfx.loop("eng-tank", { gain: 0.8 });
      eng.truck = sfx.loop("eng-truck", { gain: 0.7 });
    }
    if (eng.tank) {
      const spd = Math.hypot(camRef.current.vx, camRef.current.vy);
      const rate = clamp(0.82 + (spd / (PLAYER_SPEED_APPROX * s.k)) * 0.55, 0.75, 1.55);
      eng.tank.setRate(rate);
    }
    const aliveTrucks = warpathSquadAlive(s);
    if (eng.truck && aliveTrucks !== eng.trucksAlive) {
      eng.truck.setGain(Math.max(0.1, aliveTrucks / TRUCKS));
      eng.trucksAlive = aliveTrucks;
    }

    // THE FINAL ASSAULT GATE: the pause opens (a warning), resolves (a clank)
    if (s.choicePending && !prev.choicePending) sfx.play("warn");
    if (!s.choicePending && prev.choicePending) sfx.play("clank");
    prev.choicePending = s.choicePending;

    // wave-incoming drum roll: soft ticks while the ordinary break counts
    // down (never during the choice gate, which has its own cue above)
    if (s.waveBreakT > 0 && !s.choicePending && s.phase === "play") {
      const bucket = Math.ceil(s.waveBreakT / 0.42);
      if (prev.waveBreakBucket !== 0 && bucket < prev.waveBreakBucket) sfx.play("tap");
      prev.waveBreakBucket = bucket;
    } else prev.waveBreakBucket = 0;

    // player fire: the cannon + an ejected-casing tick
    if (s.muzzle > prev.muzzle) {
      sfx.play("cannon");
    }
    prev.muzzle = s.muzzle;

    // kills, graduated by value (the score delta is a fair proxy for which
    // target just fell): a sapper's few points get a light "hit", a car's
    // "clank", a heavy or a big grid bonus the full "explode". Keyed off
    // s.kills (not the raw score) so drop pickups and wave/relief bonuses -
    // which also raise score but are announced by their OWN sfx below -
    // never double-fire this one.
    if (s.kills > prev.kills) {
      const delta = s.score - prev.score;
      sfx.play(delta >= 25 ? "explode" : delta >= 10 ? "clank" : "hit");
    }
    prev.kills = s.kills;
    prev.score = s.score;
    if (s.dropsTaken > prev.drops) sfx.play("pickup");
    prev.drops = s.dropsTaken;
    if (aliveTrucks < prev.trucks) sfx.play(aliveTrucks <= 0 ? "explode" : "blast");
    prev.trucks = aliveTrucks;
    if (s.hp < prev.hp) sfx.play("hurt");
    prev.hp = s.hp;
    if (s.wave > prev.wave && s.wave > 1) {
      // ACT II (wave 6) and ACT III (wave 11) get their own stinger, distinct
      // from an ordinary wave-held chime (mirrors sim.ts's ACT_II_WAVE/
      // ACT_III_WAVE, not exported - a display-only mirror, same pattern as
      // MUZZLE_T/PLAYER_SPEED_APPROX above)
      sfx.play(s.wave === 6 || s.wave === 11 ? "banner" : "score");
    }
    prev.wave = s.wave;
    const dropActive = !!s.drop;
    if (dropActive && !prev.dropActive) sfx.play("alarm"); // drop inbound
    prev.dropActive = dropActive;

    // combos discovered: a shared "ability unlocked" chime
    if (s.sawDust && !prev.sawDust) sfx.play("powerup");
    if (s.sawRam && !prev.sawRam) sfx.play("powerup");
    if (s.sawRanging && !prev.sawRanging) sfx.play("powerup");
    prev.sawDust = s.sawDust;
    prev.sawRam = s.sawRam;
    prev.sawRanging = s.sawRanging;

    // the FINAL ASSAULT entrance: a boss-grade stinger
    if (s.banner?.txt === "FINAL ASSAULT" && s.wave !== prev.wave) sfx.play("boss");

    // the run's two cinematic endings: engines cut, one clean stinger each
    if (s.phase === "ko" && !prev.over) {
      sfx.stopAll();
      if (s.win) sfx.play("fanfare");
    }
    prev.over = s.phase === "ko" || s.phase === "over";
    prev.win = s.win;

    // demolition fuses tick down audibly (the existing tap synth)
    let minPlant = Infinity;
    for (const f of s.foes) {
      if (f.plant > 0 && f.hp > 0 && f.ko <= 0) minPlant = Math.min(minPlant, f.plant);
    }
    if (minPlant < Infinity) {
      const bucket = Math.ceil(minPlant * 2);
      if (prev.fuse !== 0 && bucket < prev.fuse) sfx.play("tap");
      prev.fuse = bucket;
    } else prev.fuse = 0;
  }, []);

  return (
    <RunShell<WarpathState>
      game={GAME}
      title={TITLE}
      accent={ACCENT}
      createSim={createSim}
      step={(s, dt, input) => stepWarpath(s, dt, input)}
      draw={draw}
      done={warpathDone}
      score={warpathScore}
      pointerTransform={(x, y) => ({ x: x + camRef.current.x, y: y + camRef.current.y })}
      onFrame={onFrame}
      sfxPack={SFX_PACK}
      runMeta={(s, ctx) => ({
        v: 2,
        daily: ctx.daily,
        grid: ctx.grid,
        wave: s.wave,
        kills: s.kills,
        drops: s.dropsTaken,
        trucks: warpathSquadAlive(s),
        relief: s.win,
      })}
      shareBuild={(s, dayKey) => {
        const g = gridEmoji(s);
        return { grid: g, payload: sharePayload(dayKey, Math.round(s.score), warpathSquadAlive(s), g) };
      }}
      resultHeadline={(s) => (s.win ? "The relief column arrives" : "Hull breached")}
      resultSub={(s) =>
        s.win
          ? `The line held. ${s.kills} kills across ${RUN_MAX_WAVES} waves and the Siegebreaker`
          : `Held ${Math.round(s.t)}s · wave ${s.wave}/${RUN_MAX_WAVES} · ${s.kills} kills`
      }
      intro={<GameIntro intro={strings?.intro ??
              "You hold a valley road alone. Hold anywhere to drive there, quick tap to fire. Your turret tracks the nearest enemy, and the ring around your tank is its true reach. Everything on the field is coming for your hull, and each wave reloads faster than the last. Nine waves, then the Siegebreaker."} daily={strings?.introDaily ??
              "Your first scored run today is the shared daily gauntlet: everyone holds the same valley."} more={strings?.shell?.howItWorks} />}
      strings={{
        startIdle: "Dig in",
        startAgain: "Dig in again",
        scoreUnit: "damage",
        dailyResultNote: "The daily gauntlet · the same valley for everyone today",
        ...strings?.shell,
      }}
    />
  );
}
