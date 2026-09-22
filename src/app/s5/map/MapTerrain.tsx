"use client";
/**
 * THE GROUND THE SIEGE HAPPENS ON (/s5/map).
 *
 * Mike, 2026-07-28: "There is no actual map, its just bunkers with dashed
 * lines." He was right: the field was a CSS wash plus three decorative contour
 * blobs, so eleven forts floated in a void. This paints an actual zoomed-out
 * RTS battlefield underneath them.
 *
 * Canvas, not hand-authored SVG paths: this is generative terrain, and a
 * seeded height field is both far shorter and far better looking than a
 * thousand hand-placed beziers.
 *
 * WHAT IT DRAWS, in order (all from one deterministic height field):
 *   1. a base wash from the height field, cold steel in the lows, warmer
 *      gunmetal on the highs;
 *   2. HILL SHADING from the field's gradient with a north-west light, which
 *      is what actually makes it read as ground rather than noise;
 *   3. CONTOUR LINES on fixed elevation steps (the military-map signature);
 *   4. WATER pooled below a threshold, with a lighter shoreline;
 *   5. FOREST stipple in a mid-elevation band;
 *   6. a slow ROAD following a low-elevation path across the field;
 *   7. a faint survey grid and a vignette to seat it all.
 *
 * DISCIPLINE (ADR-0008: decoration must never compete with state). Every layer
 * is deliberately low-contrast and lives under the node chips. The whole thing
 * is capped at TERRAIN_ALPHA so a stronghold ring, its percent arc and its
 * label always win the one-second parse. Deterministic (fixed seed): the same
 * battlefield for every player, every load, no hydration risk since it paints
 * after mount.
 */
import { useEffect, useRef } from "react";

/** One global opacity so the whole field can be dialled back in one place.
 * Mike, 2026-07-28: "the map is still black or so dark I can't tell whats
 * going on." It was: the raw noise field sat almost entirely BELOW the water
 * threshold, so the whole stage painted as flat standing water, then got
 * halved again by this alpha. The field is now normalized to its own range
 * (below) so relief always uses the full ramp whatever the hash produces. */
const TERRAIN_ALPHA = 0.92;
const SEED = 20260728;

/** Deterministic value noise: hash -> lattice -> smooth interpolation. */
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = x * 374761393 + y * 668265263 + seed * 69069;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
  /** Fractal sum: a few octaves is all a readable relief needs. */
  return (x: number, y: number) => {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += value(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.05;
    }
    return sum / norm;
  };
}

export function MapTerrain({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let raf = 0;

    const paint = () => {
      const parent = cv.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      // Half-resolution buffer, scaled up: the terrain is deliberately soft, so
      // this halves the paint cost and costs nothing visible.
      const dpr = Math.min(2, window.devicePixelRatio || 1) * 0.5;
      const w = Math.max(2, Math.round(rect.width * dpr));
      const h = Math.max(2, Math.round(rect.height * dpr));
      cv.width = w;
      cv.height = h;
      cv.style.width = "100%";
      cv.style.height = "100%";
      const ctx = cv.getContext("2d");
      if (!ctx) return;

      const noise = makeNoise(SEED);
      const SCALE = 3.2; // field features per stage width
      const img = ctx.createImageData(w, h);
      const px = img.data;

      // Sample the height field once into a buffer so shading can read
      // neighbours without recomputing the (relatively costly) fractal.
      const H = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          H[y * w + x] = noise((x / w) * SCALE, (y / h) * SCALE * 0.62);
        }
      }

      // NORMALIZE to the field's own min/max. Value noise summed over octaves
      // clusters hard around its mean, so fixed thresholds either flood the
      // map or never trigger. Rescaling guarantees the full ramp is used.
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < H.length; i++) {
        if (H[i] < lo) lo = H[i];
        if (H[i] > hi) hi = H[i];
      }
      const span = hi - lo || 1;
      for (let i = 0; i < H.length; i++) H[i] = (H[i] - lo) / span;

      // Water is an ACCENT (a river and a couple of pools), not the ground.
      const WATER = 0.26;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const e = H[i];

          // Hill shading: gradient against a north-west light. This is what
          // makes it read as GROUND rather than noise, so it carries weight.
          const xr = Math.min(w - 1, x + 1), yd = Math.min(h - 1, y + 1);
          const dx = H[y * w + xr] - e;
          const dy = H[yd * w + x] - e;
          const light = Math.max(-1, Math.min(1, (-dx - dy) * 30));

          // Base ramp: cold clay low ground warming into dry olive highs.
          // Ceiling stays under ~110 so white node labels always win the parse.
          const t = Math.max(0, Math.min(1, (e - WATER) / (1 - WATER)));
          let r = 38 + t * 54;
          let g = 43 + t * 52;
          let b = 44 + t * 38;

          if (e < WATER) {
            // Standing water: colder, flatter, clearly blue against the clay.
            const d = (WATER - e) / WATER;
            r = 26 - d * 6;
            g = 42 - d * 8;
            b = 62 - d * 6;
          } else {
            r += light * 30;
            g += light * 30;
            b += light * 27;
          }

          // Contour lines on fixed elevation steps: the military-map signature.
          const band = (e % 0.07) / 0.07;
          if (e >= WATER && band < 0.10) {
            r += 20; g += 21; b += 18;
          }

          // Forest stipple in the mid band, dithered so it reads as texture.
          if (e > 0.46 && e < 0.68 && ((x * 7 + y * 13) % 9 === 0)) {
            r -= 13; g -= 6; b -= 12;
          }

          const o = i * 4;
          px[o] = Math.max(0, Math.min(255, r));
          px[o + 1] = Math.max(0, Math.min(255, g));
          px[o + 2] = Math.max(0, Math.min(255, b));
          px[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      // Shoreline: one pass marking the water boundary, drawn over the raster.
      ctx.save();
      ctx.strokeStyle = "rgba(150,186,214,0.38)";
      ctx.lineWidth = Math.max(1, dpr);
      for (let y = 2; y < h - 2; y += 2) {
        for (let x = 2; x < w - 2; x += 2) {
          const e = H[y * w + x];
          if (e < WATER && H[y * w + x + 2] >= WATER) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 2, y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // A supply road: walks left to right, always stepping to the lowest
      // neighbour ahead, so it naturally follows valleys like a real one.
      ctx.save();
      ctx.strokeStyle = "rgba(206,180,138,0.45)";
      ctx.lineWidth = Math.max(1.6, 3 * dpr);
      ctx.setLineDash([]);
      ctx.beginPath();
      let ry = Math.round(h * 0.63);
      ctx.moveTo(0, ry);
      for (let x = 0; x < w; x += 3) {
        let best = ry, bestE = Infinity;
        for (let dyi = -2; dyi <= 2; dyi++) {
          const yy = Math.max(1, Math.min(h - 2, ry + dyi));
          const e = H[yy * w + Math.min(w - 1, x + 3)];
          if (e < bestE) { bestE = e; best = yy; }
        }
        ry = best;
        ctx.lineTo(x, ry);
      }
      ctx.stroke();
      ctx.restore();

      // Vignette: darkens the rim so the lit centre carries the eye and the
      // brighter ground never fights the panels around the stage.
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(4,6,9,0.62)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    };

    paint();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    });
    if (cv.parentElement) ro.observe(cv.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, opacity: TERRAIN_ALPHA, pointerEvents: "none" }}
    />
  );
}
