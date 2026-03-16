"use client";

import { useEffect, useRef, useState } from "react";

export interface TocItem { id: string; text: string; level: 2 | 3; }

interface Props {
  accentHex: string;
  toc: TocItem[];
}

export function ArticleClient({ accentHex, toc }: Props) {
  const [progress, setProgress]       = useState(0);
  const [activeId, setActiveId]       = useState<string>("");

  useEffect(() => {
    function onScroll() {
      const el   = document.documentElement;
      const max  = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);

      // Determine active heading
      const headings = toc.map(({ id }) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
      let current = "";
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= 120) current = h.id;
      }
      setActiveId(current || (headings[0]?.id ?? ""));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [toc]);

  return (
    <>
      {/* Reading progress bar */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, height: 3, background: "#f0ece4" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: accentHex, transition: "width 0.1s linear", borderRadius: "0 2px 2px 0" }} />
      </div>

      {/* Sticky TOC — desktop only */}
      {toc.length >= 2 && (
        <aside className="article-toc" style={{ position: "sticky", top: 80, alignSelf: "flex-start" }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 16px" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", letterSpacing: 2, color: "#9ca3af", textTransform: "uppercase", marginBottom: 14 }}>
              Contents
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {toc.map(({ id, text, level }) => (
                <a key={id} href={`#${id}`}
                   onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                   style={{
                     display: "block",
                     paddingLeft: level === 3 ? 12 : 0,
                     padding: `5px ${level === 3 ? 12 : 0}px 5px ${level === 3 ? 12 : 0}px`,
                     fontFamily: "'DM Sans', sans-serif",
                     fontSize: level === 2 ? "0.8rem" : "0.75rem",
                     fontWeight: level === 2 ? 600 : 400,
                     color: activeId === id ? accentHex : "#6b7280",
                     textDecoration: "none",
                     borderLeft: activeId === id ? `2px solid ${accentHex}` : "2px solid transparent",
                     paddingLeft: level === 3 ? 16 : 8,
                     lineHeight: 1.4,
                     transition: "color 0.15s, border-color 0.15s",
                   }}>
                  {text}
                </a>
              ))}
            </nav>

            {/* Progress indicator in TOC */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #f0ece4" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", color: "#9ca3af" }}>Progress</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", color: accentHex }}>{Math.round(progress)}%</span>
              </div>
              <div style={{ height: 4, background: "#f3f4f6", borderRadius: 4 }}>
                <div style={{ height: "100%", width: `${progress}%`, background: accentHex, borderRadius: 4, transition: "width 0.2s" }} />
              </div>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}

/** Extract TOC from markdown string (server-safe — pure function) */
export function extractToc(md: string): TocItem[] {
  const lines = md.split("\n");
  const toc: TocItem[] = [];
  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    if (h2) toc.push({ id: slugId(h2[1]), text: h2[1], level: 2 });
    else if (h3) toc.push({ id: slugId(h3[1]), text: h3[1], level: 3 });
  }
  return toc;
}

function slugId(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
