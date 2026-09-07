/**
 * Seeded RNG + hashing for the Domain Kitchen world (ADR-0101).
 * fnv1a + mulberry32, COPIED from the S5 arcade pattern rather than imported:
 * the arcade may tune its copies, and the kitchen's determinism must never
 * move underneath a saved world.
 *
 * The world stores only the integer rng state (see world.ts), never a closure,
 * so world state stays serializable and hashable for the headless soak.
 */

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One mulberry32 draw. Pure: (state) -> (nextState, value in [0,1)). */
export function mulberryNext(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: s, value };
}
