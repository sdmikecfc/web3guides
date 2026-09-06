"use client";

/**
 * THE COACH (screens doc 7) and THE LOCK CHIP (screens doc 4.1, 7).
 *
 * The coach is the Domain Kitchen coach law (src/app/chef/game/Coach.tsx)
 * restyled to the money layer:
 *  - EVERY STEP ADVANCES ON A REAL EVENT, never a timer. A step carries
 *    done(state) and is read off the same store snapshot the screen renders
 *    with, so there is no second source of truth.
 *  - NOTHING IS BLOCKED. No modal, no scrim, no forced order; the card sits
 *    in the page flow and the screen works with it ignored.
 *  - ALWAYS SKIPPABLE in one tap, with no "are you sure". A skipped step is
 *    remembered per step key in localStorage (bots.coach.<id>) so a lesson is
 *    never taught twice on this browser.
 *  - NO STEP EVER SCOLDS. The lines say what the next thing is.
 *
 * The lock chip is the one way a locked thing is shown: the art stays
 * bright, only the button becomes the plain reason and a door to the
 * strategy page (never grey out the cute). The battles page imports it and
 * reads the reason from lockReason() in src/lib/bots/strings.ts. Nothing a
 * new player needs is behind one: the first fight, against Scrapper, is
 * never locked.
 */

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Dot, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, M, R, TAP } from "../_ui/tokens";
import { emptySockets } from "@/lib/bots/fixtures";
import { firstEmptyBay, isHydratedState, type GarageState } from "@/lib/bots/garage-state";
import { STRINGS, fill } from "@/lib/bots/strings";

const t = STRINGS.en;

export interface CoachStep<S> {
  /** the storage key of a skip, so a step can be added without resetting others */
  key: string;
  /** the one line, plain words */
  body: (s: S) => string;
  /** an optional second, quieter line */
  sub?: (s: S) => string | null;
  /** the real event: true once the thing happened */
  done: (s: S) => boolean;
  /** the door the line points at */
  action?: (s: S) => { label: string; href: string } | null;
}

const KEY = (id: string): string => `bots.coach.${id}`;

function readSkipped(id: string): string[] {
  try {
    const raw = localStorage.getItem(KEY(id));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function writeSkipped(id: string, keys: string[]): void {
  try {
    localStorage.setItem(KEY(id), JSON.stringify(keys));
  } catch {
    /* storage blocked: the skip lasts for this page */
  }
}

/**
 * The generic card. Shows the FIRST step that is neither done nor skipped;
 * shows nothing at all when every step is done or skipped, or before the
 * store is hydrated (a coach that flashes on the server seed teaches the
 * wrong lesson).
 */
export function Coach<S>({
  id,
  steps,
  state,
  ready = true,
  style,
}: {
  id: string;
  steps: readonly CoachStep<S>[];
  state: S;
  ready?: boolean;
  /** applied only when the card renders, so an empty coach costs no space */
  style?: CSSProperties;
}) {
  // skips are read after mount so the server and the first client render agree
  const [skipped, setSkipped] = useState<string[] | null>(null);
  useEffect(() => {
    setSkipped(readSkipped(id));
  }, [id]);

  const skip = useCallback(
    (key: string) => {
      setSkipped((prev) => {
        const next = [...(prev ?? []), key];
        writeSkipped(id, next);
        return next;
      });
    },
    [id],
  );

  if (!ready || skipped === null) return null;
  const idx = steps.findIndex((s) => !skipped.includes(s.key) && !s.done(state));
  if (idx < 0) return null;
  const step = steps[idx];
  const action = step.action?.(state) ?? null;
  const sub = step.sub?.(state) ?? null;

  return (
    <div
      role="note"
      aria-label={t.coach.aria}
      className={uiCss.popover}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px 10px 16px",
        borderRadius: R.card,
        border: `1px solid ${M.accent}`,
        background: M.surface,
        color: M.text,
        fontFamily: FONT_BODY,
        ...style,
      }}
    >
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 14.5, lineHeight: 1.4, fontWeight: 600 }}>{step.body(state)}</div>
        {sub ? <div style={{ fontSize: 12.5, lineHeight: 1.4, color: M.lore, marginTop: 2 }}>{sub}</div> : null}
      </div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted, letterSpacing: "0.08em" }}>
        {fill(t.coach.stepOf, { n: idx + 1, count: steps.length })}
      </span>
      <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
        {action ? (
          <Link
            href={action.href}
            className={uiCss.press}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: TAP,
              padding: "0 16px",
              borderRadius: R.inner,
              border: `1px solid ${M.accent}`,
              background: M.accent,
              color: "#ffffff",
              fontFamily: FONT_BODY,
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {action.label}
          </Link>
        ) : null}
        <button
          type="button"
          className={uiCss.press}
          onClick={() => skip(step.key)}
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
          {t.coach.skip}
        </button>
      </div>
    </div>
  );
}

/* ── the garage's two first-visit lines (screens doc 7, rows 0:20 and 0:30) ── */

/** the bay the first bot is being built in: an unfinished one, else the
 * first empty one, else bay 1 */
function firstBotBay(st: GarageState): number {
  for (const b of Object.values(st.builds)) if (emptySockets(b).length > 0) return b.bay;
  return firstEmptyBay(st) ?? 1;
}

/** Fights this garage has had, wins and losses across every bay. It is the
 * one thing that says a player has actually PLAYED. */
function fightsSoFar(st: GarageState): number {
  return Object.values(st.bays).reduce((n, b) => n + b.wins + b.losses, 0);
}

const GARAGE_STEPS: readonly CoachStep<GarageState>[] = [
  {
    key: "firstBot",
    body: (st) => fill(t.coach.firstBot, { coins: st.coins }),
    // the real event: a bot with every socket filled stands in a bay
    done: (st) => Object.values(st.builds).some((b) => emptySockets(b).length === 0),
    action: (st) => ({ label: t.coach.firstBotAction, href: `/bots/garage/build?bay=${firstBotBay(st)}` }),
  },
  {
    key: "strategy",
    body: () => t.coach.strategy,
    sub: () => t.coach.strategyBody,
    /**
     * NOT BEFORE THE FIRST FIGHT (Mike, 2026-09-04: three steps to play).
     * A strategy is how a player starts EARNING later, not how they start
     * playing, and this card used to be the second thing a brand new player
     * was shown: it put a link off to another site between them and their
     * first fight. So it stays hidden until the garage has fought at least
     * once, and then it is offered to somebody who already knows what a
     * fight is and has a reason to want more of them.
     *
     * `done` is doing two jobs here on purpose, because the coach only knows
     * done and not-done: the step is finished when a crew walks in (the
     * tracker saw a live strategy), and it is ALSO treated as finished while
     * the player has never fought, which is what keeps it off the path.
     */
    done: (st) => st.crew.length > 0 || fightsSoFar(st) === 0,
    action: () => ({ label: t.coach.strategyAction, href: "/bots/strategy" }),
  },
];

/** One JSX line in the garage: reads the same store snapshot the screen does. */
export function GarageCoach({ state }: { state: GarageState }) {
  return <Coach id="garage" steps={GARAGE_STEPS} state={state} ready={isHydratedState(state)} style={{ marginTop: 12 }} />;
}

/* ── the lock chip ──────────────────────────────────────────────────────── */

/**
 * Replaces a [Fight] or [Challenge] button on a locked card. 44 px, a
 * hairline, a muted dot, the plain reason, and it is a link to the strategy
 * page. The card's art around it stays exactly as bright as an open one.
 */
export function LockChip({
  reason,
  href = "/bots/strategy",
  full,
  children,
}: {
  /** from lockReason(); the chip renders nothing for null, so a caller can
   * pass the helper's result straight in */
  reason: string | null;
  href?: string;
  full?: boolean;
  /** an optional trailing slot (a small icon); text stays the reason */
  children?: ReactNode;
}) {
  if (!reason) return null;
  return (
    <Link
      href={href}
      className={uiCss.press}
      aria-label={`${reason}. ${t.lock.open}.`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: TAP,
        width: full ? "100%" : undefined,
        padding: "0 14px",
        borderRadius: R.inner,
        border: `1px solid ${M.border}`,
        background: "transparent",
        color: M.lore,
        fontFamily: FONT_BODY,
        fontSize: 13,
        fontWeight: 700,
        // the reason WRAPS. It used to be nowrap, so a reason long enough to
        // be a reason ran off the side of a phone.
        whiteSpace: "normal",
        lineHeight: 1.35,
        textAlign: "left",
        textDecoration: "none",
      }}
    >
      <Dot color={M.muted} />
      <span>{reason}</span>
      <span style={{ fontFamily: FONT_DISPLAY, fontSize: 11, color: M.muted, letterSpacing: "0.08em" }}>{t.lock.open}</span>
      {children}
    </Link>
  );
}
