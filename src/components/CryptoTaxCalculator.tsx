"use client";
import { useState, useCallback } from "react";

// ─── UK CGT constants ──────────────────────────────────────────────────────────

const TAX_YEARS = [
  { label: "2024/25", exempt: 3000,  basicRate: 0.18, higherRate: 0.24, basicBand: 37700, personalAllowance: 12570 },
  { label: "2023/24", exempt: 6000,  basicRate: 0.10, higherRate: 0.20, basicBand: 37700, personalAllowance: 12570 },
  { label: "2022/23", exempt: 12300, basicRate: 0.10, higherRate: 0.20, basicBand: 37700, personalAllowance: 12570 },
] as const;

const INCOME_BANDS = [
  { label: "Up to £12,570 (no income tax)",         value: 0      },
  { label: "£12,571 – £50,270 (basic rate)",         value: 30000  },
  { label: "£50,271 – £125,140 (higher rate)",       value: 80000  },
  { label: "Over £125,140 (additional rate)",        value: 130000 },
] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Trade {
  id: number;
  asset:     string;
  buyPrice:  string; // £ per coin at purchase
  sellPrice: string; // £ per coin at disposal
  quantity:  string;
}

interface GainRow {
  asset:     string;
  quantity:  number;
  costBasis: number;
  proceeds:  number;
  gain:      number;
}

interface TaxResult {
  rows:              GainRow[];
  totalGains:        number;
  totalLosses:       number;
  netGain:           number;
  exempt:            number;
  taxableGain:       number;
  basicRateTax:      number;
  higherRateTax:     number;
  totalTax:          number;
  effectiveRate:     number;
}

// ─── Calculation logic ─────────────────────────────────────────────────────────

function calculateTax(
  trades:     Trade[],
  yearIdx:    number,
  incomeVal:  number
): TaxResult {
  const year = TAX_YEARS[yearIdx];

  const rows: GainRow[] = trades
    .map((t) => {
      const buy  = parseFloat(t.buyPrice)  || 0;
      const sell = parseFloat(t.sellPrice) || 0;
      const qty  = parseFloat(t.quantity)  || 0;
      const costBasis = buy  * qty;
      const proceeds  = sell * qty;
      const gain      = proceeds - costBasis;
      return { asset: t.asset || "Unknown", quantity: qty, costBasis, proceeds, gain };
    })
    .filter((r) => r.quantity > 0);

  const totalGains  = rows.filter((r) => r.gain > 0).reduce((s, r) => s + r.gain, 0);
  const totalLosses = Math.abs(rows.filter((r) => r.gain < 0).reduce((s, r) => s + r.gain, 0));
  const netGain     = Math.max(0, totalGains - totalLosses);
  const exempt      = Math.min(netGain, year.exempt);
  const taxableGain = Math.max(0, netGain - exempt);

  // How much of the basic rate band is still available after income
  const taxablePay      = Math.max(0, incomeVal - year.personalAllowance);
  const basicRemaining  = Math.max(0, year.basicBand - taxablePay);

  const atBasic         = Math.min(taxableGain, basicRemaining);
  const atHigher        = Math.max(0, taxableGain - basicRemaining);

  const basicRateTax    = atBasic  * year.basicRate;
  const higherRateTax   = atHigher * year.higherRate;
  const totalTax        = basicRateTax + higherRateTax;
  const effectiveRate   = taxableGain > 0 ? (totalTax / taxableGain) * 100 : 0;

  return { rows, totalGains, totalLosses, netGain, exempt, taxableGain, basicRateTax, higherRateTax, totalTax, effectiveRate };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });
}

let nextId = 1;
function newTrade(): Trade {
  return { id: nextId++, asset: "", buyPrice: "", sellPrice: "", quantity: "" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CryptoTaxCalculator() {
  const [trades,     setTrades]     = useState<Trade[]>([newTrade()]);
  const [yearIdx,    setYearIdx]    = useState(0);
  const [incomeVal,  setIncomeVal]  = useState(30000);
  const [result,     setResult]     = useState<TaxResult | null>(null);
  const [calculated, setCalculated] = useState(false);

  const addTrade = () => setTrades((prev) => [...prev, newTrade()]);

  const removeTrade = (id: number) =>
    setTrades((prev) => (prev.length > 1 ? prev.filter((t) => t.id !== id) : prev));

  const updateTrade = useCallback((id: number, field: keyof Trade, value: string) => {
    setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
    setCalculated(false);
  }, []);

  const calculate = () => {
    setResult(calculateTax(trades, yearIdx, incomeVal));
    setCalculated(true);
  };

  const year = TAX_YEARS[yearIdx];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#e2e8f0", maxWidth: 860, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)", borderRadius: 16, padding: "32px 36px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>🇬🇧</span>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff" }}>
            UK Crypto Capital Gains Calculator
          </h2>
        </div>
        <p style={{ margin: 0, color: "#a5b4fc", fontSize: 14, lineHeight: 1.6 }}>
          Estimates your CGT liability using HMRC rules for {year.label}. £{year.exempt.toLocaleString()} annual exempt amount · {(year.basicRate * 100).toFixed(0)}% basic rate · {(year.higherRate * 100).toFixed(0)}% higher rate.
        </p>
      </div>

      {/* Settings row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Tax Year
          </label>
          <select
            value={yearIdx}
            onChange={(e) => { setYearIdx(Number(e.target.value)); setCalculated(false); }}
            style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14 }}
          >
            {TAX_YEARS.map((y, i) => (
              <option key={y.label} value={i}>{y.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Annual Income (salary + other income)
          </label>
          <select
            value={incomeVal}
            onChange={(e) => { setIncomeVal(Number(e.target.value)); setCalculated(false); }}
            style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14 }}
          >
            {INCOME_BANDS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Trades table */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 40px", gap: 0, background: "#1e293b", padding: "10px 16px" }}>
          {["Asset", "Buy Price (£)", "Sell Price (£)", "Quantity", ""].map((h) => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</span>
          ))}
        </div>

        {/* Trade rows */}
        {trades.map((t) => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 40px", gap: 0, padding: "10px 16px", borderTop: "1px solid #1e293b", alignItems: "center" }}>
            <input
              placeholder="e.g. Bitcoin"
              value={t.asset}
              onChange={(e) => updateTrade(t.id, "asset", e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="0.00"
              type="number"
              min="0"
              step="any"
              value={t.buyPrice}
              onChange={(e) => updateTrade(t.id, "buyPrice", e.target.value)}
              style={{ ...inputStyle, marginLeft: 8 }}
            />
            <input
              placeholder="0.00"
              type="number"
              min="0"
              step="any"
              value={t.sellPrice}
              onChange={(e) => updateTrade(t.id, "sellPrice", e.target.value)}
              style={{ ...inputStyle, marginLeft: 8 }}
            />
            <input
              placeholder="0"
              type="number"
              min="0"
              step="any"
              value={t.quantity}
              onChange={(e) => updateTrade(t.id, "quantity", e.target.value)}
              style={{ ...inputStyle, marginLeft: 8 }}
            />
            <button
              onClick={() => removeTrade(t.id)}
              style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18, paddingLeft: 8 }}
            >×</button>
          </div>
        ))}
      </div>

      {/* Add row + Calculate */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
        <button
          onClick={addTrade}
          style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "11px 0", color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600 }}
        >
          + Add Disposal
        </button>
        <button
          onClick={calculate}
          style={{ flex: 2, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 8, padding: "11px 0", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
        >
          Calculate Tax
        </button>
      </div>

      {/* Results */}
      {calculated && result && (
        <>
          {/* Gain breakdown */}
          {result.rows.length > 0 && (
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ background: "#1e293b", padding: "10px 16px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Disposal Breakdown</span>
              </div>
              {result.rows.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", padding: "10px 16px", borderTop: "1px solid #1e293b", fontSize: 14 }}>
                  <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.asset}</span>
                  <span style={{ color: "#94a3b8" }}>{fmt(r.costBasis)} cost</span>
                  <span style={{ color: "#94a3b8" }}>{fmt(r.proceeds)} proceeds</span>
                  <span style={{ color: r.gain >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                    {r.gain >= 0 ? "+" : ""}{fmt(r.gain)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            <StatCard label="Total Gains"       value={fmt(result.totalGains)}   color="#4ade80" />
            <StatCard label="Total Losses"      value={fmt(result.totalLosses)}  color="#f87171" />
            <StatCard label="Net Gain"          value={fmt(result.netGain)}      color="#e2e8f0" />
            <StatCard label="Annual Allowance"  value={fmt(result.exempt)}       color="#a5b4fc" note={`${year.label} allowance`} />
            <StatCard label="Taxable Gain"      value={fmt(result.taxableGain)}  color="#fbbf24" />
            <StatCard label="Effective Rate"    value={`${result.effectiveRate.toFixed(1)}%`} color="#e2e8f0" />
          </div>

          {/* Tax due panel */}
          <div style={{
            background: result.totalTax > 0 ? "linear-gradient(135deg, #1c1917, #292524)" : "linear-gradient(135deg, #052e16, #14532d)",
            border: `1px solid ${result.totalTax > 0 ? "#44403c" : "#166534"}`,
            borderRadius: 12,
            padding: "24px 28px",
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Estimated CGT Due
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: result.totalTax > 0 ? "#fbbf24" : "#4ade80" }}>
                {fmt(result.totalTax)}
              </div>
              {result.totalTax > 0 && (
                <div style={{ fontSize: 13, color: "#78716c", marginTop: 4 }}>
                  {fmt(result.basicRateTax)} at {(year.basicRate * 100).toFixed(0)}% basic
                  {result.higherRateTax > 0 && ` + ${fmt(result.higherRateTax)} at ${(year.higherRate * 100).toFixed(0)}% higher`}
                </div>
              )}
              {result.totalTax === 0 && (
                <div style={{ fontSize: 13, color: "#86efac", marginTop: 4 }}>
                  Your gain is within the £{year.exempt.toLocaleString()} annual exempt amount
                </div>
              )}
            </div>
            <div style={{ fontSize: 48 }}>{result.totalTax > 0 ? "⚠️" : "✅"}</div>
          </div>

          {/* Disclaimer */}
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 24, padding: "0 4px" }}>
            This estimate uses simplified CGT rules (average cost basis). HMRC requires Section 104 pooling and the 30-day bed &amp; breakfasting rule, which can change your liability. Figures are illustrative only — not financial or tax advice.
          </p>
        </>
      )}

      {/* Koinly CTA */}
      <div style={{
        background: "linear-gradient(135deg, #0c4a6e, #075985)",
        border: "1px solid #0369a1",
        borderRadius: 14,
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 13, color: "#7dd3fc", fontWeight: 700, marginBottom: 6 }}>
            Need an official HMRC report?
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
            Get your full tax report with Koinly
          </div>
          <div style={{ fontSize: 13, color: "#93c5fd", lineHeight: 1.6 }}>
            Connects to 700+ exchanges &amp; wallets. Generates HMRC-compliant reports including Section 104 pooling, same-day rules, and the 30-day rule. Used by 100,000+ UK crypto investors.
          </div>
        </div>
        <a
          href="/go/koinly"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flexShrink: 0,
            background: "#0ea5e9",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            padding: "14px 28px",
            borderRadius: 10,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Try Koinly Free →
        </a>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color, note }: { label: string; value: string; color: string; note?: string }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{note}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "8px 10px",
  color: "#e2e8f0",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
