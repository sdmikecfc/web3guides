"use client";

/* ════════════════════════════════════════════════════════════════════════
   DomaHeroIllustration — animated SVG showing the fractionalization concept

   A premium domain at the top, splitting into 8 fractional token shares
   at the bottom, connected by animated flow lines. Tells the Doma story
   in a single glance. Pure SVG + CSS animation — no JS, no images.
════════════════════════════════════════════════════════════════════════ */

const PURPLE  = "#7c6aff";
const INDIGO  = "#6366f1";
const PINK    = "#ec4899";
const ORANGE  = "#ff6b35";
const CYAN    = "#22d3ee";
const TEAL    = "#10b981";

export default function DomaHeroIllustration() {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 460, margin: "0 auto" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <svg
        viewBox="0 0 460 460"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        aria-label="Animated illustration showing a domain being fractionalized into tokens"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="domGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={ORANGE} />
            <stop offset="100%" stopColor={PINK} />
          </linearGradient>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={INDIGO} stopOpacity="0" />
            <stop offset="50%"  stopColor={INDIGO} stopOpacity="0.7" />
            <stop offset="100%" stopColor={INDIGO} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="tokenA" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={PURPLE} />
            <stop offset="100%" stopColor={INDIGO} />
          </linearGradient>
          <linearGradient id="tokenB" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={CYAN} />
            <stop offset="100%" stopColor={INDIGO} />
          </linearGradient>
          <linearGradient id="tokenC" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={PINK} />
            <stop offset="100%" stopColor={PURPLE} />
          </linearGradient>
          <linearGradient id="tokenD" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={TEAL} />
            <stop offset="100%" stopColor={CYAN} />
          </linearGradient>

          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={PURPLE} stopOpacity="0.45" />
            <stop offset="60%"  stopColor={PURPLE} stopOpacity="0.10" />
            <stop offset="100%" stopColor={PURPLE} stopOpacity="0" />
          </radialGradient>

          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Reusable token symbol — tiny diamond chip */}
          <symbol id="tokenChip" viewBox="-30 -30 60 60">
            <path
              d="M 0,-22 L 22,0 L 0,22 L -22,0 Z"
              fill="none" strokeWidth="1.5"
            />
            <circle cx="0" cy="0" r="3" />
          </symbol>
        </defs>

        {/* Atmospheric glow halo */}
        <circle cx="230" cy="230" r="220" fill="url(#glow)" />

        {/* Background grid */}
        <g opacity="0.15">
          {Array.from({ length: 11 }).map((_, i) => (
            <line key={`vg-${i}`} x1={i * 46} y1="0" x2={i * 46} y2="460" stroke={INDIGO} strokeWidth="0.5" />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <line key={`hg-${i}`} x1="0" y1={i * 46} x2="460" y2={i * 46} stroke={INDIGO} strokeWidth="0.5" />
          ))}
        </g>

        {/* Outer rotating rings */}
        <g style={{ transformOrigin: "230px 230px", transformBox: "fill-box" as const }} className="dom-ring-spin-slow">
          <circle cx="230" cy="230" r="195" fill="none" stroke={INDIGO} strokeOpacity="0.18" strokeWidth="1" strokeDasharray="2,8" />
        </g>
        <g style={{ transformOrigin: "230px 230px", transformBox: "fill-box" as const }} className="dom-ring-spin-rev">
          <circle cx="230" cy="230" r="170" fill="none" stroke={PURPLE} strokeOpacity="0.20" strokeWidth="1" strokeDasharray="4,6" />
        </g>
        <g style={{ transformOrigin: "230px 230px", transformBox: "fill-box" as const }} className="dom-ring-spin">
          <circle cx="230" cy="230" r="140" fill="none" stroke="url(#ringGrad)" strokeWidth="1.5" />
        </g>

        {/* ── Domain card (top) ─────────────────────────────────── */}
        <g className="dom-domain-float">
          {/* Card bg */}
          <rect x="120" y="92" width="220" height="64" rx="14"
                fill="rgba(15,23,42,0.85)"
                stroke="url(#domGrad)" strokeWidth="1.5" />
          {/* Traffic dots */}
          <circle cx="138" cy="112" r="3" fill={ORANGE} opacity="0.9" />
          <circle cx="150" cy="112" r="3" fill={PINK} opacity="0.7" />
          <circle cx="162" cy="112" r="3" fill={PURPLE} opacity="0.7" />
          {/* URL bar */}
          <rect x="135" y="120" width="190" height="22" rx="6"
                fill="rgba(99,102,241,0.10)"
                stroke="rgba(99,102,241,0.25)" strokeWidth="0.5" />
          {/* Lock + url text */}
          <text x="146" y="135" fill={TEAL} fontSize="9" fontFamily="monospace">●</text>
          <text x="158" y="136" fill="#cbd5e1" fontSize="11" fontFamily="monospace" fontWeight="700">
            web3guides.com
          </text>
          {/* Verified badge */}
          <g transform="translate(295,125)">
            <rect x="0" y="0" width="22" height="14" rx="3" fill="rgba(16,185,129,0.15)" stroke={TEAL} strokeWidth="0.5" />
            <text x="11" y="10" fill={TEAL} fontSize="7" fontFamily="monospace" fontWeight="700" textAnchor="middle">DOT</text>
          </g>
        </g>

        {/* ── Flow lines from domain to tokens ─────────────────── */}
        {[
          { x: 80,  delay: "0s"   },
          { x: 144, delay: "0.3s" },
          { x: 208, delay: "0.6s" },
          { x: 272, delay: "0.9s" },
          { x: 336, delay: "1.2s" },
          { x: 380, delay: "1.5s" },
        ].map((p, i) => (
          <g key={i}>
            <path
              d={`M 230 156 Q ${230 + (p.x - 230) * 0.5} 230 ${p.x} 320`}
              fill="none"
              stroke={INDIGO}
              strokeWidth="1"
              strokeOpacity="0.25"
              strokeDasharray="3,5"
            />
            {/* Travelling pulse along the line */}
            <circle r="3" fill={INDIGO} className="dom-pulse-travel" style={{ animationDelay: p.delay, offsetPath: `path("M 230 156 Q ${230 + (p.x - 230) * 0.5} 230 ${p.x} 320")` } as React.CSSProperties}>
              <animateMotion
                dur="2.4s"
                repeatCount="indefinite"
                begin={p.delay}
                path={`M 230 156 Q ${230 + (p.x - 230) * 0.5} 230 ${p.x} 320`}
              />
            </circle>
          </g>
        ))}

        {/* ── Fractional tokens (bottom row) ───────────────────── */}
        {[
          { x:  80, grad: "tokenA", delay: 0.0, label: "$WGD" },
          { x: 144, grad: "tokenB", delay: 0.1, label: "$WGD" },
          { x: 208, grad: "tokenC", delay: 0.2, label: "$WGD" },
          { x: 272, grad: "tokenD", delay: 0.3, label: "$WGD" },
          { x: 336, grad: "tokenA", delay: 0.4, label: "$WGD" },
          { x: 380, grad: "tokenB", delay: 0.5, label: "$WGD" },
        ].map((t, i) => (
          <g key={i} className="dom-token-rise" style={{ animationDelay: `${t.delay}s` }}>
            {/* Hex/diamond shape */}
            <path
              d={`M ${t.x},310 L ${t.x + 22},325 L ${t.x + 22},355 L ${t.x},370 L ${t.x - 22},355 L ${t.x - 22},325 Z`}
              fill={`url(#${t.grad})`}
              opacity="0.92"
              filter="url(#softGlow)"
            />
            {/* Inner glyph */}
            <circle cx={t.x} cy="340" r="6" fill="rgba(255,255,255,0.95)" />
            <circle cx={t.x} cy="340" r="3" fill="#0a0a0f" />
            {/* Label below */}
            <text x={t.x} y="392" fill="rgba(255,255,255,0.55)" fontSize="9" fontFamily="monospace" fontWeight="700" textAnchor="middle" letterSpacing="1.2">
              {t.label}
            </text>
            <text x={t.x} y="404" fill="rgba(255,255,255,0.35)" fontSize="7" fontFamily="monospace" textAnchor="middle">
              {Math.round((1/8) * 100) / 10}%
            </text>
          </g>
        ))}

        {/* Section labels */}
        <text x="230" y="78" fill="rgba(255,255,255,0.45)" fontSize="9" fontFamily="monospace" fontWeight="700" textAnchor="middle" letterSpacing="2">
          1 PREMIUM DOMAIN
        </text>
        <text x="230" y="430" fill="rgba(255,255,255,0.45)" fontSize="9" fontFamily="monospace" fontWeight="700" textAnchor="middle" letterSpacing="2">
          10,000 FRACTIONAL TOKENS
        </text>

        {/* Floating particle dots */}
        <g opacity="0.6">
          <circle cx="60"  cy="200" r="1.5" fill={CYAN}  className="dom-spark dom-spark-1" />
          <circle cx="400" cy="180" r="1.5" fill={PINK}  className="dom-spark dom-spark-2" />
          <circle cx="50"  cy="270" r="1.5" fill={PURPLE} className="dom-spark dom-spark-3" />
          <circle cx="410" cy="250" r="1.5" fill={TEAL}  className="dom-spark dom-spark-1" style={{ animationDelay: "1.5s" }} />
          <circle cx="100" cy="420" r="1.5" fill={CYAN}  className="dom-spark dom-spark-2" style={{ animationDelay: "2s" }} />
        </g>
      </svg>
    </div>
  );
}

const CSS = `
  @keyframes domSpin       { to { transform: rotate(360deg); } }
  @keyframes domSpinRev    { to { transform: rotate(-360deg); } }
  @keyframes domFloat      {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-6px); }
  }
  @keyframes domTokenRise  {
    0%   { transform: translateY(20px); opacity: 0; }
    100% { transform: translateY(0);    opacity: 1; }
  }
  @keyframes domSpark      {
    0%, 100% { opacity: 0.2; transform: translate(0,0) scale(1); }
    50%      { opacity: 0.9; transform: translate(8px, -10px) scale(1.5); }
  }
  .dom-ring-spin       { animation: domSpin    24s linear infinite; }
  .dom-ring-spin-slow  { animation: domSpin    60s linear infinite; }
  .dom-ring-spin-rev   { animation: domSpinRev 36s linear infinite; }
  .dom-domain-float    { animation: domFloat    5s ease-in-out infinite; transform-origin: center; }
  .dom-token-rise      { animation: domTokenRise 700ms cubic-bezier(0.22,1,0.36,1) both; }
  .dom-spark           { animation: domSpark    4s ease-in-out infinite; }
  .dom-spark-1         { animation-duration: 4s; }
  .dom-spark-2         { animation-duration: 5s; animation-delay: 0.7s; }
  .dom-spark-3         { animation-duration: 6s; animation-delay: 1.2s; }
`;
