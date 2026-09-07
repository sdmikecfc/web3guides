"use client";

/**
 * THE HIT LIST map intro (ADR-0018 pattern): a visual-novel overlay that
 * teaches the time-split board in 8 beats. Hosted by the OMADs Ihor and Nikko
 * as agency characters (contract-era suits, iced-out chains; renamed from the
 * founder cameo 2026-07-14 with the OMADs' consent — art files unchanged).
 *
 * Script rewritten to HIT LIST 2026-07-14 per Mike (the prior theme's script
 * and its art were purged with that theme). Cameo re-approval channel = Mike.
 * While COFOUNDER_CAMEO is false, the same lessons run hosted by Koa the
 * agency handler, so the intro ships regardless. Flip ONE constant.
 *
 * Behavior: auto-opens on first visit (localStorage flag), tap/click advances,
 * Esc skips, the Skip pill is fixed top-right and visible from beat 1,
 * replayable via the Intro button the map renders.
 * Art: /s4-art/intro/{fred,michael,koa}.png (fred/michael regenerated
 * 2026-07-14, seeds 801/802), with an initialed gradient-circle fallback so a
 * missing PNG never breaks the overlay.
 */

import { useCallback, useEffect, useState } from "react";

const SEEN_KEY = "s4_map_intro_seen";
const COFOUNDER_CAMEO = true; // Rebuilt as HIT LIST characters 2026-07-14 per Mike (re-approval channel = Mike)

type Speaker = { name: string; art: string; accent: string; initial: string };

// Renamed to the OMAD hosts Ihor + Nikko (Mike 2026-07-14, with their consent);
// the art files keep their original names — no time to regenerate, faces are
// original anime characters anyway (no likeness carried, per ADR-0018).
const FRED: Speaker = { name: "Ihor", art: "/s4-art/intro/fred.png", accent: "#f0b340", initial: "I" };
const MICHAEL: Speaker = { name: "Nikko", art: "/s4-art/intro/michael.png", accent: "#4dd8e6", initial: "N" };
const KOA: Speaker = { name: "Koa", art: "/s4-art/intro/koa.png", accent: "#ff7eb6", initial: "K" };

type Beat = { who: Speaker; lines: string[] };

// HIT LIST script (2026-07-14, per Mike): 8 beats, Ihor + Nikko in
// character. Plain words, no em-dashes, pool language matches theme.ts pitch
// (contracts CLOSE and unlock more of the pool; never a fixed per-close
// number, never "win $500").
const CAMEO_BEATS: Beat[] = [
  {
    who: FRED,
    lines: [
      "Welcome to THE HIT LIST. I am Ihor, and this is Nikko. We run the agency.",
      "He plans the jobs. I talk to the new hires. The suits were his idea. The chains were mine.",
    ],
  },
  {
    who: MICHAEL,
    lines: [
      "This is the board. Four corners: the wild west on the left, today at the top, the future on the right.",
      "And pinned at the bottom, the contracts. Those are the featured domains. Each one has a ring that fills as people buy in. Fill the ring and the contract CLOSES.",
    ],
  },
  {
    who: FRED,
    lines: [
      "The machine in the middle is our time machine. It is how the agency works all three eras at once.",
      "Cowboys back then. Suits today. Whatever Nikko is wearing in the future. Same job, one board.",
    ],
  },
  {
    who: MICHAEL,
    lines: [
      "Here is the whole job in one line. Hold any featured domain, from just five dollars, and you earn 💰 Bounty every single day.",
      "Bounty is your score. Holding is the engine. Everything else here is the fun on top.",
    ],
  },
  {
    who: FRED,
    lines: [
      "Every contract that CLOSES unlocks more of the $500 pool, and the pool pays everyone.",
      "So cheer for every contract on the board. Even the ones the other teams called first.",
    ],
  },
  {
    who: MICHAEL,
    lines: [
      "Between jobs, hit the arcade: Stampede, High Noon, The Getaway, Extraction.",
      "One thumb, short runs. Play once a day for real rewards, practice any time. Playing earns 🔶 Gold, and Gold buys gear.",
    ],
  },
  {
    who: FRED,
    lines: [
      "Every gear combo unlocks a new look. A girl AND a guy, every single time. Wear whichever you like.",
      "Nikko has worn the same suit through three eras. He calls it a signature. I call it skipping laundry.",
    ],
  },
  {
    who: MICHAEL,
    lines: [
      "Pick a team. Hold five dollars of a domain you believe in. Watch the rings fill and the contracts close.",
      "The board is watching. So are we. Take the job.",
    ],
  },
];

// Fallback host version: same lessons, Koa's voice, founder jokes removed.
const KOA_BEATS: Beat[] = [
  { who: KOA, lines: ["Welcome to THE HIT LIST. I am Koa, your handler at the agency. Let me show you the board."] },
  { who: KOA, lines: ["The board has four corners: the wild west, today, and the future, with the contracts pinned at the bottom. The time machine in the middle is how the agency works all three eras at once."] },
  { who: KOA, lines: ["Hold any featured domain, from just five dollars, and you earn 💰 Bounty every single day. Bounty is your score. Holding is the engine."] },
  { who: KOA, lines: ["Every contract that CLOSES unlocks more of the $500 pool, and the pool pays everyone. So cheer for every contract on the board."] },
  { who: KOA, lines: ["That five hundred is just Week 1. More contracts land next week, and the pool grows with every one of them."] },
  { who: KOA, lines: ["Play the arcade: Stampede, High Noon, The Getaway, Extraction. Playing earns 🔶 Gold, and Gold buys gear. Every gear combo unlocks a girl and a guy, wear either one. Take the job."] },
];

function Portrait({ who }: { who: Speaker }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="s4i-portrait-fallback"
        style={{ background: `radial-gradient(circle at 35% 30%, ${who.accent}, #101425 78%)` }}
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
      className="s4i-portrait"
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}

export default function MapIntro() {
  const beats = COFOUNDER_CAMEO ? CAMEO_BEATS : KOA_BEATS;
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      /* private mode: just do not auto-open */
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setI(0);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const advance = useCallback(() => {
    setI((cur) => {
      if (cur >= beats.length - 1) {
        close();
        return cur;
      }
      return cur + 1;
    });
  }, [beats.length, close]);

  // keyboard: space/enter advance, escape skips
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

  const beat = beats[i];
  const last = i === beats.length - 1;

  return (
    <>
      <button type="button" className="s4i-replay" onClick={() => { setI(0); setOpen(true); }}>
        Intro
      </button>

      {open && (
        <div className="s4i-overlay" role="dialog" aria-label="How to play" onClick={advance}>
          <button
            type="button"
            className="s4i-skip"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          >
            Skip intro
          </button>

          <div className="s4i-stagearea">
            <Portrait who={beat.who} />
          </div>

          <div className="s4i-box" style={{ borderColor: beat.who.accent }}>
            <div className="s4i-name" style={{ color: beat.who.accent }}>
              {beat.who.name}
            </div>
            {beat.lines.map((l) => (
              <p key={l} className="s4i-line">
                {l}
              </p>
            ))}
            <div className="s4i-next">
              {last ? "TAKE THE JOB" : "tap to continue"} <span className="s4i-caret">▸</span>
            </div>
          </div>

          <div className="s4i-dots" aria-hidden>
            {beats.map((_, d) => (
              <span key={d} className={d === i ? "s4i-dot s4i-dot--on" : "s4i-dot"} />
            ))}
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
.s4i-replay{position:absolute;top:14px;right:14px;z-index:30;min-height:40px;padding:8px 16px;border-radius:999px;
  border:1px solid rgba(240,179,64,0.45);background:rgba(13,17,32,0.72);color:#f0b340;
  font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;}
.s4i-replay:hover{background:rgba(240,179,64,0.16);}
.s4i-overlay{position:fixed;inset:0;z-index:80;background:rgba(4,6,14,0.82);backdrop-filter:blur(3px);
  display:flex;flex-direction:column;align-items:center;justify-content:flex-end;cursor:pointer;}
.s4i-skip{position:fixed;top:calc(env(safe-area-inset-top, 0px) + 10px);
  right:calc(env(safe-area-inset-right, 0px) + 12px);left:auto;
  min-height:44px;min-width:44px;padding:10px 22px;border-radius:999px;cursor:pointer;z-index:3;
  border:2px solid #e33d4e;background:rgba(9,12,24,0.9);color:#ffffff;
  font-size:15px;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,0.45);}
.s4i-skip:hover{background:rgba(227,61,78,0.22);}
.s4i-stagearea{flex:1;display:flex;align-items:flex-end;justify-content:center;min-height:0;padding-top:64px;cursor:pointer;}
.s4i-portrait{max-height:min(58vh,560px);max-width:82vw;object-fit:contain;
  filter:drop-shadow(0 10px 40px rgba(0,0,0,0.55));}
.s4i-portrait-fallback{width:150px;height:150px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:64px;font-weight:800;color:rgba(255,255,255,0.9);margin-bottom:12px;}
.s4i-box{width:min(680px,92vw);margin:10px 0 0;padding:16px 20px 12px;border-radius:16px;cursor:pointer;
  border:1.5px solid;background:rgba(9,12,24,0.92);box-shadow:0 12px 40px rgba(0,0,0,0.5);}
.s4i-name{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px;}
.s4i-line{margin:0 0 8px;font-size:15.5px;line-height:1.55;color:#eef1f8;}
.s4i-next{text-align:right;font-size:12px;font-weight:700;letter-spacing:.08em;color:#f0b340;opacity:.9;}
.s4i-caret{display:inline-block;animation:s4iCaret 1.3s ease-in-out infinite;}
@keyframes s4iCaret{0%,100%{opacity:.5;transform:translateX(0);}50%{opacity:1;transform:translateX(3px);}}
@media (prefers-reduced-motion: reduce){.s4i-caret{animation:none;}}
.s4i-dots{display:flex;gap:6px;margin:8px 0 18px;}
.s4i-dot{width:7px;height:7px;border-radius:50%;background:rgba(248,253,255,0.22);}
.s4i-dot--on{background:#f0b340;}
@media (max-width:600px){.s4i-portrait{max-height:42vh;}.s4i-line{font-size:14.5px;}}
`,
        }}
      />
    </>
  );
}
