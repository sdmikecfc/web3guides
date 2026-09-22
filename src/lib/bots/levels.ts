/**
 * A ROBOT'S LEVEL, TURNED INTO THE FOUR THINGS A SCREEN DRAWS.
 *
 * WHY THIS FILE EXISTS. Every fight already writes a robot's level and the
 * fights behind it (_server/bots.ts recordFight, which stores levelForXp of
 * the new total), and no screen in the game drew either one. Meanwhile the
 * whole part ladder hangs off the level: the parts screen refuses a 3 star
 * part until one of the wallet's robots is level 5, and a 4 star part until
 * one is level 10. A player could read "You need level 5" on a card and have
 * nowhere to find out what level they were, or what makes a level go up.
 *
 * IT RESTATES NO RULE. The ladder comes from _engine/rewards.ts LEVEL_FLOORS
 * and MAX_LEVEL, and the two part gates come from fixtures.ts LEVEL_FOR_TIER,
 * which is the table the shop and the buy route already read. Both are
 * imported, never copied, so a number that moves there moves here on the same
 * day (the Domain Kitchen lesson: a second copy of a rule is a second place
 * for it to drift).
 *
 * NOTHING CAPS AND NOTHING IS CLAMPED. Level 10 is the last one the ladder
 * has, so at the top there is no bar at all and a sentence takes its place,
 * rather than a full bar standing there for ever. And when the fights behind
 * a robot do not sit inside the level it is on, the bar is dropped rather
 * than squashed into range: "we cannot say" is honest, a clamped bar is not.
 *
 * PURE. No clock, no store, no React: two plain functions over numbers.
 */
import { LEVEL_FLOORS, MAX_LEVEL } from "@/app/bots/_engine/rewards";
import { LEVEL_FOR_TIER } from "./fixtures";
import { STRINGS, fill } from "./strings";

const t = STRINGS.en;

export interface LevelNote {
  /** the level the row carries, printed as it is */
  level: number;
  /** this robot is on the last level the ladder has */
  atTop: boolean;
  /**
   * How far through this level the robot is, 0 to 1, or null when it cannot
   * be worked out: at the top there is no next level to fill towards, and a
   * robot whose fight count sits outside its own level's window is a row
   * that disagrees with itself, which is worth saying nothing about rather
   * than drawing wrong.
   */
  fill: number | null;
  /** "Level 4" */
  now: string;
  /** "Next is level 5.", empty at the top */
  next: string;
  /** the line under the bar */
  note: string;
  /** what a higher level opens, or what the top means */
  unlock: string;
}

/**
 * `level` is the robot's stored level (the same number the parts screen
 * gates on). `xp` is the fight total stored beside it, which is what the
 * ladder measures; leave it out where there is none to read (the demo
 * garage keeps a level and no total) and the bar is simply not drawn.
 */
export function levelNote(level: number, xp?: number | null): LevelNote {
  const lv = Math.floor(Number(level)) || 1;
  const atTop = lv >= MAX_LEVEL;
  const bar = barFill(lv, xp);
  return {
    level: lv,
    atTop,
    fill: bar,
    now: fill(t.level.now, { n: lv }),
    next: atTop ? "" : fill(t.level.next, { n: lv + 1 }),
    note: atTop ? fill(t.level.top, { n: lv }) : bar == null ? t.level.unknown : t.level.going,
    unlock:
      lv < LEVEL_FOR_TIER[3]
        ? fill(t.level.need3, { n: LEVEL_FOR_TIER[3] })
        : lv < LEVEL_FOR_TIER[4]
          ? fill(t.level.need4, { n: LEVEL_FOR_TIER[4] })
          : t.level.topOpen,
  };
}

function barFill(lv: number, xp?: number | null): number | null {
  if (xp == null || !Number.isFinite(xp)) return null;
  if (lv >= MAX_LEVEL || lv < 1) return null;
  const from = LEVEL_FLOORS[lv - 1];
  const to = LEVEL_FLOORS[lv];
  if (from == null || to == null) return null;
  const span = to - from;
  if (span <= 0) return null;
  const v = (xp - from) / span;
  // outside its own level's window: the row disagrees with itself, so the
  // screen says nothing instead of squashing it into range
  return v < 0 || v > 1 ? null : v;
}
