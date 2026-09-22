/**
 * S5 shared sprite kit — the S4 highnoon img()/ready()/spr() helpers promoted
 * to a season-shared module (src/app/s4/games/highnoon/page.tsx:193-220 is the
 * donor), plus sprRot() for top-down hulls and loadManifest() for the
 * per-game painted-art folders under public/s5-art/games/<game>/.
 *
 * THE RULE IS TRY-IMAGE-ELSE-VECTOR, ALWAYS: every draw call keeps its
 * primitive fallback, so painted art lands asynchronously with zero code risk
 * and a missing or still-loading PNG can never break a game. Client-safe and
 * SSR-safe: img() returns null on the server and ready() treats null as
 * not-ready, which routes every draw to its fallback.
 *
 * Sprites are billboarded by WIDTH (`size`), aspect preserved from the PNG, so
 * nothing can render giant when an export's canvas padding changes (the S2
 * channel-run lesson).
 */

/** Kick off an image load. Null on the server; the browser caches by src. */
export function img(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const i = new Image();
  i.src = src;
  return i;
}

/** True only when the image is fully decoded and has real pixels. */
export function ready(i: HTMLImageElement | null): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}

/**
 * Draw a sprite centered at (x, y) at `size` px wide (aspect preserved), or
 * run the primitive fallback when the image is not ready.
 */
export function spr(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  fb: () => void,
): void {
  if (ready(im)) {
    const h = size * (im.naturalHeight / im.naturalWidth);
    ctx.drawImage(im, x - size / 2, y - h / 2, size, h);
  } else fb();
}

/**
 * spr() with a rotation (radians, about the sprite center). The top-down
 * games rotate hulls and foes; the fallback draws in the caller's own
 * transform space exactly as before.
 */
export function sprRot(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  rot: number,
  fb: () => void,
): void {
  if (ready(im)) {
    const h = size * (im.naturalHeight / im.naturalWidth);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(im, -size / 2, -h / 2, size, h);
    ctx.restore();
  } else fb();
}

/**
 * Load a named sprite set for one game: names resolve to
 * /s5-art/games/<game>/<name>.<ext>. Missing files simply never become ready()
 * and their draws stay on the vector fallback forever, so a slipped art batch
 * degrades that game to primitives and never blocks code.
 *
 * EXTENSION RULE (2026-07-25, ADR-0078): `bg-*` plates ship as **WebP**, every
 * other sprite as PNG. The plates are full-frame opaque paintings where WebP is
 * 85-95% smaller (12 plates: 21 MB of PNG -> ~3 MB), and having no alpha to
 * preserve makes the conversion lossless in practice. Keyed sprites stay PNG
 * because key-s5-games.js writes them through pngjs, so one write path stays
 * one format. Regenerate plates with their generator, then run
 * `python downscale-s5-bg.py` and `python webp-s5-bg.py`.
 */
export function loadManifest<N extends string>(
  game: string,
  names: readonly N[],
): Record<N, HTMLImageElement | null> {
  const out = {} as Record<N, HTMLImageElement | null>;
  for (const n of names) {
    // bg- plates and everything in a BAKED FOLDER (units/, bld/) are webp --
    // the rig's output is born webp; loose sprites remain the pngs the art
    // drops always were. A folder that ships webp and is not listed here
    // silently resolves to .png and every draw falls back to vectors, which is
    // exactly how Vanguard's whole building catalogue went missing in the
    // client while rendering fine offline (2026-08-02).
    const ext = n.startsWith("bg-") || n.startsWith("units/") || n.startsWith("bld/") || n.startsWith("scn/") ? "webp" : "png";
    out[n] = img(`/s5-art/games/${game}/${n}.${ext}`);
  }
  return out;
}

// ── S4 benchmark utilities, ported (2026-07-26, S5 quality pass phase 0) ───
// Three small, dependency-free canvas helpers promoted from the S4 games
// players loved most. `tryArt` (extraction/page.tsx:604) is DELIBERATELY NOT
// duplicated here: img()/ready()/spr() above already are that exact
// contract (try the image, fall back to the vector draw), just synchronous
// at draw time instead of callback-based — strictly the better fit for a
// per-frame canvas loop, so use those instead.

/**
 * The long baked shadow every billboarded entity casts (sun high to the
 * left). Ported verbatim from S4 highnoon (page.tsx:1130) — eight lines, the
 * cheapest depth cue in the franchise. Call it once per entity, BEFORE
 * drawing the entity itself, at the entity's own ground point (x, y); `r` is
 * the entity's own on-screen radius/half-width and `k` is the game's view
 * scale (every S5 sim exposes s.k = viewW/480).
 */
export function longShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k = 1): void {
  ctx.save();
  ctx.fillStyle = "rgba(35,18,8,0.28)";
  ctx.beginPath();
  ctx.ellipse(x + r * 1.05 * k, y + r * 0.5, r * 1.65 * k, r * 0.4, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** One spent-casing particle's initial kinematic state, ejected roughly
 * perpendicular to `facing` with a forward-kicked upward pop. Ported from S4
 * highnoon's casing() (page.tsx:332), generalized to a pure factory: the
 * original pushed straight into that game's own particle array and read its
 * own GOLD colour + PART_CAP, neither of which a shared module can assume,
 * so this version just returns the particle and leaves array/cap/colour/
 * gravity/removal to the caller's own particle system. Typical use:
 *
 *   const p = casing(x, y, facing, rng);
 *   myParticles.push({ ...p, color: GOLD });
 *   // each step: p.vy += GRAVITY*dt; p.x += p.vx*dt; p.y += p.vy*dt; p.life += dt;
 *   // remove when p.life >= p.maxLife (or p.y >= p.groundY, caller's choice)
 *
 * `rng` is an explicit parameter so a sim-reachable caller can pass a seeded
 * stream; NEVER pass Math.random into anything a sim can reach (page-only
 * cosmetic callers may pass Math.random freely).
 */
export interface CasingParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rv: number; // rotation velocity, rad/s
  groundY: number; // y at which the casing would settle
  life: number; // seconds elapsed; caller increments
  maxLife: number; // caller's removal threshold
}
export function casing(x: number, y: number, facing: number, rng: () => number): CasingParticle {
  const side = facing + Math.PI / 2 + (rng() - 0.5) * 0.5;
  return {
    x,
    y,
    vx: Math.cos(side) * (60 + rng() * 50),
    vy: -80 - rng() * 50,
    rot: rng() * 6.3,
    rv: 8 + rng() * 10,
    groundY: y + 14 + rng() * 10,
    life: 0,
    maxLife: 0.7 + rng() * 0.3,
  };
}

/**
 * Bake a small procedural texture on an offscreen canvas and hand back the
 * canvas element itself as a drawable source (ctx.drawImage accepts a
 * canvas directly, same as an image). Adapted from the S4 extraction
 * three.js helper of the same name (page.tsx:253), which returned a
 * THREE.CanvasTexture; S5 games render on 2D canvas (ADR-0075 bans three.js
 * here), so this version returns the HTMLCanvasElement instead — everything
 * else about it (bake once at setup time with your own `paint`, cache the
 * result, never call per-frame) carries over unchanged. SSR-safe: returns
 * null when `document` does not exist (mirrors img()'s server-side null);
 * call this from client-side setup code only (e.g. inside createSim), which
 * is the only place any S5 game ever needs a baked texture.
 */
export function canvasTex(
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (g) paint(g, w, h);
  return cv;
}

/**
 * Draw frame `frame` of a horizontal SPRITE STRIP (N square cells side by
 * side), rotated to `rot`, billboarded by width like sprRot. Same law as
 * every helper here: try-image-else-vector, so a strip that has not landed
 * (or never will) degrades to the drawn fallback and can never break a game.
 *
 * Strips come from the /dev/bake rig (see art-src/baked/strips/manifest.json):
 * square cells, nose pointing +x at rot 0, transparent ground, no baked
 * shadow. `frames` is caller-supplied rather than sniffed from the image so a
 * half-loaded image cannot flicker the cell width.
 */
export function stripRot(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | null,
  frames: number,
  frame: number,
  x: number,
  y: number,
  size: number,
  rot: number,
  fb: () => void,
): void {
  if (ready(im) && frames > 0) {
    const cell = im.naturalWidth / frames;
    const f = ((Math.floor(frame) % frames) + frames) % frames;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(im, f * cell, 0, cell, im.naturalHeight, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else fb();
}
