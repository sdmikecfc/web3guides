"use client";
/**
 * ONE PLACE ON THE MAP: a painted building when its art exists, a vector glyph
 * when it does not, with a label that stays readable at every zoom level.
 *
 * BOTTOM-CENTRE ANCHORING is the whole trick. `pos` is the site's GROUND
 * CONTACT point and the sprite hangs upward from it (translate(-50%,-100%)),
 * so a building SITS on the earth instead of floating over it. Anchor by
 * centre instead and every structure looks pasted on — it is the single
 * detail that makes a flat painting read as 3D, and it is also what lets a
 * glyph and its eventual painting occupy the exact same footprint.
 *
 * THE LABEL COUNTER-SCALE: the camera writes `--wm-inv: 1/k` on the world
 * element every frame, and the label multiplies by it with an ABSOLUTE px font
 * size. Buildings grow as you zoom; text holds a constant on-screen size. Two
 * hard rules learned the hard way on bright backgrounds:
 *   - the label is a dark blurred pill, never bare white text. On a sunlit
 *     painted map, white-on-anything fails somewhere.
 *   - `will-change` belongs on the world element ONLY. Put it on a label and
 *     the browser locks that layer's raster, so the text goes blurry the
 *     moment it scales.
 *
 * Sizing is by WIDTH with height following the art's own aspect, so a
 * re-exported asset with different canvas padding can never render giant (the
 * S2 channel-run lesson, games/_shared/art.ts).
 */
import { useEffect, useRef, useState } from "react";
import { Glyph } from "./Glyphs";
import type { GlyphKind, Vec2 } from "@/lib/world/types";

export type WorldSpriteProps = {
  pos: Vec2;
  /** Width as a fraction of world width. */
  size: number;
  /** Resolved art URL, or null to stay a glyph. */
  art: string | null;
  glyph: GlyphKind;
  accent: string;
  /** Extra downward offset for the label, in px. Used to stagger neighbouring
   * sites so two labels never land on the same line and overlap. */
  labelLift?: number;
  label: string;
  /** 1 always visible, 2 from mid zoom, 3 only when zoomed in. */
  tier?: 1 | 2 | 3;
  /** Full sentence for screen readers ("Warhawks, mini-game. Opens details."). */
  ariaLabel: string;
  onOpen: () => void;
  /** Fly the camera here when the site receives keyboard focus — the
   * scroll-into-view equivalent for a transformed world. */
  onFocus?: () => void;
  /** Small status word rendered on the label ("BREACHED", "COMING SOON"). */
  badge?: string;
  badgeColor?: string;
  /** Visibly closed: greyed and desaturated, still legible. */
  dimmed?: boolean;
  /** Pulsing invitation. Reduced-motion is handled in CSS, not here. */
  glow?: boolean;
  /**
   * VISUAL WEIGHT, 1..3. Drives the accent ring under the building, which is
   * the "this is clickable" cue. 3 = your own base (unmistakable), 2 = the
   * things the season is about (strongholds, games), 1 = useful but secondary
   * (workshop, depot, trophies). Size carries the same hierarchy; this makes it
   * legible at a glance even before you can read a label.
   */
  emph?: 1 | 2 | 3;
  /** Extra class for season- or kind-specific decoration. */
  className?: string;
};

export function WorldSprite({
  pos,
  size,
  art,
  glyph,
  accent,
  labelLift,
  label,
  tier = 1,
  ariaLabel,
  onOpen,
  onFocus,
  badge,
  badgeColor,
  dimmed,
  glow,
  emph = 1,
  className,
}: WorldSpriteProps) {
  // BROKEN-ART DETECTION, and why it needs all three branches.
  //
  // React's onError alone is not enough: an image that 404s BEFORE hydration
  // has already fired its error event on the DOM node, so React's handler
  // attaches too late and never runs (the S3 lesson behind HqScene's SafeArt).
  // A mount-time naturalWidth check alone is not enough either: if the request
  // is still in flight at mount, there is nothing to see yet.
  //
  // On a map that requests two dozen sprites at once, the in-flight case is the
  // COMMON one, so both gaps are live. This covers all three: check now, and if
  // the request has not settled, listen natively until it does.
  const [broken, setBroken] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!art) return;
    const im = imgRef.current;
    if (!im) return;
    setBroken(false);
    const check = () => {
      if (im.complete && im.naturalWidth === 0) setBroken(true);
    };
    check();
    if (im.complete) return;
    im.addEventListener("error", check);
    im.addEventListener("load", check);
    return () => {
      im.removeEventListener("error", check);
      im.removeEventListener("load", check);
    };
  }, [art]);

  const showArt = !!art && !broken;

  /**
   * THE SPRITE BOX MATCHES THE PICTURE, not a square.
   *
   * `.wm-site-art` used to be hard-locked to `aspect-ratio: 1/1` so the vector
   * glyph (an <svg> at width:100% has no intrinsic height) would not collapse.
   * The comment claimed the painted <img> "overrides it with its own natural
   * aspect", but that rule targets the IMG, which is already `auto` — the
   * parent stayed square. Wide plates therefore filled only the top slice of
   * their box: site-basecamp is 256x79, so 69% of its footprint was empty air.
   * Two visible consequences, both reported: the label (top:100% of the SQUARE)
   * hung a long way under the tent, and the painting floated well above the
   * ground point every position on this map is anchored to.
   *
   * So the box takes the image's real aspect the moment it is known. The 1/1
   * default still protects the glyph branch and the pre-load frame.
   */
  const [artAspect, setArtAspect] = useState<number | null>(null);
  useEffect(() => {
    if (!art) {
      setArtAspect(null);
      return;
    }
    const im = imgRef.current;
    if (!im) return;
    const read = () => {
      if (im.naturalWidth > 0 && im.naturalHeight > 0) setArtAspect(im.naturalWidth / im.naturalHeight);
    };
    read();
    if (im.complete) return;
    im.addEventListener("load", read);
    return () => im.removeEventListener("load", read);
  }, [art]);

  return (
    <button
      type="button"
      className={`wm-site${glow ? " wm-site--glow" : ""}${dimmed ? " wm-site--dim" : ""}${className ? ` ${className}` : ""}`}
      style={
        {
          "--x": pos.x,
          "--y": pos.y,
          "--w": size,
          // PAINTER'S ALGORITHM, ON THE GROUND. Everything on this board is
          // bottom-anchored, so the thing whose FEET are lower is the thing
          // standing in front. A flat z-order made commanders paint over every
          // building and every name regardless of where they stood (Mike,
          // 2026-08-01: "hidden tags or hidden tanks"). Depth from y, shared by
          // sites and figures alike, so the board occludes the way a picture of
          // a hillside would.
          "--zi": Math.round(100 + pos.y * 1000),
          "--accent": accent,
          "--wm-lift": labelLift ? `${labelLift}px` : "0px",
          ...(showArt && artAspect ? { "--wm-ar": String(artAspect) } : null),
        } as React.CSSProperties
      }
      data-tier={tier}
      data-emph={emph}
      onClick={onOpen}
      // KEYBOARD FOCUS ONLY. A mouse focuses this button on MOUSEDOWN, so
      // flying the camera here moved the sprite out from under the cursor and
      // the browser never fired the click (down and up must share a target).
      // Desktop taps did nothing at all; touch was unaffected because it does
      // not focus this way. :focus-visible is the browser's own "did this come
      // from the keyboard" answer, so tabbing keeps its camera assist.
      onFocus={(e) => {
        try {
          if (!e.currentTarget.matches(":focus-visible")) return;
        } catch {
          // Ancient engine with no :focus-visible: fly, as before.
        }
        onFocus?.();
      }}
      aria-label={ariaLabel}
    >
      <span className="wm-site-art">
        {showArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={art}
            alt=""
            onError={() => setBroken(true)}
            draggable={false}
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        ) : (
          <Glyph kind={glyph} accent={accent} />
        )}
      </span>
      <span className="wm-label">
        <span className="wm-label-text">{label}</span>
        {badge ? (
          <span className="wm-badge" style={badgeColor ? { color: badgeColor, borderColor: badgeColor } : undefined}>
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * The stylesheet for every sprite on the stage. Exported as a string so the
 * viewport can inject it once (the repo has no Tailwind and styles inline or
 * via a single <style> block).
 *
 * The glyph branch has NO intrinsic height — an <svg> at width:100% collapses
 * — so `.wm-site-art` carries an aspect-ratio that the painted <img> then
 * overrides with its own natural aspect. That keeps a glyph and its future
 * painting on the same footprint.
 */
export const WORLD_SPRITE_CSS = `
.wm-site{
  position:absolute;
  /* Depth by ground contact, not by document order. See --zi above. */
  z-index:var(--zi, 100);
  left:calc(var(--x) * 100%);
  top:calc(var(--y) * 100%);
  width:calc(var(--w) * 100%);
  /* Anchor BOTTOM-CENTRE: the sprite hangs up from its ground contact point. */
  transform:translate(-50%,-100%);
  background:none;border:0;padding:0;margin:0;
  cursor:pointer;
  font:inherit;color:inherit;
  -webkit-tap-highlight-color:transparent;
}
.wm-site-art{
  display:block;position:relative;width:100%;
  /* The PICTURE's aspect once it is known (--wm-ar, set from naturalWidth /
     naturalHeight), square only for the vector glyph and the pre-load frame.
     A hard 1/1 here left wide plates floating in a box two-thirds empty and
     pushed every label that far off its building. */
  aspect-ratio:var(--wm-ar, 1) / 1;
  filter:drop-shadow(0 6px 10px rgba(12,10,6,0.32));
  transition:transform 140ms ease-out;
}

/* THE CLICKABLE CUE. A soft accent-coloured pool of light on the ground under
   every destination, weighted by how much it matters. It reads as "this object
   is lit / active" rather than as UI chrome stuck on top of a painting, so it
   will still look right once the vector glyphs are replaced by art. Deliberately
   low-contrast: it must say "you can touch this" without competing with the
   labels or the siege state. */
.wm-site-art::before{
  content:"";position:absolute;left:50%;bottom:-3%;
  width:74%;height:24%;transform:translateX(-50%);
  border-radius:50%;
  background:radial-gradient(ellipse at center, var(--accent) 0%, transparent 72%);
  opacity:0.20;pointer-events:none;
}
.wm-site[data-emph="2"] .wm-site-art::before{width:86%;height:27%;opacity:0.32;}
/* Your own camp. The one object you must never have to hunt for. */
.wm-site[data-emph="3"] .wm-site-art::before{
  width:100%;height:32%;opacity:0.44;
  animation:wm-breathe 4.2s ease-in-out infinite;
}
.wm-site:hover .wm-site-art::before,
.wm-site:focus-visible .wm-site-art::before{opacity:0.62;}
@keyframes wm-breathe{
  0%,100%{opacity:0.36;transform:translateX(-50%) scale(0.96);}
  50%{opacity:0.54;transform:translateX(-50%) scale(1.05);}
}
.wm-site-art > img{aspect-ratio:auto;}
.wm-site:hover .wm-site-art,
.wm-site:focus-visible .wm-site-art{transform:translateY(-3px) scale(1.04);}
.wm-site:focus-visible{outline:none;}
.wm-site:focus-visible .wm-label{outline:2px solid var(--accent);outline-offset:3px;}

/* Visibly closed: readable, obviously not yours yet. */
.wm-site--dim .wm-site-art{filter:grayscale(0.65) brightness(0.72) drop-shadow(0 6px 10px rgba(12,10,6,0.32));}

/* THE LABEL. Counter-scaled by --wm-inv so it holds a constant on-screen size
   at every zoom. Absolute px font, dark pill, never bare white text. */
.wm-label{
  position:absolute;left:50%;top:100%;
  z-index:50;
  /* The GAP is counter-scaled too. The scale() below holds the label's own box
     at a constant size, but the translate lives in the world's local space, so
     the camera multiplies it: a 3px gap became ~10px at k=3.2 and a 29px
     collision lift became ~93px. Multiplying the offset by --wm-inv makes the
     gap constant ON SCREEN, which is where it is read. */
  transform:translate(-50%, calc((3px + var(--wm-lift, 0px)) * var(--wm-inv,1))) scale(var(--wm-inv,1));
  transform-origin:50% 0;
  display:flex;align-items:center;gap:6px;white-space:nowrap;
  background:rgba(11,13,16,0.80);
  border:1px solid rgba(255,255,255,0.10);
  border-bottom:2px solid var(--accent);
  border-radius:7px;
  padding:4px 9px;
  backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent),
    0 2px 10px rgba(0,0,0,0.45),
    0 0 14px color-mix(in srgb, var(--accent) 18%, transparent);
  pointer-events:none;
}
.wm-label-text{
  font-family:'Space Mono',ui-monospace,monospace;
  font-size:12px;font-weight:700;letter-spacing:0.04em;
  color:#eef2f6;
  text-shadow:0 1px 3px rgba(0,0,0,0.85);
}
.wm-badge{
  font-family:'Space Mono',ui-monospace,monospace;
  font-size:9px;font-weight:700;letter-spacing:0.08em;
  color:var(--accent);
  border:1px solid var(--accent);
  border-radius:4px;padding:1px 4px;
  opacity:0.95;
}

/* DECLUTTER: at 24 sites a fully-labelled board is soup when zoomed out.
   Tier 1 is always legible; 2 and 3 earn their way in as you zoom. */
.wm-world[data-zoom="0"] .wm-site[data-tier="2"] .wm-label,
.wm-world[data-zoom="0"] .wm-site[data-tier="3"] .wm-label,
.wm-world[data-zoom="1"] .wm-site[data-tier="3"] .wm-label{
  opacity:0;transform:translate(-50%,2px) scale(var(--wm-inv,1));
}
.wm-label{transition:opacity 160ms ease-out;}

/* "Begging to be played". Reduced motion keeps the halo, drops the pulse. */
.wm-site--glow .wm-site-art::after{
  content:"";position:absolute;left:50%;bottom:-6%;
  width:88%;height:34%;transform:translateX(-50%);
  border-radius:50%;
  background:radial-gradient(ellipse at center, var(--accent) 0%, transparent 70%);
  opacity:0.42;pointer-events:none;
  animation:wm-pulse 2.6s ease-in-out infinite;
}
@keyframes wm-pulse{
  0%,100%{opacity:0.26;transform:translateX(-50%) scale(0.92);}
  50%{opacity:0.55;transform:translateX(-50%) scale(1.08);}
}
@media (prefers-reduced-motion: reduce){
  .wm-site--glow .wm-site-art::after{animation:none;opacity:0.4;}
  .wm-site[data-emph="3"] .wm-site-art::before{animation:none;opacity:0.46;}
  .wm-site-art{transition:none;}
  .wm-label{transition:none;}
}
`;
