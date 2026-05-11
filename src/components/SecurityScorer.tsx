"use client";

import { useState } from "react";

// ── Questions ──────────────────────────────────────────────────────────────
interface Question {
  id: string;
  category: string;
  text: string;
  points: number;
  yesIsGood: boolean;   // false = answering "yes" is BAD (e.g. "Do you reuse passwords?")
  tip: string;          // shown when answer is wrong
  fixLabel?: string;
  fixHref?: string;
}

const QUESTIONS: Question[] = [
  // Wallet storage
  {
    id: "hw",
    category: "Wallet Storage",
    text: "Do you use a hardware wallet for significant holdings?",
    points: 14,
    yesIsGood: true,
    tip: "A hardware wallet keeps your private keys offline and is the single biggest upgrade you can make.",
    fixLabel: "Get a Ledger →",
    fixHref: "https://web3guides.com/go/ledger",
  },
  {
    id: "seed_offline",
    category: "Wallet Storage",
    text: "Is your seed phrase stored offline (paper/metal) — not in a photo, cloud, or password manager?",
    points: 14,
    yesIsGood: true,
    tip: "Digital seed phrase storage is a single hack away from total loss. Write it on paper or stamp it on metal.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
  {
    id: "seed_tested",
    category: "Wallet Storage",
    text: "Have you tested your seed phrase recovery process at least once?",
    points: 8,
    yesIsGood: true,
    tip: "Most people discover their backup is wrong only when they need it. Test it now while you still can.",
    fixLabel: "How to test recovery →",
    fixHref: "https://security.web3guides.com",
  },
  // Operational security
  {
    id: "burner",
    category: "Operational Security",
    text: "Do you use a separate 'hot' wallet for airdrops, mints, and testing?",
    points: 10,
    yesIsGood: true,
    tip: "Your main wallet should never sign unknown contracts. A dedicated burner wallet limits blast radius.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
  {
    id: "approvals",
    category: "Operational Security",
    text: "Have you revoked old token approvals in the last 90 days?",
    points: 8,
    yesIsGood: true,
    tip: "Old unlimited approvals are open doors. Use revoke.cash to remove them regularly.",
    fixLabel: "Revoke approvals →",
    fixHref: "https://revoke.cash",
  },
  {
    id: "vpn",
    category: "Operational Security",
    text: "Do you use a VPN when transacting on public Wi-Fi?",
    points: 5,
    yesIsGood: true,
    tip: "Public Wi-Fi exposes you to MITM attacks. A VPN encrypts your connection.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
  {
    id: "bookmark",
    category: "Operational Security",
    text: "Do you use bookmarks for DeFi apps (never Google the URL)?",
    points: 8,
    yesIsGood: true,
    tip: "Phishing sites buy Google ads to appear above the real site. Bookmarks bypass this entirely.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
  // Exchange security
  {
    id: "2fa",
    category: "Exchange Security",
    text: "Do you use an authenticator app (not SMS) for 2FA on all exchanges?",
    points: 10,
    yesIsGood: true,
    tip: "SMS 2FA can be bypassed with SIM-swapping. Use Google Authenticator or Authy instead.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
  {
    id: "unique_pw",
    category: "Exchange Security",
    text: "Do you use a unique password for every exchange account?",
    points: 8,
    yesIsGood: true,
    tip: "Password reuse means one breach compromises everything. Use a password manager.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
  {
    id: "withdrawal_whitelist",
    category: "Exchange Security",
    text: "Have you enabled withdrawal address whitelisting on your main exchange?",
    points: 6,
    yesIsGood: true,
    tip: "Whitelisting means even if your account is compromised, funds can only go to pre-approved addresses.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
  // Threat awareness
  {
    id: "dm_offers",
    category: "Threat Awareness",
    text: "Do you ignore all unsolicited DMs offering free crypto, whitelist spots, or 'support'?",
    points: 6,
    yesIsGood: true,
    tip: "100% of unsolicited 'free crypto' DMs are scams. No exceptions.",
    fixLabel: "Scam guide →",
    fixHref: "https://security.web3guides.com",
  },
  {
    id: "connect_wallet",
    category: "Threat Awareness",
    text: "Do you check the URL carefully before connecting your wallet to any dApp?",
    points: 8,
    yesIsGood: true,
    tip: "doma.xyz ≠ d0ma.xyz. One wrong character and you're draining your wallet.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
  {
    id: "multisig",
    category: "Advanced",
    text: "Do you use a multisig wallet (e.g. Safe) for large holdings?",
    points: 5,
    yesIsGood: true,
    tip: "Multisig requires multiple signers, so no single key compromise can drain your wallet.",
    fixLabel: "Security guide →",
    fixHref: "https://security.web3guides.com",
  },
];

const TOTAL_POINTS = QUESTIONS.reduce((s, q) => s + q.points, 0);

// ── Grade ──────────────────────────────────────────────────────────────────
interface Grade {
  letter: string;
  label: string;
  color: string;
  message: string;
}

function getGrade(score: number): Grade {
  const pct = (score / TOTAL_POINTS) * 100;
  if (pct >= 90) return { letter: "A+", label: "Excellent",     color: "#22c55e", message: "Your security is top-tier. Most crypto users would envy your setup. 🛡️" };
  if (pct >= 80) return { letter: "A",  label: "Strong",        color: "#4ade80", message: "Very solid security posture. A few gaps remain — fix them and you're fortress-level. 🔒" };
  if (pct >= 70) return { letter: "B+", label: "Good",          color: "#a3e635", message: "Better than most, but a determined attacker could still find a way in. Plug those gaps. ⚡" };
  if (pct >= 60) return { letter: "B",  label: "Average",       color: "#facc15", message: "You know the basics but you have real vulnerabilities. Address the high-point items first. ⚠️" };
  if (pct >= 45) return { letter: "C",  label: "Exposed",       color: "#fb923c", message: "Significant gaps in your security. One bad transaction or phishing attempt could hurt badly. 🔴" };
  if (pct >= 30) return { letter: "D",  label: "At Risk",       color: "#f97316", message: "You're relying on luck. Please work through the action list below before your next transaction. 🚨" };
  return              { letter: "F",  label: "Critical Risk",  color: "#ef4444", message: "Your funds are at serious risk right now. Start with the hardware wallet and seed phrase storage immediately. 🚨🚨" };
}

// ── Category colours ───────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  "Wallet Storage":      "#F7931A",
  "Operational Security": "#627EEA",
  "Exchange Security":   "#0ea5e9",
  "Threat Awareness":    "#a78bfa",
  "Advanced":            "#22c55e",
};

// ── Main component ─────────────────────────────────────────────────────────
export default function SecurityScorer() {
  const [step,    setStep]    = useState<number>(0);           // 0 = intro, 1..n = question, n+1 = results
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [copied,  setCopied]  = useState(false);

  const total     = QUESTIONS.length;
  const current   = QUESTIONS[step - 1];
  const isIntro   = step === 0;
  const isResults = step > total;

  // Score = sum of points where answer is "correct"
  const score = QUESTIONS.reduce((s, q) => {
    const ans = answers[q.id];
    if (ans === undefined) return s;
    const correct = q.yesIsGood ? ans === true : ans === false;
    return s + (correct ? q.points : 0);
  }, 0);

  const grade      = getGrade(score);
  const pct        = Math.round((score / TOTAL_POINTS) * 100);
  const fixItems   = QUESTIONS.filter(q => {
    const ans = answers[q.id];
    if (ans === undefined) return false;
    return q.yesIsGood ? ans === false : ans === true;
  });

  function answer(yes: boolean) {
    setAnswers(prev => ({ ...prev, [current.id]: yes }));
    setStep(prev => prev + 1);
  }

  function handleShare() {
    const text = `My crypto security score: ${grade.letter} (${pct}%) 🛡️\nHow secure are you? → https://web3guides.com/tools/security-score`;
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

  // ── Intro ────────────────────────────────────────────────────────────────
  if (isIntro) return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 20px 80px", textAlign: "center" }}>
      <div style={{
        display: "inline-block", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: 20, padding: "4px 14px", fontSize: 11, fontWeight: 700, color: "#fca5a5",
        letterSpacing: 2, textTransform: "uppercase", marginBottom: 20,
      }}>
        Free Tool
      </div>
      <h1 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>
        Wallet Security{" "}
        <span style={{ background: "linear-gradient(135deg,#ef4444,#f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
          Scorer
        </span>
      </h1>
      <p style={{ margin: "0 auto 32px", maxWidth: 460, fontSize: 15, color: "#64748b", lineHeight: 1.7 }}>
        {total} questions. No wallet connection. See your security grade in under 2 minutes — and exactly where you're exposed.
      </p>

      {/* Category preview */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 40 }}>
        {Object.entries(CAT_COLOR).map(([cat, col]) => (
          <span key={cat} style={{
            padding: "5px 12px", borderRadius: 20,
            background: `${col}15`, border: `1px solid ${col}30`,
            fontFamily: "system-ui", fontSize: 12, color: col,
          }}>
            {cat}
          </span>
        ))}
      </div>

      <button onClick={() => setStep(1)} style={{
        padding: "16px 48px", borderRadius: 12, border: "none",
        background: "linear-gradient(135deg, #ef4444, #f97316)",
        color: "#fff", fontFamily: "'Bungee', cursive, system-ui",
        fontSize: 17, letterSpacing: 1, cursor: "pointer",
        transition: "opacity 0.15s",
      }}
        onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
        onMouseOut={e => (e.currentTarget.style.opacity = "1")}
      >
        START QUIZ →
      </button>
      <p style={{ marginTop: 16, fontSize: 12, color: "#334155" }}>
        No wallet connection required. Purely educational.
      </p>
    </div>
  );

  // ── Results ──────────────────────────────────────────────────────────────
  if (isResults) return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 20px 80px", animation: "fadeUp 0.4s ease" }}>
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }`}</style>

      {/* Grade card */}
      <div style={{
        background: "#0d1424", border: `1px solid ${grade.color}40`,
        borderRadius: 20, padding: "32px 28px", marginBottom: 20, textAlign: "center",
      }}>
        {/* Big grade letter */}
        <div style={{
          fontFamily: "'Bungee', cursive, system-ui",
          fontSize: "clamp(72px, 15vw, 100px)",
          color: grade.color, lineHeight: 1, marginBottom: 8,
          textShadow: `0 0 40px ${grade.color}60`,
        }}>
          {grade.letter}
        </div>
        <div style={{ fontFamily: "system-ui", fontWeight: 700, fontSize: 18, color: "#e2e8f0", marginBottom: 4 }}>
          {grade.label}
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: grade.color, marginBottom: 20 }}>
          {score}/{TOTAL_POINTS} points · {pct}%
        </div>

        {/* Bar */}
        <div style={{ height: 8, background: "#1e293b", borderRadius: 99, overflow: "hidden", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
          <div style={{
            height: "100%", borderRadius: 99, width: `${pct}%`,
            background: `linear-gradient(90deg, #ef4444, ${grade.color})`,
            transition: "width 0.6s ease",
          }} />
        </div>

        <p style={{ fontFamily: "system-ui", fontSize: 14, color: "#94a3b8", lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
          {grade.message}
        </p>
      </div>

      {/* Category breakdown */}
      <div style={{ background: "#080e1a", border: "1px solid #1e293b", borderRadius: 16, padding: "20px", marginBottom: 20 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#475569", marginBottom: 14 }}>
          Breakdown by category
        </div>
        {Object.keys(CAT_COLOR).map(cat => {
          const catQs    = QUESTIONS.filter(q => q.category === cat);
          const catMax   = catQs.reduce((s, q) => s + q.points, 0);
          const catScore = catQs.reduce((s, q) => {
            const ans = answers[q.id];
            if (ans === undefined) return s;
            return s + ((q.yesIsGood ? ans === true : ans === false) ? q.points : 0);
          }, 0);
          const catPct = Math.round((catScore / catMax) * 100);
          const col    = CAT_COLOR[cat];
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: "system-ui", fontSize: 13, color: "#94a3b8" }}>{cat}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: col }}>{catScore}/{catMax}</span>
              </div>
              <div style={{ height: 5, background: "#1e293b", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, width: `${catPct}%`, background: col, transition: "width 0.5s" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Fix-it list */}
      {fixItems.length > 0 && (
        <div style={{ background: "#080e1a", border: "1px solid #1e293b", borderRadius: 16, padding: "20px", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#475569", marginBottom: 16 }}>
            🔴 Your biggest risks — fix these first
          </div>
          {fixItems.sort((a, b) => b.points - a.points).map(q => (
            <div key={q.id} style={{
              marginBottom: 12, padding: "14px 16px", borderRadius: 10,
              background: "#0d1424", border: `1px solid ${CAT_COLOR[q.category]}25`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: "system-ui", fontWeight: 700, fontSize: 13, color: "#e2e8f0", flex: 1 }}>
                  {q.text}
                </span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#ef4444", flexShrink: 0 }}>
                  -{q.points}pts
                </span>
              </div>
              <p style={{ fontFamily: "system-ui", fontSize: 12, color: "#64748b", margin: "0 0 10px", lineHeight: 1.5 }}>
                {q.tip}
              </p>
              {q.fixHref && (
                <a href={q.fixHref} target="_blank" rel="noopener noreferrer" style={{
                  display: "inline-block", padding: "6px 14px", borderRadius: 8,
                  border: `1px solid ${CAT_COLOR[q.category]}40`, background: `${CAT_COLOR[q.category]}10`,
                  color: CAT_COLOR[q.category], fontFamily: "system-ui", fontSize: 12, fontWeight: 700,
                  textDecoration: "none",
                }}>
                  {q.fixLabel ?? "Fix this →"}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Share + CTA + Retake */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={handleShare} style={{
          flex: 1, minWidth: 150, padding: "13px 16px", borderRadius: 10,
          border: "1px solid #ef444450", background: "#ef444415",
          color: "#ef4444", fontFamily: "system-ui", fontSize: 14, fontWeight: 700,
          cursor: "pointer",
        }}>
          {copied ? "✓ Copied to clipboard!" : `Share my score: ${grade.letter} (${pct}%)`}
        </button>
        <a href="https://web3guides.com/go/ledger" target="_blank" rel="noopener noreferrer" style={{
          flex: 1, minWidth: 150, padding: "13px 16px", borderRadius: 10,
          background: "linear-gradient(135deg, #ef4444, #f97316)",
          color: "#fff", fontFamily: "system-ui", fontSize: 14, fontWeight: 700,
          textDecoration: "none", textAlign: "center",
        }}>
          Get a Ledger →
        </a>
      </div>
      <button onClick={() => { setStep(0); setAnswers({}); }} style={{
        width: "100%", padding: "10px", borderRadius: 10,
        border: "1px solid #1e293b", background: "transparent",
        color: "#475569", fontFamily: "system-ui", fontSize: 13,
        cursor: "pointer",
      }}>
        Retake quiz
      </button>

      <p style={{ marginTop: 24, fontFamily: "system-ui", fontSize: 11, color: "#334155", lineHeight: 1.7 }}>
        For educational purposes only. Not financial or security advice. Consult a professional for personalised guidance.
      </p>
    </div>
  );

  // ── Question ─────────────────────────────────────────────────────────────
  const progress = ((step - 1) / total) * 100;
  const catColor = CAT_COLOR[current.category] ?? "#7c6aff";

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 20px 80px" }}>

      {/* Progress */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: catColor }}>
            {current.category}
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#475569" }}>
            {step} / {total}
          </span>
        </div>
        <div style={{ height: 4, background: "#1e293b", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, width: `${progress}%`, background: catColor, transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Question card */}
      <div style={{
        background: "#0d1424", border: `1px solid ${catColor}30`,
        borderRadius: 20, padding: "36px 28px 32px",
        animation: "fadeUp 0.2s ease",
      }}>
        <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }`}</style>

        <div style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 20,
          background: `${catColor}15`, border: `1px solid ${catColor}30`,
          fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 1,
          color: catColor, textTransform: "uppercase", marginBottom: 20,
        }}>
          {current.points} points
        </div>

        <h2 style={{ margin: "0 0 36px", fontSize: "clamp(17px, 3.5vw, 22px)", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.4 }}>
          {current.text}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <button onClick={() => answer(true)} style={{
            padding: "16px", borderRadius: 12, border: "1px solid #22c55e40",
            background: "#22c55e10", color: "#22c55e",
            fontFamily: "system-ui", fontSize: 15, fontWeight: 700,
            cursor: "pointer", transition: "all 0.15s",
          }}
            onMouseOver={e => { e.currentTarget.style.background = "#22c55e20"; e.currentTarget.style.borderColor = "#22c55e80"; }}
            onMouseOut={e => { e.currentTarget.style.background = "#22c55e10"; e.currentTarget.style.borderColor = "#22c55e40"; }}
          >
            ✓ Yes
          </button>
          <button onClick={() => answer(false)} style={{
            padding: "16px", borderRadius: 12, border: "1px solid #ef444440",
            background: "#ef444410", color: "#ef4444",
            fontFamily: "system-ui", fontSize: 15, fontWeight: 700,
            cursor: "pointer", transition: "all 0.15s",
          }}
            onMouseOver={e => { e.currentTarget.style.background = "#ef444420"; e.currentTarget.style.borderColor = "#ef444480"; }}
            onMouseOut={e => { e.currentTarget.style.background = "#ef444410"; e.currentTarget.style.borderColor = "#ef444440"; }}
          >
            ✗ No
          </button>
        </div>
      </div>

      {/* Skip / back */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        {step > 1 ? (
          <button onClick={() => setStep(s => s - 1)} style={{ background: "none", border: "none", color: "#334155", fontFamily: "system-ui", fontSize: 13, cursor: "pointer" }}>
            ← Back
          </button>
        ) : <span />}
        <button onClick={() => setStep(s => s + 1)} style={{ background: "none", border: "none", color: "#334155", fontFamily: "system-ui", fontSize: 13, cursor: "pointer" }}>
          Skip →
        </button>
      </div>
    </div>
  );
}
