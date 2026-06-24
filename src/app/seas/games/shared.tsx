"use client";

/**
 * Conquer the Seas — shared client plumbing for the duty mini-games.
 *
 * Identity: the bot DMs each captain personal links carrying ?t=<token>
 * (launch_wars_s2_game_tokens). Games call /api/seas/whoami to learn who is
 * playing (name, hull, fittings) and POST /api/seas/score to bank a run.
 * No token (or an expired one) = guest practice mode: fully playable,
 * nothing banked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const INK = "#000f16";
export const GOLD = "#f0b45c";
export const GOLD_BRIGHT = "#ffcf7e";
export const FG = "#f8fdff";
export const FG3 = "rgba(248,253,255,0.64)";
export const HAIRLINE = "rgba(248,253,255,0.10)";

export type Captain = {
  discord_id: string;
  display_name: string;
  faction: string | null;
  hull_usd: number;
  fittings: { cannons?: number; sails?: number; spyglass?: number; pumps?: number };
  is_test: boolean;
};

export type ScoreResult = {
  ok: boolean;
  already?: boolean;
  doubloons?: number;
  glory?: number;
  best?: number;
  improved?: boolean;
  attemptsLeft?: number;
  error?: string;
};

export function dayKeyUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sprite plumbing (Kenney pirate pack, CC0, lives in /public/Kenny).
 * RULE OF THE FLEET: canvas entities are ALWAYS sprites or drawn shapes,
 * NEVER emoji text. Canvas emoji size unpredictably per platform (white
 * "tofu" boxes on some devices, giant glyphs on others). Emoji stay in DOM
 * chrome only (HUD chips, buttons), where they render reliably.
 */
export const KENNEY = {
  // Top-down ships: (1)-(6) pristine in six liveries, +6 per damage tier,
  // (19)-(24) wrecks. All point UP.
  ship: (n: number) => `/Kenny/PNG/Retina/Ships/ship (${n}).png`,
  dinghyLarge: (n: number) => `/Kenny/PNG/Retina/Ships/dinghyLarge${n}.png`,
  dinghySmall: (n: number) => `/Kenny/PNG/Retina/Ships/dinghySmall${n}.png`,
  part: (name: string) => `/Kenny/PNG/Retina/Ship parts/${name}.png`, // cannon, cannonBall, cannonLoose, pole, nest
  flag: (n: number) => `/Kenny/PNG/Retina/Ship parts/flag (${n}).png`,
  explosion: (n: number) => `/Kenny/PNG/Retina/Effects/explosion${n}.png`,
  fire: (n: number) => `/Kenny/PNG/Retina/Effects/fire${n}.png`,
  tile: (n: number) => `/Kenny/PNG/Retina/Tiles/tile_${String(n).padStart(2, "0")}.png`,
};

export function loadImages(
  paths: Record<string, string>,
): Promise<Record<string, HTMLImageElement>> {
  const entries = Object.entries(paths).map(
    ([key, src]) =>
      new Promise<[string, HTMLImageElement]>((resolve) => {
        const img = new Image();
        img.onload = () => resolve([key, img]);
        img.onerror = () => resolve([key, img]); // missing art never blocks the game
        img.src = src;
      }),
  );
  return Promise.all(entries).then((kv) => Object.fromEntries(kv));
}

/** Draw a sprite centered at (x, y), WIDTH-normalized (height from aspect). */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  w: number,
  rot = 0,
) {
  if (!img || !img.naturalWidth) return;
  const h = (img.naturalHeight / img.naturalWidth) * w;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Deterministic daily RNG: same layout for every captain, new sea every day. */
export function seededRng(seedText: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Open a scored run: ask the server for a single-use nonce. /api/seas/score
 * requires it back, so a forged score with only a token is rejected. Returns
 * null in guest mode or if anti-cheat is degraded (migration 023 not run); the
 * score route handles both.
 */
async function requestNonce(token: string, game: string): Promise<string | null> {
  try {
    const r = await fetch("/api/seas/run-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token, game }),
    });
    const data = (await r.json()) as { nonce?: string };
    return data?.nonce || null;
  } catch {
    return null;
  }
}

export function useSeasGame(gameKey: string) {
  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("t");
  }, []);

  const [captain, setCaptain] = useState<Captain | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "done" | "practice" | "error">("idle");
  const [lastResult, setLastResult] = useState<ScoreResult | null>(null);
  const nonceRef = useRef<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!token) {
        setIdentityChecked(true);
        return;
      }
      try {
        const r = await fetch(`/api/seas/whoami?t=${encodeURIComponent(token)}`);
        if (r.ok) {
          const data = (await r.json()) as Captain;
          if (!dead) setCaptain(data);
          // Open the first scored run as soon as we know who is sailing.
          const n = await requestNonce(token, gameKey);
          if (!dead) nonceRef.current = n;
        }
      } catch {
        /* guest practice mode */
      }
      if (!dead) setIdentityChecked(true);
    })();
    return () => {
      dead = true;
    };
  }, [token, gameKey]);

  const submitScore = useCallback(
    async (score: number, meta?: Record<string, unknown>): Promise<ScoreResult> => {
      if (!token || !captain) {
        setSubmitState("practice");
        const res = { ok: false, error: "practice" };
        setLastResult(res);
        return res;
      }
      setSubmitState("sending");
      try {
        const r = await fetch("/api/seas/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token, game: gameKey, score, nonce: nonceRef.current || undefined, meta: meta || {} }),
        });
        const data = (await r.json()) as ScoreResult;
        setLastResult(data);
        setSubmitState(data.ok ? "done" : data.already ? "practice" : "error");
        // This nonce is spent; open the next run so another try can bank.
        nonceRef.current = null;
        requestNonce(token, gameKey).then((n) => {
          nonceRef.current = n;
        });
        return data;
      } catch {
        const res = { ok: false, error: "network" };
        setLastResult(res);
        setSubmitState("error");
        return res;
      }
    },
    [token, captain, gameKey],
  );

  return { token, captain, identityChecked, submitScore, submitState, lastResult };
}

/** Top chrome: who is sailing + today's date. Same on every game. */
export function GameHeader({ title, captain }: { title: string; captain: Captain | null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: `1px solid ${HAIRLINE}`,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <span style={{ color: GOLD, fontWeight: 600, letterSpacing: "0.08em", fontSize: 13, textTransform: "uppercase" }}>
        {title}
      </span>
      <span style={{ color: FG3, fontSize: 12 }}>
        {captain ? `⛵ ${captain.display_name}` : "👻 Practice (no link token)"} · {dayKeyUTC()}
      </span>
    </div>
  );
}

/** End-of-run banner: banked / practice / already-played states. */
export function ScoreBanner({
  state,
  result,
  score,
}: {
  state: "idle" | "sending" | "done" | "practice" | "error";
  result: ScoreResult | null;
  score: number;
}) {
  if (state === "idle") return null;
  let text = "";
  if (state === "sending") text = "Banking your run…";
  else if (state === "done") {
    const tries = result?.attemptsLeft ?? 0;
    const triesBit = tries > 0 ? ` · ${tries} ${tries === 1 ? "try" : "tries"} left` : "";
    if (result?.improved === false) {
      text = `No new best. Best stays ${result?.best ?? "?"}${triesBit}`;
    } else {
      const gloryBit = (result?.glory ?? 0) > 0 ? ` · +${result?.glory} glory` : "";
      text = `Banked! +${result?.doubloons ?? 0} doubloons${gloryBit}${triesBit}`;
    }
  } else if (state === "practice")
    text = result?.already
      ? `All tries used${result?.best != null ? ` · best ${result.best}` : ""}. Fresh tries tomorrow. Practice on.`
      : "Practice run. Use your personal link from !seas play to bank scores.";
  else text = "Could not bank the run. Try again in a minute.";
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "rgba(240,180,92,0.12)",
        border: `1px solid rgba(240,180,92,0.35)`,
        borderRadius: 10,
        color: FG,
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        textAlign: "center",
      }}
    >
      <div>Score {Math.round(score)} · {text}</div>
      {(state === "done" || state === "practice") && (
        <div style={{ marginTop: 5, fontSize: 11.5, opacity: 0.72, lineHeight: 1.45 }}>
          Doubloons scale with your score (best run keeps the pay). Glory banks once a day for finishing, and Glory is what sizes your real prize cut.
        </div>
      )}
    </div>
  );
}
