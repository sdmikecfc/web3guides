"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type AssetKey  = "btc" | "eth" | "sol";
type PeriodKey = "2018" | "2022" | "2025";

// ── Historical monthly close prices (approximate, for illustration) ────────
const PRICES: Record<AssetKey, Partial<Record<PeriodKey, number[]>>> = {
  btc: {
    "2018": [13800,10600,8200,9200,8500,6200,8200,7000,6600,6300,4000,3200],
    "2022": [57000,47000,38000,44000,47000,40000,31000,20000,23000,20000,19500,20500,16500,16500],
    "2025": [126000,97000,105000,98000,85000,67000],
  },
  eth: {
    "2018": [1200,870,580,600,670,450,470,285,225,200,130,110],
    "2022": [4600,3700,3000,2900,3000,3050,2750,1100,1600,1700,1300,1600,1200,1200],
    "2025": [4200,3800,3500,3000,2500,1900],
  },
  sol: {
    "2022": [220,170,150,110,130,140,70,40,42,44,33,37,13,10],
    "2025": [240,200,190,180,150,120],
  },
};

const MONTH_LABELS: Record<PeriodKey, string[]> = {
  "2018": ["Jan '18","Feb '18","Mar '18","Apr '18","May '18","Jun '18","Jul '18","Aug '18","Sep '18","Oct '18","Nov '18","Dec '18"],
  "2022": ["Nov '21","Dec '21","Jan '22","Feb '22","Mar '22","Apr '22","May '22","Jun '22","Jul '22","Aug '22","Sep '22","Oct '22","Nov '22","Dec '22"],
  "2025": ["Oct '25","Nov '25","Dec '25","Jan '26","Feb '26","Mar '26"],
};

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "2018": "2018 Crash",
  "2022": "2022 Bear",
  "2025": "2025 Bear (live)",
};

const PERIOD_DESC: Record<PeriodKey, string> = {
  "2018": "Jan → Dec 2018 · BTC fell 85% peak-to-trough",
  "2022": "Nov 2021 → Dec 2022 · LUNA, 3AC, FTX collapse",
  "2025": "Oct 2025 → now · Down ~47% from $126K ATH",
};

const CURRENT_PRICE: Record<AssetKey, number> = { btc: 67000, eth: 1900, sol: 120 };
const ASSET_COLOR:   Record<AssetKey, string>  = { btc: "#F7931A", eth: "#627EEA", sol: "#00FFA3" };
const ASSET_NAME:    Record<AssetKey, string>  = { btc: "Bitcoin", eth: "Ethereum", sol: "Solana" };
const ASSET_TICKER:  Record<AssetKey, string>  = { btc: "BTC", eth: "ETH", sol: "SOL" };

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtCoins(n: number, ticker: string): string {
  if (n >= 1000) return `${n.toFixed(1)} ${ticker}`;
  if (n >= 1)    return `${n.toFixed(3)} ${ticker}`;
  return `${n.toFixed(6)} ${ticker}`;
}
function fmtRoi(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ── Calculation ────────────────────────────────────────────────────────────
interface Results {
  totalInvested: number;
  totalCoins: number;
  avgBuyPrice: number;
  currentValue: number;
  peakValue: number;
  roi: number;
  lumpSumValue: number;
  lumpSumRoi: number;
  chartInvested: number[];
  chartValue: number[];
  n: number;
}

function calculate(asset: AssetKey, period: PeriodKey, monthly: number): Results | null {
  const prices = PRICES[asset][period];
  if (!prices || monthly <= 0) return null;
  const current = CURRENT_PRICE[asset];
  let totalCoins = 0;
  let peakValue  = 0;
  const chartInvested: number[] = [];
  const chartValue: number[]    = [];
  for (let i = 0; i < prices.length; i++) {
    totalCoins += monthly / prices[i];
    const inv = monthly * (i + 1);
    const val = totalCoins * prices[i];
    peakValue = Math.max(peakValue, val);
    chartInvested.push(inv);
    chartValue.push(val);
  }
  const totalInvested   = monthly * prices.length;
  const avgBuyPrice     = totalInvested / totalCoins;
  const currentValue    = totalCoins * current;
  const roi             = ((currentValue - totalInvested) / totalInvested) * 100;
  const lumpSumCoins    = totalInvested / prices[0];
  const lumpSumValue    = lumpSumCoins * current;
  const lumpSumRoi      = ((lumpSumValue - totalInvested) / totalInvested) * 100;
  return { totalInvested, totalCoins, avgBuyPrice, currentValue, peakValue, roi, lumpSumValue, lumpSumRoi, chartInvested, chartValue, n: prices.length };
}

function getMessage(roi: number, asset: string): string {
  if (roi > 400) return `${asset} holders who kept buying through the pain are sitting on life-changing returns. 💎`;
  if (roi > 200) return `Boring monthly buys beat almost every active trader. Consistency won. 🚀`;
  if (roi > 100) return `DCA doubled your money while most panic-sold the bottom. Patience pays. 📈`;
  if (roi > 50)  return `In the green — the market rewards those who don't flinch. 🟢`;
  if (roi > 10)  return `Modestly ahead. Bear markets are where long-term wealth is quietly built. 🌱`;
  if (roi > -10) return `Close to break-even — but you hold more ${asset} than you'd have otherwise.`;
  if (roi > -30) return `Still underwater, but every buy was cheaper than the last top. Recovery restores it all. 📉`;
  if (roi > -50) return `Deep in the red for now. Every previous bear has eventually reversed. 🐻`;
  return `Brutal — but every previous bear market has ended. The bet is on what comes next. 💪`;
}

// ── Mini SVG Chart ─────────────────────────────────────────────────────────
function Chart({ invested, value, color }: { invested: number[]; value: number[]; color: string }) {
  const W = 560, H = 160, PX = 16, PY = 12;
  const n   = invested.length;
  const max = Math.max(...invested, ...value) * 1.08;
  const x   = (i: number) => PX + (i / (n - 1)) * (W - PX * 2);
  const y   = (v: number) => H - PY - (v / max) * (H - PY * 2);
  const valPath = value.map((v, i)    => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const invPath = invested.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${valPath} L${x(n-1).toFixed(1)},${(H - PY).toFixed(1)} L${x(0).toFixed(1)},${(H - PY).toFixed(1)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1={PX} y1={y(max * t)} x2={W - PX} y2={y(max * t)}
          stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />
      ))}
      {/* Area fill */}
      <path d={areaPath} fill={`url(#grad-${color.replace("#","")})`} />
      {/* Invested dashed line */}
      <path d={invPath} stroke="#334155" strokeWidth="1.5" fill="none" strokeDasharray="6,4" />
      {/* Value line */}
      <path d={valPath} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots at start and end */}
      <circle cx={x(0)} cy={y(value[0])} r="4" fill={color} />
      <circle cx={x(n-1)} cy={y(value[n-1])} r="4" fill={color} />
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function DCACalculator() {
  const [asset,   setAsset]   = useState<AssetKey>("btc");
  const [period,  setPeriod]  = useState<PeriodKey>("2022");
  const [monthly, setMonthly] = useState<number>(100);
  const [custom,  setCustom]  = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [copied,  setCopied]  = useState(false);

  const color  = ASSET_COLOR[asset];
  const ticker = ASSET_TICKER[asset];

  // Ensure period exists for asset
  const validPeriods = Object.keys(PRICES[asset]) as PeriodKey[];
  const safePeriod   = validPeriods.includes(period) ? period : validPeriods[0];

  function handleAssetChange(a: AssetKey) {
    setAsset(a);
    setResults(null);
    const vp = Object.keys(PRICES[a]) as PeriodKey[];
    if (!vp.includes(period)) setPeriod(vp[0]);
  }

  function handleCalculate() {
    const r = calculate(asset, safePeriod, monthly);
    setResults(r);
  }

  function handleShare() {
    if (!results) return;
    const roi = fmtRoi(results.roi);
    const text = `If I'd DCA'd $${monthly}/month into ${ASSET_NAME[asset]} through the ${PERIOD_LABEL[safePeriod]}, I'd have turned ${fmt(results.totalInvested)} into ${fmt(results.currentValue)} (${roi}). Try it yourself → https://web3guides.com/tools/dca`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  const S: Record<string, React.CSSProperties> = {
    section: { marginBottom: 32 },
    label:   { fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#64748b", marginBottom: 12, display: "block" },
    chips:   { display: "flex", flexWrap: "wrap", gap: 8 },
  };

  function Chip({ active, onClick, children, chipColor }: { active: boolean; onClick: () => void; children: React.ReactNode; chipColor?: string }) {
    const c = chipColor ?? color;
    return (
      <button onClick={onClick} style={{
        padding: "8px 18px", borderRadius: 24, border: `1px solid ${active ? c : "#1e293b"}`,
        background: active ? `${c}18` : "#0d1424", color: active ? c : "#64748b",
        fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: active ? 700 : 400,
        cursor: "pointer", transition: "all 0.15s", outline: "none",
      }}>
        {children}
      </button>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 80px" }}>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          display: "inline-block", background: "rgba(247,147,26,0.12)", border: "1px solid rgba(247,147,26,0.25)",
          borderRadius: 20, padding: "4px 14px", fontSize: 11, fontWeight: 700, color: "#F7931A",
          letterSpacing: 2, textTransform: "uppercase", marginBottom: 16,
        }}>
          Free Tool
        </div>
        <h1 style={{ margin: "0 0 14px", fontSize: "clamp(26px, 5vw, 42px)", fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>
          Bear Market{" "}
          <span style={{ background: "linear-gradient(135deg,#F7931A,#ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Time Machine
          </span>
        </h1>
        <p style={{ margin: "0 auto", maxWidth: 500, fontSize: 15, color: "#64748b", lineHeight: 1.7 }}>
          What if you'd kept buying through the crash? Enter a bear market, pick a monthly amount, and see what DCA would have done to your portfolio.
        </p>
      </div>

      {/* Input Card */}
      <div style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 20, padding: "28px 24px 32px" }}>

        {/* Step 1 — Asset */}
        <div style={S.section}>
          <span style={S.label}>1. Pick your asset</span>
          <div style={S.chips}>
            {(["btc","eth","sol"] as AssetKey[]).map(a => (
              <Chip key={a} active={asset === a} onClick={() => handleAssetChange(a)} chipColor={ASSET_COLOR[a]}>
                {ASSET_NAME[a]} ({ASSET_TICKER[a]})
              </Chip>
            ))}
          </div>
        </div>

        {/* Step 2 — Period */}
        <div style={S.section}>
          <span style={S.label}>2. Choose the bear market</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {validPeriods.map(p => (
              <button key={p} onClick={() => { setPeriod(p); setResults(null); }} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", borderRadius: 12,
                border: `1px solid ${safePeriod === p ? color : "#1e293b"}`,
                background: safePeriod === p ? `${color}12` : "#080e1a",
                cursor: "pointer", outline: "none", textAlign: "left",
              }}>
                <span style={{ fontFamily: "system-ui", fontWeight: 700, fontSize: 14, color: safePeriod === p ? color : "#94a3b8" }}>
                  {PERIOD_LABEL[p]}
                </span>
                <span style={{ fontFamily: "system-ui", fontSize: 12, color: "#475569" }}>
                  {PERIOD_DESC[p]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 3 — Amount */}
        <div style={{ marginBottom: 28 }}>
          <span style={S.label}>3. Monthly DCA amount</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {[50, 100, 250, 500].map(amt => (
              <Chip key={amt} active={monthly === amt && custom === ""} onClick={() => { setMonthly(amt); setCustom(""); setResults(null); }}>
                ${amt}
              </Chip>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#64748b", fontFamily: "system-ui", fontSize: 14 }}>Custom:</span>
            <input
              type="number" min={1} max={100000}
              value={custom}
              onChange={e => { setCustom(e.target.value); const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) { setMonthly(v); setResults(null); }}}
              placeholder="e.g. 200"
              style={{
                background: "#080e1a", border: "1px solid #1e293b", borderRadius: 8,
                color: "#e2e8f0", fontFamily: "system-ui", fontSize: 14,
                padding: "8px 12px", width: 120, outline: "none",
              }}
            />
          </div>
        </div>

        {/* Calculate */}
        <button onClick={handleCalculate} style={{
          width: "100%", padding: "14px", borderRadius: 12, border: "none",
          background: `linear-gradient(135deg, ${color}, ${color}bb)`,
          color: "#fff", fontFamily: "'Bungee', cursive, system-ui",
          fontSize: 16, fontWeight: 400, letterSpacing: 1,
          cursor: "pointer", transition: "opacity 0.15s",
        }}
          onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
          onMouseOut={e => (e.currentTarget.style.opacity = "1")}
        >
          CALCULATE
        </button>
      </div>

      {/* Results */}
      {results && (
        <div style={{ marginTop: 28, animation: "fadeUp 0.35s ease" }}>
          <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }`}</style>

          {/* Top stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
            {[
              { label: "Total Invested",  value: fmt(results.totalInvested) },
              { label: "Current Value",   value: fmt(results.currentValue), highlight: true },
              { label: "ROI",             value: fmtRoi(results.roi),       roiVal: results.roi },
            ].map(s => (
              <div key={s.label} style={{
                background: "#0d1424", border: `1px solid ${s.highlight ? color + "40" : "#1e293b"}`,
                borderRadius: 14, padding: "16px 14px", textAlign: "center",
              }}>
                <div style={{
                  fontFamily: "'Bungee', cursive, system-ui", fontSize: "clamp(18px, 4vw, 26px)",
                  color: s.roiVal !== undefined
                    ? (s.roiVal >= 0 ? "#22c55e" : "#ef4444")
                    : (s.highlight ? color : "#e2e8f0"),
                  marginBottom: 4,
                }}>
                  {s.value}
                </div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 1, color: "#475569", textTransform: "uppercase" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Secondary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Coins Accumulated",  value: fmtCoins(results.totalCoins, ticker) },
              { label: "Avg Buy Price",       value: fmt(results.avgBuyPrice) },
              { label: "Current Price",       value: fmt(CURRENT_PRICE[asset]) },
              { label: "Peak Value (period)", value: fmt(results.peakValue) },
            ].map(s => (
              <div key={s.label} style={{
                background: "#080e1a", border: "1px solid #1e293b",
                borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontFamily: "system-ui", fontSize: 12, color: "#64748b" }}>{s.label}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ background: "#080e1a", border: "1px solid #1e293b", borderRadius: 16, padding: "20px 16px 12px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#475569" }}>
                Portfolio value during period
              </span>
              <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: "system-ui" }}>
                <span style={{ color: color }}>— Portfolio value</span>
                <span style={{ color: "#334155" }}>--- Amount invested</span>
              </div>
            </div>
            <Chart invested={results.chartInvested} value={results.chartValue} color={color} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontFamily: "system-ui", fontSize: 11, color: "#334155" }}>
                {MONTH_LABELS[safePeriod][0]}
              </span>
              <span style={{ fontFamily: "system-ui", fontSize: 11, color: "#334155" }}>
                {MONTH_LABELS[safePeriod][MONTH_LABELS[safePeriod].length - 1]}
              </span>
            </div>
          </div>

          {/* DCA vs Lump Sum */}
          <div style={{ background: "#080e1a", border: "1px solid #1e293b", borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#475569", marginBottom: 14 }}>
              DCA vs Lump Sum (same total amount, invested at start)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Bungee', cursive, system-ui", fontSize: 22, color: color, marginBottom: 4 }}>
                  {fmt(results.currentValue)}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", fontFamily: "system-ui" }}>DCA monthly</div>
                <div style={{ fontSize: 13, fontFamily: "system-ui", color: results.roi >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700, marginTop: 4 }}>
                  {fmtRoi(results.roi)}
                </div>
              </div>
              <div style={{ textAlign: "center", borderLeft: "1px solid #1e293b" }}>
                <div style={{ fontFamily: "'Bungee', cursive, system-ui", fontSize: 22, color: "#94a3b8", marginBottom: 4 }}>
                  {fmt(results.lumpSumValue)}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", fontFamily: "system-ui" }}>Lump sum at start</div>
                <div style={{ fontSize: 13, fontFamily: "system-ui", color: results.lumpSumRoi >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700, marginTop: 4 }}>
                  {fmtRoi(results.lumpSumRoi)}
                </div>
              </div>
            </div>
          </div>

          {/* Emotional message */}
          <div style={{
            background: `${color}0f`, border: `1px solid ${color}25`,
            borderRadius: 14, padding: "16px 20px", marginBottom: 20,
            fontFamily: "system-ui", fontSize: 15, color: "#e2e8f0", lineHeight: 1.6,
          }}>
            {getMessage(results.roi, ASSET_NAME[asset])}
          </div>

          {/* Share + CTA */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={handleShare} style={{
              flex: 1, minWidth: 160, padding: "12px 20px", borderRadius: 10,
              border: `1px solid ${color}50`, background: `${color}15`,
              color, fontFamily: "system-ui", fontSize: 14, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {copied ? "✓ Copied!" : "Share results 𝕏"}
            </button>
            <a href="https://web3guides.com/go/kraken" target="_blank" rel="noopener noreferrer" style={{
              flex: 1, minWidth: 160, padding: "12px 20px", borderRadius: 10,
              background: `linear-gradient(135deg, ${color}, ${color}aa)`,
              color: "#fff", fontFamily: "system-ui", fontSize: 14, fontWeight: 700,
              textDecoration: "none", textAlign: "center", transition: "opacity 0.15s",
            }}
              onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseOut={e => (e.currentTarget.style.opacity = "1")}
            >
              Start DCA on Kraken →
            </a>
          </div>

          {/* Disclaimer */}
          <p style={{ marginTop: 24, fontFamily: "system-ui", fontSize: 11, color: "#334155", lineHeight: 1.7 }}>
            Prices are approximate monthly closes for illustrative purposes only. Past performance does not guarantee future results. This is not financial advice. Crypto assets can lose value.
          </p>
        </div>
      )}
    </div>
  );
}
