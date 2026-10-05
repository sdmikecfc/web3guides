"use client";
/**
 * S5 HOW TO PLAY, the interactive walkthrough (round-2 onboarding, Mike
 * 2026-07-25): a 6-step progress rail (Welcome -> Get armed -> Hold -> Play ->
 * Raid -> Get paid). One focused card per step: a visual reused from the
 * existing /s5-art plates, a do-it-now deep link, and a done check ONLY where
 * this browser can honestly know the state:
 *   - Welcome        = a play session exists (localStorage token + /api/s6/me ok)
 *   - Get armed/Hold = heldUsd > 0 from the same me payload
 *   - Play           = the FTUE run flag or any parked guest score
 *                      (lib/s5/ftue helpers, REUSED never forked)
 *   - Get paid       = the ADR-0076 qualifier progress from the me payload
 *   - Raid           = server-side only, so it wears a Daily badge and never
 *                      shows a fake tick
 * Everything fails soft: no session, blocked storage or a dead network just
 * renders every step as to-do; the rail never blocks the page.
 *
 * Copy rules: no em-dashes, never "win $X", strings from the s5 dict only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STRINGS, fill, type S6Dict } from "@/lib/s6/strings";
import type { Locale } from "@/lib/s6/locale";
import {
  GAME_DAILY_POINTS_CAP,
  HOLD_RATE_PER_USD_DAY,
  POINTS_PER_RUN,
  POOL_FULL_USD,
  readSessionToken,
} from "@/lib/s6/games";
import { readFtue, guestHasAnyScore } from "@/lib/s6/ftue";
import { UI } from "../_components/ui";

type CheckKey = "session" | "held" | "played" | "qualified" | "daily";

type StepDef = {
  key: string;
  title: string;
  body: string;
  /** Optional numbered recipe under the body (the fund + buy steps carry one:
   * Mike 2026-07-27, "I see nothing on how to buy"). */
  list?: string[];
  cta: string;
  href: string;
  art: string;
  check: CheckKey;
};

type Progress = {
  session: boolean;
  held: boolean;
  played: boolean;
  qualified: boolean;
};

/** The subset of the /api/s6/me payload this rail reads (junk-tolerant). */
type MeResp = {
  ok?: boolean;
  heldUsd?: number;
  payout?: { qualifier?: { heldDays?: number; needed?: number } };
};

const ZERO: Progress = { session: false, held: false, played: false, qualified: false };

export function Walkthrough({ locale }: { locale: Locale }) {
  // The server page passes the cookie locale, so SSR and hydration agree.
  const dict: S6Dict = STRINGS[locale] ?? STRINGS.en;
  const h = dict.howToPlay;

  const steps: StepDef[] = useMemo(() => {
    const full = `$${POOL_FULL_USD.toLocaleString("en-US")}`;
    const end = dict.common.seasonEnd;
    return [
      // Step art rule (Mike 2026-07-27, after the launch-eve review): the band
      // is ~6:1, so every art file here must be LANDSCAPE (the 163x500
      // welcome cutout rendered as a zoomed jacket). All six now use wide
      // painted scenes that exist on disk, checked by scripts at review time.
      {
        key: "welcome",
        title: h.gs1Title,
        body: h.gs1Body,
        cta: h.gs1Cta,
        href: "/s6/join",
        art: "/s6-art/hq/hangar.webp",
        check: "session",
      },
      {
        key: "armed",
        title: h.gs2Title,
        body: h.gs2Body,
        list: h.gs2List,
        cta: h.gs2Cta,
        href: "/s6/hq#wizard",
        art: "/s6-art/hq/camp-portrait.webp",
        check: "held",
      },
      {
        key: "hold",
        title: h.gs3Title,
        body: fill(h.gs3Body, { rate: HOLD_RATE_PER_USD_DAY }),
        list: h.gs3List,
        cta: h.gs3Cta,
        href: "/s6",
        art: "/s6-art/front/wash.webp",
        check: "held",
      },
      {
        key: "play",
        title: h.gs4Title,
        body: fill(h.gs4Body, { cap: GAME_DAILY_POINTS_CAP, perRun: POINTS_PER_RUN }),
        cta: h.gs4Cta,
        href: "/s6/play",
        art: "/s6-art/games/ironjaw/card.webp",
        check: "played",
      },
      {
        // THE RAID STEP, not a second copy of the money step. It carried gs6
        // (title, body and cta), so "Get paid" appeared twice and the raid
        // never got explained. Caught when gs6Body gained {full}/{end}: this
        // slot passes no fill(), so the duplicate would have rendered its raw
        // placeholders on the page.
        key: "raid",
        title: h.gs5Title,
        body: h.gs5Body,
        cta: h.gs5Cta,
        href: "/s6",
        art: "/s6-art/games/strain/card.webp",
        check: "daily",
      },
      {
        key: "paid",
        title: h.gs6Title,
        body: fill(h.gs6Body, { full, end }),
        cta: h.gs6Cta,
        href: "/s6/board",
        art: "/s6-art/games/stopclock/card.webp",
        check: "qualified",
      },
    ];
  }, [h, dict]);

  const [progress, setProgress] = useState<Progress>(ZERO);
  const [active, setActive] = useState(0);
  const advanced = useRef(false);

  // Resolve what this browser can honestly know. Local flags first (sync),
  // then the me payload if a play session token is parked in this tab.
  useEffect(() => {
    let cancelled = false;

    let played = false;
    try {
      played = readFtue().run || guestHasAnyScore();
    } catch {
      played = false;
    }
    setProgress((p) => ({ ...p, played }));

    const token = readSessionToken() || null;
    if (!token) return;

    void fetch("/api/s6/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<MeResp>) : null))
      .then((resp) => {
        if (cancelled || !resp?.ok) return;
        const held = (Number(resp.heldUsd) || 0) > 0;
        const q = resp.payout?.qualifier;
        const qualified =
          Number.isFinite(Number(q?.heldDays)) &&
          Number(q?.heldDays) >= Math.max(1, Number(q?.needed) || 3);
        setProgress((p) => ({ ...p, session: true, held, qualified }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const isDone = (check: CheckKey): boolean => {
    switch (check) {
      case "session":
        return progress.session;
      case "held":
        return progress.held;
      case "played":
        return progress.played;
      case "qualified":
        return progress.qualified;
      default:
        return false; // daily: server truth only, never a fake tick
    }
  };

  const doneCount = steps.filter((s) => s.check !== "daily" && isDone(s.check)).length;
  const checkable = steps.filter((s) => s.check !== "daily").length;

  // One-shot: once the state has resolved, land the rail on the first step
  // that still needs doing (forward only, so it feels like saved progress).
  useEffect(() => {
    if (advanced.current || doneCount === 0) return;
    advanced.current = true;
    const first = steps.findIndex((s) => s.check !== "daily" && !isDone(s.check));
    if (first > 0) setActive(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount]);

  const step = steps[Math.max(0, Math.min(steps.length - 1, active))];
  const stepDone = isDone(step.check);
  const badge =
    step.check === "daily"
      ? { word: h.guideDailyBadge, color: UI.warn }
      : stepDone
        ? { word: h.guideDoneBadge, color: UI.good }
        : { word: h.guideTodoBadge, color: UI.steel };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <p style={{ fontSize: 14, color: UI.muted, lineHeight: 1.7, margin: 0, flex: "1 1 260px" }}>
          {h.guideIntro}
        </p>
        <span
          style={{
            fontFamily: UI.mono,
            fontSize: 11.5,
            letterSpacing: "0.08em",
            color: doneCount > 0 ? UI.good : UI.faint,
            border: `1px solid ${doneCount > 0 ? `${UI.good}55` : UI.border}`,
            background: doneCount > 0 ? `${UI.good}14` : "rgba(255,255,255,0.03)",
            borderRadius: 999,
            padding: "4px 10px",
            whiteSpace: "nowrap",
          }}
        >
          {fill(h.guideProgress, { n: doneCount, total: checkable })}
        </span>
      </div>

      {/* ── The rail: 6 tappable chips, horizontal scroll on small screens ── */}
      <div
        role="tablist"
        aria-label={h.guideAria}
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 12,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          maskImage: "linear-gradient(90deg, #000 calc(100% - 20px), transparent)",
          WebkitMaskImage: "linear-gradient(90deg, #000 calc(100% - 20px), transparent)",
        }}
      >
        {steps.map((s, i) => {
          const done = s.check !== "daily" && isDone(s.check);
          const isActive = i === active;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              id={`s5wt-tab-${s.key}`}
              aria-selected={isActive}
              aria-controls="s5wt-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                // Arrow keys move between tabs, the expected tablist idiom.
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = (i + (e.key === "ArrowRight" ? 1 : steps.length - 1)) % steps.length;
                setActive(next);
                document.getElementById(`s5wt-tab-${steps[next].key}`)?.focus();
              }}
              aria-current={isActive ? "step" : undefined}
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontFamily: UI.mono,
                fontSize: 11.5,
                letterSpacing: "0.06em",
                cursor: "pointer",
                color: isActive ? "#0b0d10" : done ? UI.good : UI.muted,
                background: isActive ? UI.ember : done ? `${UI.good}14` : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? UI.ember : done ? `${UI.good}55` : UI.border}`,
                borderRadius: 999,
                padding: "8px 12px",
                whiteSpace: "nowrap",
                fontWeight: isActive ? 700 : 500,
              }}
            >
              <span aria-hidden>{done ? "✓" : i + 1}</span>
              {s.title}
            </button>
          );
        })}
      </div>

      {/* ── The focused card for the active step ── */}
      <div
        id="s5wt-panel"
        role="tabpanel"
        aria-live="polite"
        aria-labelledby={`s5wt-tab-${step.key}`}
        style={{
          background: UI.panel,
          border: `1px solid ${stepDone ? `${UI.good}44` : UI.border}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", height: 150 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={step.art}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.85 }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(11,13,16,0.05) 0%, rgba(11,13,16,0.72) 100%)",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: 14,
              bottom: 10,
              fontFamily: UI.mono,
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: UI.steel,
            }}
          >
            {fill(h.guideStepWord, { n: active + 1, total: steps.length })}
          </span>
          <span
            style={{
              position: "absolute",
              right: 12,
              top: 10,
              fontFamily: UI.mono,
              fontSize: 10.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: badge.color,
              border: `1px solid ${badge.color}66`,
              background: "rgba(11,13,16,0.72)",
              borderRadius: 999,
              padding: "3px 9px",
            }}
          >
            {step.check !== "daily" && stepDone ? "✓ " : ""}
            {badge.word}
          </span>
        </div>

        <div style={{ padding: "16px 18px 18px" }}>
          <h3 style={{ fontSize: 19, fontWeight: 800, color: UI.text, margin: "0 0 8px", lineHeight: 1.25 }}>
            {step.title}
          </h3>
          <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.7, margin: "0 0 14px" }}>
            {step.body}
          </p>
          {step.list && step.list.length ? (
            <ol
              data-testid="step-recipe"
              style={{ margin: "0 0 16px", padding: 0, listStyle: "none", display: "grid", gap: 8 }}
            >
              {step.list.map((line, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span
                    style={{
                      fontFamily: UI.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      color: UI.ember,
                      border: `1px solid ${UI.ember}55`,
                      borderRadius: 999,
                      padding: "1px 8px",
                      flex: "0 0 auto",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13, color: UI.text, lineHeight: 1.6 }}>{line}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <Link
              href={step.href}
              style={{
                display: "inline-block",
                background: UI.ember,
                color: "#0b0d10",
                fontWeight: 800,
                fontSize: 13.5,
                letterSpacing: "0.03em",
                padding: "11px 20px",
                borderRadius: 10,
                textDecoration: "none",
                minHeight: 42,
              }}
            >
              {step.cta} →
            </Link>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => setActive((a) => Math.max(0, a - 1))}
                disabled={active === 0}
                style={{
                  fontFamily: UI.mono,
                  fontSize: 12,
                  color: active === 0 ? UI.faint : UI.muted,
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${UI.border}`,
                  borderRadius: 8,
                  padding: "9px 13px",
                  cursor: active === 0 ? "default" : "pointer",
                }}
              >
                ‹ {h.guidePrev}
              </button>
              <button
                type="button"
                onClick={() => setActive((a) => Math.min(steps.length - 1, a + 1))}
                disabled={active === steps.length - 1}
                style={{
                  fontFamily: UI.mono,
                  fontSize: 12,
                  color: active === steps.length - 1 ? UI.faint : UI.text,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${UI.border}`,
                  borderRadius: 8,
                  padding: "9px 13px",
                  cursor: active === steps.length - 1 ? "default" : "pointer",
                }}
              >
                {h.guideNext} ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
