/**
 * WARHAWKS BASELINE TAPE - recorded 2026-08-02 by
 * `npx tsx scripts/s5-harness.ts --record warhawks` against the pre-transform
 * sim tree. DO NOT EDIT BY HAND and do not re-record casually: this file IS
 * the byte-identity baseline the harness replays after every page/shell
 * refactor to prove the sim's behavior did not move. Re-record ONLY when the
 * sim itself deliberately changes (which invalidates old tapes by design),
 * and say so in the commit.
 *
 * Replay contract (scripts/s5-harness.ts): fixed 0.016667s steps at
 * 360x480; an event applies from frame t onward; px/py are sim-input
 * coordinates (may be negative: foes are engaged beyond the canvas edge);
 * flags bit0=down, bit1=space, bit2=px is null, bit3=py is null (null =
 * pointer never moved). BASELINE hashes are fnv1a32 over JSON.stringify of
 * the final sim state (rng closures drop out of JSON).
 *
 * zero-stat replay: score 530, 1574 frames (~26.2s), down leg 1 (gunfire) 6/6 bombs on target, grazes 5, chains 0
 * max-stat replay:  score 620, 1846 frames (~30.8s), down leg 1 (gunfire) 6/6 bombs on target, grazes 10, chains 0
 */

export interface TapeEvent {
  t: number; // frame index the event takes effect (fixed TAPE_DT steps)
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

export const TAPE_GAME = "warhawks";
export const TAPE_SEED = "s5-harness-warhawks-baseline-1";
export const TAPE_W = 360;
export const TAPE_H = 480;
export const TAPE_DT = 1 / 60;

/** [t, px, py, flags(bit0 down, bit1 space, bit2 px null, bit3 py null)] */
const ROWS: [number, number, number, number][] = [
[121,260,298,1],
[171,260,298,3],
[172,260,298,1],
[210,265,298,1],
[420,281,298,1],
[450,301,298,1],
[480,297,298,1],
[486,299,298,1],
[492,265,298,1],
[654,200,298,1],
[684,214,298,1],
[690,209,298,1],
[696,206,298,1],
[708,205,298,1],
[750,265,298,1],
[823,265,298,3],
[824,265,298,1],
[852,281,298,1],
[870,273,298,1],
[876,275,298,1],
[882,140,298,1],
[888,99,298,1],
[894,220,298,1],
[918,59,298,1],
[924,79,298,3],
[925,79,298,1],
[936,59,298,1],
[942,79,298,1],
[954,146,298,1],
[960,140,298,1],
[972,261,298,1],
[1002,229,298,1],
[1020,78,298,1],
[1025,78,298,3],
[1026,78,298,1],
[1147,78,298,3],
[1148,78,298,1],
[1188,142,298,1],
[1224,120,298,1],
[1266,121,298,1],
[1278,120,298,1],
[1284,142,298,1],
[1290,79,298,1],
[1314,200,298,1],
[1339,200,298,3],
[1340,200,298,1],
[1350,142,298,1],
[1368,99,298,1],
[1392,160,298,1],
[1428,120,298,1],
[1446,224,298,1],
[1465,0,0,12]
];

export const TAPE: TapeEvent[] = ROWS.map((r) => ({
  t: r[0],
  px: (r[3] & 4) === 4 ? null : r[1],
  py: (r[3] & 8) === 8 ? null : r[2],
  down: (r[3] & 1) === 1,
  space: (r[3] & 2) === 2,
}));

export const BASELINE = {
  recorded: true,
  zero: { score: 530, hash: 0x45fb30b8, frames: 1574, died: true },
  max: { score: 620, hash: 0x845d77bb, frames: 1846, died: true },
};
