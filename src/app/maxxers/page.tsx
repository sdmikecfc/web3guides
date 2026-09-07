/**
 * Maxxer Tracker — the PUBLIC ambassador board (web3guides.com/maxxers).
 *
 * No auth on purpose: the middleware Basic Auth gate matches /dash* only, so
 * this route is public by falling through. Everything rendered here comes from
 * getPublicBoard() — a hard-allowlist projection in src/lib/dash/data.ts whose
 * type has NO slots for per-person USD, wallets, flags, or payout numbers.
 * Do not import getBoardCached/BoardRow here; the projection IS the privacy
 * boundary. Group-level money (cohort volume, pool unlock) is public by
 * design — it is printed in the cohort's pinned rules posts.
 *
 * Same ISR contract as /dash: revalidate 600 + the bot's purge tag, and the
 * page never reads cookies()/headers() (that would silently go dynamic).
 */
import type { Metadata } from "next";
import { getPublicBoard } from "@/lib/dash/data";
import {
  PageShell, Panel, Eyebrow, StatCard, ScorePill, Avatar, PoolProgress,
  UI, NUM, fmtUsd, fmtInt,
} from "../dash/_components/ui";

// 10 minutes, not 24h (2026-08-26): at 86400 the board only refreshed once a
// day or on a deploy, so Mike had to run `vercel --prod` every morning to show
// the night's snapshot. The bot writes once a day; this just means the page
// notices within 10 minutes instead of needing a human.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Maxxer Tracker — Doma",
  description:
    "The DOMAXX ambassador leaderboard. Live points, scores, and the group's progress toward the cycle prize pool.",
};

const th: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: UI.faint,
  whiteSpace: "nowrap",
  fontWeight: 700,
};
const td: React.CSSProperties = { ...NUM, padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" };

export default async function MaxxerTrackerPage() {
  const board = await getPublicBoard();

  if (board.empty) {
    return (
      <PageShell>
        <Eyebrow>Doma Ambassador Program</Eyebrow>
        <h1 style={{ margin: "0 0 18px", fontSize: 30 }}>Maxxer Tracker</h1>
        <Panel>
          <strong>The board is warming up.</strong>
          <p style={{ color: UI.muted, margin: "8px 0 0", fontSize: 14 }}>
            The first update lands after the next daily snapshot. Check back soon.
          </p>
        </Panel>
      </PageShell>
    );
  }

  const { totals: cy, rows, seats, date } = board;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(cy.cycleEnd).getTime() - Date.now()) / 86_400_000)
  );
  const nextRungUsd = Math.max(0, cy.unlockStepUsd - (cy.cohortCycleUsd % cy.unlockStepUsd));
  const fullyUnlocked = cy.poolUnlockedUsd >= cy.poolUsd;

  return (
    <PageShell wide>
      <Eyebrow>Doma Ambassador Program</Eyebrow>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 30 }}>Maxxer Tracker</h1>
        <span style={{ ...NUM, fontSize: 12.5, color: UI.faint }}>
          updated through {date} · refreshes every 10 min
        </span>
      </div>
      <p style={{ color: UI.muted, margin: "0 0 22px", fontSize: 14.5, maxWidth: 720 }}>
        {seats} ambassadors. One shared prize pool. The group&apos;s trading unlocks the money,
        and points decide how it is shared.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <StatCard label="Group volume" value={fmtUsd(cy.cohortCycleUsd)} sub="everyone's trading, this cycle" />
        <StatCard label="Pool unlocked" value={fmtUsd(cy.poolUnlockedUsd)} sub={`of the ${fmtUsd(cy.poolUsd)} pool`} />
        <StatCard
          label="Next unlock"
          value={fullyUnlocked ? "Done" : fmtUsd(nextRungUsd)}
          sub={fullyUnlocked ? "the full pool is open" : `more volume opens ${fmtUsd(cy.unlockPerStepUsd)}`}
        />
        <StatCard label="Qualified" value={`${cy.eligibleCount} of ${seats}`} sub="cleared the $500 trading mark" />
        <StatCard label="Cycle ends" value={`${daysLeft}d`} sub="September 15, 23:59 UTC" />
      </div>

      <PoolProgress
        cohortCycleUsd={cy.cohortCycleUsd}
        poolUsd={cy.poolUsd}
        poolUnlockedUsd={cy.poolUnlockedUsd}
        targetUsd={(cy.poolUsd / cy.unlockPerStepUsd) * cy.unlockStepUsd}
        stepUsd={cy.unlockStepUsd}
      />

      <Panel style={{ padding: 0, marginTop: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${UI.border}` }}>
                <th style={{ ...th, textAlign: "left" }}>#</th>
                <th style={{ ...th, textAlign: "left" }}>Ambassador</th>
                <th style={{ ...th, textAlign: "right" }}>Points</th>
                <th style={{ ...th, textAlign: "right" }}>Referrals</th>
                <th style={{ ...th, textAlign: "right" }}>Referral score</th>
                <th style={{ ...th, textAlign: "right" }}>Post score</th>
                <th style={{ ...th, textAlign: "right" }}>Qualified</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.rank}-${r.displayName}`} style={{ borderBottom: `1px solid ${UI.border}55` }}>
                  <td style={{ ...td, textAlign: "left", color: r.rank <= 3 ? UI.accent : UI.faint, fontWeight: 800 }}>
                    {r.rank}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "left" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <Avatar url={r.avatarUrl} name={r.displayName} size={28} />
                      <span style={{ fontWeight: 600 }}>{r.displayName}</span>
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 800, color: r.ptsTotal > 0 ? UI.text : UI.faint }}>
                    {fmtInt(r.ptsTotal)}
                  </td>
                  <td style={{ ...td, color: r.referralsTotal > 0 ? UI.text : UI.faint }}>
                    {r.referralsQualified}/{r.referralsTotal}
                  </td>
                  <td style={td}><ScorePill score={r.refStrength} /></td>
                  <td style={td}><ScorePill score={r.socialStrength} /></td>
                  <td style={{ ...td, color: r.eligible ? UI.good : UI.faint, fontWeight: 700 }}>
                    {r.eligible ? "✓" : "not yet"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel style={{ marginTop: 12, padding: "14px 18px" }}>
        <p style={{ color: UI.muted, margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          <strong style={{ color: UI.text }}>Referrals</strong> shows qualified / total: a referral
          qualifies once that person trades a real amount on more than one day.{" "}
          <strong style={{ color: UI.text }}>How it works:</strong> every $1 an ambassador trades earns 1 point,
          and some tokens earn 2x or 3x. Inviting real traders and posting good content add bonus points,
          up to double the trading points. An ambassador qualifies for a payout with $500 of trading in the
          cycle, their own or their referrals&apos;. Every trade also raises the group volume, and group volume
          unlocks the prize pool for everyone. The board updates once a day.
        </p>
      </Panel>
    </PageShell>
  );
}
