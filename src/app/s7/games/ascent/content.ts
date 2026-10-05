/**
 * ASCENT CONTENT - THE SPIRE's one authored tower (the Jump King / Getting
 * Over It mirror). EVERYTHING is hand-authored and FIXED: one ledge layout,
 * one wind schedule, one repeat band. The seed NEVER designs here - there is
 * no seeded selection at all, because the whole game is memorizing ONE tower
 * (the Jump King law: the mountain is the same mountain for everyone,
 * forever). sim.ts reads these tables and rolls nothing.
 *
 * THE TOWER (bottom to top, 34 screens of 600px = 20400 units):
 *   The Catacombs        0 ..  5400   wide ledges, the on-ramp
 *   The Bone Halls    5400 .. 10800   tighter, first slick slopes, chimney
 *   The Storm Battlements 10800 .. 16200  narrow, WIND GUSTS live here only
 *   The Dawn Spire   16200 .. 20400   brutal narrow, the golden finish
 *   The High Spire   20400 .. open    authored REPEAT band (see below)
 *
 * validateContent() makes the authoring laws executable (check gate e):
 *  - every ledge inside the walls, wide enough to stand on, the MERGED array
 *    y-sorted overall (ties allowed only where a decoy is involved) so the
 *    sim's landing-sweep early break stays valid;
 *  - THE MAIN LINE (route 1): strictly-ascending ys and EVERY CONSECUTIVE
 *    PAIR within max jump range (vertical AND horizontal), floor to first
 *    ledge included - no main-line ledge is ever unreachable;
 *  - THE DECOYS (route 0): each is honestly landable (reachable-from-below
 *    from at least one other ledge), never a checkpoint; OUTBOUND reach from
 *    a decoy is deliberately NOT guaranteed - the asymmetry IS the trap;
 *  - exactly 3 checkpoint ledges (one per rough third), each flat and wide
 *    (a checkpoint is only a ledge you cannot slide off - NO respawns, the
 *    Jump King law: falling is the punishment and the floor is the reset);
 *  - wind gusts live INSIDE the storm band only, inside the run's 10800
 *    frames, at sane strengths;
 *  - the repeat band chains: crown -> first repeat ledge, every intra-pattern
 *    pair, and the wrap seam from one tile to the next are all within reach.
 *
 * THE REPEAT BAND (the no-score-caps law, ADR-0120): the authored tower is
 * finite but taller than any 3-minute run can climb. If a god run tops the
 * crown anyway, the High Spire begins: one authored 1260-unit ledge pattern
 * tiled upward FOREVER by pure arithmetic (authored content + an offset is
 * not generation). It is authored at the tower's hardest pitch - narrowest
 * stances, slick every other step - so the difficulty curve plateaus at
 * maximum and the score stays open.
 */

// ── geometry constants (world units = pixels of the 800-wide tower) ─────────

export const WORLD_W = 800;
export const SCREEN_H = 600;
export const TOWER_SCREENS = 34;
export const TOWER_TOP = TOWER_SCREENS * SCREEN_H; // 20400
export const WALL_L = 30;  // inner face of the left tower wall
export const WALL_R = 770; // inner face of the right tower wall

/** Reach law the validator enforces between consecutive ledges. Physics in
 * sim.ts gives a full-charge apex of ~278 units and, at the worst allowed
 * pair (240 up AND 220 across, edge to edge), a full-charge jump still
 * needs only ~562 of the 700 horizontal budget - so any pair inside these
 * bounds is genuinely jumpable from the near edge of the lower ledge (a
 * repositioning hop along your ledge is legitimate Jump King play). The
 * authored maxima sit further inside: 210 up, 150 across. */
export const JUMP_REACH_Y = 240;
export const JUMP_REACH_X = 220;

export const MIN_LEDGE_W = 30;
export const CP_MIN_W = 180;
export const CHECKPOINT_COUNT = 3;

// the storm band: the ONLY heights wind may touch (validated)
export const STORM_Y0 = 10800;
export const STORM_Y1 = 16200;

// ── ledges ──────────────────────────────────────────────────────────────────

/** Authored ledge shapes (the whole vocabulary): flat stands still, slick
 * slopes slide you off toward their tag side, bounce walls (below) are the
 * vertical pieces. Nothing else exists. */
export const K_FLAT = 0;
export const K_SLICK_L = 1; // slides you LEFT while you stand on it
export const K_SLICK_R = 2; // slides you RIGHT

export interface Ledge {
  x0: number;
  x1: number;
  y: number;    // the standing height (top face)
  kind: number; // K_FLAT | K_SLICK_L | K_SLICK_R
  cp: number;   // 1 = checkpoint ledge (wide, flat, restful - display flag)
  route: number; // 1 = the main line (chain-validated), 0 = decoy trap branch
}

const L = (x0: number, w: number, y: number, kind = K_FLAT): Ledge => ({ x0, x1: x0 + w, y, kind, cp: 0, route: 1 });
const CP = (x0: number, w: number, y: number): Ledge => ({ x0, x1: x0 + w, y, kind: K_FLAT, cp: 1, route: 1 });
/** A DECOY: a tempting stance OFF the main line. The sim treats it exactly
 * like any ledge (one-sided platform, same landing sweep); only the
 * validator's laws differ - it must be landable from below, but its onward
 * jumps are deliberately unchecked. Never a checkpoint. */
const D = (x0: number, w: number, y: number, kind = K_FLAT): Ledge => ({ x0, x1: x0 + w, y, kind, cp: 0, route: 0 });

/** THE TOWER, bottom to top. Authored by hand; the MERGED list stays
 * y-sorted (a physics invariant - the sim's landing sweep early-breaks on
 * it) and the main line's ys strictly ascend. The bottom four form a center
 * stack over the floor spawn (the on-ramp every new player and the
 * selfcheck bot can climb blind); the route then forks and never hands out
 * a free line again. Three D() decoys hide in the upper bands - tempting
 * stances that are easier to land than the true line and worse to leave. */
export const LEDGES: readonly Ledge[] = [
  // ── The Catacombs (0..5400): the on-ramp, then a generous zigzag ──────────
  L(300, 200, 120),
  L(330, 140, 260),
  L(340, 120, 420),
  L(350, 100, 560),
  L(240, 120, 700),
  L(480, 140, 840),
  L(150, 130, 980),
  L(380, 140, 1120),
  L(600, 120, 1260),
  L(430, 120, 1400),
  L(200, 130, 1540),
  L(60, 120, 1690),
  L(280, 120, 1840),
  L(500, 140, 1990),
  L(660, 100, 2140),
  L(420, 120, 2290),
  L(180, 120, 2440),
  L(360, 120, 2600),
  L(560, 120, 2760),
  L(330, 120, 2920),
  CP(260, 240, 3060), // CHECKPOINT 1 - the catacomb landing
  L(90, 110, 3220),
  L(300, 110, 3380),
  L(520, 110, 3540),
  L(340, 110, 3700),
  L(130, 110, 3860),
  L(350, 110, 4030),
  L(570, 110, 4200),
  L(390, 110, 4370),
  L(170, 110, 4540),
  L(380, 110, 4710),
  L(590, 110, 4880),
  L(400, 100, 5050),
  L(200, 100, 5220),
  L(420, 100, 5390),
  // ── The Bone Halls (5400..10800): tighter, slick slopes, the chimney ──────
  L(610, 90, 5560),
  L(430, 90, 5730, K_SLICK_R),
  L(240, 90, 5900),
  L(60, 90, 6070),
  L(250, 90, 6240, K_SLICK_L),
  L(450, 90, 6410),
  L(640, 80, 6580),
  L(460, 90, 6750),
  L(260, 90, 6920, K_SLICK_R),
  D(520, 130, 6980, K_SLICK_R), // DECOY - the greased shelf: wide, close, and
                                // right of the line; it slides you off the
                                // right edge into a ~400-unit fall onto the
                                // y6580 stance. Onward reach: none (y7090
                                // sits 360 across - out of range).
  L(80, 80, 7090),
  L(300, 80, 7260),
  L(500, 80, 7430, K_SLICK_L),
  L(680, 70, 7600),
  L(480, 90, 7770),
  L(280, 80, 7940),
  L(100, 80, 8110, K_SLICK_R),
  L(320, 80, 8280),
  L(520, 80, 8460),
  L(680, 70, 8640), // the chimney: four right-wall stances over a bounce wall
  L(660, 70, 8820),
  L(690, 70, 9000),
  L(650, 70, 9180),
  L(460, 90, 9360),
  CP(330, 240, 9540), // CHECKPOINT 2 - the ossuary gallery
  L(140, 90, 9720),
  L(340, 90, 9900, K_SLICK_L),
  L(540, 90, 10080),
  L(360, 80, 10260),
  L(170, 80, 10440),
  L(380, 80, 10620),
  // ── The Storm Battlements (10800..16200): narrow, windy ───────────────────
  L(560, 80, 10800),
  L(350, 75, 10990, K_SLICK_R),
  L(150, 70, 11180),
  L(340, 70, 11370),
  L(530, 70, 11560, K_SLICK_L),
  L(690, 65, 11750),
  L(500, 70, 11940),
  L(300, 70, 12130, K_SLICK_R),
  L(110, 65, 12320),
  L(290, 65, 12510),
  L(470, 65, 12700, K_SLICK_L),
  L(640, 65, 12890),
  D(580, 130, 12950, K_SLICK_L), // DECOY - the siren ledge: wide and only 60
                                 // above the y12890 stance, but slick-L: it
                                 // feeds you off its left edge into the open
                                 // wind lane, where the gusts own your fall
                                 // (first catch ~y11940, and the wind can
                                 // push you past even that).
  L(450, 65, 13080),
  L(260, 65, 13270, K_SLICK_R),
  L(80, 60, 13460),
  L(250, 60, 13650),
  L(420, 60, 13840, K_SLICK_L),
  L(590, 60, 14030),
  L(410, 60, 14220),
  L(230, 60, 14410, K_SLICK_R),
  L(60, 55, 14600),
  L(230, 55, 14790),
  L(400, 55, 14980, K_SLICK_L),
  L(570, 55, 15170),
  L(390, 55, 15360),
  CP(260, 240, 15550), // CHECKPOINT 3 - the storm shelter
  L(120, 55, 15740),
  L(300, 55, 15930, K_SLICK_R),
  L(480, 55, 16120),
  // ── The Dawn Spire (16200..20400): the brutal finish ──────────────────────
  L(650, 50, 16320),
  L(470, 50, 16530, K_SLICK_L),
  D(600, 95, 16620), // DECOY - the false door: a flat, wide pocket an easy
                     // hop up-right off the sliding y16530 stance (dy 90,
                     // gap 80) while the true door (y16740) is a hard
                     // near-max jump up-left. The only onward stance
                     // (y16740) sits 262 across - beyond the 220 reach law;
                     // escaping upward demands a near-full-charge full-left
                     // leap off the very lip. The honest exit is back down.
  L(290, 48, 16740),
  L(110, 48, 16950),
  L(290, 46, 17160, K_SLICK_R),
  L(470, 46, 17370),
  L(650, 44, 17580),
  L(480, 44, 17790, K_SLICK_L),
  L(300, 44, 18000),
  L(120, 42, 18210),
  L(300, 42, 18420, K_SLICK_R),
  L(480, 42, 18630),
  L(660, 40, 18840, K_SLICK_L),
  L(490, 40, 19050),
  L(310, 40, 19260, K_SLICK_R),
  L(130, 40, 19470),
  L(320, 38, 19680),
  L(500, 46, 19890, K_SLICK_L), // 46 wide: the crown approach is a ~20-frame
                                // window off the slide, brutal but real
  L(680, 36, 20100),
  L(500, 40, 20310),
  L(300, 200, 20400), // THE CROWN - the authored summit
] as const;

// ── the High Spire repeat band (above the crown; see the header law) ────────

export const REPEAT_H = 1260;

/** Pattern ys are RELATIVE to a tile base; tile k spans
 * TOWER_TOP + k*REPEAT_H .. TOWER_TOP + (k+1)*REPEAT_H. */
export const REPEAT_LEDGES: readonly Ledge[] = [
  L(620, 44, 180, K_SLICK_R),
  L(440, 42, 390),
  L(260, 40, 600, K_SLICK_L),
  L(90, 40, 810),
  L(270, 38, 1020, K_SLICK_R),
  L(450, 38, 1230),
] as const;

// ── bounce walls (the third ledge shape: vertical, bounces you off) ─────────

export interface BounceWall {
  x: number;
  y0: number;
  y1: number;
}

/** Six authored walls. Walls are ALWAYS optional - the validator never
 * requires a bounce and no wall may sit in an honest jump corridor (each is
 * placed above the local full-charge apex of every main-line jump that
 * crosses its x, so the main line never clips one). What they add is bank
 * shots and saves:
 *  - x200 @6360..6520: the bone-hall left rail - a hard-left bank off the
 *    y6410 stance drops you back onto y6240 instead of a deep fall.
 *  - x620 @7890..8150: the right rail over y7770 - bank a hard-right jump
 *    back toward the y7940 line, and catch right-side overshoots.
 *  - x620 @8760..9150: the chimney's left rail (overshoot in the channel and
 *    it pinballs you back onto the stances; enter below it, exit above it).
 *  - x380 @11700..12040: the storm mid-column - a left bank off y11560 or
 *    y11750 returns you to the stances instead of the wind lane.
 *  - x700 @13900..14300: the storm right rail - an overcharged jump from
 *    y13840 toward y14030 banks off it and still lands the stance.
 *  - x90 @16900..17500: the dawn spire's left guard (saves an overshoot past
 *    the 16950 stance from a full fall).
 * The outer tower walls at WALL_L/WALL_R always bounce. */
export const BOUNCE_WALLS: readonly BounceWall[] = [
  { x: 200, y0: 6360, y1: 6520 },
  { x: 620, y0: 7890, y1: 8150 },
  { x: 620, y0: 8760, y1: 9150 },
  { x: 380, y0: 11700, y1: 12040 },
  { x: 700, y0: 13900, y1: 14300 },
  { x: 90, y0: 16900, y1: 17500 },
] as const;

// ── wind (storm band only; a FIXED authored schedule, never RNG) ────────────

export interface WindGust {
  f0: number;    // first frame the gust blows (inclusive)
  f1: number;    // last frame + 1
  ax100: number; // x100 units/frame^2 shove while airborne inside the band
  y0: number;    // height band the gust covers (validated inside the storm)
  y1: number;
}

const G = (f0: number, f1: number, ax100: number): WindGust => ({ f0, f1, ax100, y0: STORM_Y0, y1: STORM_Y1 });

/** Twelve gusts across the 3 minutes, alternating direction, strengthening
 * late. Every run of every player sees the exact same weather. */
export const WIND: readonly WindGust[] = [
  G(600, 780, 14),
  G(1500, 1690, -16),
  G(2400, 2600, 18),
  G(3300, 3480, -14),
  G(4200, 4400, 16),
  G(5100, 5300, -18),
  G(6000, 6200, 15),
  G(6900, 7100, -15),
  G(7800, 8000, 17),
  G(8700, 8900, -17),
  G(9600, 9800, 19),
  G(10500, 10700, -19),
] as const;

export const RUN_FRAMES = 10800; // the 3-minute law: 180s x 60fps, exactly

/** The wind shove for one frame at one height. Pure authored lookup - the
 * sim and the renderer both read THIS, so the streaks always match the
 * physics. 0 when calm. */
export function windAt(frame: number, y: number): number {
  for (const g of WIND) {
    if (frame >= g.f0 && frame < g.f1 && y >= g.y0 && y <= g.y1) return g.ax100;
  }
  return 0;
}

// ── palette bands (draw.ts reads these; heights, names, band index) ─────────

export interface Band {
  name: string;
  y0: number;
  y1: number;
}

export const BANDS: readonly Band[] = [
  { name: "The Catacombs", y0: 0, y1: 5400 },
  { name: "The Bone Halls", y0: 5400, y1: 10800 },
  { name: "The Storm Battlements", y0: STORM_Y0, y1: STORM_Y1 },
  { name: "The Dawn Spire", y0: 16200, y1: TOWER_TOP },
  { name: "The High Spire", y0: TOWER_TOP, y1: Number.MAX_SAFE_INTEGER },
] as const;

export function bandIndexFor(y: number): number {
  for (let i = BANDS.length - 1; i >= 0; i--) if (y >= BANDS[i].y0) return i;
  return 0;
}

// ── the executable authoring laws (check gate e) ────────────────────────────

function hgap(a: Ledge, b: Ledge): number {
  return Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
}

function checkPair(a: Ledge, b: Ledge, where: string): void {
  const dy = b.y - a.y;
  if (dy > JUMP_REACH_Y) throw new Error(`${where}: vertical gap ${dy} > ${JUMP_REACH_Y} (y ${a.y} -> ${b.y})`);
  const hx = hgap(a, b);
  if (hx > JUMP_REACH_X) throw new Error(`${where}: horizontal gap ${hx} > ${JUMP_REACH_X} (y ${a.y} -> ${b.y})`);
}

export function validateContent(): void {
  // EVERY ledge (main + decoy): inside the walls, standable width, valid
  // route tag, and the MERGED array y-sorted overall - ties allowed only
  // where a decoy is involved. sim.ts's ledgeIdxInRange early-breaks on
  // `y > yHi` over this array, so the sort IS a physics invariant.
  for (let i = 0; i < LEDGES.length; i++) {
    const l = LEDGES[i];
    if (l.route !== 0 && l.route !== 1) throw new Error(`ledge ${i} (y ${l.y}) route ${l.route} is not 0|1`);
    if (l.x0 < WALL_L || l.x1 > WALL_R) throw new Error(`ledge ${i} (y ${l.y}) outside the walls`);
    if (l.x1 - l.x0 < MIN_LEDGE_W) throw new Error(`ledge ${i} (y ${l.y}) narrower than ${MIN_LEDGE_W}`);
    if (i > 0) {
      const p = LEDGES[i - 1];
      if (l.y < p.y)
        throw new Error(`ledge ${i} y ${l.y} below the previous (${p.y}) - the merged array must stay y-sorted`);
      if (l.y === p.y && p.route === 1 && l.route === 1)
        throw new Error(`ledges ${i - 1}/${i} tie at y ${l.y} on the main line (ties may only involve a decoy)`);
    }
  }

  // THE MAIN LINE (route 1): strictly-ascending ys + consecutive-pair reach,
  // floor to first ledge included - the climb is one honest chain and no
  // main-line ledge is ever unreachable.
  const floor: Ledge = { x0: WALL_L, x1: WALL_R, y: 0, kind: K_FLAT, cp: 0, route: 1 };
  let prev = floor;
  for (let i = 0; i < LEDGES.length; i++) {
    const l = LEDGES[i];
    if (l.route !== 1) continue;
    if (l.y <= prev.y) throw new Error(`main ledge ${i} y ${l.y} not above the previous main (${prev.y})`);
    checkPair(prev, l, `main ledge ${i}`);
    prev = l;
  }
  if (prev.y !== TOWER_TOP) throw new Error(`the crown sits at ${prev.y}, expected TOWER_TOP ${TOWER_TOP}`);

  // THE DECOYS (route 0): each must be honestly LANDABLE - reachable-from-
  // below from at least one OTHER ledge within the jump reach constants -
  // and never a checkpoint. OUTBOUND reach from a decoy is deliberately NOT
  // checked: the asymmetry IS the trap (an easy landing whose exits are all
  // worse than where you came from). Decoys punish, never kill - falling
  // never kills, so the worst a decoy costs is height.
  for (let i = 0; i < LEDGES.length; i++) {
    const d = LEDGES[i];
    if (d.route !== 0) continue;
    if (d.cp !== 0) throw new Error(`decoy ${i} (y ${d.y}) marked as a checkpoint`);
    let landable = false;
    for (let j = 0; j < LEDGES.length && !landable; j++) {
      if (j === i) continue;
      const b = LEDGES[j];
      if (b.y >= d.y) continue;
      if (d.y - b.y <= JUMP_REACH_Y && hgap(b, d) <= JUMP_REACH_X) landable = true;
    }
    if (!landable) throw new Error(`decoy ${i} (y ${d.y}) not reachable-from-below from any other ledge`);
  }

  // checkpoints: exactly 3, flat, wide, one per rough third of the tower
  const cps = LEDGES.filter((l) => l.cp === 1);
  if (cps.length !== CHECKPOINT_COUNT) throw new Error(`${cps.length} checkpoints, law says ${CHECKPOINT_COUNT}`);
  const third = TOWER_TOP / 3;
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    if (c.kind !== K_FLAT) throw new Error(`checkpoint at y ${c.y} is not flat`);
    if (c.x1 - c.x0 < CP_MIN_W) throw new Error(`checkpoint at y ${c.y} narrower than ${CP_MIN_W}`);
    if (!(c.y > third * i && c.y <= third * (i + 1)))
      throw new Error(`checkpoint ${i + 1} at y ${c.y} outside its third (${Math.round(third * i)}..${Math.round(third * (i + 1))})`);
  }

  // wind: inside the storm band only, inside the run, sane strength
  for (const g of WIND) {
    if (!(g.f0 >= 0 && g.f1 > g.f0 && g.f1 <= RUN_FRAMES)) throw new Error(`gust frames ${g.f0}..${g.f1} outside the run`);
    if (!(g.y0 >= STORM_Y0 && g.y1 <= STORM_Y1 && g.y1 > g.y0)) throw new Error(`gust at f${g.f0} blows outside the storm band`);
    const s = Math.abs(g.ax100);
    if (s < 8 || s > 30) throw new Error(`gust at f${g.f0} strength ${g.ax100} outside 8..30`);
  }

  // the repeat band chains: crown -> first, intra-pattern, and the wrap seam
  if (REPEAT_LEDGES.length === 0) throw new Error("empty repeat pattern");
  const crown = LEDGES[LEDGES.length - 1];
  const first = REPEAT_LEDGES[0];
  checkPair(crown, { ...first, y: TOWER_TOP + first.y }, "repeat seam (crown -> pattern)");
  let rp = REPEAT_LEDGES[0];
  for (let i = 0; i < REPEAT_LEDGES.length; i++) {
    const l = REPEAT_LEDGES[i];
    if (l.route !== 1) throw new Error(`repeat ledge ${i} is not main-line (the High Spire has no decoys)`);
    if (l.x0 < WALL_L || l.x1 > WALL_R) throw new Error(`repeat ledge ${i} outside the walls`);
    if (l.x1 - l.x0 < MIN_LEDGE_W) throw new Error(`repeat ledge ${i} narrower than ${MIN_LEDGE_W}`);
    if (!(l.y > 0 && l.y <= REPEAT_H)) throw new Error(`repeat ledge ${i} rel y ${l.y} outside (0, ${REPEAT_H}]`);
    if (i > 0) {
      if (l.y <= rp.y) throw new Error(`repeat ledge ${i} not above the previous`);
      checkPair(rp, l, `repeat ledge ${i}`);
    }
    rp = l;
  }
  const last = REPEAT_LEDGES[REPEAT_LEDGES.length - 1];
  checkPair(last, { ...first, y: first.y + REPEAT_H }, "repeat wrap seam (tile -> next tile)");

  // bounce walls: inside the tower, and never poking through a ledge's
  // standing line (no ledge with y inside a wall's span may straddle its x).
  // Walls carry NO reach constraints - they are always optional and the
  // validator never requires a bounce.
  for (const w of BOUNCE_WALLS) {
    if (w.x <= WALL_L || w.x >= WALL_R) throw new Error(`bounce wall at x ${w.x} outside the walls`);
    if (w.y1 <= w.y0) throw new Error(`bounce wall at x ${w.x} has no height`);
    for (const l of LEDGES) {
      if (l.y < w.y0 || l.y > w.y1) continue;
      if (w.x >= l.x0 && w.x <= l.x1)
        throw new Error(`bounce wall at x ${w.x} pokes through the ledge at y ${l.y}`);
    }
  }

  // bands contiguous from the floor, storm band matches the wind law
  if (BANDS[0].y0 !== 0) throw new Error("bands do not start at the floor");
  for (let i = 1; i < BANDS.length; i++) {
    if (BANDS[i].y0 !== BANDS[i - 1].y1) throw new Error(`band ${i} does not touch band ${i - 1}`);
  }
  const storm = BANDS[2];
  if (storm.y0 !== STORM_Y0 || storm.y1 !== STORM_Y1) throw new Error("storm band constants drifted from BANDS");
}
