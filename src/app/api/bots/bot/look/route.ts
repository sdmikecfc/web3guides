/**
 * BATTLE BOTS: PUT A LOOK ON A ROBOT. POST /api/bots/bot/look
 *   { t, bay, look: { face?, sticker?, spot?, stickerPaint?, hat? } }
 *
 * WHY THIS ROUTE EXISTS, and why it is not POST /api/bots/bot/save.
 *
 * The save route writes a whole robot: its five parts, its name, its plate
 * colour and its look, in one row, and every part id in it has to be an
 * instance this wallet owns. That is the right shape for the screen that
 * builds a robot out of the shelf. It is the wrong shape for a player who
 * tapped a face: the build screen keeps its builds in the browser
 * (garage-state.ts, and GET /api/bots/earned exists because of it), so it has
 * no server part id to send, and asking it to send five of them to change a
 * face would mean inventing them. A request that has to lie about four fields
 * to change a fifth is a request that will eventually get one of them wrong.
 *
 * So this route changes exactly one thing and reads everything else off the
 * row. There is no field in which to ask for a part, a name, a colour, a win
 * or a mark, which is the strongest form of "the server is the truth" (the
 * ninth law): not a check that passes, a field that does not exist.
 *
 * THE GATE IS THE SAVE ROUTE'S OWN GATE, imported, not restated:
 *   earnedOf()   what this robot has earned, out of rows only. Its wins and
 *                lost fights and level off battle_bots_bots, the colours and
 *                the stars off the part rows it is wearing, the hats off
 *                battle_bots_hats, the crown off battle_bots_cards.
 *   parseLook()  the claim checked against that, throwing the sentence the
 *                player reads on anything that does not hold up.
 * Both come from src/lib/bots/look.ts, and /api/bots/bot/save calls the same
 * pair, so there is one answer to "may this robot wear this" and one place to
 * change when the answer changes. A gate that reimplemented either would
 * reproduce this file's assumptions and pass.
 *
 * IT REFUSES OUT LOUD. A face nobody earned, a colour the robot is not
 * wearing and a hat it never won are all 400 with the plain sentence, never a
 * quiet substitution: a screen that has drifted has to say so, or the drift
 * lives forever.
 */
import { NextResponse } from "next/server";
import { LookRefused, earnedMarks, parseLook, type BotLookRaw } from "@/lib/bots/look";
import {
  BAY_MAX,
  BAY_MIN,
  buildJsonOf,
  earnedOf,
  loadBots,
  loadCrownBotIds,
  loadHats,
  loadParts,
  socketPaintsOf,
  type BuildJson,
} from "@/app/bots/_server/bots";
import { botsDb, failResponse, intIn, nowIso, readJson, refuse } from "@/app/bots/_server/db";
import { loadPlayer } from "@/app/bots/_server/players";
import { sessionFromRequest } from "@/app/bots/_server/session";
import type { LookView } from "@/app/bots/_server/types";

export const runtime = "nodejs";

interface LookBody {
  t?: string;
  bay?: unknown;
  /** the four things a player picks. Nothing here is trusted. */
  look?: BotLookRaw;
}

/** What comes back: the robot as it now looks, in the same three parts every
 *  other surface reads it in, so the screen redraws from the answer rather
 *  than from what it asked for. */
export interface LookSavedView extends LookView {
  ok: true;
  botId: number;
  bay: number;
}

export async function POST(req: Request) {
  try {
    const body = await readJson<LookBody>(req);
    const sess = sessionFromRequest(req, body);
    if (!sess) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
    const db = botsDb();
    const player = await loadPlayer(db, sess.wallet);
    if (!player) return refuse(401, "Enlist first.");

    const bay = intIn(body.bay, BAY_MIN, BAY_MAX, "The spot");
    const bots = await loadBots(db, sess.wallet);
    const bot = bots.find((b) => b.slot === bay);
    // a spot with no robot in it is not an error in the player's world, it is
    // an empty spot, and the sentence says so
    if (!bot) return refuse(404, `Spot ${bay} has no robot yet.`);

    const parts = await loadParts(db, sess.wallet);
    const [hats, crowns] = await Promise.all([loadHats(db, sess.wallet), loadCrownBotIds(db, sess.wallet)]);
    const crown = crowns.has(bot.id);
    const earned = earnedOf(bot, parts, hats, crown);

    let look;
    try {
      look = parseLook(body.look, earned);
    } catch (e) {
      if (e instanceof LookRefused) return refuse(400, e.message);
      throw e;
    }

    // ONE FIELD MOVES. The rest of the build JSON is written back exactly as
    // it was read, so a save that races a part change cannot roll the parts
    // back to what this request happened to think they were.
    const build: BuildJson = { ...buildJsonOf(bot), look };
    const { error } = await db
      .from("battle_bots_bots")
      .update({ build, updated_at: nowIso() })
      .eq("id", bot.id)
      .eq("wallet", sess.wallet);
    if (error) throw new Error(`look update: ${error.message}`);

    const view: LookSavedView = {
      ok: true,
      botId: bot.id,
      bay,
      look,
      paints: socketPaintsOf(bot, parts),
      marks: earnedMarks(earned),
      wins: bot.wins,
    };
    return NextResponse.json(view);
  } catch (e) {
    return failResponse(e);
  }
}
