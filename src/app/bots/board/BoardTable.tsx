/**
 * THE BOARD's table (screens doc 1, row 8: "Bloomberg table: rank, wallet
 * name, bots (tier dots), Battle Points, Trading Score, ROI, Strategy,
 * Visit").
 *
 * Presentation only, and a SERVER component: nothing here sorts, filters or
 * fetches, so the board ships with no client JavaScript of its own.
 *
 * WHAT IS LIVE AND WHAT IS NOT (2026-09-06). Fight points, the robots and
 * the place are real, from rows the game already writes. Trade points, the
 * up-or-down number and the strategy come from the trading tracker, which is
 * not live yet.
 *
 * THOSE THREE COLUMNS ARE NOT DRAWN, AND THE SENTENCE UNDER THE TABLE SAYS
 * SO. They used to be here, each cell reading "not counted yet", and three
 * of them times eight rows is twenty four cells of grey saying nothing. Worse
 * than saying nothing: the table then needed more width than the page gives
 * it, so on a laptop the last column was SLICED DOWN THE MIDDLE and the
 * header read "UP O" (read on the 1440 capture, 2026-09-06). A cut off table
 * reads as a broken page. One plain sentence underneath says the same thing
 * once, and the five live columns fit with room to spare. Week 4 adds the
 * columns back with numbers in them.
 *
 * Visit waits for the Bot Profile route (week 4); a link that 404s is the
 * defect this page fixes.
 *
 * THE LAWS ON THIS SCREEN: wallet NAMES only, never an address. No dollar
 * figure, ever. Operator and test wallets are excluded and the exclusion
 * fails closed (page.tsx). Scores never cap, so the column prints whatever
 * the ledger holds.
 */
import type { CSSProperties } from "react";
import { BotPortraitRow, PORTRAIT_ROW_SHOWN } from "../_components/BotPortrait";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, M, R } from "../_ui/tokens";
import type { Tier } from "../_engine/parts";
import { starWord, winLossWords } from "@/lib/bots/strings";
import css from "./board.module.css";

/**
 * Local copy. These lines belong in STRINGS.en.board next to `visit` and
 * `noStrategy`; that file is being edited by another lane this week, so they
 * wait here rather than collide.
 */
const COPY = {
  eyebrow: "LEADERS",
  title: "Every player on Sprocket Row",
  sub: "Best fight points first. Player names only.",
  later: "Trade points and trading results are coming soon. Fight points are working now.",
  empty: "Nobody is on the list yet.",
  emptyHint: "Win one fight and you are on it.",
  unavailable: "The list is not working right now. Try again in a minute.",
  bots: "Robots",
  rank: "Place",
  /** three names for one thing shipped here: the column, the sentence above
   * it and the cell. The player is a player everywhere now. */
  wallet: "Player",
  points: "Fight points",
  pointsShort: "Points",
  record: "Wins and losses",
  recordShort: "W-L",
  noBots: "no robots yet",
  /** the robots past the fifth. NOTHING IS CAPPED: the rest are counted. */
  andMore: "and {n} more",
} as const;

export interface BoardBot {
  id: number;
  tier: number;
}

export interface BoardRow {
  rank: number;
  name: string;
  /** this player's robots, best first; empty for a new garage */
  bots: readonly BoardBot[];
  battlePoints: number;
  wins: number;
  losses: number;
}

/** Fight points step in quarters, so print the quarter and drop a bare .00 */
function pointsText(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "");
}

const HEAD: CSSProperties = { fontFamily: FONT_DISPLAY, color: M.muted };
const CELL: CSSProperties = { color: M.text, borderTop: `1px solid ${M.border}` };
const NUM: CSSProperties = { ...CELL, fontFamily: FONT_MONO };

export function BoardTable({ rows, unavailable }: { rows: readonly BoardRow[]; unavailable?: boolean }) {
  return (
    <section style={{ fontFamily: FONT_BODY, paddingTop: 28 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: "0.32em", color: M.muted }}>{COPY.eyebrow}</div>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, margin: "6px 0 4px", color: M.text, fontWeight: 700 }}>{COPY.title}</h1>
      <p style={{ margin: 0, fontSize: 13, color: M.muted }}>{COPY.sub}</p>

      <div
        style={{
          marginTop: 20,
          background: M.surface,
          border: `1px solid ${M.border}`,
          borderRadius: R.card,
          padding: "18px 6px 10px",
        }}
      >
        {unavailable ? (
          <p style={{ margin: 0, padding: "24px 14px", fontSize: 14, color: M.muted }}>{COPY.unavailable}</p>
        ) : rows.length === 0 ? (
          <div style={{ padding: "24px 14px" }}>
            <p style={{ margin: 0, fontSize: 15, color: M.text }}>{COPY.empty}</p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: M.muted }}>{COPY.emptyHint}</p>
          </div>
        ) : (
          <>
            <div className={css.scroll}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th className={`${css.h} ${css.n} ${css.rank}`} style={HEAD} scope="col">
                      {COPY.rank}
                    </th>
                    <th className={css.h} style={HEAD} scope="col">
                      {COPY.wallet}
                    </th>
                    <th className={css.h} style={HEAD} scope="col">
                      {COPY.bots}
                    </th>
                    <th className={`${css.h} ${css.n}`} style={HEAD} scope="col">
                      <span className={css.wideWord}>{COPY.points}</span>
                      <span className={css.narrowWord}>{COPY.pointsShort}</span>
                    </th>
                    <th className={`${css.h} ${css.n} ${css.record}`} style={HEAD} scope="col">
                      <span className={css.wideWord}>{COPY.record}</span>
                      <span className={css.narrowWord}>{COPY.recordShort}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.rank}:${r.name}`}>
                      {/* THE FIRST THREE PLACES ARE THE ONES A READER IS
                          LOOKING FOR, so they are the only bright numbers in
                          the column and everything under them stays quiet.
                          The place is still just a number: no medal, no cup,
                          nothing that has to be explained. */}
                      <td className={`${css.c} ${css.n} ${css.rank}`} style={{ ...NUM, color: r.rank <= 3 ? M.text : M.muted, fontWeight: r.rank <= 3 ? 700 : 400 }}>
                        {r.rank}
                      </td>
                      <td className={`${css.c} ${css.name}`} style={{ ...CELL, fontWeight: 600 }}>
                        {r.name}
                      </td>
                      {/* THE ROBOTS THEMSELVES, not a row of coloured dots.
                          A dot said "this player owns a three star robot";
                          the picture says which robot, in its own four
                          colours, with the face its owner chose and
                          whatever it has won on its head. */}
                      <td className={css.c} style={CELL}>
                        {r.bots.length === 0 ? (
                          <span style={{ color: M.muted, fontSize: 12.5 }}>{COPY.noBots}</span>
                        ) : (
                          <BotPortraitRow
                            bots={r.bots.map((b) => {
                              const stars = Math.min(4, Math.max(1, b.tier)) as Tier;
                              return { id: b.id, tier: stars, label: `${starWord(stars)} robot` };
                            })}
                            moreWord={
                              r.bots.length > PORTRAIT_ROW_SHOWN
                                ? COPY.andMore.replace("{n}", String(r.bots.length - PORTRAIT_ROW_SHOWN))
                                : null
                            }
                          />
                        )}
                      </td>
                      {/* the column the whole table is sorted by, so it is
                          the strongest number on the row */}
                      <td className={`${css.c} ${css.n}`} style={{ ...NUM, fontWeight: 700, fontSize: 15 }}>
                        {pointsText(r.battlePoints)}
                      </td>
                      <td className={`${css.c} ${css.n} ${css.record}`} style={{ ...NUM, color: M.lore }}>
                        <span className={css.wideWord}>{winLossWords(r.wins, r.losses)}</span>
                        <span className={css.narrowWord}>
                          {r.wins}-{r.losses}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={css.note} style={{ color: M.lore }}>
              {COPY.later}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
