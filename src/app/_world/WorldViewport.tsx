"use client";
/**
 * THE MAP SHELL — the full-screen stage everything else hangs off.
 *
 * Structure, and the reason for each layer:
 *
 *   .wm-viewport   fixed under the top nav, overflow hidden, touch-action none.
 *                  Owns the gesture. Nothing here scrolls.
 *     .wm-world    the transformed box. Sized in px by the camera, positioned
 *                  by translate+scale. EVERYTHING positional inside it is a
 *                  normalized fraction, so the same coordinates work on a
 *                  phone and an ultrawide.
 *       ground     CSS floor -> far plate -> near plate crossfade
 *       children   sites, canvas, decoration (render-prop, gets the camera)
 *     .wm-hud      absolute in the VIEWPORT, so it never scales or pans
 *     dock         the Places rail
 *
 * THE PLACES DOCK is doing three jobs with one component, which is why it
 * exists at all: it is the mobile navigation (no panning skill required), the
 * "I don't know where anything is" answer for a new player, and the
 * keyboard/screen-reader path to every destination. Tap once to fly there, tap
 * again to open it. It lives OUTSIDE the touch-action:none subtree or it would
 * lose native horizontal scrolling on a phone.
 *
 * Season-agnostic: it takes a WorldConfig and draws whatever that describes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePanZoom, type PanZoom } from "./usePanZoom";
import { WORLD_SPRITE_CSS } from "./WorldSprite";
import { MAP_POPUP_CSS } from "./MapPopup";
import { groundUrl, type Vec2, type WorldConfig } from "@/lib/world/types";

export type PlaceChip = {
  /** Chips in the same group sit together in the dock. A group marked
   *  collapsible folds behind a single count chip until pressed. */
  group?: string;
  key: string;
  label: string;
  pos: Vec2;
  accent: string;
  /** Zoom to use when flying here. Defaults to a comfortable close-up. */
  k?: number;
  onOpen: () => void;
};

export type WorldViewportProps = {
  config: WorldConfig;
  /** Where the camera opens. Usually the player's own base. */
  initial?: { x: number; y: number; k?: number };
  /** Rendered inside the transformed world; receives the live camera. */
  children: (pz: PanZoom) => React.ReactNode;
  /** Rendered in viewport space, never scaled (pool line, tickers, chips). */
  hud?: React.ReactNode;
  /** CSS for whatever the season put in `hud`, injected with the world's own. */
  extraCss?: string;
  places?: PlaceChip[];
  /** px of fixed chrome above the map. The S5 nav is 52. */
  topOffset?: number;
  /** Screen-reader name for the map region. */
  ariaLabel?: string;
  labels?: { zoomIn: string; zoomOut: string; reset: string; places: string };
};

const DEFAULT_LABELS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  reset: "Reset view",
  places: "Places",
};

export function WorldViewport({
  config,
  initial,
  children,
  hud,
  /** Extra CSS from the season's map (its own HUD widgets). */
  extraCss,
  places = [],
  topOffset = 52,
  ariaLabel = "World map",
  labels = DEFAULT_LABELS,
}: WorldViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const [nearReady, setNearReady] = useState(false);
  // Which dock chip is "armed": first tap flies, second tap opens.
  const [armed, setArmed] = useState<string | null>(null);

  // THE DOCK, ordered and foldable. Places first so the fixed destinations
  // never move under the player; the front folds behind a count because
  // eleven domain chips are what pushed this bar off the screen, and the
  // board already labels every one of them in place.
  const [showAll, setShowAll] = useState(false);
  const ordered = [...places].sort(
    (a, b) => (a.group === "target" ? 1 : 0) - (b.group === "target" ? 1 : 0),
  );
  const foldable = ordered.filter((c) => c.group === "target");
  const dockChips = showAll || foldable.length <= 3 ? ordered : ordered.filter((c) => c.group !== "target");
  const collapsedCount = ordered.length - dockChips.length;

  const pz = usePanZoom({
    viewportRef,
    worldRef,
    aspect: config.aspect,
    minK: config.zoom.min,
    maxK: config.zoom.max,
    initial,
  });

  const { flyTo, zoomBy, panBy, reset, zoomBucket } = pz;

  // Keyboard: the map is operable without a pointer. Every SITE is also a real
  // <button> inside the world (see WorldSprite), so Tab reaches destinations in
  // DOM order and their onFocus flies the camera to them — that is the
  // scroll-into-view equivalent for a transformed world.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const step = vp.clientWidth * 0.08;
      const nudge = (dx: number, dy: number) => {
        e.preventDefault();
        panBy(dx, dy);
      };
      switch (e.key) {
        case "ArrowLeft": return nudge(-step, 0);
        case "ArrowRight": return nudge(step, 0);
        case "ArrowUp": return nudge(0, -step);
        case "ArrowDown": return nudge(0, step);
        case "+": case "=": e.preventDefault(); return zoomBy(1.25);
        case "-": case "_": e.preventDefault(); return zoomBy(1 / 1.25);
        case "0": e.preventDefault(); return reset();
        case "Home":
          e.preventDefault();
          return initial ? flyTo(initial.x, initial.y, initial.k) : reset();
      }
    },
    [flyTo, zoomBy, panBy, reset, initial],
  );

  // Keep the world's zoom bucket on the DOM so label declutter is pure CSS.
  useEffect(() => {
    worldRef.current?.setAttribute("data-zoom", String(zoomBucket));
  }, [zoomBucket]);

  const far = groundUrl(config, config.ground.far);
  const near = groundUrl(config, config.ground.near);

  const tapChip = (c: PlaceChip) => {
    if (armed === c.key) {
      c.onOpen();
      setArmed(null);
    } else {
      setArmed(c.key);
      flyTo(c.pos.x, c.pos.y, c.k ?? Math.max(config.zoom.min * 1.6, 1.7));
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `${WORLD_SPRITE_CSS}${MAP_POPUP_CSS}${VIEWPORT_CSS}${extraCss ?? ""}` }} />
      <div
        ref={viewportRef}
        className="wm-viewport"
        style={{ top: topOffset }}
        role="application"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {/* suppressHydrationWarning: data-zoom is presentation state derived
            from the OPENING CAMERA, and the opening camera may legitimately be
            personalized on the client (S5 seats a first visit on the player's
            base, which the server cannot know). The client value wins; nothing
            else on this node differs. */}
        <div ref={worldRef} className="wm-world" data-zoom={zoomBucket} suppressHydrationWarning>
          {/* The floor. Always painted, so a missing or slow plate never shows
              a blank stage or a broken image. */}
          <div className="wm-ground" style={{ background: config.groundCss }} />
          {far ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="wm-plate" src={far} alt="" draggable={false} />
          ) : null}
          {near ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="wm-plate"
              src={near}
              alt=""
              draggable={false}
              style={{ opacity: nearReady ? 1 : 0 }}
              onLoad={(e) => {
                if ((e.currentTarget as HTMLImageElement).naturalWidth > 0) setNearReady(true);
              }}
            />
          ) : null}
          {children(pz)}
        </div>

        <div className="wm-hud">{hud}</div>

        <div className="wm-zoom" data-wm-nodrag>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label={labels.zoomIn}>+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label={labels.zoomOut}>−</button>
          <button type="button" onClick={reset} aria-label={labels.reset}>⌂</button>
        </div>
      </div>

      {places.length ? (
        <nav className="wm-dock" aria-label={labels.places}>
          <ul>
            {dockChips.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  className={armed === c.key ? "is-armed" : undefined}
                  style={{ ["--accent" as string]: c.accent }}
                  onClick={() => tapChip(c)}
                >
                  {c.label}
                </button>
              </li>
            ))}
            {collapsedCount > 0 ? (
              <li>
                <button
                  type="button"
                  className="wm-dock-more"
                  onClick={() => setShowAll(true)}
                >
                  {`+${collapsedCount}`}
                </button>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}
    </>
  );
}

const VIEWPORT_CSS = `
/* THE PAGE ITSELF MUST NOT SCROLL.
 *
 * The viewport is position:fixed and already fits the window exactly, but the
 * DOCUMENT was still 16px taller than the window (measured: scrollHeight 916
 * against innerHeight 900) because nothing zeroed the UA's default body margin.
 * That is enough to raise a scrollbar and let the whole board nudge up and down
 * under a map that is not actually overflowing, which reads as "it does not
 * fit" (Mike, 2026-08-04: "I hate that I have to scroll up and down from the
 * default view of the map"). Locked here, beside the element it protects, so a
 * page embedding this viewport cannot forget. */
html:has(.wm-viewport),body:has(.wm-viewport){margin:0;padding:0;overflow:hidden;height:100%;overscroll-behavior:none;}

.wm-viewport{
  position:fixed;left:0;right:0;bottom:0;
  overflow:hidden;
  /* Own the gesture: no page scroll, no pull-to-refresh, no rubber-band. */
  touch-action:none;
  overscroll-behavior:none;
  background:#0b0e12;
  cursor:grab;
  outline:none;
}
.wm-viewport:active{cursor:grabbing;}
.wm-viewport:focus-visible{box-shadow:inset 0 0 0 2px #e0662e;}

.wm-world{
  position:absolute;top:0;left:0;
  transform-origin:0 0;
  /* On the WORLD only. Never on a label: it locks the raster and blurs text. */
  will-change:transform;
}
.wm-ground{position:absolute;inset:0;}
.wm-plate{
  position:absolute;inset:0;
  width:100%;height:100%;
  object-fit:cover;
  user-select:none;
  transition:opacity 320ms ease-out;
}

.wm-hud{
  position:absolute;inset:0;
  pointer-events:none;
  z-index:20;
}
.wm-hud > *{pointer-events:auto;}

.wm-zoom{
  position:absolute;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));
  z-index:30;
  display:flex;flex-direction:column;gap:6px;
}
.wm-zoom button{
  width:40px;height:40px;
  display:grid;place-items:center;
  background:rgba(11,13,16,0.82);
  border:1px solid #2b333c;border-radius:9px;
  color:#e9edf1;font-size:19px;line-height:1;
  cursor:pointer;
  backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px);
}
.wm-zoom button:hover{border-color:#e0662e;color:#fff;}

/* THE PLACES DOCK. Outside the viewport so it keeps native scrolling. */
.wm-dock{
  position:fixed;left:0;right:0;
  bottom:calc(env(safe-area-inset-bottom,0px));
  z-index:40;
  background:linear-gradient(180deg, rgba(8,10,13,0) 0%, rgba(8,10,13,0.86) 42%);
  padding:16px 0 10px;
  pointer-events:none;
}
.wm-dock ul{
  display:flex;gap:8px;
  margin:0;padding:0 14px 2px;
  list-style:none;
  overflow-x:auto;
  scrollbar-width:none;
  -webkit-overflow-scrolling:touch;
  pointer-events:auto;
}
.wm-dock ul::-webkit-scrollbar{display:none;}
/* WRAP, never scroll. A chip off the right edge of a bar is a chip that does
   not exist, and for the places outside the opening camera this bar is the
   only way in. */
.wm-dock ul{flex-wrap:wrap;overflow-x:visible;justify-content:center;row-gap:6px;}
.wm-dock button.wm-dock-more{
  color:#87919b;border-style:dashed;
}
.wm-dock button{
  white-space:nowrap;
  background:rgba(18,22,27,0.94);
  border:1px solid #2b333c;
  border-bottom:2px solid var(--accent,#e0662e);
  border-radius:8px;
  color:#dfe6ec;cursor:pointer;
  font-family:'Space Mono',ui-monospace,monospace;
  font-size:12px;font-weight:700;letter-spacing:0.04em;
  padding:8px 12px;
}
.wm-dock button:hover{color:#fff;border-color:#3a444f;border-bottom-color:var(--accent,#e0662e);}
.wm-dock button.is-armed{
  background:var(--accent,#e0662e);
  color:#0b0d10;
  border-color:var(--accent,#e0662e);
}
/* The zoom cluster would sit under the dock on a phone. */
@media (max-width:760px){
  .wm-zoom{bottom:calc(72px + env(safe-area-inset-bottom,0px));}
}
@media (prefers-reduced-motion: reduce){
  .wm-plate{transition:none;}
}
`;
