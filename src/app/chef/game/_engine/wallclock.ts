/**
 * THE DAY BUS (M8) — how a real day reaches a deterministic simulation.
 *
 * THE PROBLEM. Every timer in this game used to be play-time. A "day" is 24
 * game hours, and a game hour is 30 real seconds, so a day was 12 minutes of
 * an open tab. The pantry delivery, Gus, LP tenure and the drop budgets were
 * all hung off that rollover, which meant leaving the tab open strictly beat
 * coming back tomorrow, and a player who returned after a week found exactly
 * what a player who returned after lunch found: nothing.
 *
 * The kindness laws say absence is never punished. What shipped was absence is
 * never NOTICED, which is a different design and not one anybody wants. This
 * module is the fix: the beats that carry meaning move onto real days, and
 * they ACCRUE while you are gone.
 *
 * WHY IT LIVES OUTSIDE THE SIM. stepWorld must stay a pure function of seed
 * plus action tape -- that is what the harness proves and what makes a replay
 * reproducible. A Date.now() inside it would make every replay diverge. So the
 * clock is read out here, turned into a plain `newDay` action, and pushed
 * through applyAction, which is the sim's only door and is already recorded on
 * the tape. The offline coin grant has always worked this way; M8 promotes the
 * pattern to a first-class mechanism.
 *
 * Renderer-free, React-free, no I/O: importable by a route or a script.
 */

/** ms in a day. UTC, so a player who travels does not get a short day. */
const DAY_MS = 86_400_000;

/**
 * How many days of goods the crew will hold for you.
 *
 * A cap has to exist or a save from a year ago mints a year of pantry. Three
 * is chosen so a week away still feels like a generous welcome rather than a
 * technicality, and so the number never has to be shown: what the player sees
 * is what ARRIVED. There is deliberately no "you missed 4 days" anywhere in
 * this file, because that sentence is the whole thing we refuse to write.
 */
export const MAX_BANKED_DAYS = 3;

/** Which UTC day a timestamp falls in. Whole days since the epoch. */
export function utcDayOf(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

export interface DayBeat {
  /** the UTC day we are now in */
  utcDay: number;
  /** days of goods to hand over: 1 for a normal return, capped at MAX_BANKED_DAYS */
  banked: number;
  /** true when the player has been away long enough for the crew to have saved things up */
  welcomeBack: boolean;
}

/**
 * Work out what a returning player is owed.
 *
 * `lastUtcDay` is the day their save last saw. A fresh save (0) counts as one
 * day, so a brand new player gets a delivery on their first visit rather than
 * an empty pantry and a shrug.
 *
 * Returns null when nothing is owed, i.e. they already played today. Playing
 * twice in a day is never worth less than playing once.
 */
export function dayBeat(nowMs: number, lastUtcDay: number): DayBeat | null {
  const utcDay = utcDayOf(nowMs);
  if (!Number.isFinite(lastUtcDay) || lastUtcDay <= 0) {
    return { utcDay, banked: 1, welcomeBack: false };
  }
  if (utcDay <= lastUtcDay) return null;
  const elapsed = utcDay - lastUtcDay;
  return {
    utcDay,
    banked: Math.min(MAX_BANKED_DAYS, elapsed),
    welcomeBack: elapsed >= 2,
  };
}

/**
 * Real days a position has been parked, for the tenure that unlocks a domain
 * collection (ADR-0105).
 *
 * Away days count ONLY when there is a live position now AND there was one at
 * the last save: the gate says "kept liquidity here", and crediting a gap we
 * cannot vouch for would make it a lie. Capped so a long-dormant save cannot
 * unlock everything at once on one boot.
 */
export function tenureDays(
  nowMs: number,
  lastUtcDay: number,
  heldBefore: boolean,
  heldNow: boolean
): number {
  if (!heldBefore || !heldNow) return 0;
  if (!Number.isFinite(lastUtcDay) || lastUtcDay <= 0) return 0;
  const elapsed = utcDayOf(nowMs) - lastUtcDay;
  return Math.max(0, Math.min(14, elapsed));
}
