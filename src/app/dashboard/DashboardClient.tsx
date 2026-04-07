"use client";

import { useEffect, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   BOT PANEL
════════════════════════════════════════════════════════════════════════ */
interface BotState {
  balance?: number;
  pnl?: number;
  pnl_pct?: number;
  base_unit?: string;
  [key: string]: unknown;
}
interface BotPosition {
  symbol?: string;
  side?: string;
  size?: number;
  entry_price?: number;
  current_price?: number;
  pnl?: number;
  [key: string]: unknown;
}
interface BotTrade {
  symbol?: string;
  side?: string;
  size?: number;
  price?: number;
  pnl?: number;
  timestamp?: string;
  [key: string]: unknown;
}
interface BotSummary {
  state?: BotState;
  positions?: BotPosition[];
  trades?: BotTrade[];
  [key: string]: unknown;
}

function fmt(n: number | undefined, decimals = 2) {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function BotPanel() {
  const [data, setData]       = useState<BotSummary | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [age, setAge]         = useState(0);

  async function fetchBot() {
    try {
      const res = await fetch("/api/bot", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      setError("Fetch failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBot();
    const poll = setInterval(fetchBot, 30_000);
    return () => clearInterval(poll);
  }, []);

  // Age counter — updates every second
  useEffect(() => {
    const t = setInterval(() => {
      setAge(lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0);
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  const state     = data?.state ?? {};
  const positions = data?.positions ?? [];
  const trades    = data?.trades ?? [];
  const unit      = state.base_unit ?? "USDT";
  const pnlColor  = (state.pnl ?? 0) >= 0 ? "#22c55e" : "#ef4444";
  const online    = !error && !loading;

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: online ? "#22c55e" : "#ef4444", boxShadow: online ? "0 0 8px #22c55e" : "none" }} />
          <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Trading Bot</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: "#334155" }}>Updated {age}s ago</span>
          )}
          <button onClick={fetchBot} style={{
            background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
            color: "#64748b", fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer",
          }}>↻ Refresh</button>
        </div>
      </div>

      {loading && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "28px 20px", textAlign: "center" as const, color: "#334155", fontSize: 14 }}>
          Connecting to bot…
        </div>
      )}

      {error && !loading && (
        <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 12, padding: "16px 20px", color: "#fca5a5", fontSize: 13 }}>
          ⚠️ {error} — is the bot running?
        </div>
      )}

      {data && !error && (
        <>
          {/* State cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 }}>Balance</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#0ea5e9" }}>{fmt(state.balance as number)} <span style={{ fontSize: 13, color: "#334155" }}>{unit}</span></div>
            </div>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 }}>Unrealised P&amp;L</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: pnlColor }}>
                {(state.pnl as number) >= 0 ? "+" : ""}{fmt(state.pnl as number)} <span style={{ fontSize: 13, color: "#334155" }}>{unit}</span>
              </div>
              {state.pnl_pct !== undefined && (
                <div style={{ fontSize: 12, color: pnlColor, marginTop: 2 }}>
                  {(state.pnl_pct as number) >= 0 ? "+" : ""}{fmt(state.pnl_pct as number, 2)}%
                </div>
              )}
            </div>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 }}>Open Positions</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: positions.length > 0 ? "#f59e0b" : "#334155" }}>{positions.length}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Open positions */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e293b", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>Open Positions</div>
              {positions.length === 0 ? (
                <div style={{ padding: "24px 18px", textAlign: "center" as const, color: "#334155", fontSize: 13 }}>No open positions</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                  <thead>
                    <tr style={{ background: "#1e293b" }}>
                      {["Symbol", "Side", "Size", "Entry", "Current", "P&L"].map(h => (
                        <th key={h} style={{ padding: "7px 14px", fontSize: 10, fontWeight: 700, color: "#475569", textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p, i) => {
                      const pc = (p.pnl ?? 0) >= 0 ? "#22c55e" : "#ef4444";
                      return (
                        <tr key={i} style={{ borderTop: "1px solid #1e293b" }}>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{p.symbol ?? "—"}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: p.side === "long" ? "#052e16" : "#1a0a0a", color: p.side === "long" ? "#22c55e" : "#ef4444", textTransform: "uppercase" as const }}>
                              {p.side ?? "—"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 13, color: "#94a3b8" }}>{fmt(p.size, 4)}</td>
                          <td style={{ padding: "10px 14px", fontSize: 13, color: "#94a3b8" }}>{fmt(p.entry_price)}</td>
                          <td style={{ padding: "10px 14px", fontSize: 13, color: "#e2e8f0" }}>{fmt(p.current_price)}</td>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: pc }}>{(p.pnl ?? 0) >= 0 ? "+" : ""}{fmt(p.pnl)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Recent trades */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e293b", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>Recent Trades</div>
              {trades.length === 0 ? (
                <div style={{ padding: "24px 18px", textAlign: "center" as const, color: "#334155", fontSize: 13 }}>No trades yet</div>
              ) : (
                <div>
                  {trades.slice(0, 10).map((t, i) => {
                    const tc = (t.pnl ?? 0) > 0 ? "#22c55e" : (t.pnl ?? 0) < 0 ? "#ef4444" : "#475569";
                    const ts = t.timestamp ? new Date(t.timestamp as string).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
                    return (
                      <div key={i} style={{ padding: "10px 18px", borderTop: i > 0 ? "1px solid #1e293b" : undefined, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{t.symbol ?? "—"}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: t.side === "buy" ? "#052e16" : "#1a0a0a", color: t.side === "buy" ? "#22c55e" : "#ef4444", textTransform: "uppercase" as const }}>
                              {t.side ?? "—"}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "#334155" }}>{ts} · {fmt(t.size, 4)} @ {fmt(t.price)}</div>
                        </div>
                        {t.pnl !== undefined && (
                          <div style={{ fontSize: 13, fontWeight: 700, color: tc, flexShrink: 0 }}>
                            {(t.pnl as number) > 0 ? "+" : ""}{fmt(t.pnl)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface AffiliateRow {
  slug: string; label: string; category: string;
  hasRealLink: boolean; total: number; last7: number; last30: number;
}
interface PathRow   { path: string; count: number }
interface DailyRow  { date: string; count: number }

interface Props {
  affiliateData: AffiliateRow[];
  topPaths:      PathRow[];
  dailyClicks:   DailyRow[];
  totalClicks:   number;
  emailCount:    number;
  guideCount:    number;
}

const CATEGORY_COLOR: Record<string, string> = {
  exchange: "#3b82f6",
  tax:      "#22c55e",
  hardware: "#f97316",
  swap:     "#a855f7",
  other:    "#64748b",
};

export default function DashboardClient({
  affiliateData, topPaths, dailyClicks, totalClicks, emailCount, guideCount,
}: Props) {
  const maxDaily = Math.max(...dailyClicks.map((d) => d.count), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1f", color: "#e2e8f0", padding: "40px 24px 80px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#fff" }}>Web3Guides Dashboard</h1>
          <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 14 }}>Bot · Affiliate clicks · Email signups · Content stats</p>
        </div>

        <BotPanel />

        {/* Top stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Total Clicks",   value: totalClicks,              color: "#6366f1" },
            { label: "Clicks (7d)",    value: affiliateData.reduce((s,a) => s + a.last7,  0), color: "#22c55e" },
            { label: "Email Signups",  value: emailCount,               color: "#f59e0b" },
            { label: "Guides Live",    value: guideCount,               color: "#0ea5e9" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: s.color }}>{s.value.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Sparkline */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "20px 22px", marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 16 }}>Daily Clicks — Last 14 Days</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
            {dailyClicks.map((d) => (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div
                  style={{
                    width: "100%",
                    background: d.count > 0 ? "#6366f1" : "#1e293b",
                    borderRadius: "3px 3px 0 0",
                    height: `${Math.max(4, (d.count / maxDaily) * 52)}px`,
                    transition: "height 0.3s",
                  }}
                  title={`${d.date}: ${d.count} clicks`}
                />
                <span style={{ fontSize: 9, color: "#334155", writingMode: "vertical-rl" as const, transform: "rotate(180deg)" }}>
                  {d.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, marginBottom: 32 }}>

          {/* Affiliate table */}
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>Affiliate Links</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#1e293b" }}>
                  {["Link", "Status", "All Time", "Last 7d", "Last 30d"].map((h) => (
                    <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {affiliateData.sort((a, b) => b.total - a.total).map((row) => (
                  <tr key={row.slug} style={{ borderTop: "1px solid #1e293b" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: CATEGORY_COLOR[row.category] ?? "#64748b", flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{row.label}</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>/go/{row.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                        background: row.hasRealLink ? "#052e16" : "#1c1006",
                        color: row.hasRealLink ? "#4ade80" : "#f97316",
                      }}>
                        {row.hasRealLink ? "Live" : "Pending"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 16, fontWeight: 700, color: row.total > 0 ? "#6366f1" : "#334155" }}>{row.total}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: row.last7 > 0 ? "#22c55e" : "#334155" }}>{row.last7}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "#94a3b8" }}>{row.last30}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top referring pages */}
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>Top Referring Pages</span>
            </div>
            {topPaths.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center" as const, color: "#334155", fontSize: 14 }}>No clicks yet</div>
            ) : (
              <div>
                {topPaths.map((p, i) => (
                  <div key={p.path} style={{ padding: "12px 20px", borderTop: i > 0 ? "1px solid #1e293b" : undefined, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.path}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#6366f1", flexShrink: 0 }}>{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Pending affiliate links reminder */}
        {affiliateData.some((a) => !a.hasRealLink) && (
          <div style={{ background: "#1c1006", border: "1px solid #451a03", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 8 }}>⏳ Pending Affiliate Approvals</div>
            <div style={{ fontSize: 13, color: "#78350f" }}>
              {affiliateData.filter((a) => !a.hasRealLink).map((a) => a.label).join(", ")} — update{" "}
              <code style={{ color: "#f97316" }}>affiliate_links</code> in Supabase once approved.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
