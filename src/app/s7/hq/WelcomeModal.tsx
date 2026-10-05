"use client";
/**
 * S7 IRON SIEGE, the FIRST-ARRIVAL welcome (the /s7 homescreen only).
 *
 * Round-2 review (Mike, 2026-07-25): EXACTLY TWO DOORS. The primary CTA is
 * "Connect a wallet to play" (/s7/join); the only other way out is "Look
 * around first" (dismiss). The play-the-arcade-free primary is retired from
 * THIS pitch by explicit reversal (guest play stays available everywhere else
 * in the app). Dismissal by ANY path (either button, Escape, or the backdrop)
 * is remembered forever in localStorage under WELCOME_STORAGE_KEY, so it
 * never nags twice, AND counts as one FTUE "look around" step
 * (markFtueHotspot("welcome")): the quest log opens already 1 of 3 done, the
 * endowed-progress pattern. Storage being blocked must never break the HQ: a
 * blocked write just means the modal can appear again, the safe failure.
 *
 * It MUST NOT trap a guest: Escape closes, the backdrop closes, and the
 * dismiss button is a peer of the CTA, not a footnote. Focus is trapped WHILE
 * OPEN (a11y), the primary action takes focus on open, and the previously
 * focused element gets it back on close.
 *
 * ART SLOT: the portrait column composites the commander cutout at
 * WELCOME_PORTRAIT_SRC (welcome-hero.webp, the knee-up Wrench) over a
 * darkened slice of the camp painting (the same round-2 note: the flat panel
 * read cheap). If the cutout ever 404s the column is not rendered at all, so
 * a missing file reads as a design choice and never as a hole.
 *
 * All copy comes from the s7 dict. No em-dashes, never "win $X".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_THEME } from "@/lib/s7/theme";
import { markFtueHotspot } from "@/lib/s7/ftue";
import type { S7Dict } from "@/lib/s7/strings";
import { track } from "@/lib/s7/track";

export const WELCOME_STORAGE_KEY = "s7_welcome_seen" // was s7_welcome_seen: every S7 veteran had the S7 welcome suppressed;

/** Drop a background-removed commander cutout here and the portrait column
 * lights up on its own. Nothing else needs to change. */
export const WELCOME_PORTRAIT_SRC = "/s7-art/pilot/welcome-hero.webp";

/** True when this browser has never dismissed the welcome. Junk tolerant. */
export function welcomeUnseen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !localStorage.getItem(WELCOME_STORAGE_KEY);
  } catch {
    return false; // storage blocked: do not pop a modal we cannot remember
  }
}

function rememberSeen() {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, "1");
  } catch {
    // storage blocked: the guest simply sees it again next visit
  }
}

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function WelcomeModal({ dict, onClose }: { dict: S7Dict; onClose: () => void }) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  const [portraitOk, setPortraitOk] = useState(true);
  const portraitRef = useRef<HTMLImageElement | null>(null);

  // EVERY way out runs through here: remember the dismissal, bank the endowed
  // FTUE step (the quest log opens 1 of 3 done), beacon, close, then route if
  // the way out was a destination button.
  const dismiss = useCallback(
    (ref: string, go?: string) => {
      rememberSeen();
      markFtueHotspot("welcome");
      track("cta_click", { ref });
      onClose();
      if (go) router.push(go);
    },
    [onClose, router],
  );

  // Beacon: the welcome actually rendered for a guest.
  useEffect(() => {
    track("welcome_view");
  }, []);

  // The 404 that resolves before hydration never fires onError (S3-proven).
  useEffect(() => {
    const img = portraitRef.current;
    if (img && img.complete && img.naturalWidth === 0) setPortraitOk(false);
  }, []);

  // Escape closes; Tab cycles inside the card; focus returns where it was.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ctaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss("welcome-escape");
        return;
      }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [dismiss]);

  return (
    <div
      className="s7w-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={dict.welcome.aria}
      onClick={() => dismiss("welcome-scrim")}
    >
      <div className="s7w-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        {/* PORTRAIT SLOT: renders only when the cutout exists (see the header). */}
        {portraitOk ? (
          <div className="s7w-portrait">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={portraitRef}
              src={WELCOME_PORTRAIT_SRC}
              alt={dict.welcome.portraitAlt}
              onError={() => setPortraitOk(false)}
            />
          </div>
        ) : null}

        <div className="s7w-body">
          <p className="s7w-eyebrow">{DEFAULT_THEME.seasonName}</p>
          <h2 className="s7w-title">{dict.welcome.title}</h2>
          <p className="s7w-text">{dict.welcome.body}</p>

          <div className="s7w-actions">
            {/* TWO DOORS ONLY (round-2 review): connect to play, or look
                around. The arcade stays free elsewhere; this pitch does not
                sell it. */}
            <button
              ref={ctaRef}
              className="s7w-cta"
              data-testid="welcome-connect"
              onClick={() => dismiss("welcome-enlist", "/s7/join")}
            >
              {dict.welcome.connectPlayCta}
            </button>
            <button
              className="s7w-ghost"
              data-testid="welcome-dismiss"
              onClick={() => dismiss("welcome-dismiss")}
            >
              {dict.welcome.dismissCta}
            </button>
          </div>

          <p className="s7w-note">{dict.welcome.note}</p>
        </div>
      </div>
    </div>
  );
}

export const WELCOME_CSS = `
.s7w-scrim {
  position: fixed; inset: 0;
  z-index: 1200;
  background: rgba(6,8,10,0.78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  padding: 18px;
}
@media (prefers-reduced-motion: no-preference) {
  .s7w-scrim { animation: s7w-fade 220ms ease-out both; }
  .s7w-card { animation: s7w-rise 260ms cubic-bezier(0.2,0.7,0.3,1) both; }
}
@keyframes s7w-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes s7w-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.s7w-card {
  display: flex;
  width: min(96vw, 560px);
  max-height: 88dvh;
  overflow-y: auto;
  border-radius: 16px;
  border: 1px solid #2c343d;
  background:
    radial-gradient(120% 90% at 0% 0%, rgba(224,102,46,0.10) 0%, rgba(224,102,46,0) 55%),
    linear-gradient(180deg, rgba(24,29,35,0.99), rgba(13,16,20,0.99));
  box-shadow: 0 30px 80px rgba(0,0,0,0.62);
}
/* The commander cutout column, composited over a darkened slice of the camp
   painting (round-2 review: the flat panel read cheap). Only in the tree when
   the cutout resolves; the painting is pure CSS background, so IT failing is
   just a dark column, never a broken image. */
.s7w-portrait {
  position: relative;
  flex: 0 0 186px;
  display: none;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  border-right: 1px solid #2c343d;
  background:
    linear-gradient(180deg, rgba(8,10,13,0.62) 0%, rgba(8,10,13,0.30) 42%, rgba(8,10,13,0.72) 100%),
    url("/s7-art/hq/camp-portrait.webp") 50% 30% / cover no-repeat #10141a;
}
/* Warm firelight at her boots + a floor scrim, so she stands IN the camp. */
.s7w-portrait::after {
  content: "";
  position: absolute; inset: 0;
  pointer-events: none;
  background:
    radial-gradient(70% 26% at 50% 100%, rgba(224,102,46,0.28) 0%, rgba(224,102,46,0) 70%),
    linear-gradient(180deg, rgba(0,0,0,0) 62%, rgba(6,8,10,0.55) 100%);
}
.s7w-portrait img {
  position: relative;
  z-index: 1;
  width: auto; height: 94%;
  max-width: 88%;
  object-fit: contain; object-position: bottom center;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,0.6));
}
@media (min-width: 560px) { .s7w-portrait { display: flex; } }
.s7w-body { flex: 1 1 auto; padding: 26px 26px 22px; }
.s7w-eyebrow {
  margin: 0 0 10px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10.5px; font-weight: 800;
  letter-spacing: 0.3em; text-transform: uppercase;
  color: #e0662e;
}
.s7w-title { margin: 0 0 10px; font-size: clamp(21px, 4.4vw, 26px); font-weight: 800; color: #e9edf1; }
.s7w-text { margin: 0 0 18px; font-size: 14px; line-height: 1.65; color: #cdd4dc; }
/* TWO DOORS, stacked: one loud primary, one quiet peer under it. */
.s7w-actions { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
.s7w-cta {
  padding: 15px 18px;
  border: 0; border-radius: 10px;
  background: linear-gradient(180deg, #e97a45, #d0561f);
  color: #17100b;
  font-size: 14px; font-weight: 800; letter-spacing: 0.07em;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(224,102,46,0.28);
}
.s7w-cta:hover { filter: brightness(1.06); }
.s7w-cta:active { transform: translateY(1px); }
.s7w-ghost {
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid #9aa7b444;
  background: transparent;
  color: #aab4bd;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
}
.s7w-ghost:hover { color: #e9edf1; border-color: #9aa7b488; }
.s7w-cta:focus-visible, .s7w-ghost:focus-visible { outline: 2px solid #9aa7b4; outline-offset: 2px; }
.s7w-note { margin: 16px 0 0; font-size: 11.5px; line-height: 1.55; color: #87919b; }
`;
