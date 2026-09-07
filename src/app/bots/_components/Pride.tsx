"use client";

/**
 * THE PROUD MOMENTS (Mike, 2026-09-05: can a player "feel ownership over how
 * cute it is").
 *
 * A player owns a robot when the robot does something and the game NOTICES.
 * Three things are worth noticing, and the game had a word for none of them:
 * the first fight it won, the first time all four body parts came out the
 * same colour, and the first 4 star part it ever wore. Each one gets one
 * warm sentence that names the robot and says what the ROBOT did, never
 * what the player did, and each one is said once and then never again.
 *
 * It is the coach law again, three ways:
 *  - never blocks, never scolds, sits in the page flow;
 *  - one tap ends it, and the tap says "Thanks", not "Skip", because a
 *    proud moment is not a lesson you are getting out of;
 *  - remembered per moment in localStorage (bots.proud.<key>), so adding a
 *    fourth moment later cannot un-remember the first three;
 *  - the skip state is read AFTER mount, so it never flashes on a player
 *    who already saw it.
 *
 * EVERY MOMENT IS READ OFF THE SAME STATE THE SCREEN RENDERS WITH. There is
 * no second source of truth and no timer, so a moment cannot fire for a win
 * that did not happen.
 *
 * TWO OF THE THREE NOW HAND SOMETHING OVER (2026-09-05). A robot wearing four
 * parts in one colour has earned the Wink face, and one wearing a 4 star part
 * has earned the Stars face (src/lib/bots/look.ts faceAllowed). Those were the
 * two things this card was already noticing, so the moment that says what the
 * robot did now says what it may WEAR, and the button goes straight to the
 * spot where it is put on. A thing you unlocked and were never told about is a
 * thing you did not unlock.
 *
 * THE TWO LINES ASK look.ts, THEY DO NOT RESTATE IT. faceAllowed() decides, so
 * a face whose rule moves takes this card with it and there is no second
 * answer to "have I earned the Wink" living in a garage component.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FIGHTS,
  engineBuild,
  nameText,
  type Build,
  type OwnedPart,
} from "@/lib/bots/fixtures";
import { earnedOfBuild, bayOfPart, isHydratedState, lookOfBay, type GarageState } from "@/lib/bots/garage-state";
import { faceAllowed, NO_MARKS } from "@/lib/bots/look";
import { equipmentPaints } from "@/lib/bots/equipment";
import { ToyDisplay } from "./ToyDisplay";
import { rigLookOf } from "../_view/look-view";
import type { BotLook as RigLook } from "../_view/look";
import { STRINGS, fill } from "@/lib/bots/strings";
import { uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_TOY, M, R, TAP } from "../_ui/tokens";

const t = STRINGS.en;
const KEY = "bots.proud.";

interface Moment {
  key: string;
  bay: number;
  line: string;
  action?: { label: string; href: string };
}

function readSeen(key: string): boolean {
  try {
    return localStorage.getItem(KEY + key) === "1";
  } catch {
    return false;
  }
}

function writeSeen(key: string): void {
  try {
    localStorage.setItem(KEY + key, "1");
  } catch {
    /* storage blocked: the moment lasts for this page */
  }
}

/** The spot whose robot did the thing, so every line can name a robot. */
function nameOfBay(st: GarageState, bay: number): string | null {
  const b = st.builds[bay];
  return b ? nameText(b.name) : null;
}

/** The first fight this garage won, for the share button. */
function firstWonFight(st: GarageState): { bay: number; id: string } | null {
  for (const bay of Object.keys(st.builds).map(Number).sort((a, b) => a - b)) {
    for (const f of FIGHTS[bay] ?? []) if (f.result === "win") return { bay, id: f.id };
  }
  return null;
}

/** A saved robot whose four body parts all came out the same colour. */
function matchedBay(st: GarageState): { bay: number; color: string } | null {
  for (const bay of Object.keys(st.builds).map(Number).sort((a, b) => a - b)) {
    const build = st.builds[bay];
    const earned = earnedOfBuild(build, st.parts, st.bays[bay], st.level);
    const first = earned.paints[0];
    if (earned.colourMatch && first) return { bay, color: t.paintName[first] };
  }
  return null;
}

/** The first 4 star part in this garage, on a robot or on the shelf beside it. */
function bestPart(st: GarageState): OwnedPart | null {
  return st.parts.find((p) => p.tier === 4) ?? null;
}

/** Where a face is put on: the build screen for that spot. */
const buildHref = (bay: number): string => `/bots/garage/build?bay=${bay}`;

/** Has this spot's robot earned that face. look.ts answers; nothing here
 *  restates the rule, so a rule that moves moves this line with it. */
function faceOpen(st: GarageState, bay: number, face: "wink" | "stars"): boolean {
  const build = st.builds[bay];
  if (!build) return false;
  return faceAllowed(face, earnedOfBuild(build, st.parts, st.bays[bay], st.level));
}

/**
 * `demo` says whether these builds came out of the demo garage. It gates ONE
 * thing: the "watch it" button on the first win. The fight rows behind that
 * button are fixtures, and a signed in player's wins are real rows whose
 * fight codes are nothing like them, so on the real garage the proud line is
 * still said (the win is the server's) and the button that would have opened
 * somebody else's made up fight is left off.
 */
function momentsOf(st: GarageState, demo: boolean): Moment[] {
  const out: Moment[] = [];

  const won = demo ? firstWonFight(st) : null;
  const wins = Object.values(st.bays).reduce((n, b) => n + b.wins, 0);
  if (wins > 0) {
    const bay = won?.bay ?? Number(Object.keys(st.bays).find((b) => st.bays[Number(b)].wins > 0) ?? 1);
    const name = nameOfBay(st, bay);
    if (name) {
      out.push({
        key: "firstWin",
        bay,
        line: fill(t.proud.firstWin, { name }),
        action: won ? { label: t.proud.firstWinAction, href: `/bots/fight/${won.id}` } : undefined,
      });
    }
  }

  const matched = matchedBay(st);
  if (matched) {
    const name = nameOfBay(st, matched.bay);
    // the line promises the Wink, so it is only said where the Wink is really
    // there to be worn: look.ts decides, this file only asks
    if (name && faceOpen(st, matched.bay, "wink")) {
      out.push({
        key: "firstMatch",
        bay: matched.bay,
        line: fill(t.proud.firstMatch, { name, color: matched.color }),
        action: { label: t.proud.faceAction, href: buildHref(matched.bay) },
      });
    }
  }

  const best = bestPart(st);
  if (best) {
    const bay = bayOfPart(st, best.uid);
    const name = bay ? nameOfBay(st, bay) : null;
    if (name && bay) {
      out.push({
        key: "firstBest",
        bay,
        line: fill(t.proud.firstBest, { name }),
        // the 4 star part has to be ON the robot for the Stars face to be
        // open, and bestPart finds one on the shelf too, so the button only
        // appears where there is really something to put on
        action: faceOpen(st, bay, "stars") ? { label: t.proud.faceAction, href: buildHref(bay) } : undefined,
      });
    }
  }

  return out;
}

/** One warm line in the garage: the first proud moment this browser has not seen. */
export function PrideNote({ state, demo = true, lookForBay }: {
  state: GarageState;
  demo?: boolean;
  /** The garage may provide its exact server-backed marks and chosen look. */
  lookForBay?: (bay: number, build: Build) => RigLook;
}) {
  const [seen, setSeen] = useState<Record<string, boolean> | null>(null);
  const moments = isHydratedState(state) ? momentsOf(state, demo) : [];

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const m of momentsOf(state, demo)) next[m.key] = readSeen(m.key);
    setSeen(next);
    // the moment list is derived, so the effect keys on the state it derives from
  }, [state, demo]);

  if (seen === null) return null;
  const moment = moments.find((m) => !seen[m.key]);
  if (!moment) return null;
  const build = state.builds[moment.bay];
  const paints = build ? equipmentPaints(build, state.parts) : null;
  const look = build && paints ? lookForBay?.(moment.bay, build) ?? rigLookOf({
    paints, look: lookOfBay(state, moment.bay), marks: NO_MARKS, wins: 0,
  }, paints.torso ?? paints.head ?? "cream") : undefined;

  return (
    <div
      role="note"
      aria-label={moment.line}
      className={uiCss.popover}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
        marginTop: 16,
        padding: "14px 18px 14px 14px",
        borderRadius: R.card,
        border: `1px solid ${M.border}`,
        background: M.surface,
        color: M.text,
        fontFamily: FONT_BODY,
      }}
    >
      {build ? <div style={{ width: 72, height: 82, flex: "0 0 72px", borderRadius: 12, overflow: "hidden" }}>
        <ToyDisplay build={engineBuild(build, state.parts)} look={look} mode="static" ariaLabel={nameText(build.name)} />
      </div> : null}
      <div style={{ flex: "1 1 220px", minWidth: 0, fontFamily: FONT_TOY, fontSize: 18, fontWeight: 700, lineHeight: 1.35 }}>
        {moment.line}
      </div>
      <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
        {moment.action ? (
          <Link
            href={moment.action.href}
            className={uiCss.press}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: TAP,
              padding: "0 16px",
              borderRadius: R.inner,
              border: `1px solid ${M.good}`,
              background: "transparent",
              color: M.text,
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {moment.action.label}
          </Link>
        ) : null}
        <button
          type="button"
          className={uiCss.press}
          onClick={() => {
            writeSeen(moment.key);
            setSeen((prev) => ({ ...(prev ?? {}), [moment.key]: true }));
          }}
          style={{
            minHeight: TAP,
            minWidth: TAP,
            padding: "0 14px",
            borderRadius: R.inner,
            border: `1px solid ${M.border}`,
            background: M.surface2,
            color: M.muted,
            fontFamily: FONT_BODY,
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t.proud.thanks}
        </button>
      </div>
    </div>
  );
}
