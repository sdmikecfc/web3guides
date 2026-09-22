"use client";
/**
 * ASCENT (THE SPIRE) - the free-play page client. Presentation ONLY: the sim
 * rules, this file renders FROM state and never duplicates a rule. Canvas 2D
 * on a fixed 800x600 design space, fixed-dt accumulator stepping (1/60s
 * quanta), pointer normalized to [0,1] and handed to the sim raw - the sim
 * owns the whole verb (hold = charge, x = aim, release = jump); this file
 * adds ZERO client-side jump logic.
 *
 * INPUT: press-and-hold anywhere charges; slide the pointer to aim; let go
 * to jump. Keyboard is a verb SYNTHESIZER (the house law: no parallel input
 * path): holding Space or W/Up feeds down=true, A/D or the arrows walk a
 * client-side aim value that is fed through px, so keyboard flows through
 * the exact same sim zones as the pointer.
 *
 * PRESENTATION MEMORY (the crypt/gauntlet pattern): the sim publishes
 * monotonic counters (jumps/lands/falls/fellUnits/bounces/bandTop/maxY...);
 * this file diffs a snapshot per fixed step into countdown fx - landing dust
 * and the thud ring, the class-accent air trail, wind streaks that mirror
 * windAt(), band banners, new-best floats, and a shake only a BIG fall
 * earns. Math.random is allowed page-side and nowhere near the sim. The
 * page camera (fx.camY) chases the climber and the sim never knows it
 * exists. Composite grade (gradekit) LAST.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CLASS_IDS, type ClassId, type Loadout } from "../_shared/rules/core";
import { GRADES, makeGrade, type Grade } from "../_shared/gradekit";
import { BANDS, bandIndexFor, windAt } from "./content";
import {
  RUN_FRAMES,
  ascentScore,
  createAscent,
  stepAscent,
  type AscentState,
  type SimInput,
} from "./sim";
import {
  CAM_EYE,
  CLASS_ACCENT,
  DESIGN_H,
  DESIGN_W,
  PAL,
  drawBanner,
  drawHud,
  renderScene,
  txt,
} from "./draw";
import {
  BANNER_S,
  BIG_FALL,
  DUST_S,
  FLOAT_S,
  STREAK_S,
  THUD_S,
  TRAIL_S,
  mkFx,
  mkLcg,
  mkPrev,
  type Fx,
  type Prev,
} from "./fx";

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 8;
const DPR_CAP = 2;
const AIM_STEP = 0.02; // keyboard aim walk per fixed step (full sweep ~0.8s)

// band-entry flavor sub-lines (canvas strings; index 0 never shows - the
// banner only fires on entering a band ABOVE the start)
const BAND_SUBS = [
  "the climb begins",
  "SLICK STONE BEGINS",
  "THE WIND LIVES HERE",
  "THE DAWN IS CLOSE",
  "ABOVE THE CROWN",
];

export interface AscentClientProps {
  loadout: Loadout | null;
  seed: string;
  onDone?: (score: number) => void;
}

export default function AscentClient({ loadout, seed, onDone }: AscentClientProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<AscentState | null>(null);
  const fxRef = useRef<Fx>(mkFx());
  const prevRef = useRef<Prev>(mkPrev());
  const gradeRef = useRef<Grade | null>(null);
  const doneCalledRef = useRef(false);
  const pointerRef = useRef<{ x: number | null; y: number | null; down: boolean }>({ x: null, y: null, down: false });
  const chargeKeyRef = useRef(false);
  const aimKeysRef = useRef({ left: false, right: false });
  const kbAimRef = useRef(0.5);
  const endedAtRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const propsRef = useRef({ loadout, seed });
  propsRef.current = { loadout, seed };

  useEffect(() => {
    const cv = canvasRef.current;
    const box = boxRef.current;
    if (!cv || !box) return;
    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gradeRef.current = makeGrade({ ...GRADES.ascent, staticGrain: reduced });
    const simInput: SimInput = { px: null, py: null, down: false, space: false }; // reused every step
    const scatter = mkLcg(0x5c1a0b17); // page-fx stream (never the sim's - it has none)

    const fit = (): void => {
      const r = box.getBoundingClientRect();
      const cssW = r.width >= 50 ? r.width : DESIGN_W;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const scale = (cssW * dpr) / DESIGN_W;
      cv.width = Math.max(1, Math.round(DESIGN_W * scale));
      cv.height = Math.max(1, Math.round(DESIGN_H * scale));
      const g = cv.getContext("2d");
      if (g) {
        g.setTransform(scale, 0, 0, scale, 0, 0);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
      }
    };

    const reset = (): void => {
      const p = propsRef.current;
      stateRef.current = createAscent(DESIGN_W, DESIGN_H, p.seed, false, p.loadout);
      fxRef.current = mkFx();
      prevRef.current = mkPrev();
      doneCalledRef.current = false;
      kbAimRef.current = 0.5;
      endedAtRef.current = 0;
    };

    // ── spawn helpers (pool reuse; never allocate in the loop) ────────────
    const spawnDust = (x: number, y: number, n: number): void => {
      const fx = fxRef.current;
      let made = 0;
      for (const d of fx.dusts) {
        if (made >= n) break;
        if (d.on && d.t < DUST_S * 0.4) continue;
        d.on = true;
        d.t = 0;
        d.x = x + (scatter() - 0.5) * 22;
        d.y = y + scatter() * 4;
        d.vx = (scatter() - 0.5) * 60;
        d.vy = 20 + scatter() * 40;
        d.r = 1.5 + scatter() * 2.5;
        made++;
      }
    };
    const spawnTrail = (x: number, y: number): void => {
      const fx = fxRef.current;
      let pick = fx.trail[0];
      for (const t of fx.trail) {
        if (!t.on) {
          pick = t;
          break;
        }
        if (t.t > pick.t) pick = t;
      }
      pick.on = true;
      pick.t = 0;
      pick.x = x;
      pick.y = y;
    };
    const spawnStreak = (x: number, y: number, dir: number): void => {
      const fx = fxRef.current;
      let pick = fx.streaks[0];
      for (const st of fx.streaks) {
        if (!st.on) {
          pick = st;
          break;
        }
        if (st.t > pick.t) pick = st;
      }
      pick.on = true;
      pick.t = 0;
      pick.x = x + (scatter() - 0.5) * 260;
      pick.y = y + (scatter() - 0.5) * 200;
      pick.len = 26 + scatter() * 30;
      pick.dir = dir;
    };
    const spawnFloat = (x: number, y: number, text: string, color: string, big: boolean): void => {
      const fx = fxRef.current;
      let pick = fx.floats[0];
      for (const f of fx.floats) {
        if (!f.on) {
          pick = f;
          break;
        }
        if (f.t > pick.t) pick = f;
      }
      pick.on = true;
      pick.t = 0;
      pick.x = x;
      pick.y = y;
      pick.text = text;
      pick.color = color;
      pick.big = big;
    };
    const banner = (text: string, sub: string): void => {
      const b = fxRef.current.banner;
      b.text = text;
      b.sub = sub;
      b.t = 0.0001;
      b.color = PAL.gold;
    };

    // ── the delta engine: one call per fixed step, after stepAscent ───────
    const applyDeltas = (s: AscentState): void => {
      const p = prevRef.current;
      const fx = fxRef.current;
      const x = s.x100 / 100;
      const y = s.y100 / 100;
      if (!p.inited) {
        snapPrev(p, s);
        return;
      }

      // takeoff: a kick of dust off the stance
      if (s.jumps > p.jumps) spawnDust(x, y, 4);

      // landing: thud + dust, scaled by how far the fall was
      if (s.lands > p.lands) {
        const fell = s.fellUnits - p.fellUnits;
        const power = Math.max(0, Math.min(1, fell / (BIG_FALL * 2)));
        fx.thud.t = 0;
        fx.thud.x = x;
        fx.thud.y = y;
        fx.thud.power = power;
        spawnDust(x, y, fell >= BIG_FALL ? 10 : 5);
        if (fell >= BIG_FALL) {
          fx.shake = Math.max(fx.shake, 0.7);
          fx.shakeAmp = reduced ? 0 : 6;
          spawnFloat(x, y + 40, `FELL ${fell}`, PAL.blood, true);
        }
      }

      // the score moved: a quiet gold tick at the new line
      if (s.maxY > p.maxY && s.maxY - p.maxY + (p.maxY > 0 ? 0 : 0) >= 1 && p.maxY > 0) {
        spawnFloat(x, y + 46, `+${s.maxY - p.maxY}`, PAL.gold, false);
      }

      // first time standing in a new band: the palette banner
      if (s.bandTop > p.bandTop) {
        const b = Math.min(s.bandTop, BANDS.length - 1);
        banner(BANDS[b].name.toUpperCase(), BAND_SUBS[b] ?? "");
      }

      // wall bounces: a puff at the climber
      if (s.bounces > p.bounces) spawnDust(x, y + 12, 3);

      // the timer died: the end beat (the shell owns results in season play)
      if (s.ended === 1 && p.ended === 0) {
        endedAtRef.current = fx.time;
        if (!doneCalledRef.current) {
          doneCalledRef.current = true;
          onDoneRef.current?.(ascentScore(s));
        }
      }

      snapPrev(p, s);
    };

    const snapPrev = (p: Prev, s: AscentState): void => {
      p.inited = true;
      p.y = Math.floor(s.y100 / 100);
      p.grounded = s.grounded;
      p.charging = s.charging;
      p.maxY = s.maxY;
      p.lastGroundY = s.lastGroundY;
      p.jumps = s.jumps;
      p.lands = s.lands;
      p.falls = s.falls;
      p.fellUnits = s.fellUnits;
      p.bounces = s.bounces;
      p.bandTop = s.bandTop;
      p.band = bandIndexFor(Math.floor(s.y100 / 100));
      p.ended = s.ended;
    };

    // ── fx clocks ─────────────────────────────────────────────────────────
    const tickFx = (dt: number, s: AscentState | null): void => {
      const fx = fxRef.current;
      fx.time += dt;
      if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 2.4);
      if (fx.banner.t > 0 && fx.banner.t < BANNER_S) fx.banner.t += dt;
      if (fx.thud.t < THUD_S) fx.thud.t += dt;
      for (const d of fx.dusts) {
        if (!d.on) continue;
        d.t += dt;
        d.x += d.vx * dt;
        d.y -= d.vy * dt; // dust settles downward in world units
        if (d.t > DUST_S) d.on = false;
      }
      for (const t of fx.trail) {
        if (!t.on) continue;
        t.t += dt;
        if (t.t > TRAIL_S) t.on = false;
      }
      for (const st of fx.streaks) {
        if (!st.on) continue;
        st.t += dt;
        st.x += st.dir * 480 * dt;
        if (st.t > STREAK_S) st.on = false;
      }
      for (const f of fx.floats) {
        if (!f.on) continue;
        f.t += dt;
        if (f.t > FLOAT_S) f.on = false;
      }
      // ambient spawns read sim truth but never touch it
      if (s) {
        const x = s.x100 / 100;
        const y = s.y100 / 100;
        if (s.grounded === 0 && !reduced && (s.frame & 1) === 0) spawnTrail(x, y - 12);
        const gust = windAt(s.frame, Math.floor(y));
        if (gust !== 0 && !reduced && scatter() < 0.5) spawnStreak(x, y, Math.sign(gust));
      }
      // the camera chases the climber; a long fall snaps harder
      if (s) {
        const target = Math.max(-80, s.y100 / 100 - CAM_EYE);
        if (!fx.camInit) {
          fx.camY = target;
          fx.camInit = true;
        } else {
          const k = Math.abs(target - fx.camY) > 320 ? 10 : 6;
          fx.camY += (target - fx.camY) * Math.min(1, dt * k);
        }
      }
    };

    // ── the painted frame ─────────────────────────────────────────────────
    const render = (): void => {
      const g = cv.getContext("2d");
      const s = stateRef.current;
      if (!g || !s) return;
      const fx = fxRef.current;

      let shx = 0;
      let shy = 0;
      if (fx.shake > 0 && fx.shakeAmp > 0) {
        shx = (Math.random() - 0.5) * 2 * fx.shakeAmp * fx.shake;
        shy = (Math.random() - 0.5) * 2 * fx.shakeAmp * fx.shake;
      }

      g.fillStyle = PAL.ink;
      g.fillRect(0, 0, DESIGN_W, DESIGN_H);
      g.save();
      g.translate(shx, shy);
      renderScene(g, s, fx, reduced);
      g.restore();

      if (fx.banner.t > 0 && fx.banner.t < BANNER_S) drawBanner(g, fx.banner.text, fx.banner.sub, fx.banner.t, fx.banner.color);
      drawHud(g, s);

      // dev free-play end overlay (the season shell owns the real result)
      if (s.ended === 1) {
        const k = Math.min(1, (fx.time - endedAtRef.current) / 0.5);
        g.fillStyle = `rgba(7,8,12,${0.72 * k})`;
        g.fillRect(0, 0, DESIGN_W, DESIGN_H);
        g.globalAlpha = k;
        txt(g, "THE BELL TOLLS", DESIGN_W / 2, 240, 30, PAL.gold, "center", 800);
        txt(g, `height ${ascentScore(s)}`, DESIGN_W / 2, 280, 20, PAL.text, "center", 800);
        txt(
          g,
          `${s.jumps} jumps · ${s.falls} falls · fell ${s.fellUnits} in total`,
          DESIGN_W / 2,
          306,
          13,
          PAL.dim,
          "center",
          700,
        );
        txt(g, "press anywhere to climb again", DESIGN_W / 2, 348, 12, PAL.dim, "center", 700);
        g.globalAlpha = 1;
      }

      // seed hint (dev free-play nicety; the seed changes nothing by law)
      txt(g, `${propsRef.current.seed} · fixed tower`, DESIGN_W - 8, DESIGN_H - 8, 9, "rgba(139,133,119,0.4)", "right", 700);

      // THE GRADE, LAST (the beauty-panel law)
      gradeRef.current?.applyWorld(g, DESIGN_W, DESIGN_H);
    };

    // ── the loop ──────────────────────────────────────────────────────────
    let raf = 0;
    let running = false;
    let last = 0;
    let acc = 0;

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      if (!s) {
        last = now;
        return;
      }
      let frameDt = (now - last) / 1000;
      last = now;
      if (!(frameDt > 0) || frameDt > 0.25) frameDt = FIXED_DT;
      const fx = fxRef.current;
      const ptr = pointerRef.current;

      // ended: any press restarts (after the overlay settles)
      if (s.ended === 1) {
        if ((ptr.down || chargeKeyRef.current) && fx.time - endedAtRef.current > 1.0) {
          reset();
          ptr.down = false;
          chargeKeyRef.current = false;
          render();
          return;
        }
        tickFx(frameDt, s);
        render();
        return;
      }

      acc += frameDt;
      let steps = 0;
      while (acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
        // keyboard aim walks every fixed step while held
        if (aimKeysRef.current.left) kbAimRef.current = Math.max(0, kbAimRef.current - AIM_STEP);
        if (aimKeysRef.current.right) kbAimRef.current = Math.min(1, kbAimRef.current + AIM_STEP);
        if (ptr.down && ptr.x != null) {
          simInput.px = ptr.x;
          simInput.py = ptr.y;
          simInput.down = true;
        } else if (chargeKeyRef.current) {
          // keyboard synthesis: same sim verb, no parallel path
          simInput.px = kbAimRef.current;
          simInput.py = 0.5;
          simInput.down = true;
        } else {
          simInput.px = ptr.x;
          simInput.py = ptr.y;
          simInput.down = false;
        }
        simInput.space = false; // the sim ignores space by contract
        stepAscent(s, FIXED_DT, simInput);
        applyDeltas(s);
        acc -= FIXED_DT;
        steps++;
      }
      if (steps >= MAX_SUBSTEPS) acc = 0;
      tickFx(frameDt, s);
      render();
    };

    const start = (): void => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = (): void => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVis = (): void => {
      if (document.hidden) stop();
      else start();
    };

    // ── input ─────────────────────────────────────────────────────────────
    const setPointer = (e: PointerEvent, down: boolean | null): void => {
      const r = cv.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      pointerRef.current.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      pointerRef.current.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      if (down !== null) pointerRef.current.down = down;
    };
    const onDown = (e: PointerEvent): void => {
      setPointer(e, true);
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        // capture unsupported: input still works
      }
    };
    const onMove = (e: PointerEvent): void => setPointer(e, null);
    const onUp = (e: PointerEvent): void => setPointer(e, false);
    const onCancel = (): void => {
      pointerRef.current.down = false;
    };
    const onKey = (e: KeyboardEvent, v: boolean): void => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === "function" && t.closest("button,a,input,textarea,select")) return;
      if (e.code === "Space" || e.key === " " || e.code === "KeyW" || e.code === "ArrowUp") {
        chargeKeyRef.current = v;
        if (v) e.preventDefault();
        return;
      }
      if (e.code === "KeyA" || e.code === "ArrowLeft") {
        aimKeysRef.current.left = v;
        if (v) e.preventDefault();
        return;
      }
      if (e.code === "KeyD" || e.code === "ArrowRight") {
        aimKeysRef.current.right = v;
        if (v) e.preventDefault();
      }
    };
    const kd = (e: KeyboardEvent): void => onKey(e, true);
    const ku = (e: KeyboardEvent): void => onKey(e, false);
    const onBlur = (): void => {
      chargeKeyRef.current = false;
      pointerRef.current.down = false;
      aimKeysRef.current.left = false;
      aimKeysRef.current.right = false;
    };

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(box);

    fit();
    reset();
    start();

    return () => {
      stop();
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      ro?.disconnect();
      gradeRef.current?.dispose();
      gradeRef.current = null;
      stateRef.current = null;
    };
    // mount-once by design: prop changes remount via the dev page's key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={boxRef}
      data-testid="ascent-arena"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "4 / 3",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #232a32",
        background: "#07080c",
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="ascent-canvas"
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "pointer" }}
      />
    </div>
  );
}

// ── the dev free-play harness (page.tsx mounts this, dev builds only) ───────

const TIERS = [0, 1, 2, 3] as const;

const selStyle: React.CSSProperties = {
  background: "#141924",
  color: "#e8e2d2",
  border: "1px solid #3d4454",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
};

/** Class picker, level slider, gear tiers, restart, final-height readout -
 * the /dev/s7c idiom in the game's own folder so the unrouted page can
 * exercise every loadout without a session. Every control change remounts
 * the client (key) so a run always starts clean. */
export function AscentDevHarness() {
  const [classId, setClassId] = useState<ClassId>("barbarian");
  const [level, setLevel] = useState(1);
  const [weapon, setWeapon] = useState(0);
  const [armor, setArmor] = useState(0);
  const [trinket, setTrinket] = useState(0);
  const [useLoadout, setUseLoadout] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const loadout: Loadout | null = useMemo(
    () => (useLoadout ? { classId, level, gear: { weapon, armor, trinket } } : null),
    [useLoadout, classId, level, weapon, armor, trinket],
  );
  const runKey = `${useLoadout ? classId : "null"}-${level}-${weapon}${armor}${trinket}-${nonce}`;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(1000px 500px at 50% -10%, #171c22 0%, #0b0d10 60%)",
        color: "#e9edf1",
        padding: "28px 16px 56px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: 14, letterSpacing: 3, color: "#f0b340", textTransform: "uppercase", fontWeight: 800 }}>
            The Spire · dev free play
          </span>
          <span style={{ fontSize: 12, color: "#87919b" }}>
            Final height: <strong style={{ color: "#f0b340" }}>{lastScore ?? "-"}</strong>
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8 }}>
          {CLASS_IDS.map((c) => (
            <button
              key={c}
              onClick={() => setClassId(c)}
              style={{
                padding: "7px 12px",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                background: classId === c && useLoadout ? CLASS_ACCENT[c] : "#141924",
                color: classId === c && useLoadout ? "#10120a" : CLASS_ACCENT[c],
                border: `1px solid ${CLASS_ACCENT[c]}`,
                opacity: useLoadout ? 1 : 0.4,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 8, fontSize: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: useLoadout ? 1 : 0.4 }}>
            Level {level}
            <input
              type="range"
              min={1}
              max={20}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              style={{ width: 140 }}
            />
          </label>
          {(
            [
              ["weapon", weapon, setWeapon],
              ["armor", armor, setArmor],
              ["trinket", trinket, setTrinket],
            ] as const
          ).map(([name, val, set]) => (
            <label key={name} style={{ display: "flex", alignItems: "center", gap: 6, opacity: useLoadout ? 1 : 0.4 }}>
              {name}
              <select value={val} onChange={(e) => set(Number(e.target.value))} style={selStyle}>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    T{t}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={!useLoadout} onChange={(e) => setUseLoadout(!e.target.checked)} />
            null loadout
          </label>
          <button
            onClick={() => {
              setLastScore(null);
              setNonce((n) => n + 1);
            }}
            style={{
              padding: "8px 18px",
              background: "#f0b340",
              color: "#1a1205",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Restart
          </button>
        </div>

        <div style={{ color: "#87919b", fontSize: 12, marginBottom: 14 }}>
          Press and hold to charge, slide to aim, let go to jump. Keyboard: hold Space or W to charge, A and D aim.
          One fixed tower, a 3 minute timer, height is the score. The seed changes nothing by design.
        </div>

        <AscentClient key={runKey} loadout={loadout} seed="ascent-dev" onDone={(sc) => setLastScore(sc)} />
      </div>
    </main>
  );
}
