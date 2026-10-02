/**
 * S6 shared PAGE-FX layer — the promoted Gunner's Run (tankbuster) camera and
 * juice kit. Every effect here was proven first in tankbuster/Client.tsx's
 * original inline `PageFx`; this module is that code, generalized so the
 * other three games can adopt it without ever having seen the donor. READ
 * THIS HEADER, NOT THE TANKBUSTER SOURCE, before wiring a new game — the
 * other three agents building on this phase are expected to start here.
 *
 * SIX EFFECTS, ALL OPT-IN per game via `PageFxConfig.effects` (all default
 * ON; tankbuster uses every one):
 *   - CAMERA  screen shake + a recoil punch-in/shove toward a shot point.
 *   - LEAN    a smoothed camera bank into whatever signal the caller feeds
 *             (a route bend, a steering input, anything -1..1-ish).
 *   - STREAKS ambient edge speed-lines while the caller says "we're moving".
 *   - MOTES   ambient dust drifting through the scene (thinned, never fully
 *             OFF, under reduced motion — matches the proven feel).
 *   - CHEER   a gold double-ring + a confetti burst, fired on command.
 *   - BANNER  a letterboxed text card with an entrance "pop".
 *
 * WHAT THIS DOES NOT OWN: anything sim-specific. The original tankbuster
 * PageFx read GunnerState fields directly (s.district, s.won, s.recoilT,
 * s.aimX, tankAnchor(...)...). This version reads NOTHING from a sim type —
 * every frame the CALLER hands step()/beginCameraFx() a small plain object
 * built from whatever ITS OWN sim exposes. In particular:
 *   - "cheer" is EDGE-TRIGGERED BY THE CALLER. This module does no sim-state
 *     comparison (no s.district/s.won reads); you pass `cheer: true` on the
 *     exact frame you want the flourish to fire (you own the "did something
 *     worth celebrating just happen" logic, because only you know what that
 *     means for your game).
 *   - "recoil" is a caller-normalized 0..1 (your own recoilT / your own
 *     recoil duration), with an explicit recoilFrom/recoilTo pair (the two
 *     screen points the shove reads direction from). tankbuster passes
 *     tankAnchor(W,H) and {x:aimX,y:aimY}; a game with no recoil concept
 *     just omits it.
 *   - "lean" is a plain number, smoothed internally; pass 0 (or omit) if
 *     your game has no lean concept.
 *
 * RNG: its own mulberry32 stream, seeded "<seedPrefix><seed>" (default
 * prefix "grfx-page-"), NEVER a sim's rng/rngFx. Page cosmetics can
 * therefore never shift a gameplay roll, which is what keeps the harness
 * tape byte-identical across every page refactor (see scripts/s6-harness.ts
 * check (a)). Uses Math.random() nowhere — page-fx randomness is still
 * seeded and reproducible per run, it is just never the SIM's stream.
 *
 * REDUCED MOTION: `config.reducedMotion` gates SPAWNING (no new
 * streaks/confetti, motes thinned not stopped, camera shake/punch/lean
 * suppressed, banner pop stays static) and every draw* function additionally
 * no-ops its own reduced-motion-only visuals internally, so callers never
 * need to wrap a call site in `if (!REDUCED_MOTION)` themselves. This module
 * never touches audio — sfx.ts fixed that gate independently (audio is
 * muted-only, never reduced-motion-gated).
 *
 * USAGE SKETCH (see tankbuster/Client.tsx for the full wiring this was
 * extracted from):
 *
 *   const fxRef = useRef<PageFx | null>(null);
 *   // in createSim():
 *   fxRef.current = createPageFx(seed, { accent: ACCENT, reducedMotion });
 *
 *   // once per frame, before drawing (drives lean/banner/cheer/streaks/motes):
 *   stepPageFx(fx, {
 *     clock: s.clock, w: s.W, h: s.H, k: s.k,
 *     lean: myLeanSignal(s),            // or omit if unused
 *     rolling: s.phase === "play",      // gates streak spawning
 *     banner: s.banner,                 // { txt, t, tone? } | null
 *     cheer: justCrossedAMilestone,     // YOU edge-trigger this
 *     cheerBig: justWonTheRun,
 *   });
 *
 *   // camera transform wraps the WORLD draw only (never the HUD):
 *   beginCameraFx(ctx, fx, { w: s.W, h: s.H, k: s.k }, {
 *     shake: s.shake,
 *     recoil: s.recoilT > 0 ? s.recoilT / RECOIL_DURATION : 0,
 *     recoilFrom: tankAnchor(s.W, s.H), recoilTo: { x: s.aimX, y: s.aimY },
 *   });
 *   drawWorld(ctx, s);
 *   endCameraFx(ctx);
 *
 *   // layer the ambient/celebration draws wherever they read right in your
 *   // own composite (tankbuster draws motes early/behind foes, streaks and
 *   // the cheer/banner cards late/on top — that ordering is a per-game call):
 *   drawMotes(ctx, fx, { w: s.W, h: s.H, k: s.k });
 *   drawStreaks(ctx, fx, { w: s.W, h: s.H, k: s.k });
 *   drawCheer(ctx, fx, { w: s.W, h: s.H, k: s.k });
 *   drawBanner(ctx, fx, { w: s.W, h: s.H, k: s.k });
 */

// ── tiny local RNG (deliberately duplicated, not imported from any game's
// sim.ts — every S6 sim already carries its own copy of exactly this pair;
// a SHARED module must not create a dependency from itself onto one game) ──
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── config ───────────────────────────────────────────────────────────────
export interface PageFxEffects {
  camera: boolean;
  lean: boolean;
  streaks: boolean;
  motes: boolean;
  cheer: boolean;
  banner: boolean;
}

export interface PageFxConfig {
  /** Per-game tile accent (any CSS colour string). Currently used as the
   * fallback for celebrateColor below; kept as its own field because a
   * future effect may want the raw game accent even where the celebratory
   * colour is deliberately NOT the accent (see celebrateColor). */
  accent: string;
  /** Mirrors the page's prefers-reduced-motion read. Gates spawning; see the
   * module header for exactly what stays on vs off. */
  reducedMotion: boolean;
  /** The cheer ring + confetti + default banner tone colour. Defaults to the
   * proven franchise gold (#f0b340) — NOT `accent` — because tankbuster's
   * accent is rust-orange (#e0662e) while its celebration colour has always
   * been gold; the two are independent by design. Override only if your
   * game wants its celebration tinted to its own accent. */
  celebrateColor?: string;
  /** RNG stream prefix; default "grfx-page-". Two games that ever shared a
   * literal seed string would otherwise draw identical page-fx randomness. */
  seedPrefix?: string;
  /** Every effect defaults ON; set any to false to opt out per game. */
  effects?: Partial<PageFxEffects>;
}

const DEFAULT_EFFECTS: PageFxEffects = { camera: true, lean: true, streaks: true, motes: true, cheer: true, banner: true };
const DEFAULT_CELEBRATE = "#f0b340"; // the proven franchise gold

// ── state ────────────────────────────────────────────────────────────────
interface Streak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  life: number;
  max: number;
}
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}
interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}

export interface PageFxBanner {
  txt: string;
  /** 0..1 fade-in, mirroring the shape every sim's own `banner` field
   * already carries (tankbuster's s.banner is exactly {txt, t}). */
  t: number;
  /** Colour family; default reads in the neutral/celebratory gold. */
  tone?: "default" | "danger" | "alert";
}

/** Treat every field here as this module's internal state — read/write it
 * only through the functions below. Exported solely so a game can type
 * `useRef<PageFx | null>(null)`. */
export interface PageFx {
  rng: () => number;
  cfg: {
    celebrateColor: string;
    reducedMotion: boolean;
    effects: PageFxEffects;
  };
  lean: number;
  lastClock: number;
  bannerTxt: string | null;
  bannerBorn: number;
  bannerCache: PageFxBanner | null;
  streaks: Streak[];
  motes: Mote[];
  cheerT: number;
  confetti: Confetti[];
}

export function createPageFx(seed: string, config: PageFxConfig): PageFx {
  const seedPrefix = config.seedPrefix ?? "grfx-page-";
  return {
    rng: mulberry32(fnv1a(seedPrefix + seed)),
    cfg: {
      celebrateColor: config.celebrateColor ?? DEFAULT_CELEBRATE,
      reducedMotion: config.reducedMotion,
      effects: { ...DEFAULT_EFFECTS, ...config.effects },
    },
    lean: 0,
    lastClock: 0,
    bannerTxt: null,
    bannerBorn: 0,
    bannerCache: null,
    streaks: [],
    motes: [],
    cheerT: 0,
    confetti: [],
  };
}

// ── per-frame update ─────────────────────────────────────────────────────
export interface PageFxInput {
  /** The sim's own clock (seconds), monotonic while playing. Frame dt is the
   * delta since the last step() call, clamped to 0.1s internally so a
   * hit-stop freeze or a tab-away never explodes the particle systems. */
  clock: number;
  w: number;
  h: number;
  /** The game's own view-scale factor (every S6 sim exposes s.k = viewW/480). */
  k: number;
  /** Absolute px Y that streaks/motes bias their spawn band from (added to a
   * random 0..~0.55*h below it). Default 0 = spawn across the whole canvas.
   * tankbuster passes its horizon line (H * HORIZON) to match its original
   * look exactly. */
  horizonY?: number;
  /** Smoothed toward every frame (rate ~3.2/s, the proven feel). Omit (or 0)
   * for a game with no lean concept. Ignored when effects.lean is off. */
  lean?: number;
  /** True while streaks should be spawning (i.e. "we are moving"). */
  rolling?: boolean;
  /** Current banner text/fade, or null/omitted when no banner is showing. */
  banner?: PageFxBanner | null;
  /** Edge-triggered BY THE CALLER: true on the exact frame a cheer should
   * fire. This module does no sim-state comparison of its own. */
  cheer?: boolean;
  /** A bigger burst (e.g. the run's final win) vs. a standard tier-up. */
  cheerBig?: boolean;
}

/** The current smoothed lean value, for a game that wants the same number
 * for its OWN extra parallax (tankbuster uses this for its sky/skyline
 * drift) beyond what beginCameraFx already applies to the ctx transform. */
export function currentLean(fx: PageFx): number {
  return fx.lean;
}

export function stepPageFx(fx: PageFx, input: PageFxInput): void {
  const dt = Math.max(0, Math.min(0.1, input.clock - fx.lastClock));
  fx.lastClock = input.clock;
  const reduced = fx.cfg.reducedMotion;
  const on = fx.cfg.effects;
  const { w, h, k } = input;
  const horizonY = input.horizonY ?? 0;

  // banner entrance tracking (the card pops on each new banner text)
  if (on.banner) {
    const txt = input.banner ? input.banner.txt : null;
    if (txt && txt !== fx.bannerTxt) {
      fx.bannerTxt = txt;
      fx.bannerBorn = input.clock;
    }
    if (!txt) fx.bannerTxt = null;
    fx.bannerCache = input.banner ?? null;
  }

  // camera lean (a pure smoothed read; draw-only downstream)
  if (on.lean) {
    const target = input.lean ?? 0;
    fx.lean += (target - fx.lean) * Math.min(1, dt * 3.2);
  }

  // cheer flourish: gold ring timer + a confetti burst (reduced motion keeps
  // the (invisible) timer but skips spawning any confetti)
  if (on.cheer && input.cheer) {
    fx.cheerT = 0.9;
    if (!reduced) {
      const n = input.cheerBig ? 36 : 24;
      for (let i = 0; i < n && fx.confetti.length < 60; i++) {
        fx.confetti.push({
          x: w / 2 + (fx.rng() - 0.5) * w * 0.5,
          y: h * 0.4 + (fx.rng() - 0.5) * 16 * k,
          vx: (fx.rng() - 0.5) * 260 * k,
          vy: (-70 - fx.rng() * 170) * k,
          r: (1 + fx.rng() * 1.6) * k,
          life: 0,
          max: 0.7 + fx.rng() * 0.5,
        });
      }
    }
  }
  if (fx.cheerT > 0) fx.cheerT = Math.max(0, fx.cheerT - dt);
  for (const cf of fx.confetti) {
    cf.vy += 420 * k * dt;
    cf.x += cf.vx * dt;
    cf.y += cf.vy * dt;
    cf.life += dt;
  }
  fx.confetti = fx.confetti.filter((cf) => cf.life < cf.max);

  // edge speed streaks while rolling (fully off under reduced motion)
  if (on.streaks && input.rolling && !reduced) {
    if (fx.rng() < dt * 22 && fx.streaks.length < 26) {
      const side = fx.rng() < 0.5 ? -1 : 1;
      fx.streaks.push({
        x: w / 2 + side * w * (0.3 + fx.rng() * 0.22),
        y: horizonY + fx.rng() * h * 0.5,
        vx: side * (60 + fx.rng() * 120) * k,
        vy: (140 + fx.rng() * 220) * k,
        len: (26 + fx.rng() * 46) * k,
        life: 0.22 + fx.rng() * 0.16,
        max: 0.38,
      });
    }
  }
  for (const st of fx.streaks) {
    st.x += st.vx * dt;
    st.y += st.vy * dt;
    st.life -= dt;
  }
  fx.streaks = fx.streaks.filter((st) => st.life > 0);

  // ambient dust motes (thinned, never fully stopped, under reduced motion)
  if (on.motes) {
    const moteCap = reduced ? 12 : 36;
    if (fx.rng() < dt * (reduced ? 3 : 9) && fx.motes.length < moteCap) {
      fx.motes.push({
        x: fx.rng() * w,
        y: horizonY + fx.rng() * h * 0.55,
        vx: (fx.rng() - 0.5) * 18 * k + fx.lean * 22 * k,
        vy: (26 + fx.rng() * 44) * k,
        r: (0.7 + fx.rng() * 1.1) * k,
        life: 0,
        max: 1.0 + fx.rng() * 1.4,
      });
    }
  }
  for (const mo of fx.motes) {
    mo.x += mo.vx * dt;
    mo.y += mo.vy * dt;
    mo.life += dt;
  }
  fx.motes = fx.motes.filter((mo) => mo.life < mo.max && mo.y < h + 8);
}

// ── camera transform (wrap the WORLD draw only, never the HUD) ─────────────
export interface PageFxView {
  w: number;
  h: number;
  k: number;
}

export interface PageFxCameraInput {
  /** Current screen-shake magnitude in px, or 0/omitted for none. */
  shake?: number;
  /** 0..1 normalized recoil progress (1 = the instant of the shot, decaying
   * toward 0); your own recoilT / your own recoil duration. Punch-in and the
   * shove both key off this. */
  recoil?: number;
  recoilFrom?: { x: number; y: number };
  recoilTo?: { x: number; y: number };
  /** Pivot the lean rotation about this point; default {w/2, h*0.75} (the
   * proven tankbuster default: low on screen, near a bottom-anchored hull). */
  leanPivot?: { x: number; y: number };
}

/** Always pair with endCameraFx (it is exactly ctx.save()/ctx.restore(),
 * kept as two named calls so a reader never has to guess which save() a
 * given restore() belongs to in a long draw function). A no-op transform
 * (still safely save/restore-paired) when effects.camera is off,
 * reducedMotion is on, or nothing is active this frame. */
export function beginCameraFx(
  ctx: CanvasRenderingContext2D,
  fx: PageFx,
  view: PageFxView,
  input: PageFxCameraInput = {},
): void {
  ctx.save();
  if (!fx.cfg.effects.camera || fx.cfg.reducedMotion) return;
  const { w, h, k } = view;
  let tx = 0;
  let ty = 0;
  const shake = input.shake ?? 0;
  if (shake > 0) {
    tx += (fx.rng() - 0.5) * shake;
    ty += (fx.rng() - 0.5) * shake;
  }
  const recoil = input.recoil ?? 0;
  if (recoil > 0 && input.recoilFrom && input.recoilTo) {
    const dxA = input.recoilTo.x - input.recoilFrom.x;
    const dyA = input.recoilTo.y - input.recoilFrom.y;
    const dl = Math.hypot(dxA, dyA) || 1;
    tx -= (dxA / dl) * 5 * k * recoil;
    ty -= (dyA / dl) * 5 * k * recoil;
  }
  if (fx.cfg.effects.lean) tx -= fx.lean * 8 * k;
  ctx.translate(tx, ty);
  if (recoil > 0 && input.recoilTo) {
    const sc = 1 + 0.03 * recoil;
    ctx.translate(input.recoilTo.x, input.recoilTo.y);
    ctx.scale(sc, sc);
    ctx.translate(-input.recoilTo.x, -input.recoilTo.y);
  }
  if (fx.cfg.effects.lean && Math.abs(fx.lean) > 0.001) {
    const pivot = input.leanPivot ?? { x: w / 2, y: h * 0.75 };
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(fx.lean * 0.045);
    ctx.translate(-pivot.x, -pivot.y);
  }
}

export function endCameraFx(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}

// ── ambient draws ────────────────────────────────────────────────────────
export function drawMotes(ctx: CanvasRenderingContext2D, fx: PageFx, _view: PageFxView): void {
  if (!fx.motes.length) return;
  ctx.fillStyle = "rgb(226,200,160)";
  for (const mo of fx.motes) {
    ctx.globalAlpha = 0.14 * Math.sin(Math.PI * Math.min(1, mo.life / mo.max));
    ctx.beginPath();
    ctx.arc(mo.x, mo.y, mo.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawStreaks(ctx: CanvasRenderingContext2D, fx: PageFx, view: PageFxView): void {
  if (!fx.streaks.length) return;
  ctx.lineCap = "round";
  for (const st of fx.streaks) {
    const f = Math.max(0, Math.min(1, st.life / st.max));
    ctx.strokeStyle = `rgba(255,226,188,${0.16 * f})`;
    ctx.lineWidth = 1.3 * view.k;
    const vl = Math.hypot(st.vx, st.vy) || 1;
    ctx.beginPath();
    ctx.moveTo(st.x, st.y);
    ctx.lineTo(st.x - (st.vx / vl) * st.len, st.y - (st.vy / vl) * st.len);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

/** The district/wave/milestone flourish: a gold (celebrateColor) double ring
 * expanding from centre-ish, plus the confetti burst. No-ops under reduced
 * motion (the ring is pure motion; the caller never needs its own guard). */
export function drawCheer(ctx: CanvasRenderingContext2D, fx: PageFx, view: PageFxView): void {
  if (fx.cfg.reducedMotion) return;
  const { w, h, k } = view;
  if (fx.cheerT > 0) {
    const g = 1 - fx.cheerT / 0.9;
    ctx.save();
    ctx.globalAlpha = Math.min(1, fx.cheerT * 1.6);
    ctx.strokeStyle = fx.cfg.celebrateColor;
    for (const mul of [1, 0.66]) {
      ctx.lineWidth = 2.2 * k * mul;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.4, (30 + g * 150 * mul) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (fx.confetti.length) {
    for (const cf of fx.confetti) {
      ctx.globalAlpha = 0.85 * (1 - cf.life / cf.max);
      ctx.fillStyle = cf.r > 1.8 * k ? fx.cfg.celebrateColor : "#ffd98a";
      ctx.fillRect(cf.x - cf.r, cf.y - cf.r, cf.r * 2, cf.r * 2.4);
    }
    ctx.globalAlpha = 1;
  }
}

/** The letterboxed banner card with an entrance "pop" (scale kicks from
 * ~1.18x down to 1x over its first ~0.12s). Danger/alert tones are the
 * caller's own read of ITS banner text (this module does no string
 * matching); default reads in celebrateColor's gold family. */
export function drawBanner(ctx: CanvasRenderingContext2D, fx: PageFx, view: PageFxView): void {
  if (!fx.cfg.effects.banner || !fx.bannerTxt || !fx.bannerCache) return;
  const { w, h, k } = view;
  const b = fx.bannerCache;
  const isDanger = b.tone === "danger";
  const isAlert = b.tone === "alert";
  const age = Math.max(0, fx.lastClock - fx.bannerBorn);
  const pop = fx.cfg.reducedMotion ? 1 : 1 + Math.max(0, 0.18 - age * 1.5);
  const by = h * 0.4;
  const long = b.txt.length > 15;
  ctx.save();
  ctx.globalAlpha = Math.min(1, b.t * 2);
  ctx.fillStyle = "rgba(8,10,13,0.55)";
  ctx.fillRect(0, by - 30 * k, w, 44 * k);
  ctx.fillStyle = isDanger ? "rgba(255,138,138,0.6)" : isAlert ? "rgba(232,121,249,0.6)" : "rgba(240,179,64,0.55)";
  ctx.fillRect(0, by - 30 * k, w, 1.4 * k);
  ctx.fillRect(0, by + 14 * k - 1.4 * k, w, 1.4 * k);
  ctx.translate(w / 2, by);
  ctx.scale(pop, pop);
  ctx.textAlign = "center";
  ctx.fillStyle = isDanger ? "#ff8a8a" : isAlert ? "#f0abfc" : "#ffd98a";
  ctx.font = `800 ${long ? 19 : 24}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(b.txt, 0, 0);
  ctx.restore();
  ctx.textAlign = "left";
}
