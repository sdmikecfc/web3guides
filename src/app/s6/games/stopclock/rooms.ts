/**
 * STOPCLOCK - the AUTHORED content: room sets. The seed never designs, it
 * only selects one of these hand-authored room-triples for the day.
 *
 * DESIGN SPACE 460x600 (zoomed out from the original 360x480: more POV,
 * rooms read as arenas). All numbers below are design px.
 *
 * EQUAL-CEILING LAW: every set uses the IDENTICAL enemy multiset per room
 * slot (same kinds, same counts); only placements and barriers differ. One
 * ceiling for every set by construction; validateSets asserts it.
 *
 * Rosters per room (every set identical; validator asserts the exact multiset):
 *   room 1: 3x pistol, 2x rusher
 *   room 2: 3x pistol, 1x rocketeer, 2x rusher
 *   room 3: 4x pistol, 2x rocketeer, 2x rusher
 *
 * THE THREE ATTACK GRAMMARS:
 *   pistol    - FAST bullets with aim lead (you dodge with reads and cover)
 *   rocketeer - SLOW ARCING bombs, lobbed OVER cover at the spot you were
 *               standing when it fired: fixed speed below the player's walk,
 *               so the dodge is to keep walking. Cover no longer answers a
 *               rocketeer; distance and movement do.
 *   rusher    - melee closer (lethal to touch; the AFK executioner) and the
 *               only thing in the game that KEEPS COMING (see waveSpawns)
 *
 * LAPS PAST THE AUTHORED THREE add one rocketeer per lap from the room's
 * authored extraSpawns list (cap = EXTRA_ROCKETEER_SPAWNS, identical count
 * per slot across sets, so depth stays hand-placed and the ceiling stays
 * equal). The seed still only selects; it never designs.
 *
 * RUSHER WAVES (2026-08-15, Mike: "the triangle guys keep coming as time
 * passes, so you don't just snipe the towers from a corner"). Every room
 * authors waveSpawns: the hand-placed edge points a timed rusher can walk in
 * from. The sim picks among them by DISTANCE from the player (farthest wins),
 * never at random, and never closer than WAVE_MIN_DIST. They are NOT part of
 * the roster multiset: the roster law counts authored `enemies` only, and the
 * wave list is separate authorship with its own equal-count law.
 *
 * BARRIERS: 5-6 pieces per room, mixing slabs, VERTICALS and PILLARS at
 * 7-11% floor coverage, so rooms read as arenas rather than empty floors.
 * EVERY ROOM IS ITS OWN SHAPE (2026-08-15, Mike: "the barricade placement is
 * always covering the turrets ... more variety on placement"). The old six
 * rooms were one template - player bottom-centre, shooters in a row along the
 * top, a mirror-symmetric pair of horizontal slabs across mid-field - which
 * put cover in front of every turret and made the back wall the only answer.
 * The six below are six different arenas: a diagonal staircase, a split
 * spine, a courtyard box, a right-hand porch, a chevron, and a pit whose
 * cover sits around the PLAYER instead of around the machines. Cover is
 * placed to break sightlines the player must WALK to open, not to armour the
 * shooters, and the player spawn moves too.
 *
 * FAIRNESS (2026-08-15, Mike: "make sure the enemies don't spawn 2 pixels
 * away from you"). MIN_SPAWN_DIST is the floor on every authored spawn's
 * distance from the player's own spawn, and WAVE_MIN_DIST is the floor a wave
 * point must beat at the moment it is used. The validator asserts both - the
 * second as a reachability property over the whole walkable floor, so no
 * standing spot in any room can ever be closer than WAVE_MIN_DIST to the best
 * available wave point.
 *
 * AFK GATE: room 1 must contain a rusher with a straight, unbarricaded line
 * to the player spawn, so once the Warden's patience runs out (the sim's
 * idle ramp) it closes and kills inside the bank floor. The validator now
 * asserts the clear line, not just the rusher.
 *
 * STRAFE LANES (2026-08-17, Mike on the deployed build: "when you repeat the
 * maps (level 4 I think) the shooters need a bit of movement but not directly
 * at the player but making them harder to shoot"). On the FIRST pass through
 * a room the shooters stand exactly where they always have - rooms 1-3 are
 * untouched. From the first REPEAT lap on, every shooter slides along a
 * hand-authored LANE: `lane` is the offset from the authored post to the far
 * anchor, so the post is one end of the walk and the lane is the other.
 *
 * The lane is AUTHORED, not derived, and it is authored LATERAL: validateSets
 * asserts the axis sits at least LANE_LATERAL_DEG off the line from the post
 * to the player's spawn, so no lane is a runway at the pilot. The sim never
 * steers a lane by the player's position (delete the pilot and the machines
 * move identically) - the player enters the movement rule only as a keep-out
 * clamp that refuses any step that would CLOSE the gap inside STRAFE_KEEP.
 * That is the whole of Mike's line: movement, never approach. Closing is the
 * rusher's job and it stays the rusher's job.
 *
 * EQUAL CEILING, EXTENDED TO MOVEMENT: every lane in the game is EXACTLY
 * STRAFE_LANE_LEN long, so both room sets buy the identical amount of
 * dodging per room slot and the ceiling stays one ceiling. The authored
 * freedom is the DIRECTION only, and the length constant is now part of the
 * roster signature validateSets compares (`pistol@40`, `rusher@-`). The
 * offsets are Pythagorean so the length is exact in binary: (40,0), (0,40),
 * (32,24), (24,32) and their sign flips.
 *
 * FAIRNESS ALONG THE WHOLE LANE: MIN_SPAWN_DIST, the arena margin and the
 * barrier pad are checked at every sample of the lane, not just at the post,
 * because a strafing machine occupies all of it. Rushers never carry a lane.
 */

export type EnemyKind = "pistol" | "rocketeer" | "rusher";

export const DESIGN_W = 460;
export const DESIGN_H = 600;
/** Authored lap-rocketeer spawn points per room; also the lap cap. */
export const EXTRA_ROCKETEER_SPAWNS = 4;
/** Authored wave-rusher entry points per room (equal count, every room). */
export const WAVE_SPAWNS_PER_ROOM = 4;
/** No authored spawn may sit closer than this to the player's own spawn. */
export const MIN_SPAWN_DIST = 200;
/** No wave rusher may enter closer than this to where the player is standing. */
export const WAVE_MIN_DIST = 240;
/** EVERY authored strafe lane is exactly this long (design px). One number
 * for the whole game: the equal-ceiling law applied to movement. */
export const STRAFE_LANE_LEN = 40;
/** A lane must sit at least this far off the post -> player-spawn line. */
export const LANE_LATERAL_DEG = 60;
/** Clearance a lane keeps from cover, and from the arena edge (design px).
 * The pad is deliberately wider than the sim's ENEMY_R so the runtime
 * barrier test can never be the thing that decides a lane is legal. */
export const LANE_WALL_PAD = 15;
export const LANE_EDGE_MARGIN = 18;

export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  y: number;
  /** SHOOTERS ONLY: the authored strafe lane, as the offset from this post to
   * the far anchor. Length must be exactly STRAFE_LANE_LEN. Rushers charge;
   * they never carry one. */
  lane?: [number, number];
}

export interface RoomDef {
  player: [number, number];
  barriers: [number, number, number, number][]; // x, y, w, h (design px)
  enemies: EnemySpawn[];
  /** Hand-placed spawn points for the +1 rocketeer per lap, each carrying its
   * own authored lane: [x, y, laneDx, laneDy]. */
  extraSpawns: [number, number, number, number][];
  /** Hand-placed entry points for the timed rusher waves. */
  waveSpawns: [number, number][];
}

export type RoomSet = [RoomDef, RoomDef, RoomDef];

export const ROOM_SETS: RoomSet[] = [
  // ── SET 0 ──────────────────────────────────────────────────────────────────
  [
    // ROOM 1 - THE STAIRCASE. Player in the bottom-LEFT pocket; cover climbs
    // the room in a diagonal stagger so no single corner holds an angle on
    // more than one shooter. The left margin is the open lane: the AFK rusher
    // walks it straight down onto the spawn.
    {
      player: [86, 546],
      barriers: [
        [150, 470, 34, 110], // vertical: the porch post beside the spawn
        [196, 330, 130, 30], // mid slab, offset RIGHT of centre
        [330, 380, 62, 62], // pillar
        [96, 236, 34, 120], // vertical: left spine, short of the lane
        [232, 150, 66, 66], // pillar
        [356, 140, 66, 66], // pillar
      ],
      // LANES: the three turrets rake the top shelf, so their lanes run ALONG
      // it - the staircase's own axis - and the corner posts slide inward off
      // the wall rather than along it.
      enemies: [
        { kind: "pistol", x: 398, y: 96, lane: [-32, -24] },
        { kind: "pistol", x: 250, y: 60, lane: [40, 0] },
        { kind: "pistol", x: 140, y: 92, lane: [-40, 0] },
        { kind: "rusher", x: 60, y: 330 }, // the AFK closer: clear lane to spawn
        { kind: "rusher", x: 300, y: 430 },
      ],
      extraSpawns: [
        [40, 60, 40, 0],
        [420, 60, -24, -32],
        [420, 300, -32, -24],
        [40, 190, 32, -24],
      ],
      waveSpawns: [
        [36, 40],
        [424, 40],
        [36, 566],
        [424, 566],
      ],
    },
    // ROOM 2 - THE SPLIT. One long spine cuts the room in two; the shooters
    // are deliberately on BOTH sides of it, so a corner only ever answers
    // half the room and the player has to cross.
    {
      player: [372, 548],
      barriers: [
        [214, 200, 32, 250], // the spine
        [70, 400, 120, 30],
        [300, 420, 110, 30],
        [90, 120, 64, 64], // pillar
        [320, 130, 60, 60], // pillar
      ],
      // LANES: the spine splits the room, so the flank turrets slide UP their
      // own side (you re-take the angle by walking, not by re-aiming) and the
      // shelling rocketeer slides across the top, changing its lob line.
      enemies: [
        { kind: "pistol", x: 60, y: 250, lane: [24, -32] },
        { kind: "pistol", x: 410, y: 250, lane: [-40, 0] },
        { kind: "pistol", x: 230, y: 90, lane: [40, 0] },
        { kind: "rocketeer", x: 150, y: 60, lane: [-40, 0] }, // far side: it shells over the spine
        { kind: "rusher", x: 140, y: 300 },
        { kind: "rusher", x: 300, y: 300 },
      ],
      extraSpawns: [
        [40, 60, 32, -24],
        [420, 60, -40, 0],
        [40, 540, 0, -40],
        [140, 470, -24, 32],
      ],
      waveSpawns: [
        [36, 40],
        [424, 40],
        [36, 566],
        [424, 566],
      ],
    },
    // ROOM 3 - THE COURTYARD. A hollow box with corner gaps, one turret
    // INSIDE it. The cover is around the objective instead of in front of it:
    // you walk the ring and pick your gap.
    {
      player: [230, 560],
      barriers: [
        [160, 170, 140, 30], // box top
        [160, 360, 140, 30], // box bottom
        [130, 200, 30, 130], // box left (vertical)
        [300, 200, 30, 130], // box right (vertical)
        [60, 90, 60, 60], // pillar
        [340, 460, 58, 58], // pillar
      ],
      // LANES: the caged turret PACES ITS BOX (its whole lane fits between the
      // box walls, so the gap you picked is still the gap - it is just not
      // standing in it any more); the ring turrets slide up out of the pocket
      // the corner gaps used to hold them in.
      enemies: [
        { kind: "pistol", x: 230, y: 265, lane: [40, 0] }, // the caged turret
        { kind: "pistol", x: 60, y: 300, lane: [24, -32] },
        { kind: "pistol", x: 400, y: 300, lane: [-24, -32] },
        { kind: "pistol", x: 230, y: 70, lane: [-40, 0] },
        { kind: "rocketeer", x: 70, y: 430, lane: [32, -24] },
        { kind: "rocketeer", x: 400, y: 130, lane: [-40, 0] },
        { kind: "rusher", x: 100, y: 250 },
        { kind: "rusher", x: 360, y: 250 },
      ],
      extraSpawns: [
        [40, 50, 40, 0],
        [420, 50, -40, 0],
        [40, 300, 24, -32],
        [420, 300, -24, -32],
      ],
      waveSpawns: [
        [36, 40],
        [424, 40],
        [36, 470],
        [424, 566],
      ],
    },
  ],
  // ── SET 1 (six different arenas, same multisets) ───────────────────────────
  [
    // ROOM 1 - THE PORCH. Player bottom-RIGHT behind a post; the shooters
    // rake the room from the left and the top, and the one straight lane in
    // front of the spawn belongs to the AFK rusher.
    {
      player: [374, 552],
      barriers: [
        [286, 430, 32, 120], // vertical: the porch post
        [150, 350, 130, 30],
        [60, 200, 32, 130], // vertical
        [180, 150, 66, 66], // pillar
        [330, 200, 64, 64], // pillar
        [96, 480, 60, 58], // pillar
      ],
      // LANES: the raking pair walk the top, and the right-hand turret - the
      // one holding the porch lane - slides INBOARD off the wall, never down
      // the lane the AFK rusher owns.
      enemies: [
        { kind: "pistol", x: 100, y: 80, lane: [32, -24] },
        { kind: "pistol", x: 300, y: 70, lane: [-40, 0] },
        { kind: "pistol", x: 420, y: 300, lane: [-40, 0] },
        { kind: "rusher", x: 374, y: 330 }, // the AFK closer: clear lane to spawn
        { kind: "rusher", x: 160, y: 250 },
      ],
      extraSpawns: [
        [40, 60, 24, -32],
        [420, 60, -40, 0],
        [40, 420, 0, -40],
        [230, 60, 40, 0],
      ],
      waveSpawns: [
        [36, 40],
        [424, 40],
        [36, 566],
        [424, 566],
      ],
    },
    // ROOM 2 - THE CHEVRON. Two slabs step down left-to-right with a post at
    // each end: every sightline is diagonal, and standing still in any corner
    // leaves at least two machines with a clean angle on you.
    {
      player: [230, 556],
      barriers: [
        [110, 300, 150, 32],
        [240, 380, 32, 130], // vertical
        [300, 250, 130, 32],
        [120, 130, 60, 60], // pillar
        [280, 100, 62, 62], // pillar
        [56, 420, 32, 120], // vertical
      ],
      // LANES: every sightline here is already diagonal, so the lanes run
      // ACROSS the chevron's steps - the near rocketeer slides up and left,
      // AWAY from the spawn, which is the keep-out law made visible.
      enemies: [
        { kind: "pistol", x: 60, y: 300, lane: [24, -32] },
        { kind: "pistol", x: 400, y: 130, lane: [-40, 0] },
        { kind: "pistol", x: 200, y: 60, lane: [40, 0] },
        { kind: "rocketeer", x: 410, y: 420, lane: [-32, -24] }, // near, but it lobs: walk, do not hide
        { kind: "rusher", x: 150, y: 220 },
        { kind: "rusher", x: 350, y: 330 },
      ],
      extraSpawns: [
        [40, 60, 32, -24],
        [420, 60, -32, -24],
        [40, 240, 32, -24],
        [420, 480, 0, -40],
      ],
      waveSpawns: [
        [36, 40],
        [424, 40],
        [36, 566],
        [424, 566],
      ],
    },
    // ROOM 3 - THE PIT. The cover clusters around the PLAYER's end and the
    // machines hold the open ground: the inversion of the old template. The
    // posts beside the spawn are the only free cover in the room, and every
    // shooter has to be walked to.
    {
      player: [230, 552],
      barriers: [
        [96, 470, 34, 110], // vertical, left of spawn
        [330, 470, 34, 110], // vertical, right of spawn
        [160, 330, 140, 32],
        [40, 190, 66, 66], // pillar
        [354, 190, 66, 66], // pillar
        [200, 120, 60, 60], // pillar
      ],
      // LANES: the pit's machines hold open ground, so every lane pulls them
      // UPFIELD, away from the player's cover pocket - the two flanking
      // rocketeers, the closest things in the room, climb rather than creep.
      enemies: [
        { kind: "pistol", x: 70, y: 90, lane: [40, 0] },
        { kind: "pistol", x: 390, y: 90, lane: [-40, 0] },
        { kind: "pistol", x: 140, y: 260, lane: [32, -24] },
        { kind: "pistol", x: 320, y: 260, lane: [-32, -24] },
        { kind: "rocketeer", x: 60, y: 400, lane: [32, -24] },
        { kind: "rocketeer", x: 400, y: 400, lane: [-32, -24] },
        { kind: "rusher", x: 230, y: 260 },
        { kind: "rusher", x: 60, y: 300 },
      ],
      extraSpawns: [
        [40, 60, 40, 0],
        [420, 60, -40, 0],
        [36, 470, 0, -40],
        [420, 470, 0, -40],
      ],
      waveSpawns: [
        [36, 40],
        [424, 40],
        [36, 566],
        [424, 566],
      ],
    },
  ],
];

export function roomSetForSeed(hash: number): RoomSet {
  return ROOM_SETS[((hash % ROOM_SETS.length) + ROOM_SETS.length) % ROOM_SETS.length];
}

export const KILL_PTS: Record<EnemyKind, number> = { pistol: 100, rusher: 80, rocketeer: 160 };
export const CLEAR_PTS = [100, 130, 170] as const;

/** The exact rosters the design ships (order-free multisets). THE SIGNATURE
 * NOW CARRIES THE LANE: a shooter reads `kind@40` and a rusher reads
 * `kind@-`, so a set that quietly bought itself shorter (or longer, or
 * missing) strafe lanes can never match the other set's ceiling. */
const LANE_SIG = (kind: EnemyKind, lane?: [number, number]) =>
  `${kind}@${kind === "rusher" ? "-" : lane ? Math.hypot(lane[0], lane[1]) : "?"}`;
const ROSTERS = [
  ["pistol", "pistol", "pistol", "rusher", "rusher"],
  ["pistol", "pistol", "pistol", "rocketeer", "rusher", "rusher"],
  ["pistol", "pistol", "pistol", "pistol", "rocketeer", "rocketeer", "rusher", "rusher"],
].map((r) =>
  r
    .map((k) => LANE_SIG(k as EnemyKind, [STRAFE_LANE_LEN, 0]))
    .sort()
    .join(","),
);

function segmentClear(barriers: [number, number, number, number][], x1: number, y1: number, x2: number, y2: number): boolean {
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    for (const [bx, by, bw, bh] of barriers) {
      if (x > bx && x < bx + bw && y > by && y < by + bh) return false;
    }
  }
  return true;
}

function insideAny(barriers: [number, number, number, number][], x: number, y: number, pad: number): boolean {
  for (const [bx, by, bw, bh] of barriers) {
    if (x > bx - pad && x < bx + bw + pad && y > by - pad && y < by + bh + pad) return true;
  }
  return false;
}

/**
 * THE LANE LAW, checked over the WHOLE lane rather than at the post: a
 * strafing machine occupies every point of it, so every point has to be a
 * legal standing spot. Returns the reasons a lane is not shippable.
 */
function laneErrors(
  r: RoomDef,
  who: string,
  x: number,
  y: number,
  lane: [number, number],
): string[] {
  const errs: string[] = [];
  const len = Math.hypot(lane[0], lane[1]);
  if (len !== STRAFE_LANE_LEN) {
    errs.push(`${who}: lane (${lane[0]},${lane[1]}) is ${len.toFixed(2)} long, the equal-ceiling law is exactly ${STRAFE_LANE_LEN}`);
    return errs; // everything below is meaningless on a mis-sized lane
  }
  // LATERAL BY AUTHORSHIP: no lane may be a runway at the player's spawn
  const rx = r.player[0] - x;
  const ry = r.player[1] - y;
  const rl = Math.hypot(rx, ry) || 1;
  const cos = Math.abs((lane[0] * rx + lane[1] * ry) / (len * rl));
  const deg = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
  if (deg < LANE_LATERAL_DEG) {
    errs.push(`${who}: lane sits ${deg.toFixed(0)}deg off the line to the player spawn (floor ${LANE_LATERAL_DEG}deg - it must strafe, not approach)`);
  }
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const lx = x + lane[0] * t;
    const ly = y + lane[1] * t;
    if (lx < LANE_EDGE_MARGIN || lx > DESIGN_W - LANE_EDGE_MARGIN || ly < LANE_EDGE_MARGIN || ly > DESIGN_H - LANE_EDGE_MARGIN) {
      errs.push(`${who}: lane leaves the arena at (${lx.toFixed(0)},${ly.toFixed(0)}) (margin ${LANE_EDGE_MARGIN})`);
      break;
    }
    if (insideAny(r.barriers, lx, ly, LANE_WALL_PAD)) {
      errs.push(`${who}: lane slides into cover at (${lx.toFixed(0)},${ly.toFixed(0)}) (pad ${LANE_WALL_PAD})`);
      break;
    }
    const d = Math.hypot(lx - r.player[0], ly - r.player[1]);
    if (d < MIN_SPAWN_DIST) {
      errs.push(`${who}: lane reaches ${d.toFixed(0)}px from the player spawn (floor ${MIN_SPAWN_DIST})`);
      break;
    }
  }
  return errs;
}

/** The set validator (the harness calls this on every verify). */
export function validateSets(): string[] {
  const errs: string[] = [];
  ROOM_SETS.forEach((set, si) => {
    set.forEach((r, ri) => {
      const tag = `set ${si} room ${ri + 1}`;
      // equal-ceiling: exact multiset per slot, LANES INCLUDED
      const sig = r.enemies.map((e) => LANE_SIG(e.kind, e.lane)).sort().join(",");
      if (sig !== ROSTERS[ri]) errs.push(`${tag}: roster ${sig} differs from the design multiset ${ROSTERS[ri]}`);
      // every shooter carries a legal lane; no rusher carries one at all
      r.enemies.forEach((e, i) => {
        const who = `enemy ${i} (${e.kind})`;
        if (e.kind === "rusher") {
          if (e.lane) errs.push(`${tag}: ${who} carries a strafe lane - closing is the rusher's job, strafing is not`);
          return;
        }
        if (!e.lane) {
          errs.push(`${tag}: ${who} has no strafe lane`);
          return;
        }
        for (const m of laneErrors(r, who, e.x, e.y, e.lane)) errs.push(`${tag}: ${m}`);
      });
      r.extraSpawns.forEach((p, i) => {
        for (const m of laneErrors(r, `extraSpawn ${i}`, p[0], p[1], [p[2], p[3]])) errs.push(`${tag}: ${m}`);
      });
      // lap depth stays equal-ceiling: identical extra-spawn count everywhere
      if (r.extraSpawns.length !== EXTRA_ROCKETEER_SPAWNS) {
        errs.push(`${tag}: ${r.extraSpawns.length} extraSpawns, the lap ladder needs exactly ${EXTRA_ROCKETEER_SPAWNS}`);
      }
      // wave depth stays equal-ceiling too: identical wave-point count
      if (r.waveSpawns.length !== WAVE_SPAWNS_PER_ROOM) {
        errs.push(`${tag}: ${r.waveSpawns.length} waveSpawns, the wave ladder needs exactly ${WAVE_SPAWNS_PER_ROOM}`);
      }
      // arena reads as an arena: 5-6 pieces, 7-11% coverage, a vertical + a pillar
      if (r.barriers.length < 5 || r.barriers.length > 6) errs.push(`${tag}: ${r.barriers.length} barriers (want 5-6)`);
      const area = r.barriers.reduce((a, [, , w, h]) => a + w * h, 0);
      const cov = area / (DESIGN_W * DESIGN_H);
      if (cov < 0.07 || cov > 0.11) errs.push(`${tag}: barrier coverage ${(cov * 100).toFixed(1)}% outside 7-11%`);
      if (!r.barriers.some(([, , w, h]) => h >= w * 1.5)) errs.push(`${tag}: no vertical barrier piece`);
      if (!r.barriers.some(([, , w, h]) => w / h >= 0.6 && w / h <= 1.6)) errs.push(`${tag}: no pillar piece`);
      // nothing spawns inside a wall
      const spawns: [string, number, number][] = [
        ["player", r.player[0], r.player[1]],
        ...r.enemies.map((e, i) => [`enemy ${i} (${e.kind})`, e.x, e.y] as [string, number, number]),
        ...r.extraSpawns.map((p, i) => [`extraSpawn ${i}`, p[0], p[1]] as [string, number, number]),
        ...r.waveSpawns.map((p, i) => [`waveSpawn ${i}`, p[0], p[1]] as [string, number, number]),
      ];
      for (const [who, x, y] of spawns) {
        if (insideAny(r.barriers, x, y, 12)) errs.push(`${tag}: ${who} spawns inside a barrier (pad 12)`);
      }
      // THE FAIRNESS FLOOR: nothing authored opens the room already on top of
      // the player. Wave points are exempt HERE and carry the stricter
      // reachability law below instead, because they are edge entries chosen
      // against the player's LIVE position, not against the spawn.
      for (const e of r.enemies) {
        const d = Math.hypot(e.x - r.player[0], e.y - r.player[1]);
        if (d < MIN_SPAWN_DIST) errs.push(`${tag}: ${e.kind} spawns ${d.toFixed(0)}px from the player spawn (floor ${MIN_SPAWN_DIST})`);
      }
      r.extraSpawns.forEach((p, i) => {
        const d = Math.hypot(p[0] - r.player[0], p[1] - r.player[1]);
        if (d < MIN_SPAWN_DIST) errs.push(`${tag}: extraSpawn ${i} is ${d.toFixed(0)}px from the player spawn (floor ${MIN_SPAWN_DIST})`);
      });
      // WAVE REACHABILITY: the sim always takes the FARTHEST wave point from
      // wherever the player is standing, so the honest question is whether
      // that best point can ever fall inside WAVE_MIN_DIST. Sweep the whole
      // walkable floor and prove it cannot - one bad quartet would otherwise
      // drop a rusher in the player's lap only on the tiles nobody tested.
      let worstPos: [number, number] | null = null;
      let worstD = Infinity;
      for (let x = 12; x <= DESIGN_W - 12; x += 20) {
        for (let y = 12; y <= DESIGN_H - 12; y += 20) {
          if (insideAny(r.barriers, x, y, 0)) continue;
          let best = 0;
          for (const [wx, wy] of r.waveSpawns) best = Math.max(best, Math.hypot(wx - x, wy - y));
          if (best < worstD) {
            worstD = best;
            worstPos = [x, y];
          }
        }
      }
      if (worstPos && worstD < WAVE_MIN_DIST) {
        errs.push(
          `${tag}: standing at (${worstPos[0]},${worstPos[1]}) the farthest wave point is only ${worstD.toFixed(0)}px away (floor ${WAVE_MIN_DIST})`,
        );
      }
    });
    // AFK gate: room 1 needs a rusher with a CLEAR straight line to the spawn
    const r1 = set[0];
    const gate = r1.enemies.some(
      (e) => e.kind === "rusher" && segmentClear(r1.barriers, e.x, e.y, r1.player[0], r1.player[1]),
    );
    if (!gate) errs.push(`set ${si}: room 1 has no rusher with an unbarricaded line to the spawn (AFK gate)`);
  });
  return errs;
}
