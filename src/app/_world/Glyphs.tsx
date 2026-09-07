"use client";
/**
 * VECTOR FALLBACKS for every world site.
 *
 * This file is why the map can ship before a single asset is painted, and why
 * each later art drop is a pure file copy with zero code risk. It is the same
 * contract the games already run on (games/_shared/art.ts: "TRY-IMAGE-ELSE-
 * VECTOR, ALWAYS") applied to the map surface.
 *
 * These are not placeholders in the apologetic sense. A glyph map is a
 * perfectly readable game board: distinct silhouettes, accent-coded, each one
 * obviously a different KIND of place. If an asset never gets painted, its
 * glyph is a valid permanent state.
 *
 * DRAWING RULES so glyphs and paintings can share one stage:
 *  - 100x100 viewBox with the GROUND LINE AT y=100. The sprite wrapper anchors
 *    bottom-centre, so a glyph sits on the earth exactly where a painting will.
 *  - Light from the UPPER LEFT: left/top faces bright, right faces shaded.
 *    Same 10 o'clock sun the art prompts specify and longShadow() bakes, so
 *    swapping a glyph for a painting never flips the lighting.
 *  - Body reads at 40px. No detail finer than a doorway.
 */
import type { GlyphKind } from "@/lib/world/types";

/** Shared ink. Bodies are near-black so a bright ground plate makes the
 * silhouette pop; the accent only ever draws edges and highlights. */
const BODY = "#1b2027";
const BODY_LIT = "#2c343e";
const SHADE = "#12161b";

type P = { accent: string };

/** The contact shadow every glyph casts, drawn first, matching the baked
 * longShadow ellipse in games/_shared/art.ts (offset down and to the right). */
function Contact() {
  return <ellipse cx="54" cy="96" rx="38" ry="7" fill="rgba(20,14,8,0.30)" />;
}

function Keep({ accent }: P) {
  return (
    <>
      <Contact />
      <path d="M18 96V44l12-8 20-10 20 10 12 8v52z" fill={BODY} />
      <path d="M18 44l12-8 20-10 20 10 12 8-32 12z" fill={BODY_LIT} />
      <path d="M70 44l12-8 12 8v52H70z" fill={SHADE} opacity="0.55" />
      {/* battlements */}
      <path d="M18 44h8v-8h8v8h8v-8h8v8h8v-8h8v8h8v-8h8v8h8" stroke={accent} strokeWidth="3" fill="none" />
      <rect x="44" y="70" width="14" height="26" fill={SHADE} />
      <path d="M18 96h68" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Camp({ accent }: P) {
  return (
    <>
      <Contact />
      {/* two tents */}
      <path d="M14 96l22-38 22 38z" fill={BODY} />
      <path d="M14 96l22-38 8 14-14 24z" fill={BODY_LIT} />
      <path d="M56 96l16-26 16 26z" fill={SHADE} />
      <path d="M30 96h12l-6-16z" fill={SHADE} />
      {/* campfire */}
      <path d="M62 92c0-5 5-6 5-11 3 3 6 6 6 11 0 4-2 6-5.5 6S62 96 62 92z" fill={accent} />
      <path d="M14 96h74" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Arcade({ accent }: P) {
  return (
    <>
      <Contact />
      <path d="M24 96V34l10-8h34l10 8v62z" fill={BODY} />
      <path d="M24 34l10-8h34l-8 8z" fill={BODY_LIT} />
      <path d="M68 34h10v62H68z" fill={SHADE} opacity="0.6" />
      {/* screen, the thing that glows */}
      <rect x="34" y="40" width="30" height="24" rx="3" fill={accent} opacity="0.85" />
      <rect x="34" y="72" width="30" height="6" rx="3" fill={SHADE} />
      <path d="M24 96h56" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Workshop({ accent }: P) {
  return (
    <>
      <Contact />
      {/* open-fronted shed */}
      <path d="M16 96V50h68v46z" fill={BODY} />
      <path d="M16 50l14-14h68L84 50z" fill={BODY_LIT} />
      <path d="M84 50h0v46h-0z" fill={SHADE} />
      {/* gantry + a hull on blocks */}
      <path d="M28 50v-8h44v8" stroke={accent} strokeWidth="3" fill="none" />
      <path d="M50 42v12" stroke={accent} strokeWidth="3" />
      <rect x="34" y="74" width="34" height="12" rx="3" fill={SHADE} />
      <rect x="40" y="86" width="8" height="6" fill={SHADE} />
      <rect x="56" y="86" width="8" height="6" fill={SHADE} />
      <path d="M16 96h68" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Depot({ accent }: P) {
  return (
    <>
      <Contact />
      {/* crate stacks */}
      <path d="M18 96V60h30v36z" fill={BODY} />
      <path d="M18 60l8-8h30l-8 8z" fill={BODY_LIT} />
      <path d="M52 96V44h30v52z" fill={BODY} />
      <path d="M52 44l8-8h30l-8 8z" fill={BODY_LIT} />
      <path d="M82 44h0v52h-0z" fill={SHADE} />
      <path d="M18 78h30M52 62h30M52 80h30" stroke={accent} strokeWidth="2.5" />
      <path d="M18 96h64" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Monument({ accent }: P) {
  return (
    <>
      <Contact />
      {/* plinth */}
      <path d="M26 96V82h52v14z" fill={BODY} />
      <path d="M26 82l6-6h52l-6 6z" fill={BODY_LIT} />
      {/* column + star */}
      <path d="M44 82V38h16v44z" fill={BODY} />
      <path d="M44 38l5-5h16l-5 5z" fill={BODY_LIT} />
      <path d="M52 10l5 11 12 2-9 8 2 12-10-6-10 6 2-12-9-8 12-2z" fill={accent} />
      <path d="M26 96h52" stroke={accent} strokeWidth="3" />
    </>
  );
}

function School({ accent }: P) {
  return (
    <>
      <Contact />
      {/* map tent with an awning */}
      <path d="M20 96V52h60v44z" fill={BODY} />
      <path d="M20 52l12-14h60L80 52z" fill={BODY_LIT} />
      <path d="M80 52h0v44h-0z" fill={SHADE} />
      <path d="M8 52h84" stroke={accent} strokeWidth="3" />
      {/* an easel board */}
      <rect x="34" y="62" width="32" height="22" rx="2" fill={SHADE} />
      <path d="M38 68h24M38 74h16" stroke={accent} strokeWidth="2.5" />
      <path d="M20 96h60" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Radio({ accent }: P) {
  return (
    <>
      <Contact />
      {/* lattice mast */}
      <path d="M38 96L50 14l12 82z" fill={BODY} />
      <path d="M50 14l12 82h-6z" fill={SHADE} />
      <path d="M42 74h16M44 58h12M46 42h8" stroke={accent} strokeWidth="2.5" />
      {/* guy wires + signal */}
      <path d="M50 20L22 90M50 20l28 70" stroke={accent} strokeWidth="2" opacity="0.5" />
      <circle cx="50" cy="12" r="4" fill={accent} />
      <path d="M20 96h60" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Board({ accent }: P) {
  return (
    <>
      <Contact />
      {/* notice board on posts */}
      <rect x="26" y="88" width="6" height="10" fill={SHADE} />
      <rect x="68" y="88" width="6" height="10" fill={SHADE} />
      <path d="M18 88V34h64v54z" fill={BODY} />
      <path d="M18 34l6-6h64l-6 6z" fill={BODY_LIT} />
      <path d="M82 34h0v54h-0z" fill={SHADE} />
      {/* pinned notices */}
      <rect x="26" y="42" width="22" height="18" fill={accent} opacity="0.8" />
      <rect x="54" y="42" width="20" height="12" fill={SHADE} />
      <rect x="26" y="66" width="48" height="4" fill={SHADE} />
      <rect x="26" y="74" width="34" height="4" fill={SHADE} />
    </>
  );
}

function Plant({ accent }: P) {
  return (
    <>
      <Contact />
      {/* cooling towers — the locked tease. Deliberately cold and inert. */}
      <path d="M16 96l6-46c0-6 6-10 12-10s12 4 12 10l6 46z" fill={BODY} />
      <path d="M22 50c0-6 6-10 12-10s12 4 12 10z" fill={BODY_LIT} />
      <path d="M56 96l5-34c0-5 5-8 10-8s10 3 10 8l5 34z" fill={BODY} />
      <path d="M61 62c0-5 5-8 10-8s10 3 10 8z" fill={SHADE} />
      <path d="M16 96h70" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Signpost({ accent }: P) {
  return (
    <>
      <Contact />
      <rect x="46" y="26" width="7" height="70" fill={BODY} />
      {/* fingerposts pointing away — "there is more out there" */}
      <path d="M53 32h34l8 8-8 8H53z" fill={BODY_LIT} />
      <path d="M46 52H14l-8 8 8 8h32z" fill={BODY} />
      <path d="M53 72h26l7 7-7 7H53z" fill={SHADE} />
      <path d="M53 40h28M18 60h24" stroke={accent} strokeWidth="2.5" />
      <path d="M20 96h60" stroke={accent} strokeWidth="3" />
    </>
  );
}

function Tower({ accent }: P) {
  return (
    <>
      <Contact />
      <path d="M32 96V30l18-12 18 12v66z" fill={BODY} />
      <path d="M32 30l18-12 18 12-18 8z" fill={BODY_LIT} />
      <path d="M68 30v66H50V38z" fill={SHADE} opacity="0.5" />
      <rect x="44" y="46" width="12" height="16" rx="2" fill={accent} opacity="0.8" />
      <path d="M32 96h36" stroke={accent} strokeWidth="3" />
    </>
  );
}

const GLYPHS: Record<GlyphKind, (p: P) => React.ReactElement> = {
  keep: Keep,
  camp: Camp,
  arcade: Arcade,
  workshop: Workshop,
  depot: Depot,
  monument: Monument,
  school: School,
  radio: Radio,
  board: Board,
  plant: Plant,
  signpost: Signpost,
  tower: Tower,
};

/**
 * Draw a site's fallback shape. Fills its container, so it lands at exactly
 * the size and ground position the painted sprite will occupy — swapping one
 * for the other never moves anything.
 */
export function Glyph({ kind, accent }: { kind: GlyphKind; accent: string }) {
  const Shape = GLYPHS[kind] ?? Tower;
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <Shape accent={accent} />
    </svg>
  );
}
