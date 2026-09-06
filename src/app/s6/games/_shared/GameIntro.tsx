"use client";

/**
 * THE BRIEFING BLOCK, one shape for every game.
 *
 * Mike, 2026-08-01: "Breakthrough is the only game where the text in the intro
 * is actually in the right place (fix the others)." He was reading a real
 * defect: three games rendered the briefing as two paragraphs where the FIRST
 * was capped at 320px and the SECOND (the daily line) had no cap at all, so a
 * narrow column of prose carried a full-width caption bolted underneath.
 *
 * Then, 2026-08-02, the bigger problem with the same block: it is 150 words of
 * prose standing between a player and a mini-game, and nobody reads 150 words
 * to play something that lasts ninety seconds. So the briefing now leads with
 * its FIRST SENTENCE at reading size and folds the rest behind "How it works".
 * The detail is one tap away for anyone who wants it and out of the way of
 * everyone who does not, and it costs no new copy in any language: the split is
 * made from the string the game already had.
 *
 * RunShell's overlay is a centred flex column (`justifyContent: "safe center"`,
 * its own 10px gap), so this only owns the text block itself.
 */

import type { ReactNode } from "react";

/** One measure for every part. Wide enough for ~10 words a line at 13.5px,
 * narrow enough that the block stays a column on a phone. */
const MEASURE = 330;

/**
 * First sentence, then the rest.
 *
 * Handles both punctuation families, because the same string ships in English,
 * Korean and Chinese: a Latin full stop is followed by a space, a CJK one is
 * not. Returns the whole string as the hook when there is no sentence break to
 * find, which is the safe direction -- a briefing that shows everything is a
 * worse page, never a broken one.
 */
function splitFirstSentence(text: string): [string, string] {
  const m = /^([\s\S]*?(?:[。！？]|[.!?](?=\s)))/.exec(text.trim());
  if (!m) return [text, ""];
  const head = m[1].trim();
  const rest = text.trim().slice(m[1].length).trim();
  // A one-line briefing has nothing to fold, and a two-word head is a bad
  // hook. The threshold is on the REST, not the head: a 24-character minimum
  // on the head was calibrated for English and silently refused to fold three
  // of the four Chinese briefings, because 24 characters of Chinese is most of
  // a sentence. Judge by how much there is left to hide.
  if (!rest || rest.length < 40 || head.length < 8) return [text, ""];
  return [head, rest];
}

export function GameIntro({
  intro,
  daily,
  more,
}: {
  intro: ReactNode;
  daily?: ReactNode;
  /** Localised label for the fold ("How it works"). Falls back to showing the
   * whole briefing rather than an English word inside a Korean page. */
  more?: string;
}) {
  const text = typeof intro === "string" ? intro : null;
  const [hook, rest] = text && more ? splitFirstSentence(text) : [null, ""];

  if (hook && rest) {
    return (
      <>
        <p
          style={{
            fontSize: 15,
            color: "#e6edf3",
            lineHeight: 1.5,
            fontWeight: 600,
            margin: "0 0 6px",
            maxWidth: MEASURE,
          }}
        >
          {hook}
        </p>
        <details style={{ maxWidth: MEASURE, margin: "0 0 4px" }}>
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              fontSize: 11.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#9fb0bd",
              padding: "6px 0",
            }}
          >
            {more}
          </summary>
          <p style={{ fontSize: 13, color: "#c9d4dc", lineHeight: 1.55, margin: "2px 0 0" }}>{rest}</p>
        </details>
        {daily ? (
          <p style={{ fontSize: 11.5, color: "#8d97a1", lineHeight: 1.5, margin: 0, maxWidth: MEASURE }}>
            {daily}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <p
        style={{
          fontSize: 13.5,
          color: "#c9d4dc",
          lineHeight: 1.55,
          margin: "0 0 4px",
          maxWidth: MEASURE,
        }}
      >
        {intro}
      </p>
      {daily ? (
        <p style={{ fontSize: 11.5, color: "#8d97a1", lineHeight: 1.5, margin: 0, maxWidth: MEASURE }}>
          {daily}
        </p>
      ) : null}
    </>
  );
}
