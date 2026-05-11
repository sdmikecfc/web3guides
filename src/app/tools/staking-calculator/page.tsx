import type { Metadata } from "next";
import StakingCalculator from "@/components/StakingCalculator";
import ToolShell from "@/components/ToolShell";

export const metadata: Metadata = {
  title: "Crypto Staking Rewards Calculator — ETH, SOL, ADA, DOT & More",
  description:
    "Calculate how much you could earn staking ETH, SOL, ADA, DOT, MATIC and more. Compare APY rates, compound vs simple interest, and see projected returns in crypto and GBP.",
};

export default function StakingCalculatorPage() {
  return (
    <ToolShell toolLabel="Staking Calculator" accentColor="#0ea5e9">
    <div style={{ padding: "60px 24px 80px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-block", background: "rgba(14,165,233,0.15)", border: "1px solid rgba(14,165,233,0.3)",
            borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700, color: "#7dd3fc",
            letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 16,
          }}>
            Free Tool
          </div>
          <h1 style={{ margin: "0 0 16px", fontSize: "clamp(26px, 5vw, 40px)", fontWeight: 900, color: "#fff", lineHeight: 1.15 }}>
            Crypto Staking{" "}
            <span style={{ background: "linear-gradient(135deg,#0ea5e9,#6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Rewards Calculator
            </span>
          </h1>
          <p style={{ margin: "0 auto", maxWidth: 540, fontSize: 15, color: "#64748b", lineHeight: 1.7 }}>
            See estimated staking returns for <strong style={{ color: "#94a3b8" }}>ETH, SOL, ADA, DOT, MATIC, ATOM, AVAX and BNB</strong>. Compare timeframes, toggle compounding, and get a GBP value if you add a price.
          </p>
        </div>
        <StakingCalculator />
        <div style={{ marginTop: 64, borderTop: "1px solid #1e293b", paddingTop: 48, color: "#64748b", fontSize: 14, lineHeight: 1.8 }}>
          <h2 style={{ color: "#94a3b8", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>How Staking Returns Work</h2>
          <p>When you stake crypto, you lock tokens in a validator or staking pool to help secure the network. In return, you receive a portion of block rewards, typically paid in the same asset you staked. The APY (Annual Percentage Yield) varies based on network conditions, total staked supply, and validator performance.</p>
          <p>This calculator shows two modes: <strong style={{ color: "#94a3b8" }}>compound</strong> (rewards are reinvested each period, growing your stake) and <strong style={{ color: "#94a3b8" }}>simple</strong> (rewards are paid out without reinvestment). Compounding produces significantly higher returns over longer timeframes.</p>
          <p style={{ fontSize: 12, color: "#334155", marginTop: 24 }}>APY figures are estimates only. Staking returns are not guaranteed and assets can lose value. This is not financial advice.</p>
        </div>
      </div>
    </div>
    </ToolShell>
  );
}
