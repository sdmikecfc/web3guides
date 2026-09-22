/**
 * THE FRONT set dressing, AUTHORED BY MIKE in /s6/front/editor (the seed
 * never designs; the editor's SAVE writes this file via /api/s6/dev-layout).
 * Items render y-sorted into the world; `bld-*` keys are CLICKABLE and
 * navigate to their route. Coordinates are sim px (2600x1080).
 */
export interface LayoutItem {
  key: string; // art key under /s6-art/front/set/<key>.png
  x: number;
  y: number; // ground contact
  s: number; // scale, 1 = 100% of the baked sprite
  flip?: boolean;
}

export const BUILDING_ROUTES: Record<string, string> = {
  "bld-base": "/s6/hq",
  "bld-board": "/s6/board",
  "bld-ironjaw": "/s6/games/ironjaw",
  "bld-strain": "/s6/games/strain",
  "bld-stopclock": "/s6/games/stopclock",
  "bld-arcade": "/s6/play",
  "bld-challenges": "/s6/board",
  "bld-kitchen": "", // SOON - not clickable yet
  "bld-riot": "/s6/games/riot",
};

/** Where the 10 domain mainframes STAND (index = sort_order rank). Mike
 * authors these in the editor; the ladder math sorts by x, so keep the
 * west-to-east reading order when moving them. */
// MAINFRAME STANDS. Sprites anchor at (0.5, 1), so `y` is the FEET and the art
// grows UPWARD - the same law the prop nudge learned on 2026-08-15. Drawn
// height is 118px wide x the art's aspect: arch1 112px, arch2 162px, arch3
// 81px, cycling by index. Every stand must satisfy `y - height >= 80` (the top
// of the painted ground) or the mainframe's spire hangs off the board.
// Mike, 2026-08-16: "the icon for hexline.ai needs to go down a little so it's
// on the map" - idx 4 sat at y=153 with a 162px tower, i.e. 9px ABOVE the
// board. idx 6 (signal.zone) was the same defect one stand over at y=174.
export const MILESTONE_SPOTS: Array<{ x: number; y: number }> = [
  { x: 959, y: 954 },
  { x: 1770, y: 838 },
  { x: 1182, y: 574 },
  { x: 1353, y: 400 },
  { x: 1027, y: 258 }, // hexline.ai: 162px tower -> top 96, clear of the band
  { x: 1476, y: 885 },
  { x: 1697, y: 208 }, // signal.zone: 112px tower -> top 96, same fix
  { x: 2034, y: 620 },
  { x: 2183, y: 388 },
  { x: 1609, y: 806 },
];

export const FRONT_LAYOUT: LayoutItem[] = [
  // FIVE ITEMS NUDGED 2026-08-15 (Mike: "Things are off screen"). Sprites
  // anchor at (0.5, 1), so `y` is the item's FEET and its art grows UPWARD -
  // which is why a tree authored at y=59 had its whole canopy off the board.
  // Every entry below now fits inside the painted ground (y 80..1046, the
  // slab bevel outside it) with no footprint overlapping another by more than
  // 5%. Positions are still Mike's to set: /s6/front/editor, save on localhost.
  { key: "bld-base", x: 351, y: 303, s: 1 },
  { key: "bld-board", x: 797, y: 244, s: 0.63 },
  { key: "bld-ironjaw", x: 130, y: 658, s: 0.9 },
  { key: "bld-strain", x: 597, y: 260, s: 0.54 },
  { key: "bld-stopclock", x: 132, y: 1005, s: 0.9 },
  { key: "bld-arcade", x: 494, y: 455, s: 0.765 },
  { key: "bld-challenges", x: 194, y: 216, s: 0.8 },
  { key: "bld-kitchen", x: 343, y: 1019, s: 0.8 },
  { key: "bld-riot", x: 662, y: 573, s: 0.648 }, // -10% then -20% more (Mike 2026-08-16/17)
  { key: "prop-tree-oak", x: 188, y: 322, s: 0.7 },
  { key: "prop-tree-oak", x: 491, y: 688, s: 0.8 },
  { key: "prop-tree-pine", x: 573, y: 851, s: 0.75 },
  { key: "prop-tree-pine", x: 260, y: 860, s: 0.7 },
  { key: "prop-watertower", x: 342, y: 603, s: 0.8 },
  { key: "prop-sandbags", x: 801, y: 607, s: 0.8 },
  { key: "prop-statue-hero", x: 1799, y: 344, s: 0.8 },
  { key: "prop-tree-dead", x: 1290, y: 208, s: 0.7 },
  { key: "prop-tree-dead", x: 950, y: 800, s: 0.8 },
  { key: "prop-ruin-house", x: 1201, y: 813, s: 0.85 },
  { key: "prop-wreck-mech", x: 1722, y: 1013, s: 0.9 },
  { key: "prop-ruin-tower", x: 953, y: 395, s: 0.8 },
  { key: "prop-statue-fallen", x: 747, y: 505, s: 0.85 },
  { key: "prop-tree-dead", x: 2000, y: 420, s: 0.7 },
  { key: "prop-tree-pine", x: 779, y: 1037, s: 1 },
  { key: "prop-tree-oak", x: 946, y: 213, s: 1 },
  { key: "prop-tree-oak", x: 700, y: 329, s: 1 },
  { key: "prop-tree-oak", x: 1070, y: 215, s: 1 },
];
