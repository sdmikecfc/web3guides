"use client";

/**
 * THE FIRST MEETING (Mike, 2026-09-05: "Can someone look at it and think
 * 'aww that's so cute, I want to upgrade this guy' and feel ownership over
 * how cute it is?").
 *
 * A new player already owns a robot before they have done anything, and
 * until now that robot simply APPEARED, in a numbered box, beside four
 * empty ones. Nothing introduced them. This card is the introduction: the
 * robot wakes up, it is standing there looking out, it turns out to have a
 * name, and the player can keep that name or pick another one in a tap.
 * Then the game says the name back to them, warmly, and never shows the
 * card again.
 *
 * IT FOLLOWS THE COACH LAW (src/app/bots/_components/Coach.tsx), because
 * the first thing a game does must not be to take the screen away:
 *  - no modal and no scrim: the card sits in the page flow, at the top,
 *    and the garage underneath it works with the card ignored;
 *  - one tap ends it, with no "are you sure";
 *  - it is remembered in localStorage (bots.meet.v1), so a player meets
 *    their robot exactly once on this browser;
 *  - the garage reads that memory AFTER mount and only then renders the
 *    card, so the server render and the first client render agree and the
 *    card can never flash on a returning player.
 *
 * THE PICTURE IS OPTIONAL. The garage hands in the bot it already extracted
 * from its own canvas; a box with public/bots-art deleted hands in null and
 * the words carry the moment on their own (the house law).
 *
 * THE MOTION IS ONE BOB. It reads as breathing, it runs once, and it is off
 * entirely for a reader who asked for less movement.
 *
 * AND IT GETS A FACE (2026-09-05). A name is somebody else's word for your
 * robot until you have done one thing to it, so the card now carries the one
 * tap row that gives it a face. It is the FIRST thing a new player does, it
 * costs nothing, it cannot be got wrong, and it is the whole of the idea the
 * build screen then opens out: this robot is yours and it looks the way you
 * said. The row is the same component the build screen uses, so a face row
 * cannot mean two things.
 *
 * THE CARD OWNS THAT ROW END TO END. It reads the spot's own rows out of the
 * store and asks the server what has been earned, rather than taking either
 * from the garage, so the garage screen did not have to grow a fourth job to
 * pass them down. Everything it saves goes through the same gate as every
 * other look: garage-state saveLook for this browser, and POST
 * /api/bots/bot/look for the row that counts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { nameText, type BotName } from "@/lib/bots/fixtures";
import { getGarage, lookEarnedOf, lookOfBay, saveLook, subscribeGarage } from "@/lib/bots/garage-state";
import { loadEarnedBots, saveLookToServer } from "@/lib/bots/earned-client";
import { LookRefused, NOTHING_EARNED, NO_LOOK, type BotLook, type FaceId, type LookEarned } from "@/lib/bots/look";
import { STRINGS, fill } from "@/lib/bots/strings";
import { Button, Sheet, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_TOY, K, M, R, TAP } from "../_ui/tokens";
import { LookPicker } from "./LookPicker";
import { NamePicker } from "./NamePicker";

const t = STRINGS.en;
const KEY = "bots.meet.v1";

/** the one bob, and nothing at all for a reader who asked for less movement */
const MOTION = `
@keyframes botsMeetWake {
  0%   { transform: translateY(10px) scale(0.94); opacity: 0; }
  55%  { transform: translateY(-6px) scale(1.02); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.botsMeetWake { animation: botsMeetWake 900ms cubic-bezier(0.32, 0.72, 0, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .botsMeetWake { animation: none; }
}
`;

function readMet(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: the meeting happens, once, this visit
  }
}

/** Has this browser met its robot already. The garage asks before it spends
 * a canvas readback on a picture the card is never going to draw. */
export function hasMet(): boolean {
  return readMet();
}

function writeMet(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage blocked: nothing to remember, and nothing breaks */
  }
}

export function FirstMeeting({
  name,
  spot,
  picture,
  onRename,
  onDone,
}: {
  /** the name the robot already carries */
  name: BotName;
  /** the spot it is standing in, 1 to 5 */
  spot: number;
  /** the bot alone, as a data URL, or null when there is no art to draw */
  picture: string | null;
  /** save the new name. The garage owns the store; this card owns the words. */
  onRename: (n: BotName) => void;
  /** the meeting is over. THE GARAGE holds this, not the card, because the
   * proud moments queue behind it: a first visit that opened with a robot
   * waking up AND a trophy line was two greetings at once. */
  onDone: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<BotName>(name);
  const [said, setSaid] = useState<BotName | null>(null);

  /* ── the face row ──────────────────────────────────────────────────────
     Read after mount, like everything else on this card, so the server
     render and the first client render agree. What has been EARNED comes
     from the server when a wallet is connected and from this browser's own
     rows when one is not; either way it is look.ts that decides, never this
     file. */
  const [look, setLook] = useState<BotLook>(NO_LOOK);
  const [earned, setEarned] = useState<LookEarned>(NOTHING_EARNED);
  const [refused, setRefused] = useState<string | null>(null);

  /** true once the server has answered for this spot, so a later store change
   *  cannot quietly put the browser's answer back over the row's */
  const fromServer = useRef(false);

  useEffect(() => {
    let live = true;
    // SUBSCRIBE, do not read once. The store hydrates from localStorage in an
    // effect of its own, and effects run child first, so a single read here
    // can land on the un-hydrated seed and show a robot that is not the
    // player's. Following the store costs one subscription and cannot race.
    const readStore = () => {
      if (!live || fromServer.current) return;
      const st = getGarage();
      setLook(lookOfBay(st, spot));
      setEarned(lookEarnedOf(st, spot));
    };
    readStore();
    const off = subscribeGarage(readStore);
    loadEarnedBots().then((rows) => {
      const row = rows?.find((e) => e.bay === spot);
      if (!live || !row) return;
      // the row wins, whole: it is what the save route checks a claim
      // against, so offering anything else would be offering a face that is
      // about to be refused
      fromServer.current = true;
      setEarned(row.earned);
      setLook(row.look);
    });
    return () => {
      live = false;
      off();
    };
  }, [spot]);

  /** One tap, one face, saved on the press. Nothing waits and nothing is
   *  confirmed: the game asks for no step to wear a face (the joint law). */
  const chooseFace = useCallback(
    (face: FaceId) => {
      const before = look;
      const next = { ...look, face };
      setRefused(null);
      setLook(next);
      try {
        saveLook(spot, next);
      } catch (e) {
        if (!(e instanceof LookRefused)) throw e;
        setLook(before);
        setRefused(e.message);
        return;
      }
      void saveLookToServer(spot, next).then((r) => {
        if (r.ok) {
          setLook(r.view.look);
          return;
        }
        // a wallet that is not connected, and a spot the server has never
        // met, are silent: the robot keeps the face and nothing is said
        if (r.message === null) return;
        setLook(before);
        setRefused(r.message);
      });
    },
    [look, spot],
  );

  const finish = useCallback((final: BotName) => {
    writeMet();
    setSaid(final);
    setPicking(false);
  }, []);

  const shown = said ?? name;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MOTION }} />
      <div
        role="note"
        aria-label={t.meet.title}
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 18,
          padding: 18,
          marginBottom: 14,
          borderRadius: R.card,
          border: `1px solid ${M.accent}`,
          background: `linear-gradient(180deg, ${M.surface}, ${M.surface2})`,
          color: M.text,
          fontFamily: FONT_BODY,
        }}
      >
        <span
          className="botsMeetWake"
          aria-hidden
          style={{
            width: 116,
            height: 116,
            flex: "0 0 auto",
            borderRadius: 20,
            border: `1px solid ${M.border}`,
            background: `radial-gradient(60% 55% at 50% 62%, ${K.wall}, ${K.floor})`,
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
          }}
        >
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture} alt="" style={{ maxWidth: 100, maxHeight: 100, objectFit: "contain" }} />
          ) : null}
        </span>

        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          {said ? (
            <>
              <div style={{ fontFamily: FONT_TOY, fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
                {fill(t.meet.hello, { name: nameText(said) })}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.45, color: M.lore, marginTop: 6 }}>
                {fill(t.meet.yours, { n: spot })}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: FONT_TOY, fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{t.meet.title}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.45, color: M.lore, marginTop: 6 }}>{t.meet.woke}</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginTop: 8 }}>
                {fill(t.meet.called, { name: nameText(shown) })}
              </div>
            </>
          )}

          {/* THE ONE TAP THAT MAKES IT THEIRS. It sits under the greeting and
              above the two buttons, so the very first thing a new player can
              do to their robot is give it a face. It stays on the card after
              the greeting has been said, because a player who pressed "I like
              that name" in half a second should still find the row there. */}
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 6px", fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: M.muted }}>
              {t.look.meet}
            </p>
            <LookPicker
              faceOnly
              look={look}
              earned={earned}
              colours={[]}
              onChange={(c) => {
                if (c.face) chooseFace(c.face);
              }}
            />
            {refused ? (
              <p role="status" style={{ margin: "4px 0 0", fontFamily: FONT_BODY, fontSize: 11.5, color: M.warn, lineHeight: 1.45 }}>
                {refused}
              </p>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: "0 0 auto" }}>
          {said ? (
            <Button variant="primary" onClick={onDone} style={{ minWidth: 120 }}>
              {t.proud.thanks}
            </Button>
          ) : (
            <>
              <Button variant="primary" onClick={() => finish(name)} style={{ minWidth: 150 }}>
                {t.meet.keep}
              </Button>
              <button
                type="button"
                className={uiCss.press}
                onClick={() => {
                  setDraft(name);
                  setPicking(true);
                }}
                style={{
                  minHeight: TAP,
                  padding: "0 16px",
                  borderRadius: R.inner,
                  border: `1px solid ${M.border}`,
                  background: M.surface2,
                  color: M.text,
                  fontFamily: FONT_BODY,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t.meet.rename}
              </button>
            </>
          )}
        </div>
      </div>

      {picking ? (
        <Sheet
          title={t.build.name}
          onClose={() => setPicking(false)}
          /* Done lives in the header, where it is on screen from the first
             frame. Under sixty-four word chips it was a long scroll away. */
          action={
            <Button
              variant="primary"
              onClick={() => {
                onRename(draft);
                finish(draft);
              }}
            >
              {t.ui.done}
            </Button>
          }
        >
          <NamePicker name={draft} onChange={setDraft} />
        </Sheet>
      ) : null}
    </>
  );
}
