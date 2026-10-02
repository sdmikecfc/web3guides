"use client";

/**
 * IRON SIEGE first-run intro: the S4 MapIntro pattern (ADR-0018) ported to the
 * world map, with one structural change — THE CAMERA IS A CHARACTER. Each beat
 * reports itself upward through `onBeat`, and WorldMap answers with a flyTo,
 * so the board itself walks the new commander from their base, to today's
 * fort, across the whole front, past the arcade and home again. This overlay
 * never touches the camera directly: it renders OUTSIDE WorldViewport (fixed,
 * above the touch-action:none subtree) and knows nothing about pan/zoom.
 *
 * Hosted by Forge (the default commander every guest meets first) and Compass
 * (the recon scout, the one who has already been where you are going). Their
 * portraits are the shipped commander cutouts — zero new art.
 *
 * Behavior, matching the proven S4 contract: auto-opens once per browser
 * (localStorage `s5_map_intro_v1`; private mode = never auto-open), tap/click
 * or Space/Enter advances, Esc skips, the Skip pill is visible from beat 1,
 * dots show progress. Replay comes from the parent via `openSignal` (the
 * "New here?" popup increments it) and does NOT clear the seen flag.
 *
 * Copy lives in the dict (en/ko/zh) — S4's was hardcoded English; this map
 * already swaps its dict client-side, so the intro follows the same rule as
 * every other string on the board. One sentence per beat: it is read on a
 * phone between taps.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { S5Dict } from "@/lib/s5/strings";

export const INTRO_SEEN_KEY = "s5_map_intro_v1";

/** True when the intro will auto-open on this device: unseen, storage usable.
 * WorldMap calls this in a state initializer to seat the OPENING CAMERA on
 * the base before first paint, so guard everything (SSR, private mode). */
export function introPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !window.localStorage.getItem(INTRO_SEEN_KEY);
  } catch {
    return false;
  }
}

type Speaker = { name: string; art: string; accent: string; initial: string };

const FORGE: Speaker = { name: "Forge", art: "/s5-art/commander/forge.png", accent: "#f0b340", initial: "F" };
const COMPASS: Speaker = { name: "Compass", art: "/s5-art/commander/compass.png", accent: "#7fd4c1", initial: "C" };

/** Speaker order for the 7 beats. The lines themselves come from the dict. */
const BEAT_WHO: Speaker[] = [FORGE, COMPASS, COMPASS, COMPASS, FORGE, FORGE, COMPASS];

function Portrait({ who }: { who: Speaker }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="s5i-portrait-fallback"
        style={{ background: `radial-gradient(circle at 35% 30%, ${who.accent}, #101408 78%)` }}
        aria-hidden
      >
        {who.initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={who.art}
      alt=""
      className="s5i-portrait"
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}

export function MapIntro({
  d,
  openSignal,
  onOpenChange,
  onBeat,
}: {
  d: S5Dict;
  /** Increment to replay from beat 0 (does not clear the seen flag). */
  openSignal: number;
  /** Fired on open/close so the parent can hold MapHints and reset the camera. */
  onOpenChange: (open: boolean) => void;
  /** Fired for every shown beat, including beat 0 on open. */
  onBeat: (i: number) => void;
}) {
  const lines = [
    d.world.intro1,
    d.world.intro2,
    d.world.intro3,
    d.world.intro4,
    d.world.intro5,
    d.world.intro6,
    d.world.intro7,
  ];
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  // Auto-open once. Runs post-mount so SSR and hydration render identically.
  useEffect(() => {
    if (introPending()) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replay: any signal change after mount reopens at beat 0.
  const firstSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal !== firstSignal.current) {
      setI(0);
      setOpen(true);
    }
  }, [openSignal]);

  // Report open/close and each beat upward. One effect owns the contract:
  // beat 0 is reported on open, every advance after that on i.
  useEffect(() => {
    onOpenChange(open);
    if (open) onBeat(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i]);

  const close = useCallback(() => {
    setOpen(false);
    setI(0);
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const advance = useCallback(() => {
    setI((cur) => {
      if (cur >= lines.length - 1) {
        close();
        return cur;
      }
      return cur + 1;
    });
  }, [lines.length, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, advance, close]);

  if (!open) return null;
  const who = BEAT_WHO[i];
  const last = i === lines.length - 1;

  return (
    <>
      <div className="s5i-overlay" role="dialog" aria-label={d.world.introAria} onClick={advance}>
        <button
          type="button"
          className="s5i-skip"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          {d.world.introSkip}
        </button>

        <div className="s5i-stagearea">
          <Portrait who={who} />
        </div>

        <div className="s5i-box" style={{ borderColor: who.accent }}>
          <div className="s5i-name" style={{ color: who.accent }}>
            {who.name}
          </div>
          <p className="s5i-line">{lines[i]}</p>
          <div className="s5i-next">
            {last ? d.world.introDone : d.world.introContinue} <span className="s5i-caret">▸</span>
          </div>
        </div>

        <div className="s5i-dots" aria-hidden>
          {lines.map((_, dI) => (
            <span key={dI} className={dI === i ? "s5i-dot s5i-dot--on" : "s5i-dot"} />
          ))}
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
/* THE BOARD STAYS LEGIBLE UNDER THE INTRO. It was rgba(...,0.72) + blur(2px),
   which hid the very thing the camera tour is pointing at (Mike 2026-08-01:
   "it blurs the background so you don't really know what you're looking at").
   A lighter wash, no blur: the dialogue box below carries its own dark panel,
   so contrast for the text does not depend on drowning the map. */
.s5i-overlay{position:fixed;inset:0;z-index:80;background:rgba(8,10,6,0.40);
  display:flex;flex-direction:column;align-items:center;justify-content:flex-end;cursor:pointer;}
.s5i-skip{position:fixed;top:calc(env(safe-area-inset-top, 0px) + 10px);
  right:calc(env(safe-area-inset-right, 0px) + 12px);left:auto;
  min-height:44px;min-width:44px;padding:10px 22px;border-radius:999px;cursor:pointer;z-index:3;
  border:2px solid #b8412f;background:rgba(14,16,10,0.9);color:#ffffff;
  font-size:15px;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,0.45);}
.s5i-skip:hover{background:rgba(184,65,47,0.24);}
.s5i-stagearea{flex:1;display:flex;align-items:flex-end;justify-content:center;min-height:0;padding-top:64px;cursor:pointer;}
.s5i-portrait{max-height:min(52vh,520px);max-width:78vw;object-fit:contain;
  filter:drop-shadow(0 10px 40px rgba(0,0,0,0.6));}
.s5i-portrait-fallback{width:150px;height:150px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:64px;font-weight:800;color:rgba(255,255,255,0.9);margin-bottom:12px;}
.s5i-box{width:min(680px,92vw);margin:10px 0 0;padding:16px 20px 12px;border-radius:14px;cursor:pointer;
  border:1.5px solid;background:rgba(15,17,11,0.94);box-shadow:0 12px 40px rgba(0,0,0,0.5);}
.s5i-name{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px;}
.s5i-line{margin:0 0 8px;font-size:15.5px;line-height:1.55;color:#eef1e6;}
.s5i-next{text-align:right;font-size:12px;font-weight:700;letter-spacing:.08em;color:#f0b340;opacity:.9;}
.s5i-caret{display:inline-block;animation:s5iCaret 1.3s ease-in-out infinite;}
@keyframes s5iCaret{0%,100%{opacity:.5;transform:translateX(0);}50%{opacity:1;transform:translateX(3px);}}
@media (prefers-reduced-motion: reduce){.s5i-caret{animation:none;}}
.s5i-dots{display:flex;gap:6px;margin:8px 0 18px;}
.s5i-dot{width:7px;height:7px;border-radius:50%;background:rgba(248,253,240,0.22);}
.s5i-dot--on{background:#f0b340;}
@media (max-width:600px){.s5i-portrait{max-height:38vh;}.s5i-line{font-size:14.5px;}}
`,
        }}
      />
    </>
  );
}
