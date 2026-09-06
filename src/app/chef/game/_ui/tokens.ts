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
  ink: "#1b1310",
  /** floating card / sheet body, translucent so the room shows through */
  panel: "rgba(27,19,16,0.94)",
  /** modal body where nothing should show through */
  panelSolid: "#241812",
  /** inset wells: slider tracks, list rows, quiet containers */
  well: "#1f150f",
  wellActive: "#2f2016",
  wellDisabled: "#241a14",
  /** the quiet (non-primary) button fill */
  btnQuiet: "#2a1c14",
  /** progress-bar track */
  track: "#31241b",

  /** hairline borders */
  line: "#4a3626",
  lineSoft: "rgba(74,54,38,0.6)",
  /** the scrim behind an open sheet */
  overlay: "rgba(10,6,4,0.55)",

  /** primary text */
  cream: "#f3e9d2",
  /** secondary text */
  creamDim: "#c9b79a",
  /** tertiary text, disabled labels, the PRACTICE badge */
  muted: "#8a7a63",

  /** THE accent. Coins, primary buttons, anything the player should act on. */
  amber: "#e8a13d",
  /** the deep end of the primary-button gradient */
  amberDeep: "#d97b29",
  amberSoft: "#e0a552",

  /** semantic */
  good: "#6fe3a0",
  info: "#6fb0c9",
  bad: "#ff9a9a",
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
  card: "0 10px 28px rgba(8,4,2,0.5), inset 0 1px 0 rgba(255,240,214,0.07)",
  /** the glow under a primary button */
  primary: "0 1px 6px rgba(232,161,61,0.28)",
} as const;

/** Minimum touch target. 44 is the Apple/Android floor and the phone matters. */
export const TAP = 44;
