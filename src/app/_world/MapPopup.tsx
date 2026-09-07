"use client";
/**
 * THE POPUP SHELL — one dialog, any body.
 *
 * The scrim/Escape/focus contract is lifted from the proven DetailCard in
 * src/app/s5/map/SiegeMap.tsx:678-693 rather than rewritten, because it
 * carries a real audit fix that a from-scratch rebuild would silently lose:
 *
 *   "Focus restoration (2026-07-27 audit): on close, focus used to fall to
 *    <body>, dropping a keyboard user at the top of the document instead of
 *    back on the node they opened."
 *
 * Season-agnostic: it renders whatever children it is handed. Popups keep the
 * house DARK panel styling even on a bright painted map — they are overlays
 * sitting above the world, they read perfectly, and re-toning the shared
 * palette would break every other page in the season (the ui.tsx warning).
 *
 * It deliberately sits OUTSIDE the pan/zoom subtree: that subtree sets
 * `touch-action:none` to own the gesture, which would kill native scrolling
 * inside a long dossier on a phone.
 */
import { useEffect, useRef } from "react";

export type MapPopupProps = {
  title: string;
  /** Read out after the title, e.g. "stronghold details". */
  ariaLabel?: string;
  /** Rendered top-right beside the close button (a status chip, a badge). */
  headerRight?: React.ReactNode;
  /** Accent for the top rule; ties the popup to the place it came from. */
  accent?: string;
  onClose: () => void;
  closeLabel?: string;
  children: React.ReactNode;
};

export function MapPopup({
  title,
  ariaLabel,
  headerRight,
  accent = "#e0662e",
  onClose,
  closeLabel = "Close",
  children,
}: MapPopupProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Put the keyboard user back on the site they opened, not on <body>.
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="wm-scrim"
      /* Opts this card out of map panning. Without it, pressing a control
         inside the popup starts a pan, the viewport calls setPointerCapture,
         and the click never lands - the card opens and nothing in it responds,
         which is exactly how the base menu behaved. */
      data-wm-nodrag
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ? `${title} · ${ariaLabel}` : title}
        className="wm-card"
        tabIndex={-1}
        style={{ borderTopColor: accent }}
        ref={(el) => {
          ref.current = el;
        }}
      >
        <header className="wm-card-head">
          <span className="wm-card-title">{title}</span>
          <span className="wm-card-right">
            {headerRight}
            <button type="button" className="wm-x" aria-label={closeLabel} onClick={onClose}>
              ✕
            </button>
          </span>
        </header>
        <div className="wm-card-body">{children}</div>
      </section>
    </div>
  );
}

export const MAP_POPUP_CSS = `
.wm-scrim{
  position:fixed;inset:0;z-index:120;
  display:flex;align-items:center;justify-content:center;
  padding:16px;
  background:rgba(6,8,11,0.68);
  backdrop-filter:blur(3px);
  -webkit-backdrop-filter:blur(3px);
  animation:wm-fade 140ms ease-out;
}
@keyframes wm-fade{from{opacity:0}to{opacity:1}}
.wm-card{
  width:min(560px,100%);
  max-height:min(82dvh,760px);
  overflow-y:auto;
  overscroll-behavior:contain;
  background:rgba(18,22,27,0.98);
  border:1px solid #232a32;
  border-top:3px solid #e0662e;
  border-radius:12px;
  box-shadow:0 24px 60px rgba(0,0,0,0.55);
  color:#e9edf1;
  outline:none;
}
.wm-card-head{
  position:sticky;top:0;z-index:1;
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:14px 16px;
  background:rgba(18,22,27,0.98);
  border-bottom:1px solid #232a32;
}
.wm-card-title{
  font-family:'Bungee',system-ui,sans-serif;
  font-size:17px;letter-spacing:0.01em;color:#e9edf1;
}
.wm-card-right{display:flex;align-items:center;gap:10px;}
.wm-x{
  background:none;border:1px solid #2b333c;border-radius:6px;
  color:#aab4bd;cursor:pointer;
  font-size:13px;line-height:1;padding:6px 9px;
}
.wm-x:hover{color:#e9edf1;border-color:#3a444f;}
.wm-card-body{padding:16px;}
@media (prefers-reduced-motion: reduce){
  .wm-scrim{animation:none;}
}
`;
