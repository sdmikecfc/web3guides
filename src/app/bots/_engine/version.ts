/**
 * BATTLE BOTS ENGINE VERSION - pinned into every fight row and every hashed
 * state. Bump on ANY rule change (a formula, a knob, a stream purpose, an
 * event shape); old fights keep their stored summary and the client shows
 * "This replay needs the new version" instead of a wrong fight. The harness
 * baseline records the version it was frozen under.
 *
 * 1  week 1: the tuned fight (derive.ts FORMULA, resolve.ts BEAT).
 * 2  matched sets: setBonus() on the fight aggregates (derive.ts), the
 *    Fighter gains setPerStat, the catalog is families (new part ids), and
 *    the chain summary keeps the earliest breaks. Baseline re-recorded.
 */
export const ENGINE_VERSION = 2;
