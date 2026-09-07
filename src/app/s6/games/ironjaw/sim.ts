/**
 * IRON JAW - the S6 Super Punch-Out!! remake. Behind-the-shoulder mech
 * boxing against the Warden's champions: read the glowing tell, dodge the
 * correct way, punish the recovery window, KO three opponents.
 *
 * PURE AND HEADLESS (kit §4): no Math.random, no Date, no canvas. The whole
 * fight is scripted by the authored patterns in ladders.ts; the daily seed
 * ONLY selects the ladder (the S6 law: the seed never designs). The only
 * in-fight randomness is the sim's OWN seeded rng (mulberry32 off the seed
 * hash), consumed in one place - the SLIP roll and the per-bout footwork
 * phase - so a replayed tape re-rolls the identical sequence and stays
 * byte-identical. It selects from authored numbers; it never designs.
 *
 * SCORES NEVER CAP (ADR-0120). The three-bout ladder flows into endless
 * TITLE DEFENSES: the stable cycles (DEFENSE_CYCLE, authored), harder each
 * visit, until the champions put you down. Score measures how deep skill
 * carries you. KO points key to the SLOT (300/400/500, then a plateauing
 * defense schedule), never to the opponent, so every authored ladder pays
 * identically and the daily stays fair. VALIDITY is rate-bound: rate()
 * exports {perSec, burst} and a legit score fits perSec x simSeconds +
 * burst; the registry maxScore is only a far-off sanity clamp.
 *
 * STATS ARE CEILING-NEUTRAL (ADR-0070): Plating = armor HP (survival),
 * Reactor = dodge cooldown (recovery speed), Cloak = dodge i-frame window,
 * Payload = punch damage (faster KO, buys only the capped speed bonus),
 * Sensors = the tell glow starts earlier (reaction time). None touches a
 * point value, a slot count, or a pattern.
 *
 * THE VERB SET, one thumb OR keyboard (the tape carries px/py/down/space;
 * the key booleans ride SimInput live and fold into the SAME verbs as
 * sim-side edges/holds, so replays stay pure - the harness pins them false):
 *   tap LEFT third   / A or Left    dodge left
 *   tap RIGHT third  / D or Right   dodge right
 *   tap CENTER       / W or Up      jab (lands only in a vulnerability window)
 *   hold CENTER or SPACE >= 18f     haymaker on release (3x jab, you stand
 *                                   tall while charging: getting hit cancels
 *                                   it; a short SPACE tap is a jab)
 *   hold LOW strip   / S or Down    guard (negates jabs and combo links,
 *                                   chips stamina; HOOKS and UPPERCUTS
 *                                   pierce it - those you have to move)
 *
 * FIVE ATTACK STYLES (2026-08-14, Mike: "they need multiple styles"): jab /
 * hook / uppercut / combo / feint, authored per opponent in ladders.ts and
 * discriminated by `Strike.style`. The sim's rules per style live in the
 * opponent machine at the bottom of stepIronjaw; the telegraphs live in
 * Client.tsx; ladders.ts's header is the design contract for all three.
 *
 * ANTI-TAP-SPAM IS THE OPENING ITSELF (2026-08-14, Mike: "the punches from us
 * are dumb, just tap tap tap"). A punch thrown at a machine that is not
 * staggered finds air, costs a stamina pip, and can make it SLIP - step
 * aside, visibly, out of the lane you swung down. That is the whole mash tax.
 *
 * THE REACH GATE IS GONE (2026-08-15, Mike: "now I have to direct myself into
 * the punch to get an opening which is weird"). It used to also require the
 * machine to be standing inside REACH_X of your own lean, which turned a read
 * you had already won into a positioning chore - and it was broken on its own
 * terms: a hook's wind-up leaned the machine 20px toward the side your
 * required dodge carried you 34px AWAY from, so the game's signature punish
 * was 54px out of a 46px reach, a guaranteed miss on the frame its window
 * opened. Footwork stays as MOTION (oppX / pxOff still drift, lean and slip,
 * and the renderer paints both), but the only thing between your fist and its
 * armor is whether you earned the opening.
 *
 * The AFK gate is the fight itself: an untouched pilot never dodges, and
 * bout 1's pattern beats 3 armor down in ~10s.
 */

import {
  OPPONENTS,
  ladderForSeed,
  DEFENSE_CYCLE,
  TELL_FLOOR_F,
  LATERAL_MAX,
  chainHits,
  pierces,
  type Footwork,
  type OpponentDef,
  type Strike,
  type StrikeStyle,
} from "./ladders";

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

export interface Stats {
  botox: number; // Plating
  drugs: number; // Reactor
  ozempic: number; // Cloak
  aura: number; // Payload
  optics: number; // Sensors
}

export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── scoring constants ───────────────────────────────────────────────────────
export const KO_PTS = [300, 400, 500] as const;
/** Defense n pays DEFENSE_BASE + STEP x (n+1), PLATEAUING at the cap: the
 * plateau bounds the scoring RATE (validity), never the total (ADR-0120). */
export const DEFENSE_BASE = 500;
export const DEFENSE_STEP = 25;
export const DEFENSE_KO_CAP = 1000;
export const STYLE_PTS = 15; // per dodged strike, UNCAPPED: styling scales with survival
export const HEALTH_BONUS_MAX = 50; // per bout, FRACTION of armor left (stat-proof)
export const SPEED_CAP_PER_BOUT = 50; // per-bout shaping, not a total cap
export const BOUT_T = 75; // s per bout; a bout you cannot finish ends the run
const TRANSITION_F = 90; // between bouts
// ── the defense escalation (authored schedule, deterministic in bout index) ─
const DEF_HP_STEP = 0.25; // +25% opponent HP per defense, capped x3
const DEF_HP_CAP = 3;
/** THE KILL SCREEN (ADR-0120): the gap decay is deliberately UNBOUNDED
 * below a token floor. Once gaps compress inside the dodge cooldown, two
 * strikes land inside one recovery and death is mathematical for ANY
 * player - the first endless recording proved a frame-perfect oracle
 * outlives capped escalation forever (15 defenses, ended only by the
 * harness frame cap). Tells stay readable (TELL_FLOOR_F); the PACE is what
 * finally beats you, the Tetris model. */
const DEF_GAP_DECAY = 0.93;
const DEF_GAP_FLOOR = 0.12;
// TELL_FLOOR_F (the reactability floor tells NEVER compress below) now lives
// in ladders.ts - one source of truth for sim, renderer and validator.

// ── fight constants ─────────────────────────────────────────────────────────
const JAB_DMG = 2;
const HEAVY_DMG = 6;
export const HEAVY_CHARGE_F = 18; // the Client draws the charge ring from it
const TAP_MAX_F = 10; // a press shorter than this is a tap
/** i-frames (Cloak adds 2/level). The strike resolves on ONE frame at tell
 * end, so the legal dodge window is the last (dodgeWinF - 1) frames of the
 * tell: at the old 14 the window opened ~567ms AFTER the glow and the fight
 * read as impossible (the 2026-08-14 playtest). 34 covers every authored
 * tell within DODGE_LATE_MAX frames of the glow - ladders.ts's
 * validateLadders asserts that invariant against this constant, which is
 * why it is exported. */
export const DODGE_F_BASE = 34;
/** Frames before the next dodge (Reactor removes 2/level, floor 26). EXPORTED
 * because validateLadders asserts every combo's link spacing clears it: a
 * chain tighter than the cooldown is undodgeable by arithmetic, not by skill. */
export const DODGE_CD_BASE = 38;
const STAMINA_MAX = 5;
const STAM_REGEN_F = 80;
const JAB_COST = 1;
const HEAVY_COST = 2;
const PLAYER_HP_BASE = 3;
const ZONE_L = 120; // px thirds at 360 design width
const ZONE_R = 240;
const GUARD_Y = 400;

// ── the floor: lean, drift ──────────────────────────────────────────────────
/** How far a dodge carries your rig sideways, design px. Pure motion since
 * the reach gate came out: it is what the renderer paints your slip with. */
export const LEAN_X = 34;
const LEAN_EASE = 0.35; // the lean's own approach rate (the client paints this exact value)
const DRIFT_EASE = 0.1; // how hard the machine chases its drift target
const VULN_RECENTER = 0.1; // a staggered machine stumbles back toward centre
const HOOK_LEAN = 20; // how far a hook wind-up carries it off its dodge side
const SLIP_CD_F = 14; // a machine cannot slip every frame of a mash

type OppPhase = "gap" | "tell" | "recover" | "vuln";

export interface IronjawState {
  W: number;
  H: number;
  k: number;
  demo: boolean;
  t: number;
  phase: "bout" | "transition" | "dead" | "timeout"; // endless: no "won"
  // ladder, then defenses: bout 0..2 = the authored ladder, bout >= 3 =
  // title defense (bout - 3) on the DEFENSE_CYCLE with escalation mods
  ladder: [string, string, string];
  bout: number;
  boutT: number;
  transF: number;
  oppHpMul: number;
  oppGapMul: number;
  oppDmgBonus: number;
  oppFootMul: number; // defenses widen the drift
  oppSlipBonus: number; // defenses sharpen the slip
  // opponent
  oppKey: string;
  oppHp: number;
  oppHpMax: number;
  oppPhase: OppPhase;
  phaseF: number; // frames left in the phase
  patIdx: number;
  /** which link of a combo is winding up / resolving (0 for everything else) */
  comboI: number;
  // ── FOOTWORK (the machine is not welded to the centre) ───────────────────
  /** lateral offset from centre, design px, clamped to +/- LATERAL_MAX */
  oppX: number;
  /** the drift oscillator's phase, advanced only while it is free to move */
  driftPh: number;
  slipF: number; // slip animation frames left (renderer)
  slipDir: number; // -1 / +1 / 0: which way the last slip carried it
  slipCd: number; // frames before it can slip again
  // the tell the renderer + Sensors read: >0 while winding up
  tellSide: "L" | "R" | "any" | "";
  /** the style now winding up ("" when nothing is): the renderer's telegraph
   * key and the oracle's policy key */
  tellStyle: StrikeStyle | "";
  /** true when the wind-up will go straight through a guard (hook/uppercut) */
  tellPierce: boolean;
  /** total frames of the CURRENT tell after escalation, so the renderer never
   * has to recompute the compression (and can never disagree with the sim) */
  tellTotalF: number;
  /** links still to come in the chain, this one included (0 = not a combo) */
  comboLeft: number;
  // player
  hp: number;
  hpMax: number;
  stamina: number;
  stamF: number;
  dodgeF: number; // i-frames remaining
  dodgeSide: "L" | "R" | "";
  dodgeCd: number;
  /** YOUR lateral offset, design px: the dodge lean, eased. Sim state rather
   * than a paint-side flourish so every surface leans by the same number. */
  pxOff: number;
  guarding: boolean;
  charging: boolean;
  chargeF: number;
  downF: number; // frames the pointer has been held
  pressZone: "L" | "R" | "C" | "G" | ""; // zone at the press edge
  prevDown: boolean;
  // prev-key state lives ON the sim so keyboard edges are deterministic and
  // headless replays (harness pins keys false) stay byte-identical
  prevLeft: boolean;
  prevRight: boolean;
  prevUp: boolean;
  prevSpace: boolean;
  chargeKey: boolean; // the live charge is Space-held (vs pointer center-held)
  // stat effects
  dodgeWinF: number;
  dodgeCdF: number;
  dmgMul: number;
  tellLeadF: number; // Sensors: extra frames of tell glow (renderer + oracle)
  // tally
  koPts: number;
  stylePts: number;
  healthPts: number;
  speedPts: number;
  dodged: number;
  landed: number;
  eaten: number;
  /** Punches thrown at a machine that was not open, and therefore found air.
   * The client owes every one of these a visible whiff - a miss you cannot
   * see reads as a game that ignores you. */
  whiffs: number;
  /** Times the machine stepped aside from a swing (a subset of whiffs). */
  slips: number;
  /** Times a feint bought a panic dodge. Pure feedback, never scored. */
  baited: number;
  /** Punches THROWN, landed or not. The client animates off this, not off
   * `landed`: a swing that hits a guard used to produce no animation at all,
   * so the game read as "tap tap tap, nothing happens" (Mike, 2026-08-14). */
  thrown: number;
  /** The kind of the most recent throw, so the client can give the haymaker
   * its own weight instead of replaying the jab. */
  lastThrow: "jab" | "heavy";
  rng: () => number;
}

/** THE VALIDITY ENVELOPE (ADR-0120): the maximum sustainable scoring rate,
 * from the fight's own constants. The plateau KO (1000) plus its per-bout
 * trimmings (health 50 + speed 50 + ~14 dodges x 15) lands in a bout no
 * shorter than ~16s even at max Payload against plateau HP, so 85/s bounds
 * every legit run with margin; burst covers one whole KO landing at once. */
export function rate(): { perSec: number; burst: number } {
  return { perSec: 85, burst: 1300 };
}

function opp(s: IronjawState): OpponentDef {
  return OPPONENTS[s.oppKey];
}

function strike(s: IronjawState): Strike {
  const o = opp(s);
  return o.pattern[s.patIdx % o.pattern.length];
}

function foot(s: IronjawState): Footwork {
  return opp(s).footwork;
}

function clampX(x: number): number {
  return Math.max(-LATERAL_MAX, Math.min(LATERAL_MAX, x));
}

function enterBout(s: IronjawState, bout: number): void {
  s.bout = bout;
  s.boutT = 0;
  if (bout <= 2) {
    s.oppKey = s.ladder[bout];
    s.oppHpMul = 1;
    s.oppGapMul = 1;
    s.oppDmgBonus = 0;
    s.oppFootMul = 1;
    s.oppSlipBonus = 0;
  } else {
    // TITLE DEFENSE (endless, ADR-0120): the stable cycles, harder each visit
    const n = bout - 3;
    s.oppKey = DEFENSE_CYCLE[n % DEFENSE_CYCLE.length];
    s.oppHpMul = Math.min(DEF_HP_CAP, 1 + DEF_HP_STEP * (n + 1));
    s.oppGapMul = Math.max(DEF_GAP_FLOOR, Math.pow(DEF_GAP_DECAY, n + 1));
    s.oppDmgBonus = Math.floor((n + 1) / 3); // UNCAPPED: the deep fights hit like trains
    // the footwork escalates too, but CAPPED: an uncatchable machine is not a
    // harder fight, it is a broken one. The PACE is what finally beats you.
    s.oppFootMul = Math.min(1.7, 1 + 0.09 * (n + 1));
    s.oppSlipBonus = Math.min(0.26, 0.045 * (n + 1));
  }
  const o = opp(s);
  s.oppHp = Math.round(o.hp * s.oppHpMul);
  s.oppHpMax = Math.round(o.hp * s.oppHpMul);
  s.oppPhase = "gap";
  s.patIdx = 0;
  s.comboI = 0;
  s.phaseF = Math.round(o.pattern[0].gapF * s.oppGapMul);
  s.tellSide = "";
  s.tellStyle = "";
  s.tellPierce = false;
  s.tellTotalF = 0;
  s.comboLeft = 0;
  // the new challenger comes out on its own foot: the seed SELECTS a phase
  // from the authored oscillator, so no two bouts open on the same step and
  // the sequence still replays byte-identically
  s.oppX = 0;
  s.driftPh = s.rng() * Math.PI * 2;
  s.slipF = 0;
  s.slipDir = 0;
  s.slipCd = 0;
  s.hp = s.hpMax; // armor restores between bouts
  s.stamina = STAMINA_MAX;
  s.dodgeF = 0;
  s.dodgeCd = 0;
  s.pxOff = 0;
  s.charging = false;
  s.chargeF = 0;
  s.chargeKey = false;
}

export function createIronjaw(
  w: number,
  h: number,
  seed: string,
  demo: boolean,
  stats: Stats | null,
): IronjawState {
  const st: Stats = stats || { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 };
  const hash = fnv1a(seed || "ironjaw");
  const hpMax = PLAYER_HP_BASE + Math.max(0, Math.min(4, st.botox));
  const s: IronjawState = {
    W: w,
    H: h,
    k: w / 360,
    demo,
    t: 0,
    phase: "bout",
    ladder: ladderForSeed(hash),
    bout: 0,
    boutT: 0,
    transF: 0,
    oppHpMul: 1,
    oppGapMul: 1,
    oppDmgBonus: 0,
    oppFootMul: 1,
    oppSlipBonus: 0,
    oppKey: "rusty",
    oppHp: 1,
    oppHpMax: 1,
    oppPhase: "gap",
    phaseF: 1,
    patIdx: 0,
    comboI: 0,
    oppX: 0,
    driftPh: 0,
    slipF: 0,
    slipDir: 0,
    slipCd: 0,
    tellSide: "",
    tellStyle: "",
    tellPierce: false,
    tellTotalF: 0,
    comboLeft: 0,
    hp: hpMax,
    hpMax,
    stamina: STAMINA_MAX,
    stamF: 0,
    dodgeF: 0,
    dodgeSide: "",
    dodgeCd: 0,
    pxOff: 0,
    guarding: false,
    charging: false,
    chargeF: 0,
    downF: 0,
    pressZone: "",
    prevDown: false,
    prevLeft: false,
    prevRight: false,
    prevUp: false,
    prevSpace: false,
    chargeKey: false,
    dodgeWinF: DODGE_F_BASE + 2 * Math.max(0, Math.min(4, st.ozempic)),
    dodgeCdF: Math.max(26, DODGE_CD_BASE - 2 * Math.max(0, Math.min(4, st.drugs))),
    dmgMul: 1 + 0.02 * Math.max(0, Math.min(30, st.aura)),
    tellLeadF: 3 * Math.max(0, Math.min(4, st.optics)),
    koPts: 0,
    stylePts: 0,
    healthPts: 0,
    speedPts: 0,
    dodged: 0,
    landed: 0,
    thrown: 0,
    lastThrow: "jab",
    eaten: 0,
    whiffs: 0,
    slips: 0,
    baited: 0,
    rng: mulberry32(hash),
  };
  enterBout(s, 0);
  return s;
}

function tryDodge(s: IronjawState, side: "L" | "R"): void {
  if (s.dodgeCd > 0) return;
  s.dodgeF = s.dodgeWinF;
  s.dodgeSide = side;
  s.dodgeCd = s.dodgeCdF;
  s.charging = false; // a dodge abandons the wind-up
  s.chargeF = 0;
  s.chargeKey = false;
}

function playerHit(s: IronjawState, kind: "jab" | "heavy"): void {
  const cost = kind === "jab" ? JAB_COST : HEAVY_COST;
  if (s.stamina < cost) return; // gassed: the swing never leaves the shoulder
  s.stamina -= cost;
  // the swing IS thrown from here on, whatever it meets: the client owes the
  // player an animation for every one of these, not only for the ones that hit
  s.thrown += 1;
  s.lastThrow = kind;

  if (s.oppPhase !== "vuln") {
    // THE MASH TAX. Swinging at a machine that is not open costs a pip and
    // finds air - and outside its own wind-up it SLIPS, stepping bodily out of
    // the lane you swung down. This is the whole answer to "tap tap tap": the
    // miss is real, it is visible, and it is the machine answering you.
    if (s.slipCd <= 0 && (s.oppPhase === "gap" || s.oppPhase === "recover")) {
      const fw = foot(s);
      if (s.rng() < Math.min(0.8, fw.slipP + s.oppSlipBonus)) {
        const dir = s.oppX >= s.pxOff ? 1 : -1; // away from the side you swung from
        s.oppX = clampX(s.oppX + dir * fw.slipStep);
        s.slipDir = dir;
        s.slipF = fw.slipF;
        s.slipCd = SLIP_CD_F;
        s.slips += 1;
      }
    }
    s.whiffs += 1;
    return;
  }
  // AN EARNED OPENING ALWAYS PAYS. There is no second positional test here:
  // if the machine is staggered, the punch lands, wherever the floor left it.
  const dmg = (kind === "jab" ? JAB_DMG : HEAVY_DMG) * s.dmgMul;
  s.oppHp -= dmg;
  s.landed += 1;
  if (s.oppHp <= 0) {
    // KO: bank the slot (ladder slots, then the plateauing defense schedule)
    s.koPts +=
      s.bout <= 2
        ? KO_PTS[s.bout]
        : Math.min(DEFENSE_BASE + DEFENSE_STEP * (s.bout - 2), DEFENSE_KO_CAP);
    s.healthPts += Math.round(HEALTH_BONUS_MAX * (s.hp / s.hpMax));
    // per-bout speed shaping (1/s of bout clock left, capped per bout):
    // fights the style farm inside a bout, bounds nothing across the run
    s.speedPts += Math.min(SPEED_CAP_PER_BOUT, Math.floor(BOUT_T - s.boutT));
    s.phase = "transition"; // ALWAYS: the next challenger is already walking out
    s.transF = TRANSITION_F;
  }
}

export function stepIronjaw(s: IronjawState, dt: number, input: SimInput): void {
  if (s.phase === "dead" || s.phase === "timeout") return;
  s.t += dt;

  if (s.phase === "transition") {
    s.transF -= 1;
    if (s.transF <= 0) {
      s.phase = "bout";
      enterBout(s, s.bout + 1);
    }
    // prev states track through the transition so a key/press held across it
    // never fires a stale edge on the next bout's first frame
    s.prevDown = input.down;
    s.prevLeft = input.left;
    s.prevRight = input.right;
    s.prevUp = input.up;
    s.prevSpace = input.space;
    return;
  }

  s.boutT += dt;
  if (s.boutT >= BOUT_T) {
    s.phase = "timeout"; // the clock beat you; banked points keep
    return;
  }

  // ── input edges ────────────────────────────────────────────────────────────
  const downEdge = input.down && !s.prevDown;
  const upEdge = !input.down && s.prevDown;
  if (downEdge) {
    const x = input.px == null ? 180 * s.k : input.px;
    const y = input.py == null ? 240 * s.k : input.py;
    if (y > GUARD_Y * s.k) {
      s.pressZone = "G";
    } else if (x < ZONE_L * s.k) {
      s.pressZone = "L";
      tryDodge(s, "L");
    } else if (x > ZONE_R * s.k) {
      s.pressZone = "R";
      tryDodge(s, "R");
    } else {
      s.pressZone = "C";
      s.charging = true;
      s.chargeF = 0;
      s.chargeKey = false; // the pointer takes charge ownership
    }
    s.downF = 0;
  }
  if (input.down) {
    s.downF += 1;
    if (s.charging && !s.chargeKey) s.chargeF += 1;
  }
  if (upEdge) {
    if (s.pressZone === "C") {
      if (s.chargeF >= HEAVY_CHARGE_F) playerHit(s, "heavy");
      else if (s.downF <= TAP_MAX_F || s.chargeF < HEAVY_CHARGE_F) playerHit(s, "jab");
    }
    if (!s.chargeKey) {
      s.charging = false;
      s.chargeF = 0;
    }
    s.pressZone = "";
  }

  // ── keyboard verbs: edges/holds folded into the SAME press machinery ──────
  const leftEdge = input.left && !s.prevLeft;
  const rightEdge = input.right && !s.prevRight;
  const jabEdge = input.up && !s.prevUp;
  const spaceEdge = input.space && !s.prevSpace;
  const spaceUp = !input.space && s.prevSpace;
  if (leftEdge) tryDodge(s, "L");
  if (rightEdge) tryDodge(s, "R");
  if (jabEdge) playerHit(s, "jab");
  if (spaceEdge && !s.charging) {
    s.charging = true;
    s.chargeKey = true;
    s.chargeF = 0;
  }
  if (input.space && s.charging && s.chargeKey) s.chargeF += 1;
  if (spaceUp && s.chargeKey) {
    if (s.charging) playerHit(s, s.chargeF >= HEAVY_CHARGE_F ? "heavy" : "jab");
    s.charging = false;
    s.chargeKey = false;
    s.chargeF = 0;
  }

  // guard = the low-strip hold OR the S/Down key hold, one verb
  s.guarding = (input.down && s.pressZone === "G") || input.downKey;
  s.prevDown = input.down;
  s.prevLeft = input.left;
  s.prevRight = input.right;
  s.prevUp = input.up;
  s.prevSpace = input.space;
  if (s.phase !== "bout") return; // the punch may have ended the bout

  // ── timers ────────────────────────────────────────────────────────────────
  if (s.dodgeF > 0) s.dodgeF -= 1;
  else s.dodgeSide = "";
  if (s.dodgeCd > 0) s.dodgeCd -= 1;
  if (s.slipF > 0) s.slipF -= 1;
  if (s.slipCd > 0) s.slipCd -= 1;
  s.stamF += 1;
  if (s.stamF >= STAM_REGEN_F) {
    s.stamF = 0;
    if (s.stamina < STAMINA_MAX) s.stamina += 1;
  }
  // YOUR lean, eased. It lives on the sim (not in the renderer's own memory)
  // so the picture and the state can never disagree and so a replay carries
  // it: the client paints your rig straight off this number.
  const leanTarget = s.dodgeF > 0 ? (s.dodgeSide === "L" ? -1 : 1) * LEAN_X : 0;
  s.pxOff += (leanTarget - s.pxOff) * LEAN_EASE;

  // ── FOOTWORK: the machine works the floor ─────────────────────────────────
  // It drifts on its authored rhythm while it is free (gap/recover), SQUARES
  // UP mid wind-up (a tell you can read is a tell that holds still - except a
  // hook, which visibly loads the shoulder it is about to whip across), and
  // stumbles back toward centre while it is staggered. Since the reach gate
  // came out this is MOTION, not a gate: it makes the fight look alive and it
  // sells the slip, and it can no longer take an earned punish away from you.
  {
    const fw = foot(s);
    if (s.oppPhase === "gap" || s.oppPhase === "recover") {
      s.driftPh += fw.speed;
      const target = Math.sin(s.driftPh) * fw.amp * s.oppFootMul;
      s.oppX += (target - s.oppX) * DRIFT_EASE;
    } else if (s.oppPhase === "tell") {
      if (s.tellStyle === "hook") {
        const target = (s.tellSide === "L" ? 1 : -1) * HOOK_LEAN;
        s.oppX += (target - s.oppX) * DRIFT_EASE;
      }
    } else {
      s.oppX += (0 - s.oppX) * VULN_RECENTER;
    }
    s.oppX = clampX(s.oppX);
  }

  // ── the opponent machine ──────────────────────────────────────────────────
  s.phaseF -= 1;
  const st = strike(s);
  const hits = chainHits(st);
  if (s.oppPhase === "gap" && s.phaseF <= 0) {
    s.oppPhase = "tell";
    // link 1 of a chain winds up on tellF, links 2..n on the tighter
    // innerTellF; defenses quicken the pattern but a tell NEVER compresses
    // below the reactability floor (Sensors' tellLeadF stays a RENDER lead)
    const wind = s.comboI > 0 ? (st.innerTellF ?? st.tellF) : st.tellF;
    s.phaseF = Math.max(TELL_FLOOR_F, Math.round(wind * s.oppGapMul));
    s.tellTotalF = s.phaseF;
    s.tellSide = st.req;
    s.tellStyle = st.style;
    s.tellPierce = pierces(st);
    s.comboLeft = st.style === "combo" ? hits - s.comboI : 0;
  } else if (s.oppPhase === "tell" && s.phaseF <= 0) {
    // THE WIND-UP RESOLVES this frame. What it resolves INTO is the style.
    const style = st.style;
    s.tellSide = "";
    s.tellStyle = "";
    s.tellPierce = false;
    s.tellTotalF = 0;
    s.comboLeft = 0;
    if (style === "feint") {
      // A FEINT NEVER LANDS. Its whole payload is the cooldown it bought: a
      // pilot who bit is now holding an empty dodge for the real thing.
      if (s.dodgeF > 0) s.baited += 1;
      s.comboI = 0;
      s.oppPhase = "recover";
      s.phaseF = st.recoverF;
    } else {
      const dodgeWorks = s.dodgeF > 0 && (st.req === "any" || s.dodgeSide === st.req);
      // GUARD IS DECIDED BY THE STYLE: hooks and uppercuts go straight
      // through the shell, so the only answer to those is your feet.
      const blockWorks = s.guarding && !pierces(st);
      const lastLink = s.comboI >= hits - 1;
      if (dodgeWorks || blockWorks) {
        if (dodgeWorks) {
          s.dodged += 1;
          s.stylePts += STYLE_PTS; // UNCAPPED (ADR-0120): styling scales with survival
        }
        if (lastLink) {
          s.comboI = 0;
          s.oppPhase = "vuln";
          // blocked strikes stagger too, on a shorter window than a slip
          s.phaseF = dodgeWorks ? st.vulnF : Math.floor(st.vulnF * 0.55);
        } else {
          // ONLY THE LAST LINK OPENS ANYTHING. Beating link 1 of a chain buys
          // you the style points and the right to answer link 2, nothing more.
          s.comboI += 1;
          s.oppPhase = "gap";
          s.phaseF = Math.max(1, Math.round((st.innerGapF ?? 16) * s.oppGapMul));
        }
      } else {
        s.hp -= st.dmg + s.oppDmgBonus;
        s.eaten += 1;
        s.charging = false; // eating a hit cancels the wind-up
        s.chargeF = 0;
        s.chargeKey = false;
        if (s.hp <= 0) {
          s.phase = "dead"; // banked KO + style keep; the rest forfeits
          return;
        }
        s.comboI = 0; // eating a link BREAKS the chain (the mercy in the rule)
        s.oppPhase = "recover";
        s.phaseF = st.recoverF;
      }
    }
  } else if ((s.oppPhase === "recover" || s.oppPhase === "vuln") && s.phaseF <= 0) {
    s.comboI = 0;
    s.patIdx = (s.patIdx + 1) % opp(s).pattern.length;
    s.oppPhase = "gap";
    s.phaseF = Math.round(strike(s).gapF * s.oppGapMul);
  }
}

export function ironjawDone(s: IronjawState): boolean {
  return s.phase === "dead" || s.phase === "timeout";
}

export function ironjawScore(s: IronjawState): number {
  return s.koPts + s.stylePts + s.healthPts + s.speedPts;
}
