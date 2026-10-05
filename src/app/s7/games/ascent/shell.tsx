"use client";
/**
 * ASCENT SHELL - the season wiring. AscentShell mounts the spire sim on the
 * franchise RunShell (nonce handshake, shared-seed daily, floor, banking,
 * share grid); the free-play dev client (./Client.tsx) keeps its own loop.
 *
 * DARK UNTIL WEEK 2: the game key "ascent" is deliberately NOT in
 * src/lib/s7/games.ts yet, and nothing routes here (page.tsx is a dev-only
 * free-play mount). RunShell tolerates the missing GAME_RULES entry with
 * fallback floor/attempts, but this shell must only go live together with
 * the registry entry (rate 240/s + burst 400 + maxScore 250000, per
 * scripts/s7-ascent-check.ts's printed numbers).
 *
 * PRESENTATION REUSE, NOT REIMPLEMENTATION: the scene, HUD, banner and fx
 * pools all come from ./draw and ./fx exactly as the dev client uses them.
 * This file owns only the RunShell adaptation:
 *
 *  - createSim VALIDATES the server RunLoadout (unknown classId -> stock
 *    climber, level/gear clamped) and RESETS the per-run page state (fx
 *    pools, prev snapshot, grade, keyboard aim). PlayerStats are ignored -
 *    S7 sims read the class loadout (ADR-0129), not the tank stats. NOTE
 *    the seed is passed through for contract parity but the tower is FIXED
 *    by design (the Jump King law), so the shared-seed daily reduces to
 *    "everyone climbs the same tower", which is always true here.
 *  - step ADAPTS ShellInput: the pointer is already normalized [0,1] by
 *    pointerTransform, so the sim sees the exact tape-contract coordinates.
 *    RunShell's keyboard SYNTHESIZES the same verb (space or up held =
 *    charge, left/right walk a page-side aim value fed through px) - no
 *    parallel input path exists.
 *  - draw is the dev client's composite minus the client-owned chrome (end
 *    overlay, restart - RunShell owns the result screen). Grade LAST.
 *  - done/score = ascentDone/ascentScore; died is always false, so every
 *    run banks at the timer (the floorMs anti-cheat floor sits at 30s,
 *    far under the fixed 180s run, so the floor never bites a real run).
 */

import { RunShell, type RunLoadout, type ShellInput, type ShellView } from "../_shared/RunShell";
import { CLASS_IDS, type Loadout } from "../_shared/rules/core";
import { GRADES, makeGrade, type Grade } from "../_shared/gradekit";
import { BANDS, bandIndexFor, windAt } from "./content";
import {
  ascentDone,
  ascentScore,
  ascentSimSecs,
  createAscent,
  stepAscent,
  type AscentState,
  type SimInput,
} from "./sim";
import { CAM_EYE, DESIGN_H, DESIGN_W, PAL, drawBanner, drawHud, renderScene } from "./draw";
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

const AIM_STEP = 0.02; // keyboard aim walk per fixed step (matches Client.tsx)

// band-entry flavor sub-lines (canvas strings; index 0 never shows - the
// banner only fires on entering a band ABOVE the start). Keep in lockstep
// with Client.tsx.
const BAND_SUBS = [
  "the climb begins",
  "SLICK STONE BEGINS",
  "THE WIND LIVES HERE",
  "THE DAWN IS CLOSE",
  "ABOVE THE CROWN",
];

// ── per-run page state (module singleton: one ascent page mounts at a time,
// the crypt-shell precedent) ────────────────────────────────────────────────

interface RenderState {
  reduced: boolean;
  fx: Fx;
  prev: Prev;
  grade: Grade | null;
  scatter: () => number; // page-fx stream (the sim has no RNG at all)
  kbAim: number;
  simInput: SimInput;
}

let R: RenderState | null = null;

function resetRender(reduced: boolean): void {
  R?.grade?.dispose();
  R = {
    reduced,
    fx: mkFx(),
    prev: mkPrev(),
    grade: makeGrade({ ...GRADES.ascent, staticGrain: reduced }),
    scatter: mkLcg(0x5c1a0b17),
    kbAim: 0.5,
    simInput: { px: null, py: null, down: false, space: false },
  };
}

/** Server RunLoadout -> core Loadout, validated (the crypt-shell idiom). */
function toLoadout(lo: RunLoadout | null): Loadout | null {
  if (!lo) return null;
  const at = (CLASS_IDS as readonly string[]).indexOf(lo.classId);
  if (at < 0) return null;
  const iclamp = (v: unknown, hi: number): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(hi, n)) : 0;
  };
  const g = lo.gear || { weapon: 0, armor: 0, trinket: 0 };
  return {
    classId: CLASS_IDS[at],
    level: Math.max(1, iclamp(lo.level, 20)),
    gear: { weapon: iclamp(g.weapon, 3), armor: iclamp(g.armor, 3), trinket: iclamp(g.trinket, 3) },
  };
}

// ── fx spawn helpers (pool reuse; ports of Client.tsx, parameterized on R) ──

function spawnDust(rs: RenderState, x: number, y: number, n: number): void {
  let made = 0;
  for (const d of rs.fx.dusts) {
    if (made >= n) break;
    if (d.on && d.t < DUST_S * 0.4) continue;
    d.on = true;
    d.t = 0;
    d.x = x + (rs.scatter() - 0.5) * 22;
    d.y = y + rs.scatter() * 4;
    d.vx = (rs.scatter() - 0.5) * 60;
    d.vy = 20 + rs.scatter() * 40;
    d.r = 1.5 + rs.scatter() * 2.5;
    made++;
  }
}

function spawnTrail(rs: RenderState, x: number, y: number): void {
  let pick = rs.fx.trail[0];
  for (const t of rs.fx.trail) {
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
}

function spawnStreak(rs: RenderState, x: number, y: number, dir: number): void {
  let pick = rs.fx.streaks[0];
  for (const st of rs.fx.streaks) {
    if (!st.on) {
      pick = st;
      break;
    }
    if (st.t > pick.t) pick = st;
  }
  pick.on = true;
  pick.t = 0;
  pick.x = x + (rs.scatter() - 0.5) * 260;
  pick.y = y + (rs.scatter() - 0.5) * 200;
  pick.len = 26 + rs.scatter() * 30;
  pick.dir = dir;
}

function spawnFloat(rs: RenderState, x: number, y: number, text: string, color: string, big: boolean): void {
  let pick = rs.fx.floats[0];
  for (const f of rs.fx.floats) {
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
}

function banner(rs: RenderState, text: string, sub: string): void {
  const b = rs.fx.banner;
  b.text = text;
  b.sub = sub;
  b.t = 0.0001;
  b.color = PAL.gold;
}

// ── the delta engine (one call per fixed step, after stepAscent) ────────────

function applyDeltas(rs: RenderState, s: AscentState): void {
  const p = rs.prev;
  const fx = rs.fx;
  const x = s.x100 / 100;
  const y = s.y100 / 100;
  if (!p.inited) {
    snapPrev(p, s);
    return;
  }
  if (s.jumps > p.jumps) spawnDust(rs, x, y, 4);
  if (s.lands > p.lands) {
    const fell = s.fellUnits - p.fellUnits;
    const power = Math.max(0, Math.min(1, fell / (BIG_FALL * 2)));
    fx.thud.t = 0;
    fx.thud.x = x;
    fx.thud.y = y;
    fx.thud.power = power;
    spawnDust(rs, x, y, fell >= BIG_FALL ? 10 : 5);
    if (fell >= BIG_FALL) {
      fx.shake = Math.max(fx.shake, 0.7);
      fx.shakeAmp = rs.reduced ? 0 : 6;
      spawnFloat(rs, x, y + 40, `FELL ${fell}`, PAL.blood, true);
    }
  }
  if (s.maxY > p.maxY && p.maxY > 0) spawnFloat(rs, x, y + 46, `+${s.maxY - p.maxY}`, PAL.gold, false);
  if (s.bandTop > p.bandTop) {
    const b = Math.min(s.bandTop, BANDS.length - 1);
    banner(rs, BANDS[b].name.toUpperCase(), BAND_SUBS[b] ?? "");
  }
  if (s.bounces > p.bounces) spawnDust(rs, x, y + 12, 3);
  snapPrev(p, s);
}

function snapPrev(p: Prev, s: AscentState): void {
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
}

// ── fx clocks (per fixed step; identical at 60Hz, the crypt-shell note) ─────

function tickFx(rs: RenderState, dt: number, s: AscentState): void {
  const fx = rs.fx;
  fx.time += dt;
  if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 2.4);
  if (fx.banner.t > 0 && fx.banner.t < BANNER_S) fx.banner.t += dt;
  if (fx.thud.t < THUD_S) fx.thud.t += dt;
  for (const d of fx.dusts) {
    if (!d.on) continue;
    d.t += dt;
    d.x += d.vx * dt;
    d.y -= d.vy * dt;
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
  const x = s.x100 / 100;
  const y = s.y100 / 100;
  if (s.grounded === 0 && !rs.reduced && (s.frame & 1) === 0) spawnTrail(rs, x, y - 12);
  const gust = windAt(s.frame, Math.floor(y));
  if (gust !== 0 && !rs.reduced && rs.scatter() < 0.5) spawnStreak(rs, x, y, Math.sign(gust));
  const target = Math.max(-80, y - CAM_EYE);
  if (!fx.camInit) {
    fx.camY = target;
    fx.camInit = true;
  } else {
    const k = Math.abs(target - fx.camY) > 320 ? 10 : 6;
    fx.camY += (target - fx.camY) * Math.min(1, dt * k);
  }
}

// ── the RunShell callbacks ──────────────────────────────────────────────────

function shellStep(s: AscentState, dt: number, input: ShellInput): void {
  const rs = R;
  if (!rs) return; // createSim always runs first; belt and braces
  const si = rs.simInput;
  // keyboard aim walks while held (page-side value fed through px)
  if (input.left) rs.kbAim = Math.max(0, rs.kbAim - AIM_STEP);
  if (input.right) rs.kbAim = Math.min(1, rs.kbAim + AIM_STEP);
  if (input.down && input.px != null && input.py != null) {
    // the real pointer: already normalized to [0,1] by pointerTransform
    si.px = input.px;
    si.py = input.py;
    si.down = true;
  } else if (input.space || input.up) {
    // keyboard synthesis: the same charge verb, no parallel path
    si.px = rs.kbAim;
    si.py = 0.5;
    si.down = true;
  } else {
    si.px = input.px;
    si.py = input.py;
    si.down = false;
  }
  si.space = false; // the sim ignores space by contract
  stepAscent(s, dt, si);
  applyDeltas(rs, s);
  tickFx(rs, dt, s);
}

function shellDraw(g: CanvasRenderingContext2D, s: AscentState, view: ShellView): void {
  const rs = R;
  if (!rs) return;
  void view; // the spire has no tank cosmetics and no pointer preview
  const fx = rs.fx;
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
  renderScene(g, s, fx, rs.reduced);
  g.restore();
  if (fx.banner.t > 0 && fx.banner.t < BANNER_S) drawBanner(g, fx.banner.text, fx.banner.sub, fx.banner.t, fx.banner.color);
  drawHud(g, s);
  // THE GRADE, LAST (the beauty-panel law)
  rs.grade?.applyWorld(g, DESIGN_W, DESIGN_H);
}

// ── the shell ───────────────────────────────────────────────────────────────

export default function AscentShell() {
  return (
    <RunShell<AscentState>
      game="ascent"
      title="The Spire"
      accent="#f0b340"
      // touch: holding ANYWHERE charges the jump, so the corner hold button
      // would only sit inside the aim drag's path - hidden on purpose
      skillLabel={null}
      aspect={DESIGN_W / DESIGN_H}
      worldSize={() => ({ w: DESIGN_W, h: DESIGN_H })}
      // sim-px -> the sim's normalized [0,1] tape contract (clamped: pointer
      // capture can drag coordinates past the canvas edge)
      pointerTransform={(x, y) => ({
        x: Math.max(0, Math.min(1, x / DESIGN_W)),
        y: Math.max(0, Math.min(1, y / DESIGN_H)),
      })}
      createSim={(w, h, seed, reduced, stats, loadout) => {
        void stats; // S7 sims read the class loadout (ADR-0129), not tank stats
        resetRender(reduced);
        return createAscent(w, h, seed, false, toLoadout(loadout));
      }}
      step={shellStep}
      draw={shellDraw}
      done={ascentDone}
      score={ascentScore}
      resultHeadline={(s) => `CLIMBED TO ${s.maxY}`}
      resultSub={(s) =>
        `${s.jumps} jumps · ${s.falls} falls · fell ${s.fellUnits} in total · ${Math.round(ascentSimSecs(s))}s on the wall`
      }
      runMeta={(s) => ({ v: 1, height: s.maxY, jumps: s.jumps, falls: s.falls, band: s.bandTop })}
      shareBuild={(s, dayKey) => {
        const grid = `${"\u{1F7E8}".repeat(Math.max(1, Math.min(12, Math.floor(s.maxY / 1700) + 1)))}\u{1F514}`;
        return {
          grid,
          payload: `THE SPIRE ${dayKey} · height ${ascentScore(s)}\n${grid}\nlaunchwars.xyz/s7/games/ascent`,
        };
      }}
      intro={
        <div>
          <p style={{ margin: "0 0 8px" }}>
            One tower. Three minutes. Climb as high as you can. Press and hold to charge your jump, slide left or
            right while holding to aim, and let go to jump. In the air you cannot steer.
          </p>
          <p style={{ margin: 0, opacity: 0.85 }}>
            Land on a ledge to bank your height. Miss and you fall, sometimes a long way, and there are only three
            wide resting ledges on the whole tower. Icy ledges slide you off. Walls bounce you back. High up, the
            storm wind pushes you while you are in the air. The tower never changes: learn it, and it is yours.
          </p>
        </div>
      }
      strings={{
        startIdle: "CLIMB",
        keyboardHint:
          "Keyboard works too: hold Space or W to charge, A and D aim, let go to jump.",
      }}
    />
  );
}
