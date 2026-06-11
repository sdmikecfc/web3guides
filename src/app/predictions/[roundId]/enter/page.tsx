/**
 * Doma Predictions — voting form page.
 *
 *   /predictions/[roundId]/enter
 *
 * Auth-gated by the session cookie set during /api/predictions/enter.
 * Loads the round + 10 questions + any existing picks for this user.
 * Renders YES/NO buttons for Y/N questions, numeric input for NUMERIC,
 * and a FOMO radio across all 10 (exactly one allowed).
 *
 * The actual submission happens via client component → POST /api/predictions/picks.
 */

import { redirect } from "next/navigation";
import { readSession } from "@/lib/fantasy/session";
import { fantasyDb } from "@/lib/fantasy/supabase";
import PredictionsForm from "./form";

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

export default async function PredictionsEnterPage({
  params,
}: { params: { roundId: string } }) {
  const session = readSession();
  if (!session) {
    redirect("/predictions/login?error=missing-code");
  }

  const roundId = parseInt(params.roundId, 10);
  if (!Number.isFinite(roundId)) {
    redirect("/predictions/login?error=missing-round");
  }

  const db = fantasyDb();

  const { data: round } = await db
    .from("lines_rounds")
    .select("*")
    .eq("round_id", roundId)
    .maybeSingle();
  if (!round) {
    return <ErrorState title="Round not found" body="This round doesn't exist." />;
  }

  // Status check — only VOTING (and UPCOMING for early-access) allow picks
  const acceptingPicks = round.status === "VOTING" || round.status === "UPCOMING";
  if (!acceptingPicks) {
    return (
      <ErrorState
        title="Picks are locked"
        body={`This round is in ${round.status}. You can't edit picks anymore — wait for resolution.`}
      />
    );
  }

  const { data: questions } = await db
    .from("lines_questions")
    .select("*")
    .eq("round_id", roundId)
    .order("position", { ascending: true });

  const { data: existingPicks } = await db
    .from("lines_picks")
    .select("question_id, answer, numeric_guess, is_fomo")
    .eq("round_id", roundId)
    .eq("discord_id", session.sub);

  // Build a map from question_id → existing pick for fast lookup in the form
  const picksByQuestion: Record<number, { answer: string | null; numeric_guess: number | null; is_fomo: boolean }> = {};
  for (const p of existingPicks ?? []) {
    picksByQuestion[p.question_id] = {
      answer: p.answer,
      numeric_guess: p.numeric_guess !== null ? Number(p.numeric_guess) : null,
      is_fomo: !!p.is_fomo,
    };
  }

  const totalBase = (questions ?? []).reduce((s, q) => s + Number(q.points || 0), 0);

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #070b1a 0%, #0a0e27 50%, #1a0b3d 100%)",
      color: "#f8fafc",
      fontFamily: "Inter, system-ui, sans-serif",
      padding: "32px 16px 64px",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 12, color: "#f0b340", letterSpacing: 4,
            textTransform: "uppercase", fontWeight: 700, marginBottom: 8,
          }}>
            🎯 Doma Predictions
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, marginBottom: 8 }}>
            {round.name}
          </h1>
          <p style={{ fontSize: 14, color: "#7a89b8", margin: 0, lineHeight: 1.6 }}>
            {questions?.length ?? 0} questions · max <b style={{ color: "#a78bfa" }}>{totalBase}</b> base pts · FOMO adds +30
            <br />
            Voting locks: <span style={{ color: "#f8fafc" }}>{new Date(round.voting_locks_at).toUTCString()}</span>
          </p>
        </div>

        {/* Form */}
        <PredictionsForm
          roundId={roundId}
          questions={questions ?? []}
          picksByQuestion={picksByQuestion}
        />

        {/* Footer */}
        <div style={{
          marginTop: 36, padding: "16px 18px",
          background: "rgba(124,106,255,0.06)",
          border: "1px solid rgba(124,106,255,0.18)",
          borderRadius: 8,
          fontSize: 13, color: "#7a89b8", lineHeight: 1.6,
        }}>
          <b style={{ color: "#a78bfa" }}>How scoring works:</b><br />
          • YES/NO questions: full points if right, 0 if wrong.<br />
          • Numeric questions: bucket-graded — closer to actual = more pts (each question shows its brackets).<br />
          • <b style={{ color: "#f0b340" }}>FOMO</b>: pick ONE question to FOMO. If that pick scores anything, get +30 bonus.
          Wrong FOMO = no penalty.<br />
          • You can re-submit anytime before lock. Final picks count.
        </div>
      </div>
    </main>
  );
}

function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <main style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #070b1a 0%, #0a0e27 50%, #1a0b3d 100%)",
      color: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif",
      padding: 32,
    }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>{title}</h1>
        <p style={{ color: "#cbd5e1", fontSize: 16, lineHeight: 1.55 }}>{body}</p>
      </div>
    </main>
  );
}
