/**
 * BATTLE BOTS: WHAT YOUR ROBOTS HAVE EARNED.
 * GET /api/bots/earned (Authorization: Bearer <t>) or POST /api/bots/earned { t }
 *
 * WHY THIS ROUTE EXISTS. The garage screen keeps its builds in the browser,
 * and the browser is not allowed to say what a robot earned (the ninth law:
 * server rows or nothing). Every number here comes off a row: the wins and
 * the lost fights and the level off battle_bots_bots, the colours and the
 * stars off battle_bots_part_instances, the hats off battle_bots_hats, the
 * crown and the keepsakes off battle_bots_cards. A request cannot ask for a
 * mark, because there is no field in which to ask.
 *
 * IT IS THE FIRST READER OF THE CARDS. battle_bots_cards has been collecting
 * signed first-win rows since the first player beat another player, and until
 * now nothing read them back, so a keepsake nobody could look at was the same
 * as no keepsake. loadCards checks each signature before the card is shown
 * (_server/cards.ts), so a row edited after it was written is dropped and
 * logged rather than laundered onto a player's screen.
 *
 * IT NEVER FAILS HARD ON A DECORATION. The hats table may not exist yet
 * (doma-reporter/sql/battle_bots_008_look.sql is run by hand) and the look
 * census may be too big to take; both answer "nothing" and "not counted"
 * rather than throwing, because a garage that will not open is worse than a
 * garage with one line missing. A missing session and a wallet that never
 * enlisted are still refused, in plain words.
 */
import { NextResponse } from "next/server";
import { earnedOf, loadBots, loadCrownBotIds, loadHats, loadParts, lookOf, nameTextOf, socketPaintsOf } from "@/app/bots/_server/bots";
import { loadCards } from "@/app/bots/_server/cards";
import { botsDb, failResponse, readJson, requestDay } from "@/app/bots/_server/db";
import { loadPlayer } from "@/app/bots/_server/players";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { twinCounts } from "@/app/bots/_server/twins";
import type { EarnedBotView, EarnedCardView, EarnedView } from "@/app/bots/_server/types";
import { earnedMarks } from "@/lib/bots/look";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function earned(req: Request, body: { t?: string } | null) {
  const sess = sessionFromRequest(req, body);
  if (!sess) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
  const db = botsDb();
  const player = await loadPlayer(db, sess.wallet);
  if (!player) return NextResponse.json({ ok: false, error: "Enlist first." }, { status: 401 });
  const nowMs = Date.now();
  const day = requestDay(req, nowMs);
  const isTest = !!player.is_test;

  const [bots, parts] = await Promise.all([loadBots(db, sess.wallet), loadParts(db, sess.wallet)]);
  const [hats, crowns, cards] = await Promise.all([
    loadHats(db, sess.wallet),
    loadCrownBotIds(db, sess.wallet),
    loadCards(db, sess.wallet),
  ]);
  const twins = await twinCounts(db, bots, parts, isTest);

  const cardsOf = (botId: number): EarnedCardView[] =>
    cards
      .filter((c) => c.bot_id === botId && !!c.payload)
      .map((c) => ({
        kind: c.kind,
        botId: c.bot_id,
        at: c.payload?.at || c.created_at,
        botName: c.payload?.botName || "",
        beat: c.payload?.beat || "",
        fightId: c.payload?.fightId || "",
      }));

  const view: EarnedView = {
    ok: true,
    day,
    bots: bots.map((b): EarnedBotView => {
      const crown = crowns.has(b.id);
      const e = earnedOf(b, parts, hats, crown);
      return {
        botId: b.id,
        bay: b.slot,
        nameText: nameTextOf(b),
        wins: b.wins,
        losses: b.losses,
        look: lookOf(b, parts, hats, crown),
        paints: socketPaintsOf(b, parts),
        earned: e,
        // the ladder is walked ONCE, in look.ts, off the same LookEarned the
        // shelf rows read, so the marks a screen draws and the rows it lights
        // can never come from two different walks
        marks: earnedMarks(e),
        twins: twins.get(b.id) ?? null,
        cards: cardsOf(b.id),
      };
    }),
  };
  return NextResponse.json(view);
}

export async function GET(req: Request) {
  try {
    return await earned(req, null);
  } catch (e) {
    return failResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ t?: string }>(req);
    return await earned(req, body);
  } catch (e) {
    return failResponse(e);
  }
}
