"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "./_components/PageShell";
import { buildFightScene, type FightSceneHandle } from "./_view/arena3d";
import { mkFightFx } from "./_view/fightfx";
import { rigLookFromBuild } from "./_view/look-view";
import { createFight } from "@/lib/bots/combat";
import { SHOWCASE } from "@/lib/bots/showcase";
import home from "./landing.module.css";

/** A stable pair of real assembled toys. Only the presentation clock moves. */
function WorkshopShowroom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // StrictMode may cancel an asynchronous mount before it finishes. The next
  // mount waits for that owner to dispose, and a failure never poisons the queue.
  const initialization = useRef<Promise<void>>(Promise.resolve());
  const motionControl = useRef<(() => void) | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    pausedRef.current = paused;
    motionControl.current?.();
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let cancelled = false;
    let scene: FightSceneHandle | null = null;
    let observer: ResizeObserver | null = null;
    let intersection: IntersectionObserver | null = null;
    let inViewport = true;
    let initializing = false;
    let contextUnavailable = false;
    let frame = 0;
    let lastTime = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const state = createFight(7, SHOWCASE.a, SHOWCASE.b).st;
    const fx = mkFightFx();

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };
    const dispose = () => {
      stop();
      observer?.disconnect();
      observer = null;
      intersection?.disconnect();
      intersection = null;
      const owned = scene;
      scene = null;
      owned?.destroy();
    };
    const fail = () => {
      dispose();
      if (!cancelled) setStatus("error");
    };
    const draw = () => {
      if (!cancelled && !contextUnavailable && scene) scene.render(state, fx);
    };
    const tick = (now: number) => {
      frame = 0;
      if (cancelled || contextUnavailable || !scene || !inViewport || document.hidden || pausedRef.current || reducedMotion.matches) return;
      try {
        // Slow idle needs thirty draws a second, even on a 120 Hz display.
        // Hidden or offscreen time never advances the pose when it returns.
        if (!lastTime || now - lastTime >= 1000 / 30 - 1) {
          if (lastTime) fx.time += Math.min((now - lastTime) / 1000, 0.1);
          lastTime = now;
          draw();
        }
        frame = requestAnimationFrame(tick);
      } catch {
        fail();
      }
    };
    const resume = () => {
      stop();
      if (cancelled || contextUnavailable || !scene || !inViewport || document.hidden) return;
      try {
        draw();
        if (!pausedRef.current && !reducedMotion.matches) frame = requestAnimationFrame(tick);
      } catch {
        fail();
      }
    };
    const resize = () => {
      if (cancelled || !scene) return;
      const { width, height } = wrap.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      try {
        scene.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
        draw();
      } catch {
        fail();
      }
    };

    const motionChanged = () => {
      setReduced(reducedMotion.matches);
      resume();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      contextUnavailable = true;
      stop();
      if (!initializing) dispose();
      if (!cancelled) setStatus("error");
    };
    setStatus("loading");
    setReduced(reducedMotion.matches);
    motionControl.current = resume;
    document.addEventListener("visibilitychange", resume);
    reducedMotion.addEventListener("change", motionChanged);
    canvas.addEventListener("webglcontextlost", contextLost);

    initialization.current = initialization.current.catch(() => {}).then(async () => {
      if (cancelled) return;
      initializing = true;
      try {
        scene = await buildFightScene(canvas, {
          small: wrap.clientWidth < 760,
          fightSeed: 7,
          showroom: true,
        });
        if (cancelled || contextUnavailable) { dispose(); return; }
        await scene.setBuilds(SHOWCASE.a, SHOWCASE.b, [
          rigLookFromBuild(SHOWCASE.a, "mint"),
          rigLookFromBuild(SHOWCASE.b, "coral"),
        ]);
        if (cancelled || contextUnavailable) { dispose(); return; }
        observer = new ResizeObserver(resize);
        observer.observe(wrap);
        if (typeof IntersectionObserver !== "undefined") {
          intersection = new IntersectionObserver(entries => {
            inViewport = entries[0]?.isIntersecting ?? true;
            resume();
          }, { threshold: 0 });
          intersection.observe(wrap);
        }
        resize();
        if (!scene) return;
        setStatus("ready");
        resume();
      } catch {
        fail();
      } finally {
        initializing = false;
        if (cancelled || contextUnavailable) dispose();
      }
    });

    return () => {
      cancelled = true;
      if (motionControl.current === resume) motionControl.current = null;
      document.removeEventListener("visibilitychange", resume);
      reducedMotion.removeEventListener("change", motionChanged);
      canvas.removeEventListener("webglcontextlost", contextLost);
      stop();
      observer?.disconnect();
      intersection?.disconnect();
      // Shader compilation owns its resources until the initialization settles.
      // Disposing during compileAsync can strand the next mount behind it.
      if (!initializing) dispose();
    };
  }, [attempt]);

  return (
    <figure className={home.showroom} aria-label="Two robots, ready for the ring">
      <div className={home.stage} ref={wrapRef} aria-busy={status === "loading"}>
        <canvas
          ref={canvasRef}
          className={home.canvas}
          role="img"
          aria-label={`${SHOWCASE.names[0]} and ${SHOWCASE.names[1]}, each built from different robot parts`}
        />
        {status !== "ready" && (
          <div className={home.sceneStatus} role="status" aria-live="polite">
            {status === "loading" ? (
              <><span className={home.loadingMark} aria-hidden="true" /><span>Opening the workshop…</span></>
            ) : (
              <><span>The workshop could not open.</span><button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button></>
            )}
          </div>
        )}
        <span className={home.stageLabel}>Made of mismatched parts. Full of character.</span>
      </div>
      <figcaption className={home.caption}>
        <span className={home.robotNames}><span>{SHOWCASE.names[0]}</span><span className={home.ampersand}>&amp;</span><span>{SHOWCASE.names[1]}</span></span>
        {status === "ready" && reduced ? <span className={home.stillLabel}>Still view</span> : status === "ready" && <button className={home.motionButton} type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? "Play motion" : "Pause motion"}</button>}
      </figcaption>
    </figure>
  );
}

export default function BotsLanding() {
  return (
    <PageShell wide>
      <div className={home.main}>
        <section className={home.hero} aria-labelledby="welcome-title">
          <div className={home.intro}>
            <p className={home.eyebrow}>Your robot. Your way.</p>
            <h1 id="welcome-title">Little robots.<br /><span>Big character.</span></h1>
            <p className={home.lede}>Pick the parts. Make it yours. Then cheer your little friend on in the ring.</p>
            <div className={home.doors}>
              <Link href="/bots/garage/build" className={home.primary}>Build your robot <span aria-hidden="true">↗</span></Link>
              <Link href={SHOWCASE.href} className={home.secondary}><span className={home.playIcon} aria-hidden="true" />Watch a fight</Link>
            </div>
            <p className={home.invitation}>Your first robot is waiting.</p>
          </div>
          <WorkshopShowroom />
        </section>
        <section className={home.story} aria-label="Make your robot your own">
          <p>Every part has a story.<br /><strong>Make them yours.</strong></p>
          <div><h2>A head you love. Two odd arms. Your robot.</h2><p>Mix heads, bodies, arms, legs and weapons. Find your favourite pieces in the shop, and build a little friend that looks like nobody else.</p></div>
          <Link href="/bots/shop">Meet the parts <span aria-hidden="true">→</span></Link>
        </section>
      </div>
    </PageShell>
  );
}
