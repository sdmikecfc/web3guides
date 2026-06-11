/**
 * Doma Lines — threshold-cross announcement image.
 *
 * Posted in #general-chat when a question resolves. One big number,
 * the question, the result, the point award. Designed to be a
 * screenshot-worthy moment.
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
  white:       "#f8fafc",
  muted:       "#7a89b8",
  green:       "#34d399",
  rose:        "#f87171",
  amber:       "#f0b340",
};

export async function GET(
  _req: Request,
  { params }: { params: { roundId: string; position: string } }
) {
  const roundId = parseInt(params.roundId, 10);
  const position = parseInt(params.position, 10);
  if (!Number.isFinite(roundId) || !Number.isFinite(position)) {
    return new Response("Invalid params", { status: 400 });
  }

  const db = fantasyDb();

  const { data: round } = await db
    .from("lines_rounds")
    .select("name")
    .eq("round_id", roundId)
    .maybeSingle();
  if (!round) return new Response("Round not found", { status: 404 });

  const { data: question } = await db
    .from("lines_questions")
    .select("*")
    .eq("round_id", roundId)
    .eq("position", position)
    .maybeSingle();
  if (!question) return new Response("Question not found", { status: 404 });

  const outcome = question.resolved_outcome || "PENDING";
  const isYes = outcome === "YES";
  const accent = outcome === "YES" ? C.green : outcome === "NO" ? C.rose : C.muted;

  // Count YES/NO voters
  const { data: picks } = await db
    .from("lines_picks")
    .select("answer")
    .eq("question_id", question.question_id);

  const yesCount = (picks ?? []).filter((p: any) => p.answer === "YES").length;
  const noCount  = (picks ?? []).filter((p: any) => p.answer === "NO").length;
  const correctVoters = outcome === "YES" ? yesCount : outcome === "NO" ? noCount : 0;
  const totalVoters = yesCount + noCount;

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
          fontFamily: "Inter, system-ui, sans-serif",
          color: C.white,
          position: "relative",
        }}
      >
        {/* Side accent */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            background: accent,
            display: "flex",
          }}
        />

        {/* Brand stripe */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 28 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.white }}>DOMA</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.violetLight }}>PREDICTIONS</span>
          <span style={{ fontSize: 12, color: C.muted, letterSpacing: 3, marginLeft: 14, textTransform: "uppercase" }}>
            {round.name}
          </span>
        </div>

        {/* Result headline */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 32 }}>
          <span style={{ fontSize: 18, color: C.muted, letterSpacing: 4, textTransform: "uppercase", fontWeight: 600 }}>
            Question {question.position} resolved
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 4 }}>
            <span style={{ fontSize: 96, fontWeight: 900, color: accent, lineHeight: 1, letterSpacing: -3 }}>
              {outcome}
            </span>
            <span style={{ fontSize: 26, fontFamily: "monospace", color: C.amber, fontWeight: 700 }}>
              +{question.points} pts
            </span>
          </div>
        </div>

        {/* Question prompt */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "24px 28px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            border: `1px solid ${accent}33`,
            marginBottom: 28,
          }}
        >
          <span style={{ fontSize: 30, color: C.white, lineHeight: 1.25, fontWeight: 600 }}>
            {question.prompt}
          </span>
          {question.resolved_note && (
            <span style={{ fontSize: 18, color: C.muted, fontStyle: "italic", marginTop: 12 }}>
              {question.resolved_note}
            </span>
          )}
        </div>

        {/* Vote tally */}
        <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, color: C.muted, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600 }}>
              {outcome === "PENDING" ? "Votes" : `${outcome} voters earn`}
            </span>
            <span style={{ fontSize: 32, color: accent, fontWeight: 800, fontFamily: "monospace", marginTop: 4 }}>
              {outcome === "PENDING"
                ? `${totalVoters} total`
                : `${correctVoters}/${totalVoters} → +${question.points} pts each`}
            </span>
          </div>
        </div>

        {/* Footer accent */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${accent} 0%, transparent 70%)`,
            display: "flex",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    }
  );
}
