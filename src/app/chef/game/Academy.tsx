"use client";

/**
 * The Academy modal (ADR-0050). A lesson, one question, and a kind retry.
 *
 * Getting it wrong costs nothing and never says "wrong": the hint teaches the
 * bit that was missed and lets you try again. Nobody is graded here; the
 * point is that they leave understanding what a range is.
 */

import { useState } from "react";
import { COURSES, isGraduate, type Course } from "./_engine/academy";

const FONT = 'ui-rounded, "Segoe UI", system-ui, sans-serif';

const chip: React.CSSProperties = {
  background: "rgba(27,19,16,0.92)",
  border: "1px solid #4a3626",
  borderRadius: 999,
  color: "#f3e9d2",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 13px",
  cursor: "pointer",
};

export function AcademyModal({
  done,
  onComplete,
  onClose,
}: {
  done: string[];
  onComplete: (id: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<Course | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const graduate = isGraduate(done);
  const correct = open !== null && picked === open.question.answer;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(10,6,4,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 7,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(430px, 94vw)",
          maxHeight: "82vh",
          overflowY: "auto",
          background: "#241812",
          border: "1px solid #4a3626",
          borderRadius: 16,
          color: "#f3e9d2",
          fontFamily: FONT,
          fontSize: 13,
          padding: "14px 16px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontWeight: 800, letterSpacing: "0.05em", fontSize: 15 }}>
            {graduate ? "🎓 " : ""}THE ACADEMY
          </span>
          <button onClick={onClose} aria-label="Close" style={{ ...chip, padding: "4px 10px" }}>
            ✕
          </button>
        </div>

        {open === null ? (
          <>
            <div style={{ opacity: 0.75, lineHeight: 1.45, marginBottom: 10 }}>
              Five short lessons on how any of this actually works. Each one pays you for
              finishing it, and none of them can be failed.
            </div>
            {COURSES.map((c, i) => {
              const finished = done.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setOpen(c);
                    setPicked(null);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 11px",
                    marginBottom: 6,
                    borderRadius: 11,
                    border: `1px solid ${finished ? "#e8a13d" : "#4a3626"}`,
                    background: finished ? "rgba(232,161,61,0.09)" : "#1f150f",
                    color: "#f3e9d2",
                    fontFamily: FONT,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {finished ? "✓ " : `${i + 1}. `}
                    {c.title}
                  </span>
                  {!finished && (
                    <span style={{ display: "block", opacity: 0.6, fontSize: 12, marginTop: 2 }}>
                      pays {c.reward} coins
                    </span>
                  )}
                </button>
              );
            })}
            {graduate && (
              <div style={{ marginTop: 8, color: "#e8a13d", lineHeight: 1.45, fontWeight: 700 }}>
                You finished every course. Your kitchen wears the mark.
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 7 }}>{open.title}</div>
            {open.lesson.map((p, i) => (
              <p key={i} style={{ opacity: 0.88, lineHeight: 1.5, margin: "0 0 9px" }}>
                {p}
              </p>
            ))}

            <div style={{ fontWeight: 700, margin: "12px 0 7px" }}>{open.question.ask}</div>
            {open.question.options.map((opt, i) => {
              const chosen = picked === i;
              const right = i === open.question.answer;
              const show = picked !== null;
              return (
                <button
                  key={i}
                  onClick={() => setPicked(i)}
                  disabled={correct}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 11px",
                    marginBottom: 6,
                    borderRadius: 11,
                    border: `1px solid ${show && chosen ? (right ? "#6fe3a0" : "#e0a552") : "#4a3626"}`,
                    background: show && chosen ? (right ? "rgba(111,227,160,0.1)" : "rgba(224,165,82,0.08)") : "#1f150f",
                    color: "#f3e9d2",
                    fontFamily: FONT,
                    fontSize: 13,
                    cursor: correct ? "default" : "pointer",
                  }}
                >
                  {opt}
                </button>
              );
            })}

            {picked !== null && !correct && (
              <div style={{ color: "#e0a552", lineHeight: 1.45, margin: "6px 0 2px" }}>
                Not quite, and that is fine. {open.question.hint} Have another go.
              </div>
            )}
            {correct && (
              <div style={{ color: "#6fe3a0", lineHeight: 1.45, margin: "6px 0 2px", fontWeight: 700 }}>
                That is it exactly.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              <button
                style={chip}
                onClick={() => {
                  setOpen(null);
                  setPicked(null);
                }}
              >
                ← All courses
              </button>
              {correct && !done.includes(open.id) && (
                <button
                  style={{ ...chip, borderColor: "#e8a13d", background: "#2a1c14" }}
                  onClick={() => {
                    onComplete(open.id);
                    setOpen(null);
                    setPicked(null);
                  }}
                >
                  Take the {open.reward} coins
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
