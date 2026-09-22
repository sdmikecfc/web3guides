"use client";
/**
 * MAP HINTS — the guidance layer, top right.
 *
 * Mike, 2026-07-28: "There needs to be more guidance throughout because I will
 * see a beautiful map and not really know what to do without reading a long
 * page which our audience hates."
 *
 * That is the whole design brief, and it rules out the obvious answers. A
 * tutorial overlay blocks the board the player just arrived to look at. A help
 * PAGE is the long read he is describing. So this is the video-game answer: one
 * small card at a time, in the corner, saying the next useful thing, with a
 * dismiss on every one.
 *
 * FOUR RULES, each of which is why a hint layer usually gets hated:
 *  1. ONE AT A TIME. A stack of four cards is the long page again, just
 *     stacked. The queue advances only as each is dismissed.
 *  2. DISMISSAL IS PERMANENT. Kept in localStorage per hint id, so the map
 *     never re-teaches something you have already dismissed. A returning
 *     player sees no chrome at all.
 *  3. NOTHING IS BLOCKED. The card sits in the HUD layer, is small, and never
 *     covers the centre of the board.
 *  4. IT CAN COME BACK. Dismiss them all and a single "?" remains, so help is
 *     never a thing you destroyed by accident.
 *
 * Copy is passed in from the caller's dict so every line is en/ko/zh, and the
 * ids are stable strings: renaming a hint would re-show it to everyone.
 */
import { useCallback, useEffect, useState } from "react";

export type Hint = { id: string; title: string; body: string };

const LS_KEY = "s5_world_hints_v1";

function readSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function MapHints({ hints, labels }: {
  hints: Hint[];
  /** `more` carries an {n}. */
  labels: { dismiss: string; reopen: string; help: string; more: string };
}) {
  // Server and first client render must agree, so nothing shows until mount:
  // localStorage is not readable during SSR and a mismatch would hydrate-warn.
  const [seen, setSeen] = useState<string[] | null>(null);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  const dismiss = useCallback((id: string) => {
    setSeen((prev) => {
      const next = Array.from(new Set([...(prev ?? []), id]));
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        // A blocked storage (private mode) just means hints return next visit.
      }
      return next;
    });
  }, []);

  if (seen === null) return null; // pre-mount: render nothing, never mismatch

  const pending = reopened ? hints : hints.filter((h) => !seen.includes(h.id));
  const current = pending[0];

  if (!current) {
    return (
      <button
        type="button"
        className="wm-hint-open"
        data-wm-nodrag
        onClick={() => setReopened(true)}
        aria-label={labels.reopen}
        title={labels.reopen}
      >
        ?
      </button>
    );
  }

  return (
    <aside className="wm-hint" data-wm-nodrag aria-live="polite" data-testid="map-hint">
      <div className="wm-hint-head">
        <span className="wm-hint-kicker">{labels.help}</span>
        <button
          type="button"
          className="wm-hint-x"
          onClick={() => {
            dismiss(current.id);
            // Re-opened runs are a review pass: close the whole thing on the
            // first dismiss rather than marching the player through all four.
            if (reopened) setReopened(false);
          }}
          aria-label={labels.dismiss}
        >
          ✕
        </button>
      </div>
      <p className="wm-hint-title">{current.title}</p>
      <p className="wm-hint-body">{current.body}</p>
      {pending.length > 1 ? (
        <p className="wm-hint-count">
          {labels.more.replace("{n}", String(pending.length - 1))}
        </p>
      ) : null}
    </aside>
  );
}

/** Injected by WorldMap alongside the other world CSS. */
export const MAP_HINTS_CSS = `
/* The HUD stack: the pool line, then whatever sits under it. Laid out in
   normal flow so a pool line that wraps to three lines on a phone pushes the
   hint down instead of being covered by it. The column itself is transparent
   to the pointer or it would block dragging the whole top strip of the map. */
.wm-hudcol{
  position:absolute;left:0;right:0;top:0;
  display:flex;flex-direction:column;align-items:flex-end;
  pointer-events:none;
  z-index:25;
}
.wm-hudcol > *{pointer-events:auto;}
.wm-hudcol > .wm-topbar{position:static;align-self:stretch;}
.wm-hint{
  margin:2px 14px 0;
  width:min(268px, calc(100vw - 28px));
  background:linear-gradient(180deg,rgba(24,29,35,0.97),rgba(15,18,22,0.97));
  border:1px solid rgba(224,102,46,0.45);
  border-radius:12px;
  padding:10px 12px 11px;
  box-shadow:0 10px 30px rgba(0,0,0,0.45);
  z-index:40;
}
.wm-hint-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;}
.wm-hint-kicker{
  font:800 9.5px/1 ui-monospace,Menlo,monospace;letter-spacing:0.16em;text-transform:uppercase;
  color:#e0662e;
}
.wm-hint-x{
  background:none;border:0;color:#9aa7b4;font-size:15px;line-height:1;cursor:pointer;
  padding:4px;margin:-4px -4px -4px 0;min-width:28px;min-height:28px;
}
.wm-hint-x:hover{color:#fff;}
.wm-hint-x:focus-visible{outline:2px solid #e0662e;outline-offset:2px;border-radius:6px;}
.wm-hint-title{margin:0 0 3px;font-size:13.5px;font-weight:800;color:#e9edf1;}
.wm-hint-body{margin:0;font-size:12px;line-height:1.5;color:#9aa7b4;}
.wm-hint-count{
  margin:7px 0 0;font:700 9.5px/1 ui-monospace,Menlo,monospace;color:#6f7b87;
}
.wm-hint-open{
  margin:2px 14px 0;
  width:32px;height:32px;border-radius:999px;
  background:rgba(15,18,22,0.9);border:1px solid rgba(154,167,180,0.35);
  color:#9aa7b4;font-weight:800;font-size:14px;cursor:pointer;
  z-index:40;
}
.wm-hint-open:hover{color:#fff;border-color:rgba(224,102,46,0.6);}
.wm-hint-open:focus-visible{outline:2px solid #e0662e;outline-offset:2px;}
@media (max-width:520px){
  /* Full width on a phone: 268px of card floating in a 375px screen looks
     like a mistake, and the body text needs the room. */
  .wm-hint{align-self:stretch;margin:2px 10px 0;width:auto;}
  .wm-hint-open{margin:2px 10px 0;}
}
`;
