/**
 * THE GAUNTLET BASELINE TAPE - recorded 2026-08-30 by
 * `npx tsx scripts/s7-harness.ts --record gauntlet`. DO NOT EDIT BY HAND and
 * do not re-record casually: this file IS the byte-identity baseline the
 * harness replays to prove the sim's behavior did not move. Re-record ONLY
 * when the sim itself deliberately changes, and say so in the commit.
 *
 * Replay contract (scripts/s7-harness.ts): fixed 0.016667s steps at
 * 800x600; an event applies from frame t onward; px/py are integer pixels
 * in that viewport (adapters convert to sim space). BASELINE hashes are
 * fnv1a32 over JSON.stringify of the final sim state.
 *
 * null-loadout replay: score 400, 2399 frames (~40.0s), floor 2 dead hp 0/30 kills 4 xp 200 floors 2
 * max-loadout replay:  score 350, 3299 frames (~55.0s), floor 4 dead hp 0/99 kills 3 xp 150 floors 4
 */

export interface TapeEvent {
  t: number; // frame index the event takes effect (fixed TAPE_DT steps)
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

export const TAPE_GAME = "gauntlet";
export const TAPE_SEED = "realmfall-gauntlet-baseline-1";
export const TAPE_W = 800;
export const TAPE_H = 600;
export const TAPE_DT = 1 / 60;
export const TAPE: TapeEvent[] = [
  { t: 0, px: 400, py: 240, down: true, space: false },
  { t: 1, px: null, py: null, down: false, space: false },
  { t: 31, px: 80, py: 540, down: true, space: false },
  { t: 32, px: null, py: null, down: false, space: false },
  { t: 72, px: 400, py: 540, down: true, space: false },
  { t: 73, px: null, py: null, down: false, space: false },
  { t: 113, px: 80, py: 540, down: true, space: false },
  { t: 114, px: null, py: null, down: false, space: false },
  { t: 154, px: 240, py: 540, down: true, space: false },
  { t: 155, px: null, py: null, down: false, space: false },
  { t: 195, px: 80, py: 540, down: true, space: false },
  { t: 196, px: null, py: null, down: false, space: false },
  { t: 236, px: 760, py: 240, down: true, space: false },
  { t: 237, px: null, py: null, down: false, space: false },
  { t: 312, px: 80, py: 540, down: true, space: false },
  { t: 313, px: null, py: null, down: false, space: false },
  { t: 353, px: 240, py: 540, down: true, space: false },
  { t: 354, px: null, py: null, down: false, space: false },
  { t: 394, px: 400, py: 540, down: true, space: false },
  { t: 395, px: null, py: null, down: false, space: false },
  { t: 435, px: 760, py: 240, down: true, space: false },
  { t: 436, px: null, py: null, down: false, space: false },
  { t: 511, px: 80, py: 540, down: true, space: false },
  { t: 512, px: null, py: null, down: false, space: false },
  { t: 552, px: 133, py: 240, down: true, space: false },
  { t: 553, px: null, py: null, down: false, space: false },
  { t: 554, px: 400, py: 240, down: true, space: false },
  { t: 555, px: null, py: null, down: false, space: false },
  { t: 585, px: 400, py: 540, down: true, space: false },
  { t: 586, px: null, py: null, down: false, space: false },
  { t: 626, px: 400, py: 540, down: true, space: false },
  { t: 627, px: null, py: null, down: false, space: false },
  { t: 667, px: 400, py: 540, down: true, space: false },
  { t: 668, px: null, py: null, down: false, space: false },
  { t: 708, px: 760, py: 240, down: true, space: false },
  { t: 709, px: null, py: null, down: false, space: false },
  { t: 784, px: 80, py: 540, down: true, space: false },
  { t: 785, px: null, py: null, down: false, space: false },
  { t: 825, px: 240, py: 540, down: true, space: false },
  { t: 826, px: null, py: null, down: false, space: false },
  { t: 866, px: 80, py: 540, down: true, space: false },
  { t: 867, px: null, py: null, down: false, space: false },
  { t: 907, px: 80, py: 540, down: true, space: false },
  { t: 908, px: null, py: null, down: false, space: false },
  { t: 948, px: 80, py: 540, down: true, space: false },
  { t: 949, px: null, py: null, down: false, space: false },
  { t: 989, px: 760, py: 240, down: true, space: false },
  { t: 990, px: null, py: null, down: false, space: false },
  { t: 1065, px: 240, py: 540, down: true, space: false },
  { t: 1066, px: null, py: null, down: false, space: false },
  { t: 1106, px: 240, py: 540, down: true, space: false },
  { t: 1107, px: null, py: null, down: false, space: false },
  { t: 1147, px: 133, py: 240, down: true, space: false },
  { t: 1148, px: null, py: null, down: false, space: false },
  { t: 1149, px: 400, py: 240, down: true, space: false },
  { t: 1150, px: null, py: null, down: false, space: false },
  { t: 1180, px: 80, py: 540, down: true, space: false },
  { t: 1181, px: null, py: null, down: false, space: false },
  { t: 1221, px: 80, py: 540, down: true, space: false },
  { t: 1222, px: null, py: null, down: false, space: false },
  { t: 1262, px: 240, py: 540, down: true, space: false },
  { t: 1263, px: null, py: null, down: false, space: false },
  { t: 1303, px: 240, py: 540, down: true, space: false },
  { t: 1304, px: null, py: null, down: false, space: false },
  { t: 1344, px: 80, py: 540, down: true, space: false },
  { t: 1345, px: null, py: null, down: false, space: false },
  { t: 1385, px: 760, py: 240, down: true, space: false },
  { t: 1386, px: null, py: null, down: false, space: false },
  { t: 1506, px: 80, py: 540, down: true, space: false },
  { t: 1507, px: null, py: null, down: false, space: false },
  { t: 1547, px: 80, py: 540, down: true, space: false },
  { t: 1548, px: null, py: null, down: false, space: false },
  { t: 1588, px: 760, py: 240, down: true, space: false },
  { t: 1589, px: null, py: null, down: false, space: false },
  { t: 1709, px: 560, py: 540, down: true, space: false },
  { t: 1710, px: null, py: null, down: false, space: false },
  { t: 1750, px: 560, py: 540, down: true, space: false },
  { t: 1751, px: null, py: null, down: false, space: false },
  { t: 1791, px: 400, py: 540, down: true, space: false },
  { t: 1792, px: null, py: null, down: false, space: false },
  { t: 1832, px: 80, py: 540, down: true, space: false },
  { t: 1833, px: null, py: null, down: false, space: false },
  { t: 1873, px: 80, py: 540, down: true, space: false },
  { t: 1874, px: null, py: null, down: false, space: false },
  { t: 1914, px: 80, py: 540, down: true, space: false },
  { t: 1915, px: null, py: null, down: false, space: false },
  { t: 1955, px: 760, py: 240, down: true, space: false },
  { t: 1956, px: null, py: null, down: false, space: false },
  { t: 2076, px: 240, py: 540, down: true, space: false },
  { t: 2077, px: null, py: null, down: false, space: false },
  { t: 2117, px: 400, py: 540, down: true, space: false },
  { t: 2118, px: null, py: null, down: false, space: false },
  { t: 2158, px: 80, py: 540, down: true, space: false },
  { t: 2159, px: null, py: null, down: false, space: false },
  { t: 2199, px: 760, py: 240, down: true, space: false },
  { t: 2200, px: null, py: null, down: false, space: false },
  { t: 2275, px: 240, py: 540, down: true, space: false },
  { t: 2276, px: null, py: null, down: false, space: false },
  { t: 2316, px: 400, py: 540, down: true, space: false },
  { t: 2317, px: null, py: null, down: false, space: false },
  { t: 2357, px: 560, py: 540, down: true, space: false },
  { t: 2358, px: null, py: null, down: false, space: false },
  { t: 2398, px: 760, py: 240, down: true, space: false },
];
export const BASELINE = {
  recorded: true,
  zero: { score: 400, hash: 144324235, frames: 2399, died: true },
  max: { score: 350, hash: 1451084002, frames: 3299, died: true },
};
