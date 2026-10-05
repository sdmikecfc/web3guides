/**
 * THE LIGHT: the pass that turns a flat paper doll into a toy standing in a
 * lit room.
 *
 * WHY THIS FILE EXISTS. Every part is baked with its own shading and drawn
 * side on against a backplate, and the result is evenly lit, evenly sharp and
 * weightless. The concept art in art-src/bots/concept is none of those things:
 * `3-arena.png` has one warm key from behind and above, a rim on every edge, a
 * crowd melted into blur while the ring stays sharp, and both robots sitting
 * IN the mat on real contact shadows. Measured against that picture, most of
 * the distance is lighting, camera and shadow rather than the parts, and all
 * of it belongs here.
 *
 * IT IS ALL DRAW-ONLY. Nothing in this file is read by the fight engine, so a
 * replay hash cannot move because of it. The engine does not import _view.
 *
 * THE ART CONTRACT IT SERVES. The art director's rule is that parts are baked
 * NEUTRAL, with form shading only and no key, no rim and no cast shadow, and
 * that the scene supplies the light at runtime. That is what makes a robot
 * wearing four families read as one object instead of four cutouts, and it is
 * also what lets one arm be drawn once and mirrored, because the light is no
 * longer painted into the pixels. This file is the runtime half of that deal,
 * and it works on the current baked-in-light art too; it just has more to do
 * later, when the parts stop fighting it.
 */

import type { Container, Sprite } from "pixi.js";
import type { Pixi } from "@/app/s7/games/_shared/pixi";

/** a texture painted once on a 2D canvas, which is cheaper than any filter */
function paint(PIXI: Pixi, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (g) draw(g);
  return PIXI.Texture.from(cv);
}

export interface LightOpts {
  readonly simW: number;
  readonly simH: number;
  /** the y the robots stand on */
  readonly floorY: number;
  /** the mat, for the contact shadows to sit on */
  readonly pit: { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };
}

export interface LightHandle {
  /** ground a robot: call every frame with where its feet actually are */
  setContact(i: 0 | 1, x: number, y: number, spread: number, strength: number): void;
  /** the KO punch and the hit-stop brighten the key for a frame or two */
  flash(k: number): void;
  update(now: number): void;
}

/**
 * THE LAYERS UNDER THE ROBOTS: depth of field on the crowd, the warm key
 * bloom behind them, and the contact shadows they stand on.
 *
 * Call once, immediately after the backplate is in the display list, so these
 * land above it and below the bots.
 */
export function installUnderLight(
  PIXI: Pixi,
  cam: Container,
  back: Container,
  o: LightOpts,
  plate?: Sprite | null,
) {
  // ── depth of field, on the CROWD ONLY ───────────────────────────────────
  // The first cut blurred the whole backplate and softened the ring, the
  // ropes and the posts with it, which is the opposite of the reference:
  // `3-arena.png` melts the crowd and keeps the mat crisp, because that is
  // what a real lens does at that distance. The crowd and the ring are one
  // image, so the fix is a blurred COPY laid over the sharp original and
  // masked to the top of the frame. The original is never touched, so the
  // thing the robots stand on stays sharp.
  if (plate?.texture) {
    const soften: Sprite = new PIXI.Sprite(plate.texture);
    soften.position.copyFrom(plate.position);
    soften.scale.copyFrom(plate.scale);
    soften.filters = [new PIXI.BlurFilter({ strength: 3, quality: 2 })];
    const band: Sprite = new PIXI.Sprite(
      paint(PIXI, 8, 256, (g) => {
        const l = g.createLinearGradient(0, 0, 0, 256);
        l.addColorStop(0, "rgba(255,255,255,1)");
        l.addColorStop(0.24, "rgba(255,255,255,1)");
        l.addColorStop(0.47, "rgba(255,255,255,0)");
        l.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = l;
        g.fillRect(0, 0, 8, 256);
      }),
    );
    band.width = o.simW;
    band.height = o.simH;
    soften.mask = band;
    back.addChild(soften, band);
  }

  // ── the key bloom, behind and above ─────────────────────────────────────
  const bloom: Sprite = new PIXI.Sprite(
    paint(PIXI, 512, 512, (g) => {
      const r = g.createRadialGradient(256, 256, 10, 256, 256, 256);
      r.addColorStop(0, "rgba(255,208,146,0.20)");
      r.addColorStop(0.45, "rgba(255,186,110,0.08)");
      r.addColorStop(1, "rgba(255,170,90,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 512, 512);
    }),
  );
  bloom.anchor.set(0.5);
  bloom.position.set(o.simW / 2, o.simH * 0.06);
  bloom.width = o.simW * 1.15;
  bloom.height = o.simH * 0.8;
  bloom.blendMode = "add";
  cam.addChild(bloom);

  // ── contact shadows ─────────────────────────────────────────────────────
  // Two soft ellipses on the mat. This is the cheapest weight in the game: a
  // robot with no shadow floats no matter how well it is drawn.
  const soft = paint(PIXI, 256, 128, (g) => {
    const r = g.createRadialGradient(128, 64, 4, 128, 64, 124);
    r.addColorStop(0, "rgba(24,14,10,0.86)");
    r.addColorStop(0.55, "rgba(24,14,10,0.34)");
    r.addColorStop(1, "rgba(24,14,10,0)");
    g.fillStyle = r;
    g.beginPath();
    g.ellipse(128, 64, 128, 64, 0, 0, Math.PI * 2);
    g.fill();
  });
  const shadows: [Sprite, Sprite] = [new PIXI.Sprite(soft), new PIXI.Sprite(soft)];
  for (const s of shadows) {
    s.anchor.set(0.5);
    s.blendMode = "multiply";
    s.alpha = 0.9;
    cam.addChild(s);
  }

  // a warm bounce off the lit mat, so the robots' undersides are not dead
  const bounce: Sprite = new PIXI.Sprite(
    paint(PIXI, 256, 128, (g) => {
      const r = g.createRadialGradient(128, 64, 4, 128, 64, 124);
      r.addColorStop(0, "rgba(255,190,130,0.5)");
      r.addColorStop(1, "rgba(255,190,130,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 256, 128);
    }),
  );
  bounce.anchor.set(0.5);
  bounce.position.set(o.pit.cx, o.pit.cy + 26);
  bounce.width = o.pit.rx * 2.1;
  bounce.height = o.pit.ry * 2.2;
  bounce.blendMode = "add";
  bounce.alpha = 0.16;
  cam.addChild(bounce);

  return { bloom, shadows };
}

/**
 * THE LAYERS OVER EVERYTHING: the warm grade and the vignette that pull the
 * whole frame into one exposure. Call once, last, after the bots and the
 * overlays are in.
 */
export function installOverLight(PIXI: Pixi, cam: Container, o: LightOpts) {
  // a warm wash, strongest at the top where the key is
  const grade: Sprite = new PIXI.Sprite(
    paint(PIXI, 64, 256, (g) => {
      const l = g.createLinearGradient(0, 0, 0, 256);
      l.addColorStop(0, "rgba(255,196,132,0.06)");
      l.addColorStop(0.55, "rgba(255,178,120,0.025)");
      l.addColorStop(1, "rgba(120,80,60,0.02)");
      g.fillStyle = l;
      g.fillRect(0, 0, 64, 256);
    }),
  );
  grade.width = o.simW;
  grade.height = o.simH;
  grade.blendMode = "add";
  cam.addChild(grade);

  // the vignette: the corners fall away so the eye goes to the mat
  const vig: Sprite = new PIXI.Sprite(
    paint(PIXI, 512, 288, (g) => {
      const r = g.createRadialGradient(256, 150, 60, 256, 150, 300);
      r.addColorStop(0, "rgba(10,7,6,0)");
      r.addColorStop(0.62, "rgba(10,7,6,0.10)");
      r.addColorStop(1, "rgba(10,7,6,0.32)");
      g.fillStyle = r;
      g.fillRect(0, 0, 512, 288);
    }),
  );
  vig.width = o.simW;
  vig.height = o.simH;
  cam.addChild(vig);

  return { grade, vig };
}

/**
 * Wire the two halves into one handle the scene can drive per frame.
 * `under` and `over` come from the two installers above.
 */
export function lightHandle(
  under: ReturnType<typeof installUnderLight>,
  over: ReturnType<typeof installOverLight>,
  o: LightOpts,
): LightHandle {
  let flashK = 0;
  const baseBloom = under.bloom.alpha;
  const baseGrade = over.grade.alpha;
  return {
    setContact(i, x, y, spread, strength) {
      const s = under.shadows[i];
      if (!s) return;
      s.position.set(x, y);
      // a shadow spreads and fades as the thing casting it leaves the ground
      s.width = 210 * spread;
      s.height = 62 * spread;
      s.alpha = Math.max(0, Math.min(1, strength));
    },
    flash(k) {
      flashK = Math.max(flashK, k);
    },
    update() {
      flashK *= 0.86;
      if (flashK < 0.004) flashK = 0;
      under.bloom.alpha = baseBloom * (1 + flashK * 0.9);
      over.grade.alpha = baseGrade * (1 + flashK * 0.6);
    },
  };
}
