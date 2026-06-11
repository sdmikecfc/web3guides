"use client";

/**
 * Doma Predictions — client-side form for entering picks.
 *
 * Renders 10 question rows. YES/NO questions get two buttons; NUMERIC get a
 * number input. A single FOMO radio runs across all questions (exactly one
 * selectable). Submit posts to /api/predictions/picks.
 */

import { useMemo, useState } from "react";

type Question = {
  question_id:           number;
  position:              number;
  points:                number;
  prompt:                string;
  detail:                string | null;
  question_type:         "YES_NO" | "NUMERIC";
  numeric_scoring_type:  "ABSOLUTE_BUCKET" | "PERCENT_BUCKET" | null;
  numeric_buckets:       { within: number; pts: number }[] | null;
};

type ExistingPick = {
  answer:         string | null;
  numeric_guess:  number | null;
  is_fomo:        boolean;
};

interface Props {
  roundId:          number;
  questions:        Question[];
  picksByQuestion:  Record<number, ExistingPick>;
}

type FormState = {
  yn:           Record<number, "YES" | "NO" | null>;       // qid → answer
  numeric:      Record<number, string>;                     // qid → raw input string
  fomoQid:      number | null;
};

export default function PredictionsForm({ roundId, questions, picksByQuestion }: Props) {
  // Initialize from existing picks
  const initial = useMemo<FormState>(() => {
    const yn: FormState["yn"] = {};
    const num: FormState["numeric"] = {};
    let fomoQid: number | null = null;
    for (const q of questions) {
      const p = picksByQuestion[q.question_id];
      if (q.question_type === "YES_NO") {
        yn[q.question_id] = p?.answer === "YES" || p?.answer === "NO" ? (p.answer as "YES" | "NO") : null;
      } else {
        num[q.question_id] = p?.numeric_guess !== null && p?.numeric_guess !== undefined
          ? String(p.numeric_guess)
          : "";
      }
      if (p?.is_fomo) fomoQid = q.question_id;
    }
    return { yn, numeric: num, fomoQid };
  }, [questions, picksByQuestion]);

  const [state, setState] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function setYn(qid: number, val: "YES" | "NO") {
    setState((s) => ({ ...s, yn: { ...s.yn, [qid]: val } }));
  }
  function setNumeric(qid: number, val: string) {
    setState((s) => ({ ...s, numeric: { ...s.numeric, [qid]: val } }));
  }
  function setFomo(qid: number) {
    setState((s) => ({ ...s, fomoQid: s.fomoQid === qid ? null : qid }));
  }

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const picks = questions.map((q) => {
        if (q.question_type === "YES_NO") {
          return {
            question_id: q.question_id,
            answer:      state.yn[q.question_id] ?? null,
            numeric_guess: null,
            is_fomo:     state.fomoQid === q.question_id,
          };
        }
        const raw = state.numeric[q.question_id] ?? "";
        const num = raw === "" ? null : Number(raw);
        return {
          question_id: q.question_id,
          answer:      null,
          numeric_guess: Number.isFinite(num as number) ? (num as number) : null,
          is_fomo:     state.fomoQid === q.question_id,
        };
      });

      const res = await fetch(`/api/predictions/picks`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ roundId, picks }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "err", text: body?.error || `Save failed (${res.status})` });
      } else {
        const counts = body?.saved
          ? `Saved ${body.saved.total} pick${body.saved.total === 1 ? "" : "s"}` +
            (body.saved.fomo_qid ? ` · FOMO on Q${questions.find((q) => q.question_id === body.saved.fomo_qid)?.position}` : "")
          : "Picks saved";
        setMessage({ type: "ok", text: `✅ ${counts}. Re-submit any time before lock.` });
      }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      setMessage({ type: "err", text: `Save failed: ${m}` });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {questions.map((q) => (
        <QuestionRow
          key={q.question_id}
          q={q}
          ynValue={state.yn[q.question_id] ?? null}
          numValue={state.numeric[q.question_id] ?? ""}
          isFomo={state.fomoQid === q.question_id}
          onYn={(v) => setYn(q.question_id, v)}
          onNum={(v) => setNumeric(q.question_id, v)}
          onFomoToggle={() => setFomo(q.question_id)}
        />
      ))}

      {/* Submit + status */}
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <button
          onClick={submit}
          disabled={submitting}
          style={{
            padding: "16px 24px",
            background: submitting ? "rgba(124,106,255,0.4)" : "linear-gradient(135deg, #7c6aff 0%, #4f3cc9 100%)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: 1,
            textTransform: "uppercase",
            cursor: submitting ? "wait" : "pointer",
            boxShadow: "0 4px 24px rgba(124,106,255,0.30)",
          }}
        >
          {submitting ? "Saving…" : "Submit Picks"}
        </button>
        {message && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              fontSize: 14,
              color: message.type === "ok" ? "#34d399" : "#f87171",
              background: message.type === "ok"
                ? "rgba(52,211,153,0.10)"
                : "rgba(248,113,113,0.10)",
              border: `1px solid ${message.type === "ok" ? "rgba(52,211,153,0.30)" : "rgba(248,113,113,0.30)"}`,
            }}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionRow({
  q, ynValue, numValue, isFomo, onYn, onNum, onFomoToggle,
}: {
  q:            Question;
  ynValue:      "YES" | "NO" | null;
  numValue:     string;
  isFomo:       boolean;
  onYn:         (v: "YES" | "NO") => void;
  onNum:        (v: string) => void;
  onFomoToggle: () => void;
}) {
  const isNumeric = q.question_type === "NUMERIC";
  return (
    <div style={{
      padding: "20px 22px",
      background: "rgba(13,17,32,0.7)",
      border: `1.5px solid ${isFomo ? "#f0b340" : "rgba(124,106,255,0.20)"}`,
      borderRadius: 14,
      transition: "border-color 150ms",
    }}>
      {/* Q# + points + FOMO toggle */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{
            fontSize: 12, color: "#7a89b8", fontFamily: "ui-monospace, monospace",
            letterSpacing: 1, fontWeight: 700,
          }}>
            Q{q.position}
          </span>
          <span style={{
            fontSize: 11, color: "#a78bfa", letterSpacing: 1.5,
            textTransform: "uppercase", fontWeight: 700,
          }}>
            {isNumeric ? "🎯 numeric" : "yes / no"} · {q.points} pts
          </span>
        </div>
        <label style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, color: isFomo ? "#f0b340" : "#7a89b8",
          fontWeight: 700, cursor: "pointer", userSelect: "none",
        }}>
          <input
            type="checkbox"
            checked={isFomo}
            onChange={onFomoToggle}
            style={{ width: 18, height: 18, accentColor: "#f0b340", cursor: "pointer" }}
          />
          ⚡ FOMO
        </label>
      </div>

      {/* Prompt */}
      <div style={{
        fontSize: 16, color: "#f8fafc", lineHeight: 1.45, fontWeight: 500,
        marginBottom: q.detail ? 6 : 14,
      }}>
        {q.prompt}
      </div>

      {/* Detail */}
      {q.detail && (
        <div style={{
          fontSize: 13, color: "#7a89b8", fontStyle: "italic",
          marginBottom: 14, lineHeight: 1.5,
        }}>
          {q.detail}
        </div>
      )}

      {/* YES / NO buttons OR numeric input */}
      {isNumeric ? (
        <div>
          <input
            type="number"
            inputMode="decimal"
            placeholder="Your guess (a number)…"
            value={numValue}
            onChange={(e) => onNum(e.target.value)}
            style={{
              width: "100%", padding: "12px 14px",
              background: "rgba(7,11,26,0.8)",
              border: "1.5px solid rgba(124,106,255,0.30)",
              borderRadius: 8,
              color: "#f8fafc",
              fontSize: 16,
              fontFamily: "ui-monospace, monospace",
              outline: "none",
            }}
          />
          {q.numeric_buckets && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#7a89b8", lineHeight: 1.6 }}>
              <b style={{ color: "#a78bfa" }}>Scoring brackets ({q.numeric_scoring_type === "PERCENT_BUCKET" ? "% distance" : "absolute distance"}):</b>{" "}
              {q.numeric_buckets.map((b, i) => (
                <span key={i}>
                  {i > 0 ? " · " : ""}within {q.numeric_scoring_type === "PERCENT_BUCKET" ? `${b.within}%` : `±${b.within}`}: <b>{b.pts}pts</b>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(["YES", "NO"] as const).map((opt) => {
            const selected = ynValue === opt;
            return (
              <button
                key={opt}
                onClick={() => onYn(opt)}
                style={{
                  padding: "14px 18px",
                  background: selected
                    ? (opt === "YES" ? "rgba(52,211,153,0.18)" : "rgba(248,113,113,0.18)")
                    : "rgba(7,11,26,0.5)",
                  border: selected
                    ? `2px solid ${opt === "YES" ? "#34d399" : "#f87171"}`
                    : "1.5px solid rgba(124,106,255,0.20)",
                  color: selected ? (opt === "YES" ? "#34d399" : "#f87171") : "#cbd5e1",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: 1,
                  cursor: "pointer",
                  transition: "all 100ms",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
