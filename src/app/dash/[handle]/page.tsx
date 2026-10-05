/**
 * Ambassador profile — full breakdown for one ambassador. Same rules as the
 * board: precomputed snapshot only, no cookies()/headers(), 24h ISR + tag.
 * The whole tree is Basic-Auth gated in middleware, so team-only material
 * (bot-risk flags, referred-wallet detail) may render here.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBoardCached, getReferred, type BoardRow } from "@/lib/dash/data";
import { PageShell, Panel, Eyebrow, StatCard, ScorePill, Avatar, UI, NUM, fmtUsd, fmtInt } from "../_components/ui";

export const revalidate = 86400;

async function resolveRow(handle: string): Promise<{ row: BoardRow; date: string } | null> {
  const board = await getBoardCached();
  if (board.empty) return null;
  const row = board.rows.find((r) => r.handle === handle);
  return row ? { row, date: board.date } : null;
}

export async function generateMetadata({ params }: { params: { handle: string } }): Promise<Metadata> {
  const hit = await resolveRow(params.handle);
  return {
    title: hit ? `${hit.row.displayName} — Ambassador Profile` : "Ambassador Profile",
    robots: { index: false, follow: false },
  };
}

const FLAG_COPY: Record<string, string> = {
  burst_creation: "Several referrals were created on the same day — worth a look before rewards.",
  one_day_wallets: "A large share of referred wallets traded on only one day.",
  single_token: "Referred volume is concentrated in a single token.",
};

function VolRow({ label, total, usdcEth, graduated, bonding, strong }: {
  label: string; total: number; usdcEth: number; graduated: number; bonding: number; strong?: boolean;
}) {
  const cell = (v: number): React.CSSProperties => ({
    ...NUM, textAlign: "right", padding: "9px 14px", fontWeight: strong ? 800 : 500,
    color: strong ? UI.text : UI.muted,
  });
  return (
    <tr style={{ borderBottom: `1px solid ${UI.border}44` }}>
      <td style={{ padding: "9px 14px", color: strong ? UI.text : UI.muted, fontWeight: strong ? 700 : 500 }}>{label}</td>
      <td style={cell(usdcEth)}>{usdcEth > 0 ? fmtUsd(usdcEth) : <span style={{ color: UI.faint }}>$0 — not yet tracked</span>}</td>
      <td style={cell(graduated)}>{fmtUsd(graduated)}</td>
      <td style={cell(bonding)}>{fmtUsd(bonding)}</td>
      <td style={{ ...cell(total), color: strong ? UI.accent : UI.muted }}>{fmtUsd(total)}</td>
    </tr>
  );
}

export default async function AmbassadorProfile({ params }: { params: { handle: string } }) {
  const hit = await resolveRow(params.handle);
  if (!hit) notFound();
  const { row: r, date } = hit;
  const referred = await getReferred(r.discordId, date);

  return (
    <PageShell wide>
      <p style={{ margin: "0 0 16px" }}>
        <Link href="/dash" style={{ color: UI.faint, textDecoration: "none", fontSize: 13 }}>← Board</Link>
      </p>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <Avatar url={r.avatarUrl} name={r.displayName} size={56} />
        <div>
          <Eyebrow>Ambassador · rank #{r.rank} · snapshot {date}</Eyebrow>
          <h1 style={{ margin: 0, fontSize: 28 }}>
            {r.displayName}
            <span style={{ color: UI.faint, fontSize: 14, marginLeft: 10 }}>@{r.username}</span>
          </h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "18px 0 26px" }}>
        <StatCard label="Total score" value={r.totalScore.toFixed(1)} sub="of 100" />
        <StatCard label="Volume score" value={r.volumeScore.toFixed(1)} sub="50% weight" />
        <StatCard label="Referral score" value={r.referralScore.toFixed(1)} sub="30% weight" />
        <StatCard label="Social score" value={r.socialScore.toFixed(1)} sub="20% weight" />
      </div>

      {/* flags — team-only material, fine behind the gate */}
      {r.flags.length > 0 ? (
        <Panel style={{ borderColor: `${UI.bad}55`, marginBottom: 22 }}>
          <strong style={{ color: UI.bad }}>Review flags</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: UI.muted, fontSize: 13.5 }}>
            {r.flags.map((f, i) => (
              <li key={i}>
                <code style={{ color: UI.text }}>{f.code}</code> — {FLAG_COPY[f.code] || "see detail"}{" "}
                {f.detail ? <span style={{ color: UI.faint }}>{JSON.stringify(f.detail)}</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {r.notes.length > 0 ? (
        <Panel style={{ borderColor: `${UI.warn}55`, marginBottom: 22 }}>
          <strong style={{ color: UI.warn }}>Partial data</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: UI.muted, fontSize: 13 }}>
            {r.notes.map((n, i) => (
              <li key={i}><code>{n.scope}</code>: {n.note}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* volume */}
      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Volume</h2>
      <Panel style={{ padding: 0, overflow: "hidden", marginBottom: 26 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${UI.border}` }}>
                {["", "USDC ↔ ETH", "Graduated tokens", "Bonding tokens", "Total"].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "10px 14px", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: UI.faint }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Own/referred splits come straight from the snapshot now — the
                  old subtract-referred-from-combined trick was only exact while
                  every referred row was present. */}
              <VolRow label={`Own wallet (${r.hasWallet ? r.walletShort : "not linked"})`}
                total={r.ownVolumeUsd}
                usdcEth={r.ownUsdcEth} graduated={r.ownGraduated} bonding={r.ownBonding} />
              <VolRow label={`Referred wallets (${r.referralsTotal})`}
                total={r.referredVolumeUsd}
                usdcEth={r.refUsdcEth} graduated={r.refGraduated} bonding={r.refBonding} />
              <VolRow label="Combined" strong
                total={r.volumeUsd} usdcEth={r.volUsdcEth} graduated={r.volGraduated} bonding={r.volBonding} />
            </tbody>
          </table>
        </div>
      </Panel>

      {/* social */}
      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Social</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 12, marginBottom: 14 }}>
        <StatCard label="Total posts" value={fmtInt(r.postsTotal)} sub="credited" />
        <StatCard label="Likes" value={fmtInt(r.likesTotal)} />
        <StatCard label="Reposts" value={fmtInt(r.retweetsTotal)} />
        <StatCard label="Replies" value={fmtInt(r.repliesTotal)} />
        <StatCard label="Views" value={r.viewsTotal ? fmtInt(r.viewsTotal) : "—"} sub={r.viewsTotal ? undefined : "not reported"} />
        <StatCard label="Total engagement" value={fmtInt(r.engagementTotal)} sub="likes + reposts + replies" />
        <StatCard label="Messages (30d)" value={`${r.messagesApprox ? "≈ " : ""}${fmtInt(r.messages30d)}`}
          sub={r.messagesApprox ? "by username until ID data matures" : "exact"} />
      </div>

      {r.topPosts.length > 0 ? (
        <Panel style={{ padding: 0, overflow: "hidden", marginBottom: 26 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${UI.border}` }}>
                  {["Top posts by engagement", "Likes", "Reposts", "Replies", "Views", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "10px 14px", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: UI.faint }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.topPosts.map((p, i) => (
                  <tr key={p.tweetId || i} style={{ borderBottom: `1px solid ${UI.border}44` }}>
                    <td style={{ padding: "9px 14px", color: UI.muted }}>
                      {i + 1}. {p.author ? `@${p.author}` : "post"}{" "}
                      <span style={{ color: UI.faint, fontSize: 11 }}>({p.season})</span>
                    </td>
                    <td style={{ ...NUM, textAlign: "right", padding: "9px 14px" }}>{fmtInt(p.likes)}</td>
                    <td style={{ ...NUM, textAlign: "right", padding: "9px 14px" }}>{fmtInt(p.retweets)}</td>
                    <td style={{ ...NUM, textAlign: "right", padding: "9px 14px" }}>{fmtInt(p.replies)}</td>
                    <td style={{ ...NUM, textAlign: "right", padding: "9px 14px" }}>{p.views ? fmtInt(p.views) : "—"}</td>
                    <td style={{ textAlign: "right", padding: "9px 14px" }}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: UI.accent, textDecoration: "none", fontSize: 12 }}>
                          open ↗
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel style={{ marginBottom: 26, color: UI.muted, fontSize: 13.5 }}>No credited posts yet.</Panel>
      )}

      {/* referrals */}
      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>
        Referrals{" "}
        <span style={{ ...NUM, fontSize: 14, color: UI.muted }}>
          {r.referralsQualified} qualified / {r.referralsTotal} total
        </span>
      </h2>
      {referred.length > 0 ? (
        <Panel style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${UI.border}` }}>
                  {["Wallet", "Source", "Referred", "Volume", "Active days", "Qualified"].map((h, i) => (
                    <th key={h} style={{ textAlign: i >= 3 ? "right" : "left", padding: "10px 14px", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: UI.faint }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referred.map((w, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${UI.border}44` }}>
                    <td style={{ ...NUM, padding: "9px 14px" }}>{w.walletShort}{w.note ? <span title={w.note} style={{ color: UI.warn }}> ⚠</span> : null}</td>
                    <td style={{ padding: "9px 14px", color: UI.faint }}>{w.source}</td>
                    <td style={{ padding: "9px 14px", color: UI.faint }}>{w.referredAt || "—"}</td>
                    <td style={{ ...NUM, textAlign: "right", padding: "9px 14px" }}>{fmtUsd(w.volumeUsd)}</td>
                    <td style={{ ...NUM, textAlign: "right", padding: "9px 14px" }}>{w.activeDays}</td>
                    <td style={{ textAlign: "right", padding: "9px 14px", color: w.qualified ? UI.good : UI.faint, fontWeight: 700 }}>
                      {w.qualified ? "✓" : "✗"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel style={{ color: UI.muted, fontSize: 13.5 }}>No referrals recorded.</Panel>
      )}
    </PageShell>
  );
}
