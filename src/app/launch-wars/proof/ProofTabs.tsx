"use client";

/**
 * Tabbed Results & Proof. Season 2 is the default tab; Season 1 is preserved
 * unchanged behind its own tab. Each season is described by a SeasonConfig built
 * server-side in page.tsx from its frozen proof JSON. No payout amounts, no
 * wallet addresses, by design.
 */
import { useState } from "react";
import Link from "next/link";
import ProofTable, { type ProofRow } from "./ProofTable";

const T = {
  panel: "#10141d",
  panel2: "#0c1018",
  line: "rgba(255,255,255,0.07)",
  line2: "rgba(255,255,255,0.14)",
  text: "#e9edf5",
  mut: "#97a0b5",
  dim: "#626b82",
  violet: "#8b7cff",
};
const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace";
const NUM: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

export type LegendItem = { label: string; color: string; note: string };
export type SeasonConfig = {
  key: string;
  tabLabel: string;
  eyebrow: string;
  intro: string;
  intro2: string;
  banner: string | null;
  tiles: { value: string; label: string }[];
  legend: LegendItem[];
  tableLabels: { points: string; secondary: string };
  rows: ProofRow[];
  footer: string;
  generated: string;
};

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: "1 1 150px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ ...NUM, fontSize: 28, fontWeight: 700, color: T.text }}>{value}</div>
      <div style={{ fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: T.mut, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function SeasonView({ s }: { s: SeasonConfig }) {
  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: T.violet, fontWeight: 600 }}>{s.eyebrow}</div>
      <h1 style={{ fontSize: 34, lineHeight: 1.15, fontWeight: 800, margin: "10px 0 0" }}>Results and proof</h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: T.mut, maxWidth: 720, marginTop: 12 }}>{s.intro}</p>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: T.dim, maxWidth: 720, marginTop: 10 }}>{s.intro2}</p>

      {s.banner && (
        <div style={{ marginTop: 20, background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 11, alignItems: "center" }}>
          <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>⏳</span>
          <span style={{ color: "#fbbf24", fontSize: 14.5, fontWeight: 600, lineHeight: 1.5 }}>{s.banner}</span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        {s.tiles.map((t) => <StatTile key={t.label} value={t.value} label={t.label} />)}
      </div>

      <section style={{ marginTop: 28, background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px" }}>
        <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: T.mut, marginBottom: 12 }}>What each result means</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px 24px" }}>
          {s.legend.map((l) => (
            <div key={l.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ marginTop: 2, flex: "0 0 auto", width: 9, height: 9, borderRadius: 3, background: l.color }} />
              <div>
                <span style={{ color: l.color, fontWeight: 600, fontSize: 13.5 }}>{l.label}</span>
                <span style={{ color: T.dim, fontSize: 13, lineHeight: 1.5 }}> — {l.note}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 32 }}>
        <ProofTable rows={s.rows} labels={s.tableLabels} />
      </div>

      <footer style={{ marginTop: 36, paddingTop: 18, borderTop: `1px solid ${T.line}`, fontSize: 12.5, color: T.dim, lineHeight: 1.6 }}>
        <p>{s.footer}</p>
        <p style={{ marginTop: 8 }}>
          Frozen snapshot generated {s.generated}. <Link href="/launch-wars" style={{ color: T.violet }}>Back to Launch Wars</Link>.
        </p>
      </footer>
    </div>
  );
}

export default function ProofTabs({ seasons }: { seasons: SeasonConfig[] }) {
  const [active, setActive] = useState(0);
  const s = seasons[active] ?? seasons[0];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 26 }} role="tablist" aria-label="Season">
        {seasons.map((season, i) => {
          const on = i === active;
          return (
            <button
              key={season.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              style={{
                padding: "9px 18px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                background: on ? T.violet : T.panel,
                color: on ? "#0a0d14" : T.mut,
                border: `1px solid ${on ? T.violet : T.line2}`,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {season.tabLabel}
            </button>
          );
        })}
      </div>
      <SeasonView s={s} />
    </div>
  );
}
