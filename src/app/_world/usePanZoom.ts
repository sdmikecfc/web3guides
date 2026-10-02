"use client";
/**
 * THE WORLD CAMERA — pan, zoom, pinch and fly-to for the map surface.
 * Season-agnostic engine code: it knows about a box with an aspect ratio and
 * nothing else. No dependencies (the repo has none for this and does not want
 * one; ADR-0075 already bans three.js).
 *
 * THE ONE DECISION THAT MATTERS: the camera lives in a REF, never in React
 * state, and every frame writes `worldEl.style.transform` directly. A 60 Hz
 * setState would re-render the whole site tree on every wheel tick and thrash
 * on a phone. The ONLY value that reaches React is `zoomBucket`, which changes
 * about three times across a full zoom sweep and exists purely so labels can
 * declutter.
 *
 * COVER, NEVER LETTERBOX. baseW = max(vw, vh * aspect) with min zoom 1, so the
 * world always fills the viewport in both axes. That single choice makes the
 * clamp total: there is no camera position from which you can see past the
 * edge of the world, so no void, no bars, no empty gutter, on any screen. On a
 * phone you see roughly a third of the board at once, which is exactly how
 * Mario Party and the HoMM adventure map behave there.
 *
 * TWO BROWSER TRAPS this deliberately avoids:
 *  1. React's onWheel is PASSIVE, so preventDefault() silently no-ops and the
 *     page scrolls behind your zoom. The listener is attached by hand with
 *     { passive: false }.
 *  2. A trackpad pinch arrives as ctrl+wheel, not as a touch gesture, so it
 *     needs its own branch or laptop users get no pinch at all.
 *
 * Momentum/inertia is deliberately OUT: ~40 lines that fight the clamp, and
 * the Places dock (WorldViewport) already covers "get me across the map fast".
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type Camera = { x: number; y: number; k: number };

export type PanZoomOpts = {
  viewportRef: React.RefObject<HTMLElement | null>;
  worldRef: React.RefObject<HTMLElement | null>;
  aspect: number;
  minK?: number;
  maxK?: number;
  /** Where the camera opens, normalized. Defaults to the middle. */
  initial?: { x: number; y: number; k?: number };
};

export type PanZoom = {
  /** 0 = zoomed out, 1 = mid, 2 = close. The only React-visible camera value. */
  zoomBucket: 0 | 1 | 2;
  /** Centre the camera on a normalized world point, optionally at a new zoom. */
  flyTo: (nx: number, ny: number, k?: number) => void;
  /** Zoom about the viewport centre (the +/- buttons and keyboard). */
  zoomBy: (factor: number) => void;
  /** Shift the camera by a pixel delta (keyboard arrows). Clamped like
   * everything else, so it can be called freely without bounds checks. */
  panBy: (dx: number, dy: number) => void;
  reset: () => void;
  /** True while a drag is actually moving, so click handlers can ignore the
   * pointerup that ends a pan instead of opening a popup under the finger. */
  draggingRef: React.RefObject<boolean>;
  /** Live camera scale. A ref, not state, so per-frame consumers (the alive
   * layer thins its particles as you zoom in) can read it without causing a
   * single React render. */
  scaleRef: React.RefObject<number>;
};

const TWEEN_MS = 420;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function bucketFor(k: number): 0 | 1 | 2 {
  if (k < 1.4) return 0;
  if (k < 2.2) return 1;
  return 2;
}

export function usePanZoom({
  viewportRef,
  worldRef,
  aspect,
  minK = 1,
  maxK = 3.2,
  initial,
}: PanZoomOpts): PanZoom {
  const cam = useRef<Camera>({ x: 0, y: 0, k: minK });
  // Viewport + derived world box in CSS px. Recomputed on every resize.
  const box = useRef({ vw: 0, vh: 0, baseW: 0, baseH: 0 });
  const draggingRef = useRef(false);
  /** Has the opening camera been seated yet? See measure(). */
  const placed = useRef(false);
  /** Mirror of cam.k for per-frame consumers outside React. */
  const scaleRef = useRef(initial?.k ?? minK);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** Where each pointer went DOWN. Drag distance is measured from here, never
   * from the previous move event: a slow drag arrives as many sub-slop deltas
   * and a decisive click as one large one, so per-event deltas get it exactly
   * backwards. */
  const origin = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const tween = useRef(0);
  const [zoomBucket, setZoomBucket] = useState<0 | 1 | 2>(bucketFor(initial?.k ?? minK));
  const bucketRef = useRef(zoomBucket);

  /** Keep the camera inside the world. Runs after EVERY mutation, including
   * fly-to and resize, so no code path can leave it out of bounds. */
  const clamp = useCallback(() => {
    const c = cam.current;
    const b = box.current;
    c.k = Math.max(minK, Math.min(maxK, c.k));
    const W = b.baseW * c.k;
    const H = b.baseH * c.k;
    // W >= vw and H >= vh always hold (cover + minK 1), so these are real
    // ranges, never inverted. The Math.min guards the first paint, when the
    // box is still 0x0 and both bounds collapse to 0.
    c.x = Math.min(0, Math.max(b.vw - W, c.x));
    c.y = Math.min(0, Math.max(b.vh - H, c.y));
  }, [minK, maxK]);

  /** Push the camera to the DOM. One style write, no React involved. */
  const apply = useCallback(() => {
    const el = worldRef.current;
    if (!el) return;
    const c = cam.current;
    el.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.k})`;
    // Labels multiply by this to hold a constant on-screen size while the
    // buildings under them grow. Written in the same pass as the transform so
    // text can never lag the art by a frame.
    el.style.setProperty("--wm-inv", String(1 / c.k));
    scaleRef.current = c.k;
    const nb = bucketFor(c.k);
    if (nb !== bucketRef.current) {
      bucketRef.current = nb;
      setZoomBucket(nb);
    }
  }, [worldRef]);

  /** Recompute the world box from the viewport and re-seat the camera. */
  const measure = useCallback(() => {
    const vp = viewportRef.current;
    const el = worldRef.current;
    if (!vp || !el) return;
    const r = vp.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const b = box.current;
    const prev = { baseW: b.baseW, baseH: b.baseH };
    b.vw = r.width;
    b.vh = r.height;
    b.baseW = Math.max(r.width, r.height * aspect);
    b.baseH = b.baseW / aspect;
    el.style.width = `${b.baseW}px`;
    el.style.height = `${b.baseH}px`;

    if (!placed.current) {
      // FIRST VALID MEASUREMENT owns the opening camera.
      //
      // It cannot be done in the mount effect, which is the obvious place and
      // is wrong: the viewport's stylesheet is injected by this component, so
      // on the very first commit the element is still an unstyled block whose
      // children are all absolutely positioned — height 0. measure() correctly
      // refuses to work with that, which means a flyTo() fired alongside it
      // silently bails too, and the opening position is lost. The camera then
      // lands at the clamped identity when the ResizeObserver fires, which is
      // the top-left corner rather than the player's own base.
      //
      // Seating it here instead means whichever measurement first sees a real
      // box places the camera. No tween: the opening view should already be
      // correct on the first painted frame, not slide into place.
      placed.current = true;
      const k0 = Math.max(minK, Math.min(maxK, initial?.k ?? minK));
      const nx = initial?.x ?? 0.5;
      const ny = initial?.y ?? 0.5;
      cam.current = {
        k: k0,
        x: b.vw / 2 - nx * b.baseW * k0,
        y: b.vh / 2 - ny * b.baseH * k0,
      };
    } else if (prev.baseW > 0 && prev.baseH > 0) {
      // Hold the centred world point across a resize/rotate instead of letting
      // the camera jump to a corner.
      const c = cam.current;
      const cxN = (-c.x + b.vw / 2) / (prev.baseW * c.k);
      const cyN = (-c.y + b.vh / 2) / (prev.baseH * c.k);
      c.x = b.vw / 2 - cxN * b.baseW * c.k;
      c.y = b.vh / 2 - cyN * b.baseH * c.k;
    }
    clamp();
    apply();
  }, [viewportRef, worldRef, aspect, clamp, apply, initial, minK, maxK]);

  /** Zoom about a point given in VIEWPORT coordinates, keeping that point
   * pinned under the cursor/fingers. */
  const zoomAbout = useCallback(
    (nextK: number, px: number, py: number) => {
      const c = cam.current;
      const k2 = Math.max(minK, Math.min(maxK, nextK));
      if (k2 === c.k) return;
      const ratio = k2 / c.k;
      c.x = px - (px - c.x) * ratio;
      c.y = py - (py - c.y) * ratio;
      c.k = k2;
      clamp();
      apply();
    },
    [minK, maxK, clamp, apply],
  );

  const flyTo = useCallback(
    (nx: number, ny: number, k?: number) => {
      const b = box.current;
      if (b.baseW < 2) return;
      cancelAnimationFrame(tween.current);
      const from = { ...cam.current };
      const k2 = Math.max(minK, Math.min(maxK, k ?? cam.current.k));
      // Target camera that puts the normalized point at the viewport centre,
      // then clamped through the same path as everything else.
      const want = {
        x: b.vw / 2 - nx * b.baseW * k2,
        y: b.vh / 2 - ny * b.baseH * k2,
        k: k2,
      };
      const saved = { ...cam.current };
      cam.current = want;
      clamp();
      const to = { ...cam.current };
      cam.current = saved;

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        cam.current = to;
        apply();
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / TWEEN_MS);
        const e = easeOutCubic(t);
        cam.current = {
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          k: from.k + (to.k - from.k) * e,
        };
        apply();
        if (t < 1) tween.current = requestAnimationFrame(step);
      };
      tween.current = requestAnimationFrame(step);
    },
    [minK, maxK, clamp, apply],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const b = box.current;
      zoomAbout(cam.current.k * factor, b.vw / 2, b.vh / 2);
    },
    [zoomAbout],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      cancelAnimationFrame(tween.current);
      cam.current.x -= dx;
      cam.current.y -= dy;
      clamp();
      apply();
    },
    [clamp, apply],
  );

  const reset = useCallback(() => {
    flyTo(initial?.x ?? 0.5, initial?.y ?? 0.5, initial?.k ?? minK);
  }, [flyTo, initial, minK]);

  // ── Wire the DOM. One effect owns every listener so cleanup cannot drift. ──
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    // The opening camera is seated inside measure(), by whichever measurement
    // first sees a real box — NOT here. See the comment in measure().
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(vp);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // only works because passive:false, see the header
      const r = vp.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      // A trackpad pinch is ctrl+wheel with small deltas; a mouse wheel is
      // coarse. Same maths, different sensitivity, so both feel right.
      const scale = e.ctrlKey ? 0.01 : 0.0015;
      cancelAnimationFrame(tween.current);
      zoomAbout(cam.current.k * Math.exp(-e.deltaY * scale), px, py);
    };

    const onDown = (e: PointerEvent) => {
      // Let real controls (buttons, links) keep their own gestures.
      if ((e.target as HTMLElement)?.closest?.("[data-wm-nodrag]")) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      origin.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // ALWAYS clear on a fresh press, not only when exactly one pointer is
      // live. A missed pointerup leaves a stale entry, size never returns to
      // 1, the flag stays true and EVERY later click is swallowed - the map
      // becomes permanently unclickable with nothing visibly wrong.
      draggingRef.current = false;
      if (pointers.current.size === 1) {
        // POINTER CAPTURE IS DEFERRED UNTIL A DRAG ACTUALLY STARTS.
        //
        // Capturing on pointerdown retargets every later pointer event to the
        // viewport, so pointerup never reaches the button that was pressed and
        // the browser never synthesises a click on it. Every building on the
        // map became unclickable with a real mouse, while synthetic
        // PointerEvents in a test kept working - they do not trigger capture -
        // which is exactly why this survived verification twice.
        //
        // Panning does not need capture before it begins: the listeners are on
        // the viewport and the pointer is inside it by definition. Capture is
        // taken in onMove the moment the slop threshold is crossed, which is
        // the only time it earns its keep (keeping a fast drag alive if the
        // cursor leaves the element).
        cancelAnimationFrame(tween.current);
      } else if (pointers.current.size === 2) {
        // Array.from, not spread: the repo's tsconfig target predates
        // downlevelIteration, so [...map.values()] is a compile error.
        const [a, b] = Array.from(pointers.current.values());
        pinch.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
        };
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      const next = { x: e.clientX, y: e.clientY };
      pointers.current.set(e.pointerId, next);

      if (pointers.current.size >= 2 && pinch.current) {
        const [a, b] = Array.from(pointers.current.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const r = vp.getBoundingClientRect();
        const p = pinch.current;
        if (p.dist > 0) {
          // Translate by the midpoint drift first so a two-finger pan works,
          // then scale about the midpoint.
          cam.current.x += mx - p.mx;
          cam.current.y += my - p.my;
          zoomAbout(cam.current.k * (dist / p.dist), mx - r.left, my - r.top);
        }
        pinch.current = { dist, mx, my };
        draggingRef.current = true;
        return;
      }

      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      // Slop is measured from the PRESS POINT and is generous enough to
      // survive the hand-jitter of an ordinary mouse click.
      const from = origin.current.get(e.pointerId) ?? prev;
      if (!draggingRef.current &&
          Math.hypot(next.x - from.x, next.y - from.y) < 8) return;
      if (!draggingRef.current) {
        // Now it is a drag, so hold the pointer even if it leaves the viewport.
        try {
          vp.setPointerCapture(e.pointerId);
        } catch {
          // A pointer that already ended cannot be captured; panning still
          // works without it, so this must never break the gesture.
        }
      }
      draggingRef.current = true;
      cam.current.x += dx;
      cam.current.y += dy;
      clamp();
      apply();
    };

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      origin.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) {
        // Cleared on the NEXT frame so the click that follows this pointerup
        // can still see that a drag happened and suppress itself.
        requestAnimationFrame(() => {
          draggingRef.current = false;
        });
      }
    };

    vp.addEventListener("wheel", onWheel, { passive: false });
    vp.addEventListener("pointerdown", onDown);
    vp.addEventListener("pointermove", onMove);
    vp.addEventListener("pointerup", onUp);
    vp.addEventListener("pointercancel", onUp);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(tween.current);
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("pointerdown", onDown);
      vp.removeEventListener("pointermove", onMove);
      vp.removeEventListener("pointerup", onUp);
      vp.removeEventListener("pointercancel", onUp);
    };
    // Mount-only: every dep here is a stable useCallback and re-running this
    // would tear down and rebuild all five listeners on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { zoomBucket, flyTo, zoomBy, panBy, reset, draggingRef, scaleRef };
}
