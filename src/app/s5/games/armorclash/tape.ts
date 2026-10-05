/**
 * ARMOR CLASH BASELINE TAPE - recorded 2026-08-01 by
 * `npx tsx scripts/s5-harness.ts --record armorclash` against the pre-transform
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
 * zero-stat replay: score 211, 9357 frames (~155.9s), lost (overrun) round 1/1, kills 26, HQs 0, towers 0, deploys 24v32
 * max-stat replay:  score 655, 11037 frames (~183.9s), lost (stalled) round 1/1, kills 38, HQs 0, towers 1, deploys 22v39
 */

export interface TapeEvent {
  t: number; // frame index the event takes effect (fixed TAPE_DT steps)
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

export const TAPE_GAME = "armorclash";
export const TAPE_SEED = "s5-harness-armorclash-baseline-1";
export const TAPE_W = 360;
export const TAPE_H = 480;
export const TAPE_DT = 1 / 60;

/** [t, px, py, flags(bit0 down, bit1 space, bit2 px null, bit3 py null)] */
const ROWS: [number, number, number, number][] = [
[152,121,438,1],
[153,121,438,0],
[164,104,220,1],
[165,104,220,0],
[371,104,220,1],
[372,104,220,0],
[700,255,266,1],
[701,255,266,0],
[1248,197,438,0],
[1249,197,438,1],
[1250,197,438,0],
[1260,256,220,0],
[1261,256,220,1],
[1262,256,220,0],
[1690,256,220,1],
[1691,256,220,0],
[2017,256,220,1],
[2018,256,220,0],
[2674,256,220,1],
[2675,256,220,0],
[3112,258,241,1],
[3113,258,241,0],
[3548,262,272,1],
[3549,262,272,0],
[3880,264,256,1],
[3881,264,256,0],
[4427,254,253,1],
[4428,254,253,0],
[4863,247,273,1],
[4864,247,273,0],
[5195,260,278,1],
[5196,260,278,0],
[5207,260,278,1],
[5208,260,278,0],
[5219,260,278,1],
[5220,260,278,0],
[5231,260,278,1],
[5232,260,278,0],
[5243,260,278,1],
[5244,260,278,0],
[5255,260,278,1],
[5256,260,278,0],
[5267,245,267,1],
[5268,245,267,0],
[5853,261,266,1],
[5854,261,266,0],
[6297,237,283,1],
[6298,237,283,0],
[6735,254,283,1],
[6736,254,283,0],
[7064,242,270,1],
[7065,242,270,0],
[7502,102,266,1],
[7503,102,266,0],
[7722,207,321,1],
[7723,207,321,0],
[7890,215,306,1],
[7891,215,306,0],
[8219,246,252,1],
[8220,246,252,0],
[8436,239,267,0],
[8437,239,267,1],
[8438,239,267,0],
[8658,219,303,1],
[8659,219,303,0],
[8825,217,305,1],
[8826,217,305,0],
[9100,198,338,1],
[9101,198,338,0],
[9112,198,338,1],
[9113,198,338,0],
[9124,198,338,1],
[9125,198,338,0],
[9136,198,338,1],
[9137,198,338,0],
[9148,198,338,1],
[9149,198,338,0],
[9160,273,438,1],
[9161,273,438,0],
[9172,198,338,1],
[9173,198,338,0],
[9184,198,338,1],
[9185,198,338,0],
[9196,198,338,1],
[9197,198,338,0],
[9208,198,340,1],
[9209,198,340,0],
[9220,198,341,1],
[9221,198,341,0],
[9232,198,342,1],
[9233,198,342,0],
[9244,198,342,1],
[9245,198,342,0],
[9256,198,342,1],
[9257,198,342,0],
[9268,121,438,1],
[9269,121,438,0],
[9280,198,342,1],
[9281,198,342,0],
[9292,198,342,1],
[9293,198,342,0],
[9304,198,342,1],
[9305,198,342,0],
[9316,198,342,1],
[9317,198,342,0],
[9328,198,342,1],
[9329,198,342,0],
[9340,198,342,1],
[9341,198,342,0],
[9352,198,342,1],
[9353,198,342,0]
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
  zero: { score: 211, hash: 0x494a7dc6, frames: 9357, died: true },
  max: { score: 655, hash: 0xd0c12e6f, frames: 11037, died: true },
};
