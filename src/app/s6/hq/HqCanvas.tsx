"use client";
import { useEffect, useRef } from "react";

/**
 * HqCanvas — the living-weather overlay for the IRON SIEGE HQ stage.
 *
 * One rAF particle scene painted over the camp plate: diagonal RAIN, a live
 * FIRE (a flickering warm glow + embers streaming up off the painted campfire),
 * drifting SMOKE off the fire and a dark EXHAUST plume off the tank's engine
 * deck, and a low FOG band. Sources are locked to the plate: the campfire sits
 * at ~(0.28, 0.66) and the tank engine deck at ~(0.43, 0.49), so the motion
 * reads as coming FROM those objects, not floating beside them.
 *
 * Guards (SeaCanvas house pattern): prefers-reduced-motion paints ONE static
 * frame and never arms the loop (live change-listener re-renders on toggle);
 * document.hidden pauses; DPR capped at 2; ResizeObserver keeps the store sized.
 *
 * `active` (a live siege sprint) pushes the fire + embers toward alarm-red.
 * Pure decoration (never a scored path), so Math.random seeds are fine here.
 */
export function HqCanvas({ active = false, className }: { active?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvasEl = ref.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reducedMq.matches;

    let W = 1;
    let H = 1;
    let dpr = 1;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    // Sources locked to the painted plate (fractions of W/H, resize-safe).
    // FIRE = the campfire on the plate's left. EXHAUST rides the tank engine
    // deck, which sits large on the RIGHT of the baked plate, so the diesel
    // plume rises off the tank's body, not empty mud.
    const FIRE = { x: 0.16, y: 0.74 };
    const EXHAUST = { x: 0.7, y: 0.46 };

    type Drop = { x: number; y: number; len: number; spd: number; a: number };
    type Puff = { x: number; y: number; r: number; a: number; vy: number; vx: number; kind: number };
    type Ember = { x: number; y: number; vx: number; vy: number; a: number; s: number; life: number };
    let rain: Drop[] = [];
    let puffs: Puff[] = [];
    let embers: Ember[] = [];

    function seed() {
      rain = [];
      const n = reduced ? 60 : 170;
      for (let i = 0; i < n; i++) {
        rain.push({ x: Math.random(), y: Math.random(), len: rand(0.025, 0.06), spd: rand(0.55, 1.0), a: rand(0.08, 0.26) });
      }
      puffs = [];
      embers = [];
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth || 1;
      H = canvas.clientHeight || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── FIRE GLOW: a fast-flickering warm bloom sitting on the painted flames,
    //    so the static painted fire reads as burning. Additive. ──
    function drawFireGlow(t: number) {
      const spr = activeRef.current;
      const flick = 0.62 + 0.24 * Math.sin(t * 0.021) + 0.14 * Math.sin(t * 0.041 + 1.3);
      const x = FIRE.x * W;
      const y = FIRE.y * H;
      const r = Math.max(W, H) * (spr ? 0.16 : 0.135) * (0.9 + flick * 0.25);
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.24 * flick;
      if (spr) {
        g.addColorStop(0, `rgba(255,120,60,${a})`);
        g.addColorStop(0.4, `rgba(220,70,40,${a * 0.5})`);
      } else {
        g.addColorStop(0, `rgba(255,180,90,${a})`);
        g.addColorStop(0.4, `rgba(240,130,50,${a * 0.5})`);
      }
      g.addColorStop(1, "rgba(255,140,60,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    function spawnSmoke() {
      // fire smoke: warm, medium, frequent
      if (puffs.length < 60 && Math.random() < 0.6) {
        puffs.push({ x: FIRE.x + rand(-0.012, 0.012), y: FIRE.y - 0.02, r: rand(0.02, 0.038), a: rand(0.1, 0.2), vy: rand(0.03, 0.055), vx: rand(-0.006, 0.012), kind: 0 });
      }
      // tank exhaust: dark, thin, taller, less frequent
      if (puffs.length < 60 && Math.random() < 0.4) {
        puffs.push({ x: EXHAUST.x + rand(-0.008, 0.008), y: EXHAUST.y, r: rand(0.015, 0.028), a: rand(0.12, 0.22), vy: rand(0.05, 0.08), vx: rand(-0.002, 0.014), kind: 1 });
      }
    }

    function stepSmoke(dt: number, wind: number) {
      for (const p of puffs) {
        p.y -= p.vy * dt * 0.02;
        p.x += (p.vx + wind * 0.05) * dt * 0.02;
        p.r += (p.kind === 1 ? 0.0007 : 0.0005) * dt;
        p.a -= (p.kind === 1 ? 0.0016 : 0.0011) * dt;
      }
      puffs = puffs.filter((p) => p.a > 0.005 && p.y > -0.12);
    }

    function drawSmoke() {
      const spr = activeRef.current;
      for (const p of puffs) {
        const x = p.x * W;
        const y = p.y * H;
        const r = p.r * Math.max(W, H);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        let rr;
        let gg;
        let bb;
        if (p.kind === 1) {
          // tank exhaust: cool dark diesel smoke
          rr = 46;
          gg = 44;
          bb = 42;
        } else {
          // campfire smoke: warm grey, red bias under sprint
          rr = spr ? 90 : 96;
          gg = spr ? 54 : 76;
          bb = spr ? 48 : 62;
        }
        g.addColorStop(0, `rgba(${rr},${gg},${bb},${p.a})`);
        g.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function spawnEmbers() {
      const cap = activeRef.current ? 46 : 34;
      if (embers.length < cap && Math.random() < 0.85) {
        embers.push({
          x: FIRE.x + rand(-0.02, 0.02),
          y: FIRE.y - rand(0, 0.03),
          vx: rand(-0.014, 0.02),
          vy: rand(0.06, 0.14),
          a: 1,
          s: rand(1.0, 2.6),
          life: rand(0.5, 1),
        });
      }
    }

    function stepEmbers(dt: number, wind: number) {
      for (const e of embers) {
        e.y -= e.vy * dt * 0.02;
        e.x += (e.vx + wind * 0.07) * dt * 0.02;
        e.vy *= 0.995; // slow as they rise
        e.a -= (0.009 / e.life) * dt;
      }
      embers = embers.filter((e) => e.a > 0.02 && e.y > -0.05);
    }

    function drawEmbers(t: number) {
      const spr = activeRef.current;
      ctx.globalCompositeOperation = "lighter";
      for (const e of embers) {
        const x = e.x * W;
        const y = e.y * H;
        const tw = 0.55 + 0.45 * Math.sin(t * 0.03 + x * 0.6);
        ctx.globalAlpha = Math.max(0, e.a) * tw;
        ctx.fillStyle = spr ? "rgba(255,110,54,1)" : "rgba(255,196,110,1)";
        ctx.beginPath();
        ctx.arc(x, y, e.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    function drawRain(wind: number) {
      ctx.strokeStyle = "rgba(194,212,228,1)";
      ctx.lineWidth = 1;
      for (const d of rain) {
        ctx.globalAlpha = d.a;
        const x = d.x * W;
        const y = d.y * H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - wind * 15, y + d.len * H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function stepRain(dt: number, wind: number) {
      for (const d of rain) {
        d.y += d.spd * dt * 0.02;
        d.x += wind * 0.0016 * dt;
        if (d.y > 1.05) {
          d.y = -0.05;
          d.x = Math.random();
        }
        if (d.x > 1.05) d.x = -0.03;
      }
    }

    function drawFog(t: number) {
      const drift = reduced ? 0 : Math.sin(t * 0.0004) * 0.04;
      const bands = [
        { y: 0.82, a: 0.06 },
        { y: 0.62, a: 0.04 },
      ];
      for (const b of bands) {
        const g = ctx.createLinearGradient(0, b.y * H, 0, (b.y + 0.2) * H);
        g.addColorStop(0, "rgba(150,160,170,0)");
        g.addColorStop(0.5, `rgba(150,160,170,${b.a})`);
        g.addColorStop(1, "rgba(150,160,170,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-0.1 * W + drift * W, b.y * H, W * 1.2, 0.22 * H);
      }
    }

    function frameStatic() {
      ctx.clearRect(0, 0, W, H);
      drawFog(0);
      drawFireGlow(0);
      // a couple of static smoke puffs off the fire + one off the tank
      const src = [FIRE, EXHAUST];
      for (let s = 0; s < src.length; s++) {
        for (let i = 0; i < 3; i++) {
          const x = src[s].x * W;
          const y = (src[s].y - i * 0.06) * H;
          const r = (0.028 + i * 0.02) * Math.max(W, H);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          const c = s === 1 ? "60,58,55" : "96,76,62";
          g.addColorStop(0, `rgba(${c},${0.1 - i * 0.02})`);
          g.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      drawRain(0.5);
    }

    let raf = 0;
    let last = 0;
    let running = false;
    function loop(ts: number) {
      if (!running) return;
      const dt = last ? Math.min(3, (ts - last) / 16.67) : 1;
      last = ts;
      const wind = 0.5 + Math.sin(ts * 0.0003) * 0.3;
      ctx.clearRect(0, 0, W, H);
      drawFog(ts);
      drawFireGlow(ts);
      stepSmoke(dt, wind);
      spawnSmoke();
      drawSmoke();
      stepEmbers(dt, wind);
      spawnEmbers();
      drawEmbers(ts);
      stepRain(dt, wind);
      drawRain(wind);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function boot() {
      resize();
      seed();
      if (reduced) {
        frameStatic();
        return;
      }
      start();
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) frameStatic();
    });
    ro.observe(canvas);

    const onVis = () => {
      if (reduced) return;
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVis);

    const onReduce = () => {
      reduced = reducedMq.matches;
      stop();
      seed();
      if (reduced) frameStatic();
      else start();
    };
    reducedMq.addEventListener?.("change", onReduce);

    boot();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      reducedMq.removeEventListener?.("change", onReduce);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className ? `s5hq-canvas ${className}` : "s5hq-canvas"} />;
}
