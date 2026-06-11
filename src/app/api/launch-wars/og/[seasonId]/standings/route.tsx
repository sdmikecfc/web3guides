/**
 * Launch Wars — standings OG image.
 *
 *   /api/launch-wars/og/[seasonId]/standings
 *
 * 1200×630 social card showing the current standings: header + 4 team rows
 * with milestone score + member count + bond status. Designed for X/Twitter
 * previews when sharing season state. Cached at edge for 5min.
 */

import { ImageResponse } from "next/og";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Always read live data + the latest stored card PNGs (no fetch caching), so a
// regenerated card / updated score shows on the next render instead of being
// frozen. This does NOT re-generate any art — it just re-reads what's stored.
export const fetchCache = "force-no-store";
// Compositing 4-5 full-size team card PNGs in one render takes ~7s warm and longer
// cold — give it headroom so Vercel doesn't kill the cold render (the bot also
// retries). Capped lower automatically on plans with a smaller ceiling (e.g. Hobby).
export const maxDuration = 60;

const C = {
  bgFrom:      "#070b1a",
  bgMid:       "#0a0e27",
  bgTo:        "#1a0b3d",
  violet:      "#7c6aff",
  violetLight: "#a78bfa",
  white:       "#f8fafc",
  muted:       "#7a89b8",
  amber:       "#f0b340",
  green:       "#34d399",
  rose:        "#f87171",
  card:        "rgba(13,17,32,0.7)",
};

function statusBadge(status: string) {
  switch (status) {
    case "UPCOMING":  return { label: "PRE-SEASON", color: C.amber };
    case "ACTIVE":    return { label: "LIVE",       color: C.green };
    case "SETTLING":  return { label: "SETTLING",   color: C.amber };
    case "COMPLETE":  return { label: "COMPLETE",   color: C.muted };
    case "CANCELLED": return { label: "CANCELLED",  color: C.rose  };
    default:          return { label: status,       color: C.muted };
  }
}

// In-instance cache for inlined art. Card/boss art URLs change rarely (a regen
// writes a fresh render anyway within the TTL), and a cold render was measured
// at 30.8s with nine multi-MB PNG fetches inside it — warm instances skip the
// refetch entirely. Module scope so it survives across invocations.
const artCache = new Map<string, { data: string; at: number }>();
const ART_CACHE_TTL_MS = 10 * 60 * 1000;
async function inlineImage(url: string): Promise<string | null> {
  const hit = artCache.get(url);
  if (hit && Date.now() - hit.at < ART_CACHE_TTL_MS) return hit.data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || "image/png";
    const data = `data:${ct};base64,${buf.toString("base64")}`;
    artCache.set(url, { data, at: Date.now() });
    return data;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { seasonId: string } },
) {
  const seasonId = parseInt(params.seasonId, 10);
  if (!Number.isFinite(seasonId)) {
    return new Response("Invalid season id", { status: 400 });
  }

  const db = launchWarsDb();

  const { data: season } = await db
    .from("launch_wars_seasons")
    .select("*")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season) return new Response("Season not found", { status: 404 });

  const { data: teamRows } = await db
    .from("launch_wars_teams")
    .select("*")
    .eq("season_id", seasonId)
    .order("slot", { ascending: true });
  const teams = teamRows ?? [];

  // Member counts (active only)
  const memberCounts = new Map<number, number>();
  for (const t of teams) {
    const { count } = await db
      .from("launch_wars_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", t.id)
      .is("left_at", null);
    memberCounts.set(t.id, count ?? 0);
  }

  // Latest bonding-curve % per team (most recent token snapshot), shown on each card
  // so players can see how close their domain is to bonding — the win — and are nudged
  // to push it. Null for teams with no snapshot yet (pending / not launched).
  const bondedPct = new Map<number, number | null>();
  for (const t of teams) {
    const { data: snap } = await db
      .from("launch_wars_token_snapshots")
      .select("bonded_pct")
      .eq("team_id", t.id)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const v = snap?.bonded_pct;
    bondedPct.set(t.id, v === null || v === undefined ? null : Number(v));
  }

  // ── Boss Battles (additive; degrades to teams-only if anything is missing) ──
  const BOSS_COHORT = process.env.BOSS_COHORT || "week2";
  let bosses: any[] = [];
  const bossSnap = new Map<number, any>();
  try {
    const { data: bossRows } = await db
      .from("launch_wars_bosses")
      .select("*")
      .eq("cohort", BOSS_COHORT)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true });
    bosses = bossRows ?? [];
    if (bosses.length > 0) {
      const bossIds = bosses.map((b) => b.id);
      const { data: snaps } = await db
        .from("launch_wars_boss_snapshots")
        .select("boss_id, bonded_pct, hp_pct, fdv_usd, snapshot_at")
        .in("boss_id", bossIds);
      for (const s of snaps ?? []) {
        const prev = bossSnap.get(s.boss_id);
        if (!prev || new Date(s.snapshot_at) > new Date(prev.snapshot_at)) bossSnap.set(s.boss_id, s);
      }
    }
  } catch {
    bosses = [];
  }
  const hasBosses = bosses.length > 0;

  // Sort by milestone score DESC for the image
  const ranked = teams.slice().sort(
    (a, b) => (Number(b.milestone_score) || 0) - (Number(a.milestone_score) || 0),
  );

  const badge = statusBadge(season.status);
  const winnerId = season.winner_team_id ?? null;

  // Card-forward layout sizing (responsive to 2–5 teams within 1200px).
  const teamCount = ranked.length;
  const cardW = Math.min(210, Math.floor((1092 - Math.max(0, teamCount - 1) * 16) / Math.max(1, teamCount)));
  const artSize = Math.max(120, Math.min(hasBosses ? 150 : 9999, cardW - 16));
  const endMs = season.ends_at ? new Date(season.ends_at).getTime() : 0;
  const daysLeft = endMs ? Math.max(0, Math.ceil((endMs - Date.now()) / 86400000)) : 0;
  const medals = ["🥇", "🥈", "🥉"];
  // At launch every team is 0–0–0; medals would look like a pre-picked winner,
  // so show plain rank numbers until at least one team is on the board.
  const allZero = ranked.every((t) => (Number(t.milestone_score) || 0) === 0);
  // Freshness stamp — render time (image is edge-cached ~5 min, so this reads
  // "within the last few minutes"). Lets people tell a screenshot is current.
  const stamp = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }) + " UTC";

  // Pre-fetch each card image server-side and inline it as a base64 data URI.
  // next/og (satori) fetching 5 large remote PNGs in one render is flaky — the
  // lowest-ranked card kept getting dropped. Inlining means satori only DECODES
  // (never fetches), so every card reliably renders (or cleanly falls back to the
  // shield). Parallel, with a per-image timeout so one slow fetch can't stall it.
  const cardData = new Map<number, string | null>();
  await Promise.all(
    ranked.map(async (t) => {
      cardData.set(t.id, t.card_image_url ? await inlineImage(t.card_image_url) : null);
    }),
  );

  // Boss art (display stage), inlined as data URIs like team cards (satori can't fetch URLs).
  const bossArt = new Map<number, string | null>();
  const bossStageUrl = (b: any): string | null => {
    if (b.status === "defeated") return b.art_defeated_url || b.art_critical_url || b.art_half_url || b.art_full_url || null;
    if (b.status === "failed")   return b.art_failed_url   || b.art_full_url || null;
    const st = b.hp_stage || "full";
    if (st === "critical") return b.art_critical_url || b.art_half_url || b.art_full_url || null;
    if (st === "half")     return b.art_half_url || b.art_full_url || null;
    return b.art_full_url || null;
  };
  if (hasBosses) {
    await Promise.all(
      bosses.map(async (b) => {
        const url = bossStageUrl(b);
        bossArt.set(b.id, url ? await inlineImage(url) : null);
      }),
    );
  }
  const bossCount = bosses.length;
  const bossCardW = Math.min(200, Math.floor((1092 - Math.max(0, bossCount - 1) * 16) / Math.max(1, bossCount)));
  const bossArtSize = Math.max(84, Math.min(124, bossCardW - 24));

  const SCALE = 1.5; // render larger so Discord's compressed inline preview stays sharp
  const CW = 1200;
  const CH = hasBosses ? 900 : 630;
  return new ImageResponse(
    (
      <div style={{ display: "flex", overflow: "hidden", width: CW * SCALE, height: CH * SCALE }}>
      <div style={{ display: "flex", width: CW, height: CH, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
          padding: "40px 60px",
          fontFamily: "Inter, system-ui, sans-serif",
          color: C.white,
          position: "relative",
        }}
      >
        {/* Glow accents */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 18% 20%, rgba(124,106,255,0.18) 0%, transparent 45%), " +
              "radial-gradient(circle at 85% 90%, rgba(240,179,64,0.14) 0%, transparent 45%)",
            display: "flex",
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28, zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontSize: 32, fontWeight: 800 }}>DOMA</span>
            <span style={{ fontSize: 32, fontWeight: 800, color: C.violetLight }}>LAUNCH WARS</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 4,
              background: `${badge.color}22`, color: badge.color,
              border: `1px solid ${badge.color}55`,
              letterSpacing: 3, fontWeight: 800,
            }}>
              {badge.label}
            </span>
            <span style={{ fontSize: 14, color: C.muted, marginTop: 6, letterSpacing: 1 }}>
              Season {season.number} · ${season.prize_pool_usd} pot{daysLeft ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}
            </span>
            <span style={{ display: "flex", fontSize: 11, color: C.muted, marginTop: 3, letterSpacing: 1, opacity: 0.7 }}>
              Updated {stamp}
            </span>
          </div>
        </div>

        {/* Title strip */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 14, zIndex: 1 }}>
          <span style={{ fontSize: 13, color: C.muted, letterSpacing: 4, fontWeight: 700, textTransform: "uppercase" }}>
            Standings
          </span>
          <span style={{ fontSize: 30, fontWeight: 800, color: C.white, marginTop: 2 }}>
            Pick a team. Pump the domain.
          </span>
        </div>

        {/* Team cards — art forward */}
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, zIndex: 1, flex: hasBosses ? "0 0 auto" : 1, marginBottom: hasBosses ? 18 : 0 }}>
          {ranked.length === 0 && (
            <div style={{ display: "flex", color: C.muted, fontSize: 20, padding: 40 }}>
              No teams configured.
            </div>
          )}
          {ranked.map((t, i) => {
            const isWinner = t.id === winnerId;
            const bonded = !!t.bonded_at;
            const pending = !t.token_address; // declared but not fractionalized yet
            const memberCount = memberCounts.get(t.id) ?? 0;
            const cardImg = cardData.get(t.id) ?? null;
            const pctRaw = bondedPct.get(t.id);
            const hasPct = pctRaw !== null && pctRaw !== undefined;
            const pct = hasPct ? Math.max(0, Math.min(100, pctRaw as number)) : 0;
            const isBonded = bonded || pct >= 100;
            const barColor = isBonded ? C.green : pct >= 50 ? C.amber : C.violetLight;
            return (
              <div key={t.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: cardW }}>
                <div style={{ display: "flex", position: "relative", width: artSize, height: artSize }}>
                  {cardImg ? (
                    <img
                      src={cardImg}
                      width={artSize}
                      height={artSize}
                      style={{ borderRadius: 14, objectFit: "cover", boxShadow: "0 16px 38px rgba(0,0,0,0.55)" }}
                    />
                  ) : (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: artSize, height: artSize, borderRadius: 14,
                      background: `radial-gradient(circle at 50% 35%, ${C.violet}33, ${C.bgFrom})`,
                      border: `1px solid ${C.violet}44`, fontSize: 54,
                      boxShadow: "0 16px 38px rgba(0,0,0,0.55)",
                    }}>🛡️</div>
                  )}
                  {(!allZero && medals[i]) ? (
                    <div style={{
                      position: "absolute", top: -12, left: -12, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      width: 44, height: 44, borderRadius: 999,
                      background: "rgba(7,11,26,0.92)", border: `1px solid ${isWinner ? C.green : C.amber}cc`, fontSize: 24,
                    }}>
                      {medals[i]}
                    </div>
                  ) : null}
                </div>
                <span style={{
                  display: "flex", justifyContent: "center", width: cardW, marginTop: 16,
                  fontSize: t.domain_name.length > 18 ? 15 : t.domain_name.length > 14 ? 18 : 22,
                  fontWeight: 700, color: C.white, whiteSpace: "nowrap", overflow: "hidden",
                }}>
                  {t.domain_name}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 40, fontWeight: 800, color: pending ? C.amber : (isWinner ? C.green : C.violetLight), fontFamily: "ui-monospace, monospace" }}>
                    {t.milestone_score}
                  </span>
                  <span style={{ fontSize: 12, color: C.muted, letterSpacing: 1 }}>PTS</span>
                </div>
                <span style={{ display: "flex", marginTop: 4, fontSize: 13, color: C.muted }}>
                  {`${memberCount} member${memberCount === 1 ? "" : "s"}${isWinner ? " · 🏆" : ""}`}
                </span>
                {hasPct ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: Math.max(60, cardW - 14), marginTop: 7 }}>
                    <div style={{ display: "flex", width: "100%", height: 6, background: "rgba(255,255,255,0.10)", borderRadius: 999 }}>
                      <div style={{ display: "flex", width: `${pct}%`, height: "100%", background: barColor, borderRadius: 999 }} />
                    </div>
                    <span style={{ display: "flex", fontSize: 11, fontWeight: 700, color: isBonded ? C.green : C.muted, marginTop: 4, letterSpacing: 0.5 }}>
                      {isBonded ? "🎯 BONDED" : `🔥 ${pct.toFixed(0)}% bonded`}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Boss Battles row */}
        {hasBosses ? (
          <div style={{ display: "flex", flexDirection: "column", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
              <span style={{ display: "flex", fontSize: 13, color: C.muted, letterSpacing: 4, fontWeight: 700, textTransform: "uppercase" }}>
                ⚔️ Boss Battles
              </span>
              <span style={{ display: "flex", fontSize: 14, color: C.muted }}>buy + hold to deal damage · bond it to win the bounty</span>
            </div>
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "flex-start", gap: 16 }}>
              {bosses.map((b) => {
                const snap = bossSnap.get(b.id);
                const hp = b.status === "defeated" ? 0
                  : (snap && snap.hp_pct != null) ? Math.max(0, Math.min(100, Number(snap.hp_pct)))
                  : 100;
                const art = bossArt.get(b.id) ?? null;
                const badge = b.status === "live" ? { t: "⚔️ LIVE", c: C.green }
                  : b.status === "defeated" ? { t: "💀 DEFEATED", c: C.muted }
                  : b.status === "failed" ? { t: "⚰️ GOT AWAY", c: C.rose }
                  : { t: "🚀 SOON", c: C.amber };
                const bounty = Number(b.bounty_usd) || 0;
                const hpColor = hp > 50 ? C.rose : hp > 0 ? C.amber : C.muted;
                return (
                  <div key={b.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: bossCardW }}>
                    <div style={{ display: "flex", width: bossArtSize, height: bossArtSize }}>
                      {art ? (
                        <img src={art} width={bossArtSize} height={bossArtSize}
                          style={{ borderRadius: 14, objectFit: "cover", boxShadow: "0 12px 30px rgba(0,0,0,0.55)" }} />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                          width: bossArtSize, height: bossArtSize, borderRadius: 14,
                          background: `radial-gradient(circle at 50% 35%, ${C.rose}22, ${C.bgFrom})`,
                          border: `1px solid ${C.rose}44`, fontSize: 44, boxShadow: "0 12px 30px rgba(0,0,0,0.55)" }}>👾</div>
                      )}
                    </div>
                    <span style={{ display: "flex", justifyContent: "center", width: bossCardW, marginTop: 12,
                      fontSize: b.domain_name.length > 16 ? 14 : 17, fontWeight: 700, color: C.white,
                      whiteSpace: "nowrap", overflow: "hidden" }}>
                      {b.domain_name}
                    </span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
                      <span style={{ display: "flex", fontSize: 12, fontWeight: 800, color: badge.c, letterSpacing: 1 }}>{badge.t}</span>
                      {bounty > 0 ? <span style={{ display: "flex", fontSize: 14, fontWeight: 800, color: C.amber }}>{`🏆 $${bounty}`}</span> : null}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: Math.max(60, bossCardW - 14), marginTop: 7 }}>
                      <div style={{ display: "flex", width: "100%", height: 6, background: "rgba(255,255,255,0.10)", borderRadius: 999 }}>
                        <div style={{ display: "flex", width: `${hp}%`, height: "100%", background: hpColor, borderRadius: 999 }} />
                      </div>
                      <span style={{ display: "flex", fontSize: 11, fontWeight: 700, color: C.muted, marginTop: 4, letterSpacing: 0.5 }}>
                        {b.status === "defeated" ? "💀 DEFEATED" : b.status === "failed" ? "⚰️ window closed" : `${hp.toFixed(0)}% HP`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: "auto", paddingTop: 40,
          fontSize: 13, color: C.muted, letterSpacing: 1, zIndex: 1,
        }}>
          <span style={{ display: "flex" }}>
            Hold · Buy Volume · Posts · bond to win · $400 + 50,000 pts
          </span>
          <span style={{ display: "flex" }}>
            web3guides.com/launch-wars
          </span>
        </div>
      </div>
      </div>
      </div>
    ),
    {
      width: CW * SCALE,
      height: CH * SCALE,
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=120",
      },
    },
  );
}
