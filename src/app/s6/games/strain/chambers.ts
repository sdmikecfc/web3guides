/**
 * STRAIN - the AUTHORED content: chamber sets. The seed never designs, it
 * only selects one of these hand-authored sets for the day.
 *
 * DESIGN SPACE 360x480. All numbers below are design px.
 *
 * FIVE CHAMBERS PER SET. Chamber 5 holds THE WARDEN and is the win.
 *
 * THE 2026-08-15 STEALTH REBUILD (Mike played the walled build and rejected
 * it: "no challenge, no excitement... make it more like a stealth game. Hide
 * from enemies who do patrols, dense building with lots of walls. There are
 * cameras. If the enemies see you for more than 3 seconds before you eat them
 * the alarm goes off and the warden starts perma chasing you for that level").
 * Two things changed in this file and nothing else did:
 *   1. THE FLOORPLANS GOT DENSE. 8/11/14/15/17 wall pieces (was 3/4/5/5/6) at
 *      14 px thickness instead of 22, so the extra pieces buy ROOMS - an
 *      intake hall, a 3x3 sorting grid, an archive of stacks, a banded
 *      foundry, and a perimeter hall wrapped around the core's nested lanes.
 *      Every passage is authored at 58 px: the hard floor is 44 (2 x CLEAR_R)
 *      and 58 guarantees at least two free columns on the validator's 6 px
 *      BFS grid, which is the trap that silently disconnects a floor.
 *   2. CAMERAS. 2/2/3/3/4 per chamber, authored at the chokepoints, sweeping
 *      a hand-authored arc. They cannot be eaten; they are geometry to route
 *      around, and they trip the alarm exactly like a machine's own eyes.
 * The perception tables below are authored data too - the sim derives every
 * bot's cone from them, it does not invent numbers.
 *
 * THE 2026-08-17 ROUND-7 PASS (Mike, fourth complaint: "Strain is still really
 * easy... Maybe we need cameras and turrets that cannot be destroyed and have
 * to be avoided. Also half walls or boxes you can hide behind and sneak behind
 * to get around enemies or turrets"). Two AUTHORED entity classes landed here,
 * and the seed still only selects:
 *   1. TURRETS. Static cones on the chokepoints the walls already create -
 *      1/2/2/3/4 per chamber, escalating with depth. They cannot be corrupted
 *      or destroyed at any tier and touching one does nothing at all; what
 *      they do is LOCK and SHOOT. They are the first thing in this game that
 *      costs HP without a body touching the blob, and they are the answer to
 *      the measured round-6 finding that a strong player was inside SOME cone
 *      only 3.8-17.6% of chamber frames: the gap was COVERAGE, and a turret is
 *      coverage that cannot walk away.
 *   2. LOW COVER. 2/3/4/5/6 crates per chamber. The blob (and every machine)
 *      crosses them freely; NO eye sees through them. That is the counterplay
 *      that makes an unavoidable gun fair, and validateSets() proves it per
 *      turret rather than trusting the author's eye.
 * The pairing is the design: a gunned slot always carries its crate, so the
 * route through a chokepoint is "read the wedge, find the crate, go".
 *
 * EQUAL-CEILING LAW: every set uses the IDENTICAL roster multiset per
 * chamber slot (same tier counts, same hunter tier, same door tier, warden
 * on the same slot), the same camera count, the same turret radius/half-angle
 * multiset AND the same crate-area multiset per slot; only the PLACEMENTS,
 * WALLS, CONES and patrol routes differ. The ceiling is therefore one number
 * for every set by construction, and validateSets() asserts it anyway.
 *
 * ROSTERS PER CHAMBER (every set identical; the validator asserts the exact
 * multiset, and the growth units are what fund the inversion):
 *   ch1  8 prey: 6xT1 + 2xT2                  = 10 growth units
 *   ch2 12 prey: 4xT1 + 6xT2 + 2xT3           = 22 units (cum 32)
 *   ch3 14 prey: 2xT1 + 6xT2 + 4xT3 + 2xT4    = 34 units (cum 66)
 *   ch4 15 prey: 4xT2 + 6xT3 + 4xT4 + 1xT5    = 47 units (cum 113)
 *   ch5 16 prey: 2xT2 + 5xT3 + 5xT4 + 4xT5    = 59 units (cum 172)
 * 65 prey per lap. UNCHANGED by the stealth rebuild: the inversion economy
 * is proven, geometry and perception were the ask.
 *
 * THE INVERSION, PRICED. Hunters are T3/T4/T5/T6/T7 and the tier thresholds
 * are set so a NEAR-FULL CLEAR of chamber i - and nothing less - makes
 * chamber i's hunter edible the LOUD way:
 *   need TIER_THRESHOLDS[hunter]  <=  prey units through chamber i
 *   need TIER_THRESHOLDS[hunter]  >   everything eatable BEFORE chamber i
 *      T3  8 <= 10   and  8 > 0   (any 7 of chamber 1's 8 meals, in any order)
 *      T4 30 <= 32   and 30 > 13   (10 prey + a T3 hunter)
 *      T5 62 <= 66   and 62 > 39
 *      T6 106 <= 113 and 106 > 78
 *      T7 164 <= 172 and 164 > 131
 * validateSets() re-derives both halves, so a roster edit that breaks the
 * inversion cannot reach a green harness gate. The QUIET way is new: reach
 * anything UNSEEN and it corrupts whatever its tier (sim.ts), which is what
 * makes stealth pay and what makes tripping the alarm cost you the warden.
 *
 * WALLS ARE THE PUZZLE: 6-20 pieces, never fewer than the chamber before.
 * Same field name and same collision grammar as the sibling game's
 * RoomDef.barriers (stopclock/rooms.ts). The validator BFSes the free space
 * at the biggest blob radius and asserts the spawn, the door, every bot
 * spawn and every waypoint sit in ONE connected region, and that every patrol
 * segment is clear at that bot's radius, so nothing can wedge and no meal can
 * become unreachable.
 *
 * AFK GATE: chamber 1's hunter patrol is authored to WALK THE SPAWN APRON
 * FACING IT. A cone-gated game needs a cone-gated gate, so the validator no
 * longer settles for "the polyline passes within 80 px": it samples the
 * route and proves some sample actually SEES the spawn (inside the hunter's
 * own vision radius, inside its half-angle, with the line of sight clear).
 *
 * AUTHORING NOTE: the floorplans, camera arcs and hunter beat points are
 * hand-drawn; an offline scratchpad tool (never shipped, never imported)
 * BFS-routes the patrol between the beats and farthest-point-spreads the
 * unchanged roster over the reachable floor, then prints this literal. What
 * ships is plain literals, and the seed still only selects.
 */

/** Tiers a PLAYER can reach. Bots may exceed it on deep laps (the sim spawns
 * un-eatable reinforcements past the warden); radius/points lookups clamp. */
export const MAX_TIER = 7;
/** Chambers in one lap of the authored set. Past it the set cycles deeper. */
export const CHAMBERS_PER_LAP = 5;
/** Every chamber drops the blob here (design px). */
export const SPAWN: [number, number] = [180, 430];

/** Blob radius by tier (design px); the Client draws from this table. */
export const BLOB_R_BY_TIER = [0, 10, 12, 14, 16, 18, 20, 22];
/** Bot radius by tier (design px). */
export const BOT_R_BY_TIER = [0, 7, 9, 11, 13, 15, 17, 19];
/** Radius for ANY tier, including the deep-lap reinforcements above MAX_TIER. */
export function botR(tier: number): number {
  return BOT_R_BY_TIER[Math.max(0, Math.min(MAX_TIER, tier))];
}
/** The clearance every wall gap must honour: a maxed blob has to fit. */
export const CLEAR_R = BLOB_R_BY_TIER[MAX_TIER];

// ── PERCEPTION (authored data; sim.ts derives every cone from these) ─────────
/** How far a prey machine sees, by tier. Bigger optics on bigger chassis, but
 * even the T7 warden's own drones see less than half the floor: cover is
 * always worth something. */
export const VISION_R_BY_TIER = [0, 72, 78, 86, 94, 102, 112, 124];
/** Prey cone half-angle, degrees. 40 means an 80 degree cone: wide enough to
 * be a real threat head-on, narrow enough that flanking is the answer. */
export const VISION_HALF_DEG = 40;
/** The hunter looks further and tighter than its prey. */
export const HUNTER_VISION_R = 138;
export const HUNTER_VISION_HALF_DEG = 36;
/** THE WARDEN sees furthest and widest. Walking into its cone on the fifth
 * floor is how a run ends. */
export const WARDEN_VISION_R = 158;
export const WARDEN_VISION_HALF_DEG = 42;

/** Vision radius for any tier (deep-lap reinforcements clamp to the top). */
export function visionR(tier: number): number {
  return VISION_R_BY_TIER[Math.max(0, Math.min(MAX_TIER, tier))];
}

/**
 * A WALL-MOUNTED TURRET (round 7). Mike named it: "cameras and turrets that
 * cannot be destroyed and have to be avoided". It is NOT a camera and NOT a
 * machine:
 *   - it cannot be corrupted at any tier and it cannot be destroyed;
 *   - its cone does NOT sweep. A static wedge is a thing you can READ off the
 *     screen and route around, which is the whole point of pairing it with low
 *     cover; a sweeping turret would be a timing dance instead of a puzzle;
 *   - hold still inside it and it LOCKS, and then it SHOOTS: real damage on a
 *     telegraphed cadence, the one hazard in the game that costs HP without
 *     anything touching you.
 * The fairness proof is authored, not asserted: validateSets() requires that
 * every turret's cone contains a reachable pocket that authored LOW COVER
 * shadows, so an unavoidable hazard always has a legal crossing.
 */
export interface TurretSpec {
  x: number;
  y: number;
  /** the STATIC facing in degrees (screen space: 0 = +x, 90 = +y i.e. down) */
  a: number;
  /** sight radius, design px */
  r: number;
  /** cone half-angle, degrees */
  half: number;
}

/**
 * LOW COVER (round 7). Mike: "half walls or boxes you can hide behind and
 * sneak behind to get around enemies or turrets". A crate the blob flows over:
 *   - it does NOT collide. Nothing - blob, machine, hunter - is slowed by it;
 *   - it BREAKS LINE OF SIGHT for every eye in the game (machine cones,
 *     cameras, turrets), using the exact same occlusion grammar as a wall.
 * SIMPLE OCCLUSION, not a press-against verb: being behind the crate IS the
 * hide. The blob already has a hold-still verb on space (HIDE_SEEN_MUL) and
 * stacking a second, invisible "am I pressed to it" state on top of a thing
 * you can walk over would be exactly the kind of unreadable rule this game
 * keeps having to delete. Same shape as a wall so the sim and the validator
 * can march both with one function.
 */
export type LowSpec = [number, number, number, number];

/** A ceiling-mounted camera: a cone that sweeps a0 -> a1 -> a0 over `period`
 * seconds (degrees, design px). It cannot be eaten and it never moves, so it
 * is pure geometry to time or route around - and it trips the alarm. */
export interface CamSpec {
  x: number;
  y: number;
  /** arc ends in degrees (screen space: 0 = +x, 90 = +y, i.e. down) */
  a0: number;
  a1: number;
  /** seconds for one full there-and-back sweep */
  period: number;
  /** sight radius, design px */
  r: number;
  /** cone half-angle, degrees */
  half: number;
}

export interface BotSpawn {
  tier: number;
  x: number;
  y: number;
  /** wander waypoints (design coords); fled from dynamically when prey */
  wps: [number, number][];
}

export interface HunterSpawn {
  tier: number;
  wps: [number, number][];
  /** THE WARDEN: chamber 5's hunter, top tier, and the win when eaten. */
  warden?: boolean;
}

export interface ChamberDef {
  doorTier: number;
  door: [number, number];
  /** x, y, w, h in design px. Blob AND bots collide and slide along these. */
  walls: [number, number, number, number][];
  /** LOW COVER: crossed freely by every body, opaque to every eye. */
  low: LowSpec[];
  /** the fixed eyes: authored at the chokepoints the walls create */
  cams: CamSpec[];
  /** the fixed GUNS: authored on the chokepoints, crossable only under cover */
  turrets: TurretSpec[];
  bots: BotSpawn[];
  hunter: HunterSpawn;
}

export type ChamberSet = [ChamberDef, ChamberDef, ChamberDef, ChamberDef, ChamberDef];

export const CHAMBER_SETS: ChamberSet[] = [
  // ── SET 0 ──
  [
    {
      doorTier: 2,
      door: [340, 240],
      walls: [
        [0, 372, 240, 14],
        [298, 372, 62, 14],
        [126, 220, 14, 152],
        [232, 154, 14, 152],
        [0, 140, 60, 14],
        [118, 140, 242, 14],
        [210, 0, 14, 84],
        [40, 40, 70, 14],
      ],
      // THE ONE WAY OUT of the spawn hall is the 58 px slot at x 240-298, so
      // that slot gets the floor's only turret and a crate standing IN the
      // doorway: cross under the crate and the gun never sees you, cross wide
      // and it does.
      low: [
        [234, 349, 30, 22],
        [302, 262, 30, 20],
      ],
      cams: [
        { x: 264, y: 300, a0: 55, a1: 125, period: 6, r: 108, half: 26 },
        { x: 76, y: 200, a0: -20, a1: 80, period: 7.5, r: 100, half: 24 },
      ],
      turrets: [{ x: 269, y: 322, a: 90, r: 104, half: 30 }],
      bots: [
        { tier: 1, x: 36, y: 456, wps: [[36, 456], [82, 456], [36, 410]] },
        { tier: 1, x: 336, y: 456, wps: [[336, 456], [293, 439], [307, 420]] },
        { tier: 1, x: 24, y: 312, wps: [[24, 312], [58, 343], [34, 267]] },
        { tier: 1, x: 168, y: 210, wps: [[168, 210], [188, 251], [165, 256]] },
        { tier: 1, x: 336, y: 258, wps: [[336, 258], [317, 300], [298, 285]] },
        { tier: 1, x: 24, y: 114, wps: [[24, 114], [57, 82], [69, 103]] },
        { tier: 2, x: 168, y: 24, wps: [[168, 24], [140, 61], [186, 66]] },
        { tier: 2, x: 336, y: 24, wps: [[336, 24], [297, 48], [290, 25]] },
      ],
      // PHASE, NOT ROUTE. Mike, 2026-08-15: "I spawn in a dense room with the
      // warden who immediately attacks and kills me." The route was right and
      // the STARTING INDEX was the bug: leg 1 walked the spawn apron, so the
      // hunter opened 120px away, 5 degrees off its own centreline, with clear
      // line to a player who had not moved yet. The apron legs are ROTATED TO
      // THE END: identical closed polyline (so the AFK gate, which samples the
      // whole loop, is unchanged and an idle player is still found and killed),
      // but the floor now OPENS with the hunter up-field and facing away.
      hunter: { tier: 3, wps: [[264, 342], [162, 318], [162, 198], [72, 198], [72, 300], [72, 198], [210, 198], [210, 330], [276, 354], [276, 408], [300, 432], [228, 426], [300, 414], [264, 408]] },
    },
    {
      doorTier: 3,
      door: [180, 30],
      walls: [
        [0, 140, 258, 14],
        [316, 140, 44, 14],
        [0, 300, 44, 14],
        [102, 300, 258, 14],
        [112, 154, 14, 60],
        [112, 272, 14, 28],
        [234, 212, 14, 88],
        [112, 314, 14, 108],
        [234, 372, 14, 108],
        [112, 0, 14, 82],
        [58, 60, 62, 14],
      ],
      // TWO BANDS, TWO SLOTS, TWO GUNS: the y=300 band's slot (x 44-102) and
      // the y=140 band's slot (x 258-316) are the only ways up this floor, so
      // each gets a turret staring down its approach and a crate in the mouth.
      low: [
        [66, 261, 26, 26],
        [256, 175, 26, 26],
        [196, 90, 30, 20],
      ],
      cams: [
        { x: 73, y: 288, a0: 30, a1: 150, period: 7, r: 104, half: 25 },
        { x: 287, y: 162, a0: 210, a1: 330, period: 8, r: 108, half: 26 },
      ],
      turrets: [
        { x: 74, y: 380, a: 270, r: 126, half: 30 },
        { x: 284, y: 210, a: 270, r: 106, half: 30 },
      ],
      bots: [
        { tier: 1, x: 288, y: 456, wps: [[288, 456], [334, 456], [288, 410]] },
        { tier: 1, x: 84, y: 354, wps: [[84, 354], [67, 397], [48, 383]] },
        { tier: 1, x: 24, y: 456, wps: [[24, 456], [34, 411], [55, 422]] },
        { tier: 1, x: 336, y: 360, wps: [[336, 360], [333, 406], [311, 398]] },
        { tier: 2, x: 210, y: 246, wps: [[210, 246], [172, 273], [164, 250]] },
        { tier: 2, x: 24, y: 258, wps: [[24, 258], [37, 214], [57, 226]] },
        { tier: 2, x: 330, y: 234, wps: [[330, 234], [302, 271], [288, 252]] },
        { tier: 2, x: 234, y: 114, wps: [[234, 114], [188, 115], [194, 92]] },
        { tier: 2, x: 108, y: 114, wps: [[108, 114], [65, 99], [108, 114]] },
        { tier: 2, x: 336, y: 114, wps: [[336, 114], [291, 105], [301, 84]] },
        { tier: 3, x: 192, y: 24, wps: [[192, 24], [238, 26], [231, 48]] },
        { tier: 3, x: 24, y: 24, wps: [[24, 24], [29, 70], [27, 50]] },
      ],
      hunter: { tier: 4, wps: [[180, 432], [150, 444], [60, 444], [60, 438], [66, 336], [66, 276], [60, 222], [96, 240], [180, 252], [210, 186], [300, 180], [294, 180], [294, 114], [300, 60], [180, 42], [150, 108], [48, 108], [282, 114], [282, 180], [150, 198], [150, 240], [78, 252], [78, 336], [90, 444], [180, 444]] },
    },
    {
      doorTier: 4,
      door: [20, 180],
      walls: [
        [58, 60, 42, 56],
        [158, 60, 42, 56],
        [258, 60, 42, 56],
        [58, 174, 42, 56],
        [158, 174, 42, 56],
        [258, 174, 42, 56],
        [58, 288, 42, 56],
        [158, 288, 42, 56],
        [258, 288, 42, 56],
        [58, 402, 42, 56],
        [258, 402, 42, 56],
        [164, 116, 14, 58],
        [264, 230, 14, 58],
        [64, 344, 14, 58],
      ],
      // THE DOOR IS DOWN THE LEFT MARGIN and the margin is a 58 px shaft, so
      // one gun looks straight up it with a crate halfway; the second owns the
      // long open sorting lane at y=258 that every route across this grid uses.
      low: [
        [10, 235, 30, 22],
        [173, 231, 30, 24],
        [186, 140, 30, 20],
        [312, 240, 26, 20],
      ],
      cams: [
        { x: 129, y: 240, a0: 40, a1: 140, period: 6.5, r: 106, half: 26 },
        { x: 229, y: 350, a0: 220, a1: 320, period: 7, r: 108, half: 25 },
        { x: 48, y: 148, a0: -40, a1: 60, period: 7.5, r: 100, half: 25 },
      ],
      turrets: [
        { x: 30, y: 300, a: 270, r: 110, half: 30 },
        { x: 150, y: 258, a: 0, r: 104, half: 30 },
      ],
      bots: [
        { tier: 1, x: 234, y: 348, wps: [[234, 348], [234, 394], [211, 388]] },
        { tier: 1, x: 126, y: 342, wps: [[126, 342], [133, 387], [126, 342]] },
        { tier: 2, x: 324, y: 456, wps: [[324, 456], [334, 411], [330, 431]] },
        { tier: 2, x: 24, y: 456, wps: [[24, 456], [27, 410], [26, 430]] },
        { tier: 2, x: 30, y: 354, wps: [[30, 354], [34, 400], [26, 308]] },
        { tier: 2, x: 186, y: 258, wps: [[186, 258], [153, 266], [211, 252]] },
        { tier: 2, x: 336, y: 324, wps: [[336, 324], [330, 370], [323, 293]] },
        { tier: 2, x: 24, y: 258, wps: [[24, 258], [23, 212], [25, 304]] },
        { tier: 3, x: 222, y: 144, wps: [[222, 144], [230, 189], [233, 112]] },
        { tier: 3, x: 102, y: 144, wps: [[102, 144], [69, 138], [135, 150]] },
        { tier: 3, x: 336, y: 138, wps: [[336, 138], [338, 92], [334, 184]] },
        { tier: 3, x: 204, y: 24, wps: [[204, 24], [158, 29], [235, 37]] },
        { tier: 4, x: 324, y: 24, wps: [[324, 24], [336, 68], [324, 24]] },
        { tier: 4, x: 24, y: 24, wps: [[24, 24], [70, 28], [50, 27]] },
      ],
      hunter: { tier: 5, wps: [[180, 432], [126, 354], [126, 264], [30, 264], [30, 420], [30, 180], [30, 42], [36, 36], [180, 36], [330, 36], [330, 42], [330, 240], [330, 432], [324, 378], [180, 372]] },
    },
    {
      doorTier: 5,
      door: [180, 30],
      walls: [
        [0, 100, 151, 14],
        [209, 100, 151, 14],
        [0, 196, 52, 14],
        [110, 196, 250, 14],
        [0, 292, 250, 14],
        [308, 292, 52, 14],
        [0, 388, 151, 14],
        [209, 388, 151, 14],
        [120, 114, 14, 24],
        [226, 172, 14, 24],
        [120, 210, 14, 24],
        [226, 268, 14, 24],
        [120, 306, 14, 24],
        [226, 364, 14, 24],
        [120, 0, 14, 34],
      ],
      // THE SERPENTINE. Four banded slots and the route has to take all four,
      // so three of them are gunned; every gunned slot carries its crate.
      low: [
        [245, 306, 28, 24],
        [68, 177, 30, 22],
        [191, 130, 28, 24],
        [96, 246, 28, 20],
        [286, 148, 28, 20],
      ],
      cams: [
        { x: 180, y: 150, a0: 240, a1: 300, period: 6.5, r: 106, half: 26 },
        { x: 81, y: 250, a0: 30, a1: 150, period: 7.5, r: 100, half: 25 },
        { x: 279, y: 340, a0: 210, a1: 330, period: 8, r: 108, half: 24 },
      ],
      turrets: [
        { x: 279, y: 240, a: 90, r: 104, half: 30 },
        { x: 68, y: 150, a: 90, r: 100, half: 30 },
        { x: 180, y: 44, a: 90, r: 120, half: 30 },
      ],
      bots: [
        { tier: 2, x: 228, y: 336, wps: [[228, 336], [274, 336], [182, 336]] },
        { tier: 2, x: 90, y: 354, wps: [[90, 354], [45, 361], [47, 337]] },
        { tier: 2, x: 306, y: 456, wps: [[306, 456], [261, 446], [272, 425]] },
        { tier: 2, x: 24, y: 456, wps: [[24, 456], [65, 436], [43, 428]] },
        { tier: 3, x: 144, y: 258, wps: [[144, 258], [98, 262], [190, 254]] },
        { tier: 3, x: 336, y: 330, wps: [[336, 330], [303, 362], [291, 341]] },
        { tier: 3, x: 258, y: 234, wps: [[258, 234], [304, 240], [295, 262]] },
        { tier: 3, x: 24, y: 258, wps: [[24, 258], [63, 234], [70, 257]] },
        { tier: 3, x: 162, y: 150, wps: [[162, 150], [207, 142], [194, 161]] },
        { tier: 3, x: 42, y: 138, wps: [[42, 138], [87, 147], [77, 168]] },
        { tier: 4, x: 336, y: 138, wps: [[336, 138], [295, 160], [290, 136]] },
        { tier: 4, x: 120, y: 60, wps: [[120, 60], [166, 55], [162, 78]] },
        { tier: 4, x: 240, y: 24, wps: [[240, 24], [285, 35], [273, 56]] },
        { tier: 4, x: 336, y: 36, wps: [[336, 36], [309, 73], [294, 55]] },
        { tier: 5, x: 24, y: 24, wps: [[24, 24], [65, 45], [49, 62]] },
      ],
      hunter: { tier: 6, wps: [[180, 432], [60, 432], [180, 426], [180, 348], [204, 342], [300, 342], [276, 318], [276, 270], [264, 246], [156, 246], [156, 258], [78, 258], [78, 252], [108, 258], [204, 258], [204, 246], [300, 234], [156, 252], [156, 258], [84, 258], [84, 174], [180, 156], [180, 150], [150, 162], [60, 162], [60, 150], [108, 162], [180, 162], [180, 48], [300, 48], [174, 78], [174, 138], [156, 162], [84, 174], [84, 234], [96, 258], [204, 258], [204, 246], [276, 246], [276, 330], [180, 342]] },
    },
    {
      doorTier: 6,
      door: [340, 160],
      walls: [
        [58, 110, 93, 14],
        [209, 110, 93, 14],
        [58, 124, 14, 86],
        [58, 268, 14, 98],
        [288, 124, 14, 86],
        [288, 268, 14, 98],
        [58, 366, 93, 14],
        [209, 366, 93, 14],
        [137, 124, 14, 180],
        [209, 186, 14, 180],
        [40, 0, 14, 50],
        [110, 0, 14, 50],
        [250, 0, 14, 50],
        [316, 0, 14, 50],
        [96, 444, 14, 36],
        [216, 444, 14, 36],
        [300, 444, 14, 36],
      ],
      // THE WARDEN'S CORE has exactly four mouths into the nest and all four
      // are gunned from inside, each with its crate: the perimeter hall is
      // free, getting IN is the fight.
      low: [
        [150, 311, 30, 22],
        [181, 166, 28, 24],
        [29, 205, 22, 30],
        [309, 205, 22, 30],
        [96, 60, 30, 20],
        [252, 404, 30, 20],
      ],
      cams: [
        { x: 180, y: 392, a0: 240, a1: 300, period: 6, r: 104, half: 26 },
        { x: 180, y: 100, a0: 60, a1: 120, period: 7, r: 100, half: 24 },
        { x: 46, y: 240, a0: -40, a1: 40, period: 7.5, r: 104, half: 25 },
        { x: 314, y: 240, a0: 140, a1: 220, period: 8, r: 108, half: 25 },
      ],
      turrets: [
        { x: 180, y: 300, a: 90, r: 100, half: 30 },
        { x: 180, y: 200, a: 270, r: 100, half: 30 },
        { x: 126, y: 240, a: 180, r: 116, half: 30 },
        { x: 234, y: 240, a: 0, r: 116, half: 30 },
      ],
      bots: [
        { tier: 2, x: 66, y: 456, wps: [[66, 456], [26, 433], [43, 416]] },
        { tier: 2, x: 264, y: 342, wps: [[264, 342], [257, 297], [248, 322]] },
        { tier: 3, x: 174, y: 294, wps: [[174, 294], [184, 249], [184, 326]] },
        { tier: 3, x: 336, y: 414, wps: [[336, 414], [290, 411], [310, 412]] },
        { tier: 3, x: 24, y: 348, wps: [[24, 348], [28, 394], [26, 374]] },
        { tier: 3, x: 246, y: 234, wps: [[246, 234], [259, 190], [257, 279]] },
        { tier: 3, x: 90, y: 240, wps: [[90, 240], [44, 234], [64, 237]] },
        { tier: 4, x: 336, y: 252, wps: [[336, 252], [335, 206], [337, 298]] },
        { tier: 4, x: 192, y: 162, wps: [[192, 162], [237, 154], [192, 162]] },
        { tier: 4, x: 108, y: 150, wps: [[108, 150], [99, 195], [108, 150]] },
        { tier: 4, x: 24, y: 168, wps: [[24, 168], [26, 122], [22, 214]] },
        { tier: 4, x: 336, y: 132, wps: [[336, 132], [331, 86], [333, 106]] },
        { tier: 5, x: 186, y: 54, wps: [[186, 54], [219, 86], [153, 22]] },
        { tier: 5, x: 24, y: 84, wps: [[24, 84], [48, 73], [24, 84]] },
        { tier: 5, x: 84, y: 24, wps: [[84, 24], [87, 70], [85, 50]] },
        { tier: 5, x: 288, y: 24, wps: [[288, 24], [293, 49], [288, 24]] },
      ],
      hunter: { tier: 7, warden: true, wps: [[180, 432], [126, 420], [42, 420], [42, 432], [30, 384], [30, 240], [30, 84], [42, 78], [180, 72], [180, 60], [246, 78], [330, 78], [330, 240], [330, 420], [180, 408], [180, 342]] },
    },
  ],
  // ── SET 1 (the mirrored twin) ──
  [
    {
      doorTier: 2,
      door: [20, 240],
      walls: [
        [120, 372, 240, 14],
        [0, 372, 62, 14],
        [220, 220, 14, 152],
        [114, 154, 14, 152],
        [300, 140, 60, 14],
        [0, 140, 242, 14],
        [136, 0, 14, 84],
        [250, 40, 70, 14],
      ],
      // mirrored twin: rects fold x -> 360-(x+w), points x -> 360-x, angles
      // a -> 180-a, so the multiset and the difficulty are identical by
      // construction and validateSets() asserts it anyway
      low: [
        [96, 349, 30, 22],
        [28, 262, 30, 20],
      ],
      cams: [
        { x: 96, y: 300, a0: 125, a1: 55, period: 6, r: 108, half: 26 },
        { x: 284, y: 200, a0: 200, a1: 100, period: 7.5, r: 100, half: 24 },
      ],
      turrets: [{ x: 91, y: 322, a: 90, r: 104, half: 30 }],
      bots: [
        { tier: 1, x: 324, y: 456, wps: [[324, 456], [278, 456], [324, 410]] },
        { tier: 1, x: 24, y: 456, wps: [[24, 456], [67, 439], [53, 420]] },
        { tier: 1, x: 336, y: 312, wps: [[336, 312], [302, 343], [326, 267]] },
        { tier: 1, x: 192, y: 210, wps: [[192, 210], [172, 251], [195, 256]] },
        { tier: 1, x: 24, y: 258, wps: [[24, 258], [43, 300], [62, 285]] },
        { tier: 1, x: 336, y: 114, wps: [[336, 114], [303, 82], [291, 103]] },
        { tier: 2, x: 192, y: 24, wps: [[192, 24], [220, 61], [174, 66]] },
        { tier: 2, x: 24, y: 24, wps: [[24, 24], [63, 48], [70, 25]] },
      ],
      // the mirrored twin of set 0's chamber 1, rotated by the same 4 legs
      hunter: { tier: 3, wps: [[96, 342], [198, 318], [198, 198], [288, 198], [288, 300], [288, 198], [150, 198], [150, 330], [84, 354], [84, 408], [60, 432], [132, 426], [60, 414], [96, 408]] },
    },
    {
      doorTier: 3,
      door: [180, 30],
      walls: [
        [102, 140, 258, 14],
        [0, 140, 44, 14],
        [316, 300, 44, 14],
        [0, 300, 258, 14],
        [234, 154, 14, 60],
        [234, 272, 14, 28],
        [112, 212, 14, 88],
        [234, 314, 14, 108],
        [112, 372, 14, 108],
        [234, 0, 14, 82],
        [240, 60, 62, 14],
      ],
      low: [
        [268, 261, 26, 26],
        [78, 175, 26, 26],
        [134, 90, 30, 20],
      ],
      cams: [
        { x: 287, y: 288, a0: 150, a1: 30, period: 7, r: 104, half: 25 },
        { x: 73, y: 162, a0: -30, a1: -150, period: 8, r: 108, half: 26 },
      ],
      turrets: [
        { x: 286, y: 380, a: 270, r: 126, half: 30 },
        { x: 76, y: 210, a: 270, r: 106, half: 30 },
      ],
      bots: [
        { tier: 1, x: 72, y: 456, wps: [[72, 456], [26, 456], [72, 410]] },
        { tier: 1, x: 276, y: 354, wps: [[276, 354], [293, 397], [312, 383]] },
        { tier: 1, x: 336, y: 456, wps: [[336, 456], [326, 411], [305, 422]] },
        { tier: 1, x: 24, y: 360, wps: [[24, 360], [27, 406], [49, 398]] },
        { tier: 2, x: 150, y: 246, wps: [[150, 246], [188, 273], [196, 250]] },
        { tier: 2, x: 336, y: 258, wps: [[336, 258], [323, 214], [303, 226]] },
        { tier: 2, x: 30, y: 234, wps: [[30, 234], [58, 271], [72, 252]] },
        { tier: 2, x: 126, y: 114, wps: [[126, 114], [172, 115], [166, 92]] },
        { tier: 2, x: 252, y: 114, wps: [[252, 114], [295, 99], [252, 114]] },
        { tier: 2, x: 24, y: 114, wps: [[24, 114], [69, 105], [59, 84]] },
        { tier: 3, x: 168, y: 24, wps: [[168, 24], [122, 26], [129, 48]] },
        { tier: 3, x: 336, y: 24, wps: [[336, 24], [331, 70], [333, 50]] },
      ],
      hunter: { tier: 4, wps: [[180, 432], [210, 444], [300, 444], [300, 438], [294, 336], [294, 276], [300, 222], [264, 240], [180, 252], [150, 186], [60, 180], [66, 180], [66, 114], [60, 60], [180, 42], [210, 108], [312, 108], [78, 114], [78, 180], [210, 198], [210, 240], [282, 252], [282, 336], [270, 444], [180, 444]] },
    },
    {
      doorTier: 4,
      door: [340, 180],
      walls: [
        [260, 60, 42, 56],
        [160, 60, 42, 56],
        [60, 60, 42, 56],
        [260, 174, 42, 56],
        [160, 174, 42, 56],
        [60, 174, 42, 56],
        [260, 288, 42, 56],
        [160, 288, 42, 56],
        [60, 288, 42, 56],
        [260, 402, 42, 56],
        [60, 402, 42, 56],
        [182, 116, 14, 58],
        [82, 230, 14, 58],
        [282, 344, 14, 58],
      ],
      low: [
        [320, 235, 30, 22],
        [157, 231, 30, 24],
        [144, 140, 30, 20],
        [22, 240, 26, 20],
      ],
      cams: [
        { x: 231, y: 240, a0: 140, a1: 40, period: 6.5, r: 106, half: 26 },
        { x: 131, y: 350, a0: -40, a1: -140, period: 7, r: 108, half: 25 },
        { x: 312, y: 148, a0: 220, a1: 120, period: 7.5, r: 100, half: 25 },
      ],
      turrets: [
        { x: 330, y: 300, a: 270, r: 110, half: 30 },
        { x: 210, y: 258, a: 180, r: 104, half: 30 },
      ],
      bots: [
        { tier: 1, x: 126, y: 348, wps: [[126, 348], [126, 394], [149, 388]] },
        { tier: 1, x: 234, y: 342, wps: [[234, 342], [227, 387], [234, 342]] },
        { tier: 2, x: 36, y: 456, wps: [[36, 456], [26, 411], [30, 431]] },
        { tier: 2, x: 336, y: 456, wps: [[336, 456], [333, 410], [334, 430]] },
        { tier: 2, x: 330, y: 354, wps: [[330, 354], [326, 400], [334, 308]] },
        { tier: 2, x: 174, y: 258, wps: [[174, 258], [207, 266], [149, 252]] },
        { tier: 2, x: 24, y: 324, wps: [[24, 324], [30, 370], [37, 293]] },
        { tier: 2, x: 336, y: 258, wps: [[336, 258], [337, 212], [335, 304]] },
        { tier: 3, x: 138, y: 144, wps: [[138, 144], [130, 189], [127, 112]] },
        { tier: 3, x: 258, y: 144, wps: [[258, 144], [291, 138], [225, 150]] },
        { tier: 3, x: 24, y: 138, wps: [[24, 138], [22, 92], [26, 184]] },
        { tier: 3, x: 156, y: 24, wps: [[156, 24], [202, 29], [125, 37]] },
        { tier: 4, x: 36, y: 24, wps: [[36, 24], [24, 68], [36, 24]] },
        { tier: 4, x: 336, y: 24, wps: [[336, 24], [290, 28], [310, 27]] },
      ],
      hunter: { tier: 5, wps: [[180, 432], [234, 354], [234, 264], [330, 264], [330, 420], [330, 180], [330, 42], [324, 36], [180, 36], [30, 36], [30, 42], [30, 240], [30, 432], [36, 378], [180, 372]] },
    },
    {
      doorTier: 5,
      door: [180, 30],
      walls: [
        [209, 100, 151, 14],
        [0, 100, 151, 14],
        [308, 196, 52, 14],
        [0, 196, 250, 14],
        [110, 292, 250, 14],
        [0, 292, 52, 14],
        [209, 388, 151, 14],
        [0, 388, 151, 14],
        [226, 114, 14, 24],
        [120, 172, 14, 24],
        [226, 210, 14, 24],
        [120, 268, 14, 24],
        [226, 306, 14, 24],
        [120, 364, 14, 24],
        [226, 0, 14, 34],
      ],
      low: [
        [87, 306, 28, 24],
        [262, 177, 30, 22],
        [141, 130, 28, 24],
        [236, 246, 28, 20],
        [46, 148, 28, 20],
      ],
      cams: [
        { x: 180, y: 150, a0: -60, a1: -120, period: 6.5, r: 106, half: 26 },
        { x: 279, y: 250, a0: 150, a1: 30, period: 7.5, r: 100, half: 25 },
        { x: 81, y: 340, a0: -30, a1: -150, period: 8, r: 108, half: 24 },
      ],
      turrets: [
        { x: 81, y: 240, a: 90, r: 104, half: 30 },
        { x: 292, y: 150, a: 90, r: 100, half: 30 },
        { x: 180, y: 44, a: 90, r: 120, half: 30 },
      ],
      bots: [
        { tier: 2, x: 132, y: 336, wps: [[132, 336], [86, 336], [178, 336]] },
        { tier: 2, x: 270, y: 354, wps: [[270, 354], [315, 361], [313, 337]] },
        { tier: 2, x: 54, y: 456, wps: [[54, 456], [99, 446], [88, 425]] },
        { tier: 2, x: 336, y: 456, wps: [[336, 456], [295, 436], [317, 428]] },
        { tier: 3, x: 216, y: 258, wps: [[216, 258], [262, 262], [170, 254]] },
        { tier: 3, x: 24, y: 330, wps: [[24, 330], [57, 362], [69, 341]] },
        { tier: 3, x: 102, y: 234, wps: [[102, 234], [56, 240], [65, 262]] },
        { tier: 3, x: 336, y: 258, wps: [[336, 258], [297, 234], [290, 257]] },
        { tier: 3, x: 198, y: 150, wps: [[198, 150], [153, 142], [166, 161]] },
        { tier: 3, x: 318, y: 138, wps: [[318, 138], [273, 147], [283, 168]] },
        { tier: 4, x: 24, y: 138, wps: [[24, 138], [65, 160], [70, 136]] },
        { tier: 4, x: 240, y: 60, wps: [[240, 60], [194, 55], [198, 78]] },
        { tier: 4, x: 120, y: 24, wps: [[120, 24], [75, 35], [87, 56]] },
        { tier: 4, x: 24, y: 36, wps: [[24, 36], [51, 73], [66, 55]] },
        { tier: 5, x: 336, y: 24, wps: [[336, 24], [295, 45], [311, 62]] },
      ],
      hunter: { tier: 6, wps: [[180, 432], [300, 432], [180, 426], [180, 348], [156, 342], [60, 342], [84, 318], [84, 270], [96, 246], [204, 246], [204, 258], [282, 258], [282, 252], [252, 258], [156, 258], [156, 246], [60, 234], [204, 252], [204, 258], [276, 258], [276, 174], [180, 156], [180, 150], [210, 162], [300, 162], [300, 150], [252, 162], [180, 162], [180, 48], [60, 48], [186, 78], [186, 138], [204, 162], [276, 174], [276, 234], [264, 258], [156, 258], [156, 246], [84, 246], [84, 330], [180, 342]] },
    },
    {
      doorTier: 6,
      door: [20, 160],
      walls: [
        [209, 110, 93, 14],
        [58, 110, 93, 14],
        [288, 124, 14, 86],
        [288, 268, 14, 98],
        [58, 124, 14, 86],
        [58, 268, 14, 98],
        [209, 366, 93, 14],
        [58, 366, 93, 14],
        [209, 124, 14, 180],
        [137, 186, 14, 180],
        [306, 0, 14, 50],
        [236, 0, 14, 50],
        [96, 0, 14, 50],
        [30, 0, 14, 50],
        [250, 444, 14, 36],
        [130, 444, 14, 36],
        [46, 444, 14, 36],
      ],
      low: [
        [180, 311, 30, 22],
        [151, 166, 28, 24],
        [309, 205, 22, 30],
        [29, 205, 22, 30],
        [234, 60, 30, 20],
        [78, 404, 30, 20],
      ],
      cams: [
        { x: 180, y: 392, a0: -60, a1: -120, period: 6, r: 104, half: 26 },
        { x: 180, y: 100, a0: 120, a1: 60, period: 7, r: 100, half: 24 },
        { x: 314, y: 240, a0: 220, a1: 140, period: 7.5, r: 104, half: 25 },
        { x: 46, y: 240, a0: 40, a1: -40, period: 8, r: 108, half: 25 },
      ],
      turrets: [
        { x: 180, y: 300, a: 90, r: 100, half: 30 },
        { x: 180, y: 200, a: 270, r: 100, half: 30 },
        { x: 234, y: 240, a: 0, r: 116, half: 30 },
        { x: 126, y: 240, a: 180, r: 116, half: 30 },
      ],
      bots: [
        { tier: 2, x: 294, y: 456, wps: [[294, 456], [334, 433], [317, 416]] },
        { tier: 2, x: 96, y: 342, wps: [[96, 342], [103, 297], [112, 322]] },
        { tier: 3, x: 186, y: 294, wps: [[186, 294], [176, 249], [176, 326]] },
        { tier: 3, x: 24, y: 414, wps: [[24, 414], [70, 411], [50, 412]] },
        { tier: 3, x: 336, y: 348, wps: [[336, 348], [332, 394], [334, 374]] },
        { tier: 3, x: 114, y: 234, wps: [[114, 234], [101, 190], [103, 279]] },
        { tier: 3, x: 270, y: 240, wps: [[270, 240], [316, 234], [296, 237]] },
        { tier: 4, x: 24, y: 252, wps: [[24, 252], [25, 206], [23, 298]] },
        { tier: 4, x: 168, y: 162, wps: [[168, 162], [123, 154], [168, 162]] },
        { tier: 4, x: 252, y: 150, wps: [[252, 150], [261, 195], [252, 150]] },
        { tier: 4, x: 336, y: 168, wps: [[336, 168], [334, 122], [338, 214]] },
        { tier: 4, x: 24, y: 132, wps: [[24, 132], [29, 86], [27, 106]] },
        { tier: 5, x: 174, y: 54, wps: [[174, 54], [141, 86], [207, 22]] },
        { tier: 5, x: 336, y: 84, wps: [[336, 84], [312, 73], [336, 84]] },
        { tier: 5, x: 276, y: 24, wps: [[276, 24], [273, 70], [275, 50]] },
        { tier: 5, x: 72, y: 24, wps: [[72, 24], [67, 49], [72, 24]] },
      ],
      hunter: { tier: 7, warden: true, wps: [[180, 432], [234, 420], [318, 420], [318, 432], [330, 384], [330, 240], [330, 84], [318, 78], [180, 72], [180, 60], [114, 78], [30, 78], [30, 240], [30, 420], [180, 408], [180, 342]] },
    },
  ],
];

export function chamberSetForSeed(hash: number): ChamberSet {
  return CHAMBER_SETS[((hash % CHAMBER_SETS.length) + CHAMBER_SETS.length) % CHAMBER_SETS.length];
}

/** Per-tier eat points; hunters use the same table at their tier. */
export const EAT_PTS: Record<number, number> = {
  1: 40,
  2: 70,
  3: 110,
  4: 150,
  5: 190,
  6: 240,
  7: 300,
};
/** THE WARDEN'S HEAD. Generous on purpose: it is the run's one real win, and
 * it is only reachable by a near-full clear of all five chambers, or by
 * walking up on it unseen. */
export const WARDEN_PTS = 1200;
/** Growth units by eaten tier = the tier number itself. Cumulative units to
 * REACH tier [index]; see the inversion table in the header. */
export const TIER_THRESHOLDS = [0, 0, 4, 8, 30, 62, 106, 164];

// ── the validator ───────────────────────────────────────────────────────────

const GRID = 6; // design px per BFS cell

function padHit(w: [number, number, number, number], x: number, y: number, pad: number): boolean {
  return x > w[0] - pad && x < w[0] + w[2] + pad && y > w[1] - pad && y < w[1] + w[3] + pad;
}

function free(ch: ChamberDef, x: number, y: number, pad: number): boolean {
  if (x < pad || x > 360 - pad || y < pad || y > 480 - pad) return false;
  for (const w of ch.walls) if (padHit(w, x, y, pad)) return false;
  return true;
}

/** LOW COVER IS NOT A WALL: nothing collides with it, so it is absent from
 * free()/segClear() and present only here, where SIGHT is decided. Every
 * consumer that asks "can this eye see that point" must use this. */
function opaque(ch: ChamberDef, x: number, y: number): boolean {
  for (const w of ch.walls) if (padHit(w, x, y, 0)) return true;
  for (const w of ch.low) if (padHit(w, x, y, 0)) return true;
  return false;
}

/** A straight walk that never clips a wall at this radius. At pad 0 this is
 * the BODY-only clearance test; sightClear() below is the one that also folds
 * in low cover. */
function segClear(ch: ChamberDef, x1: number, y1: number, x2: number, y2: number, pad: number): boolean {
  const steps = Math.max(8, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!free(ch, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, pad)) return false;
  }
  return true;
}

/** THE SIM'S OWN LINE OF SIGHT, mirrored: walls AND low cover, endpoints
 * excluded (sight is thin where a body is fat, and an eye standing on its own
 * mount must still see out). */
function sightClear(ch: ChamberDef, x1: number, y1: number, x2: number, y2: number): boolean {
  const steps = Math.max(8, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (opaque(ch, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

/** Flood the free space at `pad` from the spawn; returns the reached mask.
 * `sealLow` treats every low-cover crate as if it were solid - which it is
 * NOT in the sim. That pessimistic flood is the "no crate seals a passage"
 * proof: if the floor is still connected with every crate counted as a wall,
 * no crate can ever be the reason a player is stuck. */
function reachable(ch: ChamberDef, pad: number, sealLow = false): boolean[][] {
  const cols = Math.floor(360 / GRID) + 1;
  const rows = Math.floor(480 / GRID) + 1;
  const open = (x: number, y: number): boolean => {
    if (!free(ch, x, y, pad)) return false;
    if (sealLow) for (const w of ch.low) if (padHit(w, x, y, pad)) return false;
    return true;
  };
  const seen: boolean[][] = [];
  for (let i = 0; i < cols; i++) seen.push(new Array<boolean>(rows).fill(false));
  const sc = Math.round(SPAWN[0] / GRID);
  const sr = Math.round(SPAWN[1] / GRID);
  if (!open(sc * GRID, sr * GRID)) return seen;
  seen[sc][sr] = true;
  const q: number[] = [sc * 4096 + sr];
  for (let head = 0; head < q.length; head++) {
    const c = Math.floor(q[head] / 4096);
    const r = q[head] % 4096;
    const nb = [
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ];
    for (const [nc, nr] of nb) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[nc][nr]) continue;
      if (!open(nc * GRID, nr * GRID)) continue;
      seen[nc][nr] = true;
      q.push(nc * 4096 + nr);
    }
  }
  return seen;
}

/** True when SOME reached cell sits within `r` of (x,y). */
function reachedNear(seen: boolean[][], x: number, y: number, r: number): boolean {
  const c0 = Math.max(0, Math.floor((x - r) / GRID));
  const c1 = Math.min(seen.length - 1, Math.ceil((x + r) / GRID));
  for (let c = c0; c <= c1; c++) {
    const col = seen[c];
    const r0 = Math.max(0, Math.floor((y - r) / GRID));
    const r1 = Math.min(col.length - 1, Math.ceil((y + r) / GRID));
    for (let rr = r0; rr <= r1; rr++) {
      if (col[rr] && Math.hypot(c * GRID - x, rr * GRID - y) <= r) return true;
    }
  }
  return false;
}

/**
 * THE SET VALIDATOR - the machine check behind the "seed only selects" law.
 * Returns a list of violations (empty = every authored set ships clean).
 * The harness calls this on every verify, so a bad set CANNOT reach a green
 * gate. Checks per set:
 *   1. shape: exactly CHAMBERS_PER_LAP chambers;
 *   2. equal-ceiling: per-slot bot tier multiset, hunter tier, warden flag,
 *      door tier AND camera count identical to set 0;
 *   3. the warden is the LAST chamber's hunter, at MAX_TIER, and nowhere else;
 *   4. the inversion: each chamber's hunter tier is funded by a near-full
 *      clear of THAT chamber and is NOT already reachable on entry;
 *   5. door funding, both from the greedy path and the leanest legal path;
 *   6. walls: 6-20 pieces, never fewer than the chamber before, inside the room;
 *   7. geometry: spawn free, door approachable, every bot spawn and waypoint
 *      in the SAME free region at the biggest blob radius, and every patrol
 *      segment clear at that bot's own radius (nothing wedges);
 *   8. cameras: free where they are mounted, and their arcs inside sane bounds;
 *   9. the AFK gate: some sample of chamber 1's hunter patrol actually SEES
 *      the spawn (range, cone half-angle and line of sight, not mere distance);
 *  10. LOW COVER (round 7): crate-sized, in the room, never inside a slab, and
 *      NEVER SEALING A PASSAGE - proved pessimistically by re-flooding the
 *      floor with every crate counted as solid and demanding the door and
 *      every meal still connect;
 *  11. TURRETS (round 7): mounted in open air, sane cone, never covering the
 *      spawn, never turning the door apron into a kill box, and - the fairness
 *      proof an unavoidable hazard owes the player - EVERY turret cone has a
 *      reachable pocket that authored low cover shadows, so every cone can be
 *      crossed without taking a shot.
 */
export function validateSets(): string[] {
  const errs: string[] = [];
  // THE EQUAL-CEILING SIGNATURE. Round 7 folded the two new authored entity
  // classes in: a daily that drew a set with one fewer turret, a shorter
  // turret reach or one more crate would be a materially easier daily, which
  // is exactly what this law exists to forbid. Turrets are compared as a
  // sorted radius:half multiset (placement and facing still differ freely),
  // crates as a sorted area multiset.
  const sig = (ch: ChamberDef): string =>
    `d${ch.doorTier}|h${ch.hunter.tier}${ch.hunter.warden ? "W" : ""}|c${ch.cams.length}|${ch.bots
      .map((b) => b.tier)
      .slice()
      .sort()
      .join(",")}|t${ch.turrets
      .map((t) => `${t.r}:${t.half}`)
      .slice()
      .sort()
      .join(",")}|w${ch.low
      .map((w) => w[2] * w[3])
      .slice()
      .sort((a, b) => a - b)
      .join(",")}`;
  if (CHAMBER_SETS[0].length !== CHAMBERS_PER_LAP) {
    errs.push(`set 0 has ${CHAMBER_SETS[0].length} chambers, the lap is ${CHAMBERS_PER_LAP}`);
    return errs;
  }
  const base = CHAMBER_SETS[0].map(sig);

  CHAMBER_SETS.forEach((cs, si) => {
    const tag = (ci: number) => `set ${si} chamber ${ci + 1}`;
    if (cs.length !== CHAMBERS_PER_LAP) {
      errs.push(`set ${si} has ${cs.length} chambers, the lap is ${CHAMBERS_PER_LAP}`);
      return;
    }

    let prey = 0; // cumulative prey growth units through chamber i
    let greedy = 0; // cumulative units with every hunter also eaten
    let lean = 0; // the leanest legal path: only ever the door's threshold

    cs.forEach((ch, ci) => {
      if (sig(ch) !== base[ci]) errs.push(`${tag(ci)}: roster differs from set 0 (${sig(ch)} vs ${base[ci]})`);

      // (3) the warden is the last hunter, top tier, and unique
      const last = ci === CHAMBERS_PER_LAP - 1;
      if (ch.hunter.warden && !last) errs.push(`${tag(ci)}: warden flagged on a chamber that is not the last`);
      if (last && !ch.hunter.warden) errs.push(`${tag(ci)}: the last chamber has no WARDEN`);
      if (ch.hunter.warden && ch.hunter.tier !== MAX_TIER) {
        errs.push(`${tag(ci)}: the warden is T${ch.hunter.tier}, it must be the top tier T${MAX_TIER}`);
      }

      // (4) the inversion, both halves
      const entry = greedy;
      for (const b of ch.bots) prey += b.tier;
      const needHunter = TIER_THRESHOLDS[ch.hunter.tier];
      if (prey < needHunter) {
        errs.push(`${tag(ci)}: only ${prey} prey units by its T${ch.hunter.tier} hunter (needs ${needHunter}) - the inversion is unreachable`);
      }
      if (entry >= needHunter) {
        errs.push(`${tag(ci)}: T${ch.hunter.tier} hunter is already edible on entry (${entry} >= ${needHunter}) - no inversion left to earn`);
      }
      // greedy = every prey through here + every hunter through here
      greedy = prey;
      for (let j = 0; j <= ci; j++) greedy += cs[j].hunter.tier;

      // (5) door funding, greedy and lean
      const needDoor = TIER_THRESHOLDS[ch.doorTier];
      if (prey < needDoor) errs.push(`${tag(ci)}: only ${prey} prey units by its T${ch.doorTier} door (needs ${needDoor})`);
      const leanHere = lean + ch.bots.reduce((a, b) => a + b.tier, 0);
      if (leanHere < needDoor) {
        errs.push(`${tag(ci)}: the lean path arrives with ${lean} and cannot fund the T${ch.doorTier} door even after a full clear (${leanHere} < ${needDoor})`);
      }
      lean = Math.max(lean, needDoor);

      // (6) walls. THE STEALTH REBUILD RAISED THE CEILING 3-6 -> 6-20: dense
      // interiors are the whole point now, and 20 is the honest limit of what
      // 360x480 holds at 58 px passages.
      if (ch.walls.length < 6 || ch.walls.length > 20) errs.push(`${tag(ci)}: ${ch.walls.length} wall pieces (want 6-20)`);
      if (ci > 0 && ch.walls.length < cs[ci - 1].walls.length) {
        errs.push(`${tag(ci)}: ${ch.walls.length} wall pieces, fewer than chamber ${ci} (${cs[ci - 1].walls.length}) - depth must tighten`);
      }
      for (const [x, y, w, h] of ch.walls) {
        if (w <= 0 || h <= 0) errs.push(`${tag(ci)}: wall [${x},${y},${w},${h}] has no area`);
        if (x < 0 || y < 0 || x + w > 360 || y + h > 480) errs.push(`${tag(ci)}: wall [${x},${y},${w},${h}] leaves the room`);
      }

      // (7) geometry
      if (!free(ch, SPAWN[0], SPAWN[1], CLEAR_R)) {
        errs.push(`${tag(ci)}: the spawn ${SPAWN.join(",")} is inside a wall at the biggest blob radius`);
        return;
      }
      const seen = reachable(ch, CLEAR_R);
      if (!reachedNear(seen, ch.door[0], ch.door[1], 34)) {
        errs.push(`${tag(ci)}: the door ${ch.door.join(",")} cannot be reached by a maxed blob`);
      }
      const cell = (x: number, y: number) => {
        const c = Math.round(x / GRID);
        const r = Math.round(y / GRID);
        return c >= 0 && r >= 0 && c < seen.length && r < seen[0].length && seen[c][r];
      };
      const checkRoute = (who: string, tier: number, x: number, y: number, wps: [number, number][]) => {
        const pad = botR(tier) + 4;
        const pts: [number, number][] = [[x, y], ...wps];
        for (const [wx, wy] of pts) {
          if (!free(ch, wx, wy, pad)) {
            errs.push(`${tag(ci)}: ${who} point ${wx},${wy} sits in a wall at its own radius`);
            continue;
          }
          if (!free(ch, wx, wy, CLEAR_R) || !cell(wx, wy)) {
            errs.push(`${tag(ci)}: ${who} point ${wx},${wy} is not reachable by a maxed blob (an uneatable meal)`);
          }
        }
        // the loop: spawn -> wp0, then wp i -> wp i+1, closing the ring
        if (!segClear(ch, x, y, wps[0][0], wps[0][1], pad)) {
          errs.push(`${tag(ci)}: ${who} spawn leg clips a wall`);
        }
        for (let i = 0; i < wps.length; i++) {
          const a = wps[i];
          const b = wps[(i + 1) % wps.length];
          if (!segClear(ch, a[0], a[1], b[0], b[1], pad)) {
            errs.push(`${tag(ci)}: ${who} leg ${a.join(",")} -> ${b.join(",")} clips a wall (it would wedge)`);
          }
        }
      };
      ch.bots.forEach((b, bi) => checkRoute(`bot ${bi} (T${b.tier})`, b.tier, b.x, b.y, b.wps));
      checkRoute(`hunter (T${ch.hunter.tier})`, ch.hunter.tier, ch.hunter.wps[0][0], ch.hunter.wps[0][1], ch.hunter.wps);

      // (8) cameras: mounted in open air, and inside sane arc bounds. A camera
      // buried in a slab would draw a cone out of solid steel and see nothing.
      ch.cams.forEach((cm, mi) => {
        if (!free(ch, cm.x, cm.y, 0)) errs.push(`${tag(ci)}: camera ${mi} at ${cm.x},${cm.y} is inside a wall`);
        if (cm.r < 60 || cm.r > 180) errs.push(`${tag(ci)}: camera ${mi} sight radius ${cm.r} (want 60-180)`);
        if (cm.half < 10 || cm.half > 60) errs.push(`${tag(ci)}: camera ${mi} half-angle ${cm.half} (want 10-60)`);
        if (cm.period < 3) errs.push(`${tag(ci)}: camera ${mi} sweeps in ${cm.period}s (want 3s or slower)`);
      });

      // (10) LOW COVER. It has to be a crate, not a secret wall: real area,
      // inside the room, never buried in a slab (a crate inside a wall casts
      // no shadow a player can use and reads as a bug), and never so placed
      // that the floor would depend on walking through it.
      // THE SEAL TEST RUNS AT PAD 0, and that is the whole point of it. A
      // crate does not collide, so "sealed" can only ever mean SPANS THE
      // PASSAGE WALL TO WALL - a crate wide enough to touch both jambs reads
      // as a wall on screen, and a rule the player has to disbelieve is worse
      // than no rule. Flooding at pad 0 with the crates counted solid answers
      // exactly that question and nothing else; check (7) already proves a
      // maxed BODY fits, walls only.
      const sealed = reachable(ch, 0, true);
      const cellSealed = (x: number, y: number) => {
        const c = Math.round(x / GRID);
        const r = Math.round(y / GRID);
        return c >= 0 && r >= 0 && c < sealed.length && r < sealed[0].length && sealed[c][r];
      };
      ch.low.forEach((lw, li) => {
        const [x, y, w, h] = lw;
        if (w < 16 || h < 16) errs.push(`${tag(ci)}: low cover ${li} [${lw}] is ${w}x${h} - too small to hide behind (want 16+)`);
        if (w > 60 || h > 60) errs.push(`${tag(ci)}: low cover ${li} [${lw}] is ${w}x${h} - that is a wall, not a crate (want 60 or less)`);
        if (x < 0 || y < 0 || x + w > 360 || y + h > 480) errs.push(`${tag(ci)}: low cover ${li} [${lw}] leaves the room`);
        for (const [wx, wy, ww, wh] of ch.walls) {
          if (x < wx + ww && x + w > wx && y < wy + wh && y + h > wy) {
            errs.push(`${tag(ci)}: low cover ${li} [${lw}] overlaps the wall [${wx},${wy},${ww},${wh}] - a crate inside steel is not cover`);
          }
        }
      });
      // NO CRATE SEALS A PASSAGE. Crates do not collide, so this is a
      // pessimistic proof, deliberately: if the floor stays whole even when
      // every crate is counted as solid, then no crate can ever be the thing
      // between a player and the exit or a meal.
      if (!reachedNear(sealed, ch.door[0], ch.door[1], 34)) {
        errs.push(`${tag(ci)}: a crate spans the passage to the door ${ch.door.join(",")} jamb to jamb - low cover seals a passage`);
      }
      for (const b of ch.bots) {
        if (!cellSealed(b.x, b.y)) {
          errs.push(`${tag(ci)}: a crate spans the passage to the T${b.tier} at ${b.x},${b.y} jamb to jamb - low cover seals a passage`);
        }
      }

      // (11) TURRETS: the unavoidable hazard, so the fairness bar is the
      // highest in the file. Mounted in open air, sane cone, never covering
      // the spawn (nothing may shoot a player who has not moved yet), and -
      // the real proof - every cone contains a reachable pocket that authored
      // LOW COVER shadows, so there is always a legal way across.
      const seenOpen = reachable(ch, CLEAR_R);
      const cellOpen = (x: number, y: number) => {
        const c = Math.round(x / GRID);
        const r = Math.round(y / GRID);
        return c >= 0 && r >= 0 && c < seenOpen.length && r < seenOpen[0].length && seenOpen[c][r];
      };
      /** would this turret have the blob at (x,y): range -> angle -> cast,
       * the sim's own order. `lows` picks whether crates count as opaque. */
      const turretOn = (tu: TurretSpec, x: number, y: number, lows: boolean): boolean => {
        const dx = x - tu.x;
        const dy = y - tu.y;
        const d = Math.hypot(dx, dy);
        if (d > tu.r) return false;
        if (d < 1) return true;
        const fx = Math.cos((tu.a * Math.PI) / 180);
        const fy = Math.sin((tu.a * Math.PI) / 180);
        if ((dx / d) * fx + (dy / d) * fy < Math.cos((tu.half * Math.PI) / 180)) return false;
        return lows ? sightClear(ch, tu.x, tu.y, x, y) : segClear(ch, tu.x, tu.y, x, y, 0);
      };
      if (ci > 0 && ch.turrets.length < cs[ci - 1].turrets.length) {
        errs.push(`${tag(ci)}: ${ch.turrets.length} turrets, fewer than chamber ${ci} (${cs[ci - 1].turrets.length}) - depth must tighten`);
      }
      ch.turrets.forEach((tu, ti) => {
        if (!free(ch, tu.x, tu.y, 0)) errs.push(`${tag(ci)}: turret ${ti} at ${tu.x},${tu.y} is inside a wall`);
        if (tu.r < 60 || tu.r > 140) errs.push(`${tag(ci)}: turret ${ti} sight radius ${tu.r} (want 60-140)`);
        if (tu.half < 12 || tu.half > 34) errs.push(`${tag(ci)}: turret ${ti} half-angle ${tu.half} (want 12-34)`);
        if (turretOn(tu, SPAWN[0], SPAWN[1], false)) {
          errs.push(`${tag(ci)}: turret ${ti} covers the spawn ${SPAWN.join(",")} - it would shoot a player who has not moved yet`);
        }
        // THE FAIRNESS PROOF FOR AN UNAVOIDABLE HAZARD. Sweep the reachable
        // floor: cells the turret WOULD have (walls only) but does NOT have
        // once the crates are counted are the shadow you cross under.
        let covered = 0;
        let shadowed = 0;
        for (let c = 0; c < seenOpen.length; c++) {
          for (let r = 0; r < seenOpen[c].length; r++) {
            if (!seenOpen[c][r]) continue;
            const x = c * GRID;
            const y = r * GRID;
            if (!turretOn(tu, x, y, false)) continue;
            covered++;
            if (!turretOn(tu, x, y, true)) shadowed++;
          }
        }
        if (covered === 0) {
          errs.push(`${tag(ci)}: turret ${ti} at ${tu.x},${tu.y} facing ${tu.a} covers no reachable floor at all - it is decoration`);
        } else if (shadowed < 8) {
          errs.push(
            `${tag(ci)}: turret ${ti} at ${tu.x},${tu.y} covers ${covered} reachable cells and low cover shadows only ${shadowed} of them (want 8+) - its cone cannot be crossed`,
          );
        } else if (shadowed > covered * 0.8) {
          // ...AND THE CRATE MUST NOT DELETE THE GUN. A cone that is almost
          // entirely shadow is a turret the player never has to read, which is
          // the same "no challenge" failure in a new costume.
          errs.push(
            `${tag(ci)}: turret ${ti} covers ${covered} reachable cells and low cover shadows ${shadowed} of them - the crate neuters the gun (want 80% or less)`,
          );
        }
      });
      // ...and the way out is never a turret's kill box: some reachable cell
      // on the door's apron has to be clear of every turret at once.
      {
        let doorSafe = false;
        for (let c = 0; c < seenOpen.length && !doorSafe; c++) {
          for (let r = 0; r < seenOpen[c].length && !doorSafe; r++) {
            if (!seenOpen[c][r]) continue;
            const x = c * GRID;
            const y = r * GRID;
            if (Math.hypot(x - ch.door[0], y - ch.door[1]) > 30) continue;
            if (ch.turrets.some((tu) => turretOn(tu, x, y, true))) continue;
            doorSafe = true;
          }
        }
        if (!doorSafe) errs.push(`${tag(ci)}: every reachable cell on the door apron sits in a turret cone - the exit is a kill box`);
      }
    });

    // (9) THE AFK GATE, CONE-GATED. The old test asked whether chamber 1's
    // patrol passed within 80 px of the spawn, which meant nothing the moment
    // sight became a cone: a hunter can walk past your face looking the other
    // way. Sample the polyline and demand that some sample SEES the spawn -
    // in range, inside the half-angle of the direction it is walking, with a
    // clear line. An idle blob has to be found, or an idle run could bank.
    // AND IT MUST NEVER WALK OVER THE SPAWN. Measured the first time the
    // hybrid corrupt shipped: chamber 1's patrol used to start ON the spawn,
    // so an idle blob quietly corrupted a T3 hunter for 110 free points and
    // then sat there until the frame cap. A machine that strolls onto a
    // motionless blob hands it the kill, so the apron stays 40 px clear.
    const ch1 = cs[0];
    const h1 = ch1.hunter.wps;
    const half = Math.cos((HUNTER_VISION_HALF_DEG * Math.PI) / 180);
    let sees = false;
    let closest = Infinity;
    // BOTH halves are measured over the WHOLE route: an early `sees` must not
    // stop the walk, or the closest-approach number would be a fiction.
    for (let i = 0; i < h1.length; i++) {
      const a = h1[i];
      const b = h1[(i + 1) % h1.length];
      const lx = b[0] - a[0];
      const ly = b[1] - a[1];
      const ll = Math.hypot(lx, ly);
      if (ll < 0.001) continue;
      for (let t = 0; t <= 1.0001; t += 1 / 40) {
        const px = a[0] + lx * t;
        const py = a[1] + ly * t;
        const dx = SPAWN[0] - px;
        const dy = SPAWN[1] - py;
        const d = Math.hypot(dx, dy);
        closest = Math.min(closest, d);
        if (d > HUNTER_VISION_R) continue;
        // standing on top of the blob counts: there is no angle to miss
        const inCone = d < 8 || (dx / d) * (lx / ll) + (dy / d) * (ly / ll) >= half;
        if (!inCone) continue;
        // ROUND 7: crates are opaque, so the AFK proof has to march them too -
        // a crate authored across the apron would have quietly turned an idle
        // run into a bankable one.
        if (!sightClear(ch1, px, py, SPAWN[0], SPAWN[1])) continue;
        sees = true;
      }
    }
    if (!sees) {
      errs.push(
        `set ${si}: chamber 1's hunter never SEES the spawn on its patrol (closest approach ${closest.toFixed(0)} px, vision ${HUNTER_VISION_R} px at ${HUNTER_VISION_HALF_DEG} deg) - AFK gate broken`,
      );
    }
    if (closest < 40) {
      errs.push(
        `set ${si}: chamber 1's hunter patrol walks within ${closest.toFixed(0)} px of the spawn - an idle blob would quietly corrupt it for free`,
      );
    }
  });
  return errs;
}
