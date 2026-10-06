/**
 * DOMAIN KITCHEN DESIGN TOKENS (M11).
 *
 * WHY THIS EXISTS. Before this file the game's DOM chrome had no design system
 * at all: zero CSS files, zero className attributes, zero shared components,
 * and 22 distinct raw hex literals repeated inline across 10 files (#e8a13d
 * appeared 63 times). Three separate modal shells and three separate card
 * shells had been copy-pasted and had already drifted apart. That is the real
 * reason the game "looks less like a mobile game and more like a text based
 * adventure" — not the prose, the absence of a visual system.
 *
 * NOTHING HERE RECOLOURS THE GAME. Every value below is a name for a colour
 * the game already used. The point of the first pass is to make the palette
 * addressable, so a later pass can change one token instead of 63 literals.
 *
 * Renderer-free by law, same as _engine: no Pixi, no React. Plain data, so the
 * bake scripts or a gate could read it too.
 */

/**
 * THE FONT.
 *
 * The old stack was 'ui-rounded, "Segoe UI", system-ui, sans-serif', declared
 * as a local const in six files and inlined verbatim in three more. `ui-rounded`
 * only resolves on Apple platforms, so every Windows and Android player saw
 * plain Segoe UI and none of the intended rounded warmth. Baloo 2 is loaded
 * properly through next/font in chef/layout.tsx (BOTH game entries live
 * under it) and published as `--font-dk`; the rest of the stack stays as
 * the swap-window fallback.
 *
 * The fallback INSIDE the var() is load-bearing. A `var()` naming an
 * undefined custom property makes the whole font-family declaration
 * invalid, so the element falls back to the browser default — which is a
 * SERIF. That is exactly what the boot screen rendered in when the font
 * was wired to one page instead of the shared layout.
 */
export const FONT =
  'var(--font-dk, ui-rounded), "Segoe UI", system-ui, sans-serif';

/**
 * COLOURS. Grouped by role, not by hue, so a call site reads as intent
 * ("panel", "line", "muted") rather than as a hex the author has to recognise.
 */
export const C = {
  /** page behind everything, and the text ON a filled amber button */
  ink: "#342c25",
  /** floating card / sheet body, translucent so the room shows through */
  panel: "rgba(255,252,243,0.97)",
  /** modal body where nothing should show through */
  panelSolid: "#fffaf0",
  /** inset wells: slider tracks, list rows, quiet containers */
  well: "#f3ecd9",
  wellActive: "#e5eedb",
  wellDisabled: "#eee8db",
  /** the quiet (non-primary) button fill */
  btnQuiet: "#fffdf6",
  /** progress-bar track */
  track: "#e6dcc8",

  /** hairline borders */
  line: "#dfd4bb",
  lineSoft: "rgba(119,97,60,0.15)",
  /** the scrim behind an open sheet */
  overlay: "rgba(43,57,37,0.18)",

  /** primary text */
  cream: "#3c392c",
  /** secondary text */
  creamDim: "#706a55",
  /** tertiary text, disabled labels, the PRACTICE badge */
  muted: "#857d69",

  /** THE accent. Coins, primary buttons, anything the player should act on. */
  amber: "#df9437",
  /** the deep end of the primary-button gradient */
  amberDeep: "#d37b2f",
  amberSoft: "#e0a552",

  /** semantic */
  good: "#46744f",
  info: "#6fb0c9",
  bad: "#b94f3e",
  leaf: "#8fbf6a",

  /** quality-bar segments (baseline / hands / upkeep / dishes) */
  segBase: "#8a6a45",
  segHands: "#e8a13d",
  segUpkeep: "#6fb0c9",
  segDishes: "#8fbf6a",

  /** sell-back and other "you get money back" affordances */
  sell: "#a98d6a",
} as const;

/** 4-point spacing scale. */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Corner radii. `pill` is the fully-round one. */
export const R = { inner: 10, card: 14, sheet: 16, pill: 999 } as const;

/**
 * Z-SCALE. Preserves the stacking the game already had, so nothing that used
 * to sit above something else drops behind it during the migration.
 *
 * `tx` is deliberately far above everything: a wallet transaction modal must
 * never be covered by a sheet or a coach card while a signature is pending.
 */
export const Z = {
  hud: 6,
  sheet: 7,
  coach: 8,
  boot: 10,
  tx: 20,
} as const;

/** Motion. Kept small and shared so nothing animates at a rogue duration. */
export const T = {
  /** button press, chip select */
  fast: 120,
  /** sheet slide, toast */
  base: 220,
  /** progress bars easing between 600ms snapshot ticks */
  slow: 400,
  /** the one easing curve, an iOS-style sheet ramp */
  ease: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

/** Card elevation, lifted verbatim from the old cardBase so nothing shifts. */
export const SHADOW = {
  card: "0 8px 28px rgba(64,66,39,0.12), inset 0 1px 0 #fffdf8",
  /** the glow under a primary button */
  primary: "0 1px 6px rgba(232,161,61,0.28)",
} as const;

/** Minimum touch target. 44 is the Apple/Android floor and the phone matters. */
export const TAP = 44;
