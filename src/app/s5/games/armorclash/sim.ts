/**
 * SEASON 5 · IRON SIEGE — ARMOR CLASH (game key "armorclash").
 *
 * A portrait bridge-and-towers card battler. Mike, 2026-07-28, handing over a
 * Clash Royale screenshot: "We change Gunnery Run into a Clash Royal clone
 * like the image attached. Different tanks, refilling mana, tanks cost
 * different amounts and have different skills. Random enemies, get harder for
 * 3 rounds until they have almost 1.5x your mana regen."
 *
 * THE SHAPE. A river splits the field with two bridges over it. Each side has
 * two small towers and an HQ. You hold a hand of four tank cards, mana refills
 * on its own, and you tap a card then tap your own half to put that tank on
 * the field. It walks to the nearer bridge, crosses, and picks its own fights.
 * Raze their HQ to take the round. Three rounds, and the enemy resupplies
 * faster each one, half again your rate by the last.
 *
 * ── DETERMINISM ────────────────────────────────────────────────────────────
 * Pure and import-free. Two streams (`rng` gameplay, `rngFx` cosmetics), and
 * the gameplay stream is consumed ENTIRELY AT CONSTRUCTION:
 *   1. one Fisher-Yates shuffle of the eight cards (7 rolls)
 *   2. the full enemy schedule for all three rounds (3 rolls per deploy)
 * `stepArmorclash` rolls NOTHING. That is the strongest form of the franchise
 * law: no amount of player timing can shift a later roll, because there are no
 * later rolls. Round resets re-deal from the SAME construction-time order.
 *
 * ── WHY THE ENEMY SCHEDULE IS SOLVENT ──────────────────────────────────────
 * Each round's deploy list is fixed, and a deploy's time is derived from the
 * cumulative mana it costs divided by that round's regen. At time t_i the
 * enemy has banked MANA_START + regen*t_i, and t_i is chosen so that always
 * exceeds the cumulative cost. The bar therefore never goes negative and the
 * schedule can never stall, which is what lets ceiling() treat the enemy
 * roster as a fixed count.
 *
 * ── SCORING ────────────────────────────────────────────────────────────────
 * Points only follow ORDERS. Enemy units killed by YOUR units pay; kills made
 * by your towers pay nothing, which closes the obvious turtle exploit (park
 * nothing, let the towers farm). Tower damage pays per 5 hp through an integer
 * counter so the displayed number and the paid number can never drift.
 */

// ── the shell's input, redeclared locally (sims stay import-free) ───────────
export interface SimInput {
  px: number | null;
  py: number | null;
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  downKey: boolean;
  space: boolean;
}

export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── the arena (literal px at the pinned 360x480 portrait tape size) ────────
export const VIEW_W = 360;
export const VIEW_H = 480;
/** Everything below this is the sim's own HUD strip: the sim owns the WHOLE
 * canvas, card slots included, so a tap is one coordinate space end to end. */
export const FIELD_H = 384;
export const RIVER_Y0 = 180;
export const RIVER_Y1 = 204;
export const BRIDGE_XS = [104, 256] as const;
export const BRIDGE_HW = 20; // half-width
/** How close counts as "standing on" a navigation waypoint. Must stay well
 *  under the crossing latch's 8px window (see stepUnits). */
export const NAV_EPS = 2;
export const TOWER_R = 14;
export const HQ_R = 20;

export const CARD_SLOT_Y0 = 400;
export const CARD_SLOT_Y1 = 476;
export const CARD_SLOT_W = 70;
export const CARD_SLOT_GAP = 76;
export const CARD_SLOT_X0 = 10;

export const INTRO_T = 2.5;
export const BREAK_T = 3.0;
/**
 * ONE BATTLE, THREE MINUTES (Mike 2026-08-01: "the rounds are too short. It
 * should be one 3 minute round with double resources for the last minute").
 *
 * Three 100s rounds meant three restarts: the board wiped just as a push was
 * working, and the interesting part -- a field crowded enough that mana is a
 * real decision -- never had time to happen. One long battle keeps the whole
 * enemy roster (all three old waves are merged into a single schedule) and
 * lets a game state actually develop, with a resupply ramp every minute and
 * a flood at the end instead of a reset.
 */
export const ROUND_T = 180;
export const ROUNDS = 1;
/** THE FINAL MINUTE. Past this the regen doubles for BOTH sides: your bar
 * fills as fast as theirs, so the climax is a slugging match rather than a
 * losing one. Elapsed seconds, not remaining, so it reads the same forwards. */
export const SURGE_T = 120;
export const SURGE_MULT = 2;
/** An untouched run is scuttled well inside the 60s bank floor. Belt and
 * braces: tower kills pay nothing, so an idle run cannot score either. */
export const IDLE_SCUTTLE_T = 15;

// ── mana ───────────────────────────────────────────────────────────────────
export const MANA_START = 6;
export const MANA_CAP = 12;
export const REGEN = 0.55;
/**
 * Mike's ramp, now per MINUTE of the single battle rather than per round: they
 * resupply a little faster than you from the start and pull further ahead as
 * the battle wears on, until the final-minute surge doubles both bars.
 */
export const ENEMY_REGEN_MULT = [1.1, 1.4, 1.7] as const;
/** Which minute of the battle we are in (0,1,2), clamped. */
export function minuteIndex(elapsed: number): 0 | 1 | 2 {
  return Math.min(2, Math.max(0, Math.floor(elapsed / 60))) as 0 | 1 | 2;
}

// ── the deck ───────────────────────────────────────────────────────────────
/** Baked as literals rather than imported from lib/s5/tanks.ts, because sims
 * are import-free. Derived from that roster's own ratings so a card's feel
 * matches the tank players already know:
 *   cost  = {T1 3, T2 4, T3 6, T4 8, T5 10}
 *   hp    = round((40 + 14*arm) * (1 + 0.15*(tier-1)))
 *   dmg   = round((6 + 2*fp)  * (1 + 0.10*(tier-1)))
 *   speed = round(22 + 2.6*spd)
 */
export interface CardDef {
  key: string;
  name: string;
  tier: number;
  cost: number;
  hp: number;
  dmg: number;
  speed: number;
  range: number;
  r: number;
  /**
   * BEHAVIOUR AXIS. Every card was a tank until the mortar pit, so the deck had
   * no way to express "this one is different in kind". Optional so all eight
   * existing cards keep their exact behaviour with no edit.
   */
  /** false = never moves. Skips locomotion AND cannot be pushed by separation. */
  mobile?: boolean;
  /** Dead zone. It cannot hit anything closer than this -- the counterplay. */
  minRange?: number;
  /**
   * WEAPON AXIS. Every card fired the identical instant tracer on the same 1.2s
   * cooldown, so a Tiger II felt like a Stuart with bigger numbers (Mike: "the
   * tanks should have different weapons, like the top Tiger II tank should have
   * a laser that charges up and fires that you can see").
   *
   * "beam" charges for `chargeT` of its `fireCdMax` cycle -- the client draws
   * the swell and the aim line off `fireCd` alone, so no new state -- then
   * lands `beamDmg` in one hit. DPS-NEUTRAL against the shared gun by design
   * (62 / 2.2s = 28.2 vs 34 / 1.2s = 28.3), so this is feel, not power, and
   * ceiling() -- which counts bodies and point values, never damage -- does
   * not move.
   */
  weapon?: "beam";
  fireCdMax?: number;
  chargeT?: number;
  beamDmg?: number;
}
export const CARDS: readonly CardDef[] = [
  { key: "stuart", name: "M3 Stuart", tier: 1, cost: 3, hp: 82, dmg: 12, speed: 43, range: 42, r: 9 },
  { key: "chaffee", name: "M24 Chaffee", tier: 1, cost: 3, hp: 82, dmg: 14, speed: 43, range: 42, r: 9 },
  { key: "sherman", name: "M4 Sherman", tier: 2, cost: 4, hp: 127, dmg: 18, speed: 38, range: 42, r: 9 },
  { key: "cromwell", name: "Cromwell", tier: 2, cost: 4, hp: 110, dmg: 18, speed: 45, range: 42, r: 9 },
  { key: "hellcat", name: "M18 Hellcat", tier: 3, cost: 6, hp: 88, dmg: 22, speed: 48, range: 42, r: 9 },
  { key: "panther", name: "Panther", tier: 3, cost: 6, hp: 179, dmg: 24, speed: 38, range: 42, r: 9 },
  { key: "tiger", name: "Tiger I", tier: 4, cost: 8, hp: 220, dmg: 29, speed: 32, range: 42, r: 10 },
  { key: "tiger2", name: "Tiger II", tier: 5, cost: 10, hp: 266, dmg: 34, speed: 30, range: 42, r: 10,
    weapon: "beam", fireCdMax: 2.2, chargeT: 0.7, beamDmg: 62 },
  // THE MORTAR PIT. Immovable, outranges the river, blind up close.
  // range 96 clears the water (24) plus both banks, so it genuinely shells your
  // side; minRange 34 is the answer to it. Fragile on purpose (hp 96): once
  // something is standing on it, it dies fast. Tier 3 so a kill pays like one.
  { key: "mortar", name: "Missile Launcher", tier: 3, cost: 5, hp: 96, dmg: 26, speed: 0, range: 96, r: 10, mobile: false, minRange: 34 },
  // THE PILLBOX. Mike: "needs one more building for a turret you can place in
  // your base for extra fire power." Point defence, not artillery: range 64 is
  // deliberately UNDER a tower's 70 so it thickens a position without ever
  // out-ranging the thing it guards, and no minRange because its whole job is
  // whatever is already on top of you. Tough (140) and cheap-ish (4) so it is
  // a real answer to a push, but it kills nothing on its own -- it has to be
  // placed where the fight actually comes.
  { key: "pillbox", name: "Pillbox", tier: 2, cost: 4, hp: 140, dmg: 13, speed: 0, range: 64, r: 10, mobile: false },
] as const;
export const UNIT_FIRE_CD = 1.2;

/** Points a kill pays, by the VICTIM's tier. */
export const KILL_PTS: Record<number, number> = { 1: 10, 2: 14, 3: 20, 4: 28, 5: 40 };

// ── towers ─────────────────────────────────────────────────────────────────
// TUNED AGAINST THE ORACLE. The first cut ran 260/420 over a 90s round and the
// bot fought well - ten of eleven enemies killed, a tower razed - and still ran
// out of clock in ROUND ONE without touching the HQ. A card game whose opening
// round is unwinnable teaches nothing; these are the plan'''s named dials.
export const SMALL_HP = 220;
export const SMALL_DMG = 24;
export const HQ_HP = 340;
export const HQ_DMG = 27;
export const TOWER_CD = 0.9;
export const SMALL_RANGE = 70;
export const HQ_RANGE = 64;
export const TOWER_TELE = 0.35;
/** One point per this much damage dealt to an enemy tower, paid through an
 * integer counter so the shown percentage and the paid points never drift. */
export const TOWER_DMG_PER_PT = 5;
export const SMALL_KILL_PTS = 40;
export const HQ_KILL_PTS = 120;
/** Taking the enemy HQ ends the battle and pays this. It replaces the three
 * per-round wins (100+150+200), so the ceiling's win term is unchanged. */
export const WIN_PTS = 450;
/** Clock-out with more of their structures razed than yours lost: a marginal
 * victory, worth less than storming the HQ and mutually exclusive with it. */
export const TIEBREAK_PTS = 150;
export const ROUND_WIN_PTS = [100, 150, 200] as const;
export const CLOCK_PTS_PER_SEC = 2;

// ── engage ─────────────────────────────────────────────────────────────────
export const AGGRO_R = 60;
export const AGGRO_LEAVE_MUL = 1.25;
export const DENY_T = 0.35;

// ── the enemy roster: FIXED counts, which is what bounds the ceiling ───────
const R1: readonly string[] = [
  "stuart", "sherman", "chaffee", "cromwell", "stuart", "hellcat",
  "sherman", "panther", "stuart", "chaffee", "tiger",
];
const R2: readonly string[] = [
  "stuart", "sherman", "chaffee", "hellcat", "cromwell", "stuart", "sherman",
  "panther", "hellcat", "stuart", "chaffee", "tiger", "tiger2",
];
const R3: readonly string[] = [
  "stuart", "cromwell", "chaffee", "sherman", "hellcat", "panther", "stuart",
  "cromwell", "sherman", "hellcat", "panther", "stuart", "chaffee", "tiger", "tiger2",
];
/**
 * ONE SCHEDULE. The three old round rosters, merged: 39 enemies over one
 * three-minute battle, in the order they used to arrive. Nothing was cut, so
 * the ceiling's kill term is unchanged -- what changed is that you now face
 * them without the board being wiped twice on the way.
 */
export const ENEMY_WAVE: readonly (readonly string[])[] = [[...R1, ...R2, ...R3]];

function cardIndex(key: string): number {
  for (let i = 0; i < CARDS.length; i++) if (CARDS[i].key === key) return i;
  return 0;
}

// ── stats ──────────────────────────────────────────────────────────────────
export interface SimStats {
  botox: number;
  drugs: number;
  ozempic: number;
  aura: number;
  optics: number;
}
export interface AcMods {
  speedMul: number;
  hpMul: number;
  shieldT: number;
  dmgMul: number;
  previewLead: number;
  showEnemyMana: boolean;
}
export function acMods(raw: Partial<SimStats> | null | undefined): AcMods {
  const c = (v: unknown, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
  };
  const armor = c(raw?.botox, 4);
  const engine = c(raw?.drugs, 4);
  const smoke = c(raw?.ozempic, 4);
  const cal = c(raw?.aura, 30);
  const optics = c(raw?.optics, 4);
  // CEILING-NEUTRAL, every one: they change how fast the same fixed enemy
  // roster and the same fixed tower hp pools fall. None touches a count, a
  // point value, the schedule or a clock, so ceiling() takes no stats.
  return {
    speedMul: 1 + 0.04 * engine,
    hpMul: 1 + 0.06 * armor,
    shieldT: 0.25 * smoke,
    dmgMul: 1 + (0.35 * cal) / 30,
    previewLead: 0.5 * optics,
    showEnemyMana: optics >= 1,
  };
}

// ── entities ───────────────────────────────────────────────────────────────
export interface Unit {
  id: number;
  side: 0 | 1; // 0 = you, 1 = the enemy
  card: number;
  x: number;
  y: number;
  a: number;
  hp: number;
  maxHp: number;
  fireCd: number;
  shieldT: number;
  /** 0 = heading for the bridge, 1 = crossing, 2 = running at the objective. */
  wp: 0 | 1 | 2;
  bridge: number;
  /** THE CROSSING LATCH. `approach` = heading for my own bank at the bridge
   *  mouth; `crossing` = committed, walking the planks; `over` = on their
   *  side. Latched on purpose: recomputing "am I lined up" every frame let a
   *  separation shove reverse a unit's goal mid-river, which is what jammed
   *  the bridge. Only reaching the far bank clears `crossing`. */
  cross: 0 | 1 | 2;
  /** A small fixed lateral offset inside the plank, per unit. Without it every
   *  unit steers at the identical point and the queue is a pile. */
  lane: number;
  targetId: number; // a unit id, or -1
  hit: number;
  ko: number;
  dead: boolean;
}
export interface Tower {
  side: 0 | 1;
  big: boolean;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  fireCd: number;
  /** Lock-on countdown before a shot lands. Exposed so the renderer can draw
   *  the windup: a tower shot you cannot see coming is just damage. */
  tele: number;
  dmgPaid: number; // whole points already granted for damage to this tower
  hit: number;
  dead: boolean;
  ko: number;
}
export interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
  side: 0 | 1;
  /** A charged beam rather than a shell: the client draws it thick and hot. */
  beam?: boolean;
  /** A lobbed shell (the mortar): the client arcs it instead of ruling a line. */
  arc?: boolean;
}
export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
}
export interface Float {
  x: number;
  y: number;
  txt: string;
  life: number;
  big: boolean;
}
interface Deploy {
  t: number;
  card: number;
  x: number;
  y: number;
  fired: boolean;
}

export interface AcState {
  W: number;
  H: number;
  k: number;
  seed: string;
  rng: () => number;
  rngFx: () => number;
  reduced: boolean;
  mods: AcMods;

  t: number;
  clock: number;
  phase: "intro" | "play" | "break" | "over";
  phaseT: number;
  round: number;
  roundT: number;
  over: boolean;
  win: boolean;
  deathCause: string;

  mana: number;
  enemyMana: number;
  deck: number[];
  hand: number[];
  next: number;
  sel: number;
  denyT: number;

  units: Unit[];
  towers: Tower[];
  tracers: Tracer[];
  parts: Part[];
  floats: Float[];
  nextId: number;

  schedule: Deploy[][];
  score: number;
  kills: number;
  deploysPlayer: number;
  deploysEnemy: number;
  towersDownEnemy: number;
  hqDownEnemy: number;
  roundLog: number[];

  banner: { txt: string; sub?: string; t: number; big?: boolean } | null;
  shake: number;
  freeze: number;

  wasDown: boolean;
  prevLeft: boolean;
  prevRight: boolean;
  prevUp: boolean;
  prevSpace: boolean;
  touched: boolean;
}

// ── helpers ────────────────────────────────────────────────────────────────
function burst(s: AcState, x: number, y: number, n: number, spd: number, r: number) {
  const cap = s.reduced ? 40 : 140;
  for (let i = 0; i < n && s.parts.length < cap; i++) {
    const a = s.rngFx() * Math.PI * 2;
    const m = spd * (0.3 + s.rngFx() * 0.7);
    s.parts.push({ x, y, vx: Math.cos(a) * m, vy: Math.sin(a) * m, life: 0.3 + s.rngFx() * 0.4, r: r * (0.5 + s.rngFx() * 0.6) });
  }
}
function float(s: AcState, x: number, y: number, txt: string, big = false) {
  if (s.floats.length > 20) s.floats.shift();
  s.floats.push({ x, y, txt, life: 1.0, big });
}
function hitstop(s: AcState, t: number) {
  s.freeze = Math.max(s.freeze, t);
}

/** Card-slot hitboxes, exported so the client and the oracle agree exactly. */
export function slotRect(i: number): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = CARD_SLOT_X0 + i * CARD_SLOT_GAP;
  return { x0, y0: CARD_SLOT_Y0, x1: x0 + CARD_SLOT_W, y1: CARD_SLOT_Y1 };
}

function towersOf(s: AcState, side: 0 | 1): Tower[] {
  return s.towers.filter((t) => t.side === side && !t.dead);
}

// ── construction ───────────────────────────────────────────────────────────
function buildTowers(s: AcState) {
  s.towers = [
    { side: 1, big: false, x: 104, y: 88, r: TOWER_R, hp: SMALL_HP, maxHp: SMALL_HP, fireCd: 0, tele: 0, dmgPaid: 0, hit: 0, dead: false, ko: 0 },
    { side: 1, big: false, x: 256, y: 88, r: TOWER_R, hp: SMALL_HP, maxHp: SMALL_HP, fireCd: 0, tele: 0, dmgPaid: 0, hit: 0, dead: false, ko: 0 },
    { side: 1, big: true, x: 180, y: 36, r: HQ_R, hp: HQ_HP, maxHp: HQ_HP, fireCd: 0, tele: 0, dmgPaid: 0, hit: 0, dead: false, ko: 0 },
    { side: 0, big: false, x: 104, y: 296, r: TOWER_R, hp: SMALL_HP, maxHp: SMALL_HP, fireCd: 0, tele: 0, dmgPaid: 0, hit: 0, dead: false, ko: 0 },
    { side: 0, big: false, x: 256, y: 296, r: TOWER_R, hp: SMALL_HP, maxHp: SMALL_HP, fireCd: 0, tele: 0, dmgPaid: 0, hit: 0, dead: false, ko: 0 },
    { side: 0, big: true, x: 180, y: 344, r: HQ_R, hp: HQ_HP, maxHp: HQ_HP, fireCd: 0, tele: 0, dmgPaid: 0, hit: 0, dead: false, ko: 0 },
  ];
}

export function createArmorclash(
  w: number,
  h: number,
  seed: string,
  reduced = false,
  stats?: Partial<SimStats> | null,
): AcState {
  const rng = mulberry32(fnv1a("ac-" + seed));
  const s: AcState = {
    W: w || VIEW_W,
    H: h || VIEW_H,
    k: 1,
    seed,
    rng,
    rngFx: mulberry32(fnv1a("acfx-" + seed)),
    reduced,
    mods: acMods(stats),
    t: 0,
    clock: 0,
    phase: "intro",
    phaseT: INTRO_T,
    round: 1,
    roundT: ROUND_T,
    over: false,
    win: false,
    deathCause: "",
    mana: MANA_START,
    enemyMana: MANA_START,
    deck: [],
    hand: [],
    next: 0,
    sel: 0,
    denyT: 0,
    units: [],
    towers: [],
    tracers: [],
    parts: [],
    floats: [],
    nextId: 1,
    schedule: [],
    score: 0,
    kills: 0,
    deploysPlayer: 0,
    deploysEnemy: 0,
    towersDownEnemy: 0,
    hqDownEnemy: 0,
    roundLog: [],
    banner: null,
    shake: 0,
    freeze: 0,
    wasDown: false,
    prevLeft: false,
    prevRight: false,
    prevUp: false,
    prevSpace: false,
    touched: false,
  };
  buildTowers(s);

  // ── ROLL 1: the deck order. Seven rolls, Fisher-Yates, once, ever. Round
  //    resets re-deal from THIS order rather than shuffling again.
  const order = CARDS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  s.deck = order.slice();
  dealHand(s);

  // ── ROLL 2: the whole enemy schedule, the entire battle, up front.
  //
  // SOLVENCY, RE-PROVEN FOR THE THREE-MINUTE BATTLE. The enemy's regen is now
  // piecewise (1.1x for the first minute, 1.4x for the second, 1.7x after, and
  // everything doubles past SURGE_T), so banked mana at time t is
  //   6 + 0.55 * [1.1*min(t,60) + 1.4*clamp(t-60,0,60) + 1.7*2*max(0,t-120)]
  // The 39-card roster costs 183 mana in total. At the last legal deploy time
  // (ROUND_T - 6 = 174s) the enemy has banked
  //   6 + 0.55 * (66 + 84 + 183.6) = 189.48
  // so the schedule is solvent end to end with ~6.5 mana of margin, and the
  // costliest prefix crosses affordability around t = 170.5s, inside the clamp.
  // `bankedAt` below is that same function, so the two can never disagree.
  const bankedAt = (t: number) => {
    const m1 = Math.min(t, 60);
    const m2 = Math.min(Math.max(t - 60, 0), 60);
    const m3 = Math.max(0, t - SURGE_T);
    return (
      MANA_START +
      REGEN *
        (ENEMY_REGEN_MULT[0] * m1 + ENEMY_REGEN_MULT[1] * m2 + ENEMY_REGEN_MULT[2] * SURGE_MULT * m3)
    );
  };
  for (let r = 0; r < ROUNDS; r++) {
    const list = ENEMY_WAVE[r];
    const out: Deploy[] = [];
    let cum = 0;
    for (let i = 0; i < list.length; i++) {
      const ci = cardIndex(list[i]);
      cum += CARDS[ci].cost;
      // The moment the enemy can afford everything queued so far. Walked
      // rather than solved because the regen is piecewise; 0.5s steps are far
      // finer than the +-1.2s jitter below and cost nothing at construction.
      let earliest = 0;
      while (earliest < ROUND_T && bankedAt(earliest) < cum) earliest += 0.5;
      const jitter = (rng() * 2 - 1) * 1.2;
      const t = Math.max(3.5, Math.min(ROUND_T - 6, earliest + 1.5 + jitter));
      const lane = rng() < 0.5 ? 0 : 1;
      const x = BRIDGE_XS[lane] + (rng() * 2 - 1) * 14;
      const y = rng() < 0.25 ? 72 + rng() * 36 : 140 + rng() * 28;
      out.push({ t, card: ci, x, y, fired: false });
    }
    out.sort((a, b) => a.t - b.t);
    s.schedule.push(out);
  }
  return s;
}

function dealHand(s: AcState) {
  s.hand = [s.deck[0], s.deck[1], s.deck[2], s.deck[3]];
  s.next = s.deck[4];
  s.sel = 0;
}

// ── deploy ─────────────────────────────────────────────────────────────────
function spawnUnit(s: AcState, side: 0 | 1, card: number, x: number, y: number) {
  const c = CARDS[card];
  const hpMul = side === 0 ? s.mods.hpMul : 1;
  const bridge = Math.abs(x - BRIDGE_XS[0]) <= Math.abs(x - BRIDGE_XS[1]) ? 0 : 1;
  s.units.push({
    id: s.nextId++,
    side,
    card,
    x,
    y,
    a: side === 0 ? -Math.PI / 2 : Math.PI / 2,
    hp: Math.round(c.hp * hpMul),
    maxHp: Math.round(c.hp * hpMul),
    fireCd: 0.4,
    shieldT: side === 0 ? s.mods.shieldT : 0,
    wp: 0,
    bridge,
    cross: 0,
    // Spread across the plank deterministically by unit id: no rng, and two
    // units never pick the same slot.
    lane: ((s.nextId % 3) - 1) * (BRIDGE_HW * 0.42),
    targetId: -1,
    hit: 0,
    ko: 0,
    dead: false,
  });
}

/** Exported for the CLIENT's placement preview: the ghost has to be judged by
 * the same function that judges the tap, or the tint lies. Pure, no state. */
export function legalDeploy(s: AcState, x: number, y: number): boolean {
  if (y < RIVER_Y1 + 4 || y > FIELD_H - 6) return false;
  if (x < 12 || x > VIEW_W - 12) return false;
  for (const t of s.towers) {
    if (t.side === 0 && !t.dead && Math.hypot(x - t.x, y - t.y) < t.r + 8) return false;
  }
  return true;
}

// ── combat ─────────────────────────────────────────────────────────────────
function unitById(s: AcState, id: number): Unit | null {
  if (id < 0) return null;
  for (const u of s.units) if (u.id === id && !u.dead) return u;
  return null;
}

function payTowerDamage(s: AcState, tw: Tower, before: number) {
  if (tw.side !== 1) return; // only razing THEIR towers pays
  const dealt = tw.maxHp - Math.max(0, tw.hp);
  const owed = Math.floor(dealt / TOWER_DMG_PER_PT) - tw.dmgPaid;
  if (owed > 0) {
    tw.dmgPaid += owed;
    s.score += owed;
  }
  void before;
}

function killUnit(s: AcState, u: Unit, byUnit: boolean) {
  u.dead = true;
  u.ko = 0.5;
  u.hp = 0;
  burst(s, u.x, u.y, 10, 90, 2.2);
  if (u.side === 1) {
    s.kills++;
    // ONLY kills made by your UNITS pay. A tower kill pays nothing, which is
    // what stops "deploy nothing and let the towers farm" from being a score.
    if (byUnit) {
      const pts = KILL_PTS[CARDS[u.card].tier] ?? 10;
      s.score += pts;
      float(s, u.x, u.y - 14, `+${pts}`);
    }
    hitstop(s, 0.03);
  }
}

function killTower(s: AcState, tw: Tower) {
  tw.dead = true;
  tw.ko = 0.8;
  tw.hp = 0;
  burst(s, tw.x, tw.y, 22, 150, 3);
  s.shake = Math.max(s.shake, tw.big ? 14 : 9);
  hitstop(s, tw.big ? 0.16 : 0.08);
  if (tw.side === 1) {
    const pts = tw.big ? HQ_KILL_PTS : SMALL_KILL_PTS;
    s.score += pts;
    float(s, tw.x, tw.y - 22, `+${pts}`, true);
    if (tw.big) s.hqDownEnemy++;
    else s.towersDownEnemy++;
  }
}

function damageTower(s: AcState, tw: Tower, dmg: number) {
  if (tw.dead) return;
  const before = tw.hp;
  tw.hp -= dmg;
  tw.hit = 0.18;
  payTowerDamage(s, tw, before);
  if (tw.hp <= 0) killTower(s, tw);
}

function damageUnit(s: AcState, u: Unit, dmg: number, byUnit: boolean) {
  if (u.dead || u.shieldT > 0) return;
  u.hp -= dmg;
  u.hit = 0.16;
  if (u.hp <= 0) killUnit(s, u, byUnit);
}

// ── rounds ─────────────────────────────────────────────────────────────────
function resetRound(s: AcState) {
  s.units = [];
  s.tracers = [];
  s.mana = MANA_START;
  s.enemyMana = MANA_START;
  s.roundT = ROUND_T;
  buildTowers(s);
  dealHand(s); // from the SAME construction-time deck order: no new rolls
  for (const d of s.schedule[s.round - 1] ?? []) d.fired = false;
}

function endRun(s: AcState, win: boolean, cause: string, txt: string, sub?: string) {
  if (s.phase === "over") return;
  s.win = win;
  s.deathCause = cause;
  s.phase = "over";
  s.over = true;
  s.banner = { txt, sub, t: 3, big: true };
}

/** THE HQ FALLS: one battle, one decisive moment. Pays WIN_PTS plus whatever
 * clock is left, exactly as the last round used to. */
function winRound(s: AcState) {
  s.score += WIN_PTS;
  const clock = Math.floor(Math.max(0, s.roundT)) * CLOCK_PTS_PER_SEC;
  s.score += clock;
  float(s, VIEW_W / 2, 200, `HQ RAZED +${WIN_PTS}`, true);
  if (clock > 0) float(s, VIEW_W / 2, 224, `+${clock} CLOCK`);
  s.roundLog.push(s.roundT > ROUND_T * 0.5 ? 0 : 1);
  hitstop(s, 0.25);
  endRun(s, true, "victory", "THE RIVER IS YOURS", "Their HQ is rubble.");
}

// ── step ───────────────────────────────────────────────────────────────────
export function stepArmorclash(s: AcState, dt: number, input: SimInput): void {
  // cosmetics always run
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
  if (s.denyT > 0) s.denyT = Math.max(0, s.denyT - dt);
  if (s.banner) {
    s.banner.t -= dt;
    if (s.banner.t <= 0) s.banner = null;
  }
  for (const p of s.parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  s.parts = s.parts.filter((p) => p.life > 0);
  for (const f of s.floats) {
    f.y -= 24 * dt;
    f.life -= dt;
  }
  s.floats = s.floats.filter((f) => f.life > 0);
  for (const tr of s.tracers) tr.life -= dt;
  s.tracers = s.tracers.filter((tr) => tr.life > 0);
  s.clock += dt;

  const downEdge = input.down && !s.wasDown;
  s.wasDown = input.down;
  const leftEdge = input.left && !s.prevLeft;
  const rightEdge = input.right && !s.prevRight;
  const upEdge = input.up && !s.prevUp;
  const spaceEdge = input.space && !s.prevSpace;
  s.prevLeft = input.left;
  s.prevRight = input.right;
  s.prevUp = input.up;
  s.prevSpace = input.space;
  if (input.down || input.left || input.right || input.up || input.downKey || input.space) {
    s.touched = true;
  }

  if (s.phase === "intro") {
    s.phaseT -= dt;
    s.t += dt;
    if (s.phaseT <= 0) {
      s.phase = "play";
      s.banner = { txt: "ROUND 1", t: 1.4 };
    }
    return;
  }
  if (s.phase === "break") {
    s.phaseT -= dt;
    s.t += dt;
    if (s.phaseT <= 0) {
      resetRound(s);
      s.phase = "play";
    }
    return;
  }
  if (s.phase === "over") return;

  if (s.freeze > 0) {
    s.freeze = Math.max(0, s.freeze - dt);
    return;
  }

  s.t += dt;
  if (!s.touched && s.t >= IDLE_SCUTTLE_T) {
    endRun(s, false, "withdrawn", "COLUMN WITHDRAWN", "Nobody took the field.");
    return;
  }

  s.roundT -= dt;
  if (s.roundT <= 0) {
    // THE CLOCK DECIDES IT. Three minutes with no HQ razed is not automatically
    // a loss any more -- the board itself says who was winning. Structures
    // razed against structures lost; ties go to the defender, which is them.
    // Mutually exclusive with the HQ win above, so the ceiling adds only one.
    const razed = s.towers.filter((t) => t.side === 1 && t.dead).length;
    const lost = s.towers.filter((t) => t.side === 0 && t.dead).length;
    if (razed > lost) {
      s.score += TIEBREAK_PTS;
      float(s, VIEW_W / 2, 200, `GROUND TAKEN +${TIEBREAK_PTS}`, true);
      endRun(s, true, "victory", "MARGINAL VICTORY", "You ended the day further forward.");
    } else {
      endRun(s, false, "stalled", "THE OFFENSIVE STALLED", "The clock ran out.");
    }
    return;
  }

  // ── mana ─────────────────────────────────────────────────────────────────
  // Elapsed battle time drives both the enemy's minute ramp and the shared
  // final-minute surge. Pure reads of state; no rng, so replays are identical.
  const elapsed = ROUND_T - s.roundT;
  const surge = elapsed >= SURGE_T ? SURGE_MULT : 1;
  s.mana = Math.min(MANA_CAP, s.mana + REGEN * surge * dt);
  s.enemyMana = Math.min(
    MANA_CAP,
    s.enemyMana + REGEN * ENEMY_REGEN_MULT[minuteIndex(elapsed)] * surge * dt,
  );

  // ── input: EVERYTHING resolves on the down-edge ───────────────────────────
  // A drag that slides from the card strip into the field must never deploy,
  // and a release must never do anything at all.
  if (downEdge && input.px != null && input.py != null) {
    const px = input.px;
    const py = input.py;
    let hitSlot = -1;
    for (let i = 0; i < 4; i++) {
      const r = slotRect(i);
      if (px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1) {
        hitSlot = i;
        break;
      }
    }
    if (hitSlot >= 0) {
      s.sel = hitSlot;
    } else if (py < FIELD_H) {
      tryDeploy(s, px, py);
    }
  }
  // desktop garnish: the tape channel carries only pointer + space, so these
  // can never appear in a recorded run.
  if (leftEdge) s.sel = (s.sel + 3) % 4;
  if (rightEdge) s.sel = (s.sel + 1) % 4;
  if (upEdge || spaceEdge) tryDeploy(s, 180, 250);

  // ── the enemy's schedule ─────────────────────────────────────────────────
  // (`elapsed` is computed once up with the mana ramp above and reused here.)
  const sched = s.schedule[s.round - 1] ?? [];
  for (const d of sched) {
    if (d.fired || d.t > elapsed) continue;
    d.fired = true;
    s.enemyMana = Math.max(0, s.enemyMana - CARDS[d.card].cost);
    spawnUnit(s, 1, d.card, d.x, d.y);
    s.deploysEnemy++;
  }

  stepUnits(s, dt);
  stepTowers(s, dt);

  // ── round resolution ─────────────────────────────────────────────────────
  const theirHq = s.towers.find((t) => t.side === 1 && t.big);
  const ourHq = s.towers.find((t) => t.side === 0 && t.big);
  if (!theirHq || theirHq.dead) {
    winRound(s);
    return;
  }
  if (!ourHq || ourHq.dead) {
    endRun(s, false, "overrun", "OVERRUN", "Your HQ is gone.");
  }
}

function tryDeploy(s: AcState, x: number, y: number) {
  const card = s.hand[s.sel];
  const c = CARDS[card];
  if (!c || s.mana < c.cost || !legalDeploy(s, x, y)) {
    s.denyT = DENY_T;
    return;
  }
  s.mana -= c.cost;
  spawnUnit(s, 0, card, x, y);
  s.deploysPlayer++;
  // cycle: the played card goes to the tail, the slot refills from `next`
  const played = s.hand[s.sel];
  s.hand[s.sel] = s.next;
  s.deck.push(played);
  s.deck.shift();
  s.next = s.deck[4];
}

/**
 * THE ONLY PLACE A UNIT MOVES.
 *
 * The river rule and the arena clamp used to live in the movement code, and
 * the separation pass wrote x/y straight past both -- so separation could shove
 * a unit into open water, which then tripped the bank snap and undid its
 * crossing. One helper, used by both, means there is exactly one river.
 *
 * A unit already committed to a crossing is allowed to be in the water: that
 * is what crossing IS. Everyone else is pushed back to their OWN bank, by
 * side, never by their pre-move y (which read the wrong bank for anything
 * already inside the band).
 */
function placeUnit(u: Unit, nx: number, ny: number) {
  let x = nx;
  let y = ny;
  if (y > RIVER_Y0 && y < RIVER_Y1 && u.cross !== 1) {
    const onBridge =
      Math.abs(x - BRIDGE_XS[0]) < BRIDGE_HW || Math.abs(x - BRIDGE_XS[1]) < BRIDGE_HW;
    if (!onBridge) y = u.side === 0 ? RIVER_Y1 + 1 : RIVER_Y0 - 1;
  }
  u.x = Math.max(8, Math.min(VIEW_W - 8, x));
  u.y = Math.max(8, Math.min(FIELD_H - 8, y));
}

/** Which side of the water a y sits on: -1 their half, 1 your half, 0 in it. */
function bankOf(y: number): -1 | 0 | 1 {
  if (y < RIVER_Y0) return -1;
  if (y > RIVER_Y1) return 1;
  return 0;
}

function stepUnits(s: AcState, dt: number) {
  // 1. move + fight, in fixed array order
  for (const u of s.units) {
    if (u.hit > 0) u.hit = Math.max(0, u.hit - dt);
    if (u.shieldT > 0) u.shieldT = Math.max(0, u.shieldT - dt);
    if (u.dead) {
      if (u.ko > 0) u.ko -= dt;
      continue;
    }
    const c = CARDS[u.card];
    const speed = c.speed * (u.side === 0 ? s.mods.speedMul : 1);
    const dmg = c.dmg * (u.side === 0 ? s.mods.dmgMul : 1);

    // target: keep the current one while it lives and stays near, else the
    // nearest enemy unit inside AGGRO_R. Strict `<`, array order, no rng.
    // NO SHOOTING ACROSS THE RIVER. Unit range is 42 and the water is 24 wide,
    // so without this two units on opposite banks acquire each other and trade
    // shots forever without either advancing -- which looks exactly like being
    // stuck on the bridge and was half of what Mike was seeing. Standing on
    // your own bank shooting at theirs is a stalemate, not a fight. A unit
    // that is IN the river (mid-crossing) may engage either side.
    const myBank = bankOf(u.y);
    // A MORTAR CANNOT HIT WHAT IS ON TOP OF IT. minRange is the whole
    // counterplay: it shells your bank from safety, so the answer has to be
    // crossing and closing. Without a dead zone an immovable long-gun is just
    // a tank that never has to walk.
    const minR = c.minRange || 0;
    const inDeadZone = (o: Unit) =>
      minR > 0 && Math.hypot(o.x - u.x, o.y - u.y) < minR;
    // AN EMPLACEMENT SHELLS ACROSS THE WATER. The no-cross-river rule exists to
    // stop two MOBILE units trading shots forever instead of advancing -- but
    // applied to a mortar it deleted the gun's whole reason to exist: it sits
    // on your bank by law (legalDeploy), so every enemy still on theirs was
    // unengageable and its 96 range could never be used. A thing that cannot
    // move has to be allowed to reach.
    const immobile = c.mobile === false;
    const canEngage = (o: Unit) =>
      !inDeadZone(o) &&
      (immobile || myBank === 0 || bankOf(o.y) === 0 || bankOf(o.y) === myBank);

    // A GUN'S REACH IS ITS OWN. Acquisition used AGGRO_R (60) for everything,
    // so the mortar's 96 was decoration: it could only ever see targets a
    // short tank could already reach, and the keep-radius below dropped them
    // again at 75. Emplacements now acquire and hold at their real range.
    const seeR = immobile ? c.range : AGGRO_R;
    let tgt = unitById(s, u.targetId);
    if (
      tgt &&
      (tgt.side === u.side ||
        !canEngage(tgt) ||
        Math.hypot(tgt.x - u.x, tgt.y - u.y) > seeR * AGGRO_LEAVE_MUL)
    ) {
      tgt = null;
      u.targetId = -1;
      // A CHARGE DOES NOT TRAVEL. Lose the target and the wind-up restarts, so
      // a beam can never be banked on one tank and dumped instantly into the
      // next one that walks up.
      if (c.weapon === "beam") u.fireCd = Math.max(u.fireCd, c.chargeT ?? 0);
    }
    if (!tgt) {
      let best: Unit | null = null;
      let bd = Infinity;
      for (const o of s.units) {
        if (o.dead || o.side === u.side) continue;
        if (!canEngage(o)) continue;
        const d = Math.hypot(o.x - u.x, o.y - u.y);
        if (d < bd && d <= seeR) {
          bd = d;
          best = o;
        }
      }
      if (best) {
        tgt = best;
        u.targetId = best.id;
      }
    }

    let tx: number;
    let ty: number;
    // IS THIS A PLACE OR A TARGET? A bridge mouth is somewhere you must stand;
    // an enemy is something you stop short of and shoot. Conflating the two is
    // what pinned every unit 42px from the bridge for the whole match.
    let navGoal = false;
    if (tgt) {
      tx = tgt.x;
      ty = tgt.y;
    } else if (immobile) {
      // AN EMPLACEMENT NEVER NAVIGATES, AND THAT IS WHY THE MORTAR NEVER FIRED.
      //
      // With no unit to shoot it used to fall into the crossing latch below,
      // which sets navGoal and aims it at a bridge mouth it can never walk to.
      // navGoal forces `reach` to NAV_EPS (2px), the distance check then sends
      // it into the "out of reach and unable to close: hold" branch, and the
      // fire code -- including the tower scan -- sits on the OTHER side of
      // that branch. So a mortar pit spent the whole match holding a position
      // it was already standing in. Mike: "the mortars don't fire."
      //
      // A gun that cannot move has one job: find the nearest enemy structure
      // and shell it if it is inside its own range. The reach math below then
      // resolves normally, because navGoal stays false.
      u.wp = 2;
      let best: Tower | null = null;
      let bd = Infinity;
      for (const t of towersOf(s, u.side === 0 ? 1 : 0)) {
        const d = Math.hypot(t.x - u.x, t.y - u.y);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      tx = best ? best.x : u.x;
      ty = best ? best.y : u.y;
    } else {
      // THE CROSSING LATCH. See `cross` on Unit: this used to recompute "am I
      // lined up" from raw x every frame, which let a separation shove (10-40x
      // stronger than walking) flip a mid-river unit's goal 58px backwards.
      // Now the decision is made ONCE, on your own bank, and nothing in the
      // water can revoke it.
      const lane = BRIDGE_XS[u.bridge] + u.lane;
      const farSide = u.side === 0 ? -1 : 1;
      // ADVANCE THE LATCH FIRST, then read it once. Reaching the far bank is
      // the only thing that promotes you to `over`, and being lined up at your
      // own mouth is the only thing that promotes you to `crossing`.
      if (bankOf(u.y) === farSide) {
        u.cross = 2;
      } else if (u.cross === 0) {
        const ownBankY = u.side === 0 ? RIVER_Y1 + 10 : RIVER_Y0 - 10;
        if (Math.abs(u.x - lane) < BRIDGE_HW * 0.8 && Math.abs(u.y - ownBankY) < 8) {
          u.cross = 1;
        }
      }
      if (u.cross === 2) {
        // over: run at the nearest enemy tower
        u.wp = 2;
        let best: Tower | null = null;
        let bd = Infinity;
        for (const t of towersOf(s, u.side === 0 ? 1 : 0)) {
          const d = Math.hypot(t.x - u.x, t.y - u.y);
          if (d < bd) {
            bd = d;
            best = t;
          }
        }
        tx = best ? best.x : u.x;
        ty = best ? best.y : u.y;
      } else if (u.cross === 1) {
        // committed: hold your lane and drive clear of the far bank
        navGoal = true;
        u.wp = 1;
        tx = lane;
        ty = u.side === 0 ? RIVER_Y0 - 22 : RIVER_Y1 + 22;
      } else {
        // approaching: get to the mouth on YOUR bank, lined up with your lane
        navGoal = true;
        u.wp = 0;
        tx = lane;
        ty = u.side === 0 ? RIVER_Y1 + 10 : RIVER_Y0 - 10;
      }
    }

    const dx = tx - u.x;
    const dy = ty - u.y;
    const d = Math.hypot(dx, dy) || 1;
    u.a = Math.atan2(dy, dx);
    // IMMOVABLE. Skipped, not slowed: speed 0 would still run the whole nav
    // machine -- it would pick a bridge lane it can never reach and sit with
    // u.cross latched at 0 forever. A static emplacement simply does not move,
    // so it holds its facing, fires when something is in range, and that is all.
    // (`immobile` is decided up with the targeting gates, which need it too.)
    // ARRIVAL vs FIRING RANGE. NAV_EPS is deliberately smaller than the
    // crossing latch's 8px tolerance, so a unit that reaches its mouth always
    // satisfies the latch on the very next frame rather than hovering just
    // outside it.
    const reach = navGoal ? NAV_EPS : tgt ? c.range : c.range + (u.wp === 2 ? TOWER_R : 0);
    if (d > reach && !immobile) {
      const sp = speed * dt;
      placeUnit(u, u.x + (dx / d) * sp, u.y + (dy / d) * sp);
    } else if (d > reach && immobile) {
      // Out of reach and unable to close: hold. No move, no fire.
    } else {
      // ARRIVED. Fire only if there is something HERE to fire at: a unit
      // that has merely reached a navigation waypoint has nothing in front of
      // it, and firing anyway drew a tracer into empty grass every cooldown.
      // That is the "tanks shoot nothing, health is not changing" report.
      let shootTower: Tower | null = null;
      if (!tgt) {
        let bd = Infinity;
        for (const t of towersOf(s, u.side === 0 ? 1 : 0)) {
          const dd = Math.hypot(t.x - u.x, t.y - u.y);
          if (dd < bd) {
            bd = dd;
            shootTower = t;
          }
        }
        if (shootTower && bd > c.range + shootTower.r) shootTower = null;
      }
      if (tgt || shootTower) {
        u.fireCd -= dt;
        if (u.fireCd <= 0) {
          // A BEAM CARD SPENDS ITS COOLDOWN CHARGING. Same one field: the cycle
          // is longer, and the client reads `fireCd <= chargeT` to draw the
          // swell and the aim line, so the tell is exactly as long as the wait.
          const beam = c.weapon === "beam";
          u.fireCd = beam ? (c.fireCdMax ?? UNIT_FIRE_CD) : UNIT_FIRE_CD;
          const hit = beam ? (c.beamDmg ?? dmg) : dmg;
          const aimX = tgt ? tgt.x : (shootTower as Tower).x;
          const aimY = tgt ? tgt.y : (shootTower as Tower).y;
          s.tracers.push({
            x0: u.x,
            y0: u.y,
            x1: aimX,
            y1: aimY,
            life: beam ? 0.16 : 0.09,
            side: u.side,
            ...(beam ? { beam: true } : null),
            ...(c.mobile === false && (c.minRange ?? 0) > 0 ? { arc: true } : null),
          });
          if (tgt) damageUnit(s, tgt, hit, true);
          else damageTower(s, shootTower as Tower, hit);
        }
      }
    }
  }

  // 2. separation, one pass over ordered pairs (i<j): fixed order = replayable
  for (let i = 0; i < s.units.length; i++) {
    const a = s.units[i];
    if (a.dead) continue;
    for (let j = i + 1; j < s.units.length; j++) {
      const b = s.units[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CARDS[a.card].r + CARDS[b.card].r;
      if (d > 0.001 && d < min) {
        // IMMOVABLE UNITS TAKE NO PUSH. The overlap is normally split half each;
        // an emplacement that can be shoved is not an emplacement, and a crowd
        // would slowly walk a mortar pit off its own pit over a round. A static
        // takes zero and its mobile partner absorbs the whole overlap.
        const aFixed = CARDS[a.card].mobile === false;
        const bFixed = CARDS[b.card].mobile === false;
        if (aFixed && bFixed) continue; // two statics: neither can yield
        const half = (min - d) / 2;
        const pushA = aFixed ? 0 : bFixed ? half * 2 : half;
        const pushB = bFixed ? 0 : aFixed ? half * 2 : half;
        const ux = dx / d;
        const uy = dy / d;
        // THROUGH placeUnit, not straight at x/y. Writing directly let
        // separation shove a unit into open water or off the board, past the
        // river rule the movement code was carefully obeying two lines up.
        placeUnit(a, a.x - ux * pushA, a.y - uy * pushA);
        placeUnit(b, b.x + ux * pushB, b.y + uy * pushB);
      }
    }
  }
  s.units = s.units.filter((u) => !u.dead || u.ko > 0);
}

function stepTowers(s: AcState, dt: number) {
  for (const tw of s.towers) {
    if (tw.hit > 0) tw.hit = Math.max(0, tw.hit - dt);
    if (tw.dead) {
      if (tw.ko > 0) tw.ko -= dt;
      continue;
    }
    tw.fireCd -= dt;
    const range = tw.big ? HQ_RANGE : SMALL_RANGE;
    let best: Unit | null = null;
    let bd = Infinity;
    for (const u of s.units) {
      if (u.dead || u.side === tw.side) continue;
      const d = Math.hypot(u.x - tw.x, u.y - tw.y);
      if (d < bd && d <= range + CARDS[u.card].r) {
        bd = d;
        best = u;
      }
    }
    // THE TELEGRAPH. TOWER_TELE has been declared and unused since this arena
    // was built: towers fired with no windup, so a tracer appeared and a unit
    // simply lost HP with nothing to read. The tower now spends TOWER_TELE
    // locked on before the shot lands. `tele` counts DOWN and is exposed so the
    // renderer can draw the lock-on; when it reaches 0 the shell arrives.
    if (!best) {
      tw.tele = 0;
    } else if (tw.fireCd <= 0) {
      if (tw.tele <= 0) tw.tele = TOWER_TELE;
      tw.tele = Math.max(0, tw.tele - dt);
      if (tw.tele <= 0) {
        tw.fireCd = TOWER_CD;
        s.tracers.push({ x0: tw.x, y0: tw.y, x1: best.x, y1: best.y, life: 0.09, side: tw.side });
        // byUnit=false: a tower kill never pays (see killUnit)
        damageUnit(s, best, tw.big ? HQ_DMG : SMALL_DMG, false);
      }
    }
  }
}

// ── the shell's contract ───────────────────────────────────────────────────
export function armorclashDone(s: AcState): boolean {
  return s.over;
}
export function armorclashScore(s: AcState): number {
  return Math.max(0, Math.round(s.score));
}

/** COUNT-BOUND, from the same tables the run generates from. */
export function ceiling(): {
  kills: number;
  towers: number;
  rounds: number;
  clock: number;
  total: number;
} {
  let kills = 0;
  for (let r = 0; r < ROUNDS; r++) {
    for (const key of ENEMY_WAVE[r]) {
      kills += KILL_PTS[CARDS[cardIndex(key)].tier] ?? 10;
    }
  }
  const perRound =
    2 * (Math.floor(SMALL_HP / TOWER_DMG_PER_PT) + SMALL_KILL_PTS) +
    (Math.floor(HQ_HP / TOWER_DMG_PER_PT) + HQ_KILL_PTS);
  const towers = perRound * ROUNDS;
  // ONE battle: one win award, and the two endings are mutually exclusive, so
  // the ceiling counts the larger of them (storming the HQ) exactly once. The
  // clock bonus rides that same ending -- a run cannot both bank time and run
  // the clock out -- so the whole ROUND_T is the upper bound.
  const rounds = Math.max(WIN_PTS, TIEBREAK_PTS);
  const clock = CLOCK_PTS_PER_SEC * ROUND_T;
  return { kills, towers, rounds, clock, total: kills + towers + rounds + clock };
}

// ── share ──────────────────────────────────────────────────────────────────
/** THE BATTLE IN THREE SQUARES: the two forward towers and their HQ. Green is
 * razed, red is one of yours lost, white is still standing -- so the grid says
 * how the ground actually moved rather than which rounds happened. */
export function gridEmoji(s: AcState): string {
  const theirs = s.towers.filter((t) => t.side === 1);
  const mineLost = s.towers.filter((t) => t.side === 0 && t.dead).length;
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const t = theirs[i];
    if (t && t.dead) out.push("🟩");
    else if (mineLost > i) out.push("🟥");
    else out.push("⬜");
  }
  return out.join("");
}
export function sharePayload(dayKey: string, score: number, grid: string): string {
  return `ARMOR CLASH ${dayKey.slice(5)} · ${score.toLocaleString("en-US")} damage\n${grid}\ntanks.web3guides.com`;
}
