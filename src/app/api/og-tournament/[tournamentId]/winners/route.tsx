/**
 * OG Tournament — final winners image.
 *
 * Posted at winners_at (May 29). Celebratory layout with the two new OGs.
 */

import { ImageResponse } from "next/og";
import { ogTournamentDb } from "@/lib/og-tournament/supabase";
import { loadCjkFonts } from "@/lib/og-tournament/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const C = {
  bgFrom:      "#070b1a",
  bgMid:       "#0a0e27",
  bgTo:        "#1a0b3d",
  violet:      "#7c6aff",
  violetLight: "#a78bfa",
  white:       "#f8fafc",
  muted:       "#7a89b8",
  amber:       "#f0b340",
  amberDeep:   "#d97706",
  green:       "#34d399",
};

function shortNameFor(discordId: string, displayName?: string | null): string {
  // NFKC collapses decorative Unicode variants (e.g. Mathematical Bold "𝐊𝐚𝐫𝐓𝐡𝐢𝐤")
  // back to plain ASCII so they render with any font instead of tofu boxes.
  const clean = displayName?.normalize("NFKC");
  if (clean) return clean.length > 22 ? clean.slice(0, 21) + "…" : clean;
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

export async function GET(
  _req: Request,
  { params }: { params: { tournamentId: string } }
) {
  const tid = parseInt(params.tournamentId, 10);
  if (!Number.isFinite(tid)) return new Response("Invalid tournament id", { status: 400 });

  const db = ogTournamentDb();
  const { data: t } = await db.from("og_tournaments").select("*").eq("tournament_id", tid).maybeSingle();
  if (!t) return new Response("Tournament not found", { status: 404 });

  // Pull SF matches to get the 2 winners
  const { data: sfMatches } = await db
    .from("og_bracket_matches")
    .select("*")
    .eq("tournament_id", tid)
    .eq("round_name", "SEMIS")
    .order("position", { ascending: true });
  const sfs = sfMatches ?? [];
  const winners = sfs.map((m: any) => m.winner_id).filter(Boolean) as string[];

  // Resolve names
  const allIds = winners.slice();
  for (const m of sfs) {
    allIds.push(m.competitor_a_id, m.competitor_b_id);
  }
  const { data: userRows } = allIds.length
    ? await db.from("fantasy_users").select("discord_id, display_name").in("discord_id", allIds)
    : { data: [] as any[] };
  const nameById = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.display_name) nameById.set(u.discord_id, u.display_name);
  }

  const fonts = await loadCjkFonts();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
          padding: "60px 70px",
          fontFamily: "NotoSansJP, Inter, system-ui, sans-serif",
          color: C.white,
          position: "relative",
        }}
      >
        {/* Heavy glow accents for celebration */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 50% 30%, rgba(240,179,64,0.30) 0%, transparent 50%), " +
              "radial-gradient(circle at 20% 80%, rgba(124,106,255,0.20) 0%, transparent 50%), " +
              "radial-gradient(circle at 80% 80%, rgba(124,106,255,0.20) 0%, transparent 50%)",
            display: "flex",
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 40, zIndex: 1 }}>
          <span style={{ fontSize: 14, color: C.amber, letterSpacing: 6, textTransform: "uppercase", fontWeight: 700 }}>
            {t.display_name} OG Tournament
          </span>
          <span style={{ fontSize: 64, color: C.white, fontWeight: 900, letterSpacing: -2, marginTop: 8, lineHeight: 1 }}>
            🏆  New OGs
          </span>
          <span style={{ fontSize: 20, color: C.muted, marginTop: 14 }}>
            The community has spoken. Welcome to the OG ranks.
          </span>
        </div>

        {/* Winners */}
        <div style={{ display: "flex", justifyContent: "center", gap: 40, flex: 1, alignItems: "center", zIndex: 1 }}>
          {winners.length === 0 && (
            <div style={{ display: "flex", fontSize: 28, color: C.muted, fontStyle: "italic" }}>
              No winners on record yet.
            </div>
          )}
          {winners.map((winnerId, i) => {
            const name = shortNameFor(winnerId, nameById.get(winnerId) || null);
            return (
              <div
                key={winnerId}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "44px 36px",
                  background: "rgba(13,17,32,0.78)",
                  border: `2px solid ${C.amber}`,
                  borderRadius: 18,
                  position: "relative",
                  width: 360,
                  boxShadow: `0 0 60px ${C.amber}40, inset 0 1px 0 rgba(255,255,255,0.06)`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -22,
                    background: `linear-gradient(135deg, ${C.amber} 0%, ${C.amberDeep} 100%)`,
                    color: C.white,
                    padding: "6px 22px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: 3,
                    display: "flex",
                  }}
                >
                  CHAMPION
                </div>
                <span style={{ fontSize: 80, marginTop: 12 }}>👑</span>
                <span style={{ fontSize: 32, color: C.white, fontWeight: 800, marginTop: 18, textAlign: "center" }}>
                  {name}
                </span>
                <span style={{ fontSize: 13, color: C.muted, letterSpacing: 2, marginTop: 10, textTransform: "uppercase" }}>
                  New OG · {t.display_name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36, paddingTop: 20, borderTop: `1px solid ${C.amber}44`, fontSize: 14, color: C.muted, letterSpacing: 1, zIndex: 1 }}>
          <span style={{ display: "flex" }}>OG roles granted before month end</span>
          <span style={{ display: "flex" }}>GG to all 16 candidates · next round next month</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 900,
      fonts,
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    }
  );
}
