"use client";

/** Auto-generated SVG infographics based on article tags/difficulty/subdomain */

interface Props {
  subdomain: string;
  tags?: string[];
  difficulty?: string;
  accentHex: string;
  title: string;
}

export function ArticleInfographic({ subdomain, tags = [], difficulty = "beginner", accentHex, title }: Props) {
  const type = detectType(subdomain, tags);
  const palette = buildPalette(accentHex);

  switch (type) {
    case "flow":        return <FlowDiagram accentHex={accentHex} palette={palette} subdomain={subdomain} />;
    case "comparison":  return <ComparisonChart accentHex={accentHex} palette={palette} />;
    case "pyramid":     return <DifficultyPyramid accentHex={accentHex} palette={palette} difficulty={difficulty} />;
    case "network":     return <NetworkDiagram accentHex={accentHex} palette={palette} />;
    case "stats":       return <StatsCard accentHex={accentHex} palette={palette} subdomain={subdomain} />;
    default:            return <KeyConcepts accentHex={accentHex} palette={palette} tags={tags} />;
  }
}

function detectType(subdomain: string, tags: string[]): string {
  const tagStr = tags.join(" ").toLowerCase();
  if (["bridge", "layer2", "defi"].includes(subdomain) || tagStr.includes("flow") || tagStr.includes("protocol") || tagStr.includes("how")) return "flow";
  if (tagStr.includes("vs") || tagStr.includes("comparison") || tagStr.includes("compare")) return "comparison";
  if (["easy", "beginner"].includes(subdomain)) return "pyramid";
  if (["eth", "sol", "btc"].includes(subdomain) || tagStr.includes("network") || tagStr.includes("validator")) return "network";
  if (["staking", "defi", "rwa", "tax"].includes(subdomain) || tagStr.includes("yield") || tagStr.includes("reward")) return "stats";
  return "concepts";
}

function buildPalette(hex: string) {
  return {
    main: hex,
    light: hex + "22",
    mid: hex + "55",
    dark: hex + "cc",
  };
}

/* ── Flow Diagram ─────────────────────────────────────────── */
function FlowDiagram({ accentHex, palette, subdomain }: { accentHex: string; palette: ReturnType<typeof buildPalette>; subdomain: string }) {
  const steps = FLOW_STEPS[subdomain] ?? FLOW_STEPS.default;
  const boxW = 130, boxH = 44, gap = 56, startX = 30, startY = 30;
  const totalW = startX * 2 + steps.length * boxW + (steps.length - 1) * gap;

  return (
    <svg viewBox={`0 0 ${totalW} 104`} width="100%" style={{ maxHeight: 120 }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={accentHex} />
        </marker>
      </defs>
      {steps.map((step, i) => {
        const x = startX + i * (boxW + gap);
        const cx = x + boxW / 2;
        const cy = startY + boxH / 2;
        const isLast = i === steps.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={startY} width={boxW} height={boxH} rx={10}
              fill={palette.light} stroke={i === 0 ? accentHex : palette.mid} strokeWidth={i === 0 ? 2 : 1.5} />
            <text x={cx} y={cy - 6} textAnchor="middle" fontFamily="'Space Mono', monospace" fontSize="8" fill={accentHex} fontWeight="700">
              {(i + 1).toString().padStart(2, "0")}
            </text>
            <text x={cx} y={cy + 9} textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize="9.5" fill="#374151" fontWeight="600">
              {step}
            </text>
            {!isLast && (
              <line x1={x + boxW + 2} y1={cy} x2={x + boxW + gap - 4} y2={cy}
                stroke={accentHex} strokeWidth="1.5" markerEnd="url(#arr)" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

const FLOW_STEPS: Record<string, string[]> = {
  bridge:  ["Source Chain", "Lock Assets", "Relay Message", "Mint / Unlock", "Destination"],
  layer2:  ["L1 Submit TX", "Sequencer", "Batch Proof", "Verify On-Chain", "Finality"],
  defi:    ["Deposit", "Pool Shares", "Earn Yield", "Compound", "Withdraw"],
  eth:     ["Sign TX", "Mempool", "Validator", "Block Proposed", "Finalized"],
  btc:     ["Broadcast TX", "Mempool", "Miner Picks", "Block Found", "Confirmed"],
  sol:     ["Client TX", "Gulf Stream", "PoH Clock", "Leader", "Finalized"],
  staking: ["Hold ETH", "Deposit 32", "Validator Up", "Attest", "Earn Rewards"],
  default: ["Input", "Process", "Validate", "Confirm", "Output"],
};

/* ── Comparison Chart ─────────────────────────────────────── */
function ComparisonChart({ accentHex, palette }: { accentHex: string; palette: ReturnType<typeof buildPalette> }) {
  const metrics = ["Speed", "Security", "Cost", "Decentralization", "Ease of Use"];
  const a = [85, 95, 55, 90, 70];
  const b = [95, 80, 85, 60, 90];
  const barH = 12, gap = 8, labelW = 110, maxBarW = 160, padX = 20, padY = 20;
  const totalH = padY * 2 + metrics.length * (barH * 2 + gap + 6);

  return (
    <svg viewBox={`0 0 ${labelW + maxBarW + padX * 2 + 40} ${totalH}`} width="100%" style={{ maxHeight: 160 }} xmlns="http://www.w3.org/2000/svg">
      {/* Legend */}
      <rect x={padX} y={4} width={10} height={10} rx={3} fill={accentHex} />
      <text x={padX + 14} y={13} fontFamily="'DM Sans', sans-serif" fontSize="9" fill="#6b7280">Option A</text>
      <rect x={padX + 70} y={4} width={10} height={10} rx={3} fill="#e5e7eb" />
      <text x={padX + 84} y={13} fontFamily="'DM Sans', sans-serif" fontSize="9" fill="#6b7280">Option B</text>

      {metrics.map((label, i) => {
        const y = padY + i * (barH * 2 + gap + 6);
        return (
          <g key={i}>
            <text x={padX} y={y + barH - 1} fontFamily="'DM Sans', sans-serif" fontSize="9" fill="#374151" fontWeight="600">{label}</text>
            {/* Bar A */}
            <rect x={padX + labelW} y={y} width={(a[i] / 100) * maxBarW} height={barH} rx={4} fill={accentHex} opacity={0.85} />
            <text x={padX + labelW + (a[i] / 100) * maxBarW + 4} y={y + barH - 1} fontFamily="'Space Mono', monospace" fontSize="7.5" fill={accentHex}>{a[i]}%</text>
            {/* Bar B */}
            <rect x={padX + labelW} y={y + barH + 3} width={(b[i] / 100) * maxBarW} height={barH} rx={4} fill="#e5e7eb" />
            <text x={padX + labelW + (b[i] / 100) * maxBarW + 4} y={y + barH * 2 + 2} fontFamily="'Space Mono', monospace" fontSize="7.5" fill="#9ca3af">{b[i]}%</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Difficulty Pyramid ───────────────────────────────────── */
function DifficultyPyramid({ accentHex, palette, difficulty }: { accentHex: string; palette: ReturnType<typeof buildPalette>; difficulty: string }) {
  const levels = [
    { label: "Advanced", w: 80 },
    { label: "Intermediate", w: 150 },
    { label: "Beginner", w: 220 },
  ];
  const active = difficulty === "advanced" ? 0 : difficulty === "intermediate" ? 1 : 2;
  const cx = 140, h = 36, gap = 4, startY = 10;

  return (
    <svg viewBox="0 0 280 140" width="100%" style={{ maxHeight: 150 }} xmlns="http://www.w3.org/2000/svg">
      <text x={cx} y={8} textAnchor="middle" fontFamily="'Space Mono', monospace" fontSize="8" fill="#9ca3af" letterSpacing="2">YOUR LEVEL</text>
      {levels.map((lvl, i) => {
        const y = startY + 14 + i * (h + gap);
        const x = cx - lvl.w / 2;
        const isActive = i === active;
        return (
          <g key={i}>
            <rect x={x} y={y} width={lvl.w} height={h} rx={6}
              fill={isActive ? palette.light : "#f9fafb"}
              stroke={isActive ? accentHex : "#e5e7eb"}
              strokeWidth={isActive ? 2 : 1} />
            {isActive && <rect x={x} y={y} width={4} height={h} rx={2} fill={accentHex} />}
            <text x={cx} y={y + h / 2 + 4} textAnchor="middle"
              fontFamily="'DM Sans', sans-serif" fontSize="11" fontWeight={isActive ? "700" : "500"}
              fill={isActive ? accentHex : "#9ca3af"}>
              {lvl.label}
            </text>
          </g>
        );
      })}
      {/* Arrow pointing to active */}
      <text x={cx + levels[active].w / 2 + 16} y={startY + 14 + active * (h + gap) + h / 2 + 4}
        fontFamily="'DM Sans', sans-serif" fontSize="14" fill={accentHex}>←</text>
    </svg>
  );
}

/* ── Network Diagram ──────────────────────────────────────── */
function NetworkDiagram({ accentHex, palette }: { accentHex: string; palette: ReturnType<typeof buildPalette> }) {
  const nodes = [
    { x: 140, y: 50,  label: "Core",   r: 22, main: true },
    { x: 60,  y: 30,  label: "Node A", r: 14, main: false },
    { x: 220, y: 30,  label: "Node B", r: 14, main: false },
    { x: 50,  y: 100, label: "Node C", r: 14, main: false },
    { x: 230, y: 100, label: "Node D", r: 14, main: false },
    { x: 140, y: 130, label: "Node E", r: 14, main: false },
  ];
  const edges = [[0,1],[0,2],[0,3],[0,4],[0,5],[1,2],[3,5],[4,5]];

  return (
    <svg viewBox="0 0 280 160" width="100%" style={{ maxHeight: 160 }} xmlns="http://www.w3.org/2000/svg">
      {edges.map(([a, b], i) => (
        <line key={i}
          x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          stroke={palette.mid} strokeWidth="1.2" />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.main ? palette.light : "#f9fafb"} stroke={n.main ? accentHex : palette.mid} strokeWidth={n.main ? 2 : 1.5} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize={n.main ? "8" : "7"} fontWeight={n.main ? "700" : "500"} fill={n.main ? accentHex : "#6b7280"}>
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── Stats Card ───────────────────────────────────────────── */
function StatsCard({ accentHex, palette, subdomain }: { accentHex: string; palette: ReturnType<typeof buildPalette>; subdomain: string }) {
  const stats = STATS_DATA[subdomain] ?? STATS_DATA.default;

  return (
    <svg viewBox="0 0 300 90" width="100%" style={{ maxHeight: 100 }} xmlns="http://www.w3.org/2000/svg">
      {stats.map((s, i) => {
        const x = 20 + i * (300 / stats.length);
        const boxW = 300 / stats.length - 14;
        return (
          <g key={i}>
            <rect x={x} y={8} width={boxW} height={74} rx={10} fill={palette.light} stroke={palette.mid} strokeWidth="1" />
            <text x={x + boxW / 2} y={36} textAnchor="middle" fontFamily="'Space Mono', monospace" fontSize="18" fontWeight="700" fill={accentHex}>
              {s.value}
            </text>
            <text x={x + boxW / 2} y={54} textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize="9" fill="#6b7280">
              {s.label}
            </text>
            <text x={x + boxW / 2} y={70} textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize="8" fill={accentHex}>
              {s.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const STATS_DATA: Record<string, { value: string; label: string; sub: string }[]> = {
  staking: [
    { value: "3.5%",  label: "Avg ETH APY",        sub: "staking rewards" },
    { value: "32",    label: "ETH Required",        sub: "solo validator" },
    { value: "~12s",  label: "Block Time",          sub: "post-merge" },
    { value: "99.9%", label: "Uptime Target",       sub: "avoid slashing" },
  ],
  defi: [
    { value: "$80B+", label: "Total Value Locked",  sub: "DeFi protocols" },
    { value: "5-20%", label: "Avg Yield",           sub: "stable pools" },
    { value: "0.3%",  label: "Typical Swap Fee",    sub: "DEX standard" },
    { value: "100+",  label: "Active Protocols",    sub: "multi-chain" },
  ],
  rwa: [
    { value: "$12B+", label: "RWA On-Chain",        sub: "tokenized assets" },
    { value: "4-5%",  label: "T-Bill Yield",        sub: "tokenized" },
    { value: "30+",   label: "Issuers",             sub: "live platforms" },
    { value: "2025",  label: "Breakout Year",       sub: "institutional" },
  ],
  tax: [
    { value: "37%",   label: "Short-Term Cap Gain", sub: "under 1 year" },
    { value: "20%",   label: "Long-Term Cap Gain",  sub: "over 1 year" },
    { value: "$600",  label: "1099 Threshold",      sub: "exchange report" },
    { value: "Apr 15", label: "Filing Deadline",   sub: "US taxpayers" },
  ],
  default: [
    { value: "10K+",  label: "Daily Users",         sub: "avg platform" },
    { value: "99%",   label: "Uptime",              sub: "protocol SLA" },
    { value: "< 1s",  label: "Confirmation",        sub: "optimistic L2" },
    { value: "2025",  label: "Current Year",        sub: "stay updated" },
  ],
};

/* ── Key Concepts ─────────────────────────────────────────── */
function KeyConcepts({ accentHex, palette, tags }: { accentHex: string; palette: ReturnType<typeof buildPalette>; tags: string[] }) {
  const displayTags = tags.slice(0, 6);
  const cols = Math.min(3, displayTags.length);
  const tagW = 80, tagH = 28, gapX = 10, gapY = 8;
  const rows = Math.ceil(displayTags.length / cols);
  const totalW = cols * tagW + (cols - 1) * gapX + 40;
  const totalH = rows * tagH + (rows - 1) * gapY + 44;

  if (displayTags.length === 0) return null;

  return (
    <svg viewBox={`0 0 ${Math.max(totalW, 200)} ${totalH}`} width="100%" style={{ maxHeight: 100 }} xmlns="http://www.w3.org/2000/svg">
      <text x={totalW / 2} y={14} textAnchor="middle" fontFamily="'Space Mono', monospace" fontSize="8" fill="#9ca3af" letterSpacing="2">
        KEY CONCEPTS
      </text>
      {displayTags.map((tag, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 20 + col * (tagW + gapX);
        const y = 22 + row * (tagH + gapY);
        return (
          <g key={i}>
            <rect x={x} y={y} width={tagW} height={tagH} rx={6} fill={palette.light} stroke={palette.mid} strokeWidth="1" />
            <text x={x + tagW / 2} y={y + tagH / 2 + 4} textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize="9" fontWeight="600" fill={accentHex}>
              #{tag}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
