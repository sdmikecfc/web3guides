export default function Loading() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
        gap: "32px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative background elements */}
      <svg width="140" height="140" viewBox="0 0 140 140" fill="none"
        style={{ position: "absolute", top: "8%", left: "4%", opacity: 0.05 }}
        aria-hidden="true">
        <circle cx="70" cy="70" r="68" stroke="#00F5D4" strokeWidth="1" strokeDasharray="4 8" />
        <circle cx="70" cy="70" r="40" stroke="#00F5D4" strokeWidth="0.5" strokeDasharray="2 6" />
      </svg>
      <svg width="90" height="90" viewBox="0 0 90 90" fill="none"
        style={{ position: "absolute", bottom: "12%", right: "6%", opacity: 0.04 }}
        aria-hidden="true">
        <polygon points="45,2 88,23 88,67 45,88 2,67 2,23" stroke="#F5A623" strokeWidth="1" fill="none" />
      </svg>

      {/* Pulsing W3G hex logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none"
          style={{ animation: "logo-breathe 2s ease-in-out infinite" }}
          aria-label="Web3Guides loading">
          <polygon points="26,2 50,14 50,38 26,50 2,38 2,14"
            stroke="#00F5D4" strokeWidth="1.4" fill="none" opacity="0.75" />
          <polygon points="26,10 42,19 42,33 26,42 10,33 10,19"
            fill="#00F5D4" opacity="0.07" />
          <text x="26" y="30" textAnchor="middle" fill="#00F5D4"
            fontSize="12" fontFamily="'Bebas Neue','Arial Black',sans-serif" letterSpacing="0.5">
            W3G
          </text>
        </svg>
        <span style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: "10px", color: "#4a6478",
          letterSpacing: "0.2em", textTransform: "uppercase" as const,
        }}>
          Loading
        </span>
      </div>

      {/* Animated progress lines */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "340px" }}>
        {[100, 72, 88, 58].map((w, i) => (
          <div key={i} className="skeleton" style={{
            height: "3px", width: `${w}%`, borderRadius: "2px",
            animationDelay: `${i * 0.18}s`,
          }} />
        ))}
      </div>

      {/* Card skeletons */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "14px", width: "100%", maxWidth: "860px", marginTop: "4px",
      }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{
            height: i % 3 === 0 ? "152px" : "112px",
            borderRadius: "12px",
            animationDelay: `${i * 0.1}s`,
          }} />
        ))}
      </div>
    </div>
  );
}
