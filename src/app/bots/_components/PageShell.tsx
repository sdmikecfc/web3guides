/**
 * BATTLE BOTS page shell (server-safe: no hooks, no client JS). The S7
 * PageShell shape (src/app/s7/_components/ui.tsx) on the money tokens: the
 * backdrop and scrim layers are rendered INSIDE main (a backdrop the page
 * hangs behind main at z-index -1 is invisible under main's own paint; found
 * on the S7 arcade 2026-08-01), and the legal footer is rendered ONCE here
 * rather than per page, because a page that forgets it is exactly how those
 * links went missing.
 */
import { FONT_BODY, M } from "../_ui/tokens";
import { STRINGS } from "@/lib/bots/strings";
import css from "../_ui/ui.module.css";

export const BOTS_NAV_HEIGHT = 52;
export const BOTS_DOCK_HEIGHT = 64;

export function PageShell({
  children,
  backdrop,
  scrim,
  wide,
}: {
  children: React.ReactNode;
  /** A painted layer for pages that have one. MUST be rendered here, inside
   * main, for the reason in the file header. */
  backdrop?: React.CSSProperties;
  /** A second layer painted ON TOP of the backdrop and still UNDER the
   * content, because a blurred photo is not a scrim. */
  scrim?: React.CSSProperties;
  /** 1400 instead of 920: the Build screen's three columns need it
   * (280 + 760 + 320 + two 20px gaps). */
  wide?: boolean;
}) {
  return (
    <main
      id="bots-content"
      className={css.shell}
      style={{
        background: `radial-gradient(1000px 500px at 50% -10%, ${M.surface2} 0%, ${M.ground} 60%)`,
        color: M.text,
        fontFamily: FONT_BODY,
      }}
    >
      {backdrop ? (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <div className="bots-backdrop-art" style={{ position: "absolute", inset: 0, ...backdrop }} />
          {scrim ? (
            <div className="bots-backdrop-scrim" style={{ position: "absolute", inset: 0, ...scrim }} />
          ) : null}
        </div>
      ) : null}
      <div style={{ position: "relative", zIndex: 1, maxWidth: wide ? 1400 : 920, margin: "0 auto" }}>
        {children}
        <LegalFooter />
      </div>
    </main>
  );
}

/** Plain <a>, not next/link: these leave the game tree (S7 law). */
function LegalFooter() {
  const links: Array<[string, string]> = [
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/disclaimer", "Disclaimer"],
  ];
  return (
    <footer
      style={{
        marginTop: 48,
        paddingTop: 18,
        borderTop: `1px solid ${M.border}`,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 18,
        fontSize: 12.5,
        color: M.muted,
      }}
    >
      {links.map(([href, label]) => (
        <a
          key={href}
          href={href}
          /* a 20px tall word is not something a thumb can hit. The words stay
             the same size; the box around them is a real target. */
          style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: M.muted, textDecoration: "none" }}
        >
          {label}
        </a>
      ))}
      <span style={{ marginLeft: "auto" }}>{STRINGS.en.legal}</span>
    </footer>
  );
}
