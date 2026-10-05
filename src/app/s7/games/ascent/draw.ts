/**
 * ASCENT DRAW - the side-view tower renderer plus every painter the clients
 * composite. Pure presentation: nothing here reads sim RNG (the sim has
 * none) or mutates sim state; every function takes plain numbers/state and
 * paints (it MAY tick page-side clocks on the Fx object it is handed - the
 * rain ramp lives there). The tower geometry is authored vectors; the band
 * BACKDROPS are painted 800x600 plates loaded through the shared
 * try-image-else-vector kit (_shared/art.ts), with the vector sky gradient
 * underneath as the loading/failure fallback, so a cold cache can never
 * show a hole.
 *
 * THE PALETTE ARC (the climb OUT of the crypt): deep catacombs -> bone
 * halls -> storm battlements -> golden dawn spire, blended smoothly across
 * band boundaries so the ascent reads as one continuous dawn. The camera is
 * page-side (fx.camY, smoothed by the client); the sim never knows a camera
 * exists.
 *
 * The charge meter and aim tick are the ONLY forecast the player gets - no
 * trajectory preview, ever (the Foddy law: you learn the tower or you fall
 * down it).
 */

import type { ClassId } from "../_shared/rules/core";
import {
  BANDS,
  BOUNCE_WALLS,
  SCREEN_H,
  STORM_Y0,
  STORM_Y1,
  TOWER_TOP,
  WALL_L,
  WALL_R,
  bandIndexFor,
  windAt,
} from "./content";
import {
  CHARGE_MAX,
  RUN_FRAMES,
  FPS,
  VX_MAX100,
  VY_MAX100,
  VY_MIN100,
  ledgeByIdx,
  ledgeIdxInRange,
  type AscentState,
} from "./sim";
import { BANNER_S, THUD_S, TRAIL_S, DUST_S, STREAK_S, FLOAT_S, type Fx } from "./fx";
import { loadManifest, ready } from "../_shared/art";

export const DESIGN_W = 800;
export const DESIGN_H = 600;

/** Where the climber's stance sits on screen while the camera rests. */
export const CAM_EYE = 340; // world units above camY (bottom-of-view line)

const TAU = Math.PI * 2;

// ── palette ─────────────────────────────────────────────────────────────────

export const PAL = {
  ink: "#07080c",
  text: "#e8e2d2",
  dim: "#8b8577",
  gold: "#f0b340",
  goldHi: "#ffd98a",
  blood: "#c8443a",
  green: "#59d98c",
  ice: "#9fd4e8",
};

export const CLASS_ACCENT: Record<ClassId, string> = {
  barbarian: "#e07030",
  monk: "#3fae8a",
  ranger: "#3f7a3f",
  bard: "#6a5adf",
  wizard: "#3f6adf",
  cleric: "#d8b13f",
};

interface BandPal {
  skyTop: string;
  skyBot: string;
  stone: string;
  mortar: string;
  accent: string;
}

/** One palette per content band, index-aligned with BANDS. */
const BAND_PAL: BandPal[] = [
  { skyTop: "#0a0c12", skyBot: "#131622", stone: "#2a2d38", mortar: "#1b1e27", accent: "#3e4e64" },
  { skyTop: "#14161c", skyBot: "#232028", stone: "#494236", mortar: "#2d2921", accent: "#8b8577" },
  { skyTop: "#1a2230", skyBot: "#2c3c54", stone: "#3a4456", mortar: "#262e3e", accent: "#6a8ab8" },
  { skyTop: "#2c2338", skyBot: "#7a4a30", stone: "#5a4a3a", mortar: "#3a3028", accent: "#f0b340" },
  { skyTop: "#3a2c48", skyBot: "#8a5a38", stone: "#4a4050", mortar: "#302a38", accent: "#ffd98a" },
];

function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function mix(a: string, b: string, t: number): string {
  const ra = hexRgb(a);
  const rb = hexRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const c = (i: number) => Math.round(ra[i] + (rb[i] - ra[i]) * k);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

const BLEND_UNITS = 500; // palette crossfade width around each band boundary

/** The blended palette at one height (strings rebuilt only when the sampled
 * height moves a step; callers pass the camera midpoint once per frame). */
export function paletteAt(y: number): { skyTop: string; skyBot: string; stone: string; mortar: string; accent: string; band: number } {
  const b = bandIndexFor(y);
  const cur = BAND_PAL[Math.min(b, BAND_PAL.length - 1)];
  let out = { ...cur, band: b };
  if (b + 1 < BAND_PAL.length) {
    const edge = BANDS[b].y1;
    const d = edge - y;
    if (d < BLEND_UNITS && Number.isFinite(edge)) {
      const t = 1 - d / BLEND_UNITS;
      const nxt = BAND_PAL[b + 1];
      out = {
        skyTop: mix(cur.skyTop, nxt.skyTop, t * 0.5),
        skyBot: mix(cur.skyBot, nxt.skyBot, t * 0.5),
        stone: mix(cur.stone, nxt.stone, t * 0.5),
        mortar: mix(cur.mortar, nxt.mortar, t * 0.5),
        accent: mix(cur.accent, nxt.accent, t * 0.5),
        band: b,
      };
    }
  }
  return out;
}

// ── painted band backdrops (shared loader; try-image-else-vector) ───────────

/** The four painted 800x600 plates in public/s7-art/games/ascent/. The High
 * Spire (band 4) reuses the dawn plate - the repeat band IS the dawn's sky,
 * forever. Loaded lazily through the shared loadManifest (bg-* resolves
 * .webp); a missing plate never becomes ready() and the vector sky gradient
 * beneath simply keeps showing (the fallback law). */
const BG_NAMES = ["bg-catacombs", "bg-bonehalls", "bg-storm", "bg-dawn"] as const;
const PLATE_FOR_BAND: readonly number[] = [0, 1, 2, 3, 3];
let bgPlates: Record<(typeof BG_NAMES)[number], HTMLImageElement | null> | null = null;

function plateFor(band: number): HTMLImageElement | null {
  if (!bgPlates) bgPlates = loadManifest("ascent", BG_NAMES);
  const at = PLATE_FOR_BAND[Math.min(Math.max(0, band), PLATE_FOR_BAND.length - 1)];
  return bgPlates[BG_NAMES[at]];
}

/** Backdrop parallax: the plate scrolls at a quarter of the camera, wrapped
 * vertically (two tiled draws) so it never runs out however high the climb
 * goes. */
const PLATE_PARALLAX = 0.25;
/** Plates stay dimmed so ledges and the climber own the contrast
 * (readability beats richness - the handoff law). */
const PLATE_ALPHA = 0.62;

/** Storm rain fades in over this many seconds of band presence. */
const RAIN_RAMP_S = 2;
/** The band-entry light sweep's length (rides the banner clock; the banner
 * only ever fires on band entry, so no new fx state is needed). */
const SWEEP_S = 0.8;

/** One wrapped, parallaxed, dimmed full-frame plate pass. No-op (returns
 * false) when the image is not ready, leaving the vector sky visible. */
function drawPlate(
  g: CanvasRenderingContext2D,
  im: HTMLImageElement | null,
  camY: number,
  alpha: number,
): boolean {
  if (!ready(im) || alpha <= 0) return false;
  let yOff = (camY * PLATE_PARALLAX) % DESIGN_H;
  if (yOff < 0) yOff += DESIGN_H;
  g.globalAlpha = alpha;
  g.drawImage(im, 0, yOff - DESIGN_H, DESIGN_W, DESIGN_H);
  g.drawImage(im, 0, yOff, DESIGN_W, DESIGN_H);
  g.globalAlpha = 1;
  return true;
}

// ── projection (world y up, screen y down; camY = world y at screen bottom) ─

export function syFor(y: number, camY: number): number {
  return DESIGN_H - (y - camY);
}

// ── text helper (the house txt idiom) ───────────────────────────────────────

export function txt(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
  weight = 700,
): void {
  g.font = `${weight} ${size}px "Arial Narrow","Roboto Condensed","Segoe UI",system-ui,sans-serif`;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillStyle = color;
  g.fillText(s, x, y);
}

// ── the scene ───────────────────────────────────────────────────────────────

const viewBuf: number[] = []; // reused ledge-index buffer

export function renderScene(g: CanvasRenderingContext2D, s: AscentState, fx: Fx, reduced: boolean): void {
  const camY = fx.camY;
  const midY = camY + DESIGN_H / 2;
  const pal = paletteAt(midY);

  // sky
  const grad = g.createLinearGradient(0, 0, 0, DESIGN_H);
  grad.addColorStop(0, pal.skyTop);
  grad.addColorStop(1, pal.skyBot);
  g.fillStyle = grad;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // painted band plates over the gradient (the gradient IS the fallback):
  // current band's plate, crossfaded with the next band's near the boundary
  // by the same BLEND_UNITS window paletteAt() uses, so palette and painting
  // always turn together.
  {
    const imCur = plateFor(pal.band);
    let t = 0;
    if (pal.band + 1 < BAND_PAL.length) {
      const edge = BANDS[pal.band].y1;
      const d = edge - midY;
      if (d < BLEND_UNITS && Number.isFinite(edge)) t = 1 - d / BLEND_UNITS;
    }
    const imNxt = t > 0 ? plateFor(pal.band + 1) : null;
    if (imNxt && imNxt !== imCur) {
      // a true 0->1 crossfade (cur fades out as nxt fades in), continuous
      // across the band crossing - no pop
      drawPlate(g, imCur, camY, PLATE_ALPHA * (1 - t));
      drawPlate(g, imNxt, camY, PLATE_ALPHA * t);
    } else {
      drawPlate(g, imCur, camY, PLATE_ALPHA);
    }
  }

  // the dawn above: a soft gold glow that strengthens as the climb rises
  const glowK = Math.max(0, Math.min(1, midY / TOWER_TOP));
  if (glowK > 0.05) {
    const gl = g.createRadialGradient(DESIGN_W / 2, -120, 40, DESIGN_W / 2, -120, 560);
    gl.addColorStop(0, `rgba(255,214,130,${0.28 * glowK})`);
    gl.addColorStop(1, "rgba(255,214,130,0)");
    g.fillStyle = gl;
    g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }

  // storm rain (authored band only; a cheap fixed pattern scrolled by time).
  // On entry the count RAMPS 0 -> 22 over RAIN_RAMP_S instead of popping:
  // fx.rainOnAt is a page-side clock this painter owns (never sim state).
  if (midY > STORM_Y0 - 400 && midY < STORM_Y1 + 400 && !reduced) {
    if (fx.rainOnAt < 0) fx.rainOnAt = fx.time;
    const nRain = Math.min(22, Math.ceil(((fx.time - fx.rainOnAt) / RAIN_RAMP_S) * 22));
    g.strokeStyle = "rgba(159,196,224,0.14)";
    g.lineWidth = 1;
    g.beginPath();
    const drift = (fx.time * 640) % DESIGN_H;
    for (let i = 0; i < nRain; i++) {
      const rx = ((i * 149) % DESIGN_W) + Math.sin(i * 3.1) * 8;
      const ry = ((i * 233 + drift) % (DESIGN_H + 40)) - 20;
      g.moveTo(rx, ry);
      g.lineTo(rx - 5, ry + 16);
    }
    g.stroke();
  } else if (fx.rainOnAt >= 0) {
    fx.rainOnAt = -1; // left the storm: the next entry ramps again
  }

  // screen gridlines + numbers (faint; the memorization aid)
  g.strokeStyle = "rgba(232,226,210,0.05)";
  g.lineWidth = 1;
  const firstLine = Math.ceil(camY / SCREEN_H) * SCREEN_H;
  for (let y = firstLine; y < camY + DESIGN_H; y += SCREEN_H) {
    const sy = syFor(y, camY);
    g.beginPath();
    g.moveTo(WALL_L, sy);
    g.lineTo(WALL_R, sy);
    g.stroke();
    if (y > 0) txt(g, String(y), WALL_L + 6, sy - 4, 9, "rgba(232,226,210,0.22)", "left", 700);
  }

  // the tower walls: stone columns with mortar courses scrolling in world y
  g.fillStyle = pal.stone;
  g.fillRect(0, 0, WALL_L, DESIGN_H);
  g.fillRect(WALL_R, 0, DESIGN_W - WALL_R, DESIGN_H);
  g.strokeStyle = pal.mortar;
  g.lineWidth = 2;
  const course = 42;
  const firstCourse = Math.floor(camY / course) * course;
  g.beginPath();
  for (let y = firstCourse; y < camY + DESIGN_H + course; y += course) {
    const sy = syFor(y, camY);
    g.moveTo(0, sy);
    g.lineTo(WALL_L, sy);
    g.moveTo(WALL_R, sy);
    g.lineTo(DESIGN_W, sy);
  }
  g.stroke();
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(WALL_L - 3, 0, 3, DESIGN_H);
  g.fillRect(WALL_R, 0, 3, DESIGN_H);

  // the floor (world y 0)
  if (camY < 40) {
    const sy = syFor(0, camY);
    g.fillStyle = pal.stone;
    g.fillRect(0, sy, DESIGN_W, DESIGN_H - sy + 4);
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, sy, DESIGN_W, 3);
  }

  // authored bounce walls in view: ribbed amber rails. Brightened from the
  // original 30% rail (easy to miss over the painted plates) so bank-shots
  // read as intentional routes, not scenery.
  for (const w of BOUNCE_WALLS) {
    if (w.y1 < camY - 20 || w.y0 > camY + DESIGN_H + 20) continue;
    const syTop = syFor(w.y1, camY);
    const syBot = syFor(w.y0, camY);
    g.fillStyle = "rgba(240,179,64,0.55)";
    g.fillRect(w.x - 3, syTop, 6, syBot - syTop);
    g.fillStyle = "rgba(255,217,138,0.85)";
    for (let sy = syTop + 4; sy < syBot; sy += 14) g.fillRect(w.x - 3, sy, 6, 4);
    // end caps so the rail's span is legible at a glance
    g.fillStyle = "rgba(255,217,138,0.9)";
    g.fillRect(w.x - 5, syTop - 2, 10, 3);
    g.fillRect(w.x - 5, syBot - 1, 10, 3);
  }

  // ledges in view
  ledgeIdxInRange(Math.floor(camY) - 40, Math.floor(camY) + DESIGN_H + 40, viewBuf);
  for (let i = 0; i < viewBuf.length; i++) {
    const l = ledgeByIdx(viewBuf[i]);
    const sy = syFor(l.y, camY);
    const wpx = l.x1 - l.x0;
    // the slab
    g.fillStyle = l.cp === 1 ? mix(pal.stone, PAL.gold, 0.25) : pal.stone;
    g.fillRect(l.x0, sy, wpx, 9);
    g.fillStyle = pal.mortar;
    g.fillRect(l.x0, sy + 9, wpx, 3);
    // top face light
    g.fillStyle = l.kind !== 0 ? "rgba(159,212,232,0.75)" : "rgba(255,255,255,0.16)";
    g.fillRect(l.x0, sy, wpx, 2);
    if (l.kind !== 0) {
      // slick sheen + slide chevrons
      g.fillStyle = "rgba(159,212,232,0.18)";
      g.fillRect(l.x0, sy, wpx, 6);
      g.strokeStyle = "rgba(159,212,232,0.8)";
      g.lineWidth = 1.5;
      const dir = l.kind === 1 ? -1 : 1;
      const n = Math.max(1, Math.floor(wpx / 26));
      for (let c = 0; c < n; c++) {
        const cx = l.x0 + 10 + c * ((wpx - 20) / Math.max(1, n - 1) || 1);
        g.beginPath();
        g.moveTo(cx - 3 * dir, sy + 4.5);
        g.lineTo(cx + 2 * dir, sy + 6.5);
        g.moveTo(cx - 3 * dir, sy + 8.5);
        g.lineTo(cx + 2 * dir, sy + 6.5);
        g.stroke();
      }
    }
    if (l.cp === 1) {
      // the checkpoint banner: a pole and a gold pennant, nothing mechanical
      const px = l.x0 + 14;
      g.strokeStyle = "#6a5a42";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(px, sy);
      g.lineTo(px, sy - 34);
      g.stroke();
      g.fillStyle = PAL.gold;
      g.beginPath();
      g.moveTo(px + 1, sy - 34);
      g.lineTo(px + 25, sy - 29);
      g.lineTo(px + 1, sy - 23);
      g.closePath();
      g.fill();
      txt(g, "REST", l.x0 + 34, sy - 24, 10, "rgba(240,179,64,0.85)", "left", 800);
    }
    if (l.y === TOWER_TOP) {
      // the crown
      g.fillStyle = PAL.goldHi;
      g.fillRect(l.x0, sy - 2, wpx, 4);
      txt(g, "THE CROWN", (l.x0 + l.x1) / 2, sy - 10, 11, PAL.goldHi, "center", 800);
    }
  }

  // the best-height line (gold dashes; the score made visible)
  if (s.maxY > 0) {
    const sy = syFor(s.maxY, camY);
    if (sy > -10 && sy < DESIGN_H + 10) {
      g.strokeStyle = "rgba(240,179,64,0.5)";
      g.lineWidth = 1.5;
      g.setLineDash([7, 7]);
      g.beginPath();
      g.moveTo(WALL_L, sy);
      g.lineTo(WALL_R, sy);
      g.stroke();
      g.setLineDash([]);
      txt(g, `BEST ${s.maxY}`, WALL_R - 8, sy - 5, 10, "rgba(240,179,64,0.8)", "right", 800);
    }
  }

  // wind flags: while a gust blows at the climber's height, lean the pennant
  const gust = windAt(s.frame, Math.floor(s.y100 / 100));

  // fx layers under the climber: trail, dust, streaks
  drawTrailAndDust(g, fx, camY, CLASS_ACCENT[s.classId]);

  // the climber
  drawClimber(g, s, camY, gust, fx.time, reduced);

  // band-entry light sweep: one gradient pass climbing the frame over
  // SWEEP_S, riding the banner clock (the banner only fires on band entry).
  // Skipped entirely under reduced motion.
  if (!reduced && fx.banner.t > 0 && fx.banner.t < SWEEP_S) {
    const k = fx.banner.t / SWEEP_S;
    const cy = DESIGN_H * (1.1 - 1.2 * k); // sweeps bottom to top, like the climb
    const sg = g.createLinearGradient(0, cy - 90, 0, cy + 90);
    const peak = 0.2 * Math.sin(Math.PI * k);
    sg.addColorStop(0, "rgba(255,217,138,0)");
    sg.addColorStop(0.5, `rgba(255,217,138,${peak.toFixed(3)})`);
    sg.addColorStop(1, "rgba(255,217,138,0)");
    g.fillStyle = sg;
    g.fillRect(0, cy - 90, DESIGN_W, 180);
  }

  // floats (world-anchored)
  for (const f of fx.floats) {
    if (!f.on) continue;
    const a = Math.min(1, (FLOAT_S - f.t) / 0.3);
    const sy = syFor(f.y, camY) - f.t * 40;
    g.globalAlpha = Math.max(0, a);
    g.font = `800 ${f.big ? 20 : 14}px "Arial Narrow","Roboto Condensed","Segoe UI",system-ui,sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.strokeStyle = "#05060a";
    g.lineWidth = 3;
    g.strokeText(f.text, Math.round(f.x), Math.round(sy));
    g.fillStyle = f.color;
    g.fillText(f.text, Math.round(f.x), Math.round(sy));
    g.globalAlpha = 1;
  }
}

function drawTrailAndDust(g: CanvasRenderingContext2D, fx: Fx, camY: number, accent: string): void {
  for (const t of fx.trail) {
    if (!t.on) continue;
    const k = 1 - t.t / TRAIL_S;
    g.globalAlpha = 0.35 * k;
    g.fillStyle = accent;
    g.beginPath();
    g.arc(t.x, syFor(t.y, camY), 2 + 3 * k, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  for (const d of fx.dusts) {
    if (!d.on) continue;
    const k = 1 - d.t / DUST_S;
    g.globalAlpha = 0.5 * k;
    g.fillStyle = "#b8b0a0";
    g.beginPath();
    g.arc(d.x, syFor(d.y, camY), d.r * (0.6 + 0.8 * (1 - k)), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  for (const st of fx.streaks) {
    if (!st.on) continue;
    const k = 1 - st.t / STREAK_S;
    g.globalAlpha = 0.4 * k;
    g.strokeStyle = PAL.ice;
    g.lineWidth = 1.5;
    g.beginPath();
    const sy = syFor(st.y, camY);
    g.moveTo(st.x, sy);
    g.lineTo(st.x + st.len * st.dir, sy);
    g.stroke();
  }
  g.globalAlpha = 1;
  // the landing thud ring
  const th = fx.thud;
  if (th.t < THUD_S) {
    const k = th.t / THUD_S;
    g.globalAlpha = (1 - k) * 0.6 * (0.4 + 0.6 * th.power);
    g.strokeStyle = "#d8d0c0";
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(th.x, syFor(th.y, camY), 6 + 34 * k * (0.5 + th.power), 0, TAU);
    g.stroke();
    g.globalAlpha = 1;
  }
}

/** The climber: a small hooded figure. Crouches while charging (the meter
 * made bodily), stretches with vertical speed in the air. Class shows only
 * in the cloak trim and the page trail (the gear-never-changes-the-body
 * panel law, applied to classes too). */
function drawClimber(
  g: CanvasRenderingContext2D,
  s: AscentState,
  camY: number,
  gust: number,
  time: number,
  reduced: boolean,
): void {
  const x = s.x100 / 100;
  const y = s.y100 / 100;
  const sy = syFor(y, camY);
  const accent = CLASS_ACCENT[s.classId];
  const chargeK = s.charging === 1 ? s.charge / CHARGE_MAX : 0;
  const crouch = 1 - 0.3 * chargeK;
  const airK = s.grounded === 0 ? Math.max(-1, Math.min(1, s.vy100 / 1400)) : 0;
  const hgt = 26 * crouch * (1 + 0.12 * Math.abs(airK));
  const wid = 14 * (1 + 0.25 * chargeK) * (1 - 0.1 * Math.abs(airK));

  g.save();
  g.translate(x, sy);
  // shadow on the stance
  if (s.grounded === 1) {
    g.globalAlpha = 0.35;
    g.fillStyle = "#000";
    g.beginPath();
    g.ellipse(0, 1.5, wid * 0.8, 3, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  }
  // cloak
  const leanW = gust !== 0 && s.grounded === 0 ? Math.sign(gust) * 3 : 0;
  g.fillStyle = "#1c2128";
  g.beginPath();
  g.moveTo(-wid / 2 + leanW, 0);
  g.lineTo(0, -hgt);
  g.lineTo(wid / 2 + leanW, 0);
  g.closePath();
  g.fill();
  // cloak trim (class accent, the one flavored pixel band)
  g.strokeStyle = accent;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-wid / 2 + leanW, -1);
  g.lineTo(wid / 2 + leanW, -1);
  g.stroke();
  // helm
  g.fillStyle = "#cfc8b8";
  g.beginPath();
  g.arc(0, -hgt + 1, 4.5, 0, TAU);
  g.fill();
  g.fillStyle = "#07080c";
  g.fillRect(-3, -hgt, 6, 2);
  g.restore();

  // the charge meter + aim tick (grounded and charging only)
  if (s.charging === 1) {
    const mx = x - 26;
    const myBot = sy - 2;
    const mh = 36;
    g.fillStyle = "rgba(7,8,12,0.65)";
    g.fillRect(mx - 4, myBot - mh - 2, 8, mh + 4);
    const fillH = mh * chargeK;
    const col = chargeK >= 1 ? PAL.blood : chargeK > 0.66 ? PAL.gold : PAL.green;
    g.fillStyle = col;
    g.fillRect(mx - 3, myBot - fillH - 1, 6, fillH);
    g.strokeStyle = "rgba(232,226,210,0.5)";
    g.lineWidth = 1;
    g.strokeRect(mx - 4, myBot - mh - 2, 8, mh + 4);
    // TRUE-ANGLE AIM NEEDLE: direction only, never a trajectory (the Foddy
    // law stands). The angle is computed from doJump's OWN launch formulas
    // (sim.ts doJump: vy100 = VY_MIN100 + charge*(VY_MAX100-VY_MIN100)/
    // CHARGE_MAX; vx100 = aim*VX_MAX100*charge/(100*CHARGE_MAX)), reading
    // state.aim directly (already the curved value), so the needle IS where
    // this charge would send you - the old constant 0.62rad tick lied at
    // every charge (the real full-charge cone is ~0.38rad).
    const c = s.charge;
    const vyNow = VY_MIN100 + (c * (VY_MAX100 - VY_MIN100)) / CHARGE_MAX;
    const angOf = (aim: number): number =>
      -Math.PI / 2 + Math.atan2((aim * VX_MAX100 * c) / (100 * CHARGE_MAX), vyNow);
    const ox = x;
    const oy = sy - 30;
    // the blink window: the last ~12 frames before the full meter fires
    // itself (chargeRate100 is the sim's own fill speed, read from state)
    const framesToAuto = (CHARGE_MAX - c) / Math.max(1, s.chargeRate100);
    const blink = framesToAuto <= 12;
    let needleA = 0.6 + 0.35 * chargeK; // rises to ~0.95 at full charge
    if (blink && !reduced) needleA = Math.sin(time * 42) > 0 ? 0.95 : 0.25;
    // the protractor: a short arc with 5 ticks at aim -100/-50/0/+50/+100,
    // each at its TRUE angle for the current charge (the fan visibly widens
    // as the meter fills - charge and angle are coupled, honestly shown)
    const pr = 30;
    g.strokeStyle = "rgba(232,226,210,0.28)";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(ox, oy, pr, angOf(-100), angOf(100));
    g.stroke();
    for (let ti = -100; ti <= 100; ti += 50) {
      const ta = angOf(ti);
      const centre = ti === 0;
      const detent = centre && Math.abs(s.aim) <= 4;
      const r0 = pr - (centre ? 5 : 3);
      const r1 = pr + (centre ? 5 : 3);
      g.strokeStyle = detent ? PAL.goldHi : `rgba(232,226,210,${centre ? 0.55 : 0.35})`;
      g.lineWidth = detent ? 2.5 : 1.5;
      g.beginPath();
      g.moveTo(ox + Math.cos(ta) * r0, oy + Math.sin(ta) * r0);
      g.lineTo(ox + Math.cos(ta) * r1, oy + Math.sin(ta) * r1);
      g.stroke();
    }
    // bright centre detent while the aim sits in the straight-up window
    if (Math.abs(s.aim) <= 4) {
      const ta = angOf(0);
      g.globalAlpha = 0.9;
      g.fillStyle = PAL.goldHi;
      g.beginPath();
      g.arc(ox + Math.cos(ta) * pr, oy + Math.sin(ta) * pr, 3, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    }
    // the needle itself
    const ang = angOf(s.aim);
    const len = 20 + 12 * chargeK;
    const ax = ox + Math.cos(ang) * len;
    const ay = oy + Math.sin(ang) * len;
    g.globalAlpha = needleA;
    g.strokeStyle = PAL.text;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(ax, ay);
    g.stroke();
    g.fillStyle = PAL.text;
    g.beginPath();
    g.arc(ax, ay, 2.5, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    // full-meter pulse: the auto-jump warning
    if (chargeK >= 1) {
      g.globalAlpha = 0.5 + 0.5 * Math.sin(time * 30);
      g.strokeStyle = PAL.blood;
      g.lineWidth = 2;
      g.strokeRect(mx - 6, myBot - mh - 4, 12, mh + 8);
      g.globalAlpha = 1;
    }
  }
}

// ── HUD + banner (screen space, after the world) ────────────────────────────

export function drawHud(g: CanvasRenderingContext2D, s: AscentState): void {
  // height (the score) top-left
  g.fillStyle = "rgba(7,8,12,0.55)";
  g.fillRect(8, 8, 168, 46);
  txt(g, "HEIGHT", 16, 24, 10, PAL.dim, "left", 800);
  txt(g, String(s.maxY), 16, 46, 24, PAL.gold, "left", 800);
  const band = bandIndexFor(Math.floor(s.y100 / 100));
  txt(g, BANDS[Math.min(band, BANDS.length - 1)].name.toUpperCase(), 78, 46, 9, PAL.dim, "left", 800);

  // the timer, top-right; the last 30 seconds burn red
  const left = Math.max(0, RUN_FRAMES - s.frame);
  const secs = Math.ceil(left / FPS);
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  const low = secs <= 30;
  g.fillStyle = "rgba(7,8,12,0.55)";
  g.fillRect(DESIGN_W - 96, 8, 88, 34);
  txt(g, `${mm}:${String(ss).padStart(2, "0")}`, DESIGN_W - 52, 33, 22, low ? PAL.blood : PAL.text, "center", 800);
}

/** The band banner (the crypt drawBanner idiom): eases in, holds, eases out
 * over BANNER_S seconds. */
export function drawBanner(g: CanvasRenderingContext2D, text: string, sub: string, t: number, color: string): void {
  const k = t / BANNER_S;
  if (k >= 1) return;
  const inK = Math.min(1, t / 0.25);
  const outK = Math.min(1, (BANNER_S - t) / 0.4);
  const a = Math.min(inK, outK);
  const y = 120 - (1 - inK) * 16;
  g.globalAlpha = a * 0.85;
  g.fillStyle = "rgba(7,8,12,0.75)";
  g.fillRect(0, y - 34, DESIGN_W, 56);
  g.globalAlpha = a;
  txt(g, text, DESIGN_W / 2, y, 26, color, "center", 800);
  if (sub) txt(g, sub, DESIGN_W / 2, y + 18, 12, PAL.dim, "center", 700);
  g.globalAlpha = 1;
}
