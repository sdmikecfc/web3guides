"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
interface CheckItem {
  id: string;
  question: string;
  weight: number;         // points out of 100
  actionLabel: string;
  actionHref: string;
  guideHref?: string;
  guideLabel?: string;
}

interface Airdrop {
  key: string;
  name: string;
  ticker: string;
  color: string;
  bg: string;
  logo: string;          // emoji fallback
  status: string;
  statusColor: string;
  tge: string;
  description: string;
  items: CheckItem[];
}

// ── Airdrop Data ───────────────────────────────────────────────────────────
const AIRDROPS: Airdrop[] = [
  {
    key: "ink",
    name: "Ink",
    ticker: "INK",
    color: "#0066FF",
    bg: "#00051A",
    logo: "🖊",
    status: "Confirmed",
    statusColor: "#22c55e",
    tge: "Q3 2026",
    description: "Kraken's Layer 2 on the Superchain. Airdrop officially confirmed for Q3 2026 — the most reliable drop in this list.",
    items: [
      { id: "ink1", question: "Have you bridged ETH to Ink?", weight: 15, actionLabel: "Bridge to Ink →", actionHref: "https://inkonchain.com/bridge", guideLabel: "Ink bridge guide", guideHref: "https://ink.web3guides.com" },
      { id: "ink2", question: "Have you swapped tokens on Ink (SuperSwap or Velodrome)?", weight: 15, actionLabel: "Try SuperSwap →", actionHref: "https://superswap.fi", guideLabel: "Ink DEX guide", guideHref: "https://ink.web3guides.com" },
      { id: "ink3", question: "Have you supplied liquidity to Tydro (Ink's lending protocol)?", weight: 20, actionLabel: "Supply on Tydro →", actionHref: "https://tydro.xyz", guideLabel: "Tydro lending guide", guideHref: "https://ink.web3guides.com" },
      { id: "ink4", question: "Have you traded perpetuals on Nado?", weight: 15, actionLabel: "Trade on Nado →", actionHref: "https://nado.trade", guideLabel: "Nado perps guide", guideHref: "https://ink.web3guides.com" },
      { id: "ink5", question: "Have you registered an .ink domain on ZNS?", weight: 10, actionLabel: "Register .ink domain →", actionHref: "https://zns.is", guideLabel: "ZNS domain guide", guideHref: "https://ink.web3guides.com" },
      { id: "ink6", question: "Have you interacted with 3+ different Ink protocols?", weight: 15, actionLabel: "Explore Ink ecosystem →", actionHref: "https://inkonchain.com/ecosystem", guideLabel: "Ink ecosystem", guideHref: "https://ink.web3guides.com" },
      { id: "ink7", question: "Have you joined the Ink Discord or followed on X?", weight: 5, actionLabel: "Join Ink Discord →", actionHref: "https://discord.com/invite/inkonchain" },
      { id: "ink8", question: "Have you been active on Ink for 1+ months?", weight: 5, actionLabel: "Start using Ink →", actionHref: "https://inkonchain.com" },
    ],
  },
  {
    key: "base",
    name: "Base",
    ticker: "BASE",
    color: "#0052FF",
    bg: "#00051A",
    logo: "🔵",
    status: "Speculated",
    statusColor: "#f59e0b",
    tge: "Unconfirmed",
    description: "Coinbase's L2. No official confirmation but on-chain activity data is being captured. Coinbase has massive incentive to reward early users.",
    items: [
      { id: "base1", question: "Have you bridged ETH to Base using the official bridge?", weight: 15, actionLabel: "Bridge to Base →", actionHref: "https://bridge.base.org", guideLabel: "Layer 2 guide", guideHref: "https://layer2.web3guides.com" },
      { id: "base2", question: "Have you swapped on Base (Uniswap, Aerodrome, or similar)?", weight: 15, actionLabel: "Swap on Uniswap →", actionHref: "https://app.uniswap.org" },
      { id: "base3", question: "Have you used the Coinbase Wallet connected to Base?", weight: 10, actionLabel: "Get Coinbase Wallet →", actionHref: "https://www.coinbase.com/wallet" },
      { id: "base4", question: "Have you provided liquidity on Aerodrome?", weight: 15, actionLabel: "Use Aerodrome →", actionHref: "https://aerodrome.finance" },
      { id: "base5", question: "Have you minted or held an NFT on Base?", weight: 10, actionLabel: "Mint on Base →", actionHref: "https://base.org/ecosystem" },
      { id: "base6", question: "Have you used 5+ different dApps on Base?", weight: 15, actionLabel: "Explore Base ecosystem →", actionHref: "https://base.org/ecosystem" },
      { id: "base7", question: "Have you been active on Base for 3+ months?", weight: 10, actionLabel: "Start now →", actionHref: "https://base.org" },
      { id: "base8", question: "Have you made 10+ transactions on Base?", weight: 10, actionLabel: "Get started →", actionHref: "https://bridge.base.org" },
    ],
  },
  {
    key: "backpack",
    name: "Backpack",
    ticker: "BACK",
    color: "#E33B3B",
    bg: "#1a0505",
    logo: "🎒",
    status: "Confirmed TGE",
    statusColor: "#22c55e",
    tge: "2026",
    description: "Solana's flagship wallet and exchange. Mad Lads NFT holders are expected to receive a significant allocation. Exchange activity likely counts.",
    items: [
      { id: "bp1", question: "Do you hold a Mad Lads NFT?", weight: 30, actionLabel: "Check Mad Lads →", actionHref: "https://magiceden.io/marketplace/mad_lads", guideLabel: "SOL ecosystem", guideHref: "https://sol.web3guides.com" },
      { id: "bp2", question: "Do you use the Backpack wallet as your main Solana wallet?", weight: 20, actionLabel: "Download Backpack →", actionHref: "https://backpack.app" },
      { id: "bp3", question: "Have you traded on the Backpack Exchange?", weight: 20, actionLabel: "Trade on Backpack →", actionHref: "https://backpack.exchange" },
      { id: "bp4", question: "Have you used Backpack for 3+ months?", weight: 15, actionLabel: "Start using Backpack →", actionHref: "https://backpack.app" },
      { id: "bp5", question: "Have you completed KYC on Backpack Exchange?", weight: 10, actionLabel: "Complete KYC →", actionHref: "https://backpack.exchange" },
      { id: "bp6", question: "Have you referred anyone to Backpack?", weight: 5, actionLabel: "Get referral link →", actionHref: "https://backpack.app" },
    ],
  },
  {
    key: "polymarket",
    name: "Polymarket",
    ticker: "POLY",
    color: "#9B59B6",
    bg: "#0d0518",
    logo: "📊",
    status: "$POLY Filed",
    statusColor: "#f59e0b",
    tge: "Likely 2026",
    description: "The world's largest prediction market. A $POLY trademark was filed — a strong signal. Trading volume and market diversity likely determine allocation.",
    items: [
      { id: "poly1", question: "Have you made at least one trade on Polymarket?", weight: 15, actionLabel: "Trade on Polymarket →", actionHref: "https://polymarket.com" },
      { id: "poly2", question: "Have you traded $100+ total volume?", weight: 20, actionLabel: "Increase volume →", actionHref: "https://polymarket.com" },
      { id: "poly3", question: "Have you resolved (settled) 5+ markets?", weight: 20, actionLabel: "Find settling markets →", actionHref: "https://polymarket.com" },
      { id: "poly4", question: "Have you traded across 5+ different market categories?", weight: 15, actionLabel: "Explore markets →", actionHref: "https://polymarket.com" },
      { id: "poly5", question: "Have you been active on Polymarket for 3+ months?", weight: 15, actionLabel: "Start now →", actionHref: "https://polymarket.com" },
      { id: "poly6", question: "Have you used the Polymarket mobile app?", weight: 10, actionLabel: "Get the app →", actionHref: "https://polymarket.com" },
      { id: "poly7", question: "Have you deposited using USDC on Polygon?", weight: 5, actionLabel: "Deposit guide →", actionHref: "https://polymarket.com" },
    ],
  },
  {
    key: "aivm",
    name: "AIVM",
    ticker: "CGPT",
    color: "#00FEFC",
    bg: "#000d0d",
    logo: "🤖",
    status: "Potential",
    statusColor: "#f59e0b",
    tge: "Mainnet TBC",
    description: "ChainGPT's AI Virtual Machine — a Layer-1 for decentralised AI. $CGPT holders and testnet participants are expected to receive mainnet airdrop allocations.",
    items: [
      { id: "aivm1", question: "Have you participated in the AIVM testnet?", weight: 30, actionLabel: "Join AIVM testnet →", actionHref: "https://aivm.web3guides.com", guideLabel: "AIVM testnet guide", guideHref: "https://aivm.web3guides.com" },
      { id: "aivm2", question: "Do you hold $CGPT tokens?", weight: 20, actionLabel: "Buy $CGPT →", actionHref: "https://web3guides.com/go/kraken", guideLabel: "AIVM tokenomics", guideHref: "https://aivm.web3guides.com" },
      { id: "aivm3", question: "Have you staked $CGPT?", weight: 20, actionLabel: "Stake $CGPT →", actionHref: "https://pad.chaingpt.org", guideLabel: "Staking guide", guideHref: "https://staking.web3guides.com" },
      { id: "aivm4", question: "Have you used ChainGPT's AI tools (NFT generator, auditor)?", weight: 15, actionLabel: "Try ChainGPT AI →", actionHref: "https://app.chaingpt.org" },
      { id: "aivm5", question: "Have you participated in ChainGPT Pad IDOs?", weight: 10, actionLabel: "Explore ChainGPT Pad →", actionHref: "https://pad.chaingpt.org" },
      { id: "aivm6", question: "Have you been active in the ChainGPT community for 3+ months?", weight: 5, actionLabel: "Join Discord →", actionHref: "https://discord.gg/chaingpt" },
    ],
  },
];

// ── Score helpers ──────────────────────────────────────────────────────────
function getScoreLabel(pct: number): { label: string; color: string; emoji: string } {
  if (pct >= 80) return { label: "Very strong",    color: "#22c55e", emoji: "🎯" };
  if (pct >= 60) return { label: "Good shot",      color: "#0ea5e9", emoji: "🚀" };
  if (pct >= 40) return { label: "Partial",        color: "#f59e0b", emoji: "⚡" };
  if (pct >= 20) return { label: "Low",            color: "#f97316", emoji: "⚠️" };
  return              { label: "Needs work",      color: "#ef4444", emoji: "🔴" };
}

// ── Main component ─────────────────────────────────────────────────────────
export default function AirdropChecker() {
  const [selectedKey, setSelectedKey] = useState<string>("ink");
  const [checked, setChecked]         = useState<Record<string, boolean>>({});
  const [copied, setCopied]           = useState(false);

  const airdrop = AIRDROPS.find(a => a.key === selectedKey)!;
  const { color, items } = airdrop;

  // Score = sum of weights for checked items
  const score    = items.reduce((s, it) => s + (checked[it.id] ? it.weight : 0), 0);
  const scoreInfo = getScoreLabel(score);
  const unchecked = items.filter(it => !checked[it.id]);
  const checkedItems = items.filter(it => checked[it.id]);

  function toggle(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function handleAirdropChange(key: string) {
    setSelectedKey(key);
    // keep checked state per airdrop key — don't reset
  }

  function handleShare() {
    const text = `I'm ${score}% qualified for the ${airdrop.name} airdrop ${scoreInfo.emoji}\nChecked ${checkedItems.length}/${items.length} boxes. How do you score? → https://web3guides.com/tools/airdrop-checker`;
    const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 80px" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <div style={{
          display: "inline-block", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)",
          borderRadius: 20, padding: "4px 14px", fontSize: 11, fontWeight: 700, color: "#a78bfa",
          letterSpacing: 2, textTransform: "uppercase", marginBottom: 16,
        }}>
          Free Tool
        </div>
        <h1 style={{ margin: "0 0 14px", fontSize: "clamp(26px, 5vw, 42px)", fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>
          Airdrop{" "}
          <span style={{ background: "linear-gradient(135deg,#a78bfa,#ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Eligibility Checker
          </span>
        </h1>
        <p style={{ margin: "0 auto", maxWidth: 500, fontSize: 15, color: "#64748b", lineHeight: 1.7 }}>
          Pick an upcoming airdrop, check off what you've done, and see your eligibility score — plus exactly what to do next.
        </p>
      </div>

      {/* Airdrop selector */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, marginBottom: 28, scrollbarWidth: "none" }}>
        {AIRDROPS.map(a => (
          <button key={a.key} onClick={() => handleAirdropChange(a.key)} style={{
            flexShrink: 0, display: "flex", flexDirection: "column", gap: 6,
            padding: "12px 16px", borderRadius: 14, cursor: "pointer",
            border: `1px solid ${selectedKey === a.key ? a.color : "#1e293b"}`,
            background: selectedKey === a.key ? `${a.color}15` : "#0d1424",
            minWidth: 120, textAlign: "left", outline: "none", transition: "all 0.15s",
          }}>
            <span style={{ fontSize: 20 }}>{a.logo}</span>
            <span style={{ fontFamily: "system-ui", fontWeight: 700, fontSize: 13, color: selectedKey === a.key ? a.color : "#94a3b8" }}>
              {a.name}
            </span>
            <span style={{
              fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 1,
              color: a.statusColor, background: `${a.statusColor}15`,
              borderRadius: 4, padding: "2px 6px", textTransform: "uppercase",
            }}>
              {a.status}
            </span>
          </button>
        ))}
      </div>

      {/* Selected airdrop info */}
      <div style={{
        background: "#0d1424", border: `1px solid ${color}30`,
        borderRadius: 16, padding: "16px 20px", marginBottom: 24,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "system-ui", fontWeight: 700, fontSize: 16, color: color, marginBottom: 6 }}>
            {airdrop.name} ({airdrop.ticker})
          </div>
          <div style={{ fontFamily: "system-ui", fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            {airdrop.description}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#475569", marginBottom: 4 }}>TGE</div>
          <div style={{ fontFamily: "system-ui", fontWeight: 700, fontSize: 15, color: airdrop.statusColor }}>
            {airdrop.tge}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 16, padding: "20px 20px", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#475569" }}>
            Your eligibility score
          </span>
          <span style={{ fontFamily: "'Bungee', cursive, system-ui", fontSize: 28, color: scoreInfo.color }}>
            {score}%
          </span>
        </div>
        {/* Progress bar */}
        <div style={{ height: 8, background: "#1e293b", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
          <div style={{
            height: "100%", borderRadius: 99,
            width: `${score}%`,
            background: `linear-gradient(90deg, ${color}, ${scoreInfo.color})`,
            transition: "width 0.4s ease",
          }} />
        </div>
        <div style={{ fontFamily: "system-ui", fontSize: 13, color: scoreInfo.color }}>
          {scoreInfo.emoji} {scoreInfo.label} — {checkedItems.length}/{items.length} actions completed
        </div>
      </div>

      {/* Checklist */}
      <div style={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 16, padding: "20px", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#475569", marginBottom: 16 }}>
          Check what you&apos;ve done
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(it => {
            const done = !!checked[it.id];
            return (
              <button key={it.id} onClick={() => toggle(it.id)} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 14px", borderRadius: 10,
                border: `1px solid ${done ? color + "40" : "#1e293b"}`,
                background: done ? `${color}08` : "#080e1a",
                cursor: "pointer", textAlign: "left", outline: "none", transition: "all 0.15s",
              }}>
                {/* Checkbox */}
                <div style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: 6,
                  border: `2px solid ${done ? color : "#334155"}`,
                  background: done ? color : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginTop: 1, transition: "all 0.15s",
                }}>
                  {done && <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "system-ui", fontSize: 14, color: done ? "#e2e8f0" : "#94a3b8", lineHeight: 1.4 }}>
                    {it.question}
                  </div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: done ? color : "#334155", marginTop: 3 }}>
                    +{it.weight} points
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Plan (unchecked items) */}
      {unchecked.length > 0 && (
        <div style={{ background: "#080e1a", border: "1px solid #1e293b", borderRadius: 16, padding: "20px", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#475569", marginBottom: 16 }}>
            🗺️ Your action plan
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {unchecked.sort((a, b) => b.weight - a.weight).map(it => (
              <div key={it.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 10, border: "1px solid #1e293b",
                background: "#0d1424", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontFamily: "system-ui", fontSize: 13, color: "#94a3b8", lineHeight: 1.4, marginBottom: 4 }}>
                    {it.question}
                  </div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: color }}>
                    +{it.weight} points
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {it.guideHref && (
                    <a href={it.guideHref} target="_blank" rel="noopener noreferrer" style={{
                      padding: "7px 12px", borderRadius: 8,
                      border: "1px solid #1e293b", background: "#080e1a",
                      color: "#64748b", fontFamily: "system-ui", fontSize: 12,
                      textDecoration: "none", whiteSpace: "nowrap",
                    }}>
                      {it.guideLabel ?? "Read guide"}
                    </a>
                  )}
                  <a href={it.actionHref} target="_blank" rel="noopener noreferrer" style={{
                    padding: "7px 12px", borderRadius: 8,
                    border: `1px solid ${color}50`, background: `${color}15`,
                    color, fontFamily: "system-ui", fontSize: 12, fontWeight: 700,
                    textDecoration: "none", whiteSpace: "nowrap",
                  }}>
                    {it.actionLabel}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All done message */}
      {unchecked.length === 0 && (
        <div style={{
          background: `${color}10`, border: `1px solid ${color}30`,
          borderRadius: 14, padding: "20px", marginBottom: 24, textAlign: "center",
          fontFamily: "system-ui", fontSize: 15, color: color, fontWeight: 700,
        }}>
          💯 You&apos;ve completed every action — maximum eligibility!
        </div>
      )}

      {/* Share */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={handleShare} style={{
          flex: 1, minWidth: 160, padding: "13px 20px", borderRadius: 10,
          border: `1px solid ${color}50`, background: `${color}15`,
          color, fontFamily: "system-ui", fontSize: 14, fontWeight: 700,
          cursor: "pointer", transition: "all 0.15s",
        }}>
          {copied ? "✓ Copied to clipboard!" : `Share my ${score}% score`}
        </button>
        <a href="https://web3guides.com/go/kraken" target="_blank" rel="noopener noreferrer" style={{
          flex: 1, minWidth: 160, padding: "13px 20px", borderRadius: 10,
          background: "linear-gradient(135deg, #7c6aff, #ec4899)",
          color: "#fff", fontFamily: "system-ui", fontSize: 14, fontWeight: 700,
          textDecoration: "none", textAlign: "center",
        }}>
          Start on Kraken →
        </a>
      </div>

      {/* Disclaimer */}
      <p style={{ marginTop: 24, fontFamily: "system-ui", fontSize: 11, color: "#334155", lineHeight: 1.7 }}>
        Airdrop eligibility criteria are speculative and based on publicly available information. No airdrop is guaranteed. This is not financial advice. Always DYOR before interacting with any protocol.
      </p>
    </div>
  );
}
