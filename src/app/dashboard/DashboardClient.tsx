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

// Auto-sniper baseline. Updated when capital is added/removed and a fresh
// phase begins. Currently: $100 redeposit on 1 May 2026, fresh start.
const FIRST_LAUNCH = new Date("2026-05-01T11:38:14Z");

// LP equity-chart baseline.
// We anchor the LP chart to a fixed point in time + value so the chart,
// "Time Deployed" stat, and "Fee APR" all show real progress since the
// reset moment instead of recomputing on every poll. Update all three
// together if you ever fully exit + redeploy.
//   ⚠ TIME IS UTC. Don't paste your local-time clock here.
//
// PHASE 3: 1 May 2026, $249.66 freshly deposited (125 USDC + 432.84 SOFTWARE.ai)
// LP bot back online and minted. Baseline = post-mint state from API.
const LP_BASELINE_TIME       = new Date("2026-05-01T11:38:14Z");  // 1 May 18:38 UTC+7
const LP_BASELINE_VALUE      = 250.88;     // total_value from API after mint
const LP_BASELINE_FEES       = 1643.03;    // lifetime_fees carried forward (broken bot count, ignored anyway)
const LP_BASELINE_SWAP_COSTS = 0.4172;     // total_swap_fees_paid_usd carried forward

// LP capital basis — fresh capital deposited at Phase 3 start.
// (Previous phases fully exited 30 Apr, so this is a clean start.)
const LP_TOTAL_DEPOSITED = 249.66;  // 125 USDC + 432.84 SOFTWARE.ai @ ~$0.288


/* ── Arb bot phase baseline ────────────────────────────────────────────────
   Phase 1 (4 May 07:05 → 08:00 UTC): $200 setup, lost ~$3.60 in setup costs
   Phase 2 (from 4 May 08:00 UTC): $196.40 starting capital, fresh timer

   When you reset again, update all five constants together: snapshot the
   API state at the moment of reset and copy lifetime values into the carry-
   forward fields so phase metrics start from zero. */
const ARB_BASELINE_TIME        = new Date("2026-05-04T08:00:00Z");
const ARB_BASELINE_VALUE       = 196.40;     // capital basis at phase start
const ARB_BASELINE_GROSS       = 1.6299;     // gross_trade_pnl_usd carried forward from Phase 1
const ARB_BASELINE_BRIDGE_FEES = 12.686;     // total_bridge_fees_usd carried forward
const ARB_BASELINE_TRADES      = 15;         // total_arbs_executed at baseline (carry forward)
const ARB_BASELINE_BRIDGES     = 12;         // bridge count at baseline (carry forward)

interface ArbPhase {
  label:          string;
  startTime:      Date;
  endTime:        Date;
  startValueUsd:  number;
  endValueUsd:    number;
  trades:         number;
  bridges:        number;
}

const ARB_PHASES: ArbPhase[] = [
  // ── Phase 1: $200 Setup ────────────────────────────────────────
  // Initial deployment (4 May 07:05 UTC). Bot was misconfigured, bridge costs
  // dwarfed trade earnings. Net loss ~$3.60 across 15 trades + 12 bridges.
  {
    label:          "Phase 1: $200 Setup",
    startTime:      new Date("2026-05-04T07:05:25Z"),
    endTime:        new Date("2026-05-04T08:00:00Z"),
    startValueUsd:  200.00,
    endValueUsd:    196.40,
    trades:         15,
    bridges:        12,
  },
];

/* ── LP Phase History ─────────────────────────────────────────────────────
   Each completed phase is locked in here as a snapshot. The current
   (active) phase is the live data shown in the rest of the panel.

   When you add or withdraw capital:
     1. Note the exact moment + total_value + lifetime_fees + swap_costs
     2. Append a new entry to LP_PHASES below with those numbers
     3. Update LP_TOTAL_DEPOSITED to the new total ever deposited
     4. Update LP_BASELINE_TIME / LP_BASELINE_VALUE / LP_BASELINE_FEES to
        the moment of the deposit so the equity chart + APR get a fresh start
*/
interface LPPhase {
  label:           string;
  startTime:       Date;
  endTime:         Date;
  depositedUsd:    number;   // capital at start of phase
  finalValueUsd:   number;   // total wallet+position value at phase end
  feesEarnedUsd:   number;   // fees earned during this phase only
  swapCostsUsd:    number;   // swap costs paid during this phase only
}

const LP_PHASES: LPPhase[] = [
  // ── Phase 1: $75 Test  ─────────────────────────────────────────
  // Locked-in snapshot at the moment of the $125 add (27 Apr 07:54:50 UTC).
  {
    label:         "Phase 1: $75 Test",
    startTime:     new Date("2026-04-25T19:34:28Z"),
    endTime:       new Date("2026-04-27T07:54:50Z"),
    depositedUsd:  75.00,
    finalValueUsd: 78.54,
    feesEarnedUsd: 1.8996,
    swapCostsUsd:  0.2525,
  },
  // ── Phase 2: $200 Era — full $125-add lifecycle ────────────────
  // Combined timeline from $125 deposit (27 Apr) through full withdrawal
  // (30 Apr). Includes the mid-phase $40 partial pull. Total deposited
  // capital across this era was $200 ($75 carry + $125 added).
  {
    label:         "Phase 2: $200 Era",
    startTime:     new Date("2026-04-27T07:54:50Z"),
    endTime:       new Date("2026-04-30T10:26:57Z"),
    depositedUsd:  200,       // total capital deployed during this phase
    finalValueUsd: 215,       // approximate total value pulled out across the phase
    feesEarnedUsd: 15,        // implied: $215 − $200 = +$15 net
    swapCostsUsd:  0.16,      // approximate swap costs across the phase
  },
];

/* ── Closed-trade backfill ───────────────────────────────────────────────────
   Empty for the new phase that started 1 May 2026. The /api/bot endpoint
   already returns the most recent ~12 trades for the live "Recent Trades"
   panel. The equity curve will draw with just two points (start + now)
   and will fill in as the bot trades in this phase. The previous 36-trade
   archive lived in earlier phases that have been fully closed out. ─── */
const BACKFILL_TRADES: Array<{ symbol: string; pnl: number }> = [];

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

/* ── Arb bot types — schema from ARB_BOT_DASHBOARD_CONTEXT.md ────────────── */
interface ArbState {
  total_capital_usd?:     number;
  doma_capital_usd?:      number;
  base_capital_usd?:      number;
  doma_usdce_balance?:    number;
  doma_token_balance?:    number;
  base_usdc_balance?:     number;
  base_token_balance?:    number;
  doma_price_usd?:        number;
  base_price_usd?:        number;
  spread_pct?:            number;
  spread_threshold_pct?:  number;
  in_range?:              boolean;
  total_arbs_executed?:   number;
  successful_arbs?:       number;
  failed_arbs?:           number;
  total_profit_usd?:      number;
  gross_trade_pnl_usd?:   number;
  total_gas_usd?:         number;
  total_bridge_fees_usd?: number;
  total_swap_fees_usd?:   number;
  first_deployed_at?:     string;
  last_arb_at?:           string;
  wallet_address?:        string;
  updated_at?:            string;
  [k: string]: unknown;
}
interface ArbTrade {
  id?:               string;
  executed_at?:      string;
  direction?:        "base_to_doma" | "doma_to_base" | string;
  input_usd?:        number;
  output_usd?:       number;
  gross_profit_usd?: number;
  gas_usd?:          number | null;
  bridge_fee_usd?:   number | null;
  swap_fees_usd?:    number | null;
  net_profit_usd?:   number;
  doma_tx?:          string | null;
  bridge_tx?:        string | null;
  base_tx?:          string | null;
  duration_sec?:     number | null;
  status?:           "completed" | "failed" | string;
  spread_bps?:       number;
  size_usd?:         number;
  [k: string]: unknown;
}
interface ArbBridge {
  id?:             string;
  executed_at?:    string;
  from_chain?:     "doma" | "base" | string;
  to_chain?:       "doma" | "base" | string;
  amount_in_usd?:  number;
  amount_out_usd?: number;
  cost_usd?:       number;
  deposit_tx?:     string;
  status?:         "OK" | "FAIL" | string;
  notes?:          string;
  [k: string]: unknown;
}
interface ArbConfig {
  min_spread_pct?:          number;
  trade_size_usd?:          number;
  max_slippage_pct?:        number;
  loop_interval_sec?:       number;
  bridge_provider_stable?:  string;
  bridge_provider_token?:   string;
  auto_bridge?:             boolean;
  bridge_trigger_usd?:      number;
  halt_below_usd?:          number;
  doma_pool_fee?:           number;
  base_pool_fee?:           number;
  pair?:                    string;
  [k: string]: unknown;
}
interface ArbSummary {
  state?:           ArbState;
  trades?:          ArbTrade[];
  bridges?:         ArbBridge[];
  spread_history?:  Array<{ ts: string; doma_price: number; base_price: number }>;
  config?:          ArbConfig;
  error?:           string;
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
  // Lifetime values from API
  const lifetimeFees     = state.total_fees_earned ?? state.lifetime_fees ?? 0;
  const lifetimeSwapFees = state.total_swap_fees_paid_usd ?? 0;
  const swapCount        = state.swap_count ?? 0;

  // Current-phase swap costs (subtract carry-forward).
  const swapFees = Math.max(0, lifetimeSwapFees - LP_BASELINE_SWAP_COSTS);

  // Live uncollected fees — sum of `fees_earned_usd` on each active
  // position. This is the V3 `feeGrowthInside` math result the bot
  // computes per-position; matches what Doma UI shows. Ticks up live
  // between compound events; resets to ~0 after each compound when
  // tokens_owed is swept and the position's feeGrowthInside_last advances.
  const uncollectedFees = positions.reduce(
    (sum, p) => sum + ((p.fees_earned_usd as number) ?? 0),
    0,
  );

  // Net P&L (current phase) is verifiable on-chain truth: current wealth
  // minus the value at phase start. Wealth = total_value (which excludes
  // uncollected) + currently uncollected fees.
  const netPnl = (totalValue + uncollectedFees) - LP_BASELINE_VALUE;

  // Fees: derived from value change + live uncollected, rather than the
  // bot's broken `lifetime_fees` field (it produces absurd phantom values
  // after rebalances — V3 feeGrowthInside math edge case).
  //
  // For a tight-range stable-pair LP (USDC.e / SOFTWARE.ai at ±0.5%),
  // IL is near zero, so:
  //     fees ≈ value_change + swap_costs + live_uncollected
  //
  // This captures BOTH:
  //   - already-compounded fees (visible in total_value growth)
  //   - currently-accruing fees (in tokens_owed / fee_growth_inside)
  // Matches what's observable on-chain second to second.
  const fees = Math.max(0, netPnl + swapFees);

  // IL = residual after fees + swaps explain the gain. With this fee
  // formulation, IL collapses to ~0 by construction.
  const il     = netPnl - fees + swapFees;
  const pnlPct = LP_BASELINE_VALUE > 0 ? (netPnl / LP_BASELINE_VALUE) * 100 : 0;
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
  // `fees` is already current-phase (LP_BASELINE_FEES already subtracted),
  // so don't subtract it again.
  const apyPct = totalValue > 0
    ? (fees / daysSinceBaseline) * 365 / totalValue * 100
    : 0;
  const dailyAvgPct = totalValue > 0
    ? (fees / totalValue / daysSinceBaseline) * 100
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

    // Two-point line: baseline → current value.
    // We deliberately do NOT step up at rebalance events using
    // rebalance.fees_collected_usd — that field has been observed producing
    // bogus $700+ values from the V3 fee-math edge case, which caused the
    // chart to spike to $1018 then crash back. Without trustworthy snapshot
    // data per rebalance, a clean baseline→current line is the honest view.
    return [
      { time: t0, value: lpInitialValue },
      { time: tN, value: totalValue },
    ];
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
                <MiniStat label="Phase Fees"       value={`$${fmtNum(fees, 4)}`} accent={C.green} sub={uncollectedFees > 0 ? `$${fmtNum(uncollectedFees, 4)} uncollected` : `all compounded`} />
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
              sub={uncollectedFees > 0
                ? `this phase · $${fmtNum(uncollectedFees, 4)} uncollected · accruing live`
                : `this phase · all collected & compounded`}
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

          {/* ── PHASE HISTORY ───────────────────────────────────── */}
          <PhaseHistory mobile={mobile} />

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
                        {/* Swap cost badge — only show if a swap actually happened */}
                        {(r.swap_cost_usd ?? 0) > 0 ? (
                          <span style={{ color: C.red, fontWeight: 700 }} title="Slippage + 0.05% pool fee paid as a swapper to rebalance the wallet">
                            −${fmtNum(r.swap_cost_usd, 4)} swap
                          </span>
                        ) : (
                          <span style={{ color: C.text4, fontWeight: 600 }} title="Wallet was already within $0.50 of optimal ratio — no swap needed">
                            no swap
                          </span>
                        )}
                        {/* Fees badge — total LP fees harvested over the closed position's lifetime */}
                        {(r.fees_collected_usd ?? 0) > 0 && (
                          <span style={{ color: C.green, fontWeight: 700 }} title="Total LP fees compounded into this position over its life (sum of compound events)">
                            +${fmtNum(r.fees_collected_usd ?? 0, 4)} compounded
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

/* Phase History — frozen snapshots of past capital phases.
   Renders nothing if LP_PHASES is empty.
   Switches to a stacked single-column layout on mobile so columns stop
   piling on top of each other on narrow screens. */
function PhaseHistory({ mobile }: { mobile: boolean }) {
  if (LP_PHASES.length === 0) return null;

  return (
    <div className="dash-card" style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: mobile ? "18px 16px" : "22px 24px",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" as const }}>
        <span style={{ color: C.indigo, fontSize: 14 }}>◷</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text2, letterSpacing: 0.6, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace" }}>
          Phase History
        </span>
        <span style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5, marginLeft: 4 }}>
          {LP_PHASES.length} COMPLETED · 1 ACTIVE
        </span>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {LP_PHASES.map((phase, i) => {
          const netPnl     = phase.finalValueUsd - phase.depositedUsd;
          const netPnlPct  = (netPnl / phase.depositedUsd) * 100;
          const durationMs = phase.endTime.getTime() - phase.startTime.getTime();
          const days       = durationMs / 86400_000;
          const apy        = days > 0 ? netPnlPct * 365 / days : 0;
          const isPos      = netPnl >= 0;
          const color      = isPos ? C.green : C.red;
          const drift      = netPnl - phase.feesEarnedUsd + phase.swapCostsUsd;
          const driftColor = drift >= 0 ? C.green : C.red;

          const fmtPhaseDate = (d: Date) =>
            d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

          return (
            <div key={i} style={{
              background: "rgba(5,7,15,0.55)",
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: mobile ? "14px 16px" : "16px 18px",
              // Mobile: single column stack. Desktop: 5-column grid.
              display: "grid",
              gridTemplateColumns: mobile
                ? "1fr"
                : "minmax(150px, 1.2fr) repeat(3, minmax(0, 1fr)) auto",
              gap: mobile ? 12 : 16,
              alignItems: mobile ? "stretch" as const : "center" as const,
            }}>
              {/* Label + dates */}
              <div style={{
                ...(mobile ? { paddingBottom: 10, borderBottom: `1px solid ${C.border}` } : {}),
              }}>
                <div style={{ fontSize: mobile ? 14 : 13, fontWeight: 800, color: C.text, marginBottom: 4 }}>
                  {phase.label}
                </div>
                <div style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.3 }}>
                  {fmtPhaseDate(phase.startTime)} → {fmtPhaseDate(phase.endTime)} · {days.toFixed(1)}d
                </div>
              </div>

              {/* On mobile, cluster the three central stats in a 3-col row */}
              {mobile ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                      Capital
                    </div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text2 }}>
                      ${fmtNum(phase.depositedUsd, 0)}<br/>→ <span style={{ color: C.text }}>${fmtNum(phase.finalValueUsd, 0)}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                      Net P&L
                    </div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 800, color }}>
                      {isPos ? "+" : "-"}${fmtNum(Math.abs(netPnl), 2)}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.75, color, fontFamily: "'Space Mono', monospace" }}>
                      {fmtPct(netPnlPct, 1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                      APR
                    </div>
                    <div style={{ fontFamily: "'Bungee', cursive", fontSize: 14, color }}>
                      {fmtPct(apy, 0)}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                      Capital
                    </div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: C.text2 }}>
                      ${fmtNum(phase.depositedUsd)} → <span style={{ color: C.text }}>${fmtNum(phase.finalValueUsd)}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                      Net P&L
                    </div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 800, color }}>
                      {isPos ? "+" : "-"}${fmtNum(Math.abs(netPnl), 2)}
                      <span style={{ fontSize: 11, opacity: 0.75, marginLeft: 6 }}>
                        {fmtPct(netPnlPct, 2)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                      Annualized
                    </div>
                    <div style={{ fontFamily: "'Bungee', cursive", fontSize: 16, color }}>
                      {fmtPct(apy, 0)}
                    </div>
                  </div>
                </>
              )}

              {/* Breakdown badges */}
              <div style={{
                display: "flex",
                flexDirection: mobile ? "row" as const : "column" as const,
                gap: mobile ? 12 : 4,
                alignItems: mobile ? "flex-start" as const : "flex-end" as const,
                justifyContent: mobile ? "space-between" as const : "flex-start" as const,
                ...(mobile ? { paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 10 } : {}),
                flexWrap: "wrap" as const,
              }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: mobile ? 10 : 11, color: C.green }}>
                  +${fmtNum(phase.feesEarnedUsd, 2)} fees
                </span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: mobile ? 10 : 11, color: C.red }}>
                  -${fmtNum(phase.swapCostsUsd, 2)} swaps
                </span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: mobile ? 10 : 11, color: driftColor }}>
                  {drift >= 0 ? "+" : "-"}${fmtNum(Math.abs(drift), 2)} drift
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
   ARB PANEL — Cross-chain SOFTWARE.ai/USDC arbitrage between Doma and Base
════════════════════════════════════════════════════════════════════════ */

const DOMA_BRAND = "#a855f7";   // purple — Doma chain
const BASE_BRAND = "#0052ff";   // blue   — Coinbase Base chain

/* Live spread monitor — two-pool comparison + spread bar with threshold mark */
function SpreadMonitor({
  domaPrice, basePrice, spreadPct, thresholdPct, inRange, mobile,
}: {
  domaPrice: number; basePrice: number; spreadPct: number;
  thresholdPct: number; inRange: boolean; mobile: boolean;
}) {
  const spreadBps      = spreadPct * 10000;
  const thresholdBps   = thresholdPct * 10000;
  const cheaper        = domaPrice < basePrice ? "doma" : "base";
  // Bar fills from threshold up — anything to the right of the threshold is profitable
  const barMaxBps      = Math.max(spreadBps * 1.4, thresholdBps * 2.5, 50);
  const spreadFillPct  = Math.min(100, (spreadBps    / barMaxBps) * 100);
  const thresholdLeftPct = (thresholdBps / barMaxBps) * 100;
  const indicatorColor = inRange ? C.green : C.text3;

  return (
    <div className="dash-card" style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: mobile ? "20px 18px" : "24px 26px",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap" as const, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: indicatorColor, fontSize: 14 }}>⇌</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.text2, letterSpacing: 0.6, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace" }}>
            Live Spread
          </span>
          <Tag color={indicatorColor}>
            {inRange ? "IN RANGE" : "BELOW FLOOR"}
          </Tag>
        </div>
        <span style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5 }}>
          THRESHOLD {thresholdBps.toFixed(0)} BPS
        </span>
      </div>

      {/* Two-pool side-by-side */}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr auto 1fr" : "1fr auto 1fr", gap: mobile ? 10 : 24, alignItems: "center", marginBottom: 22 }}>
        {/* Doma side */}
        <div style={{
          background: cheaper === "doma" ? `${DOMA_BRAND}10` : "rgba(5,7,15,0.55)",
          border: `1px solid ${cheaper === "doma" ? `${DOMA_BRAND}40` : C.border}`,
          borderRadius: 12,
          padding: "16px 14px",
          textAlign: "center" as const,
        }}>
          <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: DOMA_BRAND, letterSpacing: 1.2, marginBottom: 8 }}>
            DOMA · UNI V3 0.05%
          </div>
          <div style={{ fontFamily: "'Bungee', cursive", fontSize: mobile ? 18 : 22, color: C.text, lineHeight: 1 }}>
            ${domaPrice.toFixed(6)}
          </div>
          {cheaper === "doma" && (
            <div style={{ fontSize: 9, color: C.green, fontWeight: 800, marginTop: 6, letterSpacing: 0.5, fontFamily: "'Space Mono', monospace" }}>
              CHEAPER
            </div>
          )}
        </div>

        {/* Spread arrow */}
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: mobile ? 18 : 26, color: indicatorColor }}>↔</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: mobile ? 11 : 13, fontWeight: 800, color: indicatorColor, marginTop: 4 }}>
            {spreadBps.toFixed(1)} BPS
          </div>
          <div style={{ fontSize: 9, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5, marginTop: 2 }}>
            {(spreadPct * 100).toFixed(3)}%
          </div>
        </div>

        {/* Base side */}
        <div style={{
          background: cheaper === "base" ? `${BASE_BRAND}15` : "rgba(5,7,15,0.55)",
          border: `1px solid ${cheaper === "base" ? `${BASE_BRAND}50` : C.border}`,
          borderRadius: 12,
          padding: "16px 14px",
          textAlign: "center" as const,
        }}>
          <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: BASE_BRAND, letterSpacing: 1.2, marginBottom: 8 }}>
            BASE · AERO 0.30%
          </div>
          <div style={{ fontFamily: "'Bungee', cursive", fontSize: mobile ? 18 : 22, color: C.text, lineHeight: 1 }}>
            ${basePrice.toFixed(6)}
          </div>
          {cheaper === "base" && (
            <div style={{ fontSize: 9, color: C.green, fontWeight: 800, marginTop: 6, letterSpacing: 0.5, fontFamily: "'Space Mono', monospace" }}>
              CHEAPER
            </div>
          )}
        </div>
      </div>

      {/* Spread vs threshold visual bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 9, fontFamily: "'Space Mono', monospace", color: C.text4, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
          <span>0 bps</span>
          <span>spread vs threshold</span>
          <span>{barMaxBps.toFixed(0)} bps</span>
        </div>
        <div style={{ position: "relative" as const, height: 12 }}>
          <div style={{ position: "absolute" as const, inset: 0, background: C.surfaceUp, borderRadius: 6 }} />
          {/* Filled portion */}
          <div style={{
            position: "absolute" as const, top: 0, bottom: 0, left: 0,
            width: `${spreadFillPct}%`,
            background: inRange
              ? `linear-gradient(90deg, ${C.cyan}, ${C.green})`
              : `linear-gradient(90deg, ${C.text5}, ${C.text4})`,
            borderRadius: 6,
            boxShadow: inRange ? `0 0 12px ${C.green}60` : "none",
          }} />
          {/* Threshold marker */}
          <div style={{
            position: "absolute" as const, top: -2, bottom: -2,
            left: `${thresholdLeftPct}%`,
            width: 2,
            background: C.yellow,
            boxShadow: `0 0 6px ${C.yellow}80`,
          }} />
        </div>
      </div>
    </div>
  );
}

/* Cross-chain capital allocation — stacked bar showing stable% vs token% per chain */
function CrossChainCapital({ state, mobile }: { state: ArbState; mobile: boolean }) {
  const domaUsdc  = state.doma_usdce_balance ?? 0;
  const domaToken = (state.doma_token_balance ?? 0) * (state.doma_price_usd ?? 0);
  const baseUsdc  = state.base_usdc_balance  ?? 0;
  const baseToken = (state.base_token_balance ?? 0) * (state.base_price_usd ?? 0);
  const domaTotal = domaUsdc + domaToken;
  const baseTotal = baseUsdc + baseToken;
  const grandTotal = domaTotal + baseTotal;

  const domaPct  = grandTotal > 0 ? (domaTotal / grandTotal) * 100 : 50;
  const basePct  = 100 - domaPct;
  const domaTokenPct = domaTotal > 0 ? (domaToken / domaTotal) * 100 : 0;
  const baseTokenPct = baseTotal > 0 ? (baseToken / baseTotal) * 100 : 0;

  return (
    <div className="dash-card" style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: mobile ? "20px 18px" : "24px 26px",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ color: C.purple, fontSize: 14 }}>◫</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text2, letterSpacing: 0.6, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace" }}>
          Cross-chain Inventory
        </span>
        <Tag color={C.text3}>${fmtNum(grandTotal)} total</Tag>
      </div>

      {/* Doma side */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          <span style={{ color: DOMA_BRAND, fontWeight: 700, letterSpacing: 0.5 }}>DOMA · ${fmtNum(domaTotal)}</span>
          <span style={{ color: C.text4 }}>USDC.e ${fmtNum(domaUsdc)}  ·  SOFT ${fmtNum(domaToken)}</span>
        </div>
        <div style={{ display: "flex", height: 10, background: C.surfaceUp, borderRadius: 5, overflow: "hidden" as const }}>
          <div style={{ width: `${100 - domaTokenPct}%`, background: `linear-gradient(90deg, ${C.cyan}, ${C.blue})` }} />
          <div style={{ width: `${domaTokenPct}%`, background: `linear-gradient(90deg, ${DOMA_BRAND}, ${C.pink})` }} />
        </div>
      </div>

      {/* Base side */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
          <span style={{ color: BASE_BRAND, fontWeight: 700, letterSpacing: 0.5 }}>BASE · ${fmtNum(baseTotal)}</span>
          <span style={{ color: C.text4 }}>USDC ${fmtNum(baseUsdc)}  ·  SOFT ${fmtNum(baseToken)}</span>
        </div>
        <div style={{ display: "flex", height: 10, background: C.surfaceUp, borderRadius: 5, overflow: "hidden" as const }}>
          <div style={{ width: `${100 - baseTokenPct}%`, background: `linear-gradient(90deg, ${C.cyan}, ${BASE_BRAND})` }} />
          <div style={{ width: `${baseTokenPct}%`, background: `linear-gradient(90deg, ${C.indigo}, ${DOMA_BRAND})` }} />
        </div>
      </div>

      {/* Chain split summary */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Space Mono', monospace", color: C.text4, letterSpacing: 0.6, textTransform: "uppercase" as const }}>
        <span>{domaPct.toFixed(0)}% Doma</span>
        <span>STABLE / SOFTWARE per chain</span>
        <span>{basePct.toFixed(0)}% Base</span>
      </div>
    </div>
  );
}

/* Earned vs Paid comparison — visualizes structural cost issue */
function EarnedVsPaid({ earned, paidBridges, mobile }: { earned: number; paidBridges: number; mobile: boolean }) {
  const max = Math.max(earned, paidBridges, 0.01);
  const earnedPct = (earned / max) * 100;
  const paidPct   = (paidBridges / max) * 100;
  const upsideDown = paidBridges > earned;

  return (
    <div className="dash-card" style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: mobile ? "18px 16px" : "22px 24px",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" as const }}>
        <span style={{ color: upsideDown ? C.red : C.green, fontSize: 14 }}>{upsideDown ? "⚠" : "✓"}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text2, letterSpacing: 0.6, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace" }}>
          Earned vs Paid
        </span>
        {upsideDown && <Tag color={C.red}>STRUCTURAL LOSS</Tag>}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {/* Earned */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
            <span style={{ color: C.green, fontWeight: 700 }}>EARNED · gross trade PnL</span>
            <span style={{ color: C.text }}>+${fmtNum(earned, 2)}</span>
          </div>
          <div style={{ height: 8, background: C.surfaceUp, borderRadius: 4, overflow: "hidden" as const }}>
            <div style={{ width: `${earnedPct}%`, height: "100%", background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`, boxShadow: `0 0 6px ${C.green}80` }} />
          </div>
        </div>

        {/* Paid */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
            <span style={{ color: C.red, fontWeight: 700 }}>PAID · bridge fees</span>
            <span style={{ color: C.text }}>−${fmtNum(paidBridges, 2)}</span>
          </div>
          <div style={{ height: 8, background: C.surfaceUp, borderRadius: 4, overflow: "hidden" as const }}>
            <div style={{ width: `${paidPct}%`, height: "100%", background: `linear-gradient(90deg, ${C.red}, ${C.orange})`, boxShadow: `0 0 6px ${C.red}80` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* Arb Phase History — frozen snapshots of past capital phases. */
function ArbPhaseHistory({ mobile }: { mobile: boolean }) {
  if (ARB_PHASES.length === 0) return null;

  return (
    <div className="dash-card" style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: mobile ? "18px 16px" : "22px 24px",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" as const }}>
        <span style={{ color: C.indigo, fontSize: 14 }}>◷</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text2, letterSpacing: 0.6, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace" }}>
          Arb Phase History
        </span>
        <span style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5, marginLeft: 4 }}>
          {ARB_PHASES.length} COMPLETED · 1 ACTIVE
        </span>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {ARB_PHASES.map((phase, i) => {
          const netPnl     = phase.endValueUsd - phase.startValueUsd;
          const netPnlPct  = (netPnl / phase.startValueUsd) * 100;
          const durationMs = phase.endTime.getTime() - phase.startTime.getTime();
          const days       = durationMs / 86400_000;
          const isPos      = netPnl >= 0;
          const color      = isPos ? C.green : C.red;
          const fmtPhaseDate = (d: Date) =>
            d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

          return (
            <div key={i} style={{
              background: "rgba(5,7,15,0.55)",
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: mobile ? "14px 16px" : "16px 18px",
              display: "grid",
              gridTemplateColumns: mobile
                ? "1fr"
                : "minmax(150px, 1.2fr) repeat(3, minmax(0, 1fr))",
              gap: mobile ? 12 : 16,
              alignItems: mobile ? "stretch" as const : "center" as const,
            }}>
              {/* Label + dates */}
              <div style={{
                ...(mobile ? { paddingBottom: 10, borderBottom: `1px solid ${C.border}` } : {}),
              }}>
                <div style={{ fontSize: mobile ? 14 : 13, fontWeight: 800, color: C.text, marginBottom: 4 }}>
                  {phase.label}
                </div>
                <div style={{ fontSize: 10, color: C.text4, fontFamily: "'Space Mono', monospace", letterSpacing: 0.3 }}>
                  {fmtPhaseDate(phase.startTime)} → {fmtPhaseDate(phase.endTime)} · {days < 1 ? `${(days * 24).toFixed(1)}h` : `${days.toFixed(1)}d`}
                </div>
              </div>

              {mobile ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>Capital</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text2 }}>
                      ${fmtNum(phase.startValueUsd, 0)}<br/>→ <span style={{ color: C.text }}>${fmtNum(phase.endValueUsd, 0)}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>Net P&L</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 800, color }}>
                      {isPos ? "+" : "-"}${fmtNum(Math.abs(netPnl), 2)}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.75, color, fontFamily: "'Space Mono', monospace" }}>
                      {fmtPct(netPnlPct, 1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>Activity</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.text2 }}>
                      {phase.trades} trades<br/>
                      <span style={{ color: C.text4 }}>{phase.bridges} bridges</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>Capital</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: C.text2 }}>
                      ${fmtNum(phase.startValueUsd)} → <span style={{ color: C.text }}>${fmtNum(phase.endValueUsd)}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>Net P&L</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 800, color }}>
                      {isPos ? "+" : "-"}${fmtNum(Math.abs(netPnl), 2)}
                      <span style={{ fontSize: 11, opacity: 0.75, marginLeft: 6 }}>
                        {fmtPct(netPnlPct, 2)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.text4, letterSpacing: 1, textTransform: "uppercase" as const, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>Activity</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: C.text2 }}>
                      {phase.trades} trades · <span style={{ color: C.text4 }}>{phase.bridges} bridges</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArbPanel() {
  const mobile                  = useMobile();
  const [data, setData]         = useState<ArbSummary | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [lastUpdated, setLast]  = useState<Date | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setR]      = useState(false);
  const [age, setAge]           = useState(0);

  async function fetchArb() {
    setR(true);
    try {
      const res  = await fetch("/api/arb", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
      setData(json);
      setError(null);
      setLast(new Date());
    } catch { setError("Arb bot unreachable"); }
    finally  { setLoading(false); setR(false); }
  }

  useEffect(() => {
    fetchArb();
    const t = setInterval(fetchArb, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAge(lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0), 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  const state    = data?.state    ?? {};
  const trades   = data?.trades   ?? [];
  const bridges  = data?.bridges  ?? [];
  const config   = data?.config   ?? {};

  // Lifetime values from the API
  const totalCapital     = state.total_capital_usd ?? 0;
  const lifetimeGross    = state.gross_trade_pnl_usd ?? 0;
  const lifetimeBridges  = state.total_bridge_fees_usd ?? 0;
  const lifetimeArbs     = state.total_arbs_executed ?? 0;
  const lifetimeSuccess  = state.successful_arbs ?? 0;
  const lifetimeFails    = state.failed_arbs ?? 0;
  const lifetimeBridgeCnt = bridges.length;

  // Phase-only values (subtract baseline carry-forward)
  const grossProfit = Math.max(0, lifetimeGross   - ARB_BASELINE_GROSS);
  const bridgeFees  = Math.max(0, lifetimeBridges - ARB_BASELINE_BRIDGE_FEES);
  const totalArbs   = Math.max(0, lifetimeArbs    - ARB_BASELINE_TRADES);
  const bridgeCount = Math.max(0, lifetimeBridgeCnt - ARB_BASELINE_BRIDGES);
  // Net profit = current total capital vs the phase's starting basis
  const netProfit   = totalCapital - ARB_BASELINE_VALUE;

  // Success/fail rates we leave as lifetime (no clean way to back-derive
  // phase-only without per-trade timestamps and a stable baseline).
  const successArbs  = lifetimeSuccess;
  const failArbs     = lifetimeFails;
  const successRate  = lifetimeArbs > 0 ? (lifetimeSuccess / lifetimeArbs) * 100 : 100;

  const inRange      = state.in_range ?? false;
  const spreadPct    = state.spread_pct ?? 0;
  const thresholdPct = state.spread_threshold_pct ?? 0;
  const domaPrice    = state.doma_price_usd ?? 0;
  const basePrice    = state.base_price_usd ?? 0;
  const bridgesPerTrade = totalArbs > 0 ? (bridgeCount / totalArbs) : 0;

  // Color coding per the doc — aggressive red/yellow/green based on net P&L
  const profitColor = netProfit >  0    ? C.green
                    : netProfit > -1    ? C.yellow
                    :                     C.red;
  const profitPct   = ARB_BASELINE_VALUE > 0 ? (netProfit / ARB_BASELINE_VALUE) * 100 : 0;

  // Time deployed — anchored to the most recent phase reset, not first deploy
  const timeStr  = fmtRunning(ARB_BASELINE_TIME);
  const phaseStart = ARB_BASELINE_TIME;

  // Detect "currently bridging" — most recent OK bridge within the last 3 min
  const bridgingNow = (() => {
    const now = Date.now();
    return bridges.some(b => {
      if (b.status !== "OK") return false;
      const t = new Date(b.executed_at ?? 0).getTime();
      return !Number.isNaN(t) && (now - t) < 180_000;
    });
  })();

  const online = !error && !loading && !!data;

  return (
    <section style={{ marginBottom: 56 }}>

      {/* ── Section title ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Pulse color={online ? (inRange ? C.green : C.text3) : error ? C.red : C.text3} />
          <h2 style={{ margin: 0, fontFamily: "'Bungee', cursive", fontSize: 22, color: C.text, letterSpacing: 0.3 }}>
            Arbitrage Bot
          </h2>
          <Tag color={online ? (inRange ? C.green : C.text3) : C.text3}>
            {loading ? "Connecting" : online ? (inRange ? "In Range" : "Idle · Spread Compressed") : "Offline"}
          </Tag>
          <Tag color={DOMA_BRAND}>Doma</Tag>
          <Tag color={BASE_BRAND}>Base</Tag>
          {bridgingNow && <Tag color={C.yellow}>Bridging · LZ Delivery</Tag>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: C.text3, fontFamily: "'Space Mono', monospace" }}>
          {!!state.last_arb_at && (
            <span>LAST ARB · {fmtDate(state.last_arb_at as string)}</span>
          )}
          {lastUpdated && <span style={{ color: C.text4 }}>FETCHED {fmtAge(age)} AGO</span>}
          <button
            onClick={fetchArb}
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
          Connecting to arb bot…
        </div>
      )}

      {error && !loading && (
        <div style={{ background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 14, padding: "18px 22px", color: "#fca5a5", fontSize: 13 }}>
          ⚠️ {error} — set <code style={{ color: "#fde68a", fontFamily: "'Space Mono', monospace" }}>ARB_API_KEY</code> on Vercel and confirm port 5003 is reachable on the droplet.
        </div>
      )}

      {data && !error && (
        <div className="dash-fade-in">

          {/* ── HERO ──────────────────────────────────────────── */}
          <div style={{
            position: "relative" as const,
            background: `
              radial-gradient(circle at 0% 0%, ${DOMA_BRAND}1c 0%, transparent 50%),
              radial-gradient(circle at 100% 100%, ${BASE_BRAND}1c 0%, transparent 50%),
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
                  Phase Net Profit (vs ${fmtNum(ARB_BASELINE_VALUE)} basis)
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" as const }}>
                  <div style={{
                    fontFamily: "'Bungee', cursive",
                    fontSize: mobile ? 44 : 64,
                    color: profitColor, lineHeight: 1, letterSpacing: -1,
                  }}>
                    {netProfit >= 0 ? "+" : "-"}${fmtNum(Math.abs(netProfit), 2)}
                  </div>
                  <div style={{ fontSize: 13, color: C.text3, fontWeight: 700, letterSpacing: 0.5 }}>USD</div>
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  marginTop: 14,
                  background: netProfit >= 0 ? C.greenSoft : C.redSoft,
                  border: `1px solid ${netProfit >= 0 ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
                  color: profitColor,
                  borderRadius: 50, padding: "5px 14px", fontSize: 12, fontWeight: 800,
                }}>
                  <span>+${fmtNum(grossProfit, 2)} earned</span>
                  <span style={{ opacity: 0.65 }}>−</span>
                  <span>${fmtNum(bridgeFees, 2)} bridges</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minWidth: mobile ? "100%" : 320 }}>
                <MiniStat label="Phase Trades"    value={String(totalArbs)} accent={C.cyan} sub={`lifetime ${lifetimeArbs}`} />
                <MiniStat label="Success Rate"    value={fmtPct(successRate, 0)} accent={successRate >= 90 ? C.green : C.yellow} sub={`${successArbs}/${lifetimeArbs} lifetime`} />
                <MiniStat label="Time Deployed"   value={timeStr} accent={C.purple}
                  sub={`since ${phaseStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`} />
                <MiniStat label="Bridges/Trade"   value={bridgesPerTrade.toFixed(2)} accent={bridgesPerTrade < 0.3 ? C.green : bridgesPerTrade < 0.6 ? C.yellow : C.red}
                  sub={`${bridgeCount} this phase`} />
              </div>
            </div>

            <div style={{ position: "relative" as const, zIndex: 1, marginTop: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Space Mono', monospace", color: C.text3, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" as const }}>
                <span>Total Capital</span>
                <span>${fmtNum(totalCapital)} across both chains</span>
              </div>
              <div style={{ display: "flex", height: 8, background: C.surfaceUp, borderRadius: 4, overflow: "hidden" as const }}>
                <div style={{ width: `${totalCapital > 0 ? ((state.doma_capital_usd ?? 0) / totalCapital) * 100 : 50}%`, background: `linear-gradient(90deg, ${DOMA_BRAND}, ${C.indigo})`, boxShadow: `0 0 12px ${DOMA_BRAND}60` }} />
                <div style={{ width: `${totalCapital > 0 ? ((state.base_capital_usd ?? 0) / totalCapital) * 100 : 50}%`, background: `linear-gradient(90deg, ${C.cyan}, ${BASE_BRAND})`, boxShadow: `0 0 12px ${BASE_BRAND}60` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                <span style={{ color: DOMA_BRAND }}>● Doma ${fmtNum(state.doma_capital_usd ?? 0)}</span>
                <span style={{ color: BASE_BRAND }}>${fmtNum(state.base_capital_usd ?? 0)} Base ●</span>
              </div>
            </div>
          </div>

          {/* ── PHASE HISTORY ─────────────────────────────────── */}
          <ArbPhaseHistory mobile={mobile} />

          {/* ── LIVE SPREAD MONITOR ───────────────────────────── */}
          <SpreadMonitor
            domaPrice={domaPrice}
            basePrice={basePrice}
            spreadPct={spreadPct}
            thresholdPct={thresholdPct}
            inRange={inRange}
            mobile={mobile}
          />

          {/* ── METRIC CARDS ──────────────────────────────────── */}
          <div className="dash-stagger" style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
            <DataCard
              label="Gross Earned"
              value={`+$${fmtNum(grossProfit, 2)}`}
              sub={`${totalArbs} trades · avg $${totalArbs > 0 ? (grossProfit / totalArbs).toFixed(2) : "0.00"}/trade`}
              accent={C.green}
              direction="up"
            />
            <DataCard
              label="Bridge Fees"
              value={`-$${fmtNum(bridgeFees, 2)}`}
              sub={`${bridgeCount} bridges · ${bridgesPerTrade.toFixed(2)}/trade`}
              accent={C.red}
              direction="down"
            />
            <DataCard
              label="Net Edge"
              value={`${netProfit >= 0 ? "+" : "-"}$${fmtNum(Math.abs(netProfit / Math.max(1, totalArbs)), 4)}`}
              sub="per trade · after costs"
              accent={profitColor}
              direction={netProfit >= 0 ? "up" : "down"}
            />
            <DataCard
              label="Success Rate"
              value={fmtPct(successRate, 0)}
              sub={`${successArbs}/${totalArbs} completed`}
              accent={successRate >= 90 ? C.green : successRate >= 70 ? C.yellow : C.red}
            />
          </div>

          {/* ── EARNED vs PAID ────────────────────────────────── */}
          <EarnedVsPaid earned={grossProfit} paidBridges={bridgeFees} mobile={mobile} />

          {/* ── CROSS-CHAIN INVENTORY ─────────────────────────── */}
          <CrossChainCapital state={state} mobile={mobile} />

          {/* ── TRADES + BRIDGES feeds (side-by-side desktop, stacked mobile) ─── */}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 18 }}>

            {/* Trade history */}
            <div className="dash-card" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" as const }}>
              <PanelHead title="Recent Arbs" count={trades.length} accent={C.cyan} icon="⇌" />
              {trades.length === 0 ? (
                <Empty text="No arbs yet" />
              ) : (
                <div className="dash-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
                  {trades.slice(0, 30).map((t, i) => {
                    const np    = t.net_profit_usd ?? 0;
                    const isPos = np >= 0;
                    const color = t.status === "failed" ? C.red : isPos ? C.green : C.red;
                    const arrow = t.direction === "doma_to_base" ? "DOMA → BASE" : "BASE → DOMA";
                    return (
                      <div key={t.id ?? i} className="dash-row" style={{
                        padding: "12px 18px",
                        borderTop: i > 0 ? `1px solid ${C.border}` : undefined,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" as const }}>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: C.text4 }}>
                                {fmtTime(t.executed_at as string)}
                              </span>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 800, color: t.direction === "doma_to_base" ? DOMA_BRAND : BASE_BRAND, letterSpacing: 0.5 }}>
                                {arrow}
                              </span>
                              {t.status === "failed" && <Tag color={C.red}>FAILED</Tag>}
                            </div>
                            <div style={{ fontSize: 11, color: C.text3, fontFamily: "'Space Mono', monospace" }}>
                              ${fmtNum(t.input_usd ?? 0)} → ${fmtNum(t.output_usd ?? 0)}
                              {t.spread_bps !== undefined && (
                                <span style={{ color: C.text4, marginLeft: 8 }}>· {t.spread_bps.toFixed(0)} bps</span>
                              )}
                            </div>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "'Space Mono', monospace" }}>
                            {isPos ? "+" : "-"}${fmtNum(Math.abs(np), 4)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bridge history */}
            <div className="dash-card" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" as const }}>
              <PanelHead title="Bridge History" count={bridges.length} accent={C.yellow} icon="⤳" />
              {bridges.length === 0 ? (
                <Empty text="No bridges yet" />
              ) : (
                <div className="dash-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
                  {bridges.slice(0, 30).map((b, i) => {
                    const isOk = b.status === "OK";
                    const fromC = b.from_chain === "doma" ? DOMA_BRAND : BASE_BRAND;
                    const toC   = b.to_chain   === "doma" ? DOMA_BRAND : BASE_BRAND;
                    const isStargate = b.notes?.includes("stargate") || b.notes?.includes("oft");
                    return (
                      <div key={b.id ?? i} className="dash-row" style={{
                        padding: "12px 18px",
                        borderTop: i > 0 ? `1px solid ${C.border}` : undefined,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" as const }}>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: C.text4 }}>
                                {fmtTime(b.executed_at as string)}
                              </span>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 800, color: fromC, letterSpacing: 0.5 }}>
                                {(b.from_chain ?? "").toUpperCase()}
                              </span>
                              <span style={{ color: C.text4 }}>→</span>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 800, color: toC, letterSpacing: 0.5 }}>
                                {(b.to_chain ?? "").toUpperCase()}
                              </span>
                              {isStargate && <Tag color={C.cyan}>STARGATE</Tag>}
                              {!isOk && <Tag color={C.red}>FAIL</Tag>}
                            </div>
                            <div style={{ fontSize: 11, color: C.text3, fontFamily: "'Space Mono', monospace" }}>
                              ${fmtNum(b.amount_in_usd ?? 0)} → ${fmtNum(b.amount_out_usd ?? 0)}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.red, fontFamily: "'Space Mono', monospace" }}>
                            -${fmtNum(b.cost_usd ?? 0, 4)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Config footer ─────────────────────────────────── */}
          <div style={{ marginTop: 18, padding: "14px 18px", background: "rgba(5,7,15,0.55)", border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 10, fontFamily: "'Space Mono', monospace", color: C.text4, letterSpacing: 0.4, display: "flex", flexWrap: "wrap" as const, gap: 18 }}>
            <span>PAIR · {config.pair ?? "SOFTWARE.ai/USDC"}</span>
            <span>SIZE · ${fmtNum(config.trade_size_usd ?? 0)}</span>
            <span>MIN SPREAD · {((config.min_spread_pct ?? 0) * 10000).toFixed(0)} bps</span>
            <span>SLIPPAGE · {((config.max_slippage_pct ?? 0) * 100).toFixed(2)}%</span>
            <span>STABLE BRIDGE · {config.bridge_provider_stable ?? "—"}</span>
            <span>TOKEN BRIDGE · {config.bridge_provider_token ?? "—"}</span>
          </div>
        </div>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ARB LOGS — terminal aesthetic, single process
════════════════════════════════════════════════════════════════════════ */

function ArbLogs() {
  const [data, setData]       = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setR]    = useState(false);
  const [lines, setLines]     = useState(80);

  async function fetchLogs(n = lines) {
    setR(true);
    try {
      const res  = await fetch(`/api/arb-logs?lines=${n}`, { cache: "no-store" });
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
    if (/error|exception|fail|critical/i.test(line))                    return C.red;
    if (/warn|halt|below|reverted/i.test(line))                         return C.yellow;
    if (/swap.*ok|arb.*completed|profit|spread.*\d{3,}/i.test(line))    return C.green;
    if (/bridge|stargate|oft|relay/i.test(line))                        return C.cyan;
    if (/idle|waiting|skip/i.test(line))                                return C.text4;
    return C.text2;
  };

  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" as const, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontFamily: "'Bungee', cursive", fontSize: 22, color: C.text, letterSpacing: 0.3 }}>
            Arb Bot Logs
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
            ~/arb-bot/logs/arb_bot.log
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
          {/* Bots first, stacked. Each is a self-contained section. */}
          <BotPanel />
          <LPPanel />
          <ArbPanel />

          {/* Logs grid — auto-sniper + LP on top row, arb on its own row at desktop */}
          <div style={{
            display: "grid",
            gridTemplateColumns: mobile ? "1fr" : "1fr 1fr",
            gap: 18,
            marginBottom: 18,
          }}>
            <div><BotLogs /></div>
            <div><LPLogs /></div>
          </div>
          <ArbLogs />

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
