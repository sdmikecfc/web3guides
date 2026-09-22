"use client";

/**
 * CHEER (M8c) — the game's first social verb, and deliberately its smallest.
 *
 * Restaurant City had six social verbs and this game shipped none, because
 * visiting wants somebody else's room on your screen and gifting or rating
 * wants free text, and both need moderation this game does not have. A cheer
 * needs neither: it carries exactly +1, it cannot be aimed AT anyone, and the
 * person you cheer sees a count rather than a name.
 *
 * The button is a client island on an otherwise static, ISR-cached board.
 *
 * It never scolds. No session means "sign in to your kitchen first" and not an
 * error; already cheered reads as a thank-you; out of cheers points at
 * tomorrow. Nothing here can fail in a way that is the player's fault.
 */

import { useState } from "react";

const FONT = 'ui-rounded, "Segoe UI", system-ui, sans-serif';
const TOKEN_KEY = "dk_token_v1";

type State = "idle" | "sending" | "done" | "already" | "none" | "spent" | "failed";

export function CheerButton({ handle }: { handle: string }) {
  const [state, setState] = useState<State>("idle");

  const label: Record<State, string> = {
    idle: "Cheer",
    sending: "…",
    done: "Cheered",
    already: "Cheered",
    none: "Sign in first",
    spent: "None left today",
    failed: "Try again",
  };

  const send = async () => {
    if (state === "sending" || state === "done" || state === "already") return;
    let t: string | null = null;
    try {
      t = localStorage.getItem(TOKEN_KEY);
    } catch {}
    if (!t) {
      setState("none");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/chef/cheer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // the handle the board already displayed, never an address: the page
        // must not carry a full wallet into the browser at all
        body: JSON.stringify({ t, handle }),
      });
      const j = (await res.json()) as { ok?: boolean; already?: boolean };
      if (j.ok) setState(j.already ? "already" : "done");
      else if (res.status === 429) setState("spent");
      else if (res.status === 401) setState("none");
      else setState("failed");
    } catch {
      setState("failed");
    }
  };

  const cheered = state === "done" || state === "already";
  return (
    <button
      onClick={send}
      disabled={state === "sending" || cheered}
      title="One cheer per kitchen per day. It brings them a livelier room."
      style={{
        flexShrink: 0,
        padding: "5px 11px",
        borderRadius: 999,
        border: `1px solid ${cheered ? "#e8a13d" : "#4a3626"}`,
        background: cheered ? "rgba(232,161,61,0.16)" : "#2a1c14",
        color: cheered ? "#e8a13d" : "#c9b79a",
        fontFamily: FONT,
        fontSize: 12,
        fontWeight: 800,
        cursor: cheered || state === "sending" ? "default" : "pointer",
        whiteSpace: "nowrap",
        // 44px is the iOS minimum, and this board is mostly read on a phone
        minHeight: 34,
        touchAction: "manipulation",
      }}
    >
      {cheered ? "♥ " : ""}
      {label[state]}
    </button>
  );
}
