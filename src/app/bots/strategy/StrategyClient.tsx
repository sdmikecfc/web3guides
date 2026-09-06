"use client";

/**
 * SET UP YOUR STRATEGY (screens doc 1 row 2, 7 row 0:30): two cards and a
 * status dot.
 *
 *  - Left: the one button to https://app.doma.xyz/auto-trading, a plain <a>
 *    in a new tab (it leaves the game tree: the PageShell footer law).
 *  - Right: "Use the MCP instead" reveals the MCP URL and the three-line
 *    prompt from strings.ts, each with a 44 px Copy button.
 *  - The status dot polls GET /api/bots/me every 30 seconds. FAIL-SOFT: a
 *    404 (the route is not built yet) leaves the static line "Strategy: not
 *    seen yet. Your garage keeps working." and stops polling; any other
 *    error keeps the same line and tries again in 30 seconds. The shape of
 *    the route's answer is read defensively (a strategy kind under
 *    `strategy`, `player.strategy`, `strategyKind` or a `crew` list), the
 *    way api/s7/me reads its player row.
 *
 * Nothing here is a transaction: the game only ever tracks (the guide,
 * section 1).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "../_components/PageShell";
import { Dot, Panel, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, M, R, TAP } from "../_ui/tokens";
import { STRATEGY_LINKS, STRINGS, fill } from "@/lib/bots/strings";

const t = STRINGS.en;
const POLL_MS = 30_000;

/**
 * PROPOSED client key for the play-session token (lane A3's POST
 * /api/bots/enlist returns `token`; GET /api/bots/me wants it as
 * `Authorization: Bearer <t>`). The S7 pattern keeps its token in
 * localStorage under lib/s7/games.ts SESSION_STORAGE_KEY; when the bots
 * enlist client lands, import ITS key here instead of this string (the
 * usePlaySession law: never a drifting copy). Absent = signed out = no header.
 */
const SESSION_KEY = "bots.session";

function readSessionToken(): string {
  try {
    return localStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

type Status =
  | { kind: "checking" }
  | { kind: "notSeen" }
  | { kind: "seen"; label: string }
  /** the route 404s: static text, no more polling */
  | { kind: "noRoute" };

/** The strategy kind a /api/bots/me answer carries, or null. Read
 * defensively: the route lands in another lane and may name it differently. */
function strategyKindOf(j: unknown): string | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const player = o.player && typeof o.player === "object" ? (o.player as Record<string, unknown>) : null;
  const candidates: unknown[] = [o.strategy, player?.strategy, o.strategyKind, player?.strategyKind];
  const crew = Array.isArray(o.crew) ? o.crew : player && Array.isArray(player.crew) ? player.crew : null;
  if (crew && crew.length) candidates.push(crew[0]);
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (c && typeof c === "object") {
      const k = (c as Record<string, unknown>).kind;
      if (typeof k === "string" && k.trim()) return k.trim();
      if ((c as Record<string, unknown>).live === true) return "live";
    }
  }
  return null;
}

/** The player-facing label for a kind: the fixed table, else the kind word
 * itself (a short server word, never free text from a player). */
function kindLabel(kind: string): string {
  const table = t.garageUi.strategyKind as Record<string, string>;
  return table[kind] ?? kind.slice(0, 40);
}

export default function StrategyClient() {
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [mcpOpen, setMcpOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // the poll: a 30 second timer chain, dead on unmount, off on a 404
  useEffect(() => {
    let dead = false;
    let timer = 0;
    const tick = async () => {
      let next: Status = { kind: "notSeen" };
      let again = true;
      try {
        const token = readSessionToken();
        const res = await fetch("/api/bots/me", {
          cache: "no-store",
          credentials: "same-origin",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.status === 404) {
          next = { kind: "noRoute" };
          again = false;
        } else if (res.ok) {
          const j = (await res.json().catch(() => null)) as unknown;
          const kind = strategyKindOf(j);
          next = kind ? { kind: "seen", label: kindLabel(kind) } : { kind: "notSeen" };
        }
      } catch {
        next = { kind: "notSeen" };
      }
      if (dead) return;
      setStatus(next);
      if (again) timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      dead = true;
      window.clearTimeout(timer);
    };
  }, []);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(t.strategyUi.copied);
    } catch {
      setNote(t.strategyUi.copyFailed);
    }
    window.setTimeout(() => setNote(null), 1800);
  }, []);

  const dotColor = status.kind === "seen" ? M.good : status.kind === "notSeen" ? M.warn : M.muted;
  const statusLine =
    status.kind === "seen"
      ? fill(t.strategy.seen, { kind: status.label })
      : status.kind === "checking"
        ? t.strategyUi.checking
        : t.strategy.notSeen;
  const statusSub = status.kind === "noRoute" ? t.strategyUi.noCheck : status.kind === "checking" ? null : t.strategyUi.checksEvery;

  return (
    <PageShell>
      <p style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted, margin: "24px 0 10px" }}>
        {t.nav.wordmark}
      </p>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 32, lineHeight: 1.1, margin: "0 0 10px", color: M.text }}>{t.strategy.title}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: M.lore, margin: "0 0 20px", maxWidth: 640 }}>{t.strategyUi.lead}</p>

      {/* the two cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
        <Panel title={t.strategyUi.domaTitle}>
          <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.5, color: M.lore }}>{t.strategyUi.domaBody}</p>
          {/* plain <a>, not next/link: this leaves the game tree (the PageShell footer law) */}
          <a
            href={STRATEGY_LINKS.doma}
            target="_blank"
            rel="noopener noreferrer"
            className={uiCss.press}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: TAP,
              padding: "10px 18px",
              borderRadius: R.inner,
              border: `1px solid ${M.accent}`,
              background: M.accent,
              color: "#ffffff",
              fontFamily: FONT_BODY,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {t.strategy.doma}
          </a>
          <p style={{ margin: "10px 0 0", fontFamily: FONT_MONO, fontSize: 11, color: M.muted }}>{t.strategyUi.newTab}</p>
        </Panel>

        <Panel title={t.strategyUi.mcpTitle}>
          <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.5, color: M.lore }}>{t.strategyUi.mcpBody}</p>
          <button
            type="button"
            className={uiCss.press}
            onClick={() => setMcpOpen((o) => !o)}
            aria-expanded={mcpOpen}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: TAP,
              padding: "10px 18px",
              borderRadius: R.inner,
              border: `1px solid ${M.border}`,
              background: M.surface2,
              color: M.text,
              fontFamily: FONT_BODY,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.strategy.mcp}
          </button>
          {mcpOpen ? (
            <div className={uiCss.popover} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              <CopyRow label={t.strategyUi.urlLabel} text={STRATEGY_LINKS.mcp} onCopy={copy} mono />
              <CopyRow label={t.strategyUi.promptLabel} text={t.strategy.mcpPrompt} onCopy={copy} />
            </div>
          ) : null}
        </Panel>
      </div>

      {/* the status dot */}
      <Panel title={t.strategyUi.status} style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 28 }}>
          <Dot color={dotColor} size={9} pulse={status.kind === "seen"} />
          <span style={{ fontSize: 14.5, fontWeight: 600 }} role="status" aria-live="polite">
            {statusLine}
          </span>
        </div>
        {statusSub ? <p style={{ margin: "6px 0 0 19px", fontFamily: FONT_MONO, fontSize: 11, color: M.muted }}>{statusSub}</p> : null}
        <p style={{ margin: "12px 0 0", fontSize: 13, color: M.lore }}>{t.strategyUi.later}</p>
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Link
          href="/bots/garage"
          className={uiCss.press}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: TAP,
            padding: "10px 18px",
            borderRadius: R.inner,
            border: `1px solid ${M.border}`,
            background: M.surface2,
            color: M.text,
            fontFamily: FONT_BODY,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          {t.strategyUi.back}
        </Link>
      </div>

      {note ? (
        <div className={uiCss.toast} role="status" style={{ position: "fixed", left: 0, right: 0, top: 64, display: "flex", justifyContent: "center", zIndex: 1200, pointerEvents: "none" }}>
          <span style={{ padding: "10px 16px", borderRadius: R.pill, background: M.surface, border: `1px solid ${M.border}`, fontSize: 13, fontWeight: 600 }}>{note}</span>
        </div>
      ) : null}
    </PageShell>
  );
}

/** A label, the text in a well, and a 44 px Copy button. */
function CopyRow({ label, text, onCopy, mono }: { label: string; text: string; onCopy: (text: string) => void; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <pre
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            padding: "10px 12px",
            borderRadius: R.inner,
            border: `1px solid ${M.border}`,
            background: M.surface2,
            color: M.text,
            fontFamily: mono ? FONT_MONO : FONT_BODY,
            fontSize: mono ? 12.5 : 13.5,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            userSelect: "all",
          }}
        >
          {text}
        </pre>
        <button
          type="button"
          className={uiCss.press}
          onClick={() => onCopy(text)}
          aria-label={`${t.strategyUi.copy} ${label}`}
          style={{
            minHeight: TAP,
            minWidth: TAP,
            padding: "0 14px",
            borderRadius: R.inner,
            border: `1px solid ${M.border}`,
            background: M.surface2,
            color: M.text,
            fontFamily: FONT_BODY,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            flex: "0 0 auto",
          }}
        >
          {t.strategyUi.copy}
        </button>
      </div>
    </div>
  );
}
