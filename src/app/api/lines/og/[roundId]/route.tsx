/**
 * Doma Lines — slate banner image, programmatically rendered.
 *
 * Returns a PNG containing the round name, all 10 questions, and
 * minimal footer. Designed to be the share-worthy artifact: anyone
 * who screenshots this can immediately see what the round is about.
 *
 * Rendered via @vercel/og from real Supabase data — zero AI cost,
 * zero hallucination risk, perfect text every time.
 */

import { ImageResponse } from "next/og";
import { fantasyDb } from "@/lib/fantasy/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const C = {
  bgFrom:      "#070b1a",
  bgMid:       "#0a0e27",
  bgTo:        "#1a0b3d",
  violet:      "#7c6aff",
  violetLight: "#a78bfa",
  violetDeep:  "#4f3cc9",
  white:       "#f8fafc",
  muted:       "#7a89b8",
  amber:       "#f0b340",
  rowAlt:      "rgba(255,255,255,0.025)",
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export async function GET(
  _req: Request,
  { params }: { params: { roundId: string } }
) {
  const roundId = parseInt(params.roundId, 10);
  if (!Number.isFinite(roundId)) {
    return new Response("Invalid round id", { status: 400 });
  }

  const db = fantasyDb();

  const { data: round, error: rErr } = await db
    .from("lines_rounds")
    .select("*")
    .eq("round_id", roundId)
    .maybeSingle();
  if (rErr || !round) {
    return new Response("Round not found", { status: 404 });
  }

  const { data: questions } = await db
    .from("lines_questions")
    .select("position, points, prompt, detail")
    .eq("round_id", roundId)
    .order("position", { ascending: true });

  const qs = questions ?? [];
  const totalPts = qs.reduce((s, q: any) => s + Number(q.points || 0), 0);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 45%, ${C.bgTo} 100%)`,
          padding: "44px 56px 36px",
          fontFamily: "Inter, system-ui, sans-serif",
          color: C.white,
          position: "relative",
        }}
      >
        {/* Hex grid overlay (decorative, low-opacity) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 12% 18%, rgba(124,106,255,0.18) 0%, transparent 50%), " +
              "radial-gradient(circle at 88% 82%, rgba(79,60,201,0.20) 0%, transparent 55%)",
            display: "flex",
          }}
        />

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: C.white, letterSpacing: -1 }}>DOMA</span>
            <span
              style={{
                fontSize: 44,
                fontWeight: 800,
                color: C.violetLight,
                letterSpacing: -1,
                textShadow: `0 0 30px ${C.violet}66`,
              }}
            >
              PREDICTIONS
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span
              style={{
                fontSize: 13,
                color: C.muted,
                letterSpacing: 4,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {round.name}
            </span>
            <span
              style={{
                fontSize: 14,
                color: C.amber,
                fontFamily: "monospace",
                marginTop: 4,
                fontWeight: 700,
              }}
            >
              MAX {totalPts} PTS
            </span>
          </div>
        </div>

        {/* Accent line */}
        <div
          style={{
            display: "flex",
            height: 2,
            background: `linear-gradient(90deg, ${C.violet} 0%, ${C.violetDeep}88 30%, transparent 70%)`,
            marginTop: 18,
            marginBottom: 22,
            zIndex: 1,
          }}
        />

        {/* Questions */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2, zIndex: 1 }}>
          {qs.map((q: any, i: number) => (
            <div
              key={q.position}
              style={{
                display: "flex",
                alignItems: "flex-start",
                padding: "10px 14px",
                background: i % 2 === 0 ? C.rowAlt : "transparent",
                borderRadius: 6,
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 42,
                  fontSize: 15,
                  fontWeight: 700,
                  color: C.muted,
                  fontFamily: "monospace",
                  paddingTop: 2,
                }}
              >
                Q{q.position}
              </div>
              <div
                style={{
                  display: "flex",
                  width: 60,
                  fontSize: 13,
                  color: C.amber,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  paddingTop: 4,
                }}
              >
                {q.points} pts
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: 16,
                    color: C.white,
                    lineHeight: 1.25,
                    fontWeight: 500,
                  }}
                >
                  {q.prompt}
                </div>
                {q.detail && (
                  <div
                    style={{
                      display: "flex",
                      fontSize: 12,
                      color: C.muted,
                      fontStyle: "italic",
                      marginTop: 2,
                    }}
                  >
                    {q.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${C.violet}55 50%, transparent 100%)`,
            marginTop: 18,
            marginBottom: 14,
            zIndex: 1,
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            color: C.muted,
            letterSpacing: 1,
            zIndex: 1,
          }}
        >
          <span style={{ display: "flex", fontFamily: "monospace" }}>
            DM <span style={{ color: C.violetLight, marginLeft: 6, marginRight: 6 }}>!prediction enter</span> to play
          </span>
          <span style={{ display: "flex" }}>
            Resolves {shortDate(round.resolves_at)}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 900,
      headers: {
        // Cache aggressively — slate doesn't change during a round
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    }
  );
}
