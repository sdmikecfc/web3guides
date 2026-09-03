/**
 * BATTLE BOTS COMMENTARY - the authored template table the commentary bar,
 * the CLI printer and the Knockout Card read from. Keyed by event kind and,
 * for a break, by the piece that went; every break line is followed by its
 * effect line so the chain reads as a story (engine doc section 6).
 *
 * LAWS THIS FILE CARRIES:
 *  - PLAIN WORDS for a global audience: short sentences, whole numbers, no
 *    idioms, no dashes. Names are wallet names or catalog names, never free
 *    text from a player.
 *  - EVERY EVENT KIND HAS A LINE and every piece has an effect line; the
 *    harness checks the tables, not the prose.
 *  - THE TABLE DECIDES NOTHING. narrate() walks a finished log and only
 *    reads it; the resolver never sees this file.
 */

import { EVENT_KINDS, PIECE, PIECE_COUNT, PIECE_NAMES, TIMEOUT_WHY, type EventKind, type FightEvent, type Piece } from "./parts";

export type Names = readonly [string, string];

/** {A} = the side that acted (or the winner), {B} = the other side, {part},
 * {arm}, {dmg} fill from the event. */
export const TEMPLATES: Readonly<Record<EventKind, string>> = {
  start: "{A} and {B} square up. Ding.",
  swing: "{A} swings at {B}.",
  miss: "{A} swings and misses.",
  block: "{B} blocks with the {arm}. The arm takes {dmg}.",
  hit: "{A} hits the {part} for {dmg}.",
  bounce: "Lucky. The {part} hangs on at 1.",
  break: "{B} loses the {part}. Clang.",
  stagger: "{B} staggers.",
  tired: "Both bots are tired. Hits land easier.",
  ko: "{A} wins by knockout.",
  timeout: "Time. {A} wins with more body armor left.",
};

/** Variants the narrator picks by context (still authored, still fixed). */
export const VARIANTS = {
  critHit: "Big hit. {A} cracks the {part} for {dmg}.",
  blockNoDamage: "{B} blocks with the {arm}.",
  blockBreak: "Blocked, but the {arm} gave out.",
  timeoutDamage: "Time. Body armor is even. {A} wins on damage dealt.",
  timeoutChallenged: "Time. Dead even. {A} keeps it as the challenged bot.",
  bodyBreak: "{B} takes it on the body. The body cracks.",
} as const;

/** Effect lines by piece, first loss and second loss of a pair. {B} is the
 * bot that lost the part. */
export const EFFECT_LINES: readonly { first: string; second: string }[] = [
  { first: "Headshot. {B} cannot aim.", second: "Headshot. {B} cannot aim." },
  { first: "{B} is done.", second: "{B} is done." },
  { first: "{B} hits softer, blocks less, and its body is open.", second: "{B} has no arms. Nothing shields the body now." },
  { first: "{B} hits softer, blocks less, and its body is open.", second: "{B} has no arms. Nothing shields the body now." },
  { first: "{B} is slower now and easier to hit.", second: "{B} has no legs. It can barely move." },
  { first: "{B} is slower now and easier to hit.", second: "{B} has no legs. It can barely move." },
];

export interface Line {
  f: number;
  text: string;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

function pairOf(piece: Piece): Piece | -1 {
  if (piece === PIECE.ARM_L) return PIECE.ARM_R;
  if (piece === PIECE.ARM_R) return PIECE.ARM_L;
  if (piece === PIECE.LEG_L) return PIECE.LEG_R;
  if (piece === PIECE.LEG_R) return PIECE.LEG_L;
  return -1;
}

/** Walk a finished log and produce the commentary lines, one or two per
 * event. Swing lines are folded into their outcome (miss / block / hit) so
 * the bar shows one sentence per beat; a stagger right after a break is
 * already told by the effect line and is not repeated. */
export function narrate(log: readonly FightEvent[], names: Names): Line[] {
  const out: Line[] = [];
  const broken: [number[], number[]] = [new Array<number>(PIECE_COUNT).fill(0), new Array<number>(PIECE_COUNT).fill(0)];
  let lastBlockArm = -1;
  let lastBlockWho = -1;
  let lastWasBreak = -1;
  for (const e of log) {
    const A = "who" in e ? names[e.who] : names[0];
    const B = "who" in e ? names[e.who === 0 ? 1 : 0] : names[1];
    let text = "";
    let effect = "";
    switch (e.t) {
      case "start":
        text = fill(TEMPLATES.start, { A: names[0], B: names[1] });
        break;
      case "swing":
        // folded into the outcome that follows
        continue;
      case "miss":
        text = fill(TEMPLATES.miss, { A });
        break;
      case "block":
        // who = the blocker; the swinger is the other side
        text = e.dmg > 0
          ? fill(TEMPLATES.block, { B: A, arm: PIECE_NAMES[e.arm], dmg: e.dmg })
          : fill(VARIANTS.blockNoDamage, { B: A, arm: PIECE_NAMES[e.arm] });
        lastBlockArm = e.arm;
        lastBlockWho = e.who;
        break;
      case "hit":
        text = e.crit
          ? fill(VARIANTS.critHit, { A, part: PIECE_NAMES[e.part], dmg: e.dmg })
          : fill(TEMPLATES.hit, { A, part: PIECE_NAMES[e.part], dmg: e.dmg });
        break;
      case "bounce":
        text = fill(TEMPLATES.bounce, { part: PIECE_NAMES[e.part] });
        break;
      case "break": {
        const victim = e.who;
        broken[victim][e.part] = 1;
        if (e.part === PIECE.BODY) {
          text = fill(VARIANTS.bodyBreak, { B: A });
        } else if (lastBlockWho === victim && lastBlockArm === e.part) {
          text = fill(VARIANTS.blockBreak, { arm: PIECE_NAMES[e.part] });
        } else {
          text = fill(TEMPLATES.break, { B: A, part: PIECE_NAMES[e.part] });
        }
        if (e.part !== PIECE.BODY) {
          const pair = pairOf(e.part);
          const second = pair >= 0 && broken[victim][pair] === 1;
          effect = fill(second ? EFFECT_LINES[e.part].second : EFFECT_LINES[e.part].first, { B: A });
        }
        lastWasBreak = victim;
        break;
      }
      case "stagger":
        if (lastWasBreak === e.who) {
          lastWasBreak = -1;
          continue;
        }
        text = fill(TEMPLATES.stagger, { B: A });
        break;
      case "tired":
        text = TEMPLATES.tired;
        break;
      case "ko":
        text = fill(TEMPLATES.ko, { A: names[e.winner] });
        break;
      case "timeout": {
        const W = names[e.winner];
        text = e.why === TIMEOUT_WHY.BODY
          ? fill(TEMPLATES.timeout, { A: W })
          : e.why === TIMEOUT_WHY.DAMAGE
            ? fill(VARIANTS.timeoutDamage, { A: W })
            : fill(VARIANTS.timeoutChallenged, { A: W });
        break;
      }
    }
    if (e.t !== "block" && e.t !== "break") {
      lastBlockArm = -1;
      lastBlockWho = -1;
    }
    if (e.t !== "break" && e.t !== "stagger") lastWasBreak = -1;
    out.push({ f: e.f, text });
    if (effect) out.push({ f: e.f, text: effect });
  }
  return out;
}

/** At most this many limb or head breaks in the chain summary. The EARLIEST
 * are kept: the story starts where it started. (The week 1 version kept
 * the last four with slice(-4) and dropped the opening breaks.) */
export const CHAIN_MAX_BREAKS = 4;

function breakBeat(part: Piece): string {
  if (part === PIECE.HEAD) return "headshot";
  if (part === PIECE.BODY) return "body cracked";
  return `${PIECE_NAMES[part]} off`;
}

/** The chain summary for the result screen and the card: every break in
 * order (capped at CHAIN_MAX_BREAKS, earliest kept) plus the final ko, as
 * one sentence: "Right arm off, left leg off, headshot, body cracked. Kettle
 * wins." When BOTH bots lose parts the beats carry the loser's name at every
 * change of victim ("Kettle right arm off, Sprocket right arm off, headshot,
 * ..."), so two right arms never read as one. A timeout closes with "time
 * ran out". */
export function chainSummary(log: readonly FightEvent[], names: Names): string {
  const beats: { who: number; text: string }[] = [];
  let limbs = 0;
  let winner = "";
  for (const e of log) {
    if (e.t === "break") {
      // the body break is the ko beat and always stays; limbs cap
      if (e.part === PIECE.BODY) beats.push({ who: e.who, text: breakBeat(e.part) });
      else if (limbs < CHAIN_MAX_BREAKS) {
        beats.push({ who: e.who, text: breakBeat(e.part) });
        limbs += 1;
      }
    } else if (e.t === "ko") {
      winner = names[e.winner];
    } else if (e.t === "timeout") {
      winner = names[e.winner];
      beats.push({ who: -1, text: "time ran out" });
    }
  }
  const victims = new Set(beats.filter((b) => b.who >= 0).map((b) => b.who));
  const named = victims.size > 1;
  let last = -1;
  const words = beats.map((b) => {
    const prefix = named && b.who >= 0 && b.who !== last ? `${names[b.who]} ` : "";
    last = b.who >= 0 ? b.who : last;
    return `${prefix}${b.text}`;
  });
  const chain = words.length > 0 ? words.join(", ") : "";
  const sentence = chain ? `${chain.charAt(0).toUpperCase()}${chain.slice(1)}.` : "";
  if (!winner) return sentence ? `${sentence} The fight is still on.` : "The fight is still on.";
  return `${sentence} ${winner} wins.`.trim();
}

/** Coverage for the harness: every event kind has a template and every
 * piece has an effect line, none with a dash. */
export function validateCommentary(): void {
  const fail = (msg: string): never => {
    throw new Error(`bots commentary: ${msg}`);
  };
  const dash = /[\u2013\u2014]/;
  for (const kind of EVENT_KINDS) {
    const line = TEMPLATES[kind];
    if (!line) fail(`no template for event ${kind}`);
    if (dash.test(line)) fail(`dash in template ${kind}`);
  }
  if (EFFECT_LINES.length !== PIECE_COUNT) fail(`${EFFECT_LINES.length} effect lines, want ${PIECE_COUNT}`);
  for (let p = 0; p < PIECE_COUNT; p++) {
    const eff = EFFECT_LINES[p];
    if (!eff.first || !eff.second) fail(`piece ${PIECE_NAMES[p]}: missing effect line`);
    if (dash.test(eff.first) || dash.test(eff.second)) fail(`piece ${PIECE_NAMES[p]}: dash in effect line`);
  }
  for (const [key, line] of Object.entries(VARIANTS)) {
    if (dash.test(line)) fail(`dash in variant ${key}`);
  }
}
