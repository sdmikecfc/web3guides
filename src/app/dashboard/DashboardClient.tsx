"use client";

import { useEffect, useState } from "react";
import { VALID_SUBDOMAINS } from "@/lib/subdomains";

function useMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 700);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

/* ════════════════════════════════════════════════════════════════════════
   BOT PANEL
════════════════════════════════════════════════════════════════════════ */
interface BotState   { balance?: number; pnl?: number; pnl_pct?: number; base_unit?: string; [k: string]: unknown }
interface BotPosition { symbol?: string; side?: string; size?: number; entry_price?: number; current_price?: number; pnl?: number; [k: string]: unknown }
interface BotTrade    { symbol?: string; side?: string; size?: number; price?: number; pnl?: number; timestamp?: string; [k: string]: unknown }
interface BotSummary  { state?: BotState; positions?: BotPosition[]; trades?: BotTrade[]; [k: string]: unknown }

function fmtNum(n: number | undefined, dec = 2) {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPrice(n: number | undefined) {
  if (n === undefined || n === null) return "—";
  if (n === 0) return "0.00";
  if (n < 0.0001) return n.toExponential(4);
  if (n < 0.01)   return n.toFixed(6);
  return n.toFixed(4);
}
function fmtDate(s?: string) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Update this if you deposit or withdraw from the bot wallet ───────────────
// e.g. if you add $50: INITIAL_BALANCE = 150. Remove $20: INITIAL_BALANCE = 80.
const INITIAL_BALANCE = 100;

function BotPanel() {
  const mobile                  = useMobile();
  const [data, setData]         = useState<BotSummary | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [lastUpdated, setLast]  = useState<Date | null>(null);
  const [loading, setLoading]   = useState(true);
  const [age, setAge]           = useState(0);

  async function fetchBot() {
    try {
      const res = await fetch("/api/bot", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
      setData(json);
      setError(null);
      setLast(new Date());
    } catch { setError("Bot unreachable"); }
    finally  { setLoading(false); }
  }

  useEffect(() => {
    fetchBot();
    const t = setInterval(fetchBot, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAge(lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0), 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  const state       = data?.state ?? {};
  const positions   = data?.positions ?? [];
  const trades      = data?.trades ?? [];
  const unit        = "USDC.e";
  const balance     = (state.usdc_balance as number) ?? (state.balance as number);
  const totalValue  = (state.total_value as number) ?? balance ?? 0;
  const pnl         = positions.reduce((sum, p) => sum + ((p.unrealized_pnl as number) ?? (p.pnl as number) ?? 0), 0);
  const pnlColor    = pnl >= 0 ? "#22c55e" : "#ef4444";
  const totalProfit = totalValue - INITIAL_BALANCE;
  const profitColor = totalProfit >= 0 ? "#22c55e" : "#ef4444";
  const online    = !error && !loading && !!data;

  return (
    <section style={{ marginBottom: 48 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: online ? "#22c55e" : error ? "#ef4444" : "#475569", boxShadow: online ? "0 0 10px #22c55e80" : "none" }} />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#fff" }}>Trading Bot</h2>
          <span style={{ fontSize: 11, color: online ? "#22c55e" : "#475569", fontWeight: 700 }}>
            {loading ? "Connecting…" : online ? "Live" : "Offline"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!!state.updated_at && (
            <span style={{ fontSize: 11, color: "#334155" }}>
              Bot wrote: {fmtDate(state.updated_at as string)}
            </span>
          )}
          {lastUpdated && <span style={{ fontSize: 11, color: "#475569" }}>· fetched {age}s ago</span>}
          <button onClick={fetchBot} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#64748b", fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>↻</button>
        </div>
      </div>

      {loading && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 28, textAlign: "center" as const, color: "#334155", fontSize: 14 }}>
          Connecting to bot…
        </div>
      )}

      {error && !loading && (
        <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 12, padding: "16px 20px", color: "#fca5a5", fontSize: 13 }}>
          ⚠️ {error} — is the droplet running?
        </div>
      )}

      {data && !error && (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
            <StatCard label="Balance" value={`${fmtNum(balance)} ${unit}`} color="#0ea5e9" />
            <StatCard label="Deployed" value={`${fmtNum((state.total_deployed as number) ?? 0)} ${unit}`} color="#a78bfa" />
            <StatCard label="Total Value" value={`${fmtNum(totalValue)} ${unit}`} color="#34d399" />
            <StatCard
              label="Total Profit"
              value={`${totalProfit >= 0 ? "+" : ""}${fmtNum(totalProfit)} ${unit}`}
              sub={`vs $${INITIAL_BALANCE} initial`}
              color={profitColor}
            />
            <StatCard
              label="Unrealised P&L"
              value={`${pnl >= 0 ? "+" : ""}${fmtNum(pnl)} ${unit}`}
              sub={undefined}
              color={pnlColor}
            />
            <StatCard label="Open Positions" value={String(positions.length)} color={positions.length > 0 ? "#f59e0b" : "#334155"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.4fr 1fr", gap: 16 }}>
            {/* Positions */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
              <SectionHead title="Open Positions" />
              {positions.length === 0 ? (
                <Empty text="No open positions" />
              ) : (
                <div style={{ overflowX: "auto" as const }}>
                <table style={{ width: "100%", borderCollapse: "collapse" as const, minWidth: 420 }}>
                  <thead><tr style={{ background: "#1e293b" }}>
                    {["Symbol","Side","Size","Entry","Mark","P&L"].map(h => <Th key={h}>{h}</Th>)}
                  </tr></thead>
                  <tbody>
                    {positions.map((p, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #1e293b" }}>
                        <Td bold>{p.symbol ?? "—"}</Td>
                        <Td><SideBadge side="long" /></Td>
                        <Td muted>${fmtNum(p.usdc_spent as number ?? p.size)}</Td>
                        <Td muted>{fmtPrice(p.entry_price as number)}</Td>
                        <Td>{fmtPrice(p.mark_price as number ?? p.current_price as number)}</Td>
                        <Td color={(p.unrealized_pnl as number ?? p.pnl ?? 0) >= 0 ? "#22c55e" : "#ef4444"}>
                          {((p.unrealized_pnl as number ?? p.pnl ?? 0) >= 0 ? "+" : "")}
                          {fmtNum(p.unrealized_pnl as number ?? p.pnl as number)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Trades */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
              <SectionHead title="Recent Trades" />
              {trades.length === 0 ? (
                <Empty text="No trades yet" />
              ) : (
                <div>
                  {trades.slice(0, 12).map((t, i) => {
                    const tc = (t.pnl ?? 0) > 0 ? "#22c55e" : (t.pnl ?? 0) < 0 ? "#ef4444" : "#475569";
                    return (
                      <div key={i} style={{ padding: "10px 16px", borderTop: i > 0 ? "1px solid #1e293b" : undefined, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{t.symbol ?? "—"}</span>
                            <SideBadge side={t.side} />
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(t.executed_at as string ?? t.timestamp)} · ${fmtNum(t.usdc_amount as number ?? t.size)} @ {fmtPrice(t.price as number)}</div>
                        </div>
                        {t.pnl !== undefined && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: tc }}>
                            {(t.pnl as number) > 0 ? "+" : ""}{fmtNum(t.pnl)}
                          </span>
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
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   BOT LOGS
════════════════════════════════════════════════════════════════════════ */
interface LogData { lines?: string[]; error?: string }

function BotLogs() {
  const [data, setData]       = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive]   = useState<"scheduler" | "monitor">("scheduler");
  const [lines, setLines]     = useState(80);

  async function fetchLogs(process = active, n = lines) {
    setLoading(true);
    try {
      const res = await fetch(`/api/bot-logs?process=${process}&lines=${n}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch { setData({ error: "Unreachable" }); }
    finally  { setLoading(false); }
  }

  useEffect(() => {
    fetchLogs(active, lines);
    const t = setInterval(() => fetchLogs(active, lines), 15_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lines]);

  const logLines = (data?.lines ?? []).slice().reverse();

  const lineColor = (line: string) => {
    if (/error|exception|fail|critical/i.test(line)) return "#ef4444";
    if (/warn/i.test(line)) return "#f59e0b";
    if (/buy|long|open|entry/i.test(line)) return "#22c55e";
    if (/sell|short|close|exit/i.test(line)) return "#f472b6";
    if (/skip|no |ignore/i.test(line)) return "#475569";
    return "#94a3b8";
  };

  return (
    <section style={{ marginBottom: 48 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#fff" }}>Bot Logs</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(["scheduler", "monitor"] as const).map((tab) => (
            <button key={tab} onClick={() => setActive(tab)} style={{
              background: active === tab ? "#1e293b" : "transparent",
              border: `1px solid ${active === tab ? "#334155" : "#1e293b"}`,
              borderRadius: 6, color: active === tab ? "#e2e8f0" : "#475569",
              fontSize: 11, fontWeight: 700, padding: "4px 12px", cursor: "pointer",
            }}>
              {tab}.py
            </button>
          ))}
          {/* Lines selector */}
          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#64748b", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
          >
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n} lines</option>)}
          </select>
          <button
            onClick={() => fetchLogs()}
            style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#64748b", fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}
          >↻</button>
        </div>
      </div>

      <div style={{ background: "#050a12", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
        {loading && logLines.length === 0 ? (
          <div style={{ padding: 24, color: "#334155", fontSize: 13, textAlign: "center" as const }}>Loading logs…</div>
        ) : data?.error ? (
          <div style={{ padding: 24, color: "#fca5a5", fontSize: 13 }}>⚠️ {data.error}</div>
        ) : logLines.length === 0 ? (
          <div style={{ padding: 24, color: "#334155", fontSize: 13, textAlign: "center" as const }}>No log output</div>
        ) : (
          <div style={{ height: 420, overflowY: "auto", padding: "14px 16px", fontFamily: "'Space Mono', monospace", fontSize: 11, lineHeight: 1.7 }}>
            {logLines.map((line, i) => (
              <div key={i} style={{ color: lineColor(line), whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {line}
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "8px 16px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#1e293b" }}>{logLines.length} lines · auto-refreshes every 15s</span>
          {loading && <span style={{ fontSize: 10, color: "#334155" }}>Refreshing…</span>}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PROPS + TYPES
════════════════════════════════════════════════════════════════════════ */
interface AffiliateRow { slug: string; label: string; category: string; hasRealLink: boolean; total: number; last7: number; last30: number }
interface PathRow      { path: string; count: number }
interface DailyRow     { date: string; count: number }

interface Props {
  affiliateData: AffiliateRow[];
  topPaths:      PathRow[];
  dailyClicks:   DailyRow[];
  totalClicks:   number;
  emailCount:    number;
  guideCount:    number;
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
════════════════════════════════════════════════════════════════════════ */
export default function DashboardClient({ emailCount, guideCount }: Props) {
  const mobile = useMobile();

  return (
    <div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", padding: "40px 24px 80px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 40, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Bungee', cursive", fontSize: 22, background: "linear-gradient(135deg,#ff6b35,#ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 4 }}>
              Web3 Guides
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#fff" }}>Public Dashboard</h1>
            <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 14 }}>Live stats · Trading bot · Referral performance</p>
          </div>
          <a href="/" style={{ fontSize: 13, color: "#475569", textDecoration: "none" }}>← Back to site</a>
        </div>

        {/* Bot section */}
        <BotPanel />

        <Divider />

        {/* Bot logs */}
        <BotLogs />

        {/* Divider */}
        <Divider />

        {/* ── Support Web3 Guides — Doma fractional share ─────────────── */}
        <div style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(236,72,153,0.10) 100%)",
          border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 16,
          padding: mobile ? "28px 22px" : "40px 44px",
          marginBottom: 28,
          position: "relative" as const,
          overflow: "hidden" as const,
        }}>
          <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", alignItems: mobile ? "flex-start" : "center", justifyContent: "space-between", gap: mobile ? 20 : 32, position: "relative" as const, zIndex: 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 50, padding: "4px 12px", marginBottom: 14 }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#a5b4fc", letterSpacing: 1.2 }}>POWERED BY DOMA PROTOCOL</span>
              </div>
              <h2 style={{ margin: "0 0 10px", fontSize: mobile ? 22 : 26, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>Own a piece of Web3 Guides</h2>
              <p style={{ margin: "0 0 4px", fontSize: 14, color: "#94a3b8", lineHeight: 1.6, maxWidth: 540 }}>
                The web3guides.com domain is fractionalized on Doma Protocol. Buy a share, become a co-owner of the platform, and support the bills that keep the lights on (Claude API, gpt-image, Vercel, Supabase, the trading bot droplet).
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                Built by <a href="https://bigmike.web3guides.com" style={{ color: "#a5b4fc", textDecoration: "none", fontWeight: 700 }}>Big Mike</a> · One person, full-time, since 2018
              </p>
            </div>
            <a href="https://app.doma.xyz/domain/web3guides.com"
               target="_blank" rel="noopener noreferrer"
               style={{
                 display: "inline-flex",
                 alignItems: "center",
                 gap: 8,
                 background: "linear-gradient(135deg, #6366f1, #ec4899)",
                 color: "#fff",
                 fontWeight: 800,
                 fontSize: 14,
                 padding: "13px 26px",
                 borderRadius: 10,
                 textDecoration: "none",
                 boxShadow: "0 8px 24px rgba(99,102,241,0.3)",
                 whiteSpace: "nowrap" as const,
                 flexShrink: 0,
               }}>
              Buy on Doma →
            </a>
          </div>
        </div>

        {/* ── Site Snapshot ────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: "#fff" }}>Site Snapshot</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>Where Web3 Guides stands today</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 14 }}>
          <StatCard label="Guides Published" value={String(guideCount)}            color="#6366f1" />
          <StatCard label="Subdomains"       value={String(VALID_SUBDOMAINS.length)} color="#22c55e" />
          <StatCard label="Email Subscribers" value={String(emailCount)}           color="#f59e0b" />
        </div>

      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SMALL SHARED COMPONENTS
════════════════════════════════════════════════════════════════════════ */
function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color, marginTop: 4, opacity: 0.8 }}>{sub}</div>}
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div style={{ padding: "13px 16px", borderBottom: "1px solid #1e293b", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
      {title}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "0 0 40px" }} />;
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: "24px 16px", textAlign: "center" as const, color: "#334155", fontSize: 13 }}>{text}</div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: "7px 14px", fontSize: 10, fontWeight: 700, color: "#475569", textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
      {children}
    </th>
  );
}

function Td({ children, bold, muted, color }: { children: React.ReactNode; bold?: boolean; muted?: boolean; color?: string }) {
  return (
    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: bold ? 700 : 400, color: color ?? (muted ? "#64748b" : "#cbd5e1") }}>
      {children}
    </td>
  );
}

function SideBadge({ side }: { side?: string }) {
  const isLong = side === "long" || side === "buy";
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: isLong ? "#052e16" : "#1a0a0a", color: isLong ? "#22c55e" : "#ef4444", textTransform: "uppercase" as const }}>
      {side ?? "—"}
    </span>
  );
}
