/**
 * THE FRONT set dressing, AUTHORED BY MIKE in /s7/front/editor (the seed
 * never designs; the editor's SAVE writes this file via /api/s7/dev-layout).
 * Items render y-sorted into the world; `bld-*` keys are CLICKABLE and
 * navigate to their route. Coordinates are sim px (2600x1080).
 */
export interface LayoutItem {
  key: string; // art key under /s7-art/front/set/<key>.png
  x: number;
  y: number; // ground contact
  s: number; // scale, 1 = 100% of the baked sprite
  flip?: boolean;
}

export const BUILDING_ROUTES: Record<string, string> = {
  "bld-base": "/s7/hq",
  "bld-board": "/s7/board",
  "bld-ironjaw": "/s7/games/gauntlet",
  "bld-strain": "/s7/games/horde",
  "bld-stopclock": "/s7/games/crypt",
  "bld-arcade": "/s7/play",
  "bld-challenges": "/s7/board",
  "bld-kitchen": "", // SOON - not clickable yet
  "bld-riot": "/s7/games/ascent",
};

/** Where the 10 domain keeps STAND (index = sort_order rank). Mike
 * authors these in the editor; the ladder math sorts by x, so keep the
 * west-to-east reading order when moving them. */
// KEEP STANDS. Sprites anchor at (0.5, 1), so `y` is the FEET and the art
// grows UPWARD - the same law the prop nudge learned on 2026-08-15. Drawn
// height is 118px wide x the art's aspect: arch1 112px, arch2 162px, arch3
// 81px, cycling by index. Every stand must satisfy `y - height >= 80` (the top
// of the painted ground) or the keep's spire hangs off the board.
// Mike, 2026-08-16: "the icon for hexline.ai needs to go down a little so it's
// on the map" - idx 4 sat at y=153 with a 162px tower, i.e. 9px ABOVE the
// board. idx 6 (signal.zone) was the same defect one stand over at y=174.
export const MILESTONE_SPOTS: Array<{ x: number; y: number }> = [
  { x: 1671, y: 403 },
  { x: 1552, y: 594 },
  { x: 1757, y: 105 },
  { x: 1353, y: 400 },
  { x: 2422, y: 582 },
  { x: 2049, y: 174 },
  { x: 1866, y: 449 },
  { x: 2150, y: 669 },
  { x: 2266, y: 370 },
  { x: 1545, y: 216 },
];

export const FRONT_LAYOUT: LayoutItem[] = [
  { key: "bld-base", x: 526, y: 357, s: 1 },
  { key: "bld-board", x: 455, y: 719, s: 0.63 },
  { key: "bld-ironjaw", x: 97, y: 673, s: 0.9, flip: true },
  { key: "bld-strain", x: 256, y: 422, s: 0.54 },
  { key: "bld-stopclock", x: 1335, y: 907, s: 0.9 },
  { key: "bld-arcade", x: 274, y: 296, s: 0.77 },
  { key: "bld-challenges", x: 526, y: 232, s: 0.8 },
  { key: "bld-kitchen", x: 594, y: 959, s: 0.8 },
  { key: "bld-riot", x: 411, y: 841, s: 0.65 },
  { key: "war-camp", x: 700, y: 392, s: 0.55 },
  { key: "prop-tree-oak", x: 385, y: 168, s: 0.7 },
  { key: "prop-tree-oak", x: 444, y: 181, s: 0.8 },
  { key: "prop-tree-pine", x: 1336, y: 1043, s: 0.75 },
  { key: "prop-tree-pine", x: 260, y: 860, s: 0.7 },
  { key: "prop-watertower", x: 1047, y: 547, s: 0.42 },
  { key: "prop-sandbags", x: 968, y: 712, s: 0.8 },
  { key: "prop-tree-dead", x: 1290, y: 208, s: 0.7 },
  { key: "prop-tree-dead", x: 1961, y: 835, s: 0.8 },
  { key: "prop-ruin-house", x: 1764, y: 759, s: 0.85 },
  { key: "prop-wreck-hero", x: 1727, y: 584, s: 0.9 },
  { key: "prop-ruin-tower", x: 1374, y: 178, s: 0.8 },
  { key: "prop-statue-fallen", x: 1563, y: 157, s: 0.85 },
  { key: "prop-tree-dead", x: 2000, y: 420, s: 0.7 },
  { key: "prop-tree-pine", x: 1123, y: 1046, s: 1 },
  { key: "prop-tree-oak", x: 1228, y: 1000, s: 1 },
  { key: "prop-tree-oak", x: 1266, y: 1046, s: 1 },
  { key: "prop-tree-oak", x: 1186, y: 1045, s: 1 },
  { key: "prop-wreck-hero", x: 2505, y: 179, s: 1 },
];
