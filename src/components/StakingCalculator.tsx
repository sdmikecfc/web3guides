"use client";
import { useState, useMemo } from "react";

const ASSETS = [
  { symbol: "ETH",  name: "Ethereum",    apy: 3.8,  icon: "⟠", color: "#627eea" },
  { symbol: "SOL",  name: "Solana",      apy: 6.5,  icon: "◎", color: "#9945ff" },
  { symbol: "ADA",  name: "Cardano",     apy: 3.2,  icon: "₳", color: "#0033ad" },
  { symbol: "DOT",  name: "Polkadot",    apy: 14.0, icon: "●", color: "#e6007a" },
  { symbol: "MATIC",name: "Polygon",     apy: 4.5,  icon: "⬡", color: "#8247e5" },
  { symbol: "ATOM", name: "Cosmos",      apy: 16.0, icon: "⚛", color: "#2e3148" },
  { symbol: "AVAX", name: "Avalanche",   apy: 8.2,  icon: "▲", color: "#e84142" },
  { symbol: "BNB",  name: "BNB",         apy: 3.0,  icon: "◈", color: "#f0b90b" },
] as const;

const PERIODS = [
  { label: "1 Month",   months: 1   },
  { label: "3 Months",  months: 3   },
  { label: "6 Months",  months: 6   },
  { label: "1 Year",    months: 12  },
  { label: "2 Years",   months: 24  },
  { label: "5 Years",   months: 60  },
] as const;

function fmt(n: number, digits = 4) {
  if (n >= 1000) return n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-GB", { maximumFractionDigits: digits });
}

function fmtGbp(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });
}

export default function StakingCalculator() {
  const [assetIdx,    setAssetIdx]    = useState(0);
  const [amount,      setAmount]      = useState("1");
  const [periodIdx,   setPeriodIdx]   = useState(3); // default 1 year
  const [priceGbp,    setPriceGbp]    = useState("");
  const [customApy,   setCustomApy]   = useState("");
  const [compound,    setCompound]    = useState(true);

  const asset   = ASSETS[assetIdx];
  const months  = PERIODS[periodIdx].months;
  const apy     = parseFloat(customApy) > 0 ? parseFloat(customApy) : asset.apy;
  const qty     = parseFloat(amount) || 0;
  const price   = parseFloat(priceGbp) || 0;

  const result = useMemo(() => {
    if (qty <= 0) return null;
    const years  = months / 12;
    const rate   = apy / 100;

    const finalQty   = compound
      ? qty * Math.pow(1 + rate, years)
      : qty * (1 + rate * years);
    const rewardQty  = finalQty - qty;
    const rewardGbp  = price > 0 ? rewardQty * price : null;
    const finalGbp   = price > 0 ? finalQty  * price : null;
    const initialGbp = price > 0 ? qty        * price : null;

    // Year-by-year breakdown
    const yearly: { year: string; qty: number; gbp: number | null }[] = [];
    const steps = months <= 12 ? months : 12;
    for (let m = 1; m <= steps; m++) {
      const yrs   = m / 12;
      const q     = compound ? qty * Math.pow(1 + rate, yrs) : qty * (1 + rate * yrs);
      yearly.push({ year: months <= 12 ? `Month ${m}` : `Year ${m}`, qty: q, gbp: price > 0 ? q * price : null });
    }

    return { finalQty, rewardQty, rewardGbp, finalGbp, initialGbp, yearly };
  }, [qty, apy, months, price, compound]);

  return (
    <div style={{ fontFamily: "system-ui,sans-serif", color: "#e2e8f0", maxWidth: 820, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0c1a3a 0%, #1e3a5f 100%)", borderRadius: 16, padding: "28px 32px", marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#fff" }}>
          Crypto Staking Rewards Calculator
        </h2>
        <p style={{ margin: 0, color: "#7dd3fc", fontSize: 13 }}>
          Estimated returns based on current APY rates. Rates fluctuate — treat as indicative only.
        </p>
      </div>

      {/* Asset picker */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 20 }}>
        {ASSETS.map((a, i) => (
          <button
            key={a.symbol}
            onClick={() => { setAssetIdx(i); setCustomApy(""); }}
            style={{
              background: i === assetIdx ? `${a.color}22` : "#0f172a",
              border: `1px solid ${i === assetIdx ? a.color : "#1e293b"}`,
              borderRadius: 10,
              padding: "10px 8px",
              cursor: "pointer",
              color: i === assetIdx ? "#fff" : "#64748b",
              textAlign: "center" as const,
            }}
          >
            <div style={{ fontSize: 18, marginBottom: 2 }}>{a.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{a.symbol}</div>
            <div style={{ fontSize: 11, color: i === assetIdx ? a.color : "#475569" }}>{a.apy}% APY</div>
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Amount ({asset.symbol})</label>
          <input
            type="text" inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
            placeholder="1.0"
          />
        </div>
        <div>
          <label style={labelStyle}>Price per {asset.symbol} (£ optional)</label>
          <input
            type="text" inputMode="decimal"
            value={priceGbp}
            onChange={(e) => setPriceGbp(e.target.value)}
            style={inputStyle}
            placeholder="e.g. 2200"
          />
        </div>
        <div>
          <label style={labelStyle}>Custom APY % (optional)</label>
          <input
            type="text" inputMode="decimal"
            value={customApy}
            onChange={(e) => setCustomApy(e.target.value)}
            style={inputStyle}
            placeholder={`${asset.apy} (current est.)`}
          />
        </div>
      </div>

      {/* Period + compound */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 8 }}>
        {PERIODS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => setPeriodIdx(i)}
            style={{
              background: i === periodIdx ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#1e293b",
              border: "none", borderRadius: 20, padding: "7px 16px",
              color: i === periodIdx ? "#fff" : "#64748b",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <button
          onClick={() => setCompound((v) => !v)}
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: compound ? "#6366f1" : "#334155",
            border: "none", cursor: "pointer", position: "relative" as const,
            transition: "background 0.2s",
          }}
        >
          <span style={{
            position: "absolute" as const, top: 3, left: compound ? 18 : 3,
            width: 14, height: 14, borderRadius: "50%",
            background: "#fff", transition: "left 0.2s",
          }} />
        </button>
        <span style={{ fontSize: 13, color: "#64748b" }}>
          {compound ? "Compound (reinvest rewards)" : "Simple interest"}
        </span>
      </div>

      {/* Results */}
      {result && qty > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
            <div style={{ background: "#0f172a", border: `1px solid ${asset.color}33`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={statLabelStyle}>Rewards Earned</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#4ade80" }}>+{fmt(result.rewardQty)} {asset.symbol}</div>
              {result.rewardGbp !== null && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{fmtGbp(result.rewardGbp)}</div>}
            </div>
            <div style={{ background: "#0f172a", border: `1px solid ${asset.color}33`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={statLabelStyle}>Final Balance</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{fmt(result.finalQty)} {asset.symbol}</div>
              {result.finalGbp !== null && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{fmtGbp(result.finalGbp)}</div>}
            </div>
            <div style={{ background: "#0f172a", border: `1px solid ${asset.color}33`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={statLabelStyle}>Effective APY</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: asset.color }}>{apy.toFixed(1)}%</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{compound ? "compounding" : "simple"}</div>
            </div>
          </div>

          {/* Growth bar chart */}
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "20px 22px", marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 14 }}>
              Growth Over {PERIODS[periodIdx].label}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
              {result.yearly.map((row, i) => {
                const pct = (row.qty - qty) / Math.max(result.rewardQty, 0.001);
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4 }}>
                    <div
                      style={{
                        width: "100%",
                        background: `linear-gradient(to top, ${asset.color}cc, ${asset.color}44)`,
                        borderRadius: "3px 3px 0 0",
                        height: `${Math.max(4, pct * 72)}px`,
                      }}
                      title={`${row.year}: ${fmt(row.qty)} ${asset.symbol}`}
                    />
                    <span style={{ fontSize: 9, color: "#334155", writingMode: "vertical-rl" as const, transform: "rotate(180deg)" }}>
                      {row.year.replace("Month ", "M").replace("Year ", "Y")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* CTA */}
      <div style={{ background: "linear-gradient(135deg,#0c4a6e,#075985)", border: "1px solid #0369a1", borderRadius: 14, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Ready to start staking?</div>
          <div style={{ fontSize: 13, color: "#93c5fd" }}>MEXC and KuCoin offer flexible staking for most of these assets with no lockup period.</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <a href="/go/mexc" target="_blank" rel="noopener noreferrer" style={{ background: "#0ea5e9", color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 8, textDecoration: "none" }}>MEXC →</a>
          <a href="/go/kucoin" target="_blank" rel="noopener noreferrer" style={{ background: "#1e3a5f", color: "#7dd3fc", fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 8, textDecoration: "none", border: "1px solid #0369a1" }}>KuCoin →</a>
        </div>
      </div>

      <p style={{ fontSize: 11, color: "#334155", marginTop: 16, lineHeight: 1.7 }}>
        APY rates are estimates based on current network conditions and validator performance. Actual returns vary. Staking involves locking assets which may lose value. Not financial advice.
      </p>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "#64748b", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", background: "#1e293b", border: "1px solid #334155",
  borderRadius: 8, padding: "10px 12px", color: "#e2e8f0", fontSize: 14,
  outline: "none", boxSizing: "border-box",
};
const statLabelStyle: React.CSSProperties = {
  fontSize: 11, color: "#475569", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
};
