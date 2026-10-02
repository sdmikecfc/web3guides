/**
 * BATTLE BOTS RNG - fnv1a / mulberry32 / rngFork copied verbatim from
 * src/app/s7/games/_shared/rules/core.ts (the S6 game contract, byte-identical
 * streams) so the fight engine carries no import into the S7 tree and the two
 * can version apart. One stream per side per purpose via rngFork(): a change
 * to build A's numbers never moves build B's draws (harness gate g).
 */

export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = () => number;

export function mulberry32(a: number): Rng {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One stream per entity per purpose. `rngFork(seed, "A", "hit")` always
 * yields the same stream regardless of what any OTHER entity rolled. */
export function rngFork(seed: number, entityId: string, purpose: string): Rng {
  return mulberry32(fnv1a(`${seed >>> 0}|${entityId}|${purpose}`));
}
