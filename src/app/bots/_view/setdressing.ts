/**
 * THE GARAGE set dressing (screens doc 3.1): where every painted prop, bay
 * stand, crew spot and the street strip's plate numbers sit. Plain data in
 * the S7 shape (src/app/s7/front/setdressing.ts) so a human, or the optional
 * garage editor, can move a prop without touching the scene code. The seed
 * never designs; these numbers were placed by hand.
 *
 * Coordinates are SCENE px: the desktop canvas is 1400x520 css, drawn at 2x,
 * so the scene is 2800x1040 and one scene px is half a css px. The phone
 * shows the same scene through a camera (garage.ts), never a second layout.
 *
 * Anchors: "floor" items anchor at (0.5, 1) and `y` is the ground contact
 * (the art grows UPWARD, the S7 prop law); "wall" items anchor at (0.5, 0.5)
 * and `y` is their centre on the back wall.
 */

import type { StrategyKind } from "@/lib/bots/fixtures";

export const SCENE = { w: 2800, h: 1040, floorY: 640 } as const;

/** Five bays, 250 css apart (doc: centred at css x 200, 450, 700, 950, 1200). */
export const BAY_X: readonly number[] = [400, 900, 1400, 1900, 2400];
/** ground contact of every stand's wheels */
export const BAY_FLOOR_Y = 930;

export type PropKey =
  | "corkboard"
  | "tool-board"
  | "ceiling-fan"
  | "workbench"
  | "toolbox"
  | "stand"
  | "crew-hammer"
  | "crew-flywheel"
  | "crew-tripwire"
  | "crew-wrencher";

/** Keyed PNG sizes (public/bots-art/props, measured 2026-09-03), so a vector
 * fallback draws the same box when the art folder is missing. */
export const PROP_SIZE: Readonly<Record<PropKey, readonly [number, number]>> = {
  corkboard: [874, 667],
  "tool-board": [816, 813],
  "ceiling-fan": [816, 861],
  workbench: [1000, 837],
  toolbox: [712, 648],
  stand: [614, 767],
  "crew-hammer": [534, 697],
  "crew-flywheel": [607, 620],
  "crew-tripwire": [815, 679],
  "crew-wrencher": [620, 740],
};

export const propFile = (key: PropKey): string => `/bots-art/props/${key}.png`;

export interface SetItem {
  key: PropKey;
  x: number;
  y: number;
  /** scale, 1 = the PNG's own pixels as scene px */
  s: number;
  anchor: "floor" | "wall";
  flip?: boolean;
}

/**
 * Placed 2026-09-03 off the first 1440 shot: the bench and the crew sit a
 * step BEHIND the stands (a smaller ground y is further up the floor, so
 * the bots draw in front and the figures fill the gaps between them); the
 * corkboard rides high enough that bay 1's head only clips its bottom edge.
 */
export const GARAGE_SET: readonly SetItem[] = [
  { key: "corkboard", x: 340, y: 290, s: 0.52, anchor: "wall" },
  { key: "tool-board", x: 2440, y: 320, s: 0.58, anchor: "wall" },
  { key: "ceiling-fan", x: 1400, y: 130, s: 0.3, anchor: "wall" },
  { key: "workbench", x: 1150, y: 790, s: 0.3, anchor: "floor" },
  { key: "toolbox", x: 2660, y: 935, s: 0.22, anchor: "floor" },
];

/** The stand under every bot: its scale and where the feet line sits above
 * the wheels (the base plate's top, measured on stand.png at 78 percent). */
export const STAND = { s: 0.4, feetAboveGround: 67 } as const;

/** The bot's height on its stand, scene px (240 css). */
export const BOT_HEIGHT = 480;

/** One clay figure per live strategy (doc 3.1, "Crew figures"). */
export const CREW_SPOT: Readonly<Record<StrategyKind, SetItem>> = {
  // the hammer works the bench between bays 2 and 3; the flywheel leans
  // between bays 3 and 4; the trip wire crosses the gap between bays 4 and 5
  blsh: { key: "crew-hammer", x: 1150, y: 830, s: 0.36, anchor: "floor" },
  position: { key: "crew-flywheel", x: 1650, y: 830, s: 0.36, anchor: "floor", flip: true },
  limit: { key: "crew-tripwire", x: 2150, y: 900, s: 0.28, anchor: "floor" },
};

/** The trip wire the limit-order figure watches: two pegs on the floor. */
export const TRIP_WIRE = { x0: 2040, x1: 2270, y: 905 } as const;

/**
 * SPROCKET ROW (doc 3.1): the street plate, seven doors with BLANK brass
 * plates; the numbers are painted in code, never in the art. Source px on
 * art-src/bots/plates/street-elevation.png (2720x1536); the strip draws the
 * downsized WebP copy and scales by srcW.
 */
export const STREET = {
  file: "/bots-art/plates/street-elevation.webp",
  srcW: 2720,
  srcH: 1536,
  /** the band the strip shows: roof tops to the pavement */
  bandTop: 540,
  bandBottom: 870,
  /** the seven brass plates: centres, one row */
  plateXs: [216, 596, 976, 1356, 1736, 2116, 2496],
  plateY: 740,
  plateW: 112,
  plateH: 34,
  /** door pitch, for tiling the street past the plate's edges */
  pitch: 380,
  /** door frame colours, left to right, for the vector fallback */
  doorColors: ["#9fd9b5", "#f0857a", "#f2dc8c", "#8fbde8", "#c7a8e6", "#efe2c4", "#a9dbb8"],
} as const;
