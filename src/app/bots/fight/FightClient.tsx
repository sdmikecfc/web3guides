/**
 * THE FIGHT VIEWER (screens doc 4.2, engine doc 6): the pit in a lit frame,
 * two identity strips above, one commentary sentence under, the controls
 * row, the result card with the chain sentence, and a Stat sheet.
 *
 * THE CLIENT STEPS THE SAME stepFight THE SERVER RAN. The fight is resolved
 * once at mount (runFight) for the truth: total frames, the hash, the event
 * ticks and the commentary lines. A second Fight is then stepped for the
 * picture, one 60 Hz frame at a time through a fixed-timestep accumulator
 * (the RunShell pattern, src/app/s7/games/_shared/RunShell.tsx: FIXED_DT,
 * MAX_SUBSTEPS, paused on document.hidden). The renderer reads the engine's
 * state and the events it appended; nothing here decides an outcome. A seek
 * rebuilds the playback fight and steps it to the frame, so a scrub, a
 * "skip to the knockout" and a replay all land on the same deterministic
 * picture. prefers-reduced-motion renders one settled frame.
 *
 * Client shell in the BuildClient shape (garage/build/BuildClient.tsx): owns
 * the rAF, builds the scene through one pixi chain, fits it with a
 * ResizeObserver on the wrapper (never the canvas), keeps every number in
 * the DOM in mono. The HUD silhouettes are DOM (SVG) over the canvas, never
 * on the Pixi stage, so a stage extract can never leak them (the DK postcard
 * law).
 */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../_components/PageShell";
import { IconPlay, IconReplay, IconShare, STAT_ICON } from "../_ui/icons";
import { Button, Dot, Panel } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, M, TIER_COLOR, type PaintId } from "../_ui/tokens";
import { buildFightScene, type FightSceneHandle } from "../_view/scene";
import { SLOWMO_RATE, SLOWMO_S, TELL_F, mkFightFx, resetFightFx, tickFightFx } from "../_view/fightfx";
import { koLineUp, scheduleCommentary } from "../_view/commentary-bar";
import { createBotsSfx, type BotsSfx } from "../_view/sfx";
import { NO_ORDERS, PIECE, TIMEOUT_WHY, botTier, buildTotal, type Build, type FightEvent, type Mode, type Orders, type Side } from "../_engine/parts";
import { createFight, resultOf, runFight, stepFight, type Fight } from "../_engine/resolve";
import { aggregates, type Aggregates } from "../_engine/derive";
import { chainDetail, chainSummary, narrate } from "../_engine/commentary";
// type-only (erased at compile time): the stored fight's shape, never the server client
import type { FightView, LookView } from "../_server/types";
import { rigLookFromBuild, rigLookOf } from "../_view/look-view";
import type { BotLook } from "../_view/look";
import { authHeaders, readBotsSession } from "../battles/session";
import { STRINGS, fightPointWord, fill, winLossWords } from "@/lib/bots/strings";
import css from "./fight.module.css";

export interface FightIdentity {
  /** the bot's name (two words from the fixed tables) */
  name: string;
  /** a wallet name, never an address */
  wallet: string;
  wins: number;
  losses: number;
  /** the owner's strategy label for the stat sheet */
  strategy: string;
  paint: PaintId;
}

export interface FightClientProps {
  seed: number;
  a: Build;
  b: Build;
  ids: [FightIdentity, FightIdentity];
  /**
   * BOTH ROBOTS AS THEY WERE AT THE BELL, off the stored fight row: the colour
   * on every socket, the face, the sticker, the plate, the won hat and the
   * earned marks. A replay watched a month later shows the robots that fought,
   * not the robots their owners have since rebuilt.
   *
   * Absent on the demo replays, which have no row: those fall back to the
   * colours in their own saved build, the calm face and no marks, which is the
   * same fallback the server makes for a row stored before looks existed
   * (_server/fight-read.ts looksFromBuild).
   */
  looks?: readonly [LookView, LookView];
  mode: Mode;
  /** the mono line between the strips: "SPAR . SEED 7", "PVE . SCRAPPER" */
  modeLabel: string;
  orders?: [Orders, Orders];
  /** the stored hash when a server row exists; a mismatch is version skew */
  expectedHash?: number;
  /** the replay link, which is the share link (a path is made absolute at share time) */
  replayUrl: string;
  /** where "Watch another" goes */
  watchAnotherHref: string;
  /** a live spectator starts here (engine doc 6: the offset now minus
   * createdAt, so everyone sees the same frame); absent = the bell */
  startAtFrame?: number;
  /** plain-words lines under the result card: coins, points, drops, the shop */
  rewardLines?: readonly string[];
}

const t = STRINGS.en;
const FIXED_DT = 1 / 60; // the engine's beat (resolve.ts BEAT.FPS)
const MAX_SUBSTEPS = 8; // spiral-of-death guard, the RunShell value
/** the KO slow motion measured in presentation seconds (1.5 s of wall time) */
const KO_SLOW_FX = SLOWMO_S * SLOWMO_RATE;
/** the result card and the Share offer come right after the slow motion */
const KO_OVER_FX = KO_SLOW_FX + 0.3;
const UI_EVERY_F = 3;

/** React StrictMode dev-mounts effects twice; two app.init() calls racing on
 * ONE canvas kill each other's shaders (the Battlefield law). Every build AND
 * destroy is chained through this promise. */
let pixiChain: Promise<void> = Promise.resolve();

interface FunGate {
  watchAnother: number;
  buildOne: number;
  clicks: { what: string; frame: number; at: number }[];
}

function clock(frames: number): string {
  const s = Math.floor(frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function soundOf(e: FightEvent): "bell" | "whoosh" | "clank" | "crunch" | "clang-tumble" | "crack" | null {
  switch (e.t) {
    case "start":
      return "bell";
    case "miss":
      return "whoosh";
    case "block":
      return "clank";
    case "hit":
      return "crunch";
    case "break":
      return e.part === PIECE.BODY ? "crack" : "clang-tumble";
    case "timeout":
      return "bell";
    default:
      return null;
  }
}

export default function FightClient(p: FightClientProps) {
  const names = useMemo<[string, string]>(() => [p.ids[0].name, p.ids[1].name], [p.ids]);
  /**
   * WHAT THE PIT DRAWS. One look per robot, built once: the stored snapshot
   * when the row has one, else the robot's own build colours. The identity's
   * paint is the fallback for a socket that never recorded a colour, so a row
   * from before the snapshot existed draws exactly the picture it drew before
   * this lane and every newer row draws the real robot.
   */
  const looks = useMemo<[BotLook, BotLook]>(
    () => [
      p.looks?.[0] ? rigLookOf(p.looks[0], p.ids[0].paint) : rigLookFromBuild(p.a, p.ids[0].paint),
      p.looks?.[1] ? rigLookOf(p.looks[1], p.ids[1].paint) : rigLookFromBuild(p.b, p.ids[1].paint),
    ],
    [p.looks, p.ids, p.a, p.b],
  );
  const oa = p.orders?.[0] ?? NO_ORDERS;
  const ob = p.orders?.[1] ?? NO_ORDERS;

  // ── the truth: resolved once, the same call the server makes ────────────
  const full = useMemo(() => {
    const f = runFight(p.seed, p.a, p.b, oa, ob, p.mode);
    const result = resultOf(f);
    const lines = narrate(result.log, names);
    // the bar's clock lives in _view/commentary-bar.ts: a line never lags its event by more than a second
    const disp = scheduleCommentary(lines);
    const ticks = result.log
      .filter((e) => e.t === "break" || e.t === "ko" || e.t === "timeout")
      .map((e) => ({ f: e.f, gold: e.t !== "break" }));
    return {
      result,
      lines,
      disp,
      ticks,
      hashHex: (result.hash >>> 0).toString(16).padStart(8, "0"),
      chain: chainSummary(result.log, names),
      // the result card headline already says who won, in display type
      chainDetail: chainDetail(result.log, names),
      stats: [aggregates(p.a, oa), aggregates(p.b, ob)] as [Aggregates, Aggregates],
    };
  }, [p.seed, p.a, p.b, p.mode, oa, ob, names]);
  const versionSkew = p.expectedHash !== undefined && (p.expectedHash >>> 0) !== full.result.hash;

  // ── refs (the loop never reads React state) ─────────────────────────────
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<FightSceneHandle | null>(null);
  const fightRef = useRef<Fight | null>(null);
  const fxRef = useRef(mkFightFx());
  const sfxRef = useRef<BotsSfx | null>(null);
  const playingRef = useRef(true);
  const speedRef = useRef<1 | 2>(1);
  const reducedRef = useRef(false);
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const uiFrameRef = useRef(-1);
  const lineRef = useRef(-2);
  const logLenRef = useRef(0);
  const endedRef = useRef(false);
  const funGate = useRef<FunGate>({ watchAnother: 0, buildOne: 0, clicks: [] });

  // ── state (throttled mirrors of the refs, for the chrome) ───────────────
  const [ready, setReady] = useState(false);
  const [small, setSmall] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [muted, setMuted] = useState(true);
  const [frame, setFrame] = useState(0);
  const [lineIdx, setLineIdx] = useState(-1);
  const [hudTick, setHudTick] = useState(0);
  const [ended, setEnded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareNote, setShareNote] = useState("");

  const syncUi = useCallback(
    (force: boolean) => {
      const f = fightRef.current;
      if (!f) return;
      const fx = fxRef.current;
      const fr = f.st.frame;
      if (force || fr - uiFrameRef.current >= UI_EVERY_F || fr < uiFrameRef.current) {
        uiFrameRef.current = fr;
        setFrame(fr);
      }
      // the commentary clock keeps running after the last engine frame (the
      // queued break and knockout lines land while the loser sits), so it
      // reads presentation time, which equals the sim frame until the end
      const lineClock = Math.max(fr, Math.floor(fx.time * 60));
      let idx = -1;
      for (let i = 0; i < full.disp.length; i++) {
        if (full.disp[i] <= lineClock) idx = i;
        else break;
      }
      if (idx !== lineRef.current) {
        lineRef.current = idx;
        setLineIdx(idx);
      }
      if (f.st.log.length !== logLenRef.current) {
        logLenRef.current = f.st.log.length;
        setHudTick((n) => n + 1);
      }
      // the card waits for the KO line, so the bar never calls a hit under a card that names the winner
      const over = f.st.done === 1 && (fx.ko >= KO_OVER_FX || fx.timeout >= 1) && koLineUp(full.disp, idx);
      if (over !== endedRef.current) {
        endedRef.current = over;
        setEnded(over);
      }
    },
    [full.disp],
  );

  /** Rebuild the playback fight and step it to `frame`; the events are
   * replayed into the fx silently and settled, so the picture is a still. */
  const seekTo = useCallback(
    (target: number) => {
      const scene = sceneRef.current;
      const fx = fxRef.current;
      scene?.reset();
      resetFightFx(fx);
      const f = createFight(p.seed, p.a, p.b, oa, ob, p.mode);
      const want = Math.max(0, Math.min(target, full.result.frames));
      while (f.st.frame < want && !f.st.done) stepFight(f);
      if (scene) for (const e of f.st.log) scene.onEvent(e, f.st, fx);
      fightRef.current = f;
      // a seek that lands on the end is a settled still: past the last
      // queued commentary line, so the closing lines have all been said
      const lastLine = full.disp.length ? full.disp[full.disp.length - 1] : 0;
      fx.time = f.st.done ? Math.max(f.st.frame + 180, lastLine + 6) / 60 : f.st.frame / 60;
      scene?.settle(fx);
      accRef.current = 0;
      logLenRef.current = -1;
      syncUi(true);
      if (scene && reducedRef.current) scene.render(f.st, fx);
    },
    [p.seed, p.a, p.b, p.mode, oa, ob, full.result.frames, full.disp, syncUi],
  );

  /** One engine frame, live: new events go to the scene and the speaker. */
  const stepOnce = useCallback(() => {
    const f = fightRef.current;
    const scene = sceneRef.current;
    if (!f || !scene) return;
    const fx = fxRef.current;
    const before = f.st.log.length;
    if (!f.st.done) stepFight(f);
    for (let i = before; i < f.st.log.length; i++) {
      const e = f.st.log[i];
      scene.onEvent(e, f.st, fx);
      const s = soundOf(e);
      if (s) sfxRef.current?.play(s);
    }
    tickFightFx(fx, FIXED_DT);
    if (!f.st.done) {
      for (let side = 0; side < 2; side++) {
        const ss = f.st.sides[side];
        if (ss.staggerT === 0 && ss.swingT === TELL_F) {
          sfxRef.current?.play("tick");
          scene.glint(side as Side);
        }
      }
    }
  }, []);

  // ── the scene and the loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || versionSkew) return;
    let dead = false;
    let raf = 0;
    let running = false;
    let ro: ResizeObserver | null = null;
    const isSmall = typeof matchMedia !== "undefined" && matchMedia("(max-width: 899px)").matches;
    const isReduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    setSmall(isSmall);
    setReduced(isReduced);
    reducedRef.current = isReduced;

    const loop = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      const scene = sceneRef.current;
      const f = fightRef.current;
      const fx = fxRef.current;
      if (!scene || !f) {
        lastRef.current = now;
        return;
      }
      let frameDt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!(frameDt > 0) || frameDt > 0.25) frameDt = FIXED_DT; // first tick / huge-gap guard
      if (playingRef.current && !reducedRef.current) {
        if (fx.hitStop > 0) {
          // the whole scene freezes: nothing accumulates, the stop counts down in wall time
          fx.hitStop = Math.max(0, fx.hitStop - frameDt);
        } else {
          const slow = fx.ko >= 0 && fx.ko < KO_SLOW_FX ? SLOWMO_RATE : 1;
          accRef.current += frameDt * speedRef.current * slow;
          let steps = 0;
          while (accRef.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
            stepOnce();
            accRef.current -= FIXED_DT;
            steps++;
            if (fx.hitStop > 0) {
              accRef.current = 0;
              break;
            }
          }
          if (steps >= MAX_SUBSTEPS) accRef.current = 0;
        }
      }
      scene.render(f.st, fx);
      syncUi(false);
    };
    function start() {
      if (running || isReduced) return;
      running = true;
      lastRef.current = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };

    pixiChain = pixiChain
      .then(async () => {
        if (dead) return null;
        return buildFightScene(canvas, { small: isSmall, fightSeed: p.seed });
      })
      .then(async (scene) => {
        if (!scene) return;
        if (dead) {
          scene.destroy();
          return;
        }
        await scene.setBuilds(p.a, p.b, looks);
        if (dead) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        const fit = () => {
          const r = wrap.getBoundingClientRect();
          scene.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1));
        };
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(wrap);
        // reduced motion: one settled frame at the end, no loop at all;
        // a live spectator joins at the clock's frame, everyone else at the bell
        seekTo(isReduced ? full.result.frames : Math.max(0, Math.min(p.startAtFrame ?? 0, full.result.frames)));
        scene.render(fightRef.current!.st, fxRef.current);
        document.addEventListener("visibilitychange", onVis);
        if (!document.hidden) start();
        setReady(true);
      });
    return () => {
      dead = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
      ro?.disconnect();
      setReady(false);
      pixiChain = pixiChain.then(() => {
        sceneRef.current?.destroy();
        sceneRef.current = null;
      });
    };
    // the fight inputs are stable for the life of the page; the loop effect runs once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the speaker: silent until the sound button unmutes it; on unmount the
  // AudioContext closes (Chrome caps contexts per document, the S7 leak audit)
  useEffect(() => {
    sfxRef.current = createBotsSfx(false);
    return () => {
      sfxRef.current?.dispose();
      sfxRef.current = null;
    };
  }, []);

  // ── controls ────────────────────────────────────────────────────────────
  const play = useCallback(() => {
    if (endedRef.current) seekTo(0);
    playingRef.current = true;
    setPlaying(true);
  }, [seekTo]);
  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
  }, []);
  const setRate = useCallback((r: 1 | 2) => {
    speedRef.current = r;
    setSpeed(r);
  }, []);
  const skipToEnd = useCallback(() => {
    seekTo(Math.max(0, full.result.frames - 60));
    playingRef.current = true;
    setPlaying(true);
  }, [seekTo, full.result.frames]);
  const toggleSound = useCallback(() => {
    const s = sfxRef.current;
    if (!s) return;
    const next = !s.muted();
    s.setMuted(next);
    setMuted(next);
  }, []);

  const share = useCallback(async () => {
    const winner = names[full.result.winner];
    const loser = names[full.result.winner === 0 ? 1 : 0];
    // the share link is absolute: a path only means something inside this tab
    const url = /^https?:\/\//.test(p.replayUrl) ? p.replayUrl : `${window.location.origin}${p.replayUrl}`;
    const text = fill(t.card.shareText, { winner, loser, url });
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: t.nav.wordmark, text, url });
        setShareNote("Shared.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareNote("Link copied.");
    } catch {
      setShareNote("Copy the link from the address bar.");
    }
  }, [names, full.result.winner, p.replayUrl]);

  const logGate = useCallback((what: "watchAnother" | "buildOne") => {
    const g = funGate.current;
    g[what] += 1;
    const at = fightRef.current?.st.frame ?? 0;
    g.clicks.push({ what, frame: at, at: Date.now() });
    // eslint-disable-next-line no-console
    console.log("[bots funGate]", what, { count: g[what], frame: at });
    try {
      sessionStorage.setItem("bots.funGate", JSON.stringify(g));
    } catch {
      /* storage blocked: the console line stands */
    }
  }, []);

  // ── the screenshot and verifier hook (dev only; bots-shot.mjs waits on it) ─
  useEffect(() => {
    if (!ready) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bots = {
      ready: true,
      hash: full.hashHex,
      frames: full.result.frames,
      winner: full.result.winner,
      end: full.result.end,
      plate: sceneRef.current?.plate ?? false,
      seek: (f: number) => {
        pause();
        seekTo(f);
        const scene = sceneRef.current;
        if (scene && fightRef.current) scene.render(fightRef.current.st, fxRef.current);
      },
      play,
      pause,
      speed: setRate,
      state: () => ({
        frame: fightRef.current?.st.frame ?? 0,
        done: fightRef.current?.st.done === 1,
        ended: endedRef.current,
        line: lineRef.current,
      }),
      funGate: funGate.current,
    };
    return () => {
      delete w.__bots;
    };
  }, [ready, full.hashHex, full.result.frames, full.result.winner, full.result.end, seekTo, play, pause, setRate]);

  // ── the chrome ──────────────────────────────────────────────────────────
  const st = fightRef.current?.st;
  const totalFrames = full.result.frames;
  const line = lineIdx >= 0 ? full.lines[lineIdx].text : "";
  const secs = Math.floor(totalFrames / 60);
  const winnerName = names[full.result.winner];
  const loserName = names[full.result.winner === 0 ? 1 : 0];

  if (versionSkew) {
    return (
      <PageShell wide>
        <div className={css.viewer}>
          <Panel title={t.nav.wordmark} style={{ marginTop: 24 }}>
            <p style={{ fontFamily: FONT_DISPLAY, fontSize: 20, margin: "0 0 8px" }}>Please reload the page to watch this fight.</p>
            <p style={{ color: M.lore, margin: 0 }}>{full.chain}</p>
          </Panel>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      <div className={css.viewer}>
        {/* the identity strips */}
        <div className={css.ids}>
          <IdentityStrip id={p.ids[0]} build={p.a} right={false} />
          <div
            className={css.idMode}
            style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: M.muted }}
          >
            {p.modeLabel}
          </div>
          <IdentityStrip id={p.ids[1]} build={p.b} right />
        </div>

        {/* THE hairline: the lit pit inside the dark frame */}
        <div ref={wrapRef} className={css.frame} data-hud={hudTick}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} aria-label="The ring" />
          <div className={css.hudBar}>
            <LifeBar name={names[0]} armor={st?.sides[0].armor} armorMax={st?.sides[0].armorMax} right={false} />
            <LifeBar name={names[1]} armor={st?.sides[1].armor} armorMax={st?.sides[1].armorMax} right />
          </div>
          {/* THE KNOCKOUT, said over the pit. The result card is a card: it
              can only ever say what happened, and it says it under the ring
              after the fact. This is the moment itself, on the picture, while
              the bulbs are still blinking and the stands still have their
              arms up. It comes up with the card and goes when the card goes. */}
          {ended ? (
            <div className={css.koTitle}>
              <div style={{ fontFamily: FONT_DISPLAY }} className={css.koWord}>
                {full.result.end === "ko" ? t.fight.koWord : t.fight.timeWord}
              </div>
              <div style={{ fontFamily: FONT_DISPLAY }} className={css.koWho}>
                {fill(t.fight.winnerLine, { winner: winnerName })}
              </div>
            </div>
          ) : null}
          {!ready ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: "#bfb5a6",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {t.landingUi.opening}
            </div>
          ) : null}
        </div>

        {/* the commentary bar: one sentence, at least 44px, and it wraps */}
        <div className={css.commentary} aria-live="polite" style={{ fontFamily: FONT_BODY }}>
          {line}
        </div>

        {/* the controls row */}
        <div className={css.controls}>
          <button
            type="button"
            className={css.ctl}
            onClick={playing && !ended ? pause : play}
            disabled={reduced}
            aria-label={playing && !ended ? "Pause" : "Play"}
            title={playing && !ended ? "Pause" : "Play"}
          >
            {playing && !ended ? <PauseGlyph /> : <IconPlay size={22} />}
          </button>
          <button
            type="button"
            className={`${css.ctl} ${css.ctlWide} ${speed === 2 ? css.ctlOn : ""}`}
            onClick={() => setRate(speed === 2 ? 1 : 2)}
            disabled={reduced}
            aria-pressed={speed === 2}
            aria-label="Speed"
            style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700 }}
          >
            {speed === 2 ? "Fast" : "Normal"}
          </button>
          <button
            type="button"
            className={css.ctl}
            onClick={skipToEnd}
            disabled={reduced || ended}
            aria-label="Skip to the end"
            title="Skip to the end"
          >
            <SkipGlyph />
          </button>
          <div className={css.scrub}>
            <div className={css.played} style={{ width: `${totalFrames ? (Math.min(frame, totalFrames) / totalFrames) * 100 : 0}%` }} />
            {full.ticks.map((k, i) => (
              <span
                key={i}
                className={css.tick}
                style={{ left: `${(k.f / totalFrames) * 100}%`, background: k.gold ? TIER_COLOR[4] : M.bad }}
              />
            ))}
            <input
              className={css.range}
              type="range"
              min={0}
              max={totalFrames}
              step={1}
              value={Math.min(frame, totalFrames)}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Move through the fight"
              aria-valuetext={`${clock(frame)} of ${clock(totalFrames)}`}
            />
          </div>
          <span className={css.time}>
            {clock(Math.min(frame, totalFrames))} / {clock(totalFrames)}
          </span>
          <button
            type="button"
            className={`${css.ctl} ${!muted ? css.ctlOn : ""}`}
            onClick={toggleSound}
            aria-pressed={!muted}
            aria-label={muted ? "Sound off" : "Sound on"}
            title={muted ? "Sound off" : "Sound on"}
          >
            <SoundGlyph on={!muted} />
          </button>
          <button
            type="button"
            className={css.ctl}
            onClick={share}
            disabled={!ended}
            aria-label={t.fight.share}
            title={t.fight.share}
          >
            <IconShare size={20} />
          </button>
        </div>
        {reduced ? (
          <p style={{ fontSize: 13, color: M.muted, margin: "2px 4px 0" }}>Moving pictures are turned off on your device. Drag the bar to move through the fight.</p>
        ) : null}

        {/* the result card, offered after the KO */}
        {ended ? (
          <Panel style={{ marginTop: 14 }}>
            <p
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                color: M.muted,
                margin: "0 0 6px",
              }}
            >
              {full.result.end === "ko" ? `Knockout after ${secs} seconds` : `Time ran out after ${secs} seconds`}
            </p>
            <p style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, margin: "0 0 8px", color: M.text }}>
              {fill(t.fight.beatLine, { winner: winnerName, loser: loserName })}
            </p>
            <p style={{ fontSize: 15, color: M.lore, margin: "0 0 10px", lineHeight: 1.45 }}>{full.chainDetail}</p>
            {full.result.log.some((e) => e.t === "timeout" && e.why === TIMEOUT_WHY.CHALLENGED) ? (
              <p style={{ fontSize: 14, color: M.lore, margin: "0 0 10px", lineHeight: 1.45 }}>{t.fight.tieRule}</p>
            ) : null}
            {/* no bullets and no indent: the browser's marker is hidden by the
                page reset, so the indent only pushed two plain sentences out
                of line with every other line on the card */}
            {p.rewardLines && p.rewardLines.length ? (
              <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none", fontSize: 14, color: M.text, lineHeight: 1.5 }} data-testid="fight-rewards">
                {p.rewardLines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            ) : null}
            <details style={{ margin: 0 }} data-testid="fight-hash">
              <summary style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted, cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
                Fight code {full.hashHex}
              </summary>
              <p style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted, margin: "6px 0 0" }}>
                engine v{full.result.engineVersion}, {full.result.log.length} events
              </p>
            </details>
            <div className={css.resultActions}>
              <Button variant="primary" onClick={play}>
                <IconReplay size={18} />
                {t.fight.replay}
              </Button>
              <Button onClick={share}>
                <IconShare size={18} />
                {t.fight.share}
              </Button>
              <Link
                href={p.watchAnotherHref}
                onClick={() => logGate("watchAnother")}
                className={css.ctl}
                style={{ width: "auto", padding: "0 16px", fontWeight: 700, fontSize: 14, textDecoration: "none", fontFamily: FONT_BODY }}
                data-fun-gate="watchAnother"
              >
                Watch another fight
              </Link>
              <Link
                href="/bots/garage/build"
                onClick={() => logGate("buildOne")}
                className={css.ctl}
                style={{ width: "auto", padding: "0 16px", fontWeight: 700, fontSize: 14, textDecoration: "none", fontFamily: FONT_BODY }}
                data-fun-gate="buildOne"
              >
                Build a robot
              </Link>
            </div>
            {shareNote ? (
              <p style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted, margin: "10px 0 0" }}>{shareNote}</p>
            ) : null}
          </Panel>
        ) : null}

        {/* the stat sheet disclosure */}
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setSheetOpen((o) => !o)}
            aria-expanded={sheetOpen}
            className={css.ctl}
            style={{ width: "auto", padding: "0 16px", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 14 }}
          >
            {sheetOpen ? "Hide the numbers" : "The numbers"}
          </button>
          {sheetOpen ? (
            <Panel style={{ marginTop: 10 }}>
              <StatSheet ids={p.ids} stats={full.stats} builds={[p.a, p.b]} small={small} />
            </Panel>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}

/* ── the identity strip: bot name Syne 16, wallet name, tier dot, record ── */

function IdentityStrip({ id, build, right }: { id: FightIdentity; build: Build; right: boolean }) {
  const tier = botTier(buildTotal(build));
  /**
   * THE SAME TWO RULES THE KNOCKOUT CARD ALREADY KEEPS (card/ko/route.tsx).
   * A game robot has no owner: the stored fight names its side "House", which
   * printed where a player's name goes and left a reader guessing. The word
   * for one of the nine everywhere else is "game robot". The literal is local
   * on purpose: fights.ts, which exports it, pulls node:crypto and this is a
   * client component.
   * And a record of nothing is not a record, so 0 wins and 0 losses is left
   * off rather than printed under a robot's first ever fight.
   */
  const owner = id.wallet === "House" ? t.fight.gameRobotOwner : id.wallet;
  const hasRecord = id.wins + id.losses > 0;
  // layout lives in fight.module.css (.idName, .idMeta, .idText, .idRecord):
  // each row is one line, nowrap, and the name and the wallet name ellipsise
  // rather than wrap, so a 177 px column on a 390 phone still reads as two
  // lines (week 2: the wallet and the record wrapped to a third line)
  return (
    <div className={`${css.idStrip} ${right ? css.idRight : ""}`}>
      <div className={css.idName} style={{ fontFamily: FONT_DISPLAY, color: M.text }}>
        {right ? null : <Dot color={TIER_COLOR[tier]} />}
        <span className={css.idText}>{id.name}</span>
        {right ? <Dot color={TIER_COLOR[tier]} /> : null}
      </div>
      <div className={css.idMeta}>
        <span className={css.idText} style={{ fontFamily: FONT_BODY, color: M.muted }}>
          {owner}
        </span>
        {hasRecord ? (
          <span className={css.idRecord} style={{ color: M.muted }}>
            {winLossWords(id.wins, id.losses)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ── the life bar: who is winning, answered in one look ─────────────────── */

/**
 * THE BAR IS THE BODY. The engine ends a fight the moment a body reaches
 * zero (resolve.ts: `if (piece === PIECE.BODY) st.done = 1`), so the body's
 * armour is not one number among seven, it is THE number, and it is the only
 * honest thing to put in a bar labelled with the word the commentary already
 * uses: life.
 *
 * The six lamps under it are the other pieces, in the order a person reads a
 * robot: head, body, the two arms, the two legs. A lamp drains with its own
 * piece and goes to a hatched blank when that piece comes off, which is the
 * same fact the pit shows when the part tumbles across the floor.
 */
const HUD_LAMPS: { key: string; piece: number; label: string }[] = [
  { key: "head", piece: PIECE.HEAD, label: t.ui.socket.head },
  { key: "body", piece: PIECE.BODY, label: t.ui.socket.torso },
  { key: "armL", piece: PIECE.ARM_L, label: t.ui.socket.armL },
  { key: "armR", piece: PIECE.ARM_R, label: t.ui.socket.armR },
  { key: "legL", piece: PIECE.LEG_L, label: t.ui.socket.legL },
  { key: "legR", piece: PIECE.LEG_R, label: t.ui.socket.legR },
];

function hudColor(pct: number): string {
  if (pct >= 0.6) return M.good;
  if (pct >= 0.3) return M.warn;
  return M.bad;
}

const pctOf = (armor: number[] | undefined, armorMax: number[] | undefined, piece: number): number => {
  if (!armor || !armorMax) return 1;
  const max = Math.max(1, armorMax[piece]);
  return Math.max(0, Math.min(1, armor[piece] / max));
};

function LifeBar({
  name,
  armor,
  armorMax,
  right,
}: {
  name: string;
  armor?: number[];
  armorMax?: number[];
  right: boolean;
}) {
  const life = pctOf(armor, armorMax, PIECE.BODY);
  const shown = Math.round(life * 100);
  return (
    <div className={`${css.hudSide} ${right ? css.hudRight : ""}`}>
      <div className={css.hudTop}>
        <span className={css.hudName}>{name}</span>
        <span className={css.hudLife}>{t.ui.stat.health}</span>
      </div>
      <div
        className={css.hudTrack}
        role="img"
        aria-label={`${name}: ${shown} of 100 life left`}
      >
        <div className={css.hudFill} style={{ width: `${shown}%`, background: hudColor(life) }} />
      </div>
      <div className={css.hudPips} aria-hidden>
        {HUD_LAMPS.map((lamp) => {
          const pct = pctOf(armor, armorMax, lamp.piece);
          const gone = !!armor && armor[lamp.piece] <= 0;
          return (
            <span key={lamp.key} className={`${css.hudPip} ${gone ? css.hudPipGone : ""}`} title={lamp.label}>
              {gone ? null : (
                <span className={css.hudPipFill} style={{ width: `${Math.round(pct * 100)}%`, background: hudColor(pct) }} />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── the stat sheet: nine stats side by side, mono, with the icons ──────── */

const SHEET_ROWS: { key: keyof typeof STAT_ICON; agg: keyof Aggregates; label: string }[] = [
  { key: "speed", agg: "speed", label: t.ui.stat.speed },
  { key: "strength", agg: "str", label: t.ui.stat.strength },
  { key: "dodge", agg: "dodge", label: t.ui.stat.dodge },
  { key: "damage", agg: "dmg", label: t.ui.stat.damage },
  { key: "block", agg: "block", label: t.ui.stat.block },
  { key: "health", agg: "health", label: t.ui.stat.health },
  { key: "luck", agg: "luck", label: t.ui.stat.luck },
  { key: "accuracy", agg: "acc", label: t.ui.stat.accuracy },
  { key: "attackSpeed", agg: "atkSpd", label: t.ui.stat.attackSpeed },
];

function StatSheet({
  ids,
  stats,
  builds,
  small,
}: {
  ids: [FightIdentity, FightIdentity];
  stats: [Aggregates, Aggregates];
  builds: [Build, Build];
  small: boolean;
}) {
  const head = (i: 0 | 1) => (
    <div style={{ textAlign: "right", fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, color: M.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {small ? (i === 0 ? "A" : "B") : ids[i].name}
    </div>
  );
  return (
    <div className={css.sheetGrid}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted }}>NUMBERS</div>
      {head(0)}
      {head(1)}
      {SHEET_ROWS.map((row) => {
        const Icon = STAT_ICON[row.key];
        return (
          <RowCells key={row.key} icon={<Icon size={16} />} label={row.label} a={stats[0][row.agg]} b={stats[1][row.agg]} />
        );
      })}
      <RowCells label={t.ui.total} a={buildTotal(builds[0])} b={buildTotal(builds[1])} />
      <div style={{ color: M.muted, fontFamily: FONT_BODY, fontSize: 12.5 }}>Auto trading</div>
      <div style={{ textAlign: "right", fontFamily: FONT_BODY, fontSize: 12, color: M.lore, gridColumn: "2 / 3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ids[0].strategy}</div>
      <div style={{ textAlign: "right", fontFamily: FONT_BODY, fontSize: 12, color: M.lore, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ids[1].strategy}</div>
    </div>
  );
}

function RowCells({ icon, label, a, b }: { icon?: React.ReactNode; label: string; a: number; b: number }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: M.muted, fontFamily: FONT_BODY, fontSize: 12.5 }}>
        {icon}
        {label}
      </div>
      <div style={{ textAlign: "right", color: a > b ? M.text : M.lore }}>{a}</div>
      <div style={{ textAlign: "right", color: b > a ? M.text : M.lore }}>{b}</div>
    </>
  );
}

/* ── two drawn glyphs the icon set does not carry yet ───────────────────── */

function PauseGlyph() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <rect x="6" y="5" width="4.5" height="14" rx="1.5" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.5" />
    </svg>
  );
}

function SkipGlyph() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M5 5.5v13l9-6.5z" />
      <rect x="16" y="5" width="3" height="14" rx="1.5" />
    </svg>
  );
}

function SoundGlyph({ on }: { on: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none" />
      {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </svg>
  );
}

/* ── the real page: a stored fight from GET /api/bots/fight/[id] ────────── */

/** Fights created inside this window are "live": a spectator joins at the
 * frame the clock says (the same 90 s as _server/battles.ts LIVE_WINDOW_MS,
 * spelled here because that module is server-only). */
const LIVE_MS = 90 * 1000;

type LoadState = { kind: "loading" } | { kind: "error"; status: number; message: string } | { kind: "ready"; view: FightView; startAt: number };

const pointsWords = fightPointWord;

/** Plain words for what the fight paid, read off the STORED rewards JSON
 * (the guide's tables were applied by the server; nothing is recomputed
 * here). Whole numbers, wallet names only, never a dollar. */
export function rewardLinesOf(v: FightView): string[] {
  const a = v.names[0];
  const b = v.names[1];
  const r = v.rewards;
  const won = v.winner === 0;
  if (v.mode === "spar") return ["This was a practice fight. No coins, no fight points, and nothing needs fixing."];
  const lines: string[] = [];
  if (v.mode === "pvp") {
    if (won) {
      const extra = Math.max(0, r.stakePayout - v.stake);
      lines.push(`${a} gets the ${v.stake} coins back and wins ${extra} more${r.houseBonus > 0 ? `, including ${r.houseBonus} extra coins` : ""}.`);
      lines.push(`${pointsWords(r.attackerPoints)} for ${a}.`);
    } else {
      lines.push(`${a} loses the ${v.stake} coins. ${b} takes them${r.defenderCoins > 0 ? `, and gets ${r.defenderCoins} coins for winning` : ""}.`);
      lines.push(`${pointsWords(r.attackerPoints)} for ${a}. ${b} was a saved copy, so that player paid nothing and their robot is fine.`);
    }
  } else {
    lines.push(
      won && r.attackerPoints > 0
        ? `${a} won ${r.attackerCoins} coins and ${pointsWords(r.attackerPoints)}.`
        : `${a} got ${r.attackerCoins} coins for fighting.`,
    );
    // the part's title already carries the maker, the stars and the socket it
    // fills, so a badge beside it would say the number twice. "Dropped" said
    // it fell on the floor and broke, the opposite of the good news it carries.
    if (r.drop) lines.push(`You won a free part: ${r.drop.name}. It is with your parts.`);
  }
  if (r.attackerRepair) lines.push(`${a} is being fixed. It can fight again tomorrow.`);
  return lines;
}

/**
 * Loads a stored fight and hands FightClient the same props the server
 * resolved from (engine doc 7): the client replays from the seed and the
 * hash comparison inside FightClient catches version skew. Sparring is
 * private, so the play session rides along when there is one (a 403 says
 * so in plain words). Fail-soft on every other answer.
 */
export function ServerFight({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let dead = false;
    (async () => {
      let status = 0;
      try {
        const res = await fetch(`/api/bots/fight/${encodeURIComponent(id)}`, { headers: authHeaders(readBotsSession()), cache: "no-store" });
        status = res.status;
        const j = (await res.json().catch(() => null)) as (Partial<FightView> & { error?: string }) | null;
        if (dead) return;
        if (!res.ok || !j || j.ok !== true) {
          setState({ kind: "error", status, message: (j && j.error) || "Fight not found." });
          return;
        }
        const view = j as FightView;
        const age = Date.now() - Date.parse(view.createdAt);
        const startAt = Number.isFinite(age) && age >= 0 && age < LIVE_MS ? Math.min(view.frames, Math.floor((age * 60) / 1000)) : 0;
        setState({ kind: "ready", view, startAt });
      } catch {
        if (!dead) setState({ kind: "error", status, message: "The fight did not load. Try again." });
      }
    })();
    return () => {
      dead = true;
    };
  }, [id]);

  if (state.kind !== "ready") {
    const loading = state.kind === "loading";
    return (
      <PageShell wide>
        <div className={css.viewer}>
          <Panel title={t.nav.wordmark} style={{ marginTop: 24 }}>
            <p style={{ fontFamily: FONT_DISPLAY, fontSize: 20, margin: "0 0 8px" }}>{loading ? "Opening the fight." : state.message}</p>
            <p style={{ color: M.lore, margin: "0 0 14px" }}>
              {loading ? "The stored fight is on its way." : state.status === 403 ? "Only you can watch your own practice fights." : "Every fight anyone can watch is on the Fights page."}
            </p>
            {!loading ? (
              <Link
                href="/bots/battles"
                className={css.ctl}
                style={{ width: "auto", padding: "0 16px", fontWeight: 700, fontSize: 14, textDecoration: "none", fontFamily: FONT_BODY }}
              >
                {t.nav.battles}
              </Link>
            ) : null}
          </Panel>
        </div>
      </PageShell>
    );
  }
  const v = state.view;
  return (
    <FightClient
      seed={v.seed}
      a={v.buildA}
      b={v.buildB}
      ids={v.ids}
      looks={v.looks}
      mode={v.mode}
      modeLabel={v.modeLabel}
      orders={v.orders}
      expectedHash={v.hash}
      replayUrl={`/bots/fight/${v.id}`}
      watchAnotherHref="/bots/battles"
      startAtFrame={state.startAt}
      rewardLines={rewardLinesOf(v)}
    />
  );
}
