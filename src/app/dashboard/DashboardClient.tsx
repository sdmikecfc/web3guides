"use client";

import { useEffect, useState } from "react";
import { VALID_SUBDOMAINS } from "@/lib/subdomains";

/* ════════════════════════════════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════════════════════════════════ */

// Update this if you deposit or withdraw from the bot wallet.
// e.g. add $50 → 150. Withdraw $20 → 80.
const INITIAL_BALANCE = 100;
const DOMA_LINK       = "https://app.doma.xyz/domain/web3guides.com";

// First trade — used to compute time-running and APY.
// makemoneyhandoverfist.com $6.00 @ 0.00021503 was the bot's first launch.
const FIRST_LAUNCH = new Date("2026-04-08T04:00:23.832Z");

// LP equity-chart baseline.
// We anchor the LP chart to a fixed point in time + value so the chart,
// "Time Deployed" stat, and "Fee APR" all show real progress since the
// reset moment instead of recomputing on every poll. Update all three
// together if you ever fully exit + redeploy.
//   ⚠ TIME IS UTC. Don't paste your local-time clock here.
const LP_BASELINE_TIME  = new Date("2026-04-26T09:27:00Z");  // 26 Apr 16:27 UTC+7
const LP_BASELINE_VALUE = 75.93;
const LP_BASELINE_FEES  = 0.37;   // lifetime_fees at baseline moment

// LP capital basis — total USD ever deposited into the bot wallet.
// Used as the accounting basis for true Net P&L and IL.
// Update if you ever add or withdraw funds from the LP bot wallet.
const LP_TOTAL_DEPOSITED = 75.00;

/* ── Closed-trade backfill ───────────────────────────────────────────────────
   The /api/bot endpoint only returns the most recent ~12 trades, so the
   equity curve was missing all earlier history. This is the full closed-trade
   record from the bot's launch through 25 Apr 2026. Open positions are
   excluded (they're already counted in the live `total_value`).

   Order matters — these are listed in chronological execution order. When
   timestamps aren't available we distribute them linearly between
   FIRST_LAUNCH and now, which is good enough for visual storytelling. ─── */
const BACKFILL_TRADES: Array<{ symbol: string; pnl: number }> = [
  { symbol: "makemoneyhandoverfist.com", pnl: -0.06 },
  { symbol: "cryptoartworks.art",        pnl: -0.03 },
  { symbol: "diamondcapital.xyz",        pnl: -0.00 },
  { symbol: "battles.xyz",               pnl: +2.25 },
  { symbol: "platinumcoins.xyz",         pnl: -0.10 },
  { symbol: "coolsynthetic.com",         pnl: -0.06 },
  { symbol: "tokenizedacademy.com",      pnl: -0.10 },
  { symbol: "beyondbtc.tech",            pnl: -0.09 },
  { symbol: "bitcoinspectre.com",        pnl: -0.09 },
  { symbol: "codeequity.com",            pnl: +0.39 },
  { symbol: "aipredictlab.xyz",          pnl: -0.04 },
  { symbol: "besttokenization.com",      pnl: +1.10 },
  { symbol: "beautifulcrypto.com",       pnl: +0.64 },
  { symbol: "beefsteaks.xyz",            pnl: -0.02 },
  { symbol: "worldtravels.com",          pnl: +1.66 },
  { symbol: "interstellary.xyz",         pnl: -0.03 },
  { symbol: "webpainting.art",           pnl: -0.03 },
  { symbol: "defibanx.com",              pnl: +0.33 },
  { symbol: "mindproperty.com",          pnl: +0.32 },
  { symbol: "tokenings.com",             pnl: -0.01 },
  { symbol: "emoneytokens.com",          pnl: +1.62 },
  { symbol: "ethunchained.com",          pnl: -0.13 },
  { symbol: "cryptouniverse.art",        pnl: +0.21 },
  { symbol: "bitcoinnoble.com",          pnl: +0.81 },
  { symbol: "filmquiz.fun",              pnl: -0.02 },
  { symbol: "stackfour.com",             pnl: -0.01 },
  { symbol: "relead.xyz",                pnl: -0.28 },
  { symbol: "activedigital.xyz",         pnl: -0.04 },
  { symbol: "redcherry.xyz",             pnl: -0.01 },
  { symbol: "webcitizens.com",           pnl: -0.02 },
  { symbol: "swiftdigital.xyz",          pnl: -0.08 },
  { symbol: "currencyconcept.com",       pnl: -0.02 },
  { symbol: "seamount.xyz",              pnl: -0.02 },
  { symbol: "forestcapital.xyz",         pnl: -0.02 },
  { symbol: "selecthigh.com",            pnl: -0.02 },
  { symbol: "olivecapital.xyz",          pnl: +0.03 },
];

// Color tokens — refined palette
const C = {
  bg:        "#05070f",
  surface:   "#0a0e1c",
  surfaceUp: "#10162a",
  surfaceHi: "#161e3a",
  border:    "rgba(148,163,184,0.07)",
  borderHi:  "rgba(99,102,241,0.20)",
  text:      "#f1f5f9",
  text2:     "#cbd5e1",
  text3:     "#64748b",
  text4:     "#334155",
  text5:     "#1e293b",
  green:     "#10b981",
  greenSoft: "rgba(16,185,129,0.12)",
  red:       "#f43f5e",
  redSoft:   "rgba(244,63,94,0.12)",
  yellow:    "#f59e0b",
  blue:      "#3b82f6",
  purple:    "#8b5cf6",
  indigo:    "#6366f1",
  pink:      "#ec4899",
  orange:    "#ff6b35",
  cyan:      "#06b6d4",
};

/* ════════════════════════════════════════════════════════════════════════
   HOOKS
════════════════════════════════════════════════════════════════════════ */

function useMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 760);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

/* ════════════════════════════════════════════════════════════════════════
   FORMATTERS
════════════════════════════════════════════════════════════════════════ */

function fmtNum(n: number | undefined | null, dec = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPrice(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n === 0) return "0.00";
  if (n < 0.0001) return n.toExponential(4);
  if (n < 0.01)   return n.toFixed(6);
  return n.toFixed(4);
}

function fmtDate(s?: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

function fmtTime(s?: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(s?: string): string {
  if (!s) return "Unknown";
  const d   = new Date(s);
  const now = new Date();
  const isToday      = d.toDateString() === now.toDateString();
  const yesterday    = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday  = d.toDateString() === yesterday.toDateString();
  if (isToday)     return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtAge(seconds: number): string {
  if (seconds < 60)  return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function fmtPct(n: number, dec = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(dec)}%`;
}

/** "2w 3d", "5d 12h", "23h 14m" — total elapsed since `since` */
function fmtRunning(since: Date): string {
  const ms     = Date.now() - since.getTime();
  const totalM = Math.floor(ms / 60_000);
  const days   = Math.floor(totalM / 1440);
  const hours  = Math.floor((totalM % 1440) / 60);
  const mins   = totalM % 60;
  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    const remDays = days - weeks * 7;
    return `${weeks}w ${remDays}d`;
  }
  if (days >= 1) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

/* ════════════════════════════════════════════════════════════════════════
   TYPES
════════════════════════════════════════════════════════════════════════ */

interface BotState   { balance?: number; pnl?: number; updated_at?: string; usdc_balance?: number; total_deployed?: number; total_value?: number; total_pnl?: number; [k: string]: unknown }
interface BotPosition { symbol?: string; side?: string; size?: number; entry_price?: number; current_price?: number; mark_price?: number; pnl?: number; usdc_spent?: number; unrealized_pnl?: number; [k: string]: unknown }
interface BotTrade    { symbol?: string; side?: string; size?: number; price?: number; pnl?: number; timestamp?: string; executed_at?: string; usdc_amount?: number; [k: string]: unknown }
interface BotSummary  { state?: BotState; positions?: BotPosition[]; trades?: BotTrade[]; [k: string]: unknown }

/* ── LP bot types — schema from LP_BOT_DASHBOARD_CONTEXT.md ──────────────── */
interface LPState {
  total_value?:               number;
  deployed_in_lp?:            number;
  idle_balance?:              number;
  total_fees_earned?:         number;
  total_il_usd?:              number;
  total_pnl_usd?:             number;
  total_pnl_pct?:             number;
  active_positions?:          number;
  rebalance_count?:           number;
  lifetime_fees?:             number;
  total_swap_fees_paid_usd?:  number;
  swap_count?:                number;
  wallet_address?:            string;
  first_deployed_at?:         string;
  updated_at?:                string;
  [k: string]: unknown;
}
interface LPPosition {
  id?:                 string;
  nft_token_id?:       number;
  pool?:               string;
  pool_address?:       string;
  protocol?:           string;
  chain?:              string;
  fee_tier?:           number;
  tick_lower?:         number;
  tick_upper?:         number;
  range_low?:          number;
  range_high?:         number;
  current_price?:      number;
  current_tick?:       number;
  in_range?:           boolean;
  proximity_to_edge?:  number;
  liquidity_usd?:      number;
  fees_earned_usd?:    number;
  impermanent_loss?:   number;
  net_pnl?:            number;
  opened_at?:          string;
  amount0_usd?:        number;
  amount1_usd?:        number;
  [k: string]: unknown;
}
interface LPRebalance {
  id?:                  string;
  executed_at?:         string;
  pool?:                string;
  reason?:              string;
  from_tick_lower?:     number;
  from_tick_upper?:     number;
  to_tick_lower?:       number;
  to_tick_upper?:       number;
  from_price?:          number;
  to_price?:            number;
  swap_cost_usd?:       number;     // what the bot paid as a swapper (slippage + 0.05% pool fee)
  swap_count?:          number;
  fees_collected_usd?:  number;     // LP fees claimed on this position (usually 0 during rebal)
  gas_usd?:             number;     // tx gas (not yet tracked)
  [k: string]: unknown;
}
interface LPConfig {
  target_capital_usd?:    number;
  range_pct?:             number;
  rebalance_trigger_pct?: number;
  fee_tier?:              number;
  loop_interval_sec?:     number;
  [k: string]: unknown;
}
interface LPSummary {
  state?:       LPState;
  positions?:   LPPosition[];
  rebalances?:  LPRebalance[];
  config?:      LPConfig;
  error?:       string;
  [k: string]: unknown;
}

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
   GLOBAL STYLES (animations + hover)
════════════════════════════════════════════════════════════════════════ */

const GLOBAL_CSS = `
  @keyframes pulseDot {
    0%, 100% { transform: scale(1);   opacity: 1;   }
    50%      { transform: scale(1.6); opacity: 0.4; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes drawLine {
    from { stroke-dashoffset: var(--len, 2000); }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes float1 {
    0%, 100% { transform: translate(0, 0); }
    50%      { transform: translate(40px, -30px); }
  }
  @keyframes float2 {
    0%, 100% { transform: translate(0, 0); }
    50%      { transform: translate(-30px, 25px); }
  }
  @keyframes float3 {
    0%, 100% { transform: translate(0, 0); }
    50%      { transform: translate(20px, 40px); }
  }
  @keyframes gridDrift {
    from { transform: translate(0, 0); }
    to   { transform: translate(32px, 32px); }
  }
  @keyframes scanline {
    0%   { transform: translateY(-100%); opacity: 0; }
    50%  { opacity: 0.6; }
    100% { transform: translateY(100%); opacity: 0; }
  }
  .dash-card {
    transition: border-color 220ms ease, transform 220ms ease, box-shadow 220ms ease;
  }
  .dash-card:hover {
    border-color: ${C.borderHi};
    transform: translateY(-2px);
    box-shadow: 0 12px 40px -12px rgba(99,102,241,0.18);
  }
  .dash-tab {
    transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
  }
  .dash-tab:hover {
    background: rgba(99,102,241,0.08);
    color: ${C.text};
  }
  .dash-row {
    transition: background 160ms ease;
  }
  .dash-row:hover {
    background: rgba(99,102,241,0.04);
  }
  .dash-btn-primary {
    transition: transform 200ms ease, box-shadow 200ms ease;
  }
  .dash-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 48px -8px rgba(236,72,153,0.45);
  }
  .dash-link:hover {
    color: ${C.text} !important;
  }
  .dash-pulse {
    animation: pulseDot 1.8s ease-in-out infinite;
  }
  .dash-spin {
    animation: spin 1s linear infinite;
  }
  .dash-fade-in {
    animation: slideUp 380ms ease both;
  }
  .dash-stagger > * {
    animation: slideUp 500ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .dash-stagger > *:nth-child(1) { animation-delay:  60ms; }
  .dash-stagger > *:nth-child(2) { animation-delay: 120ms; }
  .dash-stagger > *:nth-child(3) { animation-delay: 180ms; }
  .dash-stagger > *:nth-child(4) { animation-delay: 240ms; }
  .dash-stagger > *:nth-child(5) { animation-delay: 300ms; }
  .dash-stagger > *:nth-child(6) { animation-delay: 360ms; }
  .dash-orb {
    will-change: transform;
    pointer-events: none;
  }
  .dash-orb-1 { animation: float1 14s ease-in-out infinite; }
  .dash-orb-2 { animation: float2 18s ease-in-out infinite; }
  .dash-orb-3 { animation: float3 22s ease-in-out infinite; }
  .dash-equity-line {
    stroke-dasharray: var(--len, 2000);
    animation: drawLine 1600ms cubic-bezier(0.65, 0, 0.35, 1) forwards;
  }
  .dash-equity-fill {
    animation: fadeIn 900ms ease 800ms both;
  }
  .dash-equity-dot {
    animation: fadeIn 400ms ease 1500ms both;
  }
  .dash-bg-grid {
    position: absolute;
    inset: -1px;
    background-image:
      linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px);
    background-size: 32px 32px;
    animation: gridDrift 6s linear infinite;
    mask-image: radial-gradient(ellipse 60% 80% at 50% 50%, black 0%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse 60% 80% at 50% 50%, black 0%, transparent 75%);
    pointer-events: none;
  }
  /* Custom scrollbars */
  .dash-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
  .dash-scroll::-webkit-scrollbar-track { background: transparent; }
  .dash-scroll::-webkit-scrollbar-thumb { background: ${C.surfaceHi}; border-radius: 3px; }
  .dash-scroll::-webkit-scrollbar-thumb:hover { background: ${C.borderHi}; }
`;

/* ════════════════════════════════════════════════════════════════════════
   TINY COMPONENTS
════════════════════════════════════════════════════════════════════════ */

function Pulse({ color = C.green }: { color?: string }) {
  return (
    <span style={{ position: "relative" as const, display: "inline-block", width: 8, height: 8 }}>
      <span style={{ position: "absolute" as const, inset: 0, borderRadius: "50%", background: color, opacity: 0.6 }} className="dash-pulse" />
      <span style={{ position: "absolute" as const, inset: 0, borderRadius: "50%", background: color }} />
    </span>
  );
}

function SideBadge({ side }: { side?: string }) {
  const s     = (side ?? "").toLowerCase();
  const isLong = s === "long" || s === "buy";
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
      background: isLong ? C.greenSoft : C.redSoft,
      color:      isLong ? C.green     : C.red,
      letterSpacing: 0.6, textTransform: "uppercase" as const,
      border: `1px solid ${isLong ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.25)"}`,
    }}>
      {side ?? "—"}
    </span>
  );
}

function Tag({ children, color = C.indigo }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: "3px 9px", borderRadius: 50,
      background: `${color}1a`, color, border: `1px solid ${color}40`,
      letterSpacing: 0.8, textTransform: "uppercase" as const,
      fontFamily: "'Space Mono', monospace",
    }}>
      {children}
    </span>
  );
}

/* ── EquityChart — SVG area chart of cumulative portfolio value ── */
type EqPt = { time: number; value: number };

function EquityChart({
  points,
  height = 180,
  baseline,
}: {
  points: EqPt[];
  height?: number;
  /** Reference value for the dashed baseline + up/down color decision.
   *  Defaults to the auto-sniper's INITIAL_BALANCE if unset. */
  baseline?: number;
}) {
  if (points.length < 2) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.text4, fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
        Not enough trade data to plot yet
      </div>
    );
  }

  const W = 1000; // viewBox width — scales responsively via viewBox
  const H = height;
  const padX = 0;
  const padY = 14;

  const ref  = baseline ?? INITIAL_BALANCE;
  const tMin = points[0].time;
  const tMax = points[points.length - 1].time;
  const vals = points.map(p => p.value);
  // Add a tiny pad to vMin/vMax so the line isn't pinned to the top or bottom edge
  const rawMin = Math.min(...vals, ref);
  const rawMax = Math.max(...vals, ref);
  const span   = Math.max(0.01, rawMax - rawMin);
  const vMin   = rawMin - span * 0.15;
  const vMax   = rawMax + span * 0.15;

  const x = (t: number) => padX + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - 2 * padX);
  const y = (v: number) => H - padY - ((v - vMin) / Math.max(0.0001, vMax - vMin)) * (H - 2 * padY);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.time).toFixed(2)} ${y(p.value).toFixed(2)}`)
    .join(" ");
  const fillPath =
    `${linePath} L ${x(tMax).toFixed(2)} ${(H - padY).toFixed(2)} L ${x(tMin).toFixed(2)} ${(H - padY).toFixed(2)} Z`;

  const baselineY = y(ref);
  const last      = points[points.length - 1];
  const isUp      = last.value >= ref;
  const lineColor = isUp ? C.green : C.red;
  const fillColor = isUp ? "url(#eqGradGreen)" : "url(#eqGradRed)";

  // Generate ~5 evenly spaced X labels — adaptive format based on time span:
  //   < 24h        → "HH:MM" (e.g. "09:27")
  //   24h–7d       → "DD MMM HH:MM" (e.g. "26 Apr 09:27")
  //   > 7d         → "DD MMM" (e.g. "26 Apr")
  const totalSpanMs = tMax - tMin;
  const fmtAxis = (t: number): string => {
    const d = new Date(t);
    if (totalSpanMs < 86400_000) {
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } else if (totalSpanMs < 7 * 86400_000) {
      const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      return `${date} ${time}`;
    }
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };
  const labelCount = 5;
  const labels: { x: number; label: string }[] = [];
  for (let i = 0; i < labelCount; i++) {
    const frac = i / (labelCount - 1);
    const t = tMin + frac * (tMax - tMin);
    labels.push({ x: x(t), label: fmtAxis(t) });
  }

  // Generate 5 evenly spaced Y ticks (top, bottom, and three between)
  const yTickCount = 5;
  const yTicks: { yPct: number; value: number }[] = [];
  for (let i = 0; i < yTickCount; i++) {
    const frac = i / (yTickCount - 1);
    const v = vMax - frac * (vMax - vMin);
    yTicks.push({ yPct: ((y(v)) / H) * 100, value: v });
  }
  // Smart y-label formatter (more precision for tight ranges)
  const yFmt = (v: number) =>
    span < 1     ? `$${v.toFixed(3)}` :
    span < 10    ? `$${v.toFixed(2)}` :
    span < 100   ? `$${v.toFixed(1)}` :
                   `$${Math.round(v)}`;

  return (
    <div style={{ width: "100%", position: "relative" as const, paddingLeft: 56 }}>
      {/* Y-axis labels — HTML overlay so SVG aspect-ratio stretching doesn't squish them */}
      <div style={{ position: "absolute" as const, left: 0, top: 0, width: 52, height: H, pointerEvents: "none" as const }}>
        {yTicks.map((t, i) => (
          <div key={i} style={{
            position: "absolute" as const,
            top: `${t.yPct}%`,
            transform: "translateY(-50%)",
            right: 6,
            fontFamily: "'Space Mono', monospace",
            fontSize: 9.5,
            color: i === 0 || i === yTicks.length - 1 ? C.text3 : C.text4,
            letterSpacing: 0.3,
            whiteSpace: "nowrap" as const,
          }}>
            {yFmt(t.value)}
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: H }}>
        <defs>
          <linearGradient id="eqGradGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={C.green} stopOpacity="0.32" />
            <stop offset="100%" stopColor={C.green} stopOpacity="0"    />
          </linearGradient>
          <linearGradient id="eqGradRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={C.red}   stopOpacity="0.32" />
            <stop offset="100%" stopColor={C.red}   stopOpacity="0"    />
          </linearGradient>
        </defs>

        {/* Y-axis horizontal grid lines */}
        {yTicks.map((t, i) => (
          <line
            key={i}
            x1={0}
            y1={(t.yPct / 100) * H}
            x2={W}
            y2={(t.yPct / 100) * H}
            stroke={C.text5}
            strokeWidth={0.5}
            strokeOpacity={0.55}
          />
        ))}

        {/* Initial balance baseline */}
        <line x1={0} y1={baselineY} x2={W} y2={baselineY}
              stroke={C.text5} strokeWidth={1} strokeDasharray="4,5" />

        {/* Filled area */}
        <path d={fillPath} fill={fillColor} className="dash-equity-fill" />

        {/* Line */}
        <path
          d={linePath}
          stroke={lineColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="dash-equity-line"
          style={{
            filter: `drop-shadow(0 0 8px ${lineColor}60)`,
            ["--len" as string]: `${W * 2}`,
          } as React.CSSProperties}
        />

        {/* Last point dot + pulsing halo */}
        <g className="dash-equity-dot">
          <circle
            cx={x(last.time)} cy={y(last.value)} r={4.5}
            fill="none" stroke={lineColor} strokeWidth={1.5} opacity={0.5}
            className="dash-pulse"
            style={{ transformOrigin: `${x(last.time)}px ${y(last.value)}px` }}
          />
          <circle
            cx={x(last.time)} cy={y(last.value)} r={4.5}
            fill={lineColor} stroke="#0a0e1c" strokeWidth={2}
          />
        </g>
      </svg>

      {/* X-axis labels (rendered as a flex row, scales with container) */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "0 2px", fontSize: 10, fontFamily: "'Space Mono', monospace", color: C.text4, letterSpacing: 0.5 }}>
        {labels.map((l, i) => (
          <span key={i}>{l.label}</span>
        ))}
      </div>
    </div>
  );
}

/* P&L bar — visual strength of profit/loss for a position
   pct can be -100 to +100, with magnitude representing intensity */
function PnLBar({ pct }: { pct: number }) {
  const clamped = Math.max(-25, Math.min(25, pct));
  const width   = (Math.abs(clamped) / 25) * 50; // half-width up to 50%
  const isPos   = clamped >= 0;
  return (
    <div style={{ position: "relative" as const, height: 4, background: C.surfaceHi, borderRadius: 2, overflow: "hidden" as const }}>
      <div style={{ position: "absolute" as const, top: 0, bottom: 0, left: "50%", width: 1, background: C.text5 }} />
      <div style={{
        position: "absolute" as const, top: 0, bottom: 0,
        left:  isPos ? "50%" : `${50 - width}%`,
        width: `${width}%`,
        background: isPos
          ? `linear-gradient(90deg, ${C.green}, ${C.cyan})`
          : `linear-gradient(90deg, ${C.red}, ${C.orange})`,
        borderRadius: 2,
        boxShadow: `0 0 8px ${isPos ? "rgba(16,185,129,0.5)" : "rgba(244,63,94,0.5)"}`,
      }} />
    </div>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 3, background: C.surfaceHi, borderRadius: 2, overflow: "hidden" as const, marginTop: 8 }}>
      <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 2, boxShadow: `0 0 6px ${color}80` }} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   BOT PANEL — hero + metrics + positions + trades
════════════════════════════════════════════════════════════════════════ */

function BotPanel() {
  const mobile                  = useMobile();
  const [data, setData]         = useState<BotSummary | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [lastUpdated, setLast]  = useState<Date | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setR]      = useState(false);
  const [age, setAge]           = useState(0);

  async function fetchBot() {
    setR(true);
    try {
      const res  = await fetch("/api/bot", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
      setData(json);
      setError(null);
      setLast(new Date());
    } catch { setError("Bot unreachable"); }
    finally  { setLoading(false); setR(false); }
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
  const balance     = (state.usdc_balance as number) ?? (state.balance as number) ?? 0;
  const deployed    = (state.total_deployed as number) ?? 0;
  const totalValue  = (state.total_value    as number) ?? balance;
  const unrealized  = positions.reduce((s, p) => s + ((p.unrealized_pnl as number) ?? (p.pnl as number) ?? 0), 0);
  const totalProfit = totalValue - INITIAL_BALANCE;
  const profitPct   = (totalProfit / INITIAL_BALANCE) * 100;
  const deployedPct = totalValue > 0 ? (deployed   / totalValue) * 100 : 0;
  const balancePct  = totalValue > 0 ? (balance    / totalValue) * 100 : 0;
  const avgSize     = positions.length > 0 ? deployed / positions.length : 0;

  /* ── Time running + annualised return ─────────────────────────── */
  const daysRunning   = Math.max(1, (Date.now() - FIRST_LAUNCH.getTime()) / 86400_000);
  const apyPct        = profitPct * (365 / daysRunning);
  const dailyAvgPct   = profitPct / daysRunning;
  const runningStr    = fmtRunning(FIRST_LAUNCH);

  const profitColor     = totalProfit >= 0 ? C.green : C.red;
  const unrealizedColor = unrealized   >= 0 ? C.green : C.red;
  const apyColor        = apyPct       >= 0 ? C.green : C.red;
  const online          = !error && !loading && !!data;

  /* ── Equity curve — built from the BACKFILL_TRADES history ────── */
  /* We use the static backfill (not the live API trades) because the API
     only returns ~12 most-recent trades, which would produce a broken,
     near-flat curve. The backfill is the full closed-trade record.
     Timestamps are distributed linearly between FIRST_LAUNCH and now,
     which preserves the *shape* of the curve even without exact times. */
  const equityPoints = (() => {
    const t0  = FIRST_LAUNCH.getTime();
    const tN  = Date.now();
    const n   = BACKFILL_TRADES.length;
    const pts: Array<{ time: number; value: number }> = [];

    // Start point
    pts.push({ time: t0, value: INITIAL_BALANCE });

    // Linearly distribute trades over the running window
    let cum = 0;
    BACKFILL_TRADES.forEach((tr, i) => {
      cum += tr.pnl;
      const frac = (i + 1) / (n + 1);             // never lands on tN exactly
      const time = t0 + frac * (tN - t0);
      pts.push({ time, value: INITIAL_BALANCE + cum });
    });

    // End point — current total value (includes unrealised on open positions)
    pts.push({ time: tN, value: totalValue });
    return pts;
  })();

  const totalClosedTrades = BACKFILL_TRADES.length;

  /* ── Group trades by day ────────────────────────────────────── */
  const tradesByDay = trades.slice(0, 24).reduce<Record<string, BotTrade[]>>((acc, t) => {
    const ts  = (t.executed_at as string) ?? t.timestamp ?? "";
    const day = fmtDay(ts);
    (acc[day] = acc[day] ?? []).push(t);
    return acc;
  }, {});

  return (
    <section style={{ marginBottom: 56 }}>

      {/* ── Section title ───────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Pulse color={online ? C.green : error ? C.red : C.text3} />
          <h2 style={{ margin: 0, fontFamily: "'Bungee', cursive", fontSize: 22, color: C.text, letterSpacing: 0.3 }}>
            Trading Bot
          </h2>
          <Tag color={online ? C.green : C.text3}>
            {loading ? "Connecting" : online ? "Live" : "Offline"}
          </Tag>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: C.text3, fontFamily: "'Space Mono', monospace" }}>
          {!!state.updated_at && (
            <span>BOT WROTE · {fmtDate(state.updated_at as string)}</span>
          )}
          {lastUpdated && (
            <span style={{ color: C.text4 }}>FETCHED {fmtAge(age)} AGO</span>
          )}
          <button
            onClick={fetchBot}
            style={{
              background: C.surfaceUp, border: `1px solid ${C.borderHi}`, borderRadius: 8,
              color: C.text2, fontSize: 13, padding: "6px 10px", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 30,
            }}
            className="dash-tab"
            aria-label="Refresh"
          >
            <span className={refreshing ? "dash-spin" : ""}>↻</span>
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: "center" as const, color: C.text4, fontSize: 14 }}>
          <span className="dash-spin" style={{ display: "inline-block", marginRight: 10, fontSize: 16 }}>◌</span>
          Connecting to bot…
        </div>
      )}

      {error && !loading && (
        <div style={{ background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 14, padding: "18px 22px", color: "#fca5a5", fontSize: 13 }}>
          ⚠️ {error} — droplet may be sleeping or rate-limited.
        </div>
      )}

      {data && !error && (
        <div className="dash-fade-in">

          {/* ── HERO — Big total value card ──────────────────────────── */}
          <div style={{
            position: "relative" as const,
            background: `
              radial-gradient(circle at 0% 0%, rgba(99,102,241,0.10) 0%, transparent 50%),
              radial-gradient(circle at 100% 100%, rgba(236,72,153,0.08) 0%, transparent 50%),
              ${C.surface}
            `,
            border: `1px solid ${C.borderHi}`,
            borderRadius: 20,
            padding: mobile ? "26px 22px" : "32px 36px",
            marginBottom: 18,
            overflow: "hidden" as const,
          }}>
            {/* Animated grid backdrop */}
            <div className="dash-bg-grid" />

            {/* Floating data orbs */}
            <svg
              aria-hidden
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <defs>
                <radialGradient id="orbGreen" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={C.green} stopOpacity="0.5" />
                  <stop offset="60%"  stopColor={C.green} stopOpacity="0.08" />
                  <stop offset="100%" stopColor={C.green} stopOpacity="0" />
                </radialGradient>
                <radialGradient id="orbIndigo" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={C.indigo} stopOpacity="0.5" />
                  <stop offset="60%"  stopColor={C.indigo} stopOpacity="0.08" />
                  <stop offset="100%" stopColor={C.indigo} stopOpacity="0" />
                </radialGradient>
                <radialGradient id="orbCyan" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={C.cyan} stopOpacity="0.4" />
                  <stop offset="60%"  stopColor={C.cyan} stopOpacity="0.06" />
                  <stop offset="100%" stopColor={C.cyan} stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="15" cy="30" r="14" fill="url(#orbIndigo)" className="dash-orb dash-orb-1" />
              <circle cx="85" cy="70" r="18" fill="url(#orbGreen)"  className="dash-orb dash-orb-2" />
              <circle cx="55" cy="20" r="11" fill="url(#orbCyan)"   className="dash-orb dash-orb-3" />
            </svg>

            <div style={{ position: "relative" as const, zIndex: 1, display: "flex", flexDirection: mobile ? "column" : "row", alignItems: mobile ? "flex-start" : "flex-end", justifyContent: "space-between", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: 12, fontFamily: "'Space Mono', monospace" }}>
                  Total Portfolio Value
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" as const }}>
                  <div style={{
                    fontFamily: "'Bungee', cursive",
                    fontSize: mobile ? 44 : 64,
                    color: C.text,
                    lineHeight: 1,
                    letterSpacing: -1,
                    background: `linear-gradient(135deg, ${C.text} 0%, #cbd5e1 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>
                    ${fmtNum(totalValue)}
                  </div>
                  <div style={{ fontSize: 13, color: C.text3, fontWeight: 700, letterSpacing: 0.5 }}>
                    {unit}
                  </div>
                </div>
                {/* Profit ribbon */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  marginTop: 14,
                  background: totalProfit >= 0 ? C.greenSoft : C.redSoft,
                  border: `1px solid ${totalProfit >= 0 ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
                  color: profitColor,
                  borderRadius: 50, padding: "5px 14px", fontSize: 13, fontWeight: 800,
                }}>
                  <span>{totalProfit >= 0 ? "▲" : "▼"}</span>
                  <span>${fmtNum(Math.abs(totalProfit))}</span>
                  <span style={{ opacity: 0.65 }}>·</span>
                  <span>{fmtPct(profitPct)}</span>
                </div>
              </div>

              {/* Right-side mini stats — 2x2 grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minWidth: mobile ? "100%" : 320 }}>
                <MiniStat label="Open Positions" value={String(positions.length)}      accent={positions.length > 0 ? C.yellow : C.text4} />
                <MiniStat label="Avg Position"   value={`$${fmtNum(avgSize)}`}         accent={C.purple} />
                <MiniStat label="Time Running"   value={runningStr}                    accent={C.cyan}   sub={`since ${FIRST_LAUNCH.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`} />
                <MiniStat label="APY"            value={fmtPct(apyPct, 1)}             accent={apyColor} sub={`${fmtPct(dailyAvgPct, 2)}/day avg`} />
              </div>
            </div>

            {/* Allocation bar */}
            <div style={{ marginTop: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Space Mono', monospace", color: C.text3, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" as const }}>
                <span>Capital Allocation</span>
                <span>{deployedPct.toFixed(0)}% deployed</span>
              </div>
              <div style={{ display: "flex", height: 8, background: C.surfaceUp, borderRadius: 4, overflow: "hidden" as const }}>
                <div style={{
                  width: `${deployedPct}%`,
                  background: `linear-gradient(90deg, ${C.purple}, ${C.indigo})`,
                  boxShadow: `0 0 12px ${C.purple}80`,
                }} />
                <div style={{
                  width: `${balancePct}%`,
                  background: `linear-gradient(90deg, ${C.cyan}, ${C.blue})`,
                  boxShadow: `0 0 12px ${C.blue}80`,
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                <span style={{ color: C.purple }}>● Deployed ${fmtNum(deployed)}</span>
                <span style={{ color: C.blue }}>${fmtNum(balance)} Available ●</span>
              </div>
            </div>
          </div>

          {/* ── SECONDARY METRICS GRID ──────────────────────────────── */}
          <div className="dash-stagger" style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
            <DataCard
              label="Available"
              value={`$${fmtNum(balance)}`}
              sub={`${balancePct.toFixed(0)}% of portfolio`}
              accent={C.blue}
              progress={balancePct}
            />
            <DataCard
              label="Deployed"
              value={`$${fmtNum(deployed)}`}
              sub={`${deployedPct.toFixed(0)}% of portfolio`}
              accent={C.purple}
              progress={deployedPct}
            />
            <DataCard
              label="Total Profit"
              value={`${totalProfit >= 0 ? "+" : "-"}$${fmtNum(Math.abs(totalProfit))}`}
              sub={`vs $${INITIAL_BALANCE} initial`}
              accent={profitColor}
              direction={totalProfit >= 0 ? "up" : "down"}
            />
            <DataCard
              label="Unrealised P&L"
              value={`${unrealized >= 0 ? "+" : "-"}$${fmtNum(Math.abs(unrealized))}`}
              sub={`across ${positions.length} position${positions.length === 1 ? "" : "s"}`}
              accent={unrealizedColor}
              direction={unrealized >= 0 ? "up" : "down"}
            />
          </div>

          {/* ── EQUITY CURVE ────────────────────────────────────────── */}
          <div className="dash-card" style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: mobile ? "20px 18px" : "24px 26px",
            marginBottom: 28,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" as const, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: profitColor, fontSize: 14 }}>◢</span>
                <span style={{
                  fontSize: 12, fontWeight: 800, color: C.text2,
                  letterSpacing: 0.6, textTransform: "uppercase" as const,
                  fontFamily: "'Space Mono', monospace",
                }}>
                  Equity Curve
                </span>
                <Tag color={profitColor}>{fmtPct(profitPct)} all-time</Tag>
              </div>
              <span style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5 }}>
                {totalClosedTrades} CLOSED TRADES · ${INITIAL_BALANCE} STARTING
              </span>
            </div>
            <EquityChart points={equityPoints} height={mobile ? 140 : 200} />
          </div>

          {/* ── POSITIONS — full-width tabular ──────────────────────── */}
          <div className="dash-card" style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: "hidden" as const,
            marginBottom: 18,
          }}>
            <PanelHead
              title="Active Positions"
              count={positions.length}
              accent={C.purple}
              icon="◈"
            />
            {positions.length === 0 ? (
              <Empty text="No open positions" />
            ) : (
              <div className="dash-scroll" style={{ overflowX: "auto" as const }}>
                <table style={{ width: "100%", borderCollapse: "collapse" as const, minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: "rgba(99,102,241,0.04)", borderBottom: `1px solid ${C.border}` }}>
                      {["Symbol", "Side", "Cost", "Entry", "Mark", "Δ", "Unrealised P&L"].map((h, i) => (
                        <th key={h} style={{
                          padding: "11px 18px",
                          fontSize: 10, fontWeight: 800, color: C.text3,
                          textAlign: i >= 2 ? "right" as const : "left" as const,
                          letterSpacing: 1, textTransform: "uppercase" as const,
                          fontFamily: "'Space Mono', monospace",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p, i) => {
                      const entry  = p.entry_price as number ?? 0;
                      const mark   = (p.mark_price as number) ?? (p.current_price as number) ?? entry;
                      const pnl    = (p.unrealized_pnl as number) ?? (p.pnl as number) ?? 0;
                      const spent  = (p.usdc_spent as number) ?? p.size ?? 0;
                      const pnlPct = spent > 0 ? (pnl / spent) * 100 : 0;
                      const isPos  = pnl >= 0;
                      const color  = isPos ? C.green : C.red;

                      return (
                        <tr key={i} className="dash-row" style={{ borderTop: `1px solid ${C.border}` }}>
                          {/* Symbol */}
                          <td style={{ padding: "16px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{
                                width: 8, height: 8, borderRadius: "50%",
                                background: color,
                                boxShadow: `0 0 8px ${color}80`,
                                flexShrink: 0,
                              }} />
                              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                                {p.symbol ?? "—"}
                              </span>
                            </div>
                          </td>
                          {/* Side */}
                          <td style={{ padding: "16px 18px" }}>
                            <SideBadge side="long" />
                          </td>
                          {/* Cost */}
                          <td style={{ padding: "16px 18px", textAlign: "right" as const, fontFamily: "'Space Mono', monospace", fontSize: 13, color: C.text2 }}>
                            ${fmtNum(spent)}
                          </td>
                          {/* Entry */}
                          <td style={{ padding: "16px 18px", textAlign: "right" as const, fontFamily: "'Space Mono', monospace", fontSize: 12, color: C.text3 }}>
                            {fmtPrice(entry)}
                          </td>
                          {/* Mark */}
                          <td style={{ padding: "16px 18px", textAlign: "right" as const, fontFamily: "'Space Mono', monospace", fontSize: 13, color: C.text }}>
                            {fmtPrice(mark)}
                          </td>
                          {/* Change */}
                          <td style={{ padding: "16px 18px", textAlign: "right" as const, fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color }}>
                            <span style={{ marginRight: 4 }}>{isPos ? "▲" : "▼"}</span>
                            {fmtPct(pnlPct, 2).replace("+", "").replace("-", "")}
                          </td>
                          {/* P&L */}
                          <td style={{ padding: "16px 18px", textAlign: "right" as const }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "'Space Mono', monospace" }}>
                              {isPos ? "+" : "-"}${fmtNum(Math.abs(pnl))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── TRADES ──────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 18 }}>

            {/* ── Recent Trades ──────────────────────────────────── */}
            <div className="dash-card" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" as const }}>
              <PanelHead
                title="Recent Trades"
                count={trades.length}
                accent={C.cyan}
                icon="⇌"
              />
              {trades.length === 0 ? (
                <Empty text="No trades yet" />
              ) : (
                <div className="dash-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
                  {Object.entries(tradesByDay).map(([day, tradesForDay]) => (
                    <div key={day}>
                      <div style={{
                        padding: "9px 18px",
                        background: "rgba(99,102,241,0.04)",
                        borderTop:    `1px solid ${C.border}`,
                        borderBottom: `1px solid ${C.border}`,
                        fontSize: 10, fontWeight: 800, color: C.text3,
                        letterSpacing: 1.4, textTransform: "uppercase" as const,
                        fontFamily: "'Space Mono', monospace",
                      }}>
                        {day}
                      </div>
                      {tradesForDay.map((t, i) => {
                        const pnl  = t.pnl as number | undefined;
                        const isPos = (pnl ?? 0) >= 0;
                        const color = pnl === undefined ? C.text3 : isPos ? C.green : C.red;
                        return (
                          <div key={i} className="dash-row" style={{
                            padding: "10px 18px",
                            borderTop: i > 0 ? `1px solid ${C.border}` : undefined,
                            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                          }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: C.text4 }}>
                                  {fmtTime((t.executed_at as string) ?? t.timestamp)}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                  {t.symbol ?? "—"}
                                </span>
                                <SideBadge side={t.side} />
                              </div>
                              <div style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace" }}>
                                ${fmtNum((t.usdc_amount as number) ?? t.size)} @ {fmtPrice(t.price as number)}
                              </div>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "'Space Mono', monospace" }}>
                              {pnl === undefined ? "—" : `${pnl >= 0 ? "+" : ""}${fmtNum(pnl)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   LP PANEL — Concentrated liquidity bot
════════════════════════════════════════════════════════════════════════ */

/* Thermostat-style range visualizer:
   shows current price as a glowing dot inside the deployed range bar.
   In-range = indigo bar with green dot.
   Out-of-range = red dot pinned to the edge it crossed.                 */
function RangeBar({ pos }: { pos: LPPosition }) {
  const lo = pos.range_low  ?? 0;
  const hi = pos.range_high ?? 1;
  const cp = pos.current_price ?? lo;
  const pct = hi > lo ? Math.max(0, Math.min(1, (cp - lo) / (hi - lo))) : 0.5;
  const inRange = !!pos.in_range;
  const proximity = pos.proximity_to_edge ?? 0;

  const dotColor = inRange
    ? proximity > 0.7 ? C.yellow : C.green
    : C.red;

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: C.text3, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace" }}>
          Active Range
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
          <span style={{ color: dotColor, fontWeight: 700, letterSpacing: 0.5 }}>
            {inRange
              ? proximity > 0.7 ? `Edge of range · ${(proximity * 100).toFixed(0)}%`
              : `In range · ${(proximity * 100).toFixed(0)}% from edge`
              : "OUT OF RANGE"}
          </span>
        </span>
      </div>

      {/* Bar */}
      <div style={{ position: "relative" as const, height: 36 }}>
        <div style={{
          position: "absolute" as const, inset: "12px 0",
          background: inRange
            ? `linear-gradient(90deg, ${C.indigo}30, ${C.cyan}40, ${C.indigo}30)`
            : `linear-gradient(90deg, ${C.red}30, #1e293b)`,
          border: `1px solid ${inRange ? "rgba(99,102,241,0.35)" : "rgba(244,63,94,0.35)"}`,
          borderRadius: 6,
        }} />
        {/* Tick marks at 25/50/75 */}
        {[0.25, 0.5, 0.75].map(t => (
          <div key={t} style={{
            position: "absolute" as const, top: 12, bottom: 12,
            left: `${t * 100}%`, width: 1, background: "rgba(255,255,255,0.06)",
          }} />
        ))}
        {/* Current price marker */}
        <div style={{
          position: "absolute" as const,
          left: `calc(${pct * 100}% - 1px)`,
          top: 4, bottom: 4, width: 2,
          background: dotColor,
          boxShadow: `0 0 12px ${dotColor}`,
        }} />
        <div style={{
          position: "absolute" as const,
          left: `calc(${pct * 100}% - 7px)`,
          top: 11, width: 14, height: 14, borderRadius: "50%",
          background: dotColor,
          border: `2px solid ${C.surface}`,
          boxShadow: `0 0 16px ${dotColor}, 0 0 4px ${dotColor}`,
        }} />
      </div>

      {/* Labels under bar */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
        <span style={{ color: C.text4 }}>{fmtPrice(lo)}</span>
        <span style={{ color: C.text }}>
          <span style={{ color: C.text4, marginRight: 6 }}>NOW</span>
          {fmtPrice(cp)}
        </span>
        <span style={{ color: C.text4 }}>{fmtPrice(hi)}</span>
      </div>
    </div>
  );
}

/* Helper: relative time like "2d ago" / "3h ago" / "Just now" */
function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)      return "Just now";
  if (ms < 3600_000)    return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000)   return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

function LPPanel() {
  const mobile                  = useMobile();
  const [data, setData]         = useState<LPSummary | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [lastUpdated, setLast]  = useState<Date | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setR]      = useState(false);
  const [age, setAge]           = useState(0);

  async function fetchLP() {
    setR(true);
    try {
      const res  = await fetch("/api/lp", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
      setData(json);
      setError(null);
      setLast(new Date());
    } catch { setError("LP bot unreachable"); }
    finally  { setLoading(false); setR(false); }
  }

  useEffect(() => {
    fetchLP();
    const t = setInterval(fetchLP, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAge(lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0), 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  const state      = data?.state ?? {};
  const positions  = data?.positions ?? [];
  const rebalances = data?.rebalances ?? [];

  const totalValue   = state.total_value      ?? 0;
  const deployed     = state.deployed_in_lp   ?? 0;
  const idle         = state.idle_balance     ?? 0;
  const fees         = state.total_fees_earned ?? state.lifetime_fees ?? 0;
  const swapFees     = state.total_swap_fees_paid_usd ?? 0;
  const swapCount    = state.swap_count ?? 0;
  // Compute Net P&L from what's verifiable on-chain: current total value
  // minus the actual capital deposited. Then back-derive IL as the residual
  // that explains the rest. The API's total_il_usd is broken by
  // increaseLiquidity compounds (it counts compounded fees as outperformance)
  // so we ignore it and recompute here.
  const netPnl       = totalValue - LP_TOTAL_DEPOSITED;
  // IL (price effect on LP composition) = Net P&L − fees + swap costs
  //   - if LP outperformed HODL: IL is positive
  //   - if LP underperformed HODL: IL is negative
  const il           = netPnl - fees + swapFees;
  const pnlPct       = LP_TOTAL_DEPOSITED > 0
    ? (netPnl / LP_TOTAL_DEPOSITED) * 100
    : 0;
  const activeCount  = state.active_positions ?? positions.length;
  const rebalCount   = state.rebalance_count  ?? rebalances.length;

  const deployedPct = totalValue > 0 ? (deployed / totalValue) * 100 : 0;
  const idlePct     = totalValue > 0 ? (idle     / totalValue) * 100 : 0;

  const pnlColor  = netPnl >= 0 ? C.green : C.red;
  const ilColor   = il     >= 0 ? C.green : C.red;
  const online    = !error && !loading && !!data;

  // APR / time deployed — anchored to LP_BASELINE_TIME so the dashboard tells
  // a consistent post-reset story. Only fees earned since baseline are
  // counted in the APR projection. We floor at 1 hour to avoid divide-by-zero
  // and absurd numbers right after a reset, but otherwise use real elapsed time.
  const daysSinceBaseline = Math.max(
    1 / 24,
    (Date.now() - LP_BASELINE_TIME.getTime()) / 86400_000
  );
  const feesSinceBaseline = Math.max(0, fees - LP_BASELINE_FEES);
  const apyPct = totalValue > 0
    ? (feesSinceBaseline / daysSinceBaseline) * 365 / totalValue * 100
    : 0;
  const dailyAvgPct = totalValue > 0
    ? (feesSinceBaseline / totalValue / daysSinceBaseline) * 100
    : 0;
  const timeDeployedStr = fmtRunning(LP_BASELINE_TIME);

  const activePos = positions[0];

  /* ── Equity curve from sparse LP data ─────────────────────────
     Without periodic snapshots from the bot, we approximate:
       start  = (first_deployed_at, totalValue − lifetimeFees)
       step   = each rebalance bumps cumulative fees
       end    = (now, totalValue)
     Once the bot starts emitting per-tick snapshots this gets richer. */
  // Equity chart uses a fixed baseline snapshot (LP_BASELINE_TIME / VALUE)
  // so it shows real progression instead of recomputing start-point on every poll.
  const lpInitialValue = LP_BASELINE_VALUE;
  const equityPoints = (() => {
    const tN = Date.now();
    // Safety: if someone sets LP_BASELINE_TIME in the future (e.g. confused
    // local-time vs UTC) clamp it to 1 hour ago so the chart still renders.
    const t0 = Math.min(LP_BASELINE_TIME.getTime(), tN - 3600_000);

    const pts: { time: number; value: number }[] = [{ time: t0, value: lpInitialValue }];

    // Insert any rebalance events that happened after the baseline as step-up points.
    const sortedRebals = [...rebalances]
      .map(r => ({ ...r, _t: new Date(r.executed_at ?? 0).getTime() }))
      .filter(r => !Number.isNaN(r._t) && r._t > t0)
      .sort((a, b) => a._t - b._t);

    let cum = 0;
    for (const rb of sortedRebals) {
      cum += rb.fees_collected_usd ?? 0;
      pts.push({ time: rb._t, value: lpInitialValue + cum });
    }
    pts.push({ time: tN, value: totalValue });
    return pts;
  })();

  return (
    <section style={{ marginBottom: 56 }}>

      {/* ── Section title ───────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Pulse color={online ? C.cyan : error ? C.red : C.text3} />
          <h2 style={{ margin: 0, fontFamily: "'Bungee', cursive", fontSize: 22, color: C.text, letterSpacing: 0.3 }}>
            Liquidity Bot
          </h2>
          <Tag color={online ? C.cyan : C.text3}>
            {loading ? "Connecting" : online ? "Live" : "Offline"}
          </Tag>
          <Tag color={C.purple}>Doma V3</Tag>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: C.text3, fontFamily: "'Space Mono', monospace" }}>
          {!!state.updated_at && (
            <span>BOT WROTE · {fmtDate(state.updated_at as string)}</span>
          )}
          {lastUpdated && <span style={{ color: C.text4 }}>FETCHED {fmtAge(age)} AGO</span>}
          <button
            onClick={fetchLP}
            className="dash-tab"
            style={{
              background: C.surfaceUp, border: `1px solid ${C.borderHi}`, borderRadius: 8,
              color: C.text2, fontSize: 13, padding: "6px 10px", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 30,
            }}
            aria-label="Refresh"
          >
            <span className={refreshing ? "dash-spin" : ""}>↻</span>
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: "center" as const, color: C.text4, fontSize: 14 }}>
          <span className="dash-spin" style={{ display: "inline-block", marginRight: 10, fontSize: 16 }}>◌</span>
          Connecting to LP bot…
        </div>
      )}

      {error && !loading && (
        <div style={{ background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 14, padding: "18px 22px", color: "#fca5a5", fontSize: 13 }}>
          ⚠️ {error} — endpoint may not be deployed yet (set <code style={{ color: "#fde68a", fontFamily: "'Space Mono', monospace" }}>LP_BOT_API_KEY</code> on Vercel and confirm <code style={{ color: "#fde68a", fontFamily: "'Space Mono', monospace" }}>/api/lp/summary</code> is reachable on the droplet).
        </div>
      )}

      {data && !error && (
        <div className="dash-fade-in">

          {/* ── HERO ──────────────────────────────────────────────── */}
          <div style={{
            position: "relative" as const,
            background: `
              radial-gradient(circle at 0% 0%, rgba(34,211,238,0.10) 0%, transparent 50%),
              radial-gradient(circle at 100% 100%, rgba(99,102,241,0.10) 0%, transparent 50%),
              ${C.surface}
            `,
            border: `1px solid ${C.borderHi}`,
            borderRadius: 20,
            padding: mobile ? "26px 22px" : "32px 36px",
            marginBottom: 18,
            overflow: "hidden" as const,
          }}>
            <div className="dash-bg-grid" />

            <div style={{ position: "relative" as const, zIndex: 1, display: "flex", flexDirection: mobile ? "column" : "row", alignItems: mobile ? "flex-start" : "flex-end", justifyContent: "space-between", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: 12, fontFamily: "'Space Mono', monospace" }}>
                  Total Position Value
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" as const }}>
                  <div style={{
                    fontFamily: "'Bungee', cursive",
                    fontSize: mobile ? 44 : 64,
                    color: C.text, lineHeight: 1, letterSpacing: -1,
                    background: `linear-gradient(135deg, ${C.text} 0%, ${C.cyan} 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>
                    ${fmtNum(totalValue)}
                  </div>
                  <div style={{ fontSize: 13, color: C.text3, fontWeight: 700, letterSpacing: 0.5 }}>USDC.e</div>
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  marginTop: 14,
                  background: netPnl >= 0 ? C.greenSoft : C.redSoft,
                  border: `1px solid ${netPnl >= 0 ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
                  color: pnlColor,
                  borderRadius: 50, padding: "5px 14px", fontSize: 13, fontWeight: 800,
                }}>
                  <span>{netPnl >= 0 ? "▲" : "▼"}</span>
                  <span>${fmtNum(Math.abs(netPnl))}</span>
                  <span style={{ opacity: 0.65 }}>·</span>
                  <span>{fmtPct(pnlPct)}</span>
                </div>
              </div>

              {/* Right-side mini stats — 2x2 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minWidth: mobile ? "100%" : 320 }}>
                <MiniStat label="Active Positions" value={String(activeCount)} accent={activeCount > 0 ? C.purple : C.text4} />
                <MiniStat label="Lifetime Fees"    value={`$${fmtNum(fees, 4)}`} accent={C.green} sub={`across ${rebalCount} rebal${rebalCount === 1 ? "" : "s"}`} />
                <MiniStat label="Time Deployed"    value={timeDeployedStr} accent={C.cyan}
                  sub={`since ${LP_BASELINE_TIME.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`} />
                <MiniStat label="Fee APR"          value={fmtPct(apyPct, 1)} accent={apyPct >= 0 ? C.green : C.red}
                  sub={`over ${daysSinceBaseline.toFixed(1)} days`} />
              </div>
            </div>

            {/* Capital allocation */}
            <div style={{ position: "relative" as const, zIndex: 1, marginTop: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Space Mono', monospace", color: C.text3, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" as const }}>
                <span>Capital Allocation</span>
                <span>{deployedPct.toFixed(0)}% deployed in LP</span>
              </div>
              <div style={{ display: "flex", height: 8, background: C.surfaceUp, borderRadius: 4, overflow: "hidden" as const }}>
                <div style={{ width: `${deployedPct}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.indigo})`, boxShadow: `0 0 12px ${C.purple}80` }} />
                <div style={{ width: `${idlePct}%`,     background: `linear-gradient(90deg, ${C.cyan}, ${C.blue})`,    boxShadow: `0 0 12px ${C.blue}80` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                <span style={{ color: C.purple }}>● In Pool ${fmtNum(deployed)}</span>
                <span style={{ color: C.blue }}>${fmtNum(idle)} Idle ●</span>
              </div>
            </div>
          </div>

          {/* ── SECONDARY METRICS GRID ──────────────────────────── */}
          <div className="dash-stagger" style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
            <DataCard
              label="Fees Earned"
              value={`+$${fmtNum(fees, 4)}`}
              sub="lifetime + uncollected"
              accent={C.green}
              direction="up"
            />
            <DataCard
              label="Price Effect / IL"
              value={`${il >= 0 ? "+" : "-"}$${fmtNum(Math.abs(il), 4)}`}
              sub="vs HODL — net of fees & swaps"
              accent={ilColor}
              direction={il >= 0 ? "up" : "down"}
            />
            <DataCard
              label="Swap Fees Paid"
              value={`-$${fmtNum(swapFees, 4)}`}
              sub={`${swapCount} swap${swapCount === 1 ? "" : "s"} · slippage + pool fee`}
              accent={swapFees > 0 ? C.red : C.text4}
              direction={swapFees > 0 ? "down" : undefined}
            />
            <DataCard
              label="Net P&L"
              value={`${netPnl >= 0 ? "+" : "-"}$${fmtNum(Math.abs(netPnl), 4)}`}
              sub="fees − IL − swap costs"
              accent={pnlColor}
              direction={netPnl >= 0 ? "up" : "down"}
            />
          </div>

          {/* ── EQUITY CURVE ────────────────────────────────────── */}
          {equityPoints.length >= 2 && (
            <div className="dash-card" style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: mobile ? "20px 18px" : "24px 26px",
              marginBottom: 18,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" as const, gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: pnlColor, fontSize: 14 }}>◢</span>
                  <span style={{
                    fontSize: 12, fontWeight: 800, color: C.text2,
                    letterSpacing: 0.6, textTransform: "uppercase" as const,
                    fontFamily: "'Space Mono', monospace",
                  }}>
                    Equity Curve
                  </span>
                  <Tag color={pnlColor}>{fmtPct(pnlPct)} all-time</Tag>
                </div>
                <span style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5 }}>
                  {rebalCount} REBALANCES · SINCE {LP_BASELINE_TIME.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()}
                </span>
              </div>
              <EquityChart points={equityPoints} height={mobile ? 140 : 180} baseline={lpInitialValue} />
            </div>
          )}

          {/* ── ACTIVE POSITION CARD ────────────────────────────── */}
          {activePos && (
            <div className="dash-card" style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: mobile ? "22px 20px" : "26px 28px",
              marginBottom: 18,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, gap: 12, marginBottom: 22 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: "'Bungee', cursive", fontSize: 18, color: C.text }}>
                      {activePos.pool ?? "—"}
                    </span>
                    <Tag color={C.purple}>{activePos.protocol ?? "Doma V3"}</Tag>
                    {activePos.fee_tier !== undefined && (
                      <Tag color={C.cyan}>{(activePos.fee_tier * 100).toFixed(2)}% fee</Tag>
                    )}
                  </div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text4, letterSpacing: 0.3 }}>
                    {activePos.id?.toUpperCase() ?? `POS_${activePos.nft_token_id ?? "?"}`} · OPENED {relativeTime(activePos.opened_at)}
                  </div>
                </div>
                {activePos.nft_token_id && (
                  <a
                    href={`https://explorer.doma.xyz/token/0xce126ca6aceBBDCe95D7b8A3Ce637951640811E0/instance/${activePos.nft_token_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dash-tab"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: C.surfaceUp, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                      color: C.text2, fontSize: 11, padding: "6px 12px", textDecoration: "none",
                      fontFamily: "'Space Mono', monospace", letterSpacing: 0.5,
                    }}
                  >
                    NFT #{activePos.nft_token_id} ↗
                  </a>
                )}
              </div>

              {/* Range bar */}
              <RangeBar pos={activePos} />

              {/* Position stats grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4, 1fr)",
                gap: 14, marginTop: 24,
              }}>
                <PositionKV k="Liquidity" v={`$${fmtNum(activePos.liquidity_usd ?? 0)}`} accent={C.indigo} />
                <PositionKV k="Uncollected Fees" v={`+$${fmtNum(activePos.fees_earned_usd ?? 0, 4)}`} accent={C.green} />
                <PositionKV k="IL on Position" v={`${(activePos.impermanent_loss ?? 0) >= 0 ? "+" : "-"}$${fmtNum(Math.abs(activePos.impermanent_loss ?? 0), 4)}`} accent={(activePos.impermanent_loss ?? 0) >= 0 ? C.green : C.red} />
                <PositionKV k="Tick Range" v={`${activePos.tick_lower ?? 0} → ${activePos.tick_upper ?? 0}`} accent={C.purple} />
              </div>

              {/* Token split */}
              {(activePos.amount0_usd !== undefined || activePos.amount1_usd !== undefined) && (
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: C.text3, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" as const }}>
                    Token Composition
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text2, minWidth: 64 }}>
                      ${fmtNum(activePos.amount0_usd ?? 0)}
                    </span>
                    <div style={{ flex: 1, display: "flex", height: 6, background: C.surfaceUp, borderRadius: 3, overflow: "hidden" as const }}>
                      {(() => {
                        const a0 = activePos.amount0_usd ?? 0;
                        const a1 = activePos.amount1_usd ?? 0;
                        const tot = a0 + a1;
                        const p0 = tot > 0 ? (a0 / tot) * 100 : 50;
                        return (
                          <>
                            <div style={{ width: `${p0}%`,       background: `linear-gradient(90deg, ${C.purple}, ${C.indigo})` }} />
                            <div style={{ width: `${100 - p0}%`, background: `linear-gradient(90deg, ${C.cyan}, ${C.blue})` }} />
                          </>
                        );
                      })()}
                    </div>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text2, minWidth: 64, textAlign: "right" as const }}>
                      ${fmtNum(activePos.amount1_usd ?? 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── REBALANCE HISTORY ──────────────────────────────── */}
          <div className="dash-card" style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: "hidden" as const,
          }}>
            <PanelHead
              title="Rebalance History"
              count={rebalances.length}
              accent={C.purple}
              icon="⟲"
            />
            {rebalances.length === 0 ? (
              <div style={{ padding: "32px 18px", textAlign: "center" as const, color: C.text3, fontSize: 13 }}>
                <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.5 }}>✓</div>
                <div style={{ fontWeight: 700, color: C.text2, marginBottom: 4 }}>No rebalances yet</div>
                <div style={{ fontSize: 12, color: C.text4 }}>Position has stayed in range since deployment.</div>
              </div>
            ) : (
              <div className="dash-scroll" style={{ maxHeight: 520, overflowY: "auto" }}>
                {rebalances.map((r, i) => (
                  <div key={r.id ?? i} className="dash-row" style={{
                    padding: "16px 20px",
                    borderTop: i > 0 ? `1px solid ${C.border}` : undefined,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap" as const, gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text3, letterSpacing: 0.5 }}>
                          {relativeTime(r.executed_at).toUpperCase()}
                        </span>
                        <Tag color={r.reason === "EDGE_TRIGGER" ? C.yellow : r.reason === "OUT_OF_RANGE" ? C.red : C.purple}>
                          {r.reason ?? "—"}
                        </Tag>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
                        <span style={{ color: C.red, fontWeight: 700 }}>
                          −${fmtNum(r.swap_cost_usd ?? 0, 4)} swap
                        </span>
                        {(r.fees_collected_usd ?? 0) > 0 && (
                          <span style={{ color: C.green, fontWeight: 700 }}>
                            +${fmtNum(r.fees_collected_usd ?? 0, 4)} fees
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Range visual: from → to */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                      <span style={{ color: C.text4, minWidth: 56 }}>FROM</span>
                      <span style={{ color: C.text2 }}>
                        [{r.from_tick_lower}, {r.from_tick_upper}]
                      </span>
                      <span style={{ color: C.text4 }}>@ {fmtPrice(r.from_price)}</span>
                      <span style={{ color: C.purple, fontSize: 14 }}>→</span>
                      <span style={{ color: C.text }}>
                        [{r.to_tick_lower}, {r.to_tick_upper}]
                      </span>
                      <span style={{ color: C.text4 }}>@ {fmtPrice(r.to_price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PositionKV({ k, v, accent }: { k: string; v: string; accent: string }) {
  return (
    <div style={{ background: "rgba(5,7,15,0.55)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: C.text3, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
        {k}
      </div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: accent }}>
        {v}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   LP LOGS — same terminal aesthetic, single process (no tabs)
════════════════════════════════════════════════════════════════════════ */

function LPLogs() {
  const [data, setData]       = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setR]    = useState(false);
  const [lines, setLines]     = useState(80);

  async function fetchLogs(n = lines) {
    setR(true);
    try {
      const res  = await fetch(`/api/lp-logs?lines=${n}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch { setData({ error: "Unreachable" }); }
    finally  { setLoading(false); setR(false); }
  }

  useEffect(() => {
    fetchLogs(lines);
    const t = setInterval(() => fetchLogs(lines), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const logLines = (data?.lines ?? []).slice().reverse();

  const lineColor = (line: string) => {
    if (/error|exception|fail|critical/i.test(line))               return C.red;
    if (/warn|out_of_range|edge_trigger/i.test(line))              return C.yellow;
    if (/mint|deploy|opened|in_range=true/i.test(line))            return C.green;
    if (/burn|rebalance|collect|in_range=false/i.test(line))       return C.cyan;
    if (/skip|no /i.test(line))                                    return C.text4;
    return C.text2;
  };

  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" as const, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontFamily: "'Bungee', cursive", fontSize: 22, color: C.text, letterSpacing: 0.3 }}>
            LP Bot Logs
          </h2>
          <Tag color={C.cyan}>Live Stream</Tag>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            style={{
              background: C.surfaceUp, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.text2, fontSize: 11, padding: "6px 10px", cursor: "pointer",
              fontFamily: "'Space Mono', monospace",
            }}
          >
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n} lines</option>)}
          </select>
          <button
            onClick={() => fetchLogs()}
            className="dash-tab"
            style={{
              background: C.surfaceUp, border: `1px solid ${C.borderHi}`, borderRadius: 8,
              color: C.text2, fontSize: 13, padding: "6px 10px", cursor: "pointer",
              width: 32, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span className={refreshing ? "dash-spin" : ""}>↻</span>
          </button>
        </div>
      </div>

      <div style={{ background: "#020409", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" as const }}>
        <div style={{ padding: "10px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ef4444" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#f59e0b" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#10b981" }} />
          <span style={{ marginLeft: 14, fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text3 }}>
            ~/lp-bot/logs/lp_bot.log
          </span>
        </div>
        {loading && logLines.length === 0 ? (
          <div style={{ padding: 40, color: C.text4, fontSize: 13, textAlign: "center" as const, fontFamily: "'Space Mono', monospace" }}>
            <span className="dash-spin" style={{ display: "inline-block", marginRight: 8 }}>◌</span>
            Loading logs…
          </div>
        ) : data?.error ? (
          <div style={{ padding: 40, color: "#fca5a5", fontSize: 13 }}>⚠️ {data.error}</div>
        ) : logLines.length === 0 ? (
          <div style={{ padding: 40, color: C.text4, fontSize: 13, textAlign: "center" as const }}>No log output</div>
        ) : (
          <div className="dash-scroll" style={{ height: 380, overflowY: "auto", padding: "16px 18px", fontFamily: "'Space Mono', monospace", fontSize: 11, lineHeight: 1.8 }}>
            {logLines.map((line, i) => (
              <div key={i} style={{ color: lineColor(line), whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                <span style={{ color: C.text5, marginRight: 12, userSelect: "none" }}>
                  {String(logLines.length - i).padStart(3, "0")}
                </span>
                {line}
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.surface }}>
          <span style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5 }}>
            {logLines.length} LINES · AUTO-REFRESH 15s
          </span>
          {refreshing && (
            <span style={{ fontSize: 10, color: C.text3, fontFamily: "'Space Mono', monospace", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="dash-spin">◌</span> Refreshing
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   BOT LOGS — terminal aesthetic
════════════════════════════════════════════════════════════════════════ */

interface LogData { lines?: string[]; error?: string }

function BotLogs() {
  const [data, setData]       = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setR]    = useState(false);
  const [active, setActive]   = useState<"scheduler" | "monitor">("scheduler");
  const [lines, setLines]     = useState(80);

  async function fetchLogs(process = active, n = lines) {
    setR(true);
    try {
      const res  = await fetch(`/api/bot-logs?process=${process}&lines=${n}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch { setData({ error: "Unreachable" }); }
    finally  { setLoading(false); setR(false); }
  }

  useEffect(() => {
    fetchLogs(active, lines);
    const t = setInterval(() => fetchLogs(active, lines), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lines]);

  const logLines = (data?.lines ?? []).slice().reverse();

  const lineColor = (line: string) => {
    if (/error|exception|fail|critical/i.test(line)) return C.red;
    if (/warn/i.test(line))                          return C.yellow;
    if (/buy|long|open|entry/i.test(line))           return C.green;
    if (/sell|short|close|exit/i.test(line))         return C.pink;
    if (/skip|no |ignore/i.test(line))               return C.text4;
    return C.text2;
  };

  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" as const, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontFamily: "'Bungee', cursive", fontSize: 22, color: C.text, letterSpacing: 0.3 }}>
            Bot Logs
          </h2>
          <Tag color={C.cyan}>Live Stream</Tag>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          {(["scheduler", "monitor"] as const).map((tab) => (
            <button key={tab}
              onClick={() => setActive(tab)}
              className="dash-tab"
              style={{
                background: active === tab ? "rgba(99,102,241,0.12)" : "transparent",
                border: `1px solid ${active === tab ? C.borderHi : C.border}`,
                borderRadius: 8,
                color: active === tab ? C.text : C.text3,
                fontSize: 11, fontWeight: 800, padding: "6px 12px",
                cursor: "pointer", fontFamily: "'Space Mono', monospace",
                letterSpacing: 0.5,
              }}
            >
              {tab}.py
            </button>
          ))}
          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            style={{
              background: C.surfaceUp, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.text2, fontSize: 11, padding: "6px 10px", cursor: "pointer",
              fontFamily: "'Space Mono', monospace",
            }}
          >
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n} lines</option>)}
          </select>
          <button
            onClick={() => fetchLogs()}
            className="dash-tab"
            style={{
              background: C.surfaceUp, border: `1px solid ${C.borderHi}`, borderRadius: 8,
              color: C.text2, fontSize: 13, padding: "6px 10px", cursor: "pointer",
              width: 32, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span className={refreshing ? "dash-spin" : ""}>↻</span>
          </button>
        </div>
      </div>

      <div style={{
        background: "#020409",
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        overflow: "hidden" as const,
      }}>
        {/* terminal title bar */}
        <div style={{
          padding: "10px 16px",
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ef4444" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#f59e0b" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#10b981" }} />
          <span style={{ marginLeft: 14, fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text3 }}>
            ~/bot/logs/{active}.log
          </span>
        </div>
        {/* terminal body */}
        {loading && logLines.length === 0 ? (
          <div style={{ padding: 40, color: C.text4, fontSize: 13, textAlign: "center" as const, fontFamily: "'Space Mono', monospace" }}>
            <span className="dash-spin" style={{ display: "inline-block", marginRight: 8 }}>◌</span>
            Loading logs…
          </div>
        ) : data?.error ? (
          <div style={{ padding: 40, color: "#fca5a5", fontSize: 13 }}>⚠️ {data.error}</div>
        ) : logLines.length === 0 ? (
          <div style={{ padding: 40, color: C.text4, fontSize: 13, textAlign: "center" as const }}>No log output</div>
        ) : (
          <div className="dash-scroll" style={{ height: 420, overflowY: "auto", padding: "16px 18px", fontFamily: "'Space Mono', monospace", fontSize: 11, lineHeight: 1.8 }}>
            {logLines.map((line, i) => (
              <div key={i} style={{ color: lineColor(line), whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                <span style={{ color: C.text5, marginRight: 12, userSelect: "none" }}>
                  {String(logLines.length - i).padStart(3, "0")}
                </span>
                {line}
              </div>
            ))}
          </div>
        )}
        <div style={{
          padding: "10px 18px",
          borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: C.surface,
        }}>
          <span style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5 }}>
            {logLines.length} LINES · AUTO-REFRESH 15s
          </span>
          {refreshing && (
            <span style={{ fontSize: 10, color: C.text3, fontFamily: "'Space Mono', monospace", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="dash-spin">◌</span> Refreshing
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SUPPORT CARD — Doma fractional share
════════════════════════════════════════════════════════════════════════ */

function SupportCard({ mobile }: { mobile: boolean }) {

  const benefits = [
    { icon: "✦", text: "Claude Opus API for premium article generation" },
    { icon: "✦", text: "gpt-image-1.5 hero illustrations on every guide" },
    { icon: "✦", text: "Vercel hosting + Supabase database" },
    { icon: "✦", text: "DigitalOcean droplet running the trading bot" },
  ];

  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 20 }}>♥</span>
        <h2 style={{ margin: 0, fontFamily: "'Bungee', cursive", fontSize: 22, color: C.text, letterSpacing: 0.3 }}>
          Support the Build
        </h2>
      </div>

      <div style={{
        position: "relative" as const,
        background: `
          radial-gradient(circle at 0% 0%,   rgba(99,102,241,0.18)  0%, transparent 45%),
          radial-gradient(circle at 100% 100%, rgba(236,72,153,0.16) 0%, transparent 45%),
          ${C.surface}
        `,
        border: `1px solid ${C.borderHi}`,
        borderRadius: 20,
        padding: mobile ? "30px 24px" : "44px 48px",
        overflow: "hidden" as const,
      }}>
        {/* Decorative grid pattern */}
        <div style={{
          position: "absolute" as const, inset: 0,
          backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          opacity: 0.4,
          pointerEvents: "none" as const,
          maskImage: "radial-gradient(circle at 50% 50%, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 50%, black 30%, transparent 70%)",
        }} />

        <div style={{ position: "relative" as const, display: "flex", flexDirection: mobile ? "column" : "row", alignItems: mobile ? "stretch" : "flex-start", gap: mobile ? 28 : 56 }}>
          {/* Left side */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)",
              borderRadius: 50, padding: "5px 14px", marginBottom: 18,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.indigo }} />
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#a5b4fc", letterSpacing: 1.4, fontWeight: 700 }}>
                FRACTIONAL SHARES · DOMA PROTOCOL
              </span>
            </div>

            <h3 style={{
              margin: "0 0 14px",
              fontFamily: "'Bungee', cursive",
              fontSize: mobile ? 26 : 36,
              color: C.text,
              lineHeight: 1.1,
              letterSpacing: -0.5,
              background: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 60%, #a5b4fc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Own a piece of Web3 Guides
            </h3>

            <p style={{ margin: "0 0 22px", fontSize: 15, color: C.text2, lineHeight: 1.65, maxWidth: 540 }}>
              The <strong style={{ color: C.text }}>web3guides.com</strong> domain is fractionalized on Doma Protocol. Buy a share, become a co-owner of the platform, and directly support the bills that keep it running.
            </p>

            <div style={{ display: "grid", gap: 8, marginBottom: 26, maxWidth: 480 }}>
              {benefits.map(b => (
                <div key={b.text} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.text2 }}>
                  <span style={{ color: C.indigo, fontSize: 12 }}>{b.icon}</span>
                  <span>{b.text}</span>
                </div>
              ))}
            </div>

            <a
              href={DOMA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="dash-btn-primary"
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                background: `linear-gradient(135deg, ${C.indigo} 0%, ${C.pink} 100%)`,
                color: "#fff", fontWeight: 800, fontSize: 14,
                padding: "14px 28px", borderRadius: 12, textDecoration: "none",
                boxShadow: `0 8px 32px -8px ${C.indigo}80`,
                letterSpacing: 0.3,
              }}
            >
              Buy on Doma <span style={{ fontSize: 16 }}>→</span>
            </a>
          </div>

          {/* Right side — domain card visual */}
          {!mobile && (
            <div style={{
              minWidth: 280,
              background: "rgba(5,7,15,0.6)",
              border: `1px solid ${C.borderHi}`,
              borderRadius: 16,
              padding: "26px 24px",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}>
              <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: C.text3, letterSpacing: 1.4, marginBottom: 12, textTransform: "uppercase" as const }}>
                The Domain
              </div>
              <div style={{
                fontFamily: "'Bungee', cursive",
                fontSize: 26, color: C.text,
                background: `linear-gradient(135deg, ${C.orange}, ${C.pink})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: 18, lineHeight: 1.1,
              }}>
                web3guides.com
              </div>

              <div style={{ display: "grid", gap: 10, fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                <KV k="Network"   v="Doma Protocol" />
                <KV k="Type"      v="Fractional ERC-20" />
                <KV k="Built by"  v="Big Mike" />
                <KV k="Live since" v="2024" />
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.text3, lineHeight: 1.6 }}>
                Holders share in the platform&apos;s growth — every guide published, every API call paid for, every reader served.
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: C.text4, letterSpacing: 0.5 }}>{k}</span>
      <span style={{ color: C.text2, fontWeight: 700 }}>{v}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SITE SNAPSHOT
════════════════════════════════════════════════════════════════════════ */

function SiteSnapshot({ guideCount, emailCount, mobile }: { guideCount: number; emailCount: number; mobile: boolean }) {
  const subdomainCount = VALID_SUBDOMAINS.length;

  const tiles = [
    { label: "Guides Published", value: guideCount,      icon: "📖", color: C.indigo, sub: "AI-generated, fact-checked" },
    { label: "Subdomains",       value: subdomainCount,  icon: "🌐", color: C.green,  sub: "Specialised hubs" },
    { label: "Email Subscribers", value: emailCount,     icon: "✉",  color: C.yellow, sub: "Weekly newsletter" },
    { label: "Hours of Sleep Lost", value: "∞",          icon: "☕", color: C.pink,   sub: "Big Mike says hi" },
  ];

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 20 }}>📊</span>
        <h2 style={{ margin: 0, fontFamily: "'Bungee', cursive", fontSize: 22, color: C.text, letterSpacing: 0.3 }}>
          Site Snapshot
        </h2>
        <Tag color={C.green}>Where We Are</Tag>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 14 }}>
        {tiles.map(t => (
          <div key={t.label} className="dash-card" style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "20px 22px",
            position: "relative" as const,
            overflow: "hidden" as const,
          }}>
            {/* corner glow */}
            <div style={{
              position: "absolute" as const, top: -40, right: -40,
              width: 100, height: 100, borderRadius: "50%",
              background: `radial-gradient(circle, ${t.color}25 0%, transparent 70%)`,
              pointerEvents: "none" as const,
            }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: 800, color: C.text3,
                letterSpacing: 1, textTransform: "uppercase" as const,
                fontFamily: "'Space Mono', monospace",
              }}>
                {t.label}
              </span>
            </div>
            <div style={{
              fontFamily: "'Bungee', cursive",
              fontSize: 30, color: t.color, lineHeight: 1, marginBottom: 6,
            }}>
              {t.value}
            </div>
            <div style={{ fontSize: 11, color: C.text4, fontFamily: "'DM Sans', sans-serif" }}>
              {t.sub}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SHARED — DataCard, MiniStat, PanelHead, Empty
════════════════════════════════════════════════════════════════════════ */

function DataCard({
  label, value, sub, accent, progress, direction,
}: {
  label: string; value: string; sub?: string; accent: string;
  progress?: number; direction?: "up" | "down";
}) {
  return (
    <div className="dash-card" style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: "16px 18px",
      position: "relative" as const,
      overflow: "hidden" as const,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, color: C.text3,
        letterSpacing: 1, textTransform: "uppercase" as const,
        fontFamily: "'Space Mono', monospace", marginBottom: 10,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: accent }} />
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{
          fontFamily: "'Bungee', cursive",
          fontSize: 22, color: accent, lineHeight: 1, letterSpacing: -0.3,
        }}>
          {value}
        </div>
        {direction && (
          <span style={{ fontSize: 12, color: accent, opacity: 0.7 }}>
            {direction === "up" ? "▲" : "▼"}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: C.text4, marginTop: 6, fontFamily: "'DM Sans', sans-serif" }}>
          {sub}
        </div>
      )}
      {typeof progress === "number" && <MiniBar pct={progress} color={accent} />}
    </div>
  );
}

function MiniStat({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div style={{
      background: "rgba(5,7,15,0.55)",
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: "12px 14px",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, color: C.text3,
        letterSpacing: 1, textTransform: "uppercase" as const,
        fontFamily: "'Space Mono', monospace", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Bungee', cursive", fontSize: 18, color: accent, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9.5, color: C.text4, marginTop: 4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function PanelHead({ title, count, accent, icon }: { title: string; count?: number; accent: string; icon?: string }) {
  return (
    <div style={{
      padding: "14px 18px",
      borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {icon && <span style={{ color: accent, fontSize: 14 }}>{icon}</span>}
        <span style={{
          fontSize: 12, fontWeight: 800, color: C.text2,
          letterSpacing: 0.6, textTransform: "uppercase" as const,
          fontFamily: "'Space Mono', monospace",
        }}>
          {title}
        </span>
      </div>
      {typeof count === "number" && (
        <span style={{
          fontSize: 10, fontWeight: 800, color: accent,
          background: `${accent}1a`, border: `1px solid ${accent}40`,
          borderRadius: 50, padding: "2px 9px", fontFamily: "'Space Mono', monospace",
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "44px 16px", textAlign: "center" as const, color: C.text4, fontSize: 13 }}>
      <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>◌</div>
      {text}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN
════════════════════════════════════════════════════════════════════════ */

export default function DashboardClient({ emailCount, guideCount }: Props) {
  const mobile = useMobile();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />

      <div style={{
        minHeight: "100vh",
        background: `
          radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.10) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40% at 100% 100%, rgba(236,72,153,0.06) 0%, transparent 60%),
          ${C.bg}
        `,
        color: C.text,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>

        {/* ── Sticky top bar ────────────────────────────────────────── */}
        <div style={{
          position: "sticky" as const,
          top: 0, zIndex: 50,
          background: "rgba(5,7,15,0.7)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}>
              <span style={{
                fontFamily: "'Bungee', cursive", fontSize: 16,
                background: `linear-gradient(135deg, ${C.orange}, ${C.pink})`,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                letterSpacing: 0.5,
              }}>
                Web3 Guides
              </span>
              {!mobile && (
                <>
                  <span style={{ width: 1, height: 18, background: C.text5 }} />
                  <span style={{ fontSize: 12, color: C.text3, fontFamily: "'Space Mono', monospace", letterSpacing: 1, textTransform: "uppercase" as const }}>
                    Public Dashboard
                  </span>
                </>
              )}
            </a>
            <a href="/" className="dash-link" style={{ fontSize: 12, color: C.text3, textDecoration: "none", fontFamily: "'Space Mono', monospace", letterSpacing: 0.5 }}>
              ← Back to site
            </a>
          </div>
        </div>

        <main style={{ maxWidth: 1440, margin: "0 auto", padding: mobile ? "32px 18px 80px" : "48px 24px 100px" }}>

          {/* ── Page hero ──────────────────────────────────────────── */}
          <header style={{ marginBottom: 48 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(99,102,241,0.10)",
              border: `1px solid ${C.borderHi}`,
              borderRadius: 50, padding: "5px 14px", marginBottom: 20,
            }}>
              <Pulse color={C.green} />
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#a5b4fc", letterSpacing: 1.2, fontWeight: 700 }}>
                LIVE OPERATIONS
              </span>
            </div>

            <h1 style={{
              margin: "0 0 14px",
              fontFamily: "'Bungee', cursive",
              fontSize: mobile ? 40 : 60,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              background: `linear-gradient(135deg, ${C.text} 0%, #94a3b8 50%, ${C.indigo} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Public Dashboard
            </h1>
            <p style={{ margin: 0, color: C.text3, fontSize: mobile ? 14 : 16, lineHeight: 1.6, maxWidth: 640 }}>
              Real-time snapshot of two automated bots — an auto-sniper trading domain launches and a concentrated-liquidity provider on Doma V3. Every position, every trade, every log line. Built in the open. Updated every 30 seconds.
            </p>
          </header>

          {/* ── Sections ───────────────────────────────────────────── */}
          {/* Bots first, side-by-side in spirit (stacked at this width) */}
          <BotPanel />
          <LPPanel />

          {/* Logs side-by-side at desktop width — both streaming live */}
          <div style={{
            display: "grid",
            gridTemplateColumns: mobile ? "1fr" : "1fr 1fr",
            gap: 18,
            marginBottom: 56,
          }}>
            <div><BotLogs /></div>
            <div><LPLogs /></div>
          </div>

          <SupportCard mobile={mobile} />
          <SiteSnapshot guideCount={guideCount} emailCount={emailCount} mobile={mobile} />

          {/* ── Footer ─────────────────────────────────────────────── */}
          <footer style={{
            marginTop: 24,
            paddingTop: 28,
            borderTop: `1px solid ${C.border}`,
            display: "flex", flexDirection: mobile ? "column" : "row",
            alignItems: mobile ? "flex-start" : "center", justifyContent: "space-between",
            gap: 14, fontSize: 12, color: C.text4, fontFamily: "'Space Mono', monospace",
          }}>
            <span>BUILT BY <a href="https://bigmike.web3guides.com" className="dash-link" style={{ color: C.text3, textDecoration: "none", fontWeight: 700 }}>BIG MIKE</a> · IN CRYPTO SINCE 2016 · FULL-TIME SINCE 2018</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Pulse color={C.green} />
              <span style={{ letterSpacing: 1 }}>SYSTEM ONLINE</span>
            </span>
          </footer>
        </main>
      </div>
    </>
  );
}
