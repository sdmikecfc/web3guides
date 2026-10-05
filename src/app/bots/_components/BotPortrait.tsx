/**
 * ONE SMALL PICTURE OF ONE ROBOT, ON EVERY LIST IN THE GAME.
 *
 * THE PROBLEM THIS FIXES. A robot is normally FOUR colours at once, because
 * every part keeps the colour it arrived in for life (ADR-0141). The garage
 * and the build lift have always drawn that. The lists did not: the battles
 * page drew six rounded rectangles in ONE of the robot's colours, and the
 * board drew a coloured dot per robot and no robot at all. So a player who
 * had just spent an hour making a mint-and-coral robot with a bell on its
 * head opened the fights list and saw a flat pink dummy.
 *
 * NOTHING HERE ASSEMBLES A ROBOT. It cannot: painting a part is a MULTIPLY
 * of its art by its mask, which no browser <img> can do on its own. The one
 * compositor is /api/bots/portrait (src/app/api/bots/portrait/render.ts) and
 * the one description of how a robot is put together is _view/pieces.ts.
 * This file only knows how to ASK for a picture and how to frame one.
 *
 * THE SERVER IS THE TRUTH, and that is why `of` carries an ID and never a
 * look. The route derives the colours, the face, the sticker, the marks and
 * the hat from rows; a caller cannot put a crown in a query string.
 *
 * NO `v`, DELIBERATELY. The route keeps a picture for a year when the url
 * carries a version and five minutes when it does not. A list knows a
 * robot's wins and its level, but it does NOT know when its owner last
 * changed its sticker, so a version built here would freeze a stale picture
 * for a year. Five minutes plus the route's ETag is the honest answer.
 *
 * IT IS NOT A CLIENT COMPONENT. The board is a server component that ships
 * no JavaScript of its own and the battles page is a client one; a plain
 * function with no hooks and no handlers is the only thing both can render.
 * That also means there is no onError: the route never fails hard (an
 * unknown id, an unfinished robot and a database that is down all end at a
 * plain robot, 200 OK), so the only way to an empty frame is the network
 * being gone, and by then the whole page is gone too.
 */
import { PORTRAIT_SIZES, portraitUrl, type PortraitRef } from "../_view/pieces";
import { K, M, TIER_COLOR } from "../_ui/tokens";
import type { Tier } from "../_engine/parts";

/**
 * WHICH FILE TO ASK FOR, and it is a weight decision as much as a sharpness
 * one. The route serves four sizes and a list draws much smaller than any of
 * them, so the rule is the smallest served size that is about twice the
 * drawn size.
 *
 * WHY 1.8 AND NOT 2. Measured on the dev server, 2026-09-05: 64 px is 5.4 KB,
 * 120 px is 14.1 KB, 300 px is 60.0 KB, 432 px is 108.7 KB. The ladder's
 * thumb is drawn at 64. A strict "twice" sends it to the 300 px file, which
 * is 4.7 times the drawn size and FOUR TIMES the bytes of the 120, and the
 * 120 is already 1.9 times the drawn size. Nobody can see the difference
 * between 1.9 and 2.0; everybody can feel 60 KB against 14 on a phone. So
 * 1.8 is the number that lets 1.9 count as twice, and nothing else moves.
 */
export const SOURCE_FACTOR = 1.8;

export function sourceSizeFor(drawn: number): number {
  const want = drawn * SOURCE_FACTOR;
  for (const s of PORTRAIT_SIZES) if (s >= want) return s;
  return PORTRAIT_SIZES[PORTRAIT_SIZES.length - 1];
}

/**
 * EVERY SIZE A ROBOT IS DRAWN AT, in one place, because each one costs a
 * different file (see sourceSizeFor) and a number typed at a call site is a
 * number nobody can add up. The gate imports this and prints what a screen
 * of each list weighs, so the page cannot quietly get heavier.
 */
export const PORTRAIT_ON = {
  /** the board's row of a player's robots */
  boardRow: 30,
  /** the fights list, the longest list in the game */
  fightsList: 34,
  /** the three picked-out fights of the day */
  featured: 40,
  /** the pair on a fight that has only just finished */
  live: 44,
  /** a robot card: the caller's own bots, and a player to challenge */
  botCard: 48,
  /** a game robot on the ladder */
  ladder: 64,
} as const;

export interface BotPortraitProps {
  /**
   * Which robot: a bay robot by its id, one side of a finished fight, or a
   * GAME robot by its shape and its size. There is no fourth kind and no way
   * to pass a look, which is the point.
   */
  of: PortraitRef;
  /** the drawn size, in css pixels. The picture is square. */
  size: number;
  /** the ring's colour. Left off, there is no ring. */
  tier?: Tier;
  /**
   * What a screen reader hears. Left off, the picture is decoration, which
   * is right whenever the robot's name is already printed beside it.
   */
  label?: string;
  /** the lit floor square behind the robot. Off on a dense row. */
  frame?: boolean;
}

export function BotPortrait({ of, size, tier, label, frame = true }: BotPortraitProps) {
  const box = {
    width: size,
    height: size,
    borderRadius: Math.max(4, Math.round(size / 5)),
    border: tier ? `2px solid ${TIER_COLOR[tier]}` : `1px solid ${M.border}`,
    background: frame ? K.floor : M.surface2,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    flex: "0 0 auto",
  } as const;
  return (
    <span style={box} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={portraitUrl({ ...of, size: sourceSizeFor(size) })}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size, display: "block" }}
      />
    </span>
  );
}

/**
 * A ROW OF A PLAYER'S ROBOTS, for the board. Five is what fits in the
 * column on a phone; NOTHING IS CAPPED by it, because the count of the rest
 * is printed in words underneath them.
 *
 * UNDERNEATH, AND NOT BESIDE. The board is a wide table that scrolls
 * sideways on a phone, so a count printed after the fifth robot is pushed
 * off the edge of the screen and the row LOOKS capped at five until you
 * swipe (read on the 390 capture, 2026-09-05). Under the pictures it is
 * always on screen with them, and the column is 70 px narrower besides.
 */
export const PORTRAIT_ROW_SHOWN = 5;

export function BotPortraitRow({
  bots,
  size = PORTRAIT_ON.boardRow,
  moreWord,
}: {
  bots: readonly { id: number; label: string; tier?: Tier }[];
  size?: number;
  /** the sentence for the ones past the fifth, already filled in */
  moreWord?: string | null;
}) {
  const shown = bots.slice(0, PORTRAIT_ROW_SHOWN);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {shown.map((b) => (
          <BotPortrait key={b.id} of={{ bot: b.id }} size={size} tier={b.tier} label={b.label} frame={false} />
        ))}
      </span>
      {moreWord ? <span style={{ fontSize: 11.5, color: M.muted, whiteSpace: "nowrap" }}>{moreWord}</span> : null}
    </span>
  );
}
