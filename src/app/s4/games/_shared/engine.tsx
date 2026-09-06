/**
 * Season 4 mini-games — reusable canvas engine.
 * GameShell owns the chrome every game shares: the wallet session gate, canvas
 * sizing, the rAF loop, pointer + keyboard input, the nonce/score anti-cheat
 * flow, and the launch / game-over overlay. A game is just a GameHandle
 * (init/step/draw/done/score) — no boilerplate.
 *
 * Port of the proven S3 engine (src/app/stars/games/engine.tsx) with the S4
 * upgrades:
 * - s4 endpoints + the ONE game registry: floorMs and attempts come from
 *   GAME_RULES[game] (lib/s4/games), never a per-page copy.
 * - RunContext: init(w, h, run) hands the game the player's persistent
 *   character stats (from /api/s4/run-start) so STAT_EFFECTS baselines apply.
 * - PRACTICE MODE (?practice=1 on the game page): zero server calls, no gate,
 *   no score submit; the overlay is clearly labeled "Practice, nothing banked".
 * - All words from THEME, all chrome color from ACCENT (both in ./shared).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ACCENT,
  THEME,
  SessionGate,
  startRun,
  submitScore,
  useS4Session,
  type RunStartResult,
  type ScoreResult,
} from "./shared";
import { GAME_RULES, ZERO_STATS, type PlayerStats } from "@/lib/s4/games";

export interface GameInput {
  px: number | null; // pointer x in canvas CSS px (null if never moved)
  py: number | null;
  down: boolean; // pointer/primary held
  left: boolean;
  right: boolean;
  up: boolean;
  downKey: boolean;
  space: boolean;
}

/** Everything a run starts with. Practice runs get ZERO_STATS (baseline). */
export interface RunContext {
  stats: PlayerStats;
  practice: boolean;
}

export interface GameHandle<S> {
  init: (w: number, h: number, run: RunContext) => S;
  step: (s: S, dt: number, input: GameInput, w: number, h: number) => void;
  draw: (ctx: CanvasRenderingContext2D, s: S, w: number, h: number) => void;
  done: (s: S) => boolean;
  score: (s: S) => number;
}

export function GameShell<S>({
  game,
  title,
  instructions,
  handle,
  practice = false,
}: {
  game: string;
  title: string;
  instructions: string;
  handle: GameHandle<S>;
  practice?: boolean;
}) {
  const rules = GAME_RULES[game];
  const floorMs = rules ? rules.floorMs : 8000;
  const attempts = rules ? rules.attempts : 3;

  const session = useS4Session();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<S | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const nonceRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const pointerRef = useRef<{ x: number | null; y: number | null; down: boolean }>({ x: null, y: null, down: false });
  const keysRef = useRef({ left: false, right: false, up: false, downKey: false, space: false });

  const [phase, setPhase] = useState<"idle" | "playing" | "over">("idle");
  const [finalScore, setFinalScore] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [banking, setBanking] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const finish = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    const s = stateRef.current;
    const score = s ? Math.round(handle.score(s)) : 0;
    setFinalScore(score);
    setPhase("over");
    if (practice) return; // nothing banks, nothing leaves the browser
    if (!session.token || !nonceRef.current) return;
    if (Date.now() - startedAtRef.current < floorMs) {
      setResult({ ok: false, error: "Too quick to count. Hold out a little longer next run." });
      return;
    }
    setBanking(true);
    const r = await submitScore(session.token, game, score, nonceRef.current, { v: 1 }).catch(
      () => ({ ok: false, error: "Network hiccup. Your score did not bank." }) as ScoreResult,
    );
    setResult(r);
    setBanking(false);
  }, [session.token, game, floorMs, handle, practice]);

  const loop = useCallback(
    (now: number) => {
      const cv = canvasRef.current;
      const s = stateRef.current;
      if (!cv || !s) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      const dt = Math.min(50, now - lastRef.current) / 1000;
      lastRef.current = now;
      const p = pointerRef.current;
      const k = keysRef.current;
      const input: GameInput = {
        px: p.x,
        py: p.y,
        down: p.down,
        left: k.left,
        right: k.right,
        up: k.up,
        downKey: k.downKey,
        space: k.space,
      };
      handle.step(s, dt, input, W, H);
      ctx.clearRect(0, 0, W, H);
      handle.draw(ctx, s, W, H);
      if (handle.done(s)) {
        void finish();
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [handle, finish],
  );

  const begin = useCallback(async () => {
    let stats: PlayerStats = ZERO_STATS;
    if (practice) {
      nonceRef.current = null; // zero server calls in practice
    } else {
      if (!session.token) return;
      setStartError(null);
      const rs: RunStartResult = await startRun(session.token, game).catch(() => ({ ok: false, error: "network" }));
      if (!rs.ok || !rs.nonce) {
        // a stale/expired token must bounce back to the sign-in gate, not trap you on Start
        if (/session expired|sign in|fresh run/i.test(rs.error || "")) { session.reset(); return; }
        setStartError(rs.error || "Could not open a run. Try again.");
        return;
      }
      nonceRef.current = rs.nonce;
      if (rs.stats) stats = rs.stats;
    }
    startedAtRef.current = Date.now();
    setResult(null);
    setPhase("playing");
    requestAnimationFrame(() => {
      const cv = canvasRef.current;
      if (!cv) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth || 360;
      const H = cv.clientHeight || 480;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      stateRef.current = handle.init(W, H, { stats, practice });
      lastRef.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    });
  }, [session, game, handle, loop, practice]);

  useEffect(() => {
    const setKey = (e: KeyboardEvent, v: boolean) => {
      const k = keysRef.current;
      // lowercase so WASD keeps working under CapsLock / Shift
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "ArrowLeft" || key === "a") k.left = v;
      else if (key === "ArrowRight" || key === "d") k.right = v;
      else if (key === "ArrowUp" || key === "w") k.up = v;
      else if (key === "ArrowDown" || key === "s") k.downKey = v;
      else if (key === " ") {
        k.space = v;
        if (v) e.preventDefault();
      }
    };
    const kd = (e: KeyboardEvent) => setKey(e, true);
    const ku = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const movePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    pointerRef.current.x = e.clientX - r.left;
    pointerRef.current.y = e.clientY - r.top;
  };
  const setDown = (down: boolean) => (e: React.PointerEvent<HTMLCanvasElement>) => {
    movePointer(e);
    pointerRef.current.down = down;
  };

  const arena = (
    <>
      <div
        style={{
          position: "relative",
          // Fill the space on desktop but never taller than the viewport: a 3:4
          // box whose width is capped by available height (keeps it big on a big
          // screen, full-width on a phone).
          width: "min(100%, calc((100dvh - 248px) * 3 / 4))", // 170 chrome budget + the 78px the fixed nav+ticker now cover
          margin: "0 auto",
          aspectRatio: "3 / 4",
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #1c2236",
          background: "#05070f",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={setDown(true)}
          onPointerUp={setDown(false)}
          onPointerLeave={setDown(false)}
          onPointerMove={movePointer}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            cursor: phase === "playing" ? "crosshair" : "default",
          }}
        />
        {phase !== "playing" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              background: "rgba(5,7,15,0.74)",
              textAlign: "center",
              padding: 24,
            }}
          >
            {practice && (
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(94,234,212,0.5)",
                  color: "#5eead4",
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Practice, nothing banked
              </div>
            )}
            {phase === "over" && (
              <>
                <div style={{ fontSize: 14, color: "#aeb6c8", letterSpacing: 2, textTransform: "uppercase" }}>Run over</div>
                <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{finalScore}</div>
                {practice ? (
                  <div style={{ color: "#8b95ad", fontSize: 14 }}>Practice run. Nothing was saved.</div>
                ) : banking ? (
                  <div style={{ color: "#aeb6c8", fontSize: 14 }}>Banking…</div>
                ) : result?.ok ? (
                  <div style={{ color: "#86f0c4", fontSize: 14, lineHeight: 1.5 }}>
                    +{result.credits ?? 0} {THEME.playCurrency}
                    {(result.points ?? 0) > 0 ? ` · +${result.points} ${THEME.points}` : ""}
                    <br />
                    <span style={{ color: "#8b95ad" }}>
                      {result.improved ? "New daily best!" : "No improvement on today's best."} ·{" "}
                      {result.attemptsLeft ?? 0} run{(result.attemptsLeft ?? 0) === 1 ? "" : "s"} left today
                    </span>
                  </div>
                ) : result?.already ? (
                  <div style={{ color: "#8b95ad", fontSize: 14 }}>That was your last run today. Come back tomorrow.</div>
                ) : result?.error ? (
                  <div style={{ color: "#f8b37a", fontSize: 13, lineHeight: 1.5 }}>{result.error}</div>
                ) : null}
              </>
            )}
            {phase === "idle" && (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>{title}</div>
                <p style={{ fontSize: 13.5, color: "#aeb6c8", lineHeight: 1.55, margin: "0 0 6px", maxWidth: 300 }}>
                  {instructions}
                </p>
              </>
            )}
            <button
              onClick={begin}
              style={{
                marginTop: 4,
                padding: "13px 30px",
                background: ACCENT,
                color: "#1a1205",
                border: "none",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {phase === "over" ? "Play again" : "Start"}
            </button>
            {startError && <div style={{ color: "#f87171", fontSize: 13 }}>{startError}</div>}
          </div>
        )}
      </div>
      <p style={{ color: "#5b6478", fontSize: 12, marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
        {practice
          ? "Practice arena. Scores here never save and never bank."
          : `Best of ${attempts} runs a day counts. Runs earn ${THEME.playCurrency} plus a little ${THEME.points} for your ${THEME.team.singular}.`}
        <br />
        {/* plain <a>, not <Link>: the practice flag is read once on page load */}
        {/* inline padding + negative margin: a 40px+ mobile tap target, no layout shift */}
        {practice ? (
          <a
            href={`/s4/games/${game}`}
            style={{ color: "#8b95ad", display: "inline-block", padding: "13px 10px", margin: "-13px -10px" }}
          >
            Ready to play for real?
          </a>
        ) : (
          <a
            href={`/s4/games/${game}?practice=1`}
            style={{ color: "#8b95ad", display: "inline-block", padding: "13px 10px", margin: "-13px -10px" }}
          >
            Warm up in practice mode
          </a>
        )}
      </p>
    </>
  );

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(900px 500px at 50% -10%, #131a2e 0%, #060912 60%)",
        color: "#e8ecf5",
        padding: "106px 16px 56px", // 52 nav + 38 contract ticker (both fixed overlays) + breathing room
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Link
            href="/s4/play"
            style={{
              color: "#cdd4e4",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
              // 44px hit area without moving the header row
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              padding: "0 10px",
              margin: "-11px 0 -11px -10px",
            }}
          >
            ‹ Games
          </Link>
          <span style={{ fontSize: 12, letterSpacing: 2, color: ACCENT, textTransform: "uppercase", fontWeight: 700 }}>
            {title}
          </span>
        </div>

        {practice ? (
          arena
        ) : (
          <>
            <SessionGate session={session}>{arena}</SessionGate>
            {/* Ungated escape hatch: practice needs no wallet, so it must stay
                reachable even while the sign-in gate is up (a tile links here
                without ?practice=1, and the in-arena practice link is behind the
                gate). No wallet, no sign, nothing banks. */}
            {!session.token && (
              <p style={{ textAlign: "center", marginTop: 16, fontSize: 12.5, color: "#5b6478", lineHeight: 1.5 }}>
                <a
                  href={`/s4/games/${game}?practice=1`}
                  style={{ color: "#8b95ad", display: "inline-block", padding: "13px 10px", margin: "-13px -10px" }}
                >
                  Or warm up in practice mode — no wallet needed
                </a>
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
