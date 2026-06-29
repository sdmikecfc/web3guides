/**
 * STARFALL mini-games — reusable canvas engine.
 * GameShell owns the chrome every game shares: the wallet session gate, canvas
 * sizing, the rAF loop, pointer + keyboard input, the nonce/score anti-cheat flow,
 * and the launch / game-over overlay. A game is just a GameHandle (init/step/draw/
 * done/score) — no boilerplate. (Swarm predates this and stays standalone.)
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStarSession, SessionGate, startRun, submitScore, type ScoreResult, type RunStartResult } from "./shared";

const GOLD = "#f0b340";

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

export interface GameHandle<S> {
  init: (w: number, h: number) => S;
  step: (s: S, dt: number, input: GameInput, w: number, h: number) => void;
  draw: (ctx: CanvasRenderingContext2D, s: S, w: number, h: number) => void;
  done: (s: S) => boolean;
  score: (s: S) => number;
}

export function GameShell<S>({
  game,
  title,
  floorMs,
  instructions,
  handle,
}: {
  game: string;
  title: string;
  floorMs: number;
  instructions: string;
  handle: GameHandle<S>;
}) {
  const session = useStarSession();
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
    if (!session.token || !nonceRef.current) return;
    if (Date.now() - startedAtRef.current < floorMs) {
      setResult({ ok: false, error: "Too quick to count — hold out a little longer next run." });
      return;
    }
    setBanking(true);
    const r = await submitScore(session.token, game, score, nonceRef.current, { v: 1 }).catch(
      () => ({ ok: false, error: "Network hiccup. Your score didn't bank." }) as ScoreResult,
    );
    setResult(r);
    setBanking(false);
  }, [session.token, game, floorMs, handle]);

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
    if (!session.token) return;
    setStartError(null);
    const rs: RunStartResult = await startRun(session.token, game).catch(() => ({ ok: false, error: "network" }));
    if (!rs.ok || !rs.nonce) {
      // a stale/expired token must bounce back to the sign-in gate, not trap you on Launch
      if (/session expired|sign in|fresh run/i.test(rs.error || "")) { session.reset(); return; }
      setStartError(rs.error || "Could not open a run. Try again.");
      return;
    }
    nonceRef.current = rs.nonce;
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
      stateRef.current = handle.init(W, H);
      lastRef.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    });
  }, [session.token, game, handle, loop]);

  useEffect(() => {
    const setKey = (e: KeyboardEvent, v: boolean) => {
      const k = keysRef.current;
      if (e.key === "ArrowLeft" || e.key === "a") k.left = v;
      else if (e.key === "ArrowRight" || e.key === "d") k.right = v;
      else if (e.key === "ArrowUp" || e.key === "w") k.up = v;
      else if (e.key === "ArrowDown" || e.key === "s") k.downKey = v;
      else if (e.key === " ") {
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

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(900px 500px at 50% -10%, #131a2e 0%, #060912 60%)",
        color: "#e8ecf5",
        padding: "28px 16px 56px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Link href="/games" style={{ color: "#cdd4e4", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            ‹ Arcade
          </Link>
          <span style={{ fontSize: 12, letterSpacing: 2, color: GOLD, textTransform: "uppercase", fontWeight: 700 }}>
            {title}
          </span>
        </div>

        <SessionGate session={session}>
          <div
            style={{
              position: "relative",
              width: "100%",
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
                {phase === "over" && (
                  <>
                    <div style={{ fontSize: 14, color: "#aeb6c8", letterSpacing: 2, textTransform: "uppercase" }}>Run over</div>
                    <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{finalScore}</div>
                    {banking ? (
                      <div style={{ color: "#aeb6c8", fontSize: 14 }}>Banking…</div>
                    ) : result?.ok ? (
                      <div style={{ color: "#86f0c4", fontSize: 14, lineHeight: 1.5 }}>
                        +{result.stardust ?? 0} Salvage{(result.starlight ?? 0) > 0 ? ` · +${result.starlight} Starlight` : ""}
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
                    <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{title}</div>
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
                    background: GOLD,
                    color: "#1a1205",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {phase === "over" ? "Play again" : "Launch"}
                </button>
                {startError && <div style={{ color: "#f87171", fontSize: 13 }}>{startError}</div>}
              </div>
            )}
          </div>
          <p style={{ color: "#5b6478", fontSize: 12, marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
            Best of 3 runs a day counts. Salvage buys upgrades + cosmetics; a little Starlight helps your crew.
          </p>
        </SessionGate>
      </div>
    </main>
  );
}
