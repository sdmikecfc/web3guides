/**
 * OG Tournament — intro / announcement graphic.
 *
 * Used in the operator's manual #announcements post. Explains the
 * tournament, the phases, dates, and how to recommend.
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
  green:       "#34d399",
  rowAlt:      "rgba(255,255,255,0.025)",
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export async function GET(
  _req: Request,
  { params }: { params: { tournamentId: string } }
) {
  const tid = parseInt(params.tournamentId, 10);
  if (!Number.isFinite(tid)) {
    return new Response("Invalid tournament id", { status: 400 });
  }

  const db = ogTournamentDb();
  const { data: t } = await db
    .from("og_tournaments")
    .select("*")
    .eq("tournament_id", tid)
    .maybeSingle();
  if (!t) return new Response("Tournament not found", { status: 404 });

  const phases = [
    {
      icon: "✍️",
      label: "Phase 1 · Recommend",
      window: `${shortDate(t.recommend_opens_at)} → ${shortDate(t.recommend_closes_at)}`,
      detail: "Post `!recommend @user1 @user2 @user3` in #general-chat (max 3 per voter)",
      tone: C.amber,
    },
    {
      icon: "⚔️",
      label: "Phase 2 · Tournament Bracket",
      window: `${shortDate(t.bracket_opens_at)} → ${shortDate(t.winners_at)}`,
      detail: "Top 16 candidates seeded · community votes head-to-head · R16 → QF → SF",
      tone: C.violet,
    },
    {
      icon: "👑",
      label: "Phase 3 · Winners",
      window: shortDate(t.winners_at),
      detail: "New OG roles granted before month end",
      tone: C.green,
    },
  ];

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
          padding: "50px 60px",
          fontFamily: "NotoSansJP, Inter, system-ui, sans-serif",
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
              "radial-gradient(circle at 15% 20%, rgba(240,179,64,0.16) 0%, transparent 45%), " +
              "radial-gradient(circle at 85% 85%, rgba(124,106,255,0.20) 0%, transparent 50%)",
            display: "flex",
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20, zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: C.white }}>DOMA</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: C.violetLight }}>COMMUNITY</span>
          </div>
          <span style={{ fontSize: 13, color: C.muted, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>
            Monthly Program
          </span>
        </div>

        {/* Big title */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 36, zIndex: 1 }}>
          <span style={{ fontSize: 18, color: C.amber, letterSpacing: 6, textTransform: "uppercase", fontWeight: 700 }}>
            {t.display_name} · OG Tournament
          </span>
          <span style={{ fontSize: 62, fontWeight: 900, color: C.white, letterSpacing: -2, marginTop: 10, lineHeight: 1 }}>
            Pick the next OGs.
          </span>
          <span style={{ fontSize: 22, color: C.muted, marginTop: 12, lineHeight: 1.4 }}>
            Community-driven monthly promotion. Recommend, vote, decide.
          </span>
        </div>

        {/* Phases */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 30, zIndex: 1 }}>
          {phases.map((p) => (
            <div
              key={p.label}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "18px 22px",
                background: "rgba(13,17,32,0.6)",
                border: `1px solid ${p.tone}33`,
                borderRadius: 10,
                gap: 18,
              }}
            >
              <div style={{ display: "flex", fontSize: 32, width: 50, justifyContent: "center" }}>
                {p.icon}
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                  <span style={{ fontSize: 20, color: p.tone, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: 14, color: C.muted, fontFamily: "monospace" }}>
                    {p.window}
                  </span>
                </div>
                <span style={{ fontSize: 16, color: C.white, marginTop: 6, lineHeight: 1.35 }}>
                  {p.detail}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            paddingTop: 18,
            borderTop: `1px solid ${C.violet}33`,
            fontSize: 13,
            color: C.muted,
            letterSpacing: 1,
            zIndex: 1,
          }}
        >
          <span style={{ display: "flex" }}>
            Eligible voters: OG · OMAD · Devs · Raiders · Fractionalized · Meme Dream Team · Dods
          </span>
          <span style={{ display: "flex", fontFamily: "monospace", color: C.amber, fontWeight: 700 }}>
            #general-chat
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 900,
      fonts,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    }
  );
}
