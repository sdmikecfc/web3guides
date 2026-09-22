/**
 * SEASON 5 · IRON SIEGE — WARHAWKS client (game key "warhawks").
 * VERTICAL auto-scroll WW2 sortie, the S3 Asteroid Raid camera flown slower:
 * the camera looks STRAIGHT DOWN and is fixed, the whole screen is enemy ground
 * and it scrolls DOWNWARD past a plane holding station near the bottom. The sim
 * runs in world coordinates where `x` is lateral (never scrolled, so world x ==
 * screen x) and `wy` is forward progress, and this renderer is a pure window
 * onto it: the ONLY projection is sy(s, wy) = camY(s) - wy, a function of sim
 * state, so there is no page-side camera at all.
 *
 * NO pointerTransform: because nothing scrolls laterally and the sim reads the
 * pointer only for lateral steering, the sim's input space IS canvas pixel
 * space — which is exactly the space input tapes are recorded in, so RunShell
 * hands the pointer straight through and tapes replay identically headless.
 *
 * SIM/DRAW SPLIT: all rules live in ./sim (pure, node-runnable, two RNG
 * streams; every gameplay roll happens at construction). Scoring, the leg
 * tables and the exact maxScore ceiling math are documented there; ceiling()
 * computes 5610 from the same constants the game runs on (registry 6171).
 *
 * SHELL: RunShell (../_shared/RunShell) — shared-seed daily
 * ("s5-warhawks-YYYY-MM-DD"), 3-leg emoji grid share + copyable payload
 * ("WARHAWKS MM-DD - <n> damage"), death-banks-after-the-60s-floor, audio
 * born unmuted in the Start tap plus the DOM mute toggle, markFtueRun on
 * every result, guest and practice modes, the nonce handshake on every
 * banked score.
 *
 * ART: painted sprites via loadManifest("warhawks", ...) with the primitive
 * vector fallback on every draw (art can land or slip with zero code risk).
 * The three airframes and the tank were re-shot TOP-DOWN for this camera and
 * bg-ground is now an aerial plan view of the front (gen-warhawks-art.js,
 * 2026-07-25); every plane cutout is drawn NOSE-UP and rotated here, so a
 * diver is the same sprite at PI. Machines only, ZERO markings, no insignia.
 * Hostiles carry a MAGENTA glow (the S3 colorblind lesson); the player accent
 * is sky blue.
 *
 * THE BOMB IS THE GAME: guns are air-only and pay 20, bombs are ground-only
 * and pay 70/90/260/450, so 88.9% of the board is bomb points. That is why the
 * BOMBSIGHT PIPPER is drawn as a first-class object — a dashed cross PIPPER_LEAD
 * px up-screen of the plane. PIPPER_LEAD, not the true ballistic BOMB_LEAD: a
 * real double-tap is a full gesture, not an instant, so the pipper leads
 * further than the physics do, exactly enough that committing the instant a
 * target crosses it still lands the bomb on it (see sim.ts's BOMB_COMMIT_T).
 * The pipper is ALSO drawn AFTER endCameraFx, never inside the shake/recoil
 * transform every world entity sits in — a HUD instrument stays honest
 * through a shake, the way a bombsight reticle is fixed to the airframe while
 * the ground outside heaves.
 *
 * THE CLIMAX: leg 3 does not auto-win. It opens the STRIP, a real final
 * stretch with its own FLAGSHIP BASE (hp 5, the biggest single payout on the
 * board) that gets the franchise's full boss treatment on first sight —
 * freeze, camera punch, shake, a named plate with an instruction subtitle, a
 * stinger — then GEAR DOWN locks the bomb bay for the last stretch to the true
 * touchdown line: pure evasion to close it out, announced on the HUD.
 *
 * FIELDED TANK (spec 2.5 via ShellView.tank): the plane flies FOR the tank —
 * the intro card prints "FLYING FOR <TANK NAME>'S COLUMN" off view.tank.name
 * (starter fallback for guests/practice). Display-side only; sims never see
 * the tank. The SAME paused intro window also hosts the LOADOUT pick (see
 * sim.ts): hold the left half for ESCORT, the right half for STRIKE.
 *
 * FEEL: banking tilt off lateral speed, a spinning propeller layer over every
 * airframe (painted or vector), a world-fixed contrail that slides down the
 * screen like real smoke hanging in the air, telegraphed flak rings with the
 * rising shell line,
 * lethal ridge lines that hatch when you drift near them, a long baked ground
 * shadow under every entity, idle animation on every foe, cartoon KOs (an
 * animated settle for ground armor, never a flat opacity snap), zero blood,
 * machines only. The shared PageFx kit (../_shared/pagefx) drives camera
 * shake/lean/recoil-punch, ambient motes and speed streaks, and the milestone
 * cheer; prefers-reduced-motion is threaded through it and kills shake/flash
 * here too (fx stream only; gameplay untouched). Two type registers: a
 * stencil/era face for diegetic plates (banners, the flagship name plate, the
 * pilot line), neutral sans everywhere else (HUD numbers, floaters).
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import { RunShell, type RunShellStrings, type ShellView } from "../_shared/RunShell";
import { GameIntro } from "../_shared/GameIntro";
import { type Sfx, type SfxLoopHandle } from "../_shared/sfx";
import { canvasTex, loadManifest, longShadow, ready, spr, sprRot } from "../_shared/art";
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
  ACE_HP_MUL,
  BASE_HP,
  BOMB_CD,
  BOMB_FALL,
  FLAGSHIP_HP,
  FLAGSHIP_PTS,
  FIGHTER_B_HP,
  GEAR_DOWN_ZONE,
  LANE_PAD,
  PIPPER_LEAD,
  PLANE_R,
  ROLL,
  SCROLL,
  camY,
  createWarhawks,
  flagshipOf,
  gearDown,
  gridEmoji,
  nextFighterWarning,
  sharePayload,
  stepWarhawks,
  sy,
  warDone,
  warScore,
  type AA,
  type Fighter,
  type GroundTarget,
  type WarState,
  planeScreenY,
  FUEL_MAX,
  GUN_LVL_MAX,
} from "./sim";

const GAME = "warhawks"; // the stable registry key
const TITLE = "Warhawks";
const ACCENT = "#7dd3fc"; // sky blue: the warhawks tile accent
const MAGENTA = "#e879f9"; // hostile glow (colorblind-safe vs the blue player)
const AMBER = "#f0b340";
const GOLD = "#f0b340";
const WHITE = "#eef2f8";
const MUTED = "#aab4bd";

const STARTER_NAME = "M3 Stuart";

// ── ARENA i18n (page-side only; sim text is tape-frozen English) ─────────────
// AR comes from strings.ts (en = {}); the component assigns it before any
// draw. Patterns localize the sim's "LEG n" / "WHEELS DOWN +n" composites;
// misses fall back to the English key.
let AR: Record<string, string> = {};
const T = (x: string): string => {
  const hit = AR[x];
  if (hit) return hit;
  const lm = /^LEG (\d+)$/.exec(x);
  if (lm && AR["LEG_FMT"]) return AR["LEG_FMT"].replace("{n}", lm[1]);
  const wm = /^WHEELS DOWN \+(\d+)$/.exec(x);
  if (wm && AR["WHEELS DOWN"]) return `${AR["WHEELS DOWN"]} +${wm[1]}`;
  return x;
};
const legFmt = (n: number): string => (AR["LEG_FMT"] ?? "LEG {n}").replace("{n}", String(n));
const KO_SPIN = 1.4; // radians the doomed airframe rolls through as it falls
const PROP_RATE = 42; // rad/s: fast enough to read as a spinning disc, not a hand
/** Two typographic registers (criterion 15): a condensed/bold "stencil" face
 * for diegetic plates (banners, the flagship name plate, the pilot line) —
 * Impact is a near-universal system font and reads as stamped/military with
 * zero webfont load risk — neutral sans everywhere else (HUD numbers,
 * floaters, body copy). */
const ERA_FONT = "Impact, 'Arial Narrow', ui-sans-serif, sans-serif";

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// painted cutouts; every draw keeps its vector fallback (art.ts contract)
/** THE GROUND PALETTE. Deliberately mid-value and low-chroma: everything the
 * player has to see (their plane, the fighters, the bullets) is brighter and
 * more saturated than any of these, which is the only reliable way to keep a
 * top-down shooter readable. */
const FIELD_A = "#5f8a4a";
const FIELD_B = "#6d9552";
const FIELD_C = "#8a9a4d";

/* NO AIRCRAFT PLATES. player-plane was a 3/4 side view with a failed key
 * (a translucent ghost plane baked into it), and foe-fighter-a/b were pairs of
 * star-covered jets, also 3/4. This camera is a plan view, so a 3/4 cutout
 * cannot be rotated without reading as a tumble. The airframes are drawn
 * below, in colours chosen against the ground rather than against a mood. */
const ART = loadManifest("warhawks", [
  "plane-player",
  "plane-fighter",
  "plane-ace",
  "pickup",
  "bg-front",
  "aa-gun",
  "ground-tank",
  // BAKED GROUND TANK (2026-08-02, Mike: "the tanks on the screen look bad"):
  // the season's theirs-red heavy, one frame, nose baked +x and rotated to
  // face down-screen at the draw. ground-tank (painted) stays as fallback.
  "units/tank-theirs",
  "plane-gunship",
  // BAKED BASES (2026-08-02, Mike: "the ground bases need some kenney love").
  // Four dark-slate Kenney tower-defense structures, tilt-baked in /dev/bake;
  // variant picked deterministically off the base's own wy. ground-base (the
  // painted plate) stays as the first fallback tier, vector under that.
  "units/base-0",
  "units/base-1",
  "units/base-2",
  "units/base-3",
  "ground-base",
  /* NO ground-flagship. ground-base and aa-gun were re-shot strict top-down on
   * 2026-08-01 (ADR-0092/0095); the flagship plate is still the original 3/4
   * painting, so the biggest target on the strip was the one leaning over while
   * everything around it sat flat. The vector below is a finished plan-view
   * ship -- hull, bow structure, three turrets, a mast light whose blink rate
   * encodes damage -- and it agrees with the collision box because it is drawn
   * from the same numbers. Same call as Armor Clash's castles: when the drawing
   * is right and the plate is wrong, ship the drawing (ADR-0088). Re-add the
   * name here if a strict top-down flagship is ever shot. */
  "fx-flak",
  "fx-boom",
  "bomb",
  /* NO bg-sky: its only consumer was the under-cloud screen pass, which laid
   * a cyan film over the whole front (see the under-cloud comment). */
  /* NO bg-ground. It was a 3/4 aerial painting, and this camera tiles its
   * background with every other tile MIRRORED to hide the seam -- which turns
   * a 3/4 house upside down every other tile. It was also as bright and as
   * saturated as the aircraft, so nothing could read against it. The ground is
   * drawn below instead: a plan view has no up, so it cannot be mirrored
   * wrong, and it is deliberately duller than anything that matters. */
] as const);

/** DOM-probe hook: canvas pixels cannot be asserted structurally, so the
 * renderer publishes its numbers each frame. Read-only, tiny, never consumed
 * by the game itself. */
interface WbDebug {
  phase: WarState["phase"];
  x: number;
  wy: number;
  camY: number;
  screenX: number;
  screenY: number;
  leg: number;
  hits: number;
  score: number;
  gunScore: number;
  bombScore: number;
  bombsDropped: number;
  bombsLanded: number;
  bombsOnTarget: number;
  telesFired: number;
  burstsBloomed: number;
  fightersActive: number;
  viewW: number;
  viewH: number;
  /** The pipper's exact screen position (defect 2 verification: a bomb
   * released this frame lands here, in world terms, regardless of shake). */
  pipperX: number;
  pipperY: number;
  won: boolean;
  loadout: 0 | 1;
  gearDown: boolean;
  flagshipAlive: boolean;
  flagshipHp: number;
  flagshipWy: number;
}
declare global {
  interface Window {
    __wb?: WbDebug;
  }
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
 * ground target (the tankbuster mark grammar). */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  const arm = Math.max(2.4, r * 0.42);
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4 * k;
  for (const [sx, sv] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * r, y + sv * r - sv * arm);
    ctx.lineTo(x + sx * r, y + sv * r);
    ctx.lineTo(x + sx * r - sx * arm, y + sv * r);
    ctx.stroke();
  }
  ctx.restore();
}

/** A dashed aiming cross. The bombsight pipper and the live impact reticle are
 * the same mark at different sizes: what you aim with is what you get. */
function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, col: string, dash: boolean) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.3 * k;
  if (dash) ctx.setLineDash([3.5 * k, 3.5 * k]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x - r * 1.5, y);
  ctx.lineTo(x - r * 0.45, y);
  ctx.moveTo(x + r * 0.45, y);
  ctx.lineTo(x + r * 1.5, y);
  ctx.moveTo(x, y - r * 1.5);
  ctx.lineTo(x, y - r * 0.45);
  ctx.moveTo(x, y + r * 0.45);
  ctx.lineTo(x, y + r * 1.5);
  ctx.stroke();
  ctx.restore();
}

/** A spinning propeller disc, drawn as its OWN rotating layer over whatever
 * airframe sprite sits underneath (painted or vector) — a static painted cutout
 * never animates on its own, so the blur has to be a separate draw. Two blades
 * plus a hub. Call inside the caller's OWN translate-to-the-nose (and, for a
 * banked airframe, its own rotate-to-heading): this draws at the CURRENT
 * origin, rotating by `spin`, which the caller derives from the sim clock
 * (deterministic, no new sim state) at whatever rate reads as spinning rather
 * than a sweeping hand. */
function drawProp(ctx: CanvasRenderingContext2D, r: number, spin: number, glow: string) {
  ctx.save();
  ctx.rotate(spin);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#e8ecf2";
  ctx.shadowColor = glow;
  ctx.shadowBlur = 5;
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r * 0.22);
  ctx.lineTo(0, r * 0.22);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#1a1d22";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── world draws (every one projects wy through sy(s, wy)) ───────────────────

function drawFighter(ctx: CanvasRenderingContext2D, s: WarState, f: Fighter) {
  if (f.state === "wait" || f.state === "gone") return;
  if (f.dead && f.ko <= 0) return;
  const k = s.k;
  const py = sy(s, f.wy);
  if (py < -70 * k || py > s.H + 70 * k) return;
  const diving = f.kind === "dive";
  const flanking = f.kind === "flank";
  // the cutouts are NOSE-UP: a diver is the same sprite at PI. Bank tilts into
  // the slide, mirrored for the diver because its nose faces the other way. A
  // flanker's "bank" IS its heading: nose points straight into its sweep
  // (screen-right for a left-to-right pass, PI/2; the mirror for the other
  // way), no lean, since it holds one row the whole pass.
  const bank = Math.max(-0.34, Math.min(0.34, f.vx / (150 * k)));
  const rot = flanking ? (f.vx >= 0 ? Math.PI / 2 : -Math.PI / 2) : diving ? Math.PI - bank : bank;
  // longShadow's own k arg is a SEPARATE multiplier on top of r (see its
  // header: "r is the entity's own on-screen radius"), so passing s.k here
  // when f.r is already s.k-scaled (every S5 entity radius is) would double
  // it on the x-axis only; k=1 keeps the shadow's own proportions uniform.
  if (!f.dead) longShadow(ctx, f.x, py, f.r, 1);
  ctx.save();
  if (f.dead) {
    ctx.globalAlpha = Math.min(1, f.ko * 2.2);
  }
  if (f.hit > 0) {
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 12;
  } else if (!f.dead) {
    ctx.shadowColor = MAGENTA;
    ctx.shadowBlur = 9;
  }
  // FLANK reuses the diver's nimble airframe (same family: a fast pass, not
  // the tankier climber). Only the pure CLIMB silhouette gets foe-fighter-b.
  // A HOSTILE AIRFRAME, plan view, nose toward -y in local space. Hot red
  // body, magenta rim: the season's colourblind law, and the only pairing that
  // survives every green this game scrolls underneath it.
  {
    ctx.save();
    ctx.translate(f.x, py);
    ctx.rotate(f.dead ? rot + (0.6 - f.ko) * f.spin * 0.5 : rot);
    const r = f.r;
    // PAINTED HOSTILE. The ace gets its own airframe; everything else shares
    // the interceptor. The MAGENTA RIM SURVIVES as an under-glow rather than a
    // stroke: it is the season's colourblind law and "the only pairing that
    // survives every green this game scrolls underneath it", so the art is not
    // allowed to quietly repeal it. The ace's pulsing ring is drawn separately
    // further down and still identifies it.
    const fArt = f.ace
      ? ART["plane-ace"] || ART["plane-fighter"]
      : f.gun
        ? ART["plane-gunship"] || ART["plane-fighter"]
        : ART["plane-fighter"];
    if (ready(fArt)) {
      if (!f.dead) {
        ctx.shadowColor = MAGENTA;
        ctx.shadowBlur = 7;
      }
      spr(ctx, fArt, 0, 0, r * 3.6, () => {});
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
    ctx.lineJoin = "round";
    ctx.strokeStyle = f.dead ? "rgba(120,60,110,0.7)" : MAGENTA;
    ctx.lineWidth = 2.2;
    ctx.fillStyle = f.dead ? "#7a3b3b" : f.gun ? "#8f2430" : "#e8443c";
    ctx.beginPath(); // wing
    ctx.ellipse(0, 0, r * 1.75, r * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = f.dead ? "#66302f" : "#c4302a";
    ctx.beginPath(); // fuselage
    ctx.ellipse(0, r * 0.1, r * 0.38, r * 1.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // tailplane
    ctx.roundRect(-r * 0.78, r * 1.02, r * 1.56, r * 0.34, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2a1418";
    ctx.beginPath(); // canopy, so the nose direction is unmistakable
    ctx.ellipse(0, -r * 0.25, r * 0.22, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    }
  }
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.globalAlpha = 1;
  // the propeller: a SEPARATE rotating layer at the nose, over the painted
  // sprite or the vector fallback alike, spinning only while the airframe is
  // alive
  if (!f.dead) {
    ctx.save();
    ctx.translate(f.x, py);
    ctx.rotate(rot);
    ctx.translate(0, -f.r * (diving || flanking ? 1.55 : 1.8));
    drawProp(ctx, f.r * 0.55, s.t * PROP_RATE, MAGENTA);
    ctx.restore();
  }
  // LEG 2's ACE (see Fighter.ace, sim.ts): a slow pulsing red ring so it
  // reads as the leg's one real threat the instant it is on screen, not just
  // once its HP bar fails to drop.
  if (!f.dead && f.ace) {
    ctx.save();
    ctx.strokeStyle = "#ff8a8a";
    ctx.globalAlpha = 0.5 + 0.35 * Math.sin(s.t * 6.5);
    ctx.lineWidth = 1.6 * k;
    ctx.beginPath();
    ctx.arc(f.x, py, f.r * 1.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (f.dead && f.ko > 0.25) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (f.ko - 0.25) * 2.4);
    spr(ctx, ART["fx-boom"], f.x, py, f.r * 3.2, () => {});
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // climbers carry visible hit points: the "commit to it" target. The ACE's
  // own max is recomputed off the same formula sim.ts spawns it with (no new
  // field needed: it is a pure, deterministic function of f.ace).
  if (!f.dead && f.kind === "climb") {
    const maxHp = f.ace ? Math.round(FIGHTER_B_HP * ACE_HP_MUL) : FIGHTER_B_HP;
    for (let i = 0; i < Math.min(maxHp, Math.max(0, Math.ceil(f.hp))); i++) {
      ctx.fillStyle = f.ace ? "#ff8a8a" : MAGENTA;
      ctx.fillRect(f.x - f.r + i * 3.4 * k, py - f.r - 7 * k, 2.4 * k, 3 * k);
    }
  }
}


function drawGround(ctx: CanvasRenderingContext2D, s: WarState, g: GroundTarget) {
  const k = s.k;
  const y = sy(s, g.wy);
  const reach = g.kind === "flagship" ? 90 * k : g.kind === "base" ? 70 * k : 40 * k;
  if (y < -reach || y > s.H + reach) return;
  const alive = !g.dead;
  // KO is an ANIMATION, never a flat opacity snap: a brief settle (rotate +
  // squash) driven by the existing g.burn ramp (0.001->1 over ~0.5s, no new
  // sim field needed), alpha easing down AS it settles rather than cutting
  // to a fixed dim the instant it dies.
  const settle = g.dead ? Math.min(1, g.burn * 1.4) : 0;
  ctx.save();
  ctx.globalAlpha = g.dead ? Math.max(0.4, 1 - settle * 0.6) : 1;
  ctx.translate(g.x, y);
  ctx.rotate(settle * 0.14 * (g.wy % 2 < 1 ? 1 : -1)); // alternate lean, seeded by position not rng
  ctx.scale(1, 1 - settle * 0.22);
  ctx.translate(-g.x, -y);
  if (alive) longShadow(ctx, g.x, y, g.kind === "flagship" ? g.w * 0.62 : g.kind === "base" ? g.w * 0.6 : g.w * 0.75, 1);
  if (g.hit > 0) {
    ctx.shadowColor = "#ffd98a";
    ctx.shadowBlur = 12;
  } else if (alive) {
    ctx.shadowColor = MAGENTA;
    ctx.shadowBlur = 8;
  }
  if (g.kind === "tank") {
    // the cutout is a plan view pointing UP; enemy armour faces the front, so
    // it is drawn pointing DOWN the screen (nose toward the incoming plane).
    // hw is g.w ITSELF (defect fix): the drawn silhouette's outer edge (track
    // runs) now sits EXACTLY at the radius the bomb hit-test reaches, so a
    // visually-centred hit can never miss a hit-test that reads smaller than
    // what the player sees.
    const hw = g.w;
    const hullHw = hw * 0.87;
    // same de-glow call as the bases: hostility reads from the red hull, the
    // standing magenta bloom is gone, the gold HIT flash stays
    if (!(g.hit > 0)) ctx.shadowBlur = 0;
    const tkPlate = ART["units/tank-theirs"];
    if (ready(tkPlate)) {
      ctx.save();
      ctx.fillStyle = "rgba(10,12,10,0.35)";
      ctx.beginPath();
      ctx.ellipse(g.x + hw * 0.1, y + hw * 0.34, hw * 1.05, hw * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (g.dead) ctx.filter = "brightness(0.4) saturate(0.5)";
      // enemy armour faces the incoming plane (down-screen); the idle sway
      // rides the whole hull now that the barrel is baked into the sprite
      const sway = alive ? Math.sin(s.t * 1.1 + g.wy * 0.017) * 0.05 : 0;
      sprRot(ctx, tkPlate, g.x, y, hw * 2.3, Math.PI / 2 + sway, () => {});
      ctx.restore();
    } else
    sprRot(ctx, ART["ground-tank"], g.x, y, hw * 2, Math.PI, () => {
      ctx.fillStyle = g.dead ? "#2a2320" : "#4a2d52";
      roundRect(ctx, g.x - hullHw, y - 17 * k, hullHw * 2, 34 * k, 3 * k);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1a1218"; // track runs, outer edge == the hit radius
      ctx.fillRect(g.x - hw, y - 16 * k, hw * 0.3, 32 * k);
      ctx.fillRect(g.x + hw * 0.7, y - 16 * k, hw * 0.3, 32 * k);
      ctx.fillStyle = g.dead ? "#2a2320" : "#3b2442";
      ctx.beginPath(); // turret
      ctx.arc(g.x, y - 1 * k, 7.5 * k, 0, Math.PI * 2);
      ctx.fill();
      // idle: a slow turret traverse, seeded by position so a field of tanks
      // does not sway in lockstep
      const sway = alive ? Math.sin(s.t * 1.1 + g.wy * 0.017) * 1.3 * k : 0;
      ctx.fillRect(g.x - 1.4 * k + sway, y + 4 * k, 2.8 * k, 15 * k); // barrel, aimed down
    });
  } else if (g.kind === "base") {
    const hw = g.w;
    // Mike 2026-08-02: "The glow around them sucks." The standing magenta
    // bloom is gone for structures: hostility reads from the dark silhouette
    // and the blinking beacon instead. The gold HIT flash stays.
    if (!(g.hit > 0)) ctx.shadowBlur = 0;
    const bPlate = ART[("units/base-" + (Math.abs(Math.floor(g.wy * 0.13)) % 4)) as keyof typeof ART];
    if (ready(bPlate)) {
      ctx.save();
      ctx.fillStyle = "rgba(10,12,10,0.38)";
      ctx.beginPath();
      ctx.ellipse(g.x + hw * 0.14, y + hw * 0.5, hw * 1.15, hw * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      if (g.dead) ctx.filter = "brightness(0.4) saturate(0.5)";
      // tilt bake: lifted a touch so the visible height sits over the hit
      // circle rather than hanging below it; bombs stay honest to g.x,y
      spr(ctx, bPlate, g.x, y - hw * 0.3, hw * 2.6, () => {});
      ctx.restore();
      if (alive && Math.sin(s.t * 2.1 + g.wy * 0.02) > 0.6) {
        ctx.fillStyle = MAGENTA;
        ctx.beginPath();
        ctx.arc(g.x + hw * 0.52, y - hw * 0.92, 2.0 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    } else
    spr(ctx, ART["ground-base"], g.x, y, hw * 2.18, () => {
      ctx.fillStyle = g.dead ? "#2a2320" : "#3d434b";
      roundRect(ctx, g.x - hw, y - 22 * k, hw * 2, 44 * k, 3 * k);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#262b31";
      ctx.fillRect(g.x - hw * 0.76, y - 14 * k, 20 * k, 12 * k);
      ctx.fillRect(g.x + hw * 0.18, y + 2 * k, 22 * k, 14 * k);
      ctx.strokeStyle = "#4a5058"; // mast
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.moveTo(g.x + hw * 0.59, y - 18 * k);
      ctx.lineTo(g.x + hw * 0.88, y - 26 * k);
      ctx.stroke();
      // idle: a slow blinking mast light
      if (alive && Math.sin(s.t * 2.1 + g.wy * 0.02) > 0.6) {
        ctx.fillStyle = GOLD;
        ctx.beginPath();
        ctx.arc(g.x + hw * 0.88, y - 27 * k, 1.8 * k, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  } else {
    // FLAGSHIP: the strip's climax, bigger and more ominous than a base.
    // Idle rate encodes the state machine (criterion 6): the mast light
    // blinks faster the more damaged it is, calm and steady when fresh,
    // frantic just before it goes down.
    const hw = g.w;
    const dmgFrac = 1 - Math.max(0, g.hp) / FLAGSHIP_HP;
    const blinkRate = 1.3 + dmgFrac * 5.2;
    const blinkOn = alive && Math.sin(s.t * blinkRate * Math.PI * 2) > 0.3 - dmgFrac * 0.5;
    // null, not a plate: see the manifest note above. spr's fallback IS the
    // flagship, and keeping the call shaped this way means re-adding a
    // top-down plate later is a one-word change.
    spr(ctx, null, g.x, y, hw * 2.1, () => {
      ctx.fillStyle = g.dead ? "#241a1a" : "#3d2230";
      roundRect(ctx, g.x - hw, y - 26 * k, hw * 2, 52 * k, 4 * k);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = g.dead ? "#20171b" : "#241a24";
      roundRect(ctx, g.x - hw * 0.68, y - 32 * k, hw * 1.36, 12 * k, 3 * k); // bow structure
      ctx.fill();
      for (const tx of [-0.5, 0, 0.5]) {
        ctx.fillStyle = g.dead ? "#241a1a" : "#4a2d3e";
        ctx.beginPath();
        ctx.arc(g.x + tx * hw * 0.88, y + 7 * k, 7 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#4a5058";
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.moveTo(g.x, y - 26 * k);
      ctx.lineTo(g.x, y - 41 * k);
      ctx.stroke();
      if (blinkOn) {
        ctx.fillStyle = dmgFrac > 0.5 ? "#ff8a8a" : GOLD;
        ctx.beginPath();
        ctx.arc(g.x, y - 42 * k, 2.6 * k, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.globalAlpha = 1;
  if (g.dead && g.burn > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.8, g.burn);
    const boomSize = g.kind === "flagship" ? 84 : g.kind === "base" ? 56 : 32;
    spr(ctx, ART["fx-boom"], g.x, y, boomSize * k, () => {
      ctx.fillStyle = "rgba(20,16,12,0.6)";
      ctx.beginPath();
      ctx.arc(g.x, y, 12 * k, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // bases and the flagship carry visible bomb pips + the RANGING mark
  if (!g.dead && (g.kind === "base" || g.kind === "flagship")) {
    const maxHp = g.kind === "flagship" ? FLAGSHIP_HP : BASE_HP;
    const pipW = g.kind === "flagship" ? 6.5 * k : 8 * k;
    const pipY = g.kind === "flagship" ? y - 46 * k : y - 30 * k;
    const total = Math.min(maxHp, Math.max(0, g.hp));
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = MAGENTA;
      ctx.fillRect(g.x - (maxHp * pipW) / 2 + i * pipW, pipY, pipW - 3 * k, 4 * k);
    }
  }
  if (!g.dead && g.marked) drawMark(ctx, g.x, y, g.w + 10 * k, k);
}

function drawAA(ctx: CanvasRenderingContext2D, s: WarState, a: AA) {
  const k = s.k;
  const y = sy(s, a.wy);
  if (y < -60 * k || y > s.H + 60 * k) return;
  const alive = !a.dead;
  // KO animation off the EXISTING a.ko timer (0.5 -> 0): a settle, not a flat
  // opacity snap, matching the ground-target treatment.
  const settle = a.dead ? 1 - Math.max(0, a.ko) / 0.5 : 0;
  ctx.save();
  ctx.globalAlpha = a.dead ? Math.max(0.4, 1 - settle * 0.6) : 1;
  ctx.translate(a.x, y);
  ctx.rotate(settle * 0.5 * (a.wy % 2 < 1 ? 1 : -1));
  ctx.scale(1, 1 - settle * 0.3);
  ctx.translate(-a.x, -y);
  if (alive) longShadow(ctx, a.x, y, 9 * k, 1);
  // No standing magenta bloom (Mike: "The glow around them sucks") — the
  // nest's hostility is its flak telegraphs, same de-glow as bases and tanks.
  spr(ctx, ART["aa-gun"], a.x, y, 27 * k, () => {
    // Sandbags, not violet. This was #3b2442 over #4a2d52 -- two purple discs
    // on a green field, the most prominent objects on screen and neither
    // reading as a gun.
    ctx.fillStyle = a.dead ? "#3a332a" : "#8a7a52";
    ctx.beginPath(); // the sandbag ring
    ctx.arc(a.x, y, 12 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = a.dead ? "#2b2520" : "#4d4636";
    ctx.beginPath();
    ctx.arc(a.x, y, 6 * k, 0, Math.PI * 2);
    ctx.fill();
    // idle: the barrels track a slow scan, seeded by position so a line of
    // nests does not sway in lockstep
    const sway = alive ? Math.sin(s.t * 0.9 + a.wy * 0.02) * 1.6 * k : 0;
    ctx.strokeStyle = a.dead ? "#2a2320" : "#1a1218";
    ctx.lineWidth = 2.2 * k;
    ctx.beginPath(); // barrels, foreshortened straight up at you
    ctx.moveTo(a.x - 2.5 * k + sway, y);
    ctx.lineTo(a.x - 2.5 * k + sway, y + 9 * k);
    ctx.moveTo(a.x + 2.5 * k + sway, y);
    ctx.lineTo(a.x + 2.5 * k + sway, y + 9 * k);
    ctx.stroke();
  });
  ctx.shadowBlur = 0;
  if (a.dead && a.ko > 0) spr(ctx, ART["fx-boom"], a.x, y, 28 * k, () => {});
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ── the frame ───────────────────────────────────────────────────────────────

/** Tile a full-width plate DOWN the world so it scrolls with the terrain. Pure
 * function of camY(s): no page state, so it can never desync.
 *
 * MIRROR-TILED (the tankbuster fix, ported from the horizontal skyline band
 * to this game's vertical axis): the source plate is a scene painting, not a
 * seamless-loop texture, so drawing it straight every copy opened a visible
 * content seam every tileH of scroll (~4.7s at SCROLL). Every ODD tile index
 * is flipped vertically in place, so every boundary between two tiles is a
 * reflection of itself — always seamless, on any non-repeating painting,
 * with zero art-side work. */
function tilePlate(ctx: CanvasRenderingContext2D, im: HTMLImageElement, vw: number, vh: number, cy: number) {
  const tileH = vw * (im.naturalHeight / im.naturalWidth);
  const drawH = tileH + 1; // 1px overlap so a subpixel gap never opens
  const iMax = Math.floor(cy / tileH);
  const iMin = Math.floor((cy - vh) / tileH) - 1;
  for (let i = iMin; i <= iMax; i++) {
    const y = cy - (i + 1) * tileH;
    if (((i % 2) + 2) % 2 === 1) {
      ctx.save();
      ctx.translate(0, y + drawH);
      ctx.scale(1, -1);
      ctx.drawImage(im, 0, 0, vw, drawH);
      ctx.restore();
    } else {
      ctx.drawImage(im, 0, y, vw, drawH);
    }
  }
}

function drawScene(ctx: CanvasRenderingContext2D, s: WarState, view: ShellView, fx: PageFx): number {
  const k = s.k;
  const vw = view.w;
  const vh = view.h;
  const cy = camY(s);
  // THE PLANE MOVES NOW. `s.planeSy` is the centre of its vertical band, not
  // its position; drawing at it would put the airframe, its shadow, the prop,
  // the muzzle flash and the bombsight somewhere the plane is not.
  // planeScreenY is the sim's own projection of the plane's world y, so the
  // picture and the collisions agree by construction.
  const planeY = planeScreenY(s);
  const flagship = flagshipOf(s);

  // ── PARALLAX PLANE 1 (farthest): faint high-altitude wisps at a THIRD,
  // slower rate (0.55x) than the ground (1x) and the mid-cloud layer below
  // (1.55x) — three distinct planes, criterion 9 ──
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "rgba(200,214,230,0.5)";
  const farStep = 220 * k;
  const farDrift = cy * 0.55;
  const fi0 = Math.floor((farDrift - vh) / farStep);
  for (let i = fi0; i <= Math.floor(farDrift / farStep); i++) {
    const hsh = ((i * 401 + 71) % 907) / 907;
    ctx.beginPath();
    ctx.ellipse(hsh * vw, farDrift - i * farStep, (60 + hsh * 50) * k, 10 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /** GRASS, BAKED ONCE. The ground was three flat greens in 96px bands, drawn
 * unconditionally OVER the painted plate -- so the plate was dead work and the
 * field read as coloured paper (Mike 2026-08-01: "the background is still not
 * built. Needs to mostly grass with sparse trees"). This is the same trick
 * Warpath and Armor Clash already use: bake a speckle once at setup and blit
 * it, which costs nothing per frame and gives the eye something to judge
 * movement against. */
let GRASS: CanvasImageSource | null = null;
function bakeGrass() {
  if (GRASS) return;
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  GRASS = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const a = 0.04 + rnd() * 0.07;
      g.fillStyle = rnd() < 0.5 ? `rgba(38,60,28,${a})` : `rgba(150,176,104,${a})`;
      g.fillRect(rnd() * w, rnd() * h, 0.9 + rnd() * 1.7, 0.9 + rnd() * 1.7);
    }
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(44,68,30,${0.05 + rnd() * 0.06})`;
      g.lineWidth = 0.7 + rnd() * 1.0;
      const x = rnd() * w;
      const y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 1.5 + rnd() * 4, y - 2.5 - rnd() * 5);
      g.stroke();
    }
  });
}

/** A tree from above: two canopy lobes and a lighter crown dab. Plan view, no
 * trunk and no cast shadow -- this camera looks straight down, and a shadow
 * would point at a different sun every time the plate mirrors. */
function drawTreeTop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "rgba(30,52,26,0.92)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(38,64,30,0.92)";
  ctx.beginPath();
  ctx.arc(x + r * 0.34, y - r * 0.26, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(96,132,62,0.55)";
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.3, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
}

// ── THE GROUND, straight down, scrolling toward you (parallax plane 2) ──
  // Drawn, not plated, and drawn as a PLAN view: fields have no up, so the
  // mirrored tiling this camera relies on cannot turn anything upside down.
  // Everything here is a muted mid-green: the ground's whole job in a shooter
  // is to lose to the aircraft, and a bright background is how a player ends
  // up unable to find their own plane.
  ctx.fillStyle = FIELD_A;
  ctx.fillRect(0, 0, vw, vh);
  bakeGrass();
  if (GRASS) {
    const gt = 128;
    const off = ((cy % gt) + gt) % gt;
    for (let ty = -gt + off; ty < vh + gt; ty += gt) {
      for (let tx = 0; tx < vw + gt; tx += gt) ctx.drawImage(GRASS, tx, ty);
    }
  }
  // THE PAINTED FRONT, under everything drawn. The plate supplies the material
  // -- cratered earth, hedgerows, tracks -- and the drawn crater/trench pass
  // further down still supplies the war, so the two layer rather than compete.
  // Tiled off cy like every other scrolling layer here.
  if (ready(ART["bg-front"])) {
    tilePlate(ctx, ART["bg-front"], vw, vh, cy);
  }
  {
    // Patchwork strips, keyed off the world row so drawing stays pure and the
    // fields scroll with the world rather than with wall-clock time.
    const bandH = 96 * k;
    const b0 = Math.floor((cy - vh) / bandH) - 1;
    const b1 = Math.floor(cy / bandH) + 1;
    for (let i = b0; i <= b1; i++) {
      const y = cy - (i + 1) * bandH;
      // three deterministic hashes per band: tint, split, hedge offset
      const h1 = ((i * 131 + 89) % 1013) / 1013;
      const h2 = ((i * 977 + 311) % 1013) / 1013;
      // TINTS, not fills: the patchwork still reads as different fields, but
      // the grain and the painted plate show through instead of being buried.
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = h1 < 0.34 ? FIELD_B : h1 < 0.67 ? FIELD_C : FIELD_A;
      ctx.fillRect(0, y, vw, bandH);
      // THE FIELD BOUNDARY IS A HEDGE, NOT A GUILLOTINE. A hard-edged rect
      // starting at `split` drew a dead-straight vertical seam from the top of
      // the screen to the bottom, band after band, because every band split at
      // a similar place: the arena looked like it had a crack down it. A soft
      // ramp over 26px reads as one field giving way to the next.
      const split = vw * (0.28 + h2 * 0.44);
      const edge = ctx.createLinearGradient(split - 13, 0, split + 13, 0);
      const tone = h2 < 0.5 ? FIELD_C : FIELD_B;
      edge.addColorStop(0, "rgba(0,0,0,0)");
      edge.addColorStop(1, tone);
      ctx.fillStyle = edge;
      ctx.fillRect(split - 13, y, 26, bandH);
      ctx.fillStyle = tone;
      ctx.fillRect(split + 13, y, vw - split - 13, bandH);
      ctx.globalAlpha = 1;
      // SPARSE TREES, hashed off the band index like everything else here, so
      // they scroll with the world and replay identically. Two per band at
      // most: hedgerow punctuation, never a forest to hide targets in.
      const h5 = ((i * 547 + 193) % 1013) / 1013;
      const h6 = ((i * 823 + 401) % 1013) / 1013;
      if (h5 > 0.34) {
        drawTreeTop(ctx, vw * (0.06 + h5 * 0.86), y + bandH * (0.22 + h6 * 0.5), 7.5 * k);
      }
      if (h6 > 0.66) {
        drawTreeTop(ctx, vw * (0.1 + h6 * 0.8), y + bandH * (0.55 + h5 * 0.35), 6 * k);
      }
      ctx.strokeStyle = "rgba(28,44,24,0.30)";
      ctx.lineWidth = 1.6 * k;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(vw, y);
      ctx.moveTo(split, y);
      ctx.lineTo(split, y + bandH);
      ctx.stroke();
      // ── THE WAR, written on top of the farm. Mike asked for a battlefield
      // and what was here was hedgerows and plough lines: pretty, and entirely
      // peaceful. Craters and trenches, keyed off the same band index as
      // everything else, so this stays a pure function of world position.
      {
        const h3 = ((i * 613 + 47) % 1013) / 1013;
        const h4 = ((i * 271 + 733) % 1013) / 1013;
        // burnt ground: one scorched patch on about half the bands
        if (h3 < 0.5) {
          ctx.fillStyle = "rgba(38,32,22,0.30)";
          ctx.beginPath();
          ctx.ellipse(vw * h4, y + bandH * 0.5, vw * 0.22, bandH * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // a trench line cutting across, on about a third
        if (h4 < 0.34) {
          const ty = y + bandH * (0.2 + h3 * 0.6);
          ctx.strokeStyle = "rgba(30,24,16,0.5)";
          ctx.lineWidth = 3.4 * k;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(0, ty);
          for (let seg = 1; seg <= 6; seg++) {
            const sx = (vw * seg) / 6;
            ctx.lineTo(sx, ty + (seg % 2 === 0 ? -1 : 1) * 5 * k);
          }
          ctx.stroke();
          ctx.strokeStyle = "rgba(150,138,104,0.28)";
          ctx.lineWidth = 1.6 * k;
          ctx.stroke();
        }
        // shell craters: five per band, at fixed offsets from the band hash
        for (let c = 0; c < 5; c++) {
          const cxh = ((i * 313 + c * 197 + 61) % 1013) / 1013;
          const cyh = ((i * 419 + c * 137 + 17) % 1013) / 1013;
          const cr = (3 + ((i + c * 7) % 5)) * k;
          const px = vw * cxh;
          const py = y + bandH * cyh;
          ctx.fillStyle = "rgba(26,22,15,0.42)";
          ctx.beginPath();
          ctx.arc(px, py, cr, 0, Math.PI * 2);
          ctx.fill();
          // a lip on the sunward side so a crater reads as a hole, not a dot
          ctx.fillStyle = "rgba(168,158,124,0.22)";
          ctx.beginPath();
          ctx.arc(px - cr * 0.22, py - cr * 0.28, cr * 0.72, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // plough lines: the only texture, and faint on purpose
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1 * k;
      for (let f = 1; f < 5; f++) {
        const fy = y + (bandH * f) / 5;
        ctx.beginPath();
        ctx.moveTo(0, fy);
        ctx.lineTo(vw, fy);
        ctx.stroke();
      }
    }
    // ONE road down the middle of the front, wandering with the world row.
    // It gives the eye something to judge scroll speed against without adding
    // a second thing to look at.
    ctx.strokeStyle = "rgba(196,186,158,0.5)";
    ctx.lineWidth = 7 * k;
    ctx.beginPath();
    for (let yy = -20; yy <= vh + 20; yy += 20) {
      const row = cy - yy;
      const rx = vw * (0.5 + 0.19 * Math.sin(row / 260) + 0.07 * Math.sin(row / 91));
      if (yy < 0) ctx.moveTo(rx, yy);
      else ctx.lineTo(rx, yy);
    }
    ctx.stroke();
  }

  // thin cloud passing UNDER you — DRAWN wisps, not the sky plate. Screening
  // the blue bg-sky over the whole deck at 1.55x laid a cyan film across the
  // front and made warm cratered earth read as teal swamp (found 2026-08-02,
  // the warpath-pass sweep). White wisps brighten without recolouring.
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.globalCompositeOperation = "screen";
  {
    ctx.fillStyle = "rgba(238,242,248,0.4)";
    for (let i = 0; i < 5; i++) {
      const w = (90 + ((i * 47) % 70)) * k;
      const span = vh + w * 2;
      const drift = i * 300 * k + cy * (1.35 + i * 0.08);
      const y = ((drift % span) + span) % span - w;
      ctx.beginPath();
      ctx.ellipse(vw * (0.14 + i * 0.19), y, (14 + i * 3) * k, w * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // ── CAMERA: shake + the flagship reveal's punch-in. The reveal reuses the
  // shared recoil-punch primitive rather than a parallel zoom system — an
  // event-triggered camera behaviour (criterion 8's 4th, alongside shake,
  // lean and the recoil shove) punched toward the flagship the instant it is
  // seen. beginCameraFx wraps the WORLD draw only; the pipper (and the rest
  // of the HUD) is drawn after endCameraFx below, so it stays honest through
  // every shake (defect 2b).
  const revealFrac = Math.min(1, s.flagshipRevealT / 1.1); // 1.1 = sim.ts's flagshipRevealT seed
  const recoilTo = flagship && revealFrac > 0 ? { x: flagship.x, y: sy(s, flagship.wy) } : { x: vw / 2, y: planeY };
  beginCameraFx(
    ctx,
    fx,
    { w: vw, h: vh, k },
    { shake: s.shake, recoil: revealFrac, recoilFrom: { x: vw / 2, y: planeY }, recoilTo },
  );
  drawMotes(ctx, fx, { w: vw, h: vh, k });

  // ── the corridor: lethal ridge lines down both edges ──
  const pad = LANE_PAD * k;
  const nearL = s.x - s.laneMin < 58 * k;
  const nearR = s.laneMax - s.x < 58 * k;
  for (const side of [0, 1]) {
    const inner = side === 0 ? pad : vw - pad;
    const outer = side === 0 ? 0 : vw;
    ctx.save();
    // DARK ROCK, not void: the old #0b0e12 gradient rendered two pure-black
    // gutters that read as unrendered canvas. Same silhouette, but a warm
    // basalt family with faceted highlights along the lip, so the corridor
    // walls read as the ridges the sim says they are.
    const grd = ctx.createLinearGradient(outer, 0, inner, 0);
    grd.addColorStop(0, "#161812");
    grd.addColorStop(0.7, "#22251b");
    grd.addColorStop(1, "rgba(42,46,32,0.9)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(outer, -2);
    const step = 22 * k;
    const i0 = Math.floor((cy - vh) / step) - 1;
    for (let i = i0; i <= Math.floor(cy / step) + 1; i++) {
      const hsh = ((i * (side === 0 ? 271 : 397) + 61) % 811) / 811;
      ctx.lineTo(inner + (side === 0 ? -1 : 1) * hsh * 9 * k, cy - i * step);
    }
    ctx.lineTo(outer, vh + 2);
    ctx.closePath();
    ctx.fill();
    // faceted lip: short lit slivers under the jag points, keyed off the same
    // hash so they scroll with the rock they belong to
    ctx.strokeStyle = "rgba(126,130,96,0.5)";
    ctx.lineWidth = 1.6 * k;
    for (let i = i0; i <= Math.floor(cy / step) + 1; i++) {
      const hsh = ((i * (side === 0 ? 271 : 397) + 61) % 811) / 811;
      if (hsh < 0.3) continue;
      const jx = inner + (side === 0 ? -1 : 1) * hsh * 9 * k;
      const jy = cy - i * step;
      ctx.beginPath();
      ctx.moveTo(jx, jy);
      ctx.lineTo(jx + (side === 0 ? -6 : 6) * k * hsh, jy + 8 * k);
      ctx.stroke();
    }
    // scree at the foot of the wall: dark dots fading into the field
    ctx.fillStyle = "rgba(30,34,22,0.5)";
    for (let i = i0; i <= Math.floor(cy / step) + 1; i++) {
      const h2 = ((i * (side === 0 ? 613 : 149) + 97) % 641) / 641;
      if (h2 < 0.55) continue;
      const sx2 = inner + (side === 0 ? 1 : -1) * (3 + h2 * 10) * k;
      ctx.beginPath();
      ctx.arc(sx2, cy - i * step + 11 * k * h2, (1.3 + h2 * 1.6) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // the warning hatch, only while you are drifting into it
    const near = side === 0 ? nearL : nearR;
    if (near) {
      ctx.globalAlpha = 0.5 + 0.35 * Math.sin(s.t * 9);
      ctx.strokeStyle = "#ff8a8a";
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.moveTo(inner, 0);
      ctx.lineTo(inner, vh);
      ctx.stroke();
    }
    ctx.restore();
  }

  // the landing strip across the corridor at the TRUE far end of the world
  // (past leg 3 AND the strip stretch — leg 3 no longer auto-wins)
  const stripY = sy(s, s.W);
  if (stripY > -40 && stripY < vh + 40) {
    ctx.save();
    ctx.fillStyle = "rgba(125,211,252,0.16)";
    ctx.fillRect(pad, stripY - 5 * k, vw - pad * 2, 10 * k);
    ctx.fillStyle = ACCENT;
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(pad + 10 * k + (i * (vw - pad * 2 - 20 * k)) / 7, stripY - 1.5 * k, 14 * k, 3 * k);
    }
    ctx.restore();
  }

  // ground targets + AA nests (on the deck, under everything airborne)
  for (const g of s.grounds) drawGround(ctx, s, g);
  for (const a of s.aas) drawAA(ctx, s, a);

  // flak telegraphs: the ring locks, the shell rises from the nest, the burst
  // blooms exactly where flying straight would have put you
  for (const tl of s.teles) {
    const p = 1 - tl.t / tl.total;
    const tx = tl.x;
    const ty = sy(s, tl.wy);
    ctx.save();
    ctx.globalAlpha = 0.35 + p * 0.55;
    // the rising shell: nest -> lock point
    ctx.strokeStyle = "rgba(232,121,249,0.5)";
    ctx.lineWidth = 1.2 * k;
    const sx0 = tl.srcX;
    const sy0 = sy(s, tl.srcWy);
    ctx.beginPath();
    ctx.moveTo(sx0 + (tx - sx0) * Math.max(0, p - 0.14), sy0 + (ty - sy0) * Math.max(0, p - 0.14));
    ctx.lineTo(sx0 + (tx - sx0) * p, sy0 + (ty - sy0) * p);
    ctx.stroke();
    ctx.strokeStyle = p > 0.62 ? "#ff8a8a" : MAGENTA;
    ctx.lineWidth = 1.6 * k;
    ctx.setLineDash([4 * k, 4 * k]);
    ctx.beginPath();
    ctx.arc(tx, ty, (34 - 12 * p) * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  for (const fb of s.bursts) {
    const a = Math.max(0, fb.life / 0.55);
    const by = sy(s, fb.wy);
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * 1.6);
    spr(ctx, ART["fx-flak"], fb.x, by, fb.r * 2.6, () => {
      ctx.fillStyle = "#20242b";
      ctx.beginPath();
      ctx.arc(fb.x, by, fb.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffb066";
      ctx.beginPath();
      ctx.arc(fb.x, by, fb.r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = `rgba(232,121,249,${a * 0.7})`;
    ctx.lineWidth = 1.6 * k;
    ctx.beginPath();
    ctx.arc(fb.x, by, fb.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── bombs in the air: the sprite hangs at the plane's row (it keeps the
  // plane's forward speed) while the RETICLE slides down into it ──
  for (const b of s.bombs) {
    const p = 1 - b.t / BOMB_FALL; // 0 released .. 1 impact
    const by = sy(s, b.wy);
    const iy = sy(s, b.wy + SCROLL * k * b.t); // where it will land
    drawCross(ctx, b.x, iy, (7 + 6 * (1 - p)) * k, k, `rgba(240,179,64,${0.45 + 0.5 * p})`, false);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(b.x, iy, (2 + 5 * p) * k, (1.4 + 3.4 * p) * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const size = (15 - 8 * p) * k; // it shrinks away beneath you
    sprRot(ctx, ART.bomb, b.x, by, size, Math.PI / 2, () => {
      ctx.save();
      ctx.fillStyle = "#39412c";
      ctx.beginPath();
      ctx.ellipse(b.x, by, size * 0.2, size * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#262b1d";
      ctx.fillRect(b.x - size * 0.13, by + size * 0.32, size * 0.26, size * 0.2);
      ctx.restore();
    });
  }



  // contrail (world-fixed: it slides down the screen like real hanging smoke)
  for (const tr of s.trail) {
    ctx.globalAlpha = tr.life * 0.2;
    ctx.fillStyle = "#c9d4dc";
    ctx.beginPath();
    ctx.arc(tr.x, sy(s, tr.wy), (1 + (1 - tr.life) * 3) * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // fighters
  for (const f of s.fighters) drawFighter(ctx, s, f);

  // tracers (streaks along velocity, up the screen)
  for (const tr of s.tracers) {
    const ty = sy(s, tr.wy);
    ctx.save();
    ctx.strokeStyle = "#ffe9a8";
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.8 * k;
    ctx.beginPath();
    ctx.moveTo(tr.x - tr.vx * 0.018, ty + tr.vwy * 0.018);
    ctx.lineTo(tr.x, ty);
    ctx.stroke();
    ctx.restore();
  }
  // enemy bullets
  for (const eb of s.ebullets) {
    ctx.save();
    ctx.fillStyle = MAGENTA;
    ctx.shadowColor = MAGENTA;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(eb.x, sy(s, eb.wy), 3.2 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── the player plane (banks into the turn; the cutout is nose-up) ──
  const bank = Math.max(-0.42, Math.min(0.42, s.vx / (300 * k)));
  const blink = s.iframes > 0 && Math.floor(s.t * 12) % 2 === 0;
  // ── PICKUPS. Drawn before the plane so flying over one reads as sweeping
  // it up rather than as passing behind it. Fuel is a green can, a gun level
  // is an amber chevron: two shapes, two colours, no reading required.
  for (const d of s.drops) {
    if (d.life <= 0) continue;
    const dy = sy(s, d.wy);
    if (dy < -20 || dy > s.H + 20) continue;
    // the last second blinks, so a drop about to expire says so
    if (d.life < 1 && Math.floor(d.life * 8) % 2 === 0) continue;
    ctx.save();
    ctx.translate(d.x, dy);
    // The painted chute goes down first; the coloured badge still gets drawn on
    // top of it below. KIND has to read instantly -- fuel and a gun level are
    // different decisions at speed -- and one canvas of chute art cannot say
    // which this is.
    if (ready(ART.pickup)) spr(ctx, ART.pickup, 0, 0, 26, () => {});
    if (d.kind === "fuel") {
      ctx.fillStyle = "#3fd07a";
      ctx.beginPath();
      ctx.roundRect(-7, -9, 14, 18, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(12,30,18,0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#0e1a12";
      ctx.font = "800 10px ui-monospace,Menlo,monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("F", 0, 0);
    } else {
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(9, 4);
      ctx.lineTo(0, 0);
      ctx.lineTo(-9, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(40,26,6,0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.textBaseline = "alphabetic";

  if (s.phase !== "ko" || !s.died) longShadow(ctx, s.x, planeY, PLANE_R * k, 1);
  ctx.save();
  if (blink) ctx.globalAlpha = 0.5;
  if (s.veilT > 0) {
    // CONTRAIL VEIL: the combo you can see
    ctx.save();
    ctx.globalAlpha = Math.min(0.4, s.veilT * 0.4);
    ctx.fillStyle = "#c9d4dc";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + s.t * 1.9;
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(a) * 14 * k, planeY + Math.sin(a) * 17 * k, 9 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  const koRoll = s.phase === "ko" && s.died ? Math.min(KO_SPIN, (KO_SPIN * (KO_SPIN + 0.4 - s.phaseT)) / 1.8) : 0;
  // A shadow cast on the deck below, offset down-right. It reads as altitude
  // and, more usefully, it guarantees the airframe never merges into a field
  // of the same value.
  if (s.phase !== "ko") longShadow(ctx, s.x, planeY, PLANE_R * k, 1);
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 10;
  // YOUR AIRCRAFT. It was olive green over farmland, which is the one colour
  // scheme guaranteed to lose. Sky blue with a white rim and a hard ground
  // shadow: the single most important object on the screen now looks like it.
  {
    ctx.save();
    ctx.translate(s.x, planeY);
    ctx.rotate(bank + koRoll);
    const r = PLANE_R * k;
    // PAINTED AIRFRAME. Deliberately re-shot in bare aluminium with blue wing
    // bands rather than the period-correct olive: the vector plane below is
    // sky blue for a reason (see the comment above) and an olive hero over an
    // olive battlefield is the one scheme guaranteed to lose. The ACCENT
    // shadow glow set before this block stays either way.
    if (ready(ART["plane-player"])) {
      spr(ctx, ART["plane-player"], 0, 0, r * 4.1, () => {});
      ctx.restore();
    } else {
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#f2f8ff";
    ctx.lineWidth = 2.4;
    ctx.fillStyle = "#3f9ad8";
    ctx.beginPath(); // wing
    ctx.ellipse(0, -r * 0.15, r * 1.9, r * 0.54, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#2f7fb8";
    ctx.beginPath(); // fuselage
    ctx.ellipse(0, 0, r * 0.46, r * 1.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // tailplane
    ctx.roundRect(-r * 0.88, r * 1.12, r * 1.76, r * 0.38, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d9f0ff";
    ctx.beginPath(); // canopy
    ctx.ellipse(0, -r * 0.15, r * 0.27, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    }
  }
  ctx.shadowBlur = 0;
  // the propeller: a SEPARATE rotating layer at the nose, over the painted
  // sprite or the vector fallback's static disc alike (defect 4) — spins
  // through the death roll too, a dead engine windmills rather than stopping
  // dead
  ctx.save();
  ctx.translate(s.x, planeY);
  ctx.rotate(bank + koRoll);
  ctx.translate(0, -PLANE_R * k * 1.85);
  drawProp(ctx, PLANE_R * k * 0.62, s.t * PROP_RATE * 1.15, ACCENT);
  ctx.restore();
  if (s.muzzle > 0) {
    ctx.fillStyle = "#ffd98a";
    ctx.beginPath();
    ctx.moveTo(s.x, planeY - PLANE_R * 2.6 * k);
    ctx.lineTo(s.x - 4 * k, planeY - PLANE_R * 1.6 * k);
    ctx.lineTo(s.x + 4 * k, planeY - PLANE_R * 1.6 * k);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // particles
  for (const p of s.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.8));
    ctx.fillStyle = p.kind === "smoke" ? "#565e6e" : "#ffd98a";
    ctx.beginPath();
    ctx.arc(p.x, sy(s, p.wy), p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // floaters (world-anchored)
  ctx.textAlign = "center";
  for (const f of s.floats) {
    ctx.globalAlpha = Math.min(1, f.life * 1.6);
    ctx.fillStyle = f.big ? "#ffd98a" : WHITE;
    ctx.font = `${f.big ? 800 : 700} ${f.big ? 14 : 12}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(T(f.txt), f.x, sy(s, f.wy));
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  endCameraFx(ctx);

  // ── screen space from here: the pipper and every HUD element stay honest
  // through a shake because nothing below this line sits inside the camera
  // transform (defect 2b) ──

  // ── the BOMBSIGHT PIPPER: PIPPER_LEAD px up-screen, NOT the true ballistic
  // BOMB_LEAD (defect 2a) — PIPPER_LEAD already bakes in the double-tap's own
  // ~0.56s commit latency, so committing the instant a target crosses this
  // mark still lands centre-sprite once the gesture actually completes ──
  if (s.phase === "play") {
    const readyBomb = s.bombCd <= 0;
    drawCross(
      ctx,
      s.x,
      planeY - PIPPER_LEAD * k,
      8 * k,
      k,
      readyBomb ? "rgba(240,179,64,0.9)" : "rgba(240,179,64,0.26)",
      true,
    );
    if (readyBomb) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1 * k;
      ctx.setLineDash([3 * k, 5 * k]);
      ctx.beginPath();
      ctx.moveTo(s.x, planeY - PLANE_R * k);
      ctx.lineTo(s.x, planeY - PIPPER_LEAD * k + 12 * k);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawStreaks(ctx, fx, { w: vw, h: vh, k });

  // OPTICS: the next formation, flagged at the edge it will come from —
  // top for a DIVE, bottom for a CLIMB (unchanged), and now a THIRD edge for
  // FLANK: it enters from a ridge, not the top/bottom, so its own warning
  // sits on whichever side edge it is inbound from instead.
  const warn = nextFighterWarning(s);
  if (warn && warn.kind === "flank") {
    const fromLeft = warn.x < vw / 2;
    const wx = fromLeft ? 14 : vw - 14;
    const wy = Math.max(28, Math.min(vh - 28, planeY - 46));
    ctx.save();
    ctx.globalAlpha = 0.35 + warn.heat * 0.6;
    ctx.fillStyle = MAGENTA;
    ctx.beginPath();
    ctx.moveTo(wx + (fromLeft ? 7 : -7), wy);
    ctx.lineTo(wx - (fromLeft ? 5 : -5), wy - 7);
    ctx.lineTo(wx - (fromLeft ? 5 : -5), wy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.font = `800 ${Math.max(8, 8.5 * k)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = fromLeft ? "left" : "right";
    ctx.fillText(T("FLANKER"), fromLeft ? wx + 11 : wx - 11, wy + 3);
    ctx.textAlign = "left";
    ctx.restore();
  } else if (warn) {
    const fromTop = warn.kind === "dive";
    const wx = Math.max(24, Math.min(vw - 24, warn.x));
    const wy = fromTop ? 16 : vh - 16;
    ctx.save();
    ctx.globalAlpha = 0.35 + warn.heat * 0.6;
    ctx.fillStyle = MAGENTA;
    ctx.beginPath();
    ctx.moveTo(wx, wy + (fromTop ? 7 : -7));
    ctx.lineTo(wx - 7, wy - (fromTop ? 5 : -5));
    ctx.lineTo(wx + 7, wy - (fromTop ? 5 : -5));
    ctx.closePath();
    ctx.fill();
    ctx.font = `800 ${Math.max(8, 8.5 * k)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(T(fromTop ? "DIVERS" : "ON YOUR TAIL"), wx, fromTop ? wy + 20 : wy - 14);
    ctx.textAlign = "left";
    ctx.restore();
  }

  // VIGNETTE, lightened. At 0.44 it was heavy enough to pull the whole front
  // into dusk, which was fine over a dark painted plate and is not fine over
  // a daylit field: a shooter where the corners go black is a shooter where
  // fighters arrive out of nowhere.
  const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.52, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, vw, vh);

  // ── HUD ──
  ctx.fillStyle = WHITE;
  ctx.font = "800 18px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`${Math.round(s.score)}`, 14, 28);
  ctx.fillStyle = MUTED;
  ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`${legFmt(Math.min(3, s.leg + 1))} / 3`, 14, 44);
  // the score split, so the economy teaches itself: bombs are the game
  ctx.fillStyle = AMBER;
  ctx.font = "800 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`${T("BOMBS")} ${Math.round(s.bombScore)}`, 14, 59);

  // ── FUEL. The clock that replaced the lethal corridor edge, so it has to
  // be readable from peripheral vision while you are dodging: a bar that goes
  // amber then red, with no number to parse.
  {
    const frac = Math.max(0, Math.min(1, s.fuel / FUEL_MAX));
    const bw = 74;
    const bx = 14;
    const by = 68;
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(bx, by, bw, 6);
    ctx.fillStyle = frac > 0.5 ? "#3fd07a" : frac > 0.24 ? AMBER : "#ff6b6b";
    ctx.fillRect(bx, by, bw * frac, 6);
    ctx.fillStyle = frac > 0.24 ? MUTED : "#ff6b6b";
    ctx.font = "800 9px ui-monospace,Menlo,monospace";
    ctx.fillText(T("FUEL"), bx + bw + 6, by + 6);
  }

  // GUN LEVEL, as pips. Silent until you have earned one, so a stock plane is
  // not nagged about an upgrade it does not have yet.
  if (s.gunLvl > 0) {
    for (let i = 0; i < GUN_LVL_MAX; i++) {
      ctx.fillStyle = i < s.gunLvl ? AMBER : "rgba(255,255,255,0.18)";
      ctx.fillRect(14 + i * 9, 80, 6, 5);
    }
  }
  // AIRFRAME pips (hits left), BOTTOM-right. They were top-right, which is
  // where RunShell puts its SFX button for every game, so the last two pips
  // were permanently behind it. Moving them down a bit only half-worked; the
  // bottom-right corner is the one piece of this HUD nothing else claims
  // (bomb readiness owns bottom-left).
  const left = Math.max(0, s.maxHits - s.hits);
  for (let i = 0; i < s.maxHits; i++) {
    const x = vw - 16 - (s.maxHits - 1 - i) * 15;
    const py = vh - 26;
    ctx.fillStyle = i < left ? ACCENT : "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(x - 5, py);
    ctx.lineTo(x - 5, py - 8);
    ctx.lineTo(x - 1, py - 12);
    ctx.lineTo(x + 3, py - 8);
    ctx.lineTo(x + 3, py);
    ctx.lineTo(x - 1, py - 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = MUTED;
  ctx.font = "700 9.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(T("AIRFRAME"), vw - 14, vh - 32);
  ctx.textAlign = "left";
  // bomb readiness, bottom-left — OR the GEAR DOWN lockout note once the
  // final approach starts (the run's second announced verb change)
  const locked = gearDown(s);
  const bombFrac = 1 - s.bombCd / BOMB_CD;
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.fillRect(14, vh - 24, 92, 6);
  if (locked) {
    ctx.fillStyle = "rgba(255,138,138,0.55)";
    ctx.fillRect(14, vh - 24, 92, 6);
  } else {
    // an animation RATE encoding a state (criterion 6): the ready bar
    // shimmers once it is full, static while still loading
    const pulse = bombFrac >= 1 ? 0.82 + 0.18 * Math.sin(s.t * 7) : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = bombFrac >= 1 ? AMBER : "rgba(240,179,64,0.45)";
    ctx.fillRect(14, vh - 24, 92 * Math.max(0, Math.min(1, bombFrac)), 6);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = locked ? "#ff8a8a" : MUTED;
  ctx.font = "700 9.5px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(
    T(locked ? "GEAR DOWN · bombing locked, ride it out" : bombFrac >= 1 ? "BOMB READY · tap to drop" : "BOMB LOADING"),
    14,
    vh - 30,
  );

  drawCheer(ctx, fx, { w: vw, h: vh, k });

  // banner (kept LOCAL rather than routed through pagefx's shared drawBanner:
  // this is where the stencil/era face lives — criterion 15)
  if (s.banner) {
    ctx.globalAlpha = Math.min(1, s.banner.t * 2);
    ctx.textAlign = "center";
    ctx.fillStyle =
      s.banner.txt === "SHOT DOWN" ||
      s.banner.txt === "INTO THE CABLE" ||
      s.banner.txt === "INTO THE RIDGE" ||
      s.banner.txt === "HIT" ||
      s.banner.txt === "ONE HIT LEFT" ||
      // the three named-beat DANGER callouts (see sim.ts): a threat entering
      // the field, not a reward, so they read red like the rest of this list
      // rather than the default gold every LEG/GUNS HOT/TWIN RACK banner uses
      s.banner.txt === "FLAK ALLEY" ||
      s.banner.txt === "STRONGPOINT AHEAD" ||
      s.banner.txt === "ACE ON YOUR SIX"
        ? "#ff8a8a"
        : s.banner.txt.startsWith("WHEELS DOWN")
          ? ACCENT
          : "#ffd98a";
    ctx.font = `800 22px ${ERA_FONT}`;
    ctx.fillText(T(s.banner.txt), vw / 2, vh * 0.3);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  // the flagship's entrance PLATE: the franchise's full boss treatment
  // (criterion 11) — freeze + camera punch (above) + shake (sim) + this named
  // plate with an instruction subtitle. A bespoke two-line card, not routed
  // through the generic single-line banner.
  if (s.flagshipRevealT > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, s.flagshipRevealT * 2.4);
    const by = vh * 0.36;
    ctx.fillStyle = "rgba(8,10,13,0.7)";
    ctx.fillRect(0, by - 34 * k, vw, 62 * k);
    ctx.fillStyle = "rgba(255,138,138,0.65)";
    ctx.fillRect(0, by - 34 * k, vw, 1.4 * k);
    ctx.fillRect(0, by + 28 * k - 1.4 * k, vw, 1.4 * k);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff8a8a";
    ctx.font = `800 25px ${ERA_FONT}`;
    ctx.fillText(T("FLAGSHIP BASE"), vw / 2, by - 3 * k);
    ctx.fillStyle = "rgba(238,242,248,0.92)";
    ctx.font = "700 11.5px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(T("LAST TARGET BEFORE THE STRIP. BOMB IT DOWN."), vw / 2, by + 19 * k);
    ctx.textAlign = "left";
    ctx.restore();
  }

  if (s.phase === "intro") {
    ctx.textAlign = "center";
    // the pilot line: the plane flies FOR the fielded tank's column (era face)
    ctx.fillStyle = ACCENT;
    ctx.font = `800 14px ${ERA_FONT}`;
    ctx.fillText((AR["FLYING_FOR_FMT"] ?? "FLYING FOR {name}'S COLUMN").replace("{name}", (view.tank?.name ?? STARTER_NAME).toUpperCase()), vw / 2, vh - 172);
    ctx.fillStyle = "rgba(170,180,189,0.92)";
    ctx.font = "600 11.5px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(T("hold to slide across · your guns fire themselves"), vw / 2, vh - 154);
    ctx.fillText(T("tap to drop a bomb on the amber pipper"), vw / 2, vh - 138);
    ctx.fillText(T("bombs pay the big money. never touch a ridge or a cable"), vw / 2, vh - 122);

    // ── LOADOUT: the paused build-choice moment (criterion 13). The world is
    // fully halted here (nothing advances during intro), so this reads as a
    // deliberate pick, not timed pressure. Hold a side to preview it live;
    // the last side held wins at commit (sim.ts). ──
    const cardY = vh - 100;
    const cardH = 54;
    const gapPx = 6 * k;
    const cardW = (vw - pad * 2 - gapPx) / 2;
    const drawLoadoutCard = (x: number, on: boolean, title: string, sub1: string, sub2: string) => {
      ctx.save();
      ctx.fillStyle = on ? "rgba(240,179,64,0.22)" : "rgba(255,255,255,0.06)";
      roundRect(ctx, x, cardY, cardW, cardH, 6 * k);
      ctx.fill();
      ctx.strokeStyle = on ? AMBER : "rgba(255,255,255,0.16)";
      ctx.lineWidth = (on ? 2 : 1) * k;
      roundRect(ctx, x, cardY, cardW, cardH, 6 * k);
      ctx.stroke();
      ctx.fillStyle = on ? AMBER : WHITE;
      ctx.font = `800 13px ${ERA_FONT}`;
      ctx.fillText(title, x + cardW / 2, cardY + 19 * k);
      ctx.fillStyle = "rgba(200,208,216,0.85)";
      ctx.font = "600 9.5px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(sub1, x + cardW / 2, cardY + 34 * k);
      ctx.fillText(sub2, x + cardW / 2, cardY + 46 * k);
      ctx.restore();
    };
    drawLoadoutCard(pad, s.loadout === 1, T("ESCORT"), T("+1 airframe hit"), T("slower roll"));
    drawLoadoutCard(pad + cardW + gapPx, s.loadout === 0, T("STRIKE"), T("standard airframe"), T("full roll speed"));
    ctx.fillStyle = "rgba(170,180,189,0.78)";
    ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(T("hold a side to pick your loadout for the sortie"), vw / 2, cardY + cardH + 13 * k);
    ctx.textAlign = "left";
  }
  // hit flash
  if (s.flash > 0 && !REDUCED_MOTION) {
    ctx.fillStyle = `rgba(232,61,78,${s.flash * 0.28})`;
    ctx.fillRect(0, 0, vw, vh);
  }

  let active = 0;
  for (const f of s.fighters) if (!f.dead && f.state !== "wait" && f.state !== "gone") active++;
  return active;
}

// ── component ───────────────────────────────────────────────────────────────

/** Localized copy pack, built by ./page.tsx from dict(getLocale()).arcade:
 * shared shell chrome only until the dict grows a warhawks section — the
 * literals below stay as the English fallback. */
export type WarhawksStrings = {
  intro?: string;
  introDaily?: string;
  shell?: Partial<RunShellStrings>;
  /** EXACT-english-string -> localized arena vocabulary (en sends {}). */
  arena?: Record<string, string>;
};

/** The sound names this game actually plays, prefetched by RunShell at run
 * start (sfxPack) so the first play of each is already sample-backed. */
const SFX_PACK = [
  "fire",
  "hit",
  "hurt",
  "ko",
  "banner",
  "fanfare",
  "bombdrop",
  "bombhit",
  "blast",
  "alarm",
  "flak",
  "warn",
  "powerup",
  "boss",
  "eng-prop",
  "mg-loop",
] as const;

/** GUN_CD/GUN_CD_HOT (0.18s / 0.13s, see sim.ts) both cross the ~4/s line
 * past which a repeated one-shot reads as a machine-gun stutter rather than
 * sustained fire (the flagship-game lesson, see this game's audio note) —
 * mg-loop covers a mashed run of bursts instead. GUN_LOOP_GRACE bridges the
 * brief burstLeft===0 gaps between back-to-back taps so the loop does not
 * stutter fade-out/fade-in on every single burst; it is roughly TAP_MAX_T,
 * long enough to survive one slow re-tap, short enough that a genuine pause
 * still lets the loop stop. */
const GUN_LOOP_GRACE = 0.22;

export default function WarhawksClient({ strings }: { strings?: WarhawksStrings }) {
  AR = strings?.arena ?? {}; // arena i18n map for the module-level draw code
  const prevRef = useRef({
    clock: 0,
    score: 0,
    hits: 0,
    died: false,
    leg: 0,
    won: false,
    bombsDropped: 0,
    bombsLanded: 0,
    bombsOnTarget: 0,
    telesFired: 0,
    burstsBloomed: 0,
    sawRam: false,
    sawVeil: false,
    sawRanging: false,
    sawFlagship: false,
    sawGunsHot: false,
    sawTwinRack: false,
    sawFlakAlley: false,
    sawAce: false,
    sawStrongpoint: false,
    nearRidge: false,
    gunGrace: 0,
  });
  // the shared page-fx layer (camera shake/lean/recoil-punch, motes,
  // streaks, the milestone cheer) — created per-run in createSim, stepped
  // once per frame in draw() (see ../_shared/pagefx)
  const fxRef = useRef<PageFx | null>(null);
  const cheerRef = useRef({ leg: 0, won: false });
  // the continuous engine drone (sfx.loop("eng-prop")) — started the first
  // frame it sees phase "play", revved with lateral speed, faded out on
  // death/landing; defensively re-armed in createSim so a run that restarts
  // mid-loop can never leave a stale handle behind
  const engineRef = useRef<SfxLoopHandle | null>(null);
  // sustained gun fire (see SFX_PACK's mg-loop doc above): live only while
  // a burst is actually dispensing tracers (plus GUN_LOOP_GRACE), same
  // defensive re-arm as engineRef.
  const gunLoopRef = useRef<SfxLoopHandle | null>(null);

  const createSim = useCallback(
    (w: number, h: number, seed: string, reduced: boolean, stats: PlayerStats | null) => {
      prevRef.current = {
        clock: 0,
        score: 0,
        hits: 0,
        died: false,
        leg: 0,
        won: false,
        bombsDropped: 0,
        bombsLanded: 0,
        bombsOnTarget: 0,
        telesFired: 0,
        burstsBloomed: 0,
        sawRam: false,
        sawVeil: false,
        sawRanging: false,
        sawFlagship: false,
        sawGunsHot: false,
        sawTwinRack: false,
        sawFlakAlley: false,
        sawAce: false,
        sawStrongpoint: false,
        nearRidge: false,
        gunGrace: 0,
      };
      cheerRef.current = { leg: 0, won: false };
      engineRef.current?.stop(0);
      engineRef.current = null;
      gunLoopRef.current?.stop(0);
      gunLoopRef.current = null;
      fxRef.current = createPageFx(seed, {
        accent: ACCENT,
        reducedMotion: reduced,
        celebrateColor: AMBER, // the franchise gold, but AMBER matches this game's own bomb-money accent
        effects: { banner: false }, // warhawks keeps its own local banner (the stencil/era face)
      });
      return createWarhawks(w, h, seed, reduced, stats);
    },
    [],
  );

  const draw = useCallback((ctx: CanvasRenderingContext2D, s: WarState, view: ShellView) => {
    let fx = fxRef.current;
    if (!fx) fx = fxRef.current = createPageFx("warhawks-fallback", { accent: ACCENT, reducedMotion: REDUCED_MOTION, effects: { banner: false } });
    const cheerState = cheerRef.current;
    const cheer = s.leg > cheerState.leg;
    const cheerBig = s.won && !cheerState.won;
    cheerState.leg = s.leg;
    cheerState.won = s.won;
    const maxV = ROLL * s.mods.rollMul * s.k;
    const leanSig = maxV > 0 ? Math.max(-1, Math.min(1, s.vx / maxV)) : 0;
    stepPageFx(fx, {
      clock: s.clock,
      w: view.w,
      h: view.h,
      k: s.k,
      lean: leanSig,
      rolling: s.phase === "play" && Math.abs(s.vx) > maxV * 0.5,
      banner: s.banner,
      cheer,
      cheerBig,
    });
    const active = drawScene(ctx, s, view, fx);
    const fl = flagshipOf(s);
    // DOM-probe hook (see WbDebug above)
    window.__wb = {
      phase: s.phase,
      x: s.x,
      wy: s.wy,
      camY: camY(s),
      screenX: s.x,
      screenY: s.planeSy,
      leg: s.leg,
      hits: s.hits,
      score: Math.round(s.score),
      gunScore: Math.round(s.gunScore),
      bombScore: Math.round(s.bombScore),
      bombsDropped: s.bombsDropped,
      bombsLanded: s.bombsLanded,
      bombsOnTarget: s.bombsOnTarget,
      telesFired: s.telesFired,
      burstsBloomed: s.burstsBloomed,
      fightersActive: active,
      viewW: view.w,
      viewH: view.h,
      pipperX: s.x,
      pipperY: s.wy + PIPPER_LEAD * s.k, // world wy; screen-space centre-x is s.x
      won: s.won,
      loadout: s.loadout,
      gearDown: gearDown(s),
      flagshipAlive: !!fl && !fl.dead,
      flagshipHp: fl ? fl.hp : 0,
      flagshipWy: fl ? fl.wy : 0,
    };
  }, []);

  // audio on sim deltas (page-side; the sim stays pure). RunShell owns the
  // Sfx instance and births it unmuted inside the Start tap.
  const onFrame = useCallback((s: WarState, sfx: Sfx) => {
    const prev = prevRef.current;
    const dt = Math.max(0, Math.min(0.25, s.clock - prev.clock));
    prev.clock = s.clock;
    // sustained gun fire (see SFX_PACK's mg-loop doc above): a LOOP while a
    // burst is actually dispensing tracers, not a "fire" one-shot per
    // tracer — GUN_CD/GUN_CD_HOT both cross the ~4/s one-shot line once a
    // player is mashing taps. GUN_LOOP_GRACE bridges the brief
    // burstLeft===0 gap between back-to-back taps so mashing reads as one
    // continuous stream instead of a stutter of fade-in/fade-out.
    if (s.phase === "play" && s.burstLeft > 0) {
      prev.gunGrace = GUN_LOOP_GRACE;
      if (!gunLoopRef.current) gunLoopRef.current = sfx.loop("mg-loop", { gain: 0.8, fadeMs: 35 });
    } else if (gunLoopRef.current) {
      prev.gunGrace -= dt;
      if (prev.gunGrace <= 0) {
        gunLoopRef.current.stop(130);
        gunLoopRef.current = null;
      }
    }
    if (s.score > prev.score) sfx.play("hit");
    prev.score = s.score;
    if (s.bombsOnTarget > prev.bombsOnTarget) sfx.play("blast"); // a CONFIRMED hit, layered over bombhit below
    prev.bombsOnTarget = s.bombsOnTarget;
    if (s.hits > prev.hits) sfx.play("hurt");
    prev.hits = s.hits;
    if (s.died && !prev.died) sfx.play("ko");
    prev.died = s.died;
    if (s.leg > prev.leg && !s.won) sfx.play("banner"); // leg clear
    prev.leg = s.leg;
    if (s.won && !prev.won) sfx.play("fanfare");
    prev.won = s.won;
    if (s.bombsDropped > prev.bombsDropped) sfx.play("bombdrop"); // the release
    prev.bombsDropped = s.bombsDropped;
    if (s.bombsLanded > prev.bombsLanded) sfx.play("bombhit"); // any ground detonation
    prev.bombsLanded = s.bombsLanded;
    if (s.telesFired > prev.telesFired) sfx.play("alarm"); // flak locking on
    prev.telesFired = s.telesFired;
    if (s.burstsBloomed > prev.burstsBloomed) sfx.play("flak"); // the airburst crack
    prev.burstsBloomed = s.burstsBloomed;
    // stat-combo reveals: a banner already fires (sim.ts); give it a stinger
    if (s.sawRam && !prev.sawRam) sfx.play("powerup");
    prev.sawRam = s.sawRam;
    if (s.sawVeil && !prev.sawVeil) sfx.play("powerup");
    prev.sawVeil = s.sawVeil;
    if (s.sawRanging && !prev.sawRanging) sfx.play("powerup");
    prev.sawRanging = s.sawRanging;
    // the flagship's boss reveal
    if (s.sawFlagship && !prev.sawFlagship) sfx.play("boss");
    prev.sawFlagship = s.sawFlagship;
    // MID-RUN GROWTH reveals: the same stinger the stat combos use above —
    // GUNS HOT / TWIN RACK are a player capability jump, not a threat.
    if (s.sawGunsHot && !prev.sawGunsHot) sfx.play("powerup");
    prev.sawGunsHot = s.sawGunsHot;
    if (s.sawTwinRack && !prev.sawTwinRack) sfx.play("powerup");
    prev.sawTwinRack = s.sawTwinRack;
    // the ACE reveal: a threat, not a power-up, so it borrows the danger cue
    if (s.sawAce && !prev.sawAce) sfx.play("warn");
    prev.sawAce = s.sawAce;
    // the two named-beat banners (FLAK ALLEY, STRONGPOINT AHEAD): the same
    // "entering a zone" cue a leg-clear banner uses above
    if (s.sawFlakAlley && !prev.sawFlakAlley) sfx.play("banner");
    prev.sawFlakAlley = s.sawFlakAlley;
    if (s.sawStrongpoint && !prev.sawStrongpoint) sfx.play("banner");
    prev.sawStrongpoint = s.sawStrongpoint;
    // the stall/danger warning: edge-triggered on ENTERING the ridge margin
    // (nextFighterWarning's own visual hatch), not spammed every frame
    const nearRidge = s.phase === "play" && (s.x - s.laneMin < 58 * s.k || s.laneMax - s.x < 58 * s.k);
    if (nearRidge && !prev.nearRidge) sfx.play("warn");
    prev.nearRidge = nearRidge;

    // the engine drone: born the instant play starts, revved with lateral
    // speed (throttle's nearest analogue here — SCROLL itself never
    // changes), faded out gracefully on death/landing. stopAll() on
    // run-end/unmount (RunShell) is the safety net; this is the polish.
    if (s.phase === "play" && !engineRef.current) {
      engineRef.current = sfx.loop("eng-prop", { gain: 0.85, fadeMs: 260 });
    }
    if (engineRef.current) {
      if (s.phase === "play") {
        const maxV = ROLL * s.mods.rollMul * s.k;
        const rate = 0.92 + (maxV > 0 ? Math.min(1, Math.abs(s.vx) / maxV) : 0) * 0.4;
        engineRef.current.setRate(rate);
      } else {
        engineRef.current.stop(400);
        engineRef.current = null;
      }
    }
  }, []);

  // belt-and-suspenders: stop the engine + gun loops if the component
  // unmounts mid-run (RunShell's own stopAll() on unmount is the primary
  // net; this just avoids depending on it for warhawks specifically)
  useEffect(() => {
    return () => {
      engineRef.current?.stop(0);
      engineRef.current = null;
      gunLoopRef.current?.stop(0);
      gunLoopRef.current = null;
    };
  }, []);

  return (
    <RunShell<WarState>
      game={GAME}
      title={TITLE}
      accent={ACCENT}
      createSim={createSim}
      step={(s, dt, input) => stepWarhawks(s, dt, input)}
      draw={draw}
      done={warDone}
      score={warScore}
      onFrame={onFrame}
      sfxPack={SFX_PACK}
      runMeta={(s, ctx) => ({
        v: 2,
        daily: ctx.daily,
        grid: ctx.grid,
        leg: s.leg,
        kills: s.kills,
        bombs: s.bombsDropped,
        onTarget: s.bombsOnTarget,
        bombPts: Math.round(s.bombScore),
        gunPts: Math.round(s.gunScore),
        won: s.won,
        cause: s.deathCause,
      })}
      shareBuild={(s, dayKey) => {
        const g = gridEmoji(s);
        return { grid: g, payload: sharePayload(dayKey, Math.round(s.score), g) };
      }}
      resultHeadline={(s) => (s.won ? "Wheels down. Sortie complete" : "Shot down over the front")}
      resultSub={(s) =>
        s.won
          ? `Full sortie. ${s.bombsOnTarget} bombs on target · ${Math.round(s.bombScore)} off the rack`
          : `Down in leg ${Math.min(3, s.diedLeg + 1)} · ${s.bombsOnTarget} bombs on target · ${Math.round(s.t)}s in the air`
      }
      intro={<GameIntro intro={strings?.intro ??
              "A three-leg sortie straight down over the front. The ground scrolls up at you; hold anywhere to slide your plane across the corridor, and let go and the torque roll walks you left. Your forward guns fire themselves at whatever is above you, so flying IS shooting. One tap drops a bomb: it lands on the amber pipper floating ahead of your nose, so put the pipper on a tank and tap. Bombs are the money here, guns barely pay. AA rings lock where you are heading, so reverse. Fighters dive in formation from the top and climb onto your tail from behind. Three hits and you are down. Survive a leg, bank the bonus. A flagship base guards the strip after leg three: bomb it down, then ride the final approach to the runway."} daily={strings?.introDaily ??
              "Your first scored run today is the shared daily sortie: everyone flies the same front."} more={strings?.shell?.howItWorks} />}
      strings={{
        startIdle: "Take off",
        startAgain: "Fly again",
        scoreUnit: "damage",
        dailyResultNote: "The daily sortie · the same front for everyone today",
        ...strings?.shell,
      }}
    />
  );
}
