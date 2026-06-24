"use client";

/**
 * Season 1 proof table — the only client component on the page (sortable).
 * Renders participation honestly: status leads, points and boss contribution
 * support it. No wallet addresses, no payout amounts (by design).
 */
import { useMemo, useState } from "react";

const T = {
  panel: "#10141d",
  panel2: "#0c1018",
  line: "rgba(255,255,255,0.07)",
  line2: "rgba(255,255,255,0.14)",
  text: "#e9edf5",
  mut: "#97a0b5",
  dim: "#626b82",
  green: "#34d399",
  rose: "#fb6f84",
  amber: "#fbbf24",
  cyan: "#38bdf8",
  violet: "#8b7cff",
};
const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace";
const NUM: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

export interface ProofRow {
  name: string;
  isFounder: boolean;
  joined: string | null;
  fleetPoints: number;
  bossContribution: number;
  status: string;
}

function statusStyle(s: string): { color: string; bg: string } {
  if (s.startsWith("Paid")) return { color: T.green, bg: "rgba(52,211,153,0.12)" };
  if (s === "Sold before the end") return { color: T.rose, bg: "rgba(251,111,132,0.12)" };
  if (s.startsWith("Under")) return { color: T.amber, bg: "rgba(251,191,36,0.12)" };
  if (s.startsWith("Boss did not bond")) return { color: T.cyan, bg: "rgba(56,189,248,0.10)" };
  if (s.startsWith("Fleet did not place")) return { color: T.mut, bg: "rgba(151,160,181,0.10)" };
  return { color: T.dim, bg: "rgba(98,107,130,0.10)" };
}

type SortKey = "contribution" | "name" | "fleetPoints" | "boss" | "status";

export default function ProofTable({ rows }: { rows: ProofRow[] }) {
  const [key, setKey] = useState<SortKey>("contribution");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [q, setQ] = useState("");

  const sorted = useMemo(() => {
    const filtered = q.trim() ? rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())) : rows;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: number | string, bv: number | string;
      if (key === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === "fleetPoints") { av = a.fleetPoints; bv = b.fleetPoints; }
      else if (key === "boss") { av = a.bossContribution; bv = b.bossContribution; }
      else if (key === "status") { av = a.status; bv = b.status; }
      else { av = a.fleetPoints + a.bossContribution; bv = b.fleetPoints + b.bossContribution; }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [rows, key, dir, q]);

  const sortBy = (k: SortKey) => {
    if (k === key) { setDir((d) => (d === 1 ? -1 : 1)); }
    else { setKey(k); setDir(k === "name" || k === "status" ? 1 : -1); }
  };
  const arrow = (k: SortKey) => (k === key ? (dir === 1 ? " ↑" : " ↓") : "");

  const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: T.mut, cursor: "pointer", userSelect: "none", borderBottom: `1px solid ${T.line2}`, whiteSpace: "nowrap" };
  const thNum: React.CSSProperties = { ...th, textAlign: "right" };
  const td: React.CSSProperties = { padding: "11px 12px", borderBottom: `1px solid ${T.line}`, fontSize: 14, color: T.text, verticalAlign: "middle" };
  const tdNum: React.CSSProperties = { ...td, ...NUM, textAlign: "right" };

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a captain by name"
        style={{ width: "100%", maxWidth: 320, marginBottom: 14, padding: "9px 12px", background: T.panel2, border: `1px solid ${T.line2}`, borderRadius: 8, color: T.text, fontSize: 14, outline: "none" }}
      />
      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 12, background: T.panel }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr>
              <th style={th} onClick={() => sortBy("name")}>Captain{arrow("name")}</th>
              <th style={th} onClick={() => sortBy("status")}>Result{arrow("status")}</th>
              <th style={thNum} onClick={() => sortBy("fleetPoints")}>Fleet points{arrow("fleetPoints")}</th>
              <th style={thNum} onClick={() => sortBy("boss")}>Boss contribution{arrow("boss")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const ss = statusStyle(r.status);
              return (
                <tr key={i}>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    {r.isFounder && (
                      <span style={{ marginLeft: 8, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: T.violet, border: `1px solid rgba(139,124,255,0.4)`, borderRadius: 5, padding: "1px 5px", verticalAlign: "middle" }}>Founder</span>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{ display: "inline-block", color: ss.color, background: ss.bg, border: `1px solid ${ss.color}33`, borderRadius: 6, padding: "3px 9px", fontSize: 12.5, fontWeight: 600 }}>{r.status}</span>
                  </td>
                  <td style={tdNum}>{r.fleetPoints > 0 ? r.fleetPoints.toLocaleString() : <span style={{ color: T.dim }}>0</span>}</td>
                  <td style={tdNum}>{r.bossContribution > 0 ? `$${r.bossContribution.toFixed(2)}` : <span style={{ color: T.dim }}>—</span>}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td style={{ ...td, color: T.mut, textAlign: "center" }} colSpan={4}>No captain matches that name.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 12, fontSize: 12.5, color: T.dim }}>Showing {sorted.length} of {rows.length} captains. Tap a column heading to sort.</p>
    </div>
  );
}
