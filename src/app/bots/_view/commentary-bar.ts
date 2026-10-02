/**
 * THE COMMENTARY BAR'S CLOCK (screens doc 4.2: one sentence at a time, 44 px,
 * never two lines). Pure: the viewer (fight/FightClient.tsx) hands it the
 * narrated lines and reads back the frame each one shows at; no Pixi, no
 * React, so a harness can check it and the landing's muted pit can share it.
 *
 * TWO RULES, both measured on the week-2 viewer (seed 7, the T2 mirror):
 *
 *  - A LINE NEVER LAGS ITS EVENT BY MORE THAN MAX_LAG_F. The week-2 schedule
 *    was a fixed 40-frame dwell with no bound, so a burst of hits and effect
 *    lines let the queue drift 211 frames behind the knockout: "wins by
 *    knockout" landed 2.8 s of wall time AFTER the result card, and the bar
 *    was still calling hits while the card named the winner. While the bar is
 *    catching up a line holds MIN_DWELL_F instead of DWELL_F; it is never
 *    dropped, so the story stays whole. Measured over 200 fights (five
 *    canonical pairings, 40 seeds): the worst KO-line lag falls from 6.4 s
 *    of wall time to 2.7 s, 14 percent of lines take the short dwell, none
 *    shows for under 0.3 s.
 *
 *  - THE KO LINE HOLDS UNTIL THE CARD. The last line (the knockout or the time
 *    call) is the one the result card waits for: koLineUp() gates the card in
 *    the viewer, so the card never appears over a stale sentence and the KO
 *    line stays on the bar under it.
 */

/** a line holds at least this long (two thirds of a second) */
export const DWELL_F = 40;
/** the dwell while the bar is catching up on a burst: 0.3 s of presentation
 * time, which is a full second of wall time inside the knockout slow motion,
 * where every burst ends */
export const MIN_DWELL_F = 18;
/** a line is never shown more than this many frames after its event (1 s);
 * lines that share one event frame still queue MIN_DWELL_F apart */
export const MAX_LAG_F = 60;

/** The frame each line is shown at, in line order. Every value is at least
 * the line's own event frame and at least MIN_DWELL_F after the previous
 * line, and never more than MAX_LAG_F after the event. */
export function scheduleCommentary(lines: readonly { f: number }[]): number[] {
  const disp: number[] = [];
  let last = -DWELL_F;
  for (const l of lines) {
    let d = Math.max(l.f, last + DWELL_F);
    if (d > l.f + MAX_LAG_F) d = Math.max(l.f + MAX_LAG_F, last + MIN_DWELL_F);
    disp.push(d);
    last = d;
  }
  return disp;
}

/** The index of the line on the bar at `clock` (frames since the bell), or
 * -1 before the first line. */
export function lineAt(disp: readonly number[], clock: number): number {
  let idx = -1;
  for (let i = 0; i < disp.length; i++) {
    if (disp[i] <= clock) idx = i;
    else break;
  }
  return idx;
}

/** True once the last line (the knockout or the time call) is on the bar:
 * the result card's gate. A fight with no lines never blocks the card. */
export function koLineUp(disp: readonly number[], lineIdx: number): boolean {
  return disp.length === 0 || lineIdx >= disp.length - 1;
}
