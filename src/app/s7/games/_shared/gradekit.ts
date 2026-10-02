/**
 * GRADEKIT (S7, the beauty-panel law) - the one cheap finishing pass that
 * makes four differently-generated art sets read as ONE graded product:
 *
 *   1. shadow tint   - fullscreen "multiply" fill (~0.15 alpha), cool hue
 *   2. highlight     - fullscreen "lighter" fill (~0.06 alpha), warm hue
 *   3. vignette      - radial darkening, baked ONCE per canvas size
 *   4. film grain    - one 128px seeded noise tile, baked once, tiled at
 *                      0.04-0.06 alpha with a per-frame integer offset
 *
 * ~6 draw calls per frame, zero download bytes. Hues are per-game config so
 * each game keeps its own mood inside the same grade language.
 *
 * LAWS: this module never touches sim state or sim RNG - the grain offset
 * runs on its own tiny LCG (page-fx stream), so tapes stay byte-identical
 * with the grade on or off. Client-only: everything is lazily created on
 * first apply, nothing runs at import time (SSR-safe).
 */

export interface GradeConfig {
  /** multiply-composited shadow hue, e.g. "#1a2340" for a cold dungeon */
  shadowTint: string;
  shadowAlpha: number; // ~0.10-0.18
  /** lighter-composited warm lift, e.g. "#ffb45c" */
  warmTint: string;
  warmAlpha: number; // ~0.04-0.08
  vignetteAlpha: number; // ~0.30-0.40
  grainAlpha: number; // 0.04-0.06; 0 disables
  /** freeze the grain offset (reduced-motion; also any parked renderer) */
  staticGrain?: boolean;
}

export interface Grade {
  /** Composite the grade over the world layer. Call LAST each frame, before
   * any DOM-space HUD. Cheap: two fills + two drawImages. */
  applyWorld(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  dispose(): void;
}

const GRAIN_SIZE = 128;

/** Tiny LCG for the grain jitter - deliberately NOT the sim PRNG family so
 * nobody ever "borrows" a sim stream for page effects (the fx-RNG split law
 * from the S6 kit). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeGrade(cfg: GradeConfig): Grade {
  let vignette: HTMLCanvasElement | null = null;
  let vigW = 0;
  let vigH = 0;
  let grain: HTMLCanvasElement | null = null;
  const jitter = lcg(0xf005ba11);

  function bakeVignette(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const r = Math.hypot(w, h) / 2;
    const grad = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${cfg.vignetteAlpha})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    return c;
  }

  function bakeGrain(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = GRAIN_SIZE;
    c.height = GRAIN_SIZE;
    const g = c.getContext("2d")!;
    const img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    const rnd = lcg(0x5eed6a1e); // fixed seed: the tile itself never changes
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 96 + Math.floor(rnd() * 64); // mid-grey noise, gentle
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  return {
    applyWorld(ctx, w, h) {
      const prevOp = ctx.globalCompositeOperation;
      const prevAlpha = ctx.globalAlpha;

      // 1. shadow depth (multiply)
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = cfg.shadowAlpha;
      ctx.fillStyle = cfg.shadowTint;
      ctx.fillRect(0, 0, w, h);

      // 2. warm lift (lighter)
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = cfg.warmAlpha;
      ctx.fillStyle = cfg.warmTint;
      ctx.fillRect(0, 0, w, h);

      // 3. vignette (source-over, baked)
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (!vignette || vigW !== w || vigH !== h) {
        vignette = bakeVignette(w, h);
        vigW = w;
        vigH = h;
      }
      ctx.drawImage(vignette, 0, 0);

      // 4. grain (overlay-ish via low-alpha source-over of mid-grey noise)
      if (cfg.grainAlpha > 0) {
        if (!grain) grain = bakeGrain();
        const ox = cfg.staticGrain ? 0 : Math.floor(jitter() * GRAIN_SIZE);
        const oy = cfg.staticGrain ? 0 : Math.floor(jitter() * GRAIN_SIZE);
        ctx.globalAlpha = cfg.grainAlpha;
        for (let y = -oy; y < h; y += GRAIN_SIZE) {
          for (let x = -ox; x < w; x += GRAIN_SIZE) {
            ctx.drawImage(grain, x, y);
          }
        }
      }

      ctx.globalCompositeOperation = prevOp;
      ctx.globalAlpha = prevAlpha;
    },
    dispose() {
      vignette = null;
      grain = null;
    },
  };
}

/** Per-game grade presets (the class-palette law keeps hues coherent):
 * cold dungeons with a candle-warm lift, HORDE slightly bloodier, ASCENT
 * brightening as the tower climbs is handled by the client swapping cfg. */
export const GRADES: Record<string, GradeConfig> = {
  gauntlet: { shadowTint: "#1a2340", shadowAlpha: 0.14, warmTint: "#ffb45c", warmAlpha: 0.05, vignetteAlpha: 0.38, grainAlpha: 0.05 },
  horde:    { shadowTint: "#241a2e", shadowAlpha: 0.13, warmTint: "#ff9a4d", warmAlpha: 0.06, vignetteAlpha: 0.34, grainAlpha: 0.05 },
  crypt:    { shadowTint: "#141c2b", shadowAlpha: 0.16, warmTint: "#ffae66", warmAlpha: 0.06, vignetteAlpha: 0.40, grainAlpha: 0.06 },
  ascent:   { shadowTint: "#1c2236", shadowAlpha: 0.12, warmTint: "#ffd27a", warmAlpha: 0.05, vignetteAlpha: 0.32, grainAlpha: 0.04 },
};
