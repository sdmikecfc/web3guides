/**
 * BATTLE BOTS DESIGN TOKENS (week 1).
 *
 * Copied in shape from src/app/chef/game/_ui/tokens.ts (the Domain Kitchen
 * token file) per the reuse law, with TWO colour namespaces instead of one:
 *
 *   M  the MONEY layer: the Bloomberg-dark frame (nav, tray, readout, board).
 *      Exactly the web3guides site tokens, so a Battle Bots table and a
 *      web3guides table are the same table.
 *   K  the CLAY layer: the lit diorama inside the frame (the bay, the garage,
 *      the pit). Matte putty, concrete, unpainted clay, the eight paints.
 *
 * The two layers meet on ONE hairline (screens doc 6.2): a 1px M.border,
 * radius 14, an inner top highlight, and inside it the diorama's own lit
 * wall. Nothing crosses that line in either direction.
 *
 * Renderer-free by law, same as DK: no Pixi, no React. Plain data, so the
 * bake script or a gate could read it too.
 */

/**
 * THE FONTS.
 *
 * Syne, DM Sans and JetBrains Mono are already loaded for the whole site by
 * src/app/globals.css. Baloo 2 (the toy voice) is loaded through next/font in
 * src/app/bots/layout.tsx and published as `--font-bots-toy`, exactly the way
 * chef/layout.tsx publishes `--font-dk`.
 *
 * The fallback INSIDE the var() is load-bearing (DK lesson): a `var()` naming
 * an undefined custom property makes the whole font-family declaration
 * invalid, so the element falls back to the browser default, which is a
 * SERIF. Keep it.
 *
 * Where each voice is allowed (screens doc 5.2 rule 3): Syne for headers,
 * DM Sans for body, mono for numbers, and Baloo 2 ONLY on painted surfaces
 * (name plates, the Morning Paper masthead, speech chips, KNOCKOUT). Never in
 * a table.
 */
export const FONT_TOY =
  'var(--font-bots-toy, ui-rounded), "Segoe UI", system-ui, sans-serif';
export const FONT_DISPLAY = '"Syne", "DM Sans", system-ui, sans-serif';
export const FONT_BODY = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * M: THE MONEY LAYER. Grouped by role, not by hue, so a call site reads as
 * intent ("surface", "border", "muted") rather than as a hex.
 */
export const M = {
  /** the page behind everything */
  ground: "#080b14",
  /** panels, sheets, cards */
  surface: "#0d1120",
  /** inset wells, hover rows, the active chip fill */
  surface2: "#131826",
  /** hairline borders, and THE hairline around every canvas */
  border: "#1c2236",
  /** primary text */
  text: "#e4e8f5",
  /** secondary text, labels, disabled */
  muted: "#6272a0",
  /** lore lines: one step lighter than muted so it reads as a whisper */
  lore: "#a9b1c9",
  /** THE accent. Active state and links only. */
  accent: "#7c6aff",

  /** semantic, shared with the clay layer so a status dot and an HP bar agree */
  good: "#6fe3a0",
  warn: "#ffd166",
  bad: "#ff8a7a",

  /** the scrim behind an open sheet */
  overlay: "rgba(4,6,12,0.62)",
  /** a chip that sits over a canvas: translucent surface */
  panel: "rgba(13,17,32,0.92)",
  /** the one hairline's inner top highlight */
  highlight: "rgba(255,255,255,0.04)",
  /** "you get coins back" affordances (the DK sell tone) */
  sell: "#a98d6a",
} as const;

/** Tier colours (the standing tier law: a dot and a label, never a pill). */
export const TIER_COLOR = {
  1: "#94a3b8",
  2: "#5eead4",
  3: "#7c6aff",
  4: "#f0b340",
} as const;

/**
 * K: THE CLAY LAYER. All matte. Lit from directly above, cool shadows at
 * hue 220 (the DK derived-lighting rule, the ONLY new palette key).
 */
export const K = {
  /** the putty back wall */
  wall: "#e9dfcf",
  /** the concrete floor */
  floor: "#cfc6b8",
  /** where the vignette fades TO at the frame edge, never to the page dark */
  vignette: "#bfb5a6",

  /** unpainted clay: every paintable surface ships in this */
  clay: "#c7cdd6",
  brass: "#d9a441",
  rubber: "#3a3a3f",
  glass: "#bfe9ff",

  /** cream paper and its ink: the Morning Paper, the name plates */
  paper: "#f3e9d2",
  ink: "#1b1310",

  /** shadow hue for the derived lighting rule */
  shadowHue: 220,
} as const;

/** The eight paints. A paint tints the mask layer of every part at once. */
export const PAINTS = {
  mint: "#8fd9c4",
  coral: "#ff8a7a",
  butter: "#ffd166",
  sky: "#7fb8ff",
  lilac: "#b9a7ff",
  moss: "#8fbf6a",
  // A PAINT HAS TO LOOK PAINTED. A paint tints the mask by MULTIPLY, so a
  // near-white cream barely moves the clay: #f3e9d2 shifted it by 43 while
  // every other paint shifted it 90 to 287, and a cream robot photographed
  // as an unpainted one on every screen it appeared on. This warmer cream
  // lands at 81, beside lilac, so it is still the palest of the eight and is
  // unmistakably a colour. Bare clay keeps the old value; it lives on as
  // NO_PAINT_HEX in src/lib/bots/look.ts, which is what a weapon wears.
  cream: "#ecd9a8",
  ink: "#2b2f3a",
} as const;
export type PaintId = keyof typeof PAINTS;
export const PAINT_IDS = Object.keys(PAINTS) as readonly PaintId[];

/** 4-point spacing scale. */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Corner radii. `pill` is the fully-round one. `frame` is the canvas hairline. */
export const R = { inner: 10, card: 14, frame: 14, sheet: 16, pill: 999 } as const;

/**
 * Z-SCALE. `tx` is deliberately far above everything: a wallet signature
 * modal must never be covered by a sheet or a coach card while pending. The
 * fixed nav lives at 1000 (the S7 nav law) and sheets sit above it.
 */
export const Z = {
  hud: 6,
  nav: 1000,
  sheet: 1100,
  coach: 1200,
  drag: 1300,
  tx: 2000,
} as const;

/** Motion. Kept small and shared so nothing animates at a rogue duration. */
export const T = {
  /** button press, chip select */
  fast: 120,
  /** sheet slide, toast */
  base: 220,
  /** the tier badge ratchet */
  ratchet: 260,
  /** count-ups on the readout */
  count: 420,
  /** the lift rising on open */
  lift: 600,
  /** a stat delta chip's life */
  delta: 900,
  /** the one easing curve, an iOS-style sheet ramp */
  ease: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

/** Card elevation on the money layer. No glow, no drop shadow on canvases. */
export const SHADOW = {
  card: "0 10px 28px rgba(2,4,10,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
  /** the glow under a primary button */
  primary: "0 1px 6px rgba(124,106,255,0.3)",
} as const;

/** Minimum touch target. 44 is the Apple/Android floor and the phone matters. */
export const TAP = 44;
