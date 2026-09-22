/**
 * GAUNTLET - the S7 Slay the Spire mirror. Solo hero, an endless ascent of
 * floors through the undead legion: pick a node (FTL-style route choice),
 * fight the room turn by turn with a deck of cards, draft one more card,
 * climb. Death is the only exit; score measures how deep skill carries you.
 *
 * PURE AND HEADLESS (house kit): no Math.random, no Date, no canvas. Every
 * combat number comes from the S7 rules core (resolveAttack / rollDice /
 * derive / scaleStatblock / tickConditions / rollLoot) - this file NEVER
 * rolls its own dice. This is a cash-adjacent score game: determinism is law.
 *
 * LAWS THIS FILE ENFORCES:
 *  - FORKED RNG, PLAIN STATE. One stream per entity per purpose via
 *    rngFork(seed, entityId, purpose); a hero stat change must never move an
 *    enemy's dice. Because state must be hashable plain data (no closures),
 *    stream positions live in state as integer CURSORS (rngCursors) and
 *    forkAt() re-derives + fast-forwards the stream on demand. Draw counts
 *    per stream are combat-scale (hundreds), so the replay cost is noise.
 *  - SEED SELECTS, NEVER DESIGNS. Node patterns, encounter rows, relics,
 *    boons and draft offers are all AUTHORED in content.ts; the seed only
 *    indexes into them (one draw per selection, per-floor purposes).
 *  - CEILING-NEUTRALITY (ADR-0070 lineage). Score = bestiary xp per kill
 *    (never scaled by stats/gear/depth - scaleStatblock holds xp fixed) plus
 *    a flat +FLOOR_BONUS per floor cleared. Gear and level buy SURVIVAL and
 *    SPEED only; deeper floors mean more xp per minute is HARDER, never that
 *    a kill pays more. Scores never cap (ADR-0120); validity is rate-bound.
 *  - FIXED SPATIAL SLOTS, NEVER ORDINAL MEANING DRIFT. The bottom band
 *    (py > CARD_BAND_Y) is five fixed card slots -> hand INDEX; the right
 *    band above it ends the turn; node choice and draft use the same three
 *    mid-screen thirds. A recorded tape stays valid across loadouts because
 *    a slot always means "this position", and an illegal slot is a
 *    deterministic no-op - never a crash, never a desync.
 *  - HESITATION IS DAMAGE (the AFK gate). TURN_GRACE frames without any
 *    input auto-ends the hero turn AND marks the hero cowering: that round
 *    the legion attacks with ADVANTAGE (the core's own adv mechanic), never
 *    guards, and every body swings TWICE - it smells fear and overruns.
 *    Node choice and draft auto-resolve on their own grace. An empty tape
 *    therefore reaches floor 0's authored all-fight room in 2.5s and is dead
 *    in ~2-3 legion rounds (~10s measured), far under the 75s law; and
 *    because it never wins a fight or clears a floor, an idle run banks
 *    exactly 0. An ACTIVE player never meets any of this: one input edge
 *    resets the grace clock.
 *  - INTEGER STATE. Every number stored on state is an int (heals are
 *    floored, timers are frame counts), so fnv1a(JSON.stringify(state)) is
 *    platform-stable. Floats exist only in transit inside the rules core.
 *
 * INPUT (the s7 harness tape contract): {px, py, down, space} with px/py in
 * [0,1] or null, at a fixed dt (the sim counts frames; dt is the contract
 * that one step = one 60ths-of-a-second frame - the harness must NOT round
 * px/py to ints, they are normalized). Down-EDGES act; holds do nothing.
 *
 * RESOLVED SPEC AMBIGUITIES (documented choices):
 *  - Single-target cards hit the FIRST living enemy (no manual targeting in
 *    v1 - keeps the verb set to slots + space).
 *  - Post-fight the hero heals POSTFIGHT_PCT of hpMax (+ Grave Boots): this
 *    is a 1-3 minute arcade run, not a 45-minute spire - without it every
 *    class bleeds out by floor 3 and route choice is meaningless. Rest nodes
 *    still out-heal it without a fight.
 *  - Condition semantics vs the legion (core CondIds, sim-local meaning):
 *    stun = loses its action (intent kept); slow = cannot swing heavy;
 *    weaken = -2 atk (core's own note); fear = attacks at disadvantage;
 *    burn = BURN_DMG at its action start (kill credit to the hero).
 *  - Grace resets on ANY input edge (a thinking human keeps the turn), but
 *    hard frame caps (TURN_HARD_F etc.) still bound every phase, so a
 *    tap-idling tape cannot stall - and it still scores 0.
 *  - hpCost cards are playable only while hp > hpCost: rage never suicides.
 */

import {
  fnv1a,
  rngFork,
  d,
  derive,
  resolveAttack,
  tickConditions,
  noConds,
  statblock,
  scaleStatblock,
  rollLoot,
  type Rng,
  type ClassId,
  type Loadout,
  type CondState,
} from "../_shared/rules/core";
import {
  CARD_INDEX,
  STARTER_DECKS,
  DRAFT_POOLS,
  NODE_PATTERNS,
  ENCOUNTERS,
  RELICS,
  TREASURE_TABLE,
  BOONS,
  MAX_ENCOUNTER_XP,
  bandFor,
  bossFor,
  isBossFloor,
  type Card,
  type Effect,
  type NodeType,
} from "./content";

export { fnv1a };

// ── input ───────────────────────────────────────────────────────────────────

export interface SimInput {
  px: number | null; // [0,1]
  py: number | null; // [0,1]
  down: boolean;
  space: boolean;
}

// ── constants (frames at 60fps) ─────────────────────────────────────────────

export const FPS = 60;
export const CARD_BAND_Y = 0.78; // below this: the five card slots
export const END_X = 0.85;       // right band above the card band: end turn
export const CARD_SLOTS = 5;
export const HAND_MAX = 5;       // hand can never outgrow the five fixed slots
export const ENERGY_MAX = 3;

export const TURN_GRACE = 150;   // 2.5s of silence auto-ends the hero turn
                                 // (cowering); any input edge resets it, so a
                                 // thinking human is never rushed - only true
                                 // silence pays
export const TURN_HARD_F = 900;  // 15s absolute turn bound, active or not
export const CHOICE_GRACE = 150; // 2.5s: node choice auto-picks (mid preferred)
export const DRAFT_GRACE = 240;  // 4s: draft auto-skips
export const PHASE_HARD_F = 600; // absolute bound on node/draft phases
export const EVENT_F = 90;       // rest/treasure/shrine banner (space skips)

// Pacing is deliberately ASYMMETRIC (the gate-4 geometry): CARD_F is time
// only a PLAYING hero spends, TURN_GRACE is time only an IDLE one does, and
// ENEMY_F is shared - so active play stretches a run's clock while silence
// compresses it, and "3x the empty tape" is earned by playing, not waiting.
export const TURNSTART_F = 30;   // draw+upkeep pause
export const CARD_F = 40;        // per card play
export const ENEMY_F = 45;       // per enemy action

export const FLOOR_BONUS = 100;  // flat per floor cleared - NOT depth-scaled
export const REST_PCT = 30;      // rest heals 30% hpMax
export const POSTFIGHT_PCT = 40; // victory heals 40% hpMax (see header) -
                                 // only a WON fight pays it, so the AFK gate
                                 // never sees a point of it
export const GUARD_N = 5;        // enemy guard block base (+floor/2)
export const COND_CAP = 9;       // condition stacks cap (anti-runaway int)
export const DEMO_THINK_F = 45;  // demo "thinks" 0.75s before acting

// ── state ───────────────────────────────────────────────────────────────────

export type Phase = "node" | "combat" | "draft" | "event" | "dead";

export interface EnemyState {
  id: string;    // "f{floor}e{slot}" - stable per spawn, the rng fork key
  key: string;   // bestiary id
  name: string;
  hp: number;
  hpMax: number;
  ac: number;
  atk: number;
  dmgC: number;  // scaled damage dice: XdY+Z
  dmgS: number;
  dmgB: number;
  xp: number;    // bestiary xp - NEVER scaled (core law)
  block: number;
  intent: "attack" | "heavy" | "guard"; // telegraphed for the renderer
  conds: CondState;
}

export interface GauntletState {
  W: number;
  H: number;
  demo: boolean;
  seed: number;  // fnv1a of the seed string; every fork derives from it
  frame: number;
  phase: Phase;
  sub: "hero" | "units";
  floor: number;
  // hero (derived at create, then run-modified by perks)
  classId: ClassId;
  level: number;
  hp: number;
  hpMax: number;
  ac: number;
  atk: number;
  dmgC: number;
  dmgS: number;
  dmgB: number;
  critRange: number;
  block: number;
  energy: number;
  // run modifiers (relic/boon PICKUP LOG + collapsed integer counters)
  relics: string[];
  boons: string[];
  bonusDmg: number;
  bonusAtk: number;
  turnBlock: number;
  turnHeal: number;
  victoryHeal: number;
  // deck
  deck: string[];     // the canonical list; grows by draft
  drawPile: string[]; // per-combat
  discard: string[];
  hand: string[];
  // phase furniture
  nodeOpts: [string, string, string];  // NodeSlot strings ("" = empty)
  draftOpts: [string, string, string]; // card ids
  lastEvent: string; // "rest" | boon id | relic id | "" (renderer banner)
  eventF: number;
  enemies: EnemyState[];
  enemyIdx: number;
  turn: number;  // hero turns this combat
  cower: number; // 1 = last turn grace-fired; the legion swings at advantage
  // timers
  busyF: number;
  graceF: number;
  phaseF: number;
  prevDown: boolean;
  prevSpace: boolean;
  /** Stream positions: draws consumed per "entity|purpose" fork. THE plain-
   * state answer to closure rngs - see the header law. */
  rngCursors: Record<string, number>;
  // tally
  xpPts: number;
  floorPts: number;
  kills: number;
  floorsCleared: number;
  cardsPlayed: number;
  turnsTaken: number;
  dmgDealt: number;
  dmgTaken: number;
  crits: number;
  whiffs: number;
}

// ── validity + ceiling (ADR-0120: rate plateaus, score never caps) ──────────

/** THE VALIDITY ENVELOPE. Absolute floor on a cleared floor's duration is
 * ~2s even for a turn-1-wipe oracle (node tap + TURNSTART_F 20 + three
 * CARD_F 20 plays + draft tap ~= 105 frames), and the richest room in the
 * book pays MAX_ENCOUNTER_XP (3100) + FLOOR_BONUS (100) = 3200. So 1600/s
 * bounds any legit rate with margin; burst covers one whole room banking on
 * a single card. */
export function rate(): { perSec: number; burst: number } {
  return { perSec: 1600, burst: MAX_ENCOUNTER_XP + FLOOR_BONUS + 100 };
}

/** THE FAR-OFF SANITY CLAMP (generous by design, per the harness law that
 * maxScore >= 5x the oracle). Math: the analytic max is ~3200 per ~2s floor
 * = ~96,000/minute; a marathon outlier run of ~20 minutes at that impossible
 * pace is ~1.92M. Round up: nothing legitimate ever grazes this. */
export function ceiling(): number {
  return 2_000_000;
}

// ── forked rng over plain state ─────────────────────────────────────────────

/** Materialize the (entityId, purpose) stream at its stored cursor. Every
 * draw through the returned fn advances the cursor, so a later forkAt of the
 * same pair resumes exactly where this one stopped. Never hold two live
 * forks of one pair. */
function forkAt(s: GauntletState, entityId: string, purpose: string): Rng {
  const key = entityId + "|" + purpose;
  const base = rngFork(s.seed, entityId, purpose);
  const skip = s.rngCursors[key] | 0;
  for (let i = 0; i < skip; i++) base();
  return () => {
    s.rngCursors[key] = (s.rngCursors[key] | 0) + 1;
    return base();
  };
}

function pick(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

// ── create ──────────────────────────────────────────────────────────────────

const DEFAULT_LOADOUT: Loadout = {
  classId: "barbarian",
  level: 1,
  gear: { weapon: 0, armor: 0, trinket: 0 },
};

export function createGauntlet(
  w: number,
  h: number,
  seed: string,
  demo: boolean,
  loadout: Loadout | null,
): GauntletState {
  const lo = loadout || DEFAULT_LOADOUT;
  const dv = derive(lo);
  const s: GauntletState = {
    W: w | 0,
    H: h | 0,
    demo,
    seed: fnv1a(seed || "gauntlet"),
    frame: 0,
    phase: "node",
    sub: "hero",
    floor: 0,
    classId: dv.classId,
    level: Math.max(1, Math.min(20, lo.level | 0)),
    hp: dv.hpMax,
    hpMax: dv.hpMax,
    ac: dv.ac,
    atk: dv.atkBonus,
    dmgC: dv.dmgDice.count,
    dmgS: dv.dmgDice.sides,
    dmgB: dv.dmgDice.bonus,
    critRange: dv.critRange,
    block: 0,
    energy: ENERGY_MAX,
    relics: [],
    boons: [],
    bonusDmg: 0,
    bonusAtk: 0,
    turnBlock: 0,
    turnHeal: 0,
    victoryHeal: 0,
    deck: STARTER_DECKS[dv.classId].slice(),
    drawPile: [],
    discard: [],
    hand: [],
    nodeOpts: ["", "", ""],
    draftOpts: ["", "", ""],
    lastEvent: "",
    eventF: 0,
    enemies: [],
    enemyIdx: 0,
    turn: 0,
    cower: 0,
    busyF: 0,
    graceF: 0,
    phaseF: 0,
    prevDown: false,
    prevSpace: false,
    rngCursors: {},
    xpPts: 0,
    floorPts: 0,
    kills: 0,
    floorsCleared: 0,
    cardsPlayed: 0,
    turnsTaken: 0,
    dmgDealt: 0,
    dmgTaken: 0,
    crits: 0,
    whiffs: 0,
  };
  setupNode(s);
  return s;
}

// ── the map ─────────────────────────────────────────────────────────────────

function setupNode(s: GauntletState): void {
  if (isBossFloor(s.floor)) {
    // BOSS GATE (owner call, 2026-08-28): every 10th floor is a named legion
    // boss and nothing else. The FLOOR INDEX decides - the seed designs
    // nothing about a gate (no map draw is even consumed). Mid is the live
    // slot so the idle auto-pick law (mid first) still holds.
    s.nodeOpts = ["", "boss", ""];
  } else {
    const band = NODE_PATTERNS[bandFor(s.floor)];
    const rng = forkAt(s, "map", `floor${s.floor}`);
    const pat = band[pick(rng, band.length)];
    s.nodeOpts = [pat[0], pat[1], pat[2]];
  }
  s.phase = "node";
  s.sub = "hero";
  s.graceF = 0;
  s.phaseF = 0;
  s.lastEvent = "";
}

function heal(s: GauntletState, n: number): void {
  if (n <= 0) return;
  s.hp = Math.min(s.hpMax, s.hp + n);
}

function applyPerk(s: GauntletState, id: string): void {
  const p = BOONS[id] || RELICS.find((r) => r.id === id);
  if (!p) return; // authored tables only; unreachable by validateContent
  s.bonusDmg += p.bonusDmg;
  s.bonusAtk += p.bonusAtk;
  s.turnBlock += p.turnBlock;
  s.turnHeal += p.turnHeal;
  s.victoryHeal += p.victoryHeal;
  s.hpMax += p.hpMaxUp;
  s.critRange = Math.max(18, s.critRange - p.keen);
  heal(s, p.healNow);
}

function startEvent(s: GauntletState, tag: string): void {
  s.lastEvent = tag;
  s.phase = "event";
  s.eventF = EVENT_F;
  s.graceF = 0;
  s.phaseF = 0;
}

function resolveNode(s: GauntletState, slot: number): void {
  const opt = s.nodeOpts[slot] as NodeType | "boss" | "";
  if (opt === "") return; // empty slot: deterministic no-op
  if (opt === "boss") {
    startBossCombat(s);
    return;
  }
  if (opt === "fight" || opt === "elite") {
    startCombat(s, opt === "elite");
    return;
  }
  if (opt === "treasure") {
    const item = rollLoot(TREASURE_TABLE, forkAt(s, "loot", `floor${s.floor}`));
    applyPerk(s, item);
    s.boons.push(item);
    startEvent(s, item);
    return;
  }
  if (opt === "shrine") {
    const relic = RELICS[pick(forkAt(s, "relic", `floor${s.floor}`), RELICS.length)];
    applyPerk(s, relic.id);
    s.relics.push(relic.id);
    startEvent(s, relic.id);
    return;
  }
  // rest
  heal(s, Math.floor((s.hpMax * REST_PCT) / 100));
  startEvent(s, "rest");
}

/** Advance to the next floor. FLOOR_BONUS banks ONLY on a fought floor
 * (score integrity, 2026-08-28): rest/shrine/treasure stay strategically
 * free - heal, relic, boon - but pay 0 score, so chaining non-fight nodes
 * can never out-earn fighting. floorsCleared and the floor index advance
 * either way. */
function completeFloor(s: GauntletState, fought: boolean): void {
  if (fought) s.floorPts += FLOOR_BONUS; // FLAT: never depth-scaled
  s.floorsCleared += 1;
  s.floor += 1;
  setupNode(s);
}

// ── combat setup ────────────────────────────────────────────────────────────

function spawnEnemy(s: GauntletState, key: string, slot: number): EnemyState {
  const sc = scaleStatblock(statblock(key), s.floor);
  const id = `f${s.floor}e${slot}`;
  const en: EnemyState = {
    id,
    key,
    name: sc.name,
    hp: sc.hp,
    hpMax: sc.hp,
    ac: sc.ac,
    atk: sc.atkBonus,
    dmgC: sc.dmgDice.count,
    dmgS: sc.dmgDice.sides,
    dmgB: sc.dmgDice.bonus,
    xp: sc.xp, // scaleStatblock holds xp fixed - the ceiling-neutrality law
    block: 0,
    intent: "attack",
    conds: noConds(),
  };
  rollIntent(s, en);
  return en;
}

function rollIntent(s: GauntletState, en: EnemyState): void {
  const r = forkAt(s, en.id, "intent")();
  en.intent = r < 0.55 ? "attack" : r < 0.8 ? "heavy" : "guard";
}

function shuffled(s: GauntletState, cards: string[]): string[] {
  const rng = forkAt(s, "deck", "draw");
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = pick(rng, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function beginCombat(s: GauntletState, enemies: EnemyState[]): void {
  s.enemies = enemies;
  s.phase = "combat";
  s.turn = 0;
  s.cower = 0;
  s.drawPile = shuffled(s, s.deck);
  s.discard = [];
  s.hand = [];
  startHeroTurn(s);
}

function startCombat(s: GauntletState, elite: boolean): void {
  const band = ENCOUNTERS[bandFor(s.floor)];
  const rows = elite ? band.elite : band.normal;
  const row = rows[pick(forkAt(s, "enc", `floor${s.floor}`), rows.length)];
  beginCombat(s, row.map((key, i) => spawnEnemy(s, key, i)));
}

/** The boss gate's fight: the AUTHORED ladder entry for this floor spawns
 * through the NORMAL path (spawnEnemy + scaleStatblock), so stats, scaling
 * and xp are the underlying creature's bestiary values - only the NAME is
 * the gate's own theater. */
function startBossCombat(s: GauntletState): void {
  const boss = bossFor(s.floor);
  const en = spawnEnemy(s, boss.key, 0);
  en.name = boss.name;
  beginCombat(s, [en]);
}

function drawOne(s: GauntletState): void {
  if (s.hand.length >= HAND_MAX) return; // five fixed slots, never more
  if (s.drawPile.length === 0) {
    if (s.discard.length === 0) return;
    s.drawPile = shuffled(s, s.discard);
    s.discard = [];
  }
  const top = s.drawPile.pop();
  if (top !== undefined) s.hand.push(top);
}

function startHeroTurn(s: GauntletState): void {
  s.sub = "hero";
  s.turn += 1;
  s.cower = 0;
  s.energy = ENERGY_MAX;
  s.block = s.turnBlock;
  heal(s, s.turnHeal);
  for (const id of s.hand) s.discard.push(id);
  s.hand = [];
  for (let i = 0; i < HAND_MAX; i++) drawOne(s);
  s.graceF = 0;
  s.phaseF = 0;
  s.busyF = TURNSTART_F;
}

// ── combat: hero side ───────────────────────────────────────────────────────

function firstAlive(s: GauntletState): EnemyState | null {
  for (const en of s.enemies) if (en.hp > 0) return en;
  return null;
}

function anyAlive(s: GauntletState): boolean {
  return firstAlive(s) !== null;
}

function creditKill(s: GauntletState, en: EnemyState): void {
  en.hp = 0;
  s.kills += 1;
  s.xpPts += en.xp; // bestiary xp, never stat-scaled: THE score law
}

function heroDamageEffect(s: GauntletState, eff: Extract<Effect, { k: "dmg" }>): void {
  const rng = forkAt(s, "hero", "attack");
  for (let h = 0; h < eff.hits; h++) {
    const targets = eff.all ? s.enemies.filter((e) => e.hp > 0) : [firstAlive(s)];
    for (const t of targets) {
      if (!t || t.hp <= 0) continue;
      const base = eff.dice
        ? d(eff.dice.count + eff.addDice, eff.dice.sides, eff.dice.bonus + eff.addBonus + s.bonusDmg)
        : d(s.dmgC + eff.addDice, s.dmgS, s.dmgB + eff.addBonus + s.bonusDmg);
      const out = resolveAttack({
        attackerId: "hero",
        targetId: t.id,
        atkBonus: s.atk + s.bonusAtk,
        dmgDice: base,
        critRange: s.critRange,
        defAc: t.ac,
        adv: eff.adv,
        rng,
      });
      if (!out.hit) {
        s.whiffs += 1;
        continue;
      }
      if (out.crit) s.crits += 1;
      let dmg = out.dmg;
      const soak = Math.min(t.block, dmg);
      t.block -= soak;
      dmg -= soak;
      t.hp -= dmg;
      s.dmgDealt += dmg;
      if (t.hp <= 0) creditKill(s, t);
    }
  }
}

function resolveCard(s: GauntletState, card: Card): void {
  for (const eff of card.effects) {
    switch (eff.k) {
      case "dmg":
        heroDamageEffect(s, eff);
        break;
      case "block":
        s.block += eff.n;
        break;
      case "draw":
        for (let i = 0; i < eff.n; i++) drawOne(s);
        break;
      case "cond": {
        const targets = eff.all ? s.enemies.filter((e) => e.hp > 0) : [firstAlive(s)];
        for (const t of targets) {
          if (!t) continue;
          t.conds[eff.cond] = Math.min(COND_CAP, t.conds[eff.cond] + eff.ticks);
        }
        break;
      }
      case "heal":
        heal(s, eff.n);
        break;
      case "energy":
        s.energy += eff.n;
        break;
    }
  }
}

/** Play hand[idx] if it exists and is affordable; otherwise a deterministic
 * no-op (the clamp law - a tape can never crash or desync the sim). */
function tryPlay(s: GauntletState, idx: number): void {
  if (idx < 0 || idx >= s.hand.length) return;
  const card = CARD_INDEX[s.hand[idx]];
  if (!card) return;
  if (card.cost > s.energy) return;
  if (card.hpCost > 0 && s.hp <= card.hpCost) return; // rage never suicides
  s.energy -= card.cost;
  s.hp -= card.hpCost;
  s.hand.splice(idx, 1);
  s.discard.push(card.id);
  resolveCard(s, card);
  s.cardsPlayed += 1;
  s.graceF = 0;
  s.busyF = CARD_F;
  if (!anyAlive(s)) victory(s);
}

function endTurn(s: GauntletState, cowering: boolean): void {
  s.cower = cowering ? 1 : 0; // hesitation is damage: the legion sees it
  s.turnsTaken += 1;
  s.sub = "units";
  s.enemyIdx = 0;
  s.graceF = 0;
  advanceUnits(s);
}

function victory(s: GauntletState): void {
  heal(s, Math.floor((s.hpMax * POSTFIGHT_PCT) / 100) + s.victoryHeal);
  if (isBossFloor(s.floor)) {
    // BOSS GATE: a felled gate keeper always drops a relic (guaranteed, its
    // own "boss{floor}" stream), applied BEFORE the normal draft. Relics are
    // flat survival/speed counters - no score path (ceiling-neutrality).
    const relic = RELICS[pick(forkAt(s, "relic", "boss" + s.floor), RELICS.length)];
    applyPerk(s, relic.id);
    s.relics.push(relic.id);
  }
  const pool = DRAFT_POOLS[s.classId].slice();
  const rng = forkAt(s, "draft", `floor${s.floor}`);
  const opts: string[] = [];
  for (let k = 0; k < 3; k++) {
    const i = pick(rng, pool.length);
    opts.push(pool[i]);
    pool.splice(i, 1);
  }
  s.draftOpts = [opts[0], opts[1], opts[2]];
  s.phase = "draft";
  s.sub = "hero";
  s.graceF = 0;
  s.phaseF = 0;
}

// ── combat: the legion's side ───────────────────────────────────────────────

function clampAdv(n: number): -1 | 0 | 1 {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function enemyAct(s: GauntletState, en: EnemyState): void {
  en.block = 0; // its guard lapses as it moves
  const pre = en.conds; // pre-tick flags drive this action
  const t = tickConditions(en.id, en.conds);
  en.conds = t.next;
  if (t.dmg > 0) {
    en.hp -= t.dmg;
    s.dmgDealt += t.dmg;
    if (en.hp <= 0) {
      creditKill(s, en); // burn is hero-lit: the kill pays
      return;
    }
  }
  if (pre.stun > 0) return; // loses the action, keeps the telegraphed intent
  let intent = en.intent;
  // HESITATION IS DAMAGE, sharpened: against a cowering hero the legion never
  // guards and every body swings TWICE (it smells fear and overruns). This is
  // the AFK gate's engine - an active player never sees it because any input
  // edge resets the grace clock, while an empty tape eats it every round.
  if (s.cower === 1 && intent === "guard") intent = "attack";
  if (intent === "guard") {
    en.block += GUARD_N + (s.floor >> 1);
  } else {
    if (intent === "heavy" && pre.slow > 0) intent = "attack"; // slowed: no heavies
    const dice = intent === "heavy" ? d(en.dmgC * 2, en.dmgS, en.dmgB) : d(en.dmgC, en.dmgS, en.dmgB);
    // a cowering hero is an easy target; a feared enemy swings poorly - both
    // through the core's own advantage mechanic, composed and clamped
    const adv = clampAdv((s.cower === 1 ? 1 : 0) - (pre.fear > 0 ? 1 : 0));
    const swings = s.cower === 1 ? 2 : 1;
    const rng = forkAt(s, en.id, "attack");
    for (let w = 0; w < swings; w++) {
      const out = resolveAttack({
        attackerId: en.id,
        targetId: "hero",
        atkBonus: en.atk - (pre.weaken > 0 ? 2 : 0),
        dmgDice: dice,
        critRange: 20,
        defAc: s.ac,
        adv,
        rng,
      });
      if (out.hit) {
        let dmg = out.dmg;
        const soak = Math.min(s.block, dmg);
        s.block -= soak;
        dmg -= soak;
        s.hp -= dmg;
        s.dmgTaken += dmg;
        if (s.hp <= 0) {
          s.hp = 0;
          s.phase = "dead";
          return;
        }
      }
    }
  }
  rollIntent(s, en); // telegraph the next move from its OWN stream
}

/** Act the next living enemy (skipping corpses costs no frames); when the
 * line is spent, the hero's turn begins. */
function advanceUnits(s: GauntletState): void {
  while (s.enemyIdx < s.enemies.length && s.enemies[s.enemyIdx].hp <= 0) s.enemyIdx += 1;
  if (s.enemyIdx >= s.enemies.length) {
    startHeroTurn(s);
    return;
  }
  const en = s.enemies[s.enemyIdx];
  s.enemyIdx += 1;
  enemyAct(s, en);
  if (s.phase === "dead") return;
  if (!anyAlive(s)) {
    victory(s); // burn took the last one down mid-round
    return;
  }
  s.busyF = ENEMY_F;
}

// ── demo policy (scripted showcase over the same deterministic streams) ─────

function demoAct(s: GauntletState): void {
  if (s.graceF < DEMO_THINK_F) return;
  if (s.phase === "node") {
    autoPickNode(s);
    return;
  }
  if (s.phase === "draft") {
    s.deck.push(s.draftOpts[0]);
    completeFloor(s, true); // a draft only ever follows combat victory
    return;
  }
  if (s.phase === "combat" && s.sub === "hero") {
    for (let i = 0; i < s.hand.length; i++) {
      const c = CARD_INDEX[s.hand[i]];
      if (c && c.cost <= s.energy && (c.hpCost === 0 || s.hp > c.hpCost)) {
        tryPlay(s, i);
        return;
      }
    }
    endTurn(s, false);
  }
}

function autoPickNode(s: GauntletState): void {
  // mid first (validated live in every pattern), then left, then right
  const order = [1, 0, 2];
  for (const slot of order) {
    if (s.nodeOpts[slot] !== "") {
      resolveNode(s, slot);
      return;
    }
  }
}

// ── step ────────────────────────────────────────────────────────────────────

export function stepGauntlet(s: GauntletState, dt: number, input: SimInput): void {
  void dt; // fixed-step contract: one call = one frame; the sim counts frames
  if (s.phase === "dead") return;
  s.frame += 1;

  const downEdge = input.down && !s.prevDown;
  const spaceEdge = input.space && !s.prevSpace;
  s.prevDown = input.down;
  s.prevSpace = input.space;
  const px = input.px == null ? -1 : Math.max(0, Math.min(1, input.px));
  const py = input.py == null ? -1 : Math.max(0, Math.min(1, input.py));
  const tapped = downEdge && px >= 0 && py >= 0;
  if (downEdge || spaceEdge) s.graceF = 0; // any activity defers the AFK clock

  // busy frames swallow everything (edges above still reset grace)
  if (s.busyF > 0) {
    s.busyF -= 1;
    if (s.busyF === 0 && s.phase === "combat" && s.sub === "units") advanceUnits(s);
    return;
  }

  if (s.phase === "event") {
    if (spaceEdge) s.eventF = 0;
    else s.eventF -= 1;
    if (s.eventF <= 0) completeFloor(s, false); // no fight, no FLOOR_BONUS
    return;
  }

  s.graceF += 1;
  s.phaseF += 1;

  if (s.phase === "node") {
    if (s.demo) {
      demoAct(s);
      return;
    }
    if (tapped && py <= CARD_BAND_Y) {
      const slot = Math.min(2, Math.floor(px * 3));
      resolveNode(s, slot); // empty slot = no-op
      return;
    }
    if (s.graceF >= CHOICE_GRACE || s.phaseF >= PHASE_HARD_F) autoPickNode(s);
    return;
  }

  if (s.phase === "draft") {
    if (s.demo) {
      demoAct(s);
      return;
    }
    if (tapped && py <= CARD_BAND_Y) {
      const slot = Math.min(2, Math.floor(px * 3));
      s.deck.push(s.draftOpts[slot]);
      completeFloor(s, true); // drafting = the fight was won
      return;
    }
    if (spaceEdge || s.graceF >= DRAFT_GRACE || s.phaseF >= PHASE_HARD_F) completeFloor(s, true); // skip the card, keep the won floor's bonus
    return;
  }

  // combat, hero turn, not busy
  if (s.sub !== "hero") return; // unreachable: units always carry busyF
  if (s.demo) {
    demoAct(s);
    return;
  }
  if (tapped) {
    if (py > CARD_BAND_Y) {
      tryPlay(s, Math.min(CARD_SLOTS - 1, Math.floor(px * CARD_SLOTS)));
      return;
    }
    if (px >= END_X) {
      endTurn(s, false);
      return;
    }
  }
  if (spaceEdge) {
    endTurn(s, false);
    return;
  }
  if (s.graceF >= TURN_GRACE) {
    endTurn(s, true); // hesitation is damage: cowering
    return;
  }
  if (s.phaseF >= TURN_HARD_F) endTurn(s, false);
}

// ── harness surface ─────────────────────────────────────────────────────────

export function gauntletDone(s: GauntletState): boolean {
  return s.phase === "dead";
}

export function gauntletScore(s: GauntletState): number {
  return s.xpPts + s.floorPts;
}

export function gauntletDied(s: GauntletState): boolean {
  return s.phase === "dead"; // endless: death is the only exit
}

export function gauntletSimSecs(s: GauntletState): number {
  return s.frame / FPS;
}

export function gauntletDetail(s: GauntletState): string {
  return `floor ${s.floor} ${s.phase} hp ${s.hp}/${s.hpMax} kills ${s.kills} xp ${s.xpPts} floors ${s.floorsCleared}`;
}
