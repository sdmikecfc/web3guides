/**
 * SEASON 5 (UPRISING) — THE WORLD DESCRIPTOR.
 *
 * THIS IS THE FILE A NEW SEASON COPIES AND EDITS. The engine (src/lib/world,
 * src/app/_world) draws whatever this says and knows nothing about tanks,
 * mainframes or Signal. S6 = copy this file, move the coordinates, rename the
 * places, point artRoot at a new folder. No engine change, no new map
 * component, no 1,400-line rewrite.
 *
 * THE GEOGRAPHY, and why it is laid out this way:
 *
 *   BOTTOM-LEFT   YOUR GROUND. The base plus every facility you own (workshop,
 *                 depot, trophy court, field school, radio mast, command post).
 *                 Friendly, dense, warm. A new player's eye lands here first
 *                 because it is the brightest, busiest corner.
 *   MIDDLE BAND   THE ARCADE COUNTRY. Four game places strung along the rear
 *                 roads between your ground and the front. Deliberately
 *                 between: you pass them on the way to the fighting.
 *   UPPER TWO     THE FRONT. Eleven mainframes in a serpentine advance, in
 *   THIRDS        LISTING ORDER (first listing bottom-left, last top-left), so
 *                 the map reads as a campaign moving up the board.
 *   RIGHT EDGE    The muster field (other pilots) and the Power Station,
 *                 fenced off and cold.
 *
 * COORDINATES ARE NORMALIZED 0..1 and are the GROUND-CONTACT point of each
 * structure, never its centre (sprites anchor bottom-centre). Sizes are
 * fractions of world WIDTH; height follows each asset's own aspect.
 *
 * CLIENT-SAFE. No server-only import, no next/headers. Labels are plain
 * English on purpose: STRINGS in lib/s6/strings.ts is typed `S6Dict = typeof
 * en`, so adding keys to `en` breaks the build unless ko and zh gain the same
 * keys in the same commit. Localizing the map is a deliberate follow-up step,
 * not something to smuggle into the middle of a build.
 */
import type { WorldConfig, WorldSite } from "@/lib/world/types";
import { FIT_CAMPS, FIT_CROSSINGS, FIT_PADS, FIT_PATHS, FIT_RIVERS, FIT_ROADS, FIT_SITES, FIT_SLOTS, FIT_TRACKS } from "./world.fit";

/**
 * SITE KEYS THAT WERE RENAMED AFTER THE LAYOUT WAS AUTHORED.
 *
 * map-layout.txt is re-exported by hand from the map editor whenever the camps
 * or roads move, and that export knows nothing about a rename done later in
 * code. It has now silently dropped Domain Kitchen off its spot TWICE: the
 * editor writes `powerstation`, the descriptor says `domainkitchen`, the
 * FIT_SITES lookup misses, and the site quietly falls back to its hardcoded
 * position somewhere else on the board. No error, just a building in the wrong
 * place.
 *
 * Aliasing here means a re-export can never move it again, and the layout file
 * stays whatever the editor wants to call it.
 */
const FIT_KEY_ALIAS: Record<string, string> = {
  domainkitchen: "powerstation", // ADR-0100 teaser took the sealed plant's plot
};

/** Accents. Bright enough to hold their own on a sunlit painted ground, and
 * distinct per destination TYPE so the board is colour-readable before a
 * single label is legible. */
const EMBER = "#e0662e"; // the season accent: home + the war board
const GOLD = "#f0b340";
const BRASS = "#c9a227";
const OLIVE = "#8fa86b";
const SKY = "#4aa3d8";
const AMBER = "#e8a33d";
const VIOLET = "#8b6fd4";
const TEAL = "#35b5a0";
const SIGNAL = "#a2d15c";
const PALE = "#7fb2c9";
const SLATE = "#6f7d8c";
const TAN = "#b8845c";

/**
 * THE FLOOR when no painted plate has loaded (or before any exists). This is
 * not a placeholder grey: it is a real sunlit landscape ramp — hazy blue-green
 * distance at the top, sunlit grass through the middle, warm ochre earth in
 * the foreground where your camp sits — plus a warm sun wash over your ground
 * and a cool wash over the far country.
 *
 * It matters more than it looks. Mike's note on the old map was "the map is
 * still black or so dark I can't tell whats going on", and this is what paints
 * on first load, on a slow connection, and forever for any asset that never
 * gets made.
 */
const GROUND_CSS = `
  radial-gradient(1100px 620px at 18% 88%, rgba(236,190,118,0.44) 0%, rgba(236,190,118,0) 62%),
  radial-gradient(900px 520px at 62% 10%, rgba(150,196,214,0.36) 0%, rgba(150,196,214,0) 68%),
  radial-gradient(1300px 700px at 88% 58%, rgba(168,206,126,0.26) 0%, rgba(168,206,126,0) 70%),
  linear-gradient(178deg,
    #86adbe 0%,
    #8fb894 15%,
    #8dbd7c 33%,
    #9cc275 51%,
    #b3bd76 69%,
    #c4b078 86%,
    #cbab72 100%)
`;

const S6_WORLD_AUTHORED: WorldConfig = {
  artRoot: "/s6-art/world",
  // 16:9. Chosen for two reasons that agree: it is a NATIVE generation ratio
  // (16:10 is not, so a plate would have to be cropped), and on a 1920x1080
  // screen it shows 95% of the board against 16:10's 86%.
  // 2:1 since the 2026-08-01 plate (Mike picked the lush candidate; wider
  // world = the two-week two-front board). Cover-clamp on a 16:9 desktop shows
  // ~89% of the width at k=1, so the overview survives; phones pan as before.
  aspect: 2 / 1,
  ground: { far: "bg-land-far", near: "bg-land" },
  groundCss: GROUND_CSS,
  zoom: { min: 1, max: 3.2 },
  // Measured, not guessed. At 1920x1080 (nav 52px) the viewport is 1920x1028
  // against a 1920x1200 world, so 0.061..0.917 of the board is visible here.
  // The far rank's forts top out at y 0.085 and the lowest label bottoms at
  // 0.846, clear of the Places dock at 0.857. The whole board fits.
  openAt: { x: 0.5, y: 0.489, k: 1 },
  targetSize: 0.046,

  // THREE ARCHETYPES, assigned round-robin by listing index. Eleven copies of
  // one fort is the loudest possible tell that a map was generated; three
  // silhouettes (blocky keep, low star bastion, tall round tower) break that up
  // while staying obviously the same engineering corps. Each archetype carries
  // its own damage ladder, generated as edits off its own intact render, so a
  // wall always falls apart into ITSELF.
  targetArt: [
    { intact: "fort-intact", sieged: "fort-sieged", breaching: "fort-breaching", breached: "fort-breached" },
    { intact: "fort2-intact", sieged: "fort2-sieged", breaching: "fort2-breaching", breached: "fort2-breached" },
    { intact: "fort3-intact", sieged: "fort3-sieged", breaching: "fort3-breaching", breached: "fort3-breached" },
  ],

  /**
   * A painted PLACE maps to whichever game currently sits on it. The S6 slate
   * moved FIVE times in three days (tankbuster -> armorclash, holdline ->
   * warpath, warbirds -> warhawks, descent -> rollout -> breakthrough), so
   * binding a coordinate or a painting to a game key would mean a re-render
   * every time Mike changes his mind about a game. Here it costs one line, and
   * that is exactly why it is one line.
   *
   * An unmapped or retired key falls through to the generic proving ground, so
   * a slate change can never leave a hole on the map.
   */
  gameSlots: {
    airfield: "warhawks", // planes over the front
    convoyroad: "warpath", // the supply road fight
    arena: "armorclash", // the walled town, tanks and towers
    ridgepass: "vanguard", // the road up through the ridge pass
  },

  /**
   * THE ADVANCE. Fixed by LISTING INDEX and never by status — a wall that falls
   * must not jump across the board (ADR-0008, stated twice in the existing
   * code). The 2026-08-01 rev-2 board (Mike: "base stuff on one side, domains
   * on the wasteland side"): the lush east is ENTIRELY friendly; all ten
   * mainframes stand in the scorched west - t0-t4 the near rank along the
   * south field, t5-t9 the deep rank across the north. Mirrors FIT_SLOTS.
   */
  targetSlots: [
    { x: 0.59, y: 0.6 },
    { x: 0.44, y: 0.585 },
    { x: 0.3, y: 0.6 },
    { x: 0.155, y: 0.57 },
    { x: 0.075, y: 0.665 },
    { x: 0.33, y: 0.42 },
    { x: 0.415, y: 0.195 },
    { x: 0.565, y: 0.135 },
    { x: 0.14, y: 0.42 },
    { x: 0.1, y: 0.25 },
  ],

  /**
   * THE RIVER. Enters top-left, swings south through the middle of the board
   * and leaves bottom-right, so it separates YOUR GROUND from THE FRONT and the
   * campaign has to cross it. Real bends rather than a ruled diagonal.
   */
  rivers: [
    [
      { x: 0.010, y: 0.268 },
      { x: 0.108, y: 0.318 },
      { x: 0.205, y: 0.392 },
      { x: 0.286, y: 0.478 },
      { x: 0.352, y: 0.572 },
      { x: 0.408, y: 0.668 },
      { x: 0.452, y: 0.762 },
      { x: 0.488, y: 0.858 },
      { x: 0.515, y: 0.955 },
    ],
  ],

  /**
   * THE ROAD NETWORK. Four routes with distinct jobs, so the board reads as a
   * theatre rather than a set of parallel stripes:
   *   1. the rear supply road curving through your own ground
   *   2. the front road following the line of the mainframes
   *   3. the WEST crossing, over the river near the bend
   *   4. the EAST crossing, so there is more than one way north
   */
  roads: [
    [
      { x: 0.055, y: 0.3 },
      { x: 0.1414, y: 0.2529 },
      { x: 0.2312, y: 0.2574 },
      { x: 0.321, y: 0.2672 },
      { x: 0.4092, y: 0.2327 },
      { x: 0.4989, y: 0.2426 },
      { x: 0.5888, y: 0.2483 },
      { x: 0.6773, y: 0.2162 },
      { x: 0.7669, y: 0.2313 },
      { x: 0.8569, y: 0.2324 },
      { x: 0.945, y: 0.196 },
    ],
    [
      { x: 0.09, y: 0.815 },
      { x: 0.1581, y: 0.8341 },
      { x: 0.2264, y: 0.8509 },
      { x: 0.295, y: 0.8611 },
      { x: 0.3639, y: 0.8649 },
      { x: 0.4328, y: 0.862 },
      { x: 0.5015, y: 0.8517 },
      { x: 0.57, y: 0.838 },
    ],
    [
      { x: 0.93, y: 0.76 },
      { x: 0.908, y: 0.8273 },
      { x: 0.8505, y: 0.8689 },
      { x: 0.7795, y: 0.8689 },
      { x: 0.722, y: 0.8273 },
      { x: 0.7, y: 0.76 },
      { x: 0.722, y: 0.6927 },
      { x: 0.7795, y: 0.6511 },
      { x: 0.8505, y: 0.6511 },
      { x: 0.908, y: 0.6927 },
      { x: 0.93, y: 0.76 },
    ],
    [
      { x: 0.57, y: 0.838 },
      { x: 0.64, y: 0.812 },
      { x: 0.735, y: 0.79 },
      { x: 0.815, y: 0.76 },
      { x: 0.845, y: 0.66 },
      { x: 0.86, y: 0.56 },
      { x: 0.87, y: 0.44 },
      { x: 0.88, y: 0.33 },
    ],
  ],

  /** Derived by intersecting roads with rivers in map-fit.py; kept only as a
   * fallback if the fit has not been generated. */
  crossings: [],

  sites: [
    // ── YOUR GROUND. CONDENSED: Upgrade, Kit, Trophies, News and How To Play
    //    were separate buildings until the plate was measured. It holds about
    //    19 well-spaced structures, not 24, and crowding five small huts around
    //    the base to hit the count is exactly the "menu bar with random shit
    //    everywhere" look this rebuild exists to end. They are reachable as
    //    popups off the base instead. ────────────────────────────────────────────
    {
      key: "basecamp",
      kind: "home",
      label: "Your Base",
      blurb: "Your tank, your pilot, your kit.",
      pos: { x: 0.815, y: 0.76 },
      size: 0.104, // the biggest friendly structure on the board, on purpose
      art: "site-basecamp",
      glyph: "camp",
      accent: EMBER,
      // Four garage panels as tabs over the map, rather than a page jump.
      opens: { kind: "popup", body: "garage" },
      life: { smoke: true, flag: true },
      tier: 1,
    },
    {
      key: "commandpost",
      kind: "nav",
      label: "Leaderboards",
      blurb: "Season standings and mini-game scores.",
      pos: { x: 0.665, y: 0.7082 },
      size: 0.044,
      art: "site-commandpost",
      glyph: "board",
      accent: EMBER,
      opens: { kind: "popup", body: "board" },
      life: { flag: true },
      tier: 1,
    },
                    
    // ── ARCADE COUNTRY (the middle band) ─────────────────────────────────────
    {
      key: "convoyroad",
      kind: "game",
      label: "Mini Game",
      pos: { x: 0.1186, y: 0.777 },
      size: 0.052,
      art: "site-convoyroad",
      glyph: "arcade",
      accent: AMBER,
      opens: { kind: "game", slot: "convoyroad" },
      life: { glow: true },
      tier: 1,
    },
    {
      key: "airfield",
      kind: "game",
      label: "Mini Game",
      pos: { x: 0.2588, y: 0.8106 },
      size: 0.052,
      art: "site-airfield",
      glyph: "arcade",
      accent: SKY,
      opens: { kind: "game", slot: "airfield" },
      life: { glow: true },
      tier: 1,
    },
    {
      key: "arena",
      kind: "game",
      label: "Mini Game",
      pos: { x: 0.4002, y: 0.8182 },
      size: 0.052,
      art: "site-arena",
      glyph: "arcade",
      accent: VIOLET,
      opens: { kind: "game", slot: "arena" },
      life: { glow: true },
      tier: 1,
    },
    {
      key: "ridgepass",
      kind: "game",
      label: "Mini Game",
      pos: { x: 0.5412, y: 0.7978 },
      size: 0.052,
      art: "site-ridgepass",
      glyph: "arcade",
      accent: TEAL,
      opens: { kind: "game", slot: "ridgepass" },
      life: { glow: true },
      tier: 1,
    },

    // ── THE RIGHT EDGE ───────────────────────────────────────────────────────
    {
      key: "muster",
      kind: "roam",
      label: "Challenges",
      blurb: "The score to beat in every game, and a way straight at it.",
      pos: { x: 0.945, y: 0.56 },
      size: 0.040,
      art: "site-muster",
      glyph: "signpost",
      accent: TAN,
      // WAS a route to /s6/explore, a second whole page for looking at other
      // pilots. They stand on THIS map now, so that page was showing an
      // emptier version of the board you were already on. The post carries
      // the challenge board instead: everyone plays the same daily seed, so
      // a score is directly comparable and worth going after.
      opens: { kind: "popup", body: "challenges" },
      life: { flag: true },
      tier: 2,
    },
    {
      // DOMAIN KITCHEN, the teaser landmark (replaces the anonymous power
      // station, Mike 2026-08-04). A roadside diner with a giant chef holding a
      // cloche on the roof: the Lard Lad move, where the mascot IS the
      // building's identity, so it reads as a place from across the map.
      //
      // The art faces LEFT on purpose. It sits at x 0.7, the right-hand side of
      // the board, so a right-facing building would stare off the edge; the
      // source render was mirrored before export.
      //
      // Slightly larger than the site it replaces because it is TALL rather
      // than wide (aspect 0.85 against the power station's 1.23) and `size` is
      // a WIDTH fraction, so matching widths would have shrunk its presence.
      key: "domainkitchen",
      kind: "locked",
      label: "Domain Kitchen",
      blurb: "A restaurant you run with a real domain position.",
      pos: { x: 0.7, y: 0.56 },
      size: 0.046,
      art: "site-domainkitchen",
      glyph: "plant",
      accent: EMBER,
      // GLOW, and therefore NOT dimmed (see the dimmed rule in WorldMap): this
      // is the one locked site that is advertising rather than sealed.
      life: { glow: true },
      opens: {
        kind: "locked",
        note:
          "Your position in a domain becomes your restaurant. The liquidity you add sets how many tables you have. Your trading volume sets how fast the kitchen runs. How well you play sets the service. Every domain unlocks its own dishes.",
      },
      tier: 2,
    },
  ],
};

/** The generic destination a game place falls back to when its slot is
 * unmapped or points at a retired key. Never a dead end. */
/**
 * Per-slot fort sprite width multiplier, by LISTING INDEX like everything
 * else on the board (ADR-0008: position and now mass are bound to the index,
 * never to status). clamp(0.95 + 0.55 * sqrt(raise / 25000)) over the Aug-3
 * slate's raises, so the map tells the money story at a glance:
 * applications.com (t7, $25k raise) renders as a 1.5x CITADEL, fyi.xyz (t1,
 * $10k) a 1.3x bastion, the $500-750 walls stay near 1x. Both monster raises
 * land on fort2, the LOW wide archetype (i%3), so scale reads as breadth and
 * never worsens the tall-fort clipping budget.
 */
export const S6_TARGET_SCALE = [1.05, 1.3, 1.04, 1.0, 1.08, 1.22, 1.16, 1.5, 1.06, 1.06];

/** The authored PLAYER SAFE AREA (map-layout.txt `camp` line, draggable in
 * map-editor.html). null on a layout that predates the concept - consumers
 * fall back to deriving the campground from the muster sign. */
/** THE PLAYER SAFE AREAS. Plural since 2026-08-02: one oval never covered every
 * piece of rear ground worth standing on, so a plate can now author as many
 * `camp` lines as it wants and the crowd is dealt across them by area. */
export const S6_CAMPS = FIT_CAMPS;

export const S6_GAME_FALLBACK = {
  label: "Proving Ground",
  blurb: "Field exercises. Small Signal, big bragging rights.",
  href: "/s6/play",
};

/**
 * THE AUTHORED POSITIONS ABOVE ARE HINTS, NOT FINAL COORDINATES.
 *
 * `python map-fit.py` reads the road and river network authored above, settles
 * every hint onto ground that actually works, and writes world.fit.ts. This
 * applies that result. The guarantees it enforces — nothing in a river,
 * nothing straddling a road, everything within reach of one, nothing
 * overlapping — are things hand-typed coordinates cannot promise and kept
 * failing to deliver: buildings sat in the river and forts crowded each other
 * because two files described the same geography and neither checked the other.
 *
 * A new season therefore authors roads, rivers and rough hints, runs the tool,
 * and gets a laid-out board. If the fit is ever missing a key, that site simply
 * keeps its authored hint, so this can never blank the map.
 */
/**
 * TANK ROUTES, hand-traced over the painted roads in map-layout.txt.
 *
 * Deliberately NOT the same thing as `roads`. `roads` is the network the
 * engine DRAWS, and it is empty this season because the plate already has its
 * roads painted in - drawing more would put a second, disagreeing set on top.
 * These are the lines armour FOLLOWS, and nothing renders them.
 *
 * Automatic extraction was tried three times and failed three times, always
 * for the same reason: a road and the ground beside it are the same paint
 * (road h 0.133 v 0.637, bright lawn h 0.135 v 0.638), so neither colour nor
 * width can separate them. Tracing by hand onto the picture cannot disagree
 * with the picture, and costs about five minutes a season.
 *
 * If a season's plate has no painted roads, put the network in `roads` and it
 * will be drawn AND followed; this stays empty and nothing else changes.
 */
export const S6_WORLD_PATHS = FIT_PATHS.length ? FIT_PATHS : FIT_ROADS;

export const S6_WORLD_PADS = FIT_PADS;
export const S6_WORLD_TRACKS = FIT_TRACKS;

export const S6_WORLD: WorldConfig = {
  ...S6_WORLD_AUTHORED,
  // The RESOLVED network: wander baked in upstream so what is drawn and what is
  // collided against are the same lines, and crossings derived by actually
  // intersecting roads with rivers rather than guessing where they meet.
  // NOT a fallback. This season's plate has its roads, river and bridges
  // PAINTED IN, so the vector network must stay empty - falling back to the
  // authored one would draw a second, disagreeing set of roads on top of the
  // painting. A season whose plate has no roads puts them back here.
  roads: FIT_ROADS,
  rivers: FIT_RIVERS,
  crossings: FIT_CROSSINGS,
  sites: S6_WORLD_AUTHORED.sites.map(
    (s): WorldSite => {
      const pos = FIT_SITES[s.key] || FIT_SITES[FIT_KEY_ALIAS[s.key]];
      return pos ? { ...s, pos } : s;
    },
  ),
  targetSlots: FIT_SLOTS.length ? FIT_SLOTS : S6_WORLD_AUTHORED.targetSlots,
};
