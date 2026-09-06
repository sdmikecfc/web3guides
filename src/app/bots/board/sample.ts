/**
 * THE BOARD'S SAMPLE ROWS, DEV ONLY.
 *
 * Why they exist: the board's own data comes from real, non-test wallets, and
 * a development database has none (every smoke wallet is is_test and the
 * board excludes those, failing closed). So on a development box the real
 * page correctly renders its empty state and the table can never be seen.
 * These rows feed the SAME BoardTable so it can be reviewed, screenshotted
 * and shown at both sizes.
 *
 * Two routes use them and both refuse in production: /bots/board/preview
 * (404s outside development) and the real board, which falls back to these
 * ONLY when the database returned no players AND this is not production. A
 * production board with no players still shows its honest empty state, so
 * nothing invented can ever be shown as if it were real play.
 *
 * THE ROBOT IDS ARE REAL, and they have to be. The bots column is a row of
 * PICTURES, and a picture is asked for by id from /api/bots/portrait, which
 * derives what a robot wears from its own rows: the server is the truth. An
 * invented id would draw the route's plain fallback robot and this would be
 * showing something the real board never shows.
 *
 * The names beside them are invented, because a name is only a string here
 * and no address appears on this page or anywhere else. A row whose id has
 * since been recycled draws the plain robot, which is exactly what the real
 * board would do with it.
 */
import type { BoardRow } from "./BoardTable";

const bot = (id: number, tier: number) => ({ id, tier });

/** eight garages: a tie on 12 points, a five bot garage, one with nine, a
 *  brand new one. Nine proves the row does not cap: five are drawn and the
 *  other four are counted in words beside them. */
export const SAMPLE_ROWS: BoardRow[] = [
  {
    rank: 1,
    name: "Brass Otter 41",
    bots: [bot(18, 4), bot(35, 3), bot(78, 3), bot(277, 2), bot(274, 2), bot(273, 1), bot(260, 1), bot(257, 1), bot(129, 1)],
    battlePoints: 27.5,
    wins: 19,
    losses: 6,
  },
  { rank: 2, name: "Copper Lantern 8", bots: [bot(121, 3), bot(118, 3), bot(116, 2)], battlePoints: 21, wins: 14, losses: 9 },
  { rank: 3, name: "Sleepy Tractor 38", bots: [bot(111, 3), bot(107, 2), bot(43, 2), bot(59, 1)], battlePoints: 16.25, wins: 11, losses: 11 },
  { rank: 4, name: "Mighty Kettle 56", bots: [bot(268, 2), bot(255, 2)], battlePoints: 12, wins: 8, losses: 5 },
  { rank: 4, name: "Rusty Hornet 3", bots: [bot(40, 2), bot(42, 1), bot(49, 1)], battlePoints: 12, wins: 9, losses: 12 },
  { rank: 6, name: "Quiet Piston 77", bots: [bot(57, 2)], battlePoints: 6.5, wins: 4, losses: 3 },
  { rank: 7, name: "Little Anvil 12", bots: [bot(9, 1), bot(60, 1)], battlePoints: 2, wins: 1, losses: 4 },
  { rank: 8, name: "New Sparrow 91", bots: [], battlePoints: 0, wins: 0, losses: 0 },
];
