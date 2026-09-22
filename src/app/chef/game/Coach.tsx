"use client";

/**
 * THE FIRST SIXTY SECONDS (M8).
 *
 * Until now the game booted straight into a running restaurant with no
 * explanation of any kind. That is a defensible choice for something you sit
 * down to; it is a bad one for a link posted in a Discord channel, which is
 * how most people will arrive, usually on a phone, usually with about ten
 * seconds of patience.
 *
 * Design rules, all of them load-bearing:
 *
 *  - EVERY STEP ADVANCES ON A REAL EVENT, never a timer. The player is not
 *    watching a tutorial, they are running their restaurant while somebody
 *    points at things. Progress is read off the same 600ms panel snapshot the
 *    rest of the chrome uses, so there is no second source of truth.
 *  - NOTHING IS BLOCKED. No modal, no dimming, no forced order. Anyone who
 *    already knows the game can ignore this entirely and it will quietly tick
 *    itself off as they play.
 *  - IT IS ALWAYS SKIPPABLE, in one tap, with no "are you sure".
 *  - NO STEP EVER SCOLDS. If the thing it is pointing at has not happened yet
 *    (no dirty table on the floor), the card just waits, saying what to watch
 *    for. The player is never behind.
 *
 * State is one small integer in DkSave, so a player who starts on a phone and
 * comes back on a laptop is not taught the same lesson twice.
 */

import type { PanelSnapshot } from "./DialsPanel";

import { FONT } from "./_ui/tokens";

/**
 * 0 = not started, 1..5 = the step showing now, 6 = done and never again.
 *
 * Was 5 (four steps). M10 adds a fifth, because the coach was 100% restaurant
 * and 0% finance: a player could finish the whole thing, run a kitchen, and
 * never learn the game was connected to anything. The single financial clause
 * in the old version only rendered when they had under 25 coins.
 */
export const INTRO_DONE = 6;

export interface IntroStep {
  title: string;
  body: string;
  /** what the player has to actually do, in their own room */
  done: (s: PanelSnapshot) => boolean;
  /** shown instead of the body while the world has not offered the chance yet */
  waiting?: (s: PanelSnapshot) => string | null;
}

export const INTRO_STEPS: IntroStep[] = [
  {
    title: "This is your place",
    body: "It runs all day, even while you are away. Someone is on their way in now.",
    done: (s) => s.arrived >= 1,
  },
  {
    title: "Tap your chef",
    body: "A word from you and the whole crew picks up the pace. Try it.",
    done: (s) => s.hustles >= 1,
  },
  {
    title: "Clear a table",
    body: "Tap a table with dishes still on it and it is clean. Guests notice.",
    done: (s) => s.busedByPlayer >= 1,
    waiting: (s) =>
      s.dirtyTables > 0 ? null : "Nothing to clear yet. It will happen after someone eats.",
  },
  {
    title: "Buy something, then put it down",
    body: "Open the shop, buy the doormat, then tap Arrange and choose a spot for it.",
    done: (s) => s.placements >= 1,
    waiting: (s) =>
      s.coins >= 25 ? null : `Your money is earning. ${25 - s.coins} more coins buys the doormat.`,
  },
  {
    /**
     * The one step that says what the game is actually connected to.
     *
     * Deliberately LAST: somebody who has just placed a doormat has already
     * decided they like this, and that is when it is worth mentioning. Leading
     * with it would be leading with the part they did not come for.
     *
     * It advances on OPENING the card, not on spending anything. Nobody is
     * ever pushed toward money to finish an intro.
     */
    title: "Where the coins come from",
    body: "A real market pays for all this. Open the card at the top left to see it, and to put money to work if you ever want to.",
    done: (s) => s.lpCardOpened,
  },
];

export function Coach({
  step,
  snap,
  narrow,
  onSkip,
}: {
  step: number;
  snap: PanelSnapshot;
  narrow: boolean;
  onSkip: () => void;
}) {
  const s = INTRO_STEPS[step - 1];
  if (!s) return null;
  const waiting = s.waiting?.(snap) ?? null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        // clear of the panel bars on a phone, clear of nothing much on desktop
        // clears the dock, which is the same height on every device now
        bottom: 112,
        width: narrow ? "calc(100% - 24px)" : 380,
        maxWidth: "94vw",
        background: "rgba(27,19,16,0.96)",
        border: "1px solid #e8a13d",
        borderRadius: 14,
        boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
        color: "#f3e9d2",
        fontFamily: FONT,
        fontSize: 13,
        padding: "11px 13px",
        zIndex: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 800, color: "#e8a13d" }}>{s.title}</span>
        <span style={{ opacity: 0.5, fontSize: 11 }}>
          {step} of {INTRO_STEPS.length}
        </span>
      </div>
      <div style={{ marginTop: 4, lineHeight: 1.45, opacity: waiting ? 0.72 : 0.9 }}>
        {waiting ?? s.body}
      </div>
      <button
        onClick={onSkip}
        style={{
          marginTop: 8,
          padding: "6px 12px",
          borderRadius: 999,
          border: "1px solid #4a3626",
          background: "#241a14",
          color: "#c9b79a",
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          minHeight: narrow ? 40 : undefined,
        }}
      >
        Skip, I know my way around
      </button>
    </div>
  );
}
