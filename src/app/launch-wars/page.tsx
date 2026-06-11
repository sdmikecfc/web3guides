/**
 * Launch Wars — public page (data-first redesign, 2026-06-11).
 *
 *   /launch-wars
 *
 * Design language: "EPL meets Bloomberg" — the live game state (league table,
 * boss board, bounties) leads; the explainer follows, compressed. One
 * typographic system, tabular numerals for every figure, hairline rules,
 * status chips instead of emoji headings, restrained color on a dark ground.
 *
 * Engineering: server component only (no client JS), inline styles, all data
 * read-only. The referral flow (?ref → InviteBanner; lw_ref cookie set by
 * middleware does attribution at wallet-link time) is preserved unchanged.
 * Boss data degrades gracefully — any error renders no boss content.
 *
 * Copy is written at a 6th-grade reading level with short declarative
 * sentences, no idioms, and no contractions — translation-friendly.
 */

import { launchWarsDb } from "@/lib/launch-wars/supabase";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 60;

// Rich link previews — when /launch-wars is shared on X / Telegram / Discord it
// unfurls as a 1200×630 card. The image is the live season's standings graphic
// (falls back to the site OG image when no season exists).
export async function generateMetadata(): Promise<Metadata> {
  const base = "https://web3guides.com";
  let ogImage = `${base}/api/og`;
  try {
    const db = launchWarsDb();
    const { data } = await db
      .from("launch_wars_seasons")
      .select("id")
      .eq("is_test", false)
      .order("id", { ascending: false })
      .limit(1);
    if (data?.[0]?.id) ogImage = `${base}/api/launch-wars/og/${data[0].id}/standings`;
  } catch {
    // ignore — fall back to the generic site OG image
  }
  const title = "Launch Wars — Doma community team game";
  const description =
    "Pick a team. Hold a premium domain. Earn points by holding, buying, and posting on X. If your team wins, you share the prize. New seasons every two weeks on Doma.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${base}/launch-wars`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: "Launch Wars standings" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

// ── Design tokens ────────────────────────────────────────────────────────
const T = {
  bg:     "#0a0d14",
  panel:  "#10141d",
  panel2: "#0c1018",
  line:   "rgba(255,255,255,0.07)",
  line2:  "rgba(255,255,255,0.14)",
  text:   "#e9edf5",
  mut:    "#97a0b5",
  dim:    "#626b82",
  violet: "#8b7cff",
  green:  "#34d399",
  rose:   "#fb6f84",
  amber:  "#fbbf24",
  cyan:   "#38bdf8",
};
const MAXW = 1140;
const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace";
const NUM: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

// ── Types ────────────────────────────────────────────────────────────────
interface Season {
  id: number;
  number: number;
  status: string;
  prize_pool_usd: number;
  starts_at: string | null;
  ends_at: string | null;
  planned_settlement_at: string | null;
  settled_at: string | null;
  winner_team_id: number | null;
}

interface Team {
  id: number;
  season_id: number;
  slot: number;
  domain_name: string;
  card_image_url: string | null;
  card_level: number;
  milestone_score: number;
  bonded_at: string | null;
  bought_out_at: string | null;
}

// World Bosses (co-op add-on; separate launch_wars_boss* tables, read-only here).
// Statuses are lowercase in the bot's schema: pending | live | defeated | failed.
interface Boss {
  id: number;
  domain_name: string;
  status: string;
  bounty_usd: number | null;
  launch_at: string | null;
  bond_deadline_at: string | null;
  defeated_at: string | null;
  art_full_url: string | null;
  art_half_url: string | null;
  art_critical_url: string | null;
  art_defeated_url: string | null;
  art_failed_url: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZone: "UTC", timeZoneName: "short",
    });
  } catch { return iso; }
}

function seasonChip(status: string): { label: string; color: string } {
  switch (status) {
    case "UPCOMING":  return { label: "PRE-SEASON", color: T.amber };
    case "ACTIVE":    return { label: "LIVE",       color: T.green };
    case "SETTLING":  return { label: "SETTLING",   color: T.amber };
    case "COMPLETE":  return { label: "COMPLETE",   color: T.dim   };
    case "CANCELLED": return { label: "CANCELLED",  color: T.rose  };
    default:          return { label: status,       color: T.dim   };
  }
}

function bossChip(status: string): { label: string; color: string } {
  switch (status) {
    case "live":     return { label: "LIVE",     color: T.rose  };
    case "defeated": return { label: "DEFEATED", color: T.green };
    case "failed":   return { label: "GOT AWAY", color: T.dim   };
    default:         return { label: "SOON",     color: T.amber };
  }
}

function bossBounty(b: Boss): number {
  return Math.round(Number(b.bounty_usd) || 0);
}

// ── Page ─────────────────────────────────────────────────────────────────
export default async function LaunchWarsPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const db = launchWarsDb();

  // Referral invite context — when a ?ref=CODE is present, resolve the
  // inviter's display name (best-effort) so a cold visitor gets a warm,
  // specific greeting. The lw_ref cookie (set by middleware) does the actual
  // attribution at wallet-link time; this is purely the welcome.
  const refCode =
    typeof searchParams?.ref === "string" ? searchParams.ref.toUpperCase() : null;
  let inviterName: string | null = null;
  if (refCode) {
    try {
      const { data: codeRow } = await db
        .from("launch_wars_referral_codes")
        .select("discord_id")
        .eq("code", refCode)
        .maybeSingle();
      if (codeRow?.discord_id) {
        const { data: lw } = await db
          .from("linked_wallets")
          .select("display_name")
          .eq("discord_id", codeRow.discord_id)
          .maybeSingle();
        inviterName = lw?.display_name || null;
      }
    } catch {
      // referrals not enabled — fall back to a generic invite banner
    }
  }

  // Latest non-test season (test seasons hidden from public)
  const { data: seasons } = await db
    .from("launch_wars_seasons")
    .select("*")
    .eq("is_test", false)
    .order("id", { ascending: false })
    .limit(1);
  const season: Season | null = seasons?.[0] ?? null;

  let teams: Team[] = [];
  const memberCounts = new Map<number, number>();
  if (season) {
    const { data: teamRows } = await db
      .from("launch_wars_teams")
      .select("*")
      .eq("season_id", season.id)
      .order("slot", { ascending: true });
    teams = teamRows ?? [];

    for (const t of teams) {
      const { count } = await db
        .from("launch_wars_members")
        .select("*", { count: "exact", head: true })
        .eq("team_id", t.id)
        .is("left_at", null);
      memberCounts.set(t.id, count ?? 0);
    }
  }

  // World Bosses — read-only, independent of the season/referral queries.
  // Degrades gracefully: any error renders no boss content at all.
  let bosses: Boss[] = [];
  const bossHp = new Map<number, number>();
  try {
    const { data: bossRows } = await db
      .from("launch_wars_bosses")
      .select("id, domain_name, status, bounty_usd, launch_at, bond_deadline_at, defeated_at, art_full_url, art_half_url, art_critical_url, art_defeated_url, art_failed_url")
      .order("display_order", { ascending: true });
    bosses = (bossRows ?? []) as Boss[];
    for (const b of bosses) {
      if (b.status !== "live") continue;
      const { data: snap } = await db
        .from("launch_wars_boss_snapshots")
        .select("hp_pct")
        .eq("boss_id", b.id)
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snap?.hp_pct != null) bossHp.set(b.id, Number(snap.hp_pct));
    }
  } catch {
    bosses = [];
  }
  const bossesAlive = bosses.some((b) => b.status === "live" || b.status === "pending");

  return (
    <main style={{
      minHeight: "100vh",
      background: T.bg,
      color: T.text,
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <Masthead />
      <InviteBanner show={!!refCode} inviterName={inviterName} />
      <Intro season={season} bossesAlive={bossesAlive} />
      <LiveBoard season={season} teams={teams} memberCounts={memberCounts}
        bosses={bosses} bossHp={bossHp} bossesAlive={bossesAlive} />
      <ResultsBand />
      <PrizePools />
      <BonusMatrix />
      <SellRules />
      <HowItWorks />
      <HowToBuy />
      <ArtShowcase teams={teams} bosses={bosses} />
      {(season?.status === "ACTIVE" || bossesAlive) && <CommandsPanel showBosses={bosses.length > 0} />}
      <FAQPanel />
      <FooterBar />
    </main>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────
function Section({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section id={id} style={{
      maxWidth: MAXW, margin: "0 auto", padding: "40px 24px 8px",
    }}>
      {children}
    </section>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: 2.5, color: T.dim, fontWeight: 700,
      textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 22, fontWeight: 700, color: T.text, margin: "6px 0 0",
      letterSpacing: -0.3,
    }}>
      {children}
    </h2>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14.5, color: T.mut, margin: "8px 0 0", lineHeight: 1.6, maxWidth: 760 }}>
      {children}
    </p>
  );
}

function Panel({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: T.panel,
      border: `1px solid ${accent ? `${accent}44` : T.line}`,
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5,
      color, background: `${color}1a`, border: `1px solid ${color}55`,
      borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap",
      textTransform: "uppercase",
    }}>
      {label}
    </span>
  );
}

const TH: React.CSSProperties = {
  textAlign: "left", padding: "10px 14px",
  fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase",
  color: T.dim, fontWeight: 700, borderBottom: `1px solid ${T.line2}`,
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "12px 14px", fontSize: 14, color: T.text,
  borderBottom: `1px solid ${T.line}`, verticalAlign: "middle",
};

// ── Masthead ─────────────────────────────────────────────────────────────
function Masthead() {
  return (
    <div style={{ borderBottom: `1px solid ${T.line}` }}>
      <div style={{
        maxWidth: MAXW, margin: "0 auto", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: T.text }}>
          DOMA <span style={{ color: T.dim }}>·</span> <span style={{ color: T.violet }}>LAUNCH WARS</span>
        </div>
        <a href="https://discord.gg/doma" style={{
          padding: "8px 16px", borderRadius: 6, background: T.violet,
          color: "#0b0820", fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>
          Join in Discord
        </a>
      </div>
    </div>
  );
}

// ── Referral invite banner (logic unchanged — restyled) ──────────────────
function InviteBanner({ show, inviterName }: { show: boolean; inviterName: string | null }) {
  if (!show) return null;
  return (
    <div style={{ maxWidth: MAXW, margin: "0 auto", padding: "20px 24px 0" }}>
      <Panel accent={T.green}>
        <div style={{
          padding: "16px 20px", display: "flex", flexWrap: "wrap",
          alignItems: "center", justifyContent: "space-between", gap: 14,
        }}>
          <div style={{ minWidth: 0, flex: "1 1 420px" }}>
            <Chip label={inviterName ? `${inviterName} invited you` : "You have an invite"} color={T.green} />
            <div style={{ fontSize: 14.5, color: T.text, marginTop: 10, lineHeight: 1.55 }}>
              Three steps in: join the Doma Discord, run{" "}
              <code style={{ fontFamily: MONO, color: T.amber }}>!wallet link</code> and sign (no gas),
              then run <code style={{ fontFamily: MONO, color: T.amber }}>!launchwars join</code> and pick
              a team. Your inviter gets credit automatically when you link — no code to type.
            </div>
          </div>
          <a href="https://discord.gg/doma" style={{
            padding: "10px 18px", borderRadius: 6, background: T.green,
            color: "#04240f", fontSize: 13.5, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap",
          }}>
            Join the Doma Discord →
          </a>
        </div>
      </Panel>
    </div>
  );
}

// ── Intro ────────────────────────────────────────────────────────────────
function Intro({ season, bossesAlive }: { season: Season | null; bossesAlive: boolean }) {
  const chip = season ? seasonChip(season.status) : { label: "NEXT SEASON SOON", color: T.amber };
  return (
    <Section>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 14 }}>
        <h1 style={{ fontSize: "clamp(30px, 4.5vw, 44px)", fontWeight: 800, margin: 0, letterSpacing: -1 }}>
          Launch Wars
        </h1>
        <Chip label={chip.label} color={chip.color} />
        {bossesAlive && <Chip label="World Bosses live" color={T.rose} />}
      </div>
      <p style={{ fontSize: 16, color: T.mut, margin: "10px 0 0", lineHeight: 1.6, maxWidth: 720 }}>
        A community game on Doma premium domains. Teams race to bond their domain and split the
        cash. World Bosses are co-op: the whole server hunts the same domain for a bounty.
        Hold to earn. Selling early always costs you.
      </p>
    </Section>
  );
}

// ── Live board: league table + boss board ────────────────────────────────
function LiveBoard({ season, teams, memberCounts, bosses, bossHp, bossesAlive }: {
  season: Season | null;
  teams: Team[];
  memberCounts: Map<number, number>;
  bosses: Boss[];
  bossHp: Map<number, number>;
  bossesAlive: boolean;
}) {
  const ranked = [...teams].sort((a, b) => b.milestone_score - a.milestone_score);
  const winnerId = season?.winner_team_id ?? null;
  return (
    <Section id="board">
      <div style={{
        display: "grid", gap: 18, marginTop: 8,
        gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
      }}>
        {/* Season league table */}
        <Panel>
          <div style={{
            padding: "14px 16px", display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${T.line2}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>
                {season ? `Season ${season.number}` : "Between seasons"}
              </span>
              {season && <Chip {...seasonChip(season.status)} label={seasonChip(season.status).label} color={seasonChip(season.status).color} />}
            </div>
            <div style={{ fontSize: 12.5, color: T.mut, ...NUM }}>
              {season ? <>ends {fmtDate(season.ends_at)} · ${season.prize_pool_usd}</> : "watch Discord for the next one"}
            </div>
          </div>
          {season ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, width: 34 }}>#</th>
                    <th style={TH}>Team</th>
                    <th style={{ ...TH, textAlign: "right" }}>Pts</th>
                    <th style={{ ...TH, textAlign: "right" }}>Members</th>
                    <th style={{ ...TH, textAlign: "right" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((t, i) => (
                    <tr key={t.id} style={{ background: t.id === winnerId ? `${T.green}0d` : "transparent" }}>
                      <td style={{ ...TD, ...NUM, color: T.dim }}>{i + 1}</td>
                      <td style={{ ...TD, fontWeight: 600, wordBreak: "break-all" }}>
                        {t.domain_name}
                        {t.id === winnerId && <span style={{ marginLeft: 8 }}><Chip label="WINNER" color={T.green} /></span>}
                      </td>
                      <td style={{ ...TD, ...NUM, textAlign: "right", fontWeight: 700 }}>{t.milestone_score}</td>
                      <td style={{ ...TD, ...NUM, textAlign: "right", color: T.mut }}>{memberCounts.get(t.id) ?? 0}</td>
                      <td style={{ ...TD, textAlign: "right" }}>
                        {t.bonded_at ? <Chip label="BONDED" color={T.green} />
                          : t.bought_out_at ? <Chip label="BOUGHT OUT" color={T.violet} />
                          : <Chip label="RACING" color={T.amber} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "18px 16px", fontSize: 14, color: T.mut, lineHeight: 1.6 }}>
              {bossesAlive
                ? "The team season is over, but the World Boss fight is not. See the boss board. You can still earn."
                : "Launch Wars runs every two weeks: 2 to 5 premium domains, a $400 prize, 14 days. Join the Doma Discord and watch #mini-games for the next season."}
            </div>
          )}
          {season && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: T.dim, borderTop: `1px solid ${T.line}` }}>
              Live data from the bot · updates every minute · a team must bond to win
            </div>
          )}
        </Panel>

        {/* World Boss board */}
        {bosses.length > 0 && (
          <Panel accent={T.rose}>
            <div style={{
              padding: "14px 16px", display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${T.line2}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>World Bosses</span>
                <Chip label="CO-OP" color={T.rose} />
              </div>
              <div style={{ fontSize: 12.5, color: T.mut, ...NUM }}>
                ${bosses.reduce((s, b) => s + bossBounty(b), 0)} in bounties
              </div>
            </div>
            <div>
              {bosses.filter((b) => b.status !== "failed").map((b) => {
                const chip = bossChip(b.status);
                const hp = b.status === "defeated" ? 0 : (bossHp.get(b.id) ?? 100);
                return (
                  <div key={b.id} style={{
                    padding: "13px 16px", borderBottom: `1px solid ${T.line}`,
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  }}>
                    <div style={{ width: 88 }}><Chip label={chip.label} color={chip.color} /></div>
                    <div style={{ flex: "1 1 140px", fontWeight: 600, fontSize: 14, wordBreak: "break-all" }}>
                      {b.domain_name}
                    </div>
                    {(b.status === "live" || b.status === "defeated") && (
                      <div style={{ flex: "1 1 120px", minWidth: 110 }}>
                        <div style={{
                          height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${Math.max(0, Math.min(100, hp))}%`, height: "100%", background: T.rose,
                          }} />
                        </div>
                        <div style={{ fontSize: 11, color: T.dim, marginTop: 4, ...NUM }}>
                          {Math.round(hp)}% HP {b.status === "live" && b.bond_deadline_at ? `· bonds by ${fmtDate(b.bond_deadline_at)}` : ""}
                        </div>
                      </div>
                    )}
                    {b.status === "pending" && (
                      <div style={{ flex: "1 1 120px", fontSize: 12.5, color: T.dim }}>
                        launches soon · watch Discord
                      </div>
                    )}
                    <div style={{ width: 78, textAlign: "right", fontWeight: 800, color: T.amber, ...NUM }}>
                      {bossBounty(b) > 0 ? `$${bossBounty(b)}` : "—"}
                    </div>
                    {b.status === "live" && (
                      <a href={`https://app.doma.xyz/domain/${b.domain_name}`} style={{
                        padding: "7px 12px", borderRadius: 6, background: T.rose,
                        color: "#2a0a12", fontSize: 12.5, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap",
                      }}>
                        Fight →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "10px 16px", fontSize: 12, color: T.dim }}>
              Health drains as the bonding curve fills · $10 minimum to qualify for a bounty ·{" "}
              <code style={{ fontFamily: MONO, color: T.mut }}>!bosses me</code> DMs your private tally
            </div>
          </Panel>
        )}
      </div>
    </Section>
  );
}

// ── Week-1 results band (static social proof) ────────────────────────────
function ResultsBand() {
  const stats = [
    { v: "$639",    l: "community buys in week one" },
    { v: "+$8,607", l: "domain value growth" },
    { v: "155h",    l: "average hold time" },
    { v: "0",       l: "charts crashed after bonding" },
  ];
  return (
    <Section>
      <Panel>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        }}>
          {stats.map((s, i) => (
            <div key={s.l} style={{
              padding: "16px 18px",
              borderLeft: i === 0 ? "none" : `1px solid ${T.line}`,
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, ...NUM }}>{s.v}</div>
              <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 18px 10px", fontSize: 11.5, color: T.dim, borderTop: `1px solid ${T.line}` }}>
          Season 1, first week. Real numbers: holders were paid to hold, so the charts held.
        </div>
      </Panel>
    </Section>
  );
}

// ── Prize pools ──────────────────────────────────────────────────────────
function PrizePools() {
  const pools = [
    {
      value: "$400", color: T.green, title: "Team season cash",
      body: "The bonded team with the most points wins. Every active player on it splits the $400 by how much they helped. Even a five dollar player earns a fair slice.",
    },
    {
      value: "50,000", color: T.violet, title: "Doma points for top buyers",
      body: "On the first AND second place teams, the biggest buyers split 50,000 official Doma leaderboard points, shared by how much each one bought.",
    },
    {
      value: "$1,000", color: T.rose, title: "World Boss bounties",
      body: "Each boss carries its own bounty. Bond it before its deadline and the bounty pays everyone who dealt damage, split by share. $10 minimum to qualify.",
    },
  ];
  return (
    <Section>
      <Kicker>Rewards</Kicker>
      <H2>Three prize pools, one payday</H2>
      <div style={{
        display: "grid", gap: 18, marginTop: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      }}>
        {pools.map((p) => (
          <Panel key={p.title} accent={p.color}>
            <div style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: p.color, ...NUM }}>{p.value}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{p.title}</div>
              <p style={{ fontSize: 13.5, color: T.mut, lineHeight: 1.6, margin: "8px 0 0" }}>{p.body}</p>
            </div>
          </Panel>
        ))}
      </div>
      <p style={{ fontSize: 13.5, color: T.mut, marginTop: 14, lineHeight: 1.6 }}>
        <b style={{ color: T.amber }}>One payday.</b> Everything pays together: the team cash and
        every boss bounty, about one week after the whole event ends. The bot sends each winner a
        private message with the full breakdown, and the prize goes to your linked wallet.
      </p>
    </Section>
  );
}

// ── Bonus matrix — every multiplier and minimum in one table ─────────────
function BonusMatrix() {
  const rows = [
    { what: "Founder bonus",   who: "Join a team in its first 72 hours",            effect: "×1.25 on all your season points" },
    { what: "Loyalty bonus",   who: "Launch Wars team members fighting bosses",      effect: "+15% on your boss rewards (keep your $5+ team hold)" },
    { what: "Referral bonus",  who: "Invite a friend with your link",                effect: "You earn 10% of the points your invitees score" },
    { what: "Team minimum",    who: "Everyone on a team",                            effect: "$5 minimum buy to earn team rewards" },
    { what: "Boss minimum",    who: "Everyone fighting a boss",                      effect: "$10 minimum in a boss to share its bounty" },
    { what: "Buy cap",         who: "Anti-whale rule",                               effect: "Buy points cap at $50, so holding and posting matter more" },
    { what: "Post limits",     who: "Content creators",                              effect: "1 credited post per day, up to 550 points each, 2,500 per season" },
  ];
  return (
    <Section>
      <Kicker>The rules that change your earnings</Kicker>
      <H2>Every bonus, minimum, and cap</H2>
      <Sub>One table. If a number changes what you earn, it is here.</Sub>
      <div style={{ marginTop: 18 }}>
        <Panel>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Rule</th>
                  <th style={TH}>Who it applies to</th>
                  <th style={TH}>Effect</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.what}>
                    <td style={{ ...TD, fontWeight: 700, whiteSpace: "nowrap" }}>{r.what}</td>
                    <td style={{ ...TD, color: T.mut }}>{r.who}</td>
                    <td style={TD}>{r.effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

// ── When is my money free ────────────────────────────────────────────────
function SellRules() {
  const rows = [
    {
      what: "Your team tokens", when: "Free when the season ends",
      note: "Hold your $5+ position to the end of the season to keep your team rewards. After the season ends, selling changes nothing.",
    },
    {
      what: "Your boss tokens", when: "Free when the event ends",
      note: "Hold every boss token until the event ends. Selling early can shrink your share of its bounty. Holding never hurts you. When the event ends, the bot announces that everything is free.",
    },
    {
      what: "The money", when: "One payday, about a week after the event ends",
      note: "Team cash and every boss bounty pay together. The bot DMs your breakdown; the operator sends funds to your linked wallet.",
    },
  ];
  return (
    <Section>
      <Kicker>Holding and selling</Kicker>
      <H2>When is my money free?</H2>
      <div style={{
        display: "grid", gap: 18, marginTop: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      }}>
        {rows.map((r) => (
          <Panel key={r.what}>
            <div style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: T.dim, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
                {r.what}
              </div>
              <div style={{ fontSize: 16.5, fontWeight: 700, marginTop: 6, color: T.amber }}>{r.when}</div>
              <p style={{ fontSize: 13.5, color: T.mut, lineHeight: 1.6, margin: "8px 0 0" }}>{r.note}</p>
            </div>
          </Panel>
        ))}
      </div>
    </Section>
  );
}

// ── How it works — two tracks side by side ───────────────────────────────
function HowItWorks() {
  const lw = [
    "Pick a team (each team is a premium domain) and buy at least $5 of its token.",
    "Hold it. Holding earns points every day and is the biggest source of points. Post on X for more.",
    "Your team must bond its domain to win. The winning team splits the cash by contribution.",
  ];
  const boss = [
    "Buy and hold at least $10 of a live boss token. Your damage is the net dollars you put in.",
    "The community fills the bonding curve together. Bond it before its 7-day deadline to defeat it.",
    "The bounty pays everyone who dealt damage, split by share. No team needed. Anyone can fight.",
  ];
  return (
    <Section id="how">
      <Kicker>How it works</Kicker>
      <H2>Two ways to play, one wallet</H2>
      <div style={{
        display: "grid", gap: 18, marginTop: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
      }}>
        <Panel accent={T.violet}>
          <div style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Chip label="TEAM SEASON" color={T.violet} />
              <span style={{ fontSize: 12.5, color: T.dim }}>compete</span>
            </div>
            <ol style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
              {lw.map((s, i) => (
                <li key={i} style={{ display: "flex", gap: 12, padding: "8px 0", fontSize: 14, color: T.mut, lineHeight: 1.55 }}>
                  <span style={{ ...NUM, color: T.violet, fontWeight: 800 }}>{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
        <Panel accent={T.rose}>
          <div style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Chip label="WORLD BOSSES" color={T.rose} />
              <span style={{ fontSize: 12.5, color: T.dim }}>co-op</span>
            </div>
            <ol style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
              {boss.map((s, i) => (
                <li key={i} style={{ display: "flex", gap: 12, padding: "8px 0", fontSize: 14, color: T.mut, lineHeight: 1.55 }}>
                  <span style={{ ...NUM, color: T.rose, fontWeight: 800 }}>{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

// ── How to buy ───────────────────────────────────────────────────────────
function HowToBuy() {
  const steps = [
    { t: "Open the domain page", b: "Tap the buy link the bot gives you, or open app.doma.xyz and search the domain." },
    { t: "Connect your wallet", b: "Use the same wallet you linked in Discord. Connecting is free and moves nothing." },
    { t: "Buy any amount", b: "Five dollars works for teams, ten for bosses. Type the amount and confirm." },
    { t: "Hold it", b: "That is all. Holding is what earns. Selling early always costs you." },
  ];
  return (
    <Section id="how-to-buy">
      <Kicker>The one step outside Discord</Kicker>
      <H2>How to buy a token</H2>
      <div style={{ marginTop: 18 }}>
        <Panel>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          }}>
            {steps.map((s, i) => (
              <div key={s.t} style={{
                padding: "18px 20px",
                borderLeft: i === 0 ? "none" : `1px solid ${T.line}`,
              }}>
                <div style={{ ...NUM, fontSize: 13, color: T.violet, fontWeight: 800 }}>{i + 1}</div>
                <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 6 }}>{s.t}</div>
                <p style={{ fontSize: 13, color: T.mut, lineHeight: 1.55, margin: "6px 0 0" }}>{s.b}</p>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 20px", fontSize: 12.5, color: T.dim, borderTop: `1px solid ${T.line}` }}>
            In Discord, <code style={{ fontFamily: MONO, color: T.mut }}>!launchwars buy</code> sends
            you the direct buy link for your team any time.
          </div>
        </Panel>
      </div>
    </Section>
  );
}

// ── Art showcase — boss stage strips + team legendary wall ───────────────
function ArtShowcase({ teams, bosses }: { teams: Team[]; bosses: Boss[] }) {
  const bossStrips = bosses
    .map((b) => ({
      boss: b,
      stages: [
        { label: "FULL",     url: b.art_full_url },
        { label: "BLOODIED", url: b.art_half_url },
        { label: "CRITICAL", url: b.art_critical_url },
        { label: "DEFEATED", url: b.art_defeated_url },
        { label: "GOT AWAY", url: b.art_failed_url },
      ].filter((s) => !!s.url),
    }))
    .filter((x) => x.stages.length >= 2);
  const cardTeams = teams.filter((t) => t.card_image_url);
  if (!bossStrips.length && !cardTeams.length) return null;

  return (
    <Section>
      <Kicker>Living artwork</Kicker>
      <H2>The art evolves with the fight</H2>
      <Sub>
        Every team card levels up as the team earns, and a team that bonds goes legendary.
        Every boss has battle-damage stages that track its real health bar.
      </Sub>

      {bossStrips.length > 0 && (
        <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
          {bossStrips.map(({ boss, stages }) => (
            <Panel key={boss.id}>
              <div style={{
                padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
                borderBottom: `1px solid ${T.line}`,
              }}>
                <Chip {...bossChip(boss.status)} label={bossChip(boss.status).label} color={bossChip(boss.status).color} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{boss.domain_name}</span>
              </div>
              <div style={{
                display: "grid", gap: 0,
                gridTemplateColumns: `repeat(${stages.length}, minmax(120px, 1fr))`,
                overflowX: "auto",
              }}>
                {stages.map((s, i) => (
                  <div key={s.label} style={{ borderLeft: i === 0 ? "none" : `1px solid ${T.line}` }}>
                    <div style={{
                      aspectRatio: "1 / 1",
                      background: `url(${s.url}) center/cover`,
                    }} />
                    <div style={{
                      padding: "7px 10px", fontSize: 10.5, letterSpacing: 1.5,
                      color: T.dim, fontWeight: 700, textAlign: "center",
                    }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {cardTeams.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Panel>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", gap: 10, alignItems: "center" }}>
              <Chip label="SEASON 1 TEAMS" color={T.violet} />
              <span style={{ fontSize: 12.5, color: T.dim }}>
                card levels: L1 → L2 → L3 → BONDED legendary (a team that never bonds gets a death card)
              </span>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            }}>
              {cardTeams.map((t, i) => (
                <div key={t.id} style={{ borderLeft: i === 0 ? "none" : `1px solid ${T.line}` }}>
                  <div style={{ aspectRatio: "1 / 1", background: `url(${t.card_image_url}) center/cover` }} />
                  <div style={{ padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, wordBreak: "break-all" }}>{t.domain_name}</div>
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 2, ...NUM }}>
                      {t.milestone_score} pts{t.bonded_at ? " · bonded" : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </Section>
  );
}

// ── Commands ─────────────────────────────────────────────────────────────
function CommandsPanel({ showBosses = false }: { showBosses?: boolean }) {
  const lw = [
    { cmd: "!launchwars play",                desc: "Start here. The bot walks you in step by step" },
    { cmd: "!launchwars standings",           desc: "Teams and current scores" },
    { cmd: "!launchwars join <team>",         desc: "Pick a team" },
    { cmd: "!launchwars buy",                 desc: "Direct buy link for your team" },
    { cmd: "!launchwars me",                  desc: "Your score, by private message" },
    { cmd: "!launchwars invite",              desc: "Your invite link. Earn 10% of what invitees score" },
    { cmd: "!launchwars help",                desc: "Full help" },
  ];
  const boss = [
    { cmd: "!bosses",              desc: "Boss lineup and rules" },
    { cmd: "!boss <domain>",       desc: "One boss, one-line status" },
    { cmd: "!bosses me",           desc: "Your damage, points, and hold status, by private message" },
    { cmd: "!bosses share <link>", desc: "Submit a boss tweet if the auto-catch missed it" },
  ];
  const Table = ({ rows, accent, label }: { rows: { cmd: string; desc: string }[]; accent: string; label: string }) => (
    <Panel accent={accent}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}` }}>
        <Chip label={label} color={accent} />
      </div>
      <div>
        {rows.map((c) => (
          <div key={c.cmd} style={{
            display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) 1.4fr", gap: 12,
            padding: "11px 16px", borderBottom: `1px solid ${T.line}`,
          }}>
            <code style={{ fontFamily: MONO, fontSize: 13, color: T.amber, fontWeight: 600 }}>{c.cmd}</code>
            <span style={{ fontSize: 13.5, color: T.mut, lineHeight: 1.5 }}>{c.desc}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
  return (
    <Section id="commands">
      <Kicker>How to play</Kicker>
      <H2>Talk to the bot in Discord</H2>
      <Sub>
        Run these in #mini-games. First time? Connect a wallet once with{" "}
        <code style={{ fontFamily: MONO, color: T.amber }}>!wallet link</code>: a free signature,
        no money moves. One wallet link works for the team game and the bosses.
      </Sub>
      <div style={{
        display: "grid", gap: 18, marginTop: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      }}>
        <Table rows={lw} accent={T.violet} label="TEAM SEASON" />
        {showBosses && <Table rows={boss} accent={T.rose} label="WORLD BOSSES" />}
      </div>
    </Section>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────
function FAQPanel() {
  const items: { q: string; a: string }[] = [
    {
      q: "Do I need to know crypto to play?",
      a: "A little. You need a crypto wallet (like MetaMask). You need to buy at least $5 of your team's token on Doma. If you have done either of these before, you are ready.",
    },
    {
      q: "What does it cost to play?",
      a: "Five dollars is the team minimum, ten dollars is the boss minimum. You can spend more, but buy points cap at fifty dollars. Holding is what really scores.",
    },
    {
      q: "What does 'bond' mean?",
      a: "Every Doma premium domain has a bonding curve. When players buy enough of the domain's token, the curve fills up. At 100% the domain 'bonds' and graduates to a real trading market. A team must bond to win the season, and bonding a boss is how its bounty unlocks.",
    },
    {
      q: "What are World Bosses?",
      a: "A co-op event that runs beside the team game. Each boss is a premium domain with a health bar that drains as its bonding curve fills. The whole community fights the same boss by buying and holding its token. You do not need a team, and Launch Wars team members earn 15% more on boss rewards.",
    },
    {
      q: "When can I sell?",
      a: "Team tokens are free when the season ends. Boss tokens are free when the event ends. Until then, keep holding: selling early can shrink your reward, and holding never hurts you. One payday pays everything about a week after the event ends.",
    },
    {
      q: "When do I get paid?",
      a: "One payday for everything. The team cash and all boss bounties pay together, about one week after the whole event ends. The bot sends you a private message with your share, and the operator sends the prize to your linked wallet.",
    },
    {
      q: "What if no team bonds?",
      a: "Then there is no winner that season, and the prize rolls over. Every team that did not bond gets a tombstone 'death card' to mark the run.",
    },
    {
      q: "Can I switch teams?",
      a: "Yes, with a trade-off. If you leave a team, the points you earned stay credited to that team, but you give up any prize from that team. You can then join a different team and start earning fresh. You cannot rejoin a team you already left.",
    },
    {
      q: "Do whales just win everything?",
      a: "No. Buy points cap at fifty dollars, and holding is the biggest source of points: the size-blind daily floor pays a five dollar holder the same as a whale. Big buyers earn the Doma points pool; the cash is split by total contribution.",
    },
  ];
  return (
    <Section id="faq">
      <Kicker>Common questions</Kicker>
      <H2>Things players ask first</H2>
      <div style={{ marginTop: 18 }}>
        <Panel>
          {items.map((it, i) => (
            <div key={it.q} style={{
              padding: "16px 20px",
              borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{it.q}</div>
              <p style={{ fontSize: 13.5, color: T.mut, lineHeight: 1.65, margin: "6px 0 0" }}>{it.a}</p>
            </div>
          ))}
        </Panel>
      </div>
    </Section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────
function FooterBar() {
  return (
    <footer style={{
      maxWidth: MAXW, margin: "40px auto 0", padding: "24px 24px 56px",
      borderTop: `1px solid ${T.line}`,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      flexWrap: "wrap", gap: 14,
    }}>
      <div style={{ fontSize: 12.5, color: T.dim }}>
        <span style={{ color: T.violet, fontWeight: 800, letterSpacing: 2 }}>DOMA · LAUNCH WARS</span>
        <span style={{ marginLeft: 12 }}>Community game on Doma premium domains</span>
      </div>
      <div style={{ display: "flex", gap: 22, fontSize: 13 }}>
        <Link href="https://discord.gg/doma"
          style={{ color: T.mut, textDecoration: "none", fontWeight: 600 }}>
          Discord →
        </Link>
        <Link href="https://app.doma.xyz/join/4urmvv4ouvvsu"
          style={{ color: T.mut, textDecoration: "none", fontWeight: 600 }}>
          Doma →
        </Link>
      </div>
    </footer>
  );
}
