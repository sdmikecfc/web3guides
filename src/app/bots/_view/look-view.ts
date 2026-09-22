/**
 * THE ONE TRANSLATION: what the SERVER says a robot looks like (LookView, out
 * of _server/types.ts) turned into what the RIG wears (BotLook, out of
 * _view/look.ts).
 *
 * The two halves speak different languages on purpose. The server half deals
 * in paint IDS, because an id is what a part row stores and what a save route
 * can check; the drawing half deals in HEX NUMBERS, because a tint is a
 * number and rig.ts has never known what a paint id is. This file is the only
 * place the two meet, so there is one answer to "which colour is the hat" and
 * not one per screen.
 *
 * THREE RULES IT KEEPS, all three copied from the portrait compositor
 * (src/app/api/bots/portrait/render.ts) rather than invented here, so the ring
 * and the little square picture of the same robot can never disagree:
 *
 *   THE HAT takes the HEAD's colour. It is drawn with an ink rim, so it still
 *   separates from a head of the same colour (look.ts drawTopper).
 *   THE STICKER takes the colour the robot CHOSE for it, and falls back to the
 *   TORSO's when a row has none.
 *   THE WEAPON RIDES THE ARM, which is socketPaints()'s own rule and is why a
 *   normal robot reads as four colours and not five.
 *
 * NOTHING HERE REACHES THE FIGHT. This file imports no engine module that is
 * not a type, and _engine imports nothing from _view. The colours it hands out
 * are tints on a sprite; the sim never sees one.
 */
import { combatPaints, type CombatBuild } from "@/lib/bots/combat-model";
import type { Socket } from "@/lib/bots/fixtures";
import { SOCKETS } from "@/lib/bots/fixtures";
import type { LookMarks, SocketPaints } from "@/lib/bots/look";
import { NO_LOOK, NO_MARKS, emptyPaints, paintHex, socketPaints } from "@/lib/bots/look";
import type { Build, PaintId } from "../_engine/parts";
// type-only (erased at compile time): the server's shapes, never its client
import type { LookView } from "../_server/types";
import { CUFF_LEVELS, GOLD_STAR_AT, SPARKLE_LEVEL, WIN_STARS, type BotLook, type LookEarned } from "./look";

/**
 * THE EARNED NUMBERS BEHIND A SET OF MARKS.
 *
 * The rig walks the ladder itself: setLook takes `earned` and calls its own
 * marksOf. The server has already walked the SAME ladder and stored the
 * result, and a stored fight carries the MARKS, not the numbers. So this turns
 * the marks back into numbers that walk to exactly the same place.
 *
 * THE MARKS DECIDE, NOT THE WIN COUNT, and that is the whole point. A fight
 * row stored before looks existed carries a win count and NO MARKS on purpose:
 * the robot in that replay never wore a star, and the server refuses to invent
 * one for it. Reading the win count here would put the stars back on and undo
 * that refusal one layer down. It did, and the first ring render showed a
 * robot from an old row wearing the full six star ladder it never earned.
 *
 * So every number below is read off the marks:
 *
 *   WINS     whatever count walks to the stars the server stored. Below the
 *            gold star that is the step the last drawn star stands for; at the
 *            gold star it is the TRUE count, because that is where the plate
 *            starts printing the number and the ladder stops being drawable.
 *   REPAIRS  patches + patchesBeyond IS the count, because the server split
 *            one number into the part it could draw and the part it could not.
 *   LEVEL    the only three levels the drawing can tell apart are "no cuff",
 *            "one cuff" and "two cuffs and a sparkle", which are levels 1, 5
 *            and 10 (CUFF_LEVELS and SPARKLE_LEVEL, read from the drawing side
 *            so a moved ladder moves this with it).
 *
 * scripts/bots-ring-check.ts holds this: it walks both ladders over every win
 * count, loss count and level that matters, AND over marks that disagree with
 * the count they are handed, and refuses a single disagreement.
 */
export function earnedFromMarks(m: LookMarks, wins: number): LookEarned {
  const level = m.cuffs >= CUFF_LEVELS.length ? SPARKLE_LEVEL : m.cuffs >= 1 ? CUFF_LEVELS[0] : 1;
  const drawn = Math.max(0, Math.min(WIN_STARS.length, m.stars));
  const count = Math.max(0, Math.floor(wins) || 0);
  return {
    wins: m.goldStar ? Math.max(GOLD_STAR_AT, count) : drawn === 0 ? 0 : WIN_STARS[drawn - 1],
    repairs: Math.max(0, m.patches + m.patchesBeyond),
    level,
    crown: m.crown,
  };
}

/** Every socket's colour as a tint, with the robot's own plate colour standing
 *  in for a socket that never recorded one. A fight build always fills all
 *  five slots, so the fallback is for a row from before colours were stored. */
function tintsOf(paints: SocketPaints, fallback: PaintId): Record<Socket, number> {
  const out = {} as Record<Socket, number>;
  for (const s of SOCKETS) out[s] = paintHex(paints[s] ?? fallback);
  return out;
}

/**
 * WHAT THE RIG WEARS, from what the server stored.
 *
 * `fallback` is the robot's plate colour (FightIdentityView.paint), used only
 * where a socket has no colour of its own. It is what the ring painted the
 * WHOLE bot before this lane, so a row that stored nothing draws exactly the
 * picture it drew yesterday, and every row that stored something draws better.
 */
export function rigLookOf(v: LookView, fallback: PaintId): BotLook {
  // a half of a look, from a row written by a version that did not have all
  // three parts, is a robot in its own colours and nothing else: the pit is
  // allowed to be plain and is never allowed to throw
  const tint = tintsOf(v?.paints ?? emptyPaints(), fallback);
  const l = v?.look ?? NO_LOOK;
  const marks = v?.marks ?? NO_MARKS;
  return {
    paint: tint,
    face: l.face,
    sticker: l.sticker
      ? { id: l.sticker, spot: l.spot, color: l.stickerPaint ? paintHex(l.stickerPaint) : tint.torso }
      : null,
    plate: l.plateNumber,
    // a hat wears the colour it turned up in. A hat row with no colour of its
    // own is a row written before colours were recorded, and its true answer
    // is the head's, which is the picture every surface drew before this lane
    hat: l.hat ? { kind: l.hat.kind, color: l.hat.color ? paintHex(l.hat.color) : tint.head } : null,
    earned: earnedFromMarks(marks, v?.wins ?? 0),
  };
}

/**
 * A FIGHT WITH NO STORED LOOK AT ALL: the demo pit on the landing page and the
 * demo replays. The colours are real and always were, because every Part in a
 * build carries the colour it arrived in; nothing else is invented, so a demo
 * robot wears the calm face, no sticker, no hat and no marks.
 *
 * The server does the same thing for a row stored before looks existed
 * (_server/fight-read.ts looksFromBuild) through the same socketPaints(), and
 * the gate proves the two land on the same picture.
 */
export function rigLookFromBuild(build: Build, fallback: PaintId): BotLook {
  const paints = (build as CombatBuild | undefined)?.limbs ? combatPaints(build) : socketPaints((slot) => build?.[slot]?.paint);
  return { paint: tintsOf(paints, fallback), face: "calm", sticker: null, plate: null, hat: null, earned: undefined };
}

/** The body colour a rig is painted with before its look goes on: the torso's,
 *  because the one thing left reading `paint` after that is the CHIP a lost
 *  limb leaves on the body (rig.ts drawScar), and that chip is on the torso. */
export function bodyTintOf(look: BotLook): number {
  return look.paint?.torso ?? look.paint?.head ?? paintHex(null);
}
