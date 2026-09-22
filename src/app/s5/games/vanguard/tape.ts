/**
 * VANGUARD BASELINE TAPE - recorded 2026-08-01 by
 * `npx tsx scripts/s5-harness.ts --record vanguard` against the pre-transform
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
 * zero-stat replay: score 360, 4472 frames (~74.5s), hull breached rally 0/7, 6 trucks, 0 breaches, hull 0
 * max-stat replay:  score 420, 5401 frames (~90.0s), out of time rally 0/7, 7 trucks, 0 breaches, hull 44
 */

export interface TapeEvent {
  t: number; // frame index the event takes effect (fixed TAPE_DT steps)
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

export const TAPE_GAME = "vanguard";
export const TAPE_SEED = "s5-harness-vanguard-baseline-1";
export const TAPE_W = 360;
export const TAPE_H = 480;
export const TAPE_DT = 1 / 60;

/** [t, px, py, flags(bit0 down, bit1 space, bit2 px null, bit3 py null)] */
const ROWS: [number, number, number, number][] = [
[0,366,741,1],
[36,1012,1996,1],
[108,713,1996,1],
[204,366,741,1],
[228,713,1996,1],
[1519,713,1996,3],
[1520,713,1996,1],
[1879,713,1996,3],
[1880,713,1996,1],
[2799,713,1996,3],
[2800,713,1996,1],
[2999,713,1996,3],
[3000,713,1996,1],
[3799,713,1996,3],
[3800,713,1996,1],
[3839,713,1996,3],
[3840,713,1996,1],
[4399,713,1996,3],
[4400,713,1996,1]
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
  zero: { score: 360, hash: 0xba3802d5, frames: 4472, died: true },
  max: { score: 420, hash: 0x893db15a, frames: 5401, died: false },
};
