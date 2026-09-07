/**
 * THE S7 PIXI STAGE (ADR-0119): the one place a game touches pixi.js setup.
 * A game builds its scene inside `world`, which is a SIM-SPACE container:
 * everything added to it is positioned in sim pixels, and resize() letterboxes
 * that fixed space into the canvas's CSS box exactly the way fitCanvasToSim
 * does for the 2d games - same math, different owner.
 *
 * SSR-SAFE BY CONSTRUCTION: pixi.js touches `navigator` at module scope, so a
 * static import anywhere in a page's graph 500s the server render (found the
 * hard way on the first IRON JAW page load). The dynamic import below keeps
 * pixi client-only AND code-split per game page; consumers take constructors
 * from `stage.pixi` and use `import type` for signatures (types erase).
 *
 * Manual rendering on purpose: RunShell owns the rAF and the fixed-timestep
 * loop; the stage only paints when the scene's render says so. No shared
 * ticker, no autoStart, nothing animates that the sim did not cause.
 */
"use client";

import type { Application, Container } from "pixi.js";

export type Pixi = typeof import("pixi.js");

export interface PixiStage {
  app: Application;
  /** SIM-SPACE root: add scene children here, positioned in sim px. */
  world: Container;
  /** The loaded module: take Graphics/Text/etc constructors from here. */
  pixi: Pixi;
  resize: (cssW: number, cssH: number, dpr: number, simW: number, simH: number) => void;
  renderFrame: () => void;
  destroy: () => void;
}

export async function createPixiStage(
  canvas: HTMLCanvasElement,
  opts?: { background?: number },
): Promise<PixiStage> {
  const PIXI = await import("pixi.js");
  const app = new PIXI.Application();
  // THE FRAMING BUG, AND WHY autoDensity IS OFF (2026-08-14, Mike: "All the
  // games are not framed correctly"). With `autoDensity: true` Pixi writes its
  // own pixel size onto `canvas.style` on EVERY resize - and init() with no
  // width/height uses ViewSystem's defaults, 800x600. That inline style
  // clobbered RunShell's `width:100%;height:100%`, which React never restores
  // because the value never changes between renders. The result on every
  // viewport: an 800px canvas inside a 640px-capped arena box with
  // `overflow:hidden`, so the right ~20% of every game was clipped and a band
  // of box background sat below it. The ResizeObserver could not recover
  // either, because it watched the canvas - the very element Pixi was
  // resizing - so measurement and mutation chased each other to a fixed point.
  //
  // OFF, the element's size stays CSS's job (100% of the arena box) and
  // renderer.resize() only sizes the BACKING STORE. Crispness is unchanged:
  // resolution is set to the real dpr in resize() below.
  const rect0 = canvas.getBoundingClientRect();
  await app.init({
    canvas,
    width: Math.max(1, Math.round(rect0.width) || 360),
    height: Math.max(1, Math.round(rect0.height) || 480),
    autoStart: false,
    sharedTicker: false,
    antialias: true,
    background: opts?.background ?? 0x0c0e15,
    resolution: 1, // resize() sets the real dpr
    autoDensity: false,
  });
  const world = new PIXI.Container();
  app.stage.addChild(world);
  // non-destructive liveness marker: probing getContext("2d") to detect Pixi
  // CLAIMS the 2d context if it races the init and breaks WebGL (found the
  // hard way); anything checking "is Pixi on this canvas" reads this instead
  canvas.dataset.pixi = "1";
  let destroyed = false;
  return {
    app,
    world,
    pixi: PIXI,
    resize(cssW, cssH, dpr, simW, simH) {
      if (destroyed) return;
      app.renderer.resolution = dpr;
      app.renderer.resize(cssW, cssH);
      const scale = Math.min(cssW / simW, cssH / simH) || 1;
      world.scale.set(scale);
      world.position.set((cssW - simW * scale) / 2, (cssH - simH * scale) / 2);
    },
    renderFrame() {
      if (destroyed) return;
      app.render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // keep the canvas element itself: RunShell owns the DOM node.
      // texture: FALSE (leak audit 2026-08-17): true destroyed the GPU
      // textures still owned by the GLOBAL PIXI.Assets cache, so the next
      // mount of the same route got dead textures (silent blank art) and the
      // cache entries could never be released. Assets owns texture lifetime.
      app.destroy(false, { children: true, texture: false });
    },
  };
}
