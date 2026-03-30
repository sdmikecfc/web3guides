"use client";

interface Props {
  children: React.ReactNode;
  toolLabel: string;
  accentColor?: string;
}

const ROOT =
  typeof window !== "undefined"
    ? window.location.hostname.includes("localhost")
      ? "http://localhost:3000"
      : "https://web3guides.com"
    : "https://web3guides.com";

export default function ToolShell({ children, toolLabel, accentColor = "#6366f1" }: Props) {
  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1f", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(13,13,31,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1e293b",
      }}>
        <div style={{
          maxWidth: 940,
          margin: "0 auto",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          gap: 0,
        }}>
          {/* Logo / home link */}
          <a
            href="https://web3guides.com"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <span style={{
              fontFamily: "'Bungee', cursive, system-ui",
              fontSize: "1.05rem",
              background: "linear-gradient(135deg, #ff6b35, #ec4899)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Web3Guides
            </span>
          </a>

          {/* Breadcrumb separator + tool name */}
          <span style={{ color: "#334155", margin: "0 10px", fontSize: "0.85rem" }}>/</span>
          <span style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: accentColor,
          }}>
            {toolLabel}
          </span>

          <div style={{ flex: 1 }} />

          {/* Nav links */}
          <nav style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <a href="/tools" style={{ fontFamily: "system-ui", fontSize: "0.82rem", color: "#64748b", textDecoration: "none", transition: "color 0.2s" }}
               onMouseOver={e => (e.currentTarget.style.color = "#e2e8f0")}
               onMouseOut={e => (e.currentTarget.style.color = "#64748b")}>
              All Tools
            </a>
            <a href="/tools/tax-calculator" style={{ fontFamily: "system-ui", fontSize: "0.82rem", color: "#64748b", textDecoration: "none", transition: "color 0.2s" }}
               onMouseOver={e => (e.currentTarget.style.color = "#e2e8f0")}
               onMouseOut={e => (e.currentTarget.style.color = "#64748b")}>
              CGT Calculator
            </a>
            <a href="/tools/staking-calculator" style={{ fontFamily: "system-ui", fontSize: "0.82rem", color: "#64748b", textDecoration: "none", transition: "color 0.2s" }}
               onMouseOver={e => (e.currentTarget.style.color = "#e2e8f0")}
               onMouseOut={e => (e.currentTarget.style.color = "#64748b")}>
              Staking Calculator
            </a>
            <a href="/tools/dca" style={{ fontFamily: "system-ui", fontSize: "0.82rem", color: "#64748b", textDecoration: "none", transition: "color 0.2s" }}
               onMouseOver={e => (e.currentTarget.style.color = "#e2e8f0")}
               onMouseOut={e => (e.currentTarget.style.color = "#64748b")}>
              DCA Time Machine
            </a>
            <a href="/tools/airdrop-checker" style={{ fontFamily: "system-ui", fontSize: "0.82rem", color: "#64748b", textDecoration: "none", transition: "color 0.2s" }}
               onMouseOver={e => (e.currentTarget.style.color = "#e2e8f0")}
               onMouseOut={e => (e.currentTarget.style.color = "#64748b")}>
              Airdrop Checker
            </a>
            <a
              href="https://web3guides.com"
              style={{
                fontFamily: "system-ui",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#fff",
                background: accentColor,
                padding: "7px 16px",
                borderRadius: 20,
                textDecoration: "none",
                transition: "opacity 0.2s",
              }}
              onMouseOver={e => ((e.currentTarget as HTMLElement).style.opacity = "0.85")}
              onMouseOut={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
            >
              All Guides →
            </a>
          </nav>
        </div>
      </header>

      {/* ── Page content ── */}
      <main style={{ flex: 1 }}>
        {children}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: "1px solid #1e293b",
        background: "#080810",
        padding: "32px 24px",
      }}>
        <div style={{
          maxWidth: 940,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontFamily: "'Bungee', cursive, system-ui",
              fontSize: "0.95rem",
              background: "linear-gradient(135deg, #ff6b35, #ec4899)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Web3Guides
            </span>
            <span style={{ color: "#334155", fontSize: "0.8rem" }}>— Free crypto education</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {[
              { label: "Home", href: "https://web3guides.com" },
              { label: "CGT Calculator", href: "/tools/tax-calculator" },
              { label: "Staking Calculator", href: "/tools/staking-calculator" },
              { label: "DCA Time Machine", href: "/tools/dca" },
              { label: "Airdrop Checker", href: "/tools/airdrop-checker" },
              { label: "Crypto Tax Guides", href: "https://tax.web3guides.com" },
              { label: "Staking Guides", href: "https://staking.web3guides.com" },
              { label: "Disclaimer", href: "/disclaimer" },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{ fontFamily: "system-ui", fontSize: "0.78rem", color: "#475569", textDecoration: "none", transition: "color 0.2s" }}
                onMouseOver={e => (e.currentTarget.style.color = "#94a3b8")}
                onMouseOut={e => (e.currentTarget.style.color = "#475569")}
              >
                {l.label}
              </a>
            ))}
          </div>

          <p style={{ margin: 0, fontFamily: "system-ui", fontSize: "0.72rem", color: "#1e293b", width: "100%" }}>
            For educational purposes only. Not financial or tax advice. Always consult a qualified professional.
          </p>
        </div>
      </footer>
    </div>
  );
}
