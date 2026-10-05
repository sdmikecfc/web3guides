/**
 * WHAT THE SERVER SAYS YOUR ROBOTS HAVE EARNED, and how a screen puts a look
 * back. The browser half of GET /api/bots/earned and POST /api/bots/bot/look.
 *
 * WHY IT IS A FILE AND NOT A HOOK IN A SCREEN. Two screens ask the same
 * question (the garage draws the marks, the build screen offers the faces) and
 * one screen answers it back. A second copy of the fetch is a second place for
 * "what counts as signed out" to drift, and the two screens would then
 * disagree about whether a face is locked, which is exactly the bug a player
 * would report as "it let me pick it and then it vanished".
 *
 * THE NINTH LAW, in one sentence: nothing in here decides what a robot has
 * earned. It carries the server's answer, and where there is no answer it
 * says so with `null`, which is not the same as "nothing earned".
 *
 * NO CLOCK, NO STORE, NO REACT. Plain functions over fetch, so a check script
 * can call them and a screen owns its own state.
 */
import type { EarnedBotView, EarnedView, LookView } from "@/app/bots/_server/types";
import { readBotsSession } from "@/app/bots/battles/session";
import type { BotLook, BotLookRaw } from "./look";
import { STRINGS } from "./strings";

/** GET /api/bots/earned, or null when this browser has no session, the token
 *  has expired or the route could not answer. Null is "we did not find out",
 *  never "this wallet has nothing": an empty array is that. */
export async function loadEarnedBots(): Promise<EarnedBotView[] | null> {
  const token = readBotsSession();
  if (!token) return null;
  try {
    const res = await fetch("/api/bots/earned", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = (await res.json()) as EarnedView | { ok: false };
    return res.ok && body.ok ? body.bots : null;
  } catch {
    return null;
  }
}

/** What POST /api/bots/bot/look answers with. */
export type LookSaveResult =
  | { ok: true; view: LookView }
  /** the plain sentence the player reads; already worded for them */
  | { ok: false; message: string }
  /** nobody is signed in, so there was nothing to ask: the caller keeps its
   *  own copy and says nothing, because a player with no wallet connected has
   *  not done anything wrong */
  | { ok: false; offline: true; message: null };

/**
 * PUT A LOOK ON THE ROBOT IN THIS SPOT, on the server.
 *
 * The whole chosen look goes every time, never a patch of it, because that is
 * what the route's parseLook takes; sending half of one would let the two
 * halves disagree about what was asked for. The route reads the parts, the
 * wins, the hats and the crown off rows, so there is no field here in which to
 * claim any of them.
 */
export async function saveLookToServer(bay: number, look: BotLook | BotLookRaw): Promise<LookSaveResult> {
  const token = readBotsSession();
  if (!token) return { ok: false, offline: true, message: null };
  try {
    const res = await fetch("/api/bots/bot/look", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        t: token,
        bay,
        // only the four chosen things, spelled out, so a caller cannot post a
        // field the route would have to think about ignoring
        look: {
          face: look.face,
          sticker: look.sticker ?? null,
          spot: look.spot,
          stickerPaint: look.stickerPaint ?? null,
          hat: look.hat ?? null,
        },
      }),
    });
    const body = (await res.json().catch(() => null)) as (LookView & { ok?: boolean; error?: string }) | null;
    if (res.ok && body?.ok) return { ok: true, view: body };
    // a spot the server has never heard of is the build screen's normal state
    // until a robot is saved to it, and it is not a refusal a player should be
    // shown: the browser keeps its own copy and nothing is said
    if (res.status === 404) return { ok: false, offline: true, message: null };
    if (res.status === 401) return { ok: false, offline: true, message: null };
    return { ok: false, message: body?.error || STRINGS.en.look.notSaved };
  } catch {
    // the network went away mid tap. The browser already has the look, so the
    // honest thing is to keep it and not shout about a wire.
    return { ok: false, offline: true, message: null };
  }
}
