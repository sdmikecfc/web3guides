import type { Metadata } from "next";
import CryptoTaxCalculator from "@/components/CryptoTaxCalculator";

export const metadata: Metadata = {
  title: "UK Crypto Tax Calculator 2024/25 — Free CGT Estimator",
  description:
    "Estimate your UK crypto capital gains tax for 2024/25. Calculates basic and higher rate CGT using HMRC rules. Free, instant, no signup.",
  openGraph: {
    title: "UK Crypto Tax Calculator 2024/25",
    description: "Free CGT estimator for UK crypto investors. Covers 2022/23, 2023/24 and 2024/25 tax years.",
    type: "website",
  },
};

export default function TaxCalculatorPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0d0d1f",
        padding: "60px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Page header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              display: "inline-block",
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 12,
              fontWeight: 700,
              color: "#a5b4fc",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Free Tool
          </div>
          <h1
            style={{
              margin: "0 0 16px",
              fontSize: "clamp(28px, 5vw, 42px)",
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.15,
            }}
          >
            UK Crypto Capital Gains
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #6366f1, #a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Tax Calculator
            </span>
          </h1>
          <p
            style={{
              margin: "0 auto",
              maxWidth: 560,
              fontSize: 16,
              color: "#64748b",
              lineHeight: 1.7,
            }}
          >
            Enter your crypto disposals and instantly estimate your CGT liability
            under HMRC rules. Covers{" "}
            <strong style={{ color: "#94a3b8" }}>2022/23, 2023/24 and 2024/25</strong>{" "}
            tax years.
          </p>
        </div>

        <CryptoTaxCalculator />

        {/* SEO content below calculator */}
        <div
          style={{
            marginTop: 64,
            borderTop: "1px solid #1e293b",
            paddingTop: 48,
            color: "#64748b",
            fontSize: 14,
            lineHeight: 1.8,
          }}
        >
          <h2 style={{ color: "#94a3b8", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            How UK Crypto Tax Works
          </h2>
          <p>
            HMRC treats cryptocurrency as a capital asset. When you sell, swap, or
            spend crypto, you trigger a disposal. The gain (or loss) is the
            difference between what you received and your original cost basis.
          </p>
          <p>
            For 2024/25, you can make up to{" "}
            <strong style={{ color: "#94a3b8" }}>£3,000</strong> in gains tax-free.
            Above that, basic rate taxpayers pay{" "}
            <strong style={{ color: "#94a3b8" }}>18%</strong> and higher rate
            taxpayers pay <strong style={{ color: "#94a3b8" }}>24%</strong>.
          </p>
          <h2 style={{ color: "#94a3b8", fontSize: 18, fontWeight: 700, margin: "24px 0 12px" }}>
            What This Calculator Does Not Cover
          </h2>
          <p>
            This tool uses a simplified average cost method. HMRC actually requires{" "}
            <strong style={{ color: "#94a3b8" }}>Section 104 pooling</strong>, the{" "}
            <strong style={{ color: "#94a3b8" }}>same-day rule</strong>, and the{" "}
            <strong style={{ color: "#94a3b8" }}>30-day bed &amp; breakfasting rule</strong>.
            For a fully compliant report you can submit to HMRC, use{" "}
            <a
              href="/go/koinly"
              style={{ color: "#6366f1", textDecoration: "underline" }}
            >
              Koinly
            </a>{" "}
            — it imports from every major exchange and generates the exact figures
            your accountant or self-assessment needs.
          </p>
          <p style={{ fontSize: 12, color: "#334155", marginTop: 24 }}>
            This calculator is for educational purposes only and does not constitute
            financial or tax advice. Always consult a qualified tax adviser for your
            specific situation.
          </p>
        </div>
      </div>
    </main>
  );
}
