/**
 * IRON JAW - the AUTHORED content: the opponent stable and the daily ladders.
 *
 * THE SEED NEVER DESIGNS, IT ONLY SELECTS (the S6 law): every opponent is a
 * hand-authored deterministic pattern, every ladder is a hand-picked ordered
 * triple, and the daily seed's whole job is choosing today's ladder index.
 * (The sim's seeded RNG rolls SLIPS and a per-bout footwork phase - it picks
 * from authored numbers, it never invents a pattern.)
 *
 * EQUAL-CEILING LAW: scoring is keyed to the SLOT (bout 1/2/3 KO points),
 * never to the opponent filling it, so every ladder has the identical
 * ceiling and the registry maxScore stays one number. The validator asserts
 * completability per ladder; the ceiling needs no per-ladder math by
 * construction.
 *
 * PATTERN GRAMMAR. An opponent loops its pattern array. Each entry is one
 * strike: gapF idle frames first, then tellF frames of glowing wind-up (the
 * readable warning), then the hit lands on one frame, then recoverF. A
 * DODGED or BLOCKED strike opens vulnF frames where player attacks do
 * damage; a strike that lands on the player opens nothing.
 *
 * THE FIVE STYLES (2026-08-14, Mike: "they need multiple styles"). `style`
 * is the discriminator every layer reads - the sim for its rules, the client
 * for its telegraph colour and shape, the oracle for its policy:
 *
 *   jab       the fast straight. Either dodge works, GUARD WORKS. Amber.
 *   hook      wide, telegraphed from one side: only req's dodge side saves
 *             you and it PIERCES guard. Red, with the dodge-zone chevrons.
 *   uppercut  slow, either dodge works, but it PIERCES GUARD - the answer is
 *             footwork, never the shell. Huge opening if you slip it. Violet.
 *   combo     2-3 strikes chained by innerGapF/innerTellF. Every link is
 *             dodgeable AND blockable, but only the LAST one leaves a real
 *             vulnerability; eating a link breaks the chain. Amber + pips.
 *   feint     a tell that never becomes a strike. No damage, no opening: it
 *             exists to bait a panic dodge onto cooldown right before the
 *             real thing. Washed-out slate, and its window arc never lights.
 *
 *   req: which dodge side beats it. "any" = either dodge works. "L"/"R" =
 *        a hook: only that side. GUARD is decided by the style, not by req
 *        (see `pierces` below) - an uppercut is req "any" and still pierces.
 *
 * THE HAND IS NOT THE ANSWER (2026-08-15, Mike: "every punch is to the right
 * always, nothing else"). `req` is the DODGE REQUIREMENT and only a hook may
 * carry a side, so a renderer that draws the arm off `req` draws every jab,
 * uppercut, combo and feint from the same shoulder - one fighter, one punch,
 * forever. So every strike also authors a `hand`: which of the machine's two
 * arms actually throws it. IT IS RENDER-ONLY. The sim never branches on it,
 * which is why adding it cannot move a tape; the validator only asks that a
 * machine throws with both.
 *
 * REACTABILITY FLOOR: no tellF below 20 frames (~333ms). And a COVERAGE
 * CEILING (the 2026-08-14 playtest fix): the strike resolves on ONE frame at
 * tell end, so the legal dodge window is the last (dodgeWinF - 1) frames of
 * the tell. Every authored tell must open its window within DODGE_LATE_MAX
 * frames of the glow (validateLadders asserts it against the sim's base
 * window), or the glow lies and the fight reads as impossible. Combos carry
 * a THIRD invariant: innerGapF + innerTellF >= the base dodge cooldown, or
 * the second link is mathematically undodgeable at zero Reactor.
 *
 * FOOTWORK (2026-08-14, Mike: "the character needs to move left and right to
 * dodge you as well"). Every opponent owns a `footwork` block: how far and
 * how fast it drifts on its own rhythm, and how readily it SLIPS - steps
 * aside when you swing at a machine that is not open, so mashing genuinely
 * misses. Amplitude and slip both escalate across the class order below;
 * the validator asserts that escalation so a new machine cannot be authored
 * softer than the one it is meant to outclass.
 *
 * The launch stable is FOUR opponents (the ADR-0116 launch cut); mid-season
 * additions grow the stable and the ladder list without touching scoring.
 */

/** The reactability floor: the sim never compresses a tell below this, and
 * the validator refuses any authored tell under it. ONE source of truth
 * (sim.ts and the renderer both import it from here). */
export const TELL_FLOOR_F = 20;
/** A tell's dodge window must open within this many frames of the glow. */
export const DODGE_LATE_MAX = 7;
/** How far off centre an opponent may ever stand, in design px (the arena is
 * 360 wide and a machine is ~178 wide, so this keeps it inside the frame). */
export const LATERAL_MAX = 58;

export type StrikeStyle = "jab" | "hook" | "uppercut" | "combo" | "feint";

export interface Strike {
  /** which of the five styles this is: the sim, the renderer and the oracle
   * all branch on it (see the header) */
  style: StrikeStyle;
  /** idle frames before the wind-up starts */
  gapF: number;
  /** wind-up frames: the glowing tell (>= 20, the reactability floor) */
  tellF: number;
  /** frames of recovery after a landed hit */
  recoverF: number;
  /** frames of VULNERABILITY after a dodged/blocked strike (0 for a feint,
   * which never resolves into anything) */
  vulnF: number;
  /** armor damage if it lands (0 for a feint) */
  dmg: number;
  /** the dodge side that beats it; guard is decided by `pierces` */
  req: "any" | "L" | "R";
  /**
   * RENDER ONLY: which of the machine's own arms throws this. The SIM NEVER
   * BRANCHES ON IT - it exists so the fight looks like a fighter instead of
   * one shoulder repeating itself, and so a tape recorded before it survives
   * it. The machine faces you, so its LEFT arm draws on SCREEN RIGHT; the
   * renderer does that mirror, never the author. Combo links alternate off
   * this one automatically (link 2 throws the other hand).
   */
  hand?: "L" | "R";
  /** combo only: how many strikes in the chain (2 or 3) */
  hits?: number;
  /** combo only: idle frames between chained links */
  innerGapF?: number;
  /** combo only: the wind-up of links 2..n (its own reactability floor) */
  innerTellF?: number;
}

/** How a machine uses the floor. amp/speed drive the idle drift, slip* the
 * step-aside that answers a mash. */
export interface Footwork {
  /** drift amplitude in design px off centre */
  amp: number;
  /** drift phase advance per frame (radians): the machine's own rhythm */
  speed: number;
  /** chance a swing thrown at a machine that is NOT open makes it slip */
  slipP: number;
  /** how far a slip carries it, design px */
  slipStep: number;
  /** slip animation frames: FEWER is quicker, so the classes get sharper */
  slipF: number;
}

export interface OpponentDef {
  key: string;
  name: string;
  /** jab-equivalent hit points (jab 2, heavy 6) */
  hp: number;
  footwork: Footwork;
  pattern: Strike[];
}

/** GUARD IS DECIDED BY THE STYLE, not by req. One source of truth for the
 * sim's block test, the renderer's pierce warning and the oracle's policy. */
export function pierces(st: Strike): boolean {
  return st.style === "hook" || st.style === "uppercut";
}

/** How many strikes a chain carries (1 for everything that is not a combo). */
export function chainHits(st: Strike): number {
  return st.style === "combo" ? (st.hits ?? 2) : 1;
}

export const OPPONENTS: Record<string, OpponentDef> = {
  // Bout-1 class: slow, generous tells, long vulnerability, barely moves.
  // THE TEACHER, and after 2026-08-15 that means it teaches the whole verb
  // set at half speed rather than one verb four times. Its old pattern was
  // jab/jab/feint/jab - a single striking style, which is what made the fight
  // read as "a push right simulator" (Mike). It now shows the pilot both hook
  // sides and both hands on 40-frame tells and 1 damage: the widest, kindest
  // version of every read the ladder will demand later.
  rusty: {
    key: "rusty",
    name: "RUSTBUCKET",
    hp: 30,
    footwork: { amp: 14, speed: 0.022, slipP: 0.08, slipStep: 16, slipF: 12 },
    pattern: [
      { style: "jab", hand: "R", gapF: 84, tellF: 38, recoverF: 40, vulnF: 80, dmg: 1, req: "any" },
      { style: "jab", hand: "L", gapF: 66, tellF: 36, recoverF: 40, vulnF: 76, dmg: 1, req: "any" },
      // RUST HOOK, off side: the shell does NOT save you, your feet do. One
      // damage, the longest tell in the game, the longest opening in the game.
      { style: "hook", hand: "R", gapF: 78, tellF: 40, recoverF: 44, vulnF: 90, dmg: 1, req: "L" },
      { style: "feint", hand: "L", gapF: 60, tellF: 30, recoverF: 44, vulnF: 0, dmg: 0, req: "any" },
      { style: "jab", hand: "R", gapF: 72, tellF: 34, recoverF: 38, vulnF: 72, dmg: 1, req: "any" },
      // ...and the mirror of it, so nobody leaves bout 1 having only ever
      // pressed one side of the screen.
      { style: "hook", hand: "L", gapF: 80, tellF: 40, recoverF: 44, vulnF: 90, dmg: 1, req: "R" },
      { style: "jab", hand: "L", gapF: 90, tellF: 36, recoverF: 44, vulnF: 88, dmg: 1, req: "any" },
    ],
  },
  // Bout-1/2 class: quicker rhythm, the first CHAIN, hooks off both hands,
  // real lateral drift. Where the pilot learns that guard answers a combo and
  // does not answer a hook.
  volt: {
    key: "volt",
    name: "VOLTAGE",
    hp: 36,
    footwork: { amp: 26, speed: 0.03, slipP: 0.2, slipStep: 22, slipF: 10 },
    pattern: [
      { style: "jab", hand: "L", gapF: 60, tellF: 34, recoverF: 34, vulnF: 66, dmg: 1, req: "any" },
      { style: "combo", hand: "R", gapF: 56, tellF: 32, recoverF: 34, vulnF: 62, dmg: 1, req: "any", hits: 2, innerGapF: 20, innerTellF: 26 },
      // ARC LASH: the signature hook, dodge LEFT only, pierces guard.
      { style: "hook", hand: "R", gapF: 74, tellF: 38, recoverF: 40, vulnF: 84, dmg: 2, req: "L" },
      { style: "feint", hand: "L", gapF: 52, tellF: 28, recoverF: 34, vulnF: 0, dmg: 0, req: "any" },
      { style: "jab", hand: "R", gapF: 54, tellF: 32, recoverF: 32, vulnF: 62, dmg: 1, req: "any" },
      // BACK LASH: the same whip off the other arm, dodge RIGHT.
      { style: "hook", hand: "L", gapF: 70, tellF: 36, recoverF: 40, vulnF: 80, dmg: 2, req: "R" },
      { style: "combo", hand: "L", gapF: 50, tellF: 30, recoverF: 32, vulnF: 60, dmg: 1, req: "any", hits: 2, innerGapF: 18, innerTellF: 26 },
    ],
  },
  // Bout-2 class: tighter tells, both hook sides inside ONE pattern, and the
  // first UPPERCUT - the shell stops being an answer twice a loop.
  piston: {
    key: "piston",
    name: "PISTON PETE",
    hp: 45,
    footwork: { amp: 38, speed: 0.036, slipP: 0.34, slipStep: 26, slipF: 9 },
    pattern: [
      { style: "jab", hand: "R", gapF: 52, tellF: 30, recoverF: 30, vulnF: 56, dmg: 1, req: "any" },
      { style: "combo", hand: "L", gapF: 46, tellF: 28, recoverF: 30, vulnF: 58, dmg: 1, req: "any", hits: 2, innerGapF: 16, innerTellF: 24 },
      // RAM CYLINDER: the hook, dodge RIGHT, pierces guard.
      { style: "hook", hand: "L", gapF: 62, tellF: 36, recoverF: 36, vulnF: 74, dmg: 2, req: "R" },
      // PISTON LIFT: pierces the shell, but slipping it opens him wide.
      { style: "uppercut", hand: "R", gapF: 58, tellF: 34, recoverF: 34, vulnF: 86, dmg: 2, req: "any" },
      { style: "feint", hand: "L", gapF: 42, tellF: 26, recoverF: 30, vulnF: 0, dmg: 0, req: "any" },
      { style: "jab", hand: "L", gapF: 48, tellF: 28, recoverF: 28, vulnF: 54, dmg: 1, req: "any" },
      // CROSS ROD: the mirrored hook, dodge LEFT.
      { style: "hook", hand: "R", gapF: 60, tellF: 34, recoverF: 36, vulnF: 72, dmg: 2, req: "L" },
      { style: "uppercut", hand: "L", gapF: 50, tellF: 32, recoverF: 34, vulnF: 82, dmg: 2, req: "any" },
    ],
  },
  // Bout-3 class: the champion from the mockup. Every style, both hands, both
  // hook sides, a THREE-link chain, short tells (never under the floor), the
  // widest footwork and the sharpest slip in the stable. Ten strikes long on
  // purpose: you cannot memorise your way out of the champion in one loop.
  k88: {
    key: "k88",
    name: "CRUSHER K-88",
    hp: 60,
    footwork: { amp: 50, speed: 0.044, slipP: 0.48, slipStep: 30, slipF: 7 },
    pattern: [
      { style: "jab", hand: "R", gapF: 44, tellF: 26, recoverF: 26, vulnF: 48, dmg: 1, req: "any" },
      { style: "combo", hand: "L", gapF: 38, tellF: 26, recoverF: 28, vulnF: 56, dmg: 2, req: "any", hits: 3, innerGapF: 14, innerTellF: 24 },
      // THE SLEDGE: dodge LEFT, pierces guard, hits like a train.
      { style: "hook", hand: "R", gapF: 58, tellF: 30, recoverF: 40, vulnF: 78, dmg: 2, req: "L" },
      { style: "feint", hand: "L", gapF: 34, tellF: 24, recoverF: 26, vulnF: 0, dmg: 0, req: "any" },
      // THE JACK: pierces guard, and the longest opening in the game if you
      // read it - the champion's one honest gift.
      { style: "uppercut", hand: "R", gapF: 50, tellF: 28, recoverF: 32, vulnF: 88, dmg: 2, req: "any" },
      { style: "jab", hand: "L", gapF: 40, tellF: 24, recoverF: 26, vulnF: 46, dmg: 1, req: "any" },
      // THE ANVIL: the sledge's mirror, dodge RIGHT.
      { style: "hook", hand: "L", gapF: 54, tellF: 28, recoverF: 38, vulnF: 74, dmg: 2, req: "R" },
      { style: "combo", hand: "R", gapF: 36, tellF: 24, recoverF: 28, vulnF: 52, dmg: 2, req: "any", hits: 2, innerGapF: 16, innerTellF: 22 },
      { style: "feint", hand: "R", gapF: 30, tellF: 22, recoverF: 26, vulnF: 0, dmg: 0, req: "any" },
      { style: "uppercut", hand: "L", gapF: 46, tellF: 26, recoverF: 32, vulnF: 84, dmg: 2, req: "any" },
    ],
  },
};

/** Ordered triples, escalating by slot. Tier law: bout 1 from {rusty, volt},
 * bout 2 from {volt, piston}, bout 3 from {piston, k88}, no repeats. */
export const LADDERS: [string, string, string][] = [
  ["rusty", "volt", "piston"],
  ["rusty", "volt", "k88"],
  ["rusty", "piston", "k88"],
  ["volt", "piston", "k88"],
];

export function ladderForSeed(hash: number): [string, string, string] {
  return LADDERS[((hash % LADDERS.length) + LADDERS.length) % LADDERS.length];
}

/** After the third KO the belt is yours and the TITLE DEFENSES begin
 * (ADR-0120: scores never cap, the game never runs out). The stable cycles
 * in this authored order, harder on every visit via the sim's escalation
 * mods; the run ends when the champions finally put you down. */
export const DEFENSE_CYCLE = ["volt", "piston", "k88"];

/** Slot tier law (equal-ceiling by construction: scoring keys to the SLOT). */
const SLOT_TIERS: [string[], string[], string[]] = [
  ["rusty", "volt"],
  ["volt", "piston"],
  ["piston", "k88"],
];

/** The authored class order. Footwork must not regress along it: a machine
 * that fights later cannot dance less or slip less than the one before it. */
const CLASS_ORDER = ["rusty", "volt", "piston", "k88"];

/**
 * THE SET VALIDATOR - the machine check behind the "seed only selects" law,
 * same shape as strain/stopclock's. The harness calls this on every verify
 * (fed the sim's base dodge window AND base dodge cooldown), so a bad
 * authored set CANNOT reach a green gate. Checks:
 *   1. reactability: every tellF (and every combo innerTellF) >= TELL_FLOOR_F;
 *   2. coverage (the 2026-08-14 fix's standing invariant): every tell's
 *      dodge window opens within DODGE_LATE_MAX frames of the glow, i.e.
 *      tellF <= (dodgeWinBase - 1) + DODGE_LATE_MAX;
 *   3. style law: hooks (and only hooks) are side-locked; feints deal no
 *      damage and open nothing; every real strike opens a real window and
 *      carries real numbers; combos chain 2-3 links whose innerGapF +
 *      innerTellF clears the base dodge COOLDOWN, so link n is dodgeable at
 *      zero Reactor (without this the chain is undodgeable by arithmetic);
 *   3b. VARIETY LAW (2026-08-15, Mike: "the bot just punches the same way
 *      same thing every time... where is the variability?"). The gate was
 *      green while RUSTBUCKET threw jab/jab/feint/jab, because nothing ever
 *      asked a machine to be more than one fighter. Now every opponent must
 *      carry at least MIN_STYLES distinct striking styles, must lock a strike
 *      to EACH side (so no ladder can be beaten pressing one half of the
 *      screen), and must throw with BOTH HANDS. A one-style machine can no
 *      longer reach a green gate;
 *   4. footwork law: inside LATERAL_MAX, real rhythm, sane slip odds, and
 *      NON-REGRESSING across CLASS_ORDER (amp and slipP both escalate);
 *   5. ladder law: every ladder is 3 distinct stable keys obeying the slot
 *      tiers above (the equal-ceiling roster rule: KO points key to the
 *      slot, so identical slot tiers = identical ceiling per ladder);
 *   6. DEFENSE_CYCLE only names real opponents.
 */
/** The variety floor every machine in the stable clears (rule 3b). */
export const MIN_STYLES = 3;

export function validateLadders(dodgeWinBase: number, dodgeCdBase: number): string[] {
  const errs: string[] = [];
  const coverMax = dodgeWinBase - 1 + DODGE_LATE_MAX;
  for (const [key, o] of Object.entries(OPPONENTS)) {
    if (o.key !== key) errs.push(`${key}: key field mismatch (${o.key})`);
    if (o.hp <= 0) errs.push(`${key}: non-positive hp`);
    const fw = o.footwork;
    if (fw.amp < 0 || fw.amp > LATERAL_MAX) errs.push(`${key}: footwork amp ${fw.amp} outside 0..${LATERAL_MAX}`);
    if (fw.speed <= 0) errs.push(`${key}: footwork speed must be positive`);
    if (fw.slipP < 0 || fw.slipP > 1) errs.push(`${key}: slipP ${fw.slipP} outside 0..1`);
    if (fw.slipStep <= 0 || fw.slipF <= 0) errs.push(`${key}: slip step/frames must be positive`);
    o.pattern.forEach((st, i) => {
      const at = `${key} strike ${i} (${st.style})`;
      if (st.tellF < TELL_FLOOR_F) errs.push(`${at}: tellF ${st.tellF} under the ${TELL_FLOOR_F}f reactability floor`);
      if (st.tellF > coverMax) errs.push(`${at}: tellF ${st.tellF} uncoverable (window opens > ${DODGE_LATE_MAX}f after the glow at base window ${dodgeWinBase})`);
      if (st.gapF < 0 || st.recoverF <= 0) errs.push(`${at}: bad gap/recover frames`);
      const sideLocked = st.req !== "any";
      if (st.style === "hook" && !sideLocked) errs.push(`${at}: a hook must be side-locked (req L or R)`);
      if (st.style !== "hook" && sideLocked) errs.push(`${at}: only a hook may be side-locked (req ${st.req})`);
      if (st.style === "feint") {
        if (st.dmg !== 0) errs.push(`${at}: a feint must deal 0 damage`);
        if (st.vulnF !== 0) errs.push(`${at}: a feint must open nothing (vulnF 0)`);
      } else {
        if (st.dmg < 1) errs.push(`${at}: dmg under 1`);
        if (st.vulnF <= 0) errs.push(`${at}: no vulnerability window`);
      }
      if (st.style === "combo") {
        const hits = st.hits ?? 0;
        const ig = st.innerGapF ?? -1;
        const it = st.innerTellF ?? -1;
        if (hits < 2 || hits > 3) errs.push(`${at}: a combo chains 2 or 3 links (got ${hits})`);
        if (ig < 0) errs.push(`${at}: combo needs innerGapF`);
        if (it < TELL_FLOOR_F) errs.push(`${at}: innerTellF ${it} under the ${TELL_FLOOR_F}f reactability floor`);
        if (it > coverMax) errs.push(`${at}: innerTellF ${it} uncoverable at base window ${dodgeWinBase}`);
        if (ig >= 0 && it >= 0 && ig + it < dodgeCdBase) {
          errs.push(`${at}: link spacing ${ig}+${it}=${ig + it}f is inside the ${dodgeCdBase}f dodge cooldown - the chain is undodgeable at zero Reactor`);
        }
      } else if (st.hits != null || st.innerGapF != null || st.innerTellF != null) {
        errs.push(`${at}: chain fields belong to a combo only`);
      }
      if (st.hand !== "L" && st.hand !== "R") errs.push(`${at}: no render hand authored (L or R)`);
    });
    // ── the VARIETY LAW (rule 3b) ────────────────────────────────────────────
    const uniq = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i);
    const styles = uniq(o.pattern.map((st) => String(st.style)));
    const strikeStyles = uniq(o.pattern.filter((st) => st.style !== "feint").map((st) => String(st.style)));
    const reqs = o.pattern.map((st) => String(st.req));
    const hands = uniq(o.pattern.map((st) => String(st.hand)));
    if (styles.length < MIN_STYLES) {
      errs.push(`${key}: only ${styles.length} distinct style(s) {${styles.join(", ")}} - a machine must carry at least ${MIN_STYLES}`);
    }
    if (strikeStyles.length < 2) {
      errs.push(`${key}: only ${strikeStyles.length} distinct STRIKING style(s) - feints alone are not variety`);
    }
    if (reqs.indexOf("L") < 0) errs.push(`${key}: no left-locked strike - the pilot never has to press the left side`);
    if (reqs.indexOf("R") < 0) errs.push(`${key}: no right-locked strike - the pilot never has to press the right side`);
    if (hands.indexOf("L") < 0 || hands.indexOf("R") < 0) errs.push(`${key}: throws with one arm only (hands {${hands.join(", ")}})`);
  }
  for (let i = 1; i < CLASS_ORDER.length; i++) {
    const prev = OPPONENTS[CLASS_ORDER[i - 1]];
    const cur = OPPONENTS[CLASS_ORDER[i]];
    if (!prev || !cur) {
      errs.push(`CLASS_ORDER names unknown opponent (${CLASS_ORDER[i - 1]} -> ${CLASS_ORDER[i]})`);
      continue;
    }
    if (cur.footwork.amp < prev.footwork.amp) errs.push(`${cur.key}: drifts less than ${prev.key} (class order must escalate)`);
    if (cur.footwork.slipP < prev.footwork.slipP) errs.push(`${cur.key}: slips less than ${prev.key} (class order must escalate)`);
  }
  LADDERS.forEach((lad, li) => {
    if (new Set(lad).size !== 3) errs.push(`ladder ${li}: repeated opponent`);
    lad.forEach((key, slot) => {
      if (!OPPONENTS[key]) errs.push(`ladder ${li} slot ${slot + 1}: unknown opponent ${key}`);
      else if (!SLOT_TIERS[slot].includes(key)) errs.push(`ladder ${li} slot ${slot + 1}: ${key} outside its tier {${SLOT_TIERS[slot].join(", ")}}`);
    });
  });
  for (const key of DEFENSE_CYCLE) {
    if (!OPPONENTS[key]) errs.push(`DEFENSE_CYCLE names unknown opponent ${key}`);
  }
  return errs;
}
