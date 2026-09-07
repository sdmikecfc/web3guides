/**
 * Ambassador dashboard — the board. Team-only (Basic Auth in middleware; this
 * page NEVER reads cookies()/headers() — that would silently opt it into
 * dynamic rendering and break the 24h ISR contract below).
 *
 * Reads ONLY the precomputed nightly snapshot via src/lib/dash/data.ts
 * (unstable_cache 86400 + tag; the bot purges after each run). Zero live work.
 *
 * The table carries every stat the team asked for, under grouped headers:
 * VOLUME (own | referred | total | the three categories) and SOCIAL (posts |
 * engagement | score). It scrolls horizontally rather than dropping columns —
 * hiding a number on a narrow screen is how a stat quietly stops existing.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { getBoardCached } from "@/lib/dash/data";
import { PageShell, Panel, Eyebrow, StatCard, ScorePill, Avatar, TabNav, PoolProgress, UI, NUM, fmtUsd, fmtInt } from "./_components/ui";

// 10 minutes, not 24h — see the note in src/lib/dash/data.ts.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Ambassador Board — Doma",
  description: "Internal ambassador program dashboard.",
  robots: { index: false, follow: false },
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

export default async function DashBoardPage() {
  const board = await getBoardCached();

  if (board.empty) {
    return (
      <PageShell>
        <Eyebrow>Doma Ambassador Program</Eyebrow>
        <h1 style={{ margin: "0 0 18px", fontSize: 30 }}>Ambassador Board</h1>
        <TabNav active="board" />
        <Panel>
          <strong>First snapshot pending.</strong>
          <p style={{ color: UI.muted, margin: "8px 0 0", fontSize: 14 }}>
            The nightly snapshot job (04:10 UTC) has not completed a run yet. This page fills
            itself the morning after the bot module goes live — nothing is broken.
          </p>
        </Panel>
      </PageShell>
    );
  }

  const { totals, rows, date } = board;
  const eng = totals.engagement || { likes: 0, retweets: 0, replies: 0, views: 0 };
  const grpBorder = `1px solid ${UI.border}`;
  const cycle = totals.cycle || null;
  // Points columns render once the first post-ADR-0127 snapshot lands; the legacy
  // score column carries older snapshots so the board is never blank mid-transition.
  const hasPts = rows.some((r) => r.ptsTotal > 0);

  return (
    <PageShell wide>
      <Eyebrow>Doma Ambassador Program</Eyebrow>
      <h1 style={{ margin: "0 0 6px", fontSize: 30 }}>Ambassador Board</h1>
      <p style={{ color: UI.muted, margin: "0 0 16px", fontSize: 13.5 }}>
        Snapshot {date} · refreshes daily at 04:10 UTC
        {cycle ? ` · cycle ${String(cycle.cycleStart).slice(0, 10)} → ${String(cycle.cycleEnd).slice(0, 10)}` : ""}
      </p>
      <TabNav active="board" />

      {cycle ? (
        <div style={{ marginBottom: 14 }}>
          <PoolProgress
            cohortCycleUsd={cycle.cohortCycleUsd}
            poolUsd={cycle.poolUsd}
            poolUnlockedUsd={cycle.poolUnlockedUsd}
            targetUsd={(cycle.poolUsd / cycle.unlockPerStepUsd) * cycle.unlockStepUsd}
            stepUsd={cycle.unlockStepUsd}
          />
        </div>
      ) : null}

      {/* totals strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <StatCard label="Total volume" value={fmtUsd(totals.volumeUsd || 0)} sub="this cycle · own + referred, deduped" />
        <StatCard label="Ambassadors" value={fmtInt(totals.ambassadors || rows.length)} />
        <StatCard label="Content created" value={fmtInt(totals.postsTotal || 0)} sub="credited posts" />
        <StatCard label="Likes" value={fmtInt(eng.likes)} />
        <StatCard label="Reposts" value={fmtInt(eng.retweets)} />
        <StatCard label="Replies" value={fmtInt(eng.replies)} />
        <StatCard label="Views" value={fmtInt(eng.views)} />
      </div>

      {/* volume-by-category strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 26,
        }}
      >
        <StatCard
          label="USDC ↔ ETH volume"
          value={totals.volUsdcEth ? fmtUsd(totals.volUsdcEth) : "$0"}
          sub={totals.volUsdcEth ? "all ambassadors" : "not yet tracked"}
        />
        <StatCard label="Graduated token volume" value={fmtUsd(totals.volGraduated || 0)} sub="post-graduation pools" />
        <StatCard label="Bonding token volume" value={fmtUsd(totals.volBonding || 0)} sub="bonding curve" />
      </div>

      {/* leaderboard — every stat */}
      <Panel style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              {/* group header */}
              <tr style={{ borderBottom: `1px solid ${UI.border}66` }}>
                <th style={th} colSpan={2} />
                <th style={{ ...th, textAlign: "right" }}>Referrals</th>
                <th style={{ ...th, textAlign: "center", borderLeft: grpBorder }} colSpan={6}>
                  Volume (USD)
                </th>
                <th style={{ ...th, textAlign: "center", borderLeft: grpBorder }} colSpan={3}>
                  Social
                </th>
                {hasPts ? (
                  <th style={{ ...th, textAlign: "center", borderLeft: grpBorder }} colSpan={3}>
                    Cycle points
                  </th>
                ) : (
                  <th style={{ ...th, textAlign: "right", borderLeft: grpBorder }}>Score</th>
                )}
              </tr>
              <tr style={{ borderBottom: `1px solid ${UI.border}` }}>
                <th style={{ ...th, textAlign: "left" }}>#</th>
                <th style={{ ...th, textAlign: "left" }}>Ambassador</th>
                <th style={{ ...th, textAlign: "right" }}>Q / total</th>
                <th style={{ ...th, textAlign: "right", borderLeft: grpBorder }}>Own</th>
                <th style={{ ...th, textAlign: "right" }}>Referred</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                <th style={{ ...th, textAlign: "right" }}>USDC↔ETH</th>
                <th style={{ ...th, textAlign: "right" }}>Graduated</th>
                <th style={{ ...th, textAlign: "right" }}>Bonding</th>
                <th style={{ ...th, textAlign: "right", borderLeft: grpBorder }}>Posts</th>
                <th style={{ ...th, textAlign: "right" }}>Engagement</th>
                <th style={{ ...th, textAlign: "right" }}>/100</th>
                {hasPts ? (
                  <>
                    <th style={{ ...th, textAlign: "right", borderLeft: grpBorder }}>Vol pts</th>
                    <th style={{ ...th, textAlign: "right" }}>Total pts</th>
                    <th style={{ ...th, textAlign: "right" }}>Payout</th>
                  </>
                ) : (
                  <th style={{ ...th, textAlign: "right", borderLeft: grpBorder }}>Total</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.discordId}
                  style={{
                    borderBottom: `1px solid ${UI.border}55`,
                    opacity: hasPts && !r.eligible ? 0.55 : 1,
                  }}
                >
                  <td style={{ ...NUM, padding: "10px 12px", color: r.rank <= 3 ? UI.warn : UI.faint, fontWeight: 700 }}>
                    {r.rank}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Link
                      href={`/dash/${r.handle}`}
                      style={{ display: "flex", alignItems: "center", gap: 9, color: UI.text, textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}
                    >
                      <Avatar url={r.avatarUrl} name={r.displayName} size={28} />
                      <span>
                        {r.displayName}
                        {!r.hasWallet ? (
                          <span style={{ marginLeft: 7, fontSize: 10, color: UI.faint }}>no wallet</span>
                        ) : null}
                        {hasPts && !r.eligible ? (
                          <span style={{ marginLeft: 7, fontSize: 10, color: UI.warn }}>below $500 floor</span>
                        ) : null}
                        {r.notes.length > 0 ? (
                          <span title="partial data — see profile" style={{ marginLeft: 5, color: UI.warn }}>⚠</span>
                        ) : null}
                        {r.flags.length > 0 ? (
                          <span title={r.flags.map((f) => f.code).join(", ")} style={{ marginLeft: 5, color: UI.bad }}>⛳</span>
                        ) : null}
                      </span>
                    </Link>
                  </td>
                  <td style={td}>
                    <span style={{ fontWeight: 700, color: r.referralsQualified > 0 ? UI.good : UI.muted }}>
                      {r.referralsQualified}
                    </span>
                    <span style={{ color: UI.faint }}> / {r.referralsTotal}</span>
                  </td>
                  <td style={{ ...td, borderLeft: grpBorder, color: UI.muted }}>{fmtUsd(r.ownVolumeUsd)}</td>
                  <td style={{ ...td, color: UI.muted }}>{fmtUsd(r.referredVolumeUsd)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmtUsd(r.volumeUsd)}</td>
                  <td style={{ ...td, color: r.volUsdcEth > 0 ? UI.muted : UI.faint }}>
                    {r.volUsdcEth > 0 ? fmtUsd(r.volUsdcEth) : "—"}
                  </td>
                  <td style={{ ...td, color: UI.muted }}>{fmtUsd(r.volGraduated)}</td>
                  <td style={{ ...td, color: UI.muted }}>{fmtUsd(r.volBonding)}</td>
                  <td style={{ ...td, borderLeft: grpBorder }}>{fmtInt(r.postsTotal)}</td>
                  <td style={td}>{fmtInt(r.engagementTotal)}</td>
                  <td style={{ ...td, padding: "10px 12px" }}>
                    <ScorePill score={r.socialScore} />
                  </td>
                  {hasPts ? (
                    <>
                      <td style={{ ...td, borderLeft: grpBorder, color: UI.muted }}>
                        {fmtInt(Math.round(r.ptsVolume))}
                      </td>
                      <td
                        style={{ ...td, fontSize: 15, fontWeight: 800, color: UI.accent }}
                        title={`referral strength ${r.refStrength}/100 · social strength ${r.socialStrength}/100`}
                      >
                        {fmtInt(Math.round(r.ptsTotal))}
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: r.eligible && r.payoutUsd > 0 ? UI.good : UI.faint }}>
                        {r.eligible ? fmtUsd(r.payoutUsd) : "—"}
                      </td>
                    </>
                  ) : (
                    <td style={{ ...td, borderLeft: grpBorder, fontSize: 15, fontWeight: 800, color: UI.accent }}>
                      {r.totalScore.toFixed(1)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p style={{ color: UI.faint, fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
        Referrals are shown qualified / total — one qualifies once that wallet clears the volume
        and active-day bar. Volume splits by what was traded: USDC↔ETH (1×), graduated domain
        tokens (2×), bonding-curve tokens (3×). Cycle points and payouts follow the published
        scoring — see the <a href="/dash/rules" style={{ color: UI.accent }}>Rules tab</a> for
        the full math. All stats count the cohort window only (from Aug 20, 14:00 UTC). Dimmed rows are below the $500 own-volume floor. Click any
        name for the full breakdown. ⚠ marks partial data, ⛳ marks a review flag.
      </p>
    </PageShell>
  );
}
