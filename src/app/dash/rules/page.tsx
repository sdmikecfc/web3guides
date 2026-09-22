/**
 * DOMAXX rules & scoring — the published math behind the cycle pool (ADR-0127).
 *
 * TRANSPARENCY CONTRACT (Mike, 2026-08-19): volume math is fully explicit — points,
 * multipliers, floor, unlock ladder, seat cap, and the gate rule. Referrals and social
 * publish the FACTORS and the anti-bot checks but never numeric weights or benchmarks;
 * those live in server config so engagement can't be reverse-engineered and farmed.
 * Copy is written to survive a future public (ambassador-facing) version unchanged.
 *
 * Static content — same ISR/auth posture as the board (Basic Auth in middleware,
 * never reads cookies()).
 */
import type { Metadata } from "next";
import { PageShell, Panel, Eyebrow, TabNav, UI, NUM } from "../_components/ui";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Rules & Scoring — DOMAXX",
  description: "How DOMAXX cycle rewards are calculated.",
  robots: { index: false, follow: false },
};

const h2: React.CSSProperties = {
  fontSize: 19,
  margin: "0 0 10px",
  letterSpacing: "-0.01em",
};
const p: React.CSSProperties = {
  color: UI.muted,
  fontSize: 14,
  lineHeight: 1.65,
  margin: "0 0 10px",
};
const code: React.CSSProperties = {
  ...NUM,
  display: "block",
  background: "#0e1116",
  border: `1px solid ${UI.border}`,
  borderRadius: 10,
  padding: "12px 16px",
  fontSize: 13.5,
  color: UI.text,
  margin: "12px 0",
  overflowX: "auto",
  whiteSpace: "pre",
};
const td: React.CSSProperties = { ...NUM, padding: "7px 12px", fontSize: 13, color: UI.muted, whiteSpace: "nowrap" };
const thc: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 10.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: UI.faint,
  textAlign: "left",
  fontWeight: 700,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel style={{ marginBottom: 16 }}>
      <h2 style={h2}>{title}</h2>
      {children}
    </Panel>
  );
}

export default function DashRulesPage() {
  return (
    <PageShell>
      <Eyebrow>Doma Ambassador Program</Eyebrow>
      <h1 style={{ margin: "0 0 6px", fontSize: 30 }}>Rules &amp; scoring</h1>
      <p style={{ color: UI.muted, margin: "0 0 16px", fontSize: 13.5 }}>
        Cycle 1 runs <strong style={{ color: UI.text }}>August 20, 14:00 UTC</strong> through <strong style={{ color: UI.text }}>September 15, 23:59 UTC</strong>.
        The cycle pool is <strong style={{ color: UI.text }}>$10,000</strong>.
      </p>
      <TabNav active="rules" />

      <Section title="The one-paragraph version">
        <p style={p}>
          Trade on Doma to earn <strong style={{ color: UI.text }}>volume points</strong> — $1 traded is 1 point,
          with multipliers for domain tokens. Referrals and social content <em>multiply</em> what your
          volume earns: each is graded 0–100 and can add up to 60% (referrals) and 40% (social) on top
          of your volume points. The cohort&apos;s combined trading unlocks the pool, and everyone
          eligible splits it in proportion to their points. Trade at least{" "}
          <strong style={{ color: UI.text }}>$500 yourself</strong> during the cycle to be eligible.
        </p>
      </Section>

      <Section title="Volume points — fully public math">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${UI.border}` }}>
                <th style={thc}>What you trade</th>
                <th style={thc}>Points per $1</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid ${UI.border}55` }}>
                <td style={td}>USDC ↔ ETH swaps</td>
                <td style={{ ...td, color: UI.text, fontWeight: 700 }}>1×</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${UI.border}55` }}>
                <td style={td}>Graduated domain tokens (post-graduation pools)</td>
                <td style={{ ...td, color: UI.text, fontWeight: 700 }}>2×</td>
              </tr>
              <tr>
                <td style={td}>Bonding-curve domain tokens (not yet graduated)</td>
                <td style={{ ...td, color: UI.text, fontWeight: 700 }}>3×</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ ...p, marginTop: 12 }}>
          Buys and sells both count. A trade is bucketed by what the token was{" "}
          <em>at the moment you traded it</em> — a token graduating later never rewrites your points.
          Volume from wallets you referred counts toward your points at the same rates, from the day
          the referral was registered. Only trading inside the cycle window counts.
        </p>
        <p style={p}>
          <strong style={{ color: UI.warn }}>Eligibility floor:</strong> you must trade at least $500 of
          your own volume during the cycle to receive a payout. Referral volume does not count toward
          the floor.
        </p>
      </Section>

      <Section title="Referrals and social multiply your volume">
        <p style={p}>
          Referrals and content are graded 0–100 each. Your grade converts to points as a share of
          what your <em>volume</em> earned:
        </p>
        <span style={code}>
          {"referral points = (referral grade / 100) × 0.6 × volume points\n"}
          {"social points   = (social grade / 100)   × 0.4 × volume points\n"}
          {"total points    = volume + referral + social   (at most 2 × volume)"}
        </span>
        <p style={p}>
          Worked example: 500 volume points means referrals can add up to 300 and social up to 200 —
          a maximum of 1,000. Double the volume to 1,000 points and those caps double to 600 and 400.
          At full grades the split is exactly the advertised{" "}
          <strong style={{ color: UI.text }}>50% volume · 30% referrals · 20% social</strong>. Trading
          is always the anchor: strong content multiplies real volume, it never replaces it.
        </p>
      </Section>

      <Section title="How referrals are graded">
        <p style={p}>
          Register referrals with your Doma referral code; the team records them daily. A referral
          counts once the wallet clears a minimum traded volume across multiple active days — one-shot
          wash wallets do not count. Grades rise with how many referrals qualify and how broadly they
          use the platform (bonding, graduated, and currency trading all count for more than one-trick
          volume). Graded against a program benchmark, not against other ambassadors — another
          ambassador recruiting well never lowers your grade.
        </p>
        <p style={p}>
          <strong style={{ color: UI.bad }}>Anti-bot:</strong> referral batches created the same day,
          clusters of one-day wallets, and referred volume concentrated in a single token are flagged
          and reviewed. Flagged patterns cut the referral grade in half pending review.
        </p>
      </Section>

      <Section title="How social posts are graded">
        <p style={p}>
          Submit posts in the ambassador content channel (up to 5 per day). A post needs a minimum
          view count to count at all. Beyond that, grades balance <em>reach</em> (views) against{" "}
          <em>engagement rate</em> (likes, replies, reposts relative to views) — both matter, and
          neither alone is enough. Benchmarks are calibrated from the cohort&apos;s own posting
          history.
        </p>
        <p style={p}>
          <strong style={{ color: UI.bad }}>Anti-bot:</strong> engagement that is not organically
          possible (more engagement than views, like-to-view ratios beyond organic bands) voids the
          post entirely. Heavy likes with no replies or reposts — the like-farm shape — is
          half-weighted. Botting a post costs more than it earns.
        </p>
      </Section>

      <Section title="The pool: how it unlocks, how it splits">
        <p style={p}>
          The cohort&apos;s combined trading (own + referred, real dollars — multipliers do not apply
          here) unlocks the pool in steps:
        </p>
        <span style={code}>
          {"every $50,000 of cohort volume  →  unlocks $1,000 of the pool\n"}
          {"$500,000 of cohort volume       →  the full $10,000"}
        </span>
        <p style={p}>
          Everyone eligible splits the unlocked pool in proportion to their total points, with one
          protection: <strong style={{ color: UI.text }}>no single seat can take more than 20% of the
          pool</strong>. Anything above the cap redistributes to everyone else pro-rata. Points are
          never capped — only the payout share is.
        </p>
      </Section>

      <Section title="Fair play">
        <p style={p}>
          Wash trading is monitored: tight buy/sell round-trips on the same token get flagged for
          review, and reviewed wash volume is repriced to 1× (or removed for egregious cases).
          Grades, flags, and reviews are applied uniformly across all 31 seats. Where a rule needs
          interpreting, the team&apos;s written decision is final and applies the same way to
          everyone.
        </p>
        <p style={{ ...p, color: UI.faint, fontSize: 12.5, marginBottom: 0 }}>
          The board updates daily at 04:10 UTC. Exact grading benchmarks are deliberately unpublished
          so they cannot be farmed; the factors above are complete.
        </p>
      </Section>
    </PageShell>
  );
}
