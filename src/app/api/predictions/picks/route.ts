/**
 * Doma Predictions — pick submission endpoint.
 *
 *   POST /api/predictions/picks
 *   body: { roundId: number, picks: [{ question_id, answer, numeric_guess, is_fomo }] }
 *
 * Validates the user's session (discord_id from cookie), checks the round
 * is accepting picks (UPCOMING or VOTING), and upserts the picks into
 * lines_picks. Enforces "exactly one FOMO per (round, user)" by clearing
 * the prior FOMO before setting a new one.
 *
 * Returns { saved: { total, fomo_qid } } on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/fantasy/session";
import { fantasyDb } from "@/lib/fantasy/supabase";

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

function bad(reason: string, status = 400) {
  return NextResponse.json({ error: reason }, { status });
}

export async function POST(req: NextRequest) {
  const session = readSession();
  if (!session) return bad("not-authenticated", 401);

  let body: { roundId?: number; picks?: Array<{
    question_id: number;
    answer: string | null;
    numeric_guess: number | null;
    is_fomo: boolean;
  }> };
  try {
    body = await req.json();
  } catch {
    return bad("invalid-json");
  }
  if (!body?.roundId || !Array.isArray(body.picks)) return bad("missing-fields");

  const db = fantasyDb();
  const discordId = session.sub;
  const roundId   = body.roundId;

  // Verify round status — only UPCOMING / VOTING accept picks
  const { data: round } = await db
    .from("lines_rounds")
    .select("round_id, status, voting_locks_at")
    .eq("round_id", roundId)
    .maybeSingle();
  if (!round) return bad("round-not-found", 404);
  if (!["UPCOMING", "VOTING"].includes(round.status)) {
    return bad(`round-locked (status: ${round.status})`, 403);
  }

  // Load questions to validate inbound picks
  const { data: questions } = await db
    .from("lines_questions")
    .select("question_id, question_type")
    .eq("round_id", roundId);
  if (!questions || questions.length === 0) return bad("no-questions", 404);

  const qById = new Map<number, { question_type: "YES_NO" | "NUMERIC" }>(
    questions.map((q) => [q.question_id, { question_type: q.question_type }])
  );

  // Sanitize & validate picks
  const validPicks: Array<{
    round_id:      number;
    discord_id:    string;
    question_id:   number;
    answer:        string | null;
    numeric_guess: number | null;
    is_fomo:       boolean;
  }> = [];
  let fomoCount = 0;
  let fomoQid: number | null = null;

  for (const p of body.picks) {
    const q = qById.get(p.question_id);
    if (!q) continue; // ignore picks for unknown questions

    const isYN = q.question_type === "YES_NO";
    let answer: string | null = null;
    let numericGuess: number | null = null;

    if (isYN) {
      // Accept "YES" / "NO" / null (null = no pick yet)
      if (p.answer === "YES" || p.answer === "NO") answer = p.answer;
      else if (p.answer === null) answer = null;
      else continue;
    } else {
      // Numeric: accept any finite number, or null
      if (p.numeric_guess === null || p.numeric_guess === undefined) numericGuess = null;
      else if (typeof p.numeric_guess === "number" && Number.isFinite(p.numeric_guess)) {
        numericGuess = p.numeric_guess;
      } else continue;
    }

    const isFomo = !!p.is_fomo;
    if (isFomo) {
      fomoCount++;
      fomoQid = p.question_id;
    }

    // Don't save a row that's both unanswered AND not FOMO — saves DB load
    if (!isFomo && answer === null && numericGuess === null) continue;

    validPicks.push({
      round_id:      roundId,
      discord_id:    discordId,
      question_id:   p.question_id,
      answer,
      numeric_guess: numericGuess,
      is_fomo:       isFomo,
    });
  }

  if (fomoCount > 1) return bad("more-than-one-fomo");

  // Clear any prior FOMO for this (round, user) — sets is_fomo=false on all
  // existing picks. The new FOMO (if any) lands fresh on the upsert below.
  await db
    .from("lines_picks")
    .update({ is_fomo: false })
    .eq("round_id", roundId)
    .eq("discord_id", discordId);

  // Upsert picks. PK is (round_id, discord_id, question_id) so this works.
  if (validPicks.length > 0) {
    const { error: upErr } = await db
      .from("lines_picks")
      .upsert(validPicks, { onConflict: "round_id,discord_id,question_id" });
    if (upErr) {
      console.error("[predictions/picks] upsert error", upErr);
      return bad(`save-failed: ${upErr.message}`, 500);
    }
  }

  return NextResponse.json({
    saved: {
      total:    validPicks.length,
      fomo_qid: fomoQid,
    },
  });
}
