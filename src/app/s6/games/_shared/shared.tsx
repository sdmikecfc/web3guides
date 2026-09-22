/**
 * Season 5 mini-games — shared client harness.
 * Port of the proven S4 harness (src/app/s4/games/_shared/shared.tsx) onto the
 * s6 seams (lib/s6/games keys, /api/s6/* endpoints) with the S6 addition:
 * GUEST MODE. Every S6 game is playable with no wallet at all:
 *
 * - A guest run plays exactly like a real one, but the score parks in
 *   localStorage (GUEST_STORAGE_KEY) instead of banking. Per game, a guest
 *   gets the same attempts/day as a pilot (GAME_RULES[game].attempts);
 *   after that, guest runs keep playing but nothing parks (practice).
 * - When the visitor enlists and opens a play session, useGuestClaim posts the
 *   parked bests ONCE to /api/s6/claim-guest (server-side idempotent sentinel),
 *   converting them into Signal. localStorage marks the claim so this browser
 *   never re-posts.
 *
 * No Telegram path in S6 (the s6 tree has no TelegramProvider); wallet-first
 * only, same as the s6 join flow.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DEFAULT_THEME } from "@/lib/s6/theme";
import { track } from "@/lib/s6/track";
import {
  GAME_RULES,
  GUEST_STORAGE_KEY,
  buildPlaySessionMessage,
  clearSessionToken,
  readSessionToken,
  writeSessionToken,
  type PlayerStats,
} from "@/lib/s6/games";

/** The one theme object every game surface reads its words from. */
export const THEME = DEFAULT_THEME;

/** Default accent for S6 game chrome; games may pass their arcade-tile accent. */
export const ACCENT = "#f0b340";

export function dayKeyUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// EIP-4361 shape, now SHARED with the garage's own sign-in (lib/s6/games
// buildPlaySessionMessage). The server verifies the EXACT posted bytes, so a
// second copy of this template that drifts by one character is a silent auth
// break. One template, two callers.
function buildMessage(address: string, nonce: string, issuedAt: string, domain: string, uri: string) {
  return buildPlaySessionMessage(address, nonce, issuedAt, domain, uri, THEME.seasonName);
}

export function useS6Session() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | null>(() => readSessionToken() || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSession = useCallback(async () => {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    track("connect_start");
    try {
      const issuedAt = new Date().toISOString();
      const nonce = crypto.randomUUID().replace(/-/g, "");
      const domain = window.location.host;
      const uri = `${window.location.origin}/s6/play`;
      const message = buildMessage(address, nonce, issuedAt, domain, uri);
      const signature = await signMessageAsync({ message });
      track("siwe_ok");
      const resp = await fetch("/api/s6/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });
      const r = await resp.json();
      if (!resp.ok || !r.ok) {
        setError(r.error || "Could not start a session.");
        setBusy(false);
        return;
      }
      writeSessionToken(r.token);
      setToken(r.token);
      setBusy(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|deny|user denied|user rejected/i.test(msg) ? "Signature cancelled." : `Sign failed: ${msg}`);
      setBusy(false);
    }
  }, [address, signMessageAsync]);

  const reset = useCallback(() => {
    clearSessionToken();
    setToken(null);
  }, []);

  return { address, isConnected, token, busy, error, openSession, reset };
}

export type S6Session = ReturnType<typeof useS6Session>;

/** The player's fielded tank, COSMETIC ONLY (ADR-0075): run-start resolves it
 * server-side from the hq row so games can show the real name + hull-class
 * sprite. Sims never see it; it can never touch scoring. */
export type RunTank = { key: string; name: string; hullClass: string };

export type RunStartResult = {
  ok: boolean;
  nonce?: string;
  stats?: PlayerStats;
  tank?: RunTank;
  error?: string;
};
export type ScoreResult = {
  ok: boolean;
  points?: number;
  /** Play currency the bank paid. Shown next to the Signal line so the player
   *  actually sees the shop currency arrive. */
  shells?: number;
  best?: number;
  improved?: boolean;
  attemptsLeft?: number;
  dailyPointsLeft?: number;
  /** THE FRONT REACTS: true while a siege sprint was active for this bank
   * (see /api/s6/score). Display-only; the client never claims the bonus. */
  sprint?: boolean;
  /** Signal this specific run's bank paid on top of the flat per-run rate
   * because a sprint was active; 0 when sprint is false OR when this game's
   * Signal for today were already banked by an earlier attempt. */
  sprintBonus?: number;
  already?: boolean;
  error?: string;
};

export async function startRun(token: string, game: string): Promise<RunStartResult> {
  const r = await fetch("/api/s6/run-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ t: token, game }),
  });
  return r.json();
}

export async function submitScore(
  token: string,
  game: string,
  score: number,
  nonce: string,
  meta?: Record<string, unknown>,
): Promise<ScoreResult> {
  const r = await fetch("/api/s6/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ t: token, game, score, nonce, meta }),
  });
  return r.json();
}

// ── Guest progress (localStorage; the ONE shape /api/s6/claim-guest reads) ──
type GuestStore = {
  v: 1;
  /** UTC day the runs counters refer to; counters reset when the day rolls. */
  day: string;
  /** Scored guest runs finished today, per game. */
  runs: Record<string, number>;
  /** Parked all-time bests per game (what a claim posts). */
  scores: Record<string, number>;
  /** True once this browser has claimed (server is idempotent regardless). */
  claimed: boolean;
};

function emptyGuest(): GuestStore {
  return { v: 1, day: dayKeyUTC(), runs: {}, scores: {}, claimed: false };
}

export function readGuest(): GuestStore {
  if (typeof window === "undefined") return emptyGuest();
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return emptyGuest();
    const p = JSON.parse(raw) as Partial<GuestStore>;
    const g: GuestStore = {
      v: 1,
      day: typeof p.day === "string" ? p.day : dayKeyUTC(),
      runs: p.runs && typeof p.runs === "object" ? { ...p.runs } : {},
      scores: p.scores && typeof p.scores === "object" ? { ...p.scores } : {},
      claimed: Boolean(p.claimed),
    };
    if (g.day !== dayKeyUTC()) {
      g.day = dayKeyUTC();
      g.runs = {}; // fresh guest tries each UTC day; parked bests survive
    }
    return g;
  } catch {
    return emptyGuest();
  }
}

function writeGuest(g: GuestStore) {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(g));
  } catch {
    // storage blocked: guest progress just does not persist
  }
}

/** Scored guest runs left today for one game (attempts mirror GAME_RULES). */
export function guestRunsLeft(game: string): number {
  const attempts = GAME_RULES[game]?.attempts ?? 3;
  const g = readGuest();
  return Math.max(0, attempts - (g.runs[game] || 0));
}

/** Bank a finished guest run locally. Returns the updated best + runs left. */
export function recordGuestScore(game: string, score: number): { best: number; left: number } {
  const g = readGuest();
  g.runs[game] = (g.runs[game] || 0) + 1;
  const s = Math.max(0, Math.round(score));
  g.scores[game] = Math.max(g.scores[game] || 0, s);
  writeGuest(g);
  const attempts = GAME_RULES[game]?.attempts ?? 3;
  return { best: g.scores[game], left: Math.max(0, attempts - g.runs[game]) };
}

/**
 * Once a play session exists, convert parked guest bests into Signal, ONCE.
 * The server is the real idempotency gate (sentinel row per wallet); the
 * localStorage `claimed` flag just stops this browser from re-posting.
 */
export function useGuestClaim(token: string | null) {
  const [claimedPoints, setClaimedPoints] = useState<number | null>(null);
  const tried = useRef(false);
  useEffect(() => {
    if (!token || tried.current) return;
    const g = readGuest();
    const games = Object.keys(g.scores).filter((k) => (g.scores[k] || 0) > 0);
    if (g.claimed || games.length === 0) return;
    tried.current = true;
    (async () => {
      try {
        const r = await fetch("/api/s6/claim-guest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token, scores: g.scores }),
        });
        const data = await r.json();
        if (data?.ok || data?.already) {
          const fresh = readGuest();
          fresh.claimed = true;
          fresh.scores = {};
          writeGuest(fresh);
          if (data?.ok) {
            setClaimedPoints(Number(data.points) || 0);
            // the single most important funnel joint (guest -> wallet), and
            // until the 2026-08-16 CRO audit it emitted nothing
            track("guest_claim", { games: games.length, points: Number(data.points) || 0 });
          }
        }
        // any other failure: leave the parked scores for a later session
      } catch {
        tried.current = false; // network hiccup: retry on the next mount
      }
    })();
  }, [token]);
  return { claimedPoints };
}

// ── Session panel (guest-first: never blocks the arena) ─────────────────────
const cardStyle: React.CSSProperties = {
  background: "rgba(18,22,27,0.72)",
  border: "1px solid #232a32",
  borderRadius: 14,
  padding: "16px 18px",
};

/** SessionPanel copy — the session-panel block of the dict's arcade.shell
 * section (src/lib/s6/strings.ts). English defaults live inline below as the
 * fallback; RunShell threads the localized pack through its own strings prop
 * (server page -> RunShell -> here). Session-hook errors (session.error) pass
 * through untranslated, same as server API error strings. */
export interface SessionPanelStrings {
  /** {points} */
  sessionOpen: string;
  /** {pts} {points} {player} */
  guestClaimed: string;
  guestHeading: string;
  /** {leftNote} {points} */
  guestBody: string;
  /** {n} {runWord} */
  guestLeftNote: string;
  connectWallet: string;
  waitingSig: string;
  signBank: string;
}

export const SESSION_PANEL_DEFAULTS: SessionPanelStrings = {
  sessionOpen: "Session open. Runs bank {points} for real.",
  guestClaimed: "Guest runs claimed: +{pts} {points} banked to your {player}.",
  guestHeading: "Guest sortie",
  guestBody:
    "You are playing as a guest. Scores park in this browser{leftNote}. Enlist free - one signature, no gas - to bank them as {points} and put your mech on the battlefield.",
  guestLeftNote: " ({n} scored guest {runWord} left today)",
  connectWallet: "Connect a wallet",
  waitingSig: "Waiting for signature…",
  signBank: "Sign and bank your scores",
};

function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * Renders UNDER the arena. With a token: a quiet "banking as" line. Without:
 * the connect + sign controls plus the guest explainer. Games stay playable
 * either way; this panel only decides where scores go.
 */
export function SessionPanel({
  session,
  accent = ACCENT,
  game,
  strings,
}: {
  session: S6Session;
  accent?: string;
  game: string;
  strings?: Partial<SessionPanelStrings>;
}) {
  const T: SessionPanelStrings = { ...SESSION_PANEL_DEFAULTS, ...strings };
  const { claimedPoints } = useGuestClaim(session.token);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    setLeft(guestRunsLeft(game)); // client-only read (localStorage)
  }, [game, session.token]);

  if (session.token) {
    return (
      <div style={{ maxWidth: 460, margin: "14px auto 0" }} data-testid="session-panel" data-session="open">
        {claimedPoints != null && claimedPoints > 0 && (
          <div
            style={{
              ...cardStyle,
              borderColor: "rgba(52,211,153,0.4)",
              color: "#86f0c4",
              fontSize: 13.5,
              textAlign: "center",
              marginBottom: 10,
            }}
            data-testid="guest-claim-banner"
          >
            {fill(T.guestClaimed, { pts: claimedPoints, points: THEME.points, player: THEME.player.singular })}
          </div>
        )}
        <p style={{ textAlign: "center", fontSize: 12, color: "#87919b", margin: 0, lineHeight: 1.5 }}>
          {fill(T.sessionOpen, { points: THEME.points })}
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 460, margin: "16px auto 0" }} data-testid="session-panel" data-session="guest">
      <div style={cardStyle}>
        <div
          style={{
            fontSize: 11.5,
            color: accent,
            letterSpacing: 2.4,
            fontWeight: 700,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {T.guestHeading}
        </div>
        <p style={{ fontSize: 13, color: "#aab4bd", margin: "0 0 12px", lineHeight: 1.55 }}>
          {fill(T.guestBody, {
            leftNote:
              left != null ? fill(T.guestLeftNote, { n: left, runWord: left === 1 ? "run" : "runs" }) : "",
            points: THEME.points,
          })}
        </p>
        <ConnectButton showBalance={false} accountStatus="address" />
        <button
          onClick={session.openSession}
          disabled={!session.isConnected || session.busy}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 18px",
            background: !session.isConnected || session.busy ? "rgba(240,179,64,0.22)" : accent,
            color: !session.isConnected || session.busy ? "#aab4bd" : "#1a1205",
            border: "none",
            borderRadius: 9,
            fontSize: 14.5,
            fontWeight: 700,
            cursor: !session.isConnected || session.busy ? "not-allowed" : "pointer",
          }}
        >
          {!session.isConnected ? T.connectWallet : session.busy ? T.waitingSig : T.signBank}
        </button>
        {session.error && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#f87171", lineHeight: 1.5 }}>{session.error}</div>
        )}
      </div>
    </div>
  );
}
