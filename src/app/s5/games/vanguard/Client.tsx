"use client";
/**
 * SEASON 5 · IRON SIEGE — VANGUARD client (game key "vanguard").
 *
 * Camera-follow, so this file owns two things the fixed-board games do not:
 *
 *   1. THE CAMERA TRANSLATION. The sim owns camX/camY; every draw call
 *      subtracts it, and `pointerTransform` ADDS it back so the sim receives
 *      world coordinates. If those two ever disagree the tank drives at a
 *      point the player did not touch, so both read the same fields and
 *      nothing else is allowed to move the camera.
 *   2. THE OFF-SCREEN READ. In a town you cannot see the next rally point or
 *      the truck that is about to shoot you, so both get edge markers. A
 *      threat you cannot see coming is not difficulty, it is noise.
 *
 * Everything is DRAWN (ADR-0088): the town carries the rules -- a wall is
 * either solid or it is an alley you can thread -- so it cannot be a painting
 * that disagrees with the collision boxes.
 */
import { useCallback, useRef } from "react";
import { RunShell, type ShellInput, type ShellView } from "../_shared/RunShell";
import { GameIntro } from "../_shared/GameIntro";
import { canvasTex, loadManifest, longShadow, ready, sprRot, stripRot } from "../_shared/art";
import {
  drawBuildings,
  type BuildingDraw,
  type PropDraw,
  drawGround,
  drawMarkings,
  drawScenery,
  drawSmoke,
  drawTank,
  drawTruck,
  h2,
  HOSTILE,
  LIT_WINDOW,
  ROAD,
  ROAD_EDGE,
  ROOF_LINE,
  RUBBLE,
  RUBBLE_DK,
} from "./scene";
import type { Sfx } from "../_shared/sfx";
import {
  createVanguard,
  stepVanguard,
  vanguardDone,
  vanguardScore,
  gridEmoji,
  sharePayload,
  VIEW_W,
  VIEW_H,
  TANK_R,
  TRUCK_R,
  SEG_R,
  CP_R,
  MG_LOCK_T,
  RUN_SECONDS,
  CHECKPOINTS,
  type VgState,
} from "./sim";

const GAME = "vanguard";
const ACCENT = "#f0b340";

// TWO BAKED UNITS, EVERYTHING ELSE DRAWN. The town stays 100% vector (and
// scene.ts stays import-free so the offline shot script keeps rendering it),
// but the player tank and the MG trucks take the season's baked sprites with
// vector fallback: the same tank1-family strip Armor Clash ships, and the
// theirs-red SUV from the cars pack. Both from /dev/bake (ART_SPEC.md).
const ART = loadManifest("vanguard", [
  "units/tank-mine",
  "units/truck-theirs",
  // TOWN PROPS (tilt-baked Kenney city kit). The buildings themselves are
  // EXTRUDED IN CODE, not sprites: this town's blocks are procedural rects
  // whose aspect runs 0.14..5.75 and the rect IS the collision volume, so a
  // fixed-aspect building sprite would either stretch to mush or stop matching
  // what the tank bumps into (measured 2026-08-02). The kit supplies what it
  // is genuinely right for: rooftop furniture and street trees.
  "units/chimney-s",
  "units/chimney-m",
  "units/tank",
  "units/tree-l",
  "units/tree-s",
  // THE BUILDING CATALOGUE: 42 tilt-baked Kenney city-kit models. A block is
  // tiled with several of these at their own proportions (scene.ts owns the
  // lot geometry), so the town is real buildings rather than one stretched
  // sprite or a drawn slab. ~70 KB for the set.
  "bld/ca",
  "bld/cb",
  "bld/cc",
  "bld/cd",
  "bld/ce",
  "bld/cf",
  "bld/cg",
  "bld/ch",
  "bld/ci",
  "bld/cj",
  "bld/ck",
  "bld/cl",
  "bld/cm",
  "bld/cn",
  "bld/ia",
  "bld/ib",
  "bld/ic",
  "bld/id",
  "bld/ie",
  "bld/if",
  "bld/ig",
  "bld/ih",
  "bld/ii",
  "bld/ij",
  "bld/ik",
  "bld/il",
  "bld/im",
  "bld/in",
  "bld/sa",
  "bld/sb",
  "bld/sc",
  "bld/sd",
  "bld/se",
  "bld/sf",
  "bld/sg",
  "bld/sh",
  "bld/si",
  "bld/sj",
  "bld/sk",
  "bld/sl",
  "bld/sm",
  "bld/sn",
  /* NO units/planter: baked and promoted with the rest of the kit, but the
   * town never asks for one -- a planter on a pavement would read solid and
   * not be, and inside a block there is nowhere for it to stand. Loading a
   * file nothing draws is just weight. */
] as const);

/** Stamp one Kenney prop with its FOOT on (x, y) — tilt bakes carry their
 * height above the anchor, the same contract every S5 structure draw uses.
 * Passed into scene.ts's drawBuildings so that module keeps zero imports. */
const drawBld: BuildingDraw = (ctx, key, dx, dy, dw, dh) => {
  const im = ART[`bld/${key}` as keyof typeof ART];
  if (!ready(im)) return false;
  ctx.drawImage(im!, dx, dy, dw, dh);
  return true;
};

const drawProp: PropDraw = (ctx, kind, x, y, size) => {
  const im = ART[`units/${kind}` as keyof typeof ART];
  if (!ready(im)) return;
  const h = size * (im!.naturalHeight / im!.naturalWidth);
  ctx.save();
  ctx.fillStyle = "rgba(18,15,10,0.34)";
  ctx.beginPath();
  ctx.ellipse(x + size * 0.08, y, size * 0.46, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(im!, x - size / 2, y - h, size, h);
  ctx.restore();
};
/** frames per baked strip (art-src/baked/strips/manifest.json) */
const STRIP_FRAMES = 4;

// The old note, still true for the TOWN: streets, blocks,
// trucks, barricades, aim lines -- so there is nothing here that can 404 and
// nothing that can disagree with a collision box (ADR-0088). Two sprite names
// used to sit here as drop-in slots for a future tank and truck render, which
// meant scripts/art-audit.mjs reported "2 missing" forever; an audit that is
// never zero is an audit nobody reads. Add the names back the day the art
// exists, not before.

let AR: Record<string, string> = {};
const T = (k: string) => AR[k] ?? k;

export type VanguardStrings = {
  intro?: string;
  introDaily?: string;
  shell?: Record<string, string>;
  arena?: Record<string, string>;
};

/** Baked once: asphalt grain, so the streets are not flat paint. */
let ROAD_TEX: CanvasImageSource | null = null;
function bakeRoad() {
  if (ROAD_TEX) return;
  let seed = 0x1a2b3c4d;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ROAD_TEX = canvasTex(96, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const a = 0.03 + rnd() * 0.05;
      g.fillStyle = rnd() < 0.5 ? `rgba(18,18,14,${a})` : `rgba(150,150,138,${a})`;
      g.fillRect(rnd() * w, rnd() * h, 0.9 + rnd() * 1.7, 0.9 + rnd() * 1.7);
    }
  });
}

export default function Client({ strings }: { strings?: VanguardStrings }) {
  AR = strings?.arena ?? {};
  const camRef = useRef({ x: 0, y: 0 });

  const createSim = useCallback(
    (w: number, h: number, seed: string, reduced: boolean, stats: Parameters<typeof createVanguard>[4]) =>
      createVanguard(w, h, seed, reduced, stats),
    [],
  );

  const draw = useCallback((ctx: CanvasRenderingContext2D, sAny: unknown, _view: ShellView) => {
    const s = sAny as VgState;
    camRef.current = { x: s.camX, y: s.camY };
    const shake = s.shake;
    const ox = -s.camX + (shake > 0 ? (Math.random() - 0.5) * shake : 0);
    const oy = -s.camY + (shake > 0 ? (Math.random() - 0.5) * shake : 0);

    // ── the ground ─────────────────────────────────────────────────────────
    // Hashed in scene.ts rather than a tiled bake here, so the offline shot
    // (scripts/vanguard-shot.mts) draws the same street the player drives on.
    drawGround(ctx, -ox, -oy);
    drawMarkings(ctx, s.nodeX, s.nodeY, ox, oy);

    // ── the fought-over ground, under everything else ──────────────────────
    // -ox/-oy, not camX/camY: ox already carries the screen shake, and the
    // debris has to shake with the ground it is lying on.
    drawScenery(ctx, -ox, -oy);

    // ── buildings, culled to the view ──────────────────────────────────────
    // One implementation, in scene.ts, shared with scripts/vanguard-shot.mts:
    // a review picture that is drawn by different code than the game is not a
    // review picture.
    const smoking = drawBuildings(ctx, s.buildings, ox, oy, VIEW_W, VIEW_H, drawProp, drawBld);
    for (const sm of smoking) drawSmoke(ctx, sm.x, sm.y, s.t, sm.seed, false);

    // ── the live rally point ───────────────────────────────────────────────
    const cp = s.route[s.cpIdx];
    if (cp) {
      const x = cp.x + ox;
      const y = cp.y + oy;
      const pulse = 0.55 + 0.45 * Math.sin(s.t * 3.4);
      ctx.strokeStyle = `rgba(240,179,64,${0.35 + 0.35 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, CP_R * (0.86 + 0.14 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(240,179,64,0.10)";
      ctx.fill();
      // OFF-SCREEN ARROW. In a town the objective is usually behind a block.
      if (x < 0 || y < 0 || x > VIEW_W || y > VIEW_H) {
        const cx = VIEW_W / 2;
        const cy = VIEW_H / 2;
        const a = Math.atan2(y - cy, x - cx);
        const rx = cx + Math.cos(a) * (VIEW_W * 0.42);
        const ry = cy + Math.sin(a) * (VIEW_H * 0.42);
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(a);
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-7, -7);
        ctx.lineTo(-7, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // ── barricades ─────────────────────────────────────────────────────────
    for (const bar of s.barricades) {
      for (const sg of bar.segs) {
        if (sg.dead) continue;
        const x = sg.x + ox;
        const y = sg.y + oy;
        if (x < -20 || y < -20 || x > VIEW_W + 20 || y > VIEW_H + 20) continue;
        longShadow(ctx, x, y, SEG_R * 0.8, 1);
        ctx.fillStyle = "#8d8778";
        ctx.beginPath();
        ctx.arc(x, y, SEG_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(24,20,12,0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
        // hazard stripe, so concrete reads as an obstacle rather than scenery
        ctx.strokeStyle = "rgba(240,179,64,0.55)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - SEG_R * 0.6, y - SEG_R * 0.2);
        ctx.lineTo(x + SEG_R * 0.6, y + SEG_R * 0.2);
        ctx.stroke();
      }
    }

    // ── trucks, their aim lines, and off-screen threat pips ────────────────
    for (const tk of s.trucks) {
      if (!tk.spawned) continue;
      const x = tk.x + ox;
      const y = tk.y + oy;
      if (!tk.alive) continue;
      const onScreen = x > -30 && y > -30 && x < VIEW_W + 30 && y < VIEW_H + 30;
      // THE LOCK. A magenta line that grows to the player: the whole reason a
      // burst is dodgeable rather than a coin flip.
      if (tk.locked) {
        const f = Math.min(1, tk.lockT / MG_LOCK_T);
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.5 * f;
        ctx.strokeStyle = HOSTILE;
        ctx.lineWidth = 1 + f * 1.6;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(s.px + ox, s.py + oy);
        ctx.stroke();
        ctx.restore();
      }
      if (onScreen) {
        if (ready(ART["units/truck-theirs"])) {
          // baked SUV in theirs-red; the GUN stays drawn over it, because the
          // gun is the reason a truck is dangerous and magenta is the law
          ctx.save();
          ctx.fillStyle = "rgba(20,16,10,0.35)";
          ctx.beginPath();
          ctx.ellipse(x + 1.5, y + 2, TRUCK_R * 1.15, TRUCK_R * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          sprRot(ctx, ART["units/truck-theirs"], x, y, TRUCK_R * 2.4, tk.a, () => drawTruck(ctx, x, y, tk.a));
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(tk.a);
          ctx.strokeStyle = HOSTILE;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-TRUCK_R * 0.2, 0);
          ctx.lineTo(TRUCK_R * 0.9, 0);
          ctx.stroke();
          ctx.restore();
        } else {
          drawTruck(ctx, x, y, tk.a);
        }
      } else {
        // edge pip: something is shooting at you from over there
        const cx = VIEW_W / 2;
        const cy = VIEW_H / 2;
        const a = Math.atan2(y - cy, x - cx);
        const px = cx + Math.cos(a) * (VIEW_W * 0.46);
        const py = cy + Math.sin(a) * (VIEW_H * 0.46);
        ctx.fillStyle = tk.locked ? HOSTILE : "rgba(255,92,240,0.45)";
        ctx.beginPath();
        ctx.arc(px, py, tk.locked ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── shells ─────────────────────────────────────────────────────────────
    for (const sh of s.shells) {
      const x = sh.x + ox;
      const y = sh.y + oy;
      if (x < -10 || y < -10 || x > VIEW_W + 10 || y > VIEW_H + 10) continue;
      if (sh.mine) {
        ctx.strokeStyle = "#ffe6a8";
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - sh.vx * 0.012, y - sh.vy * 0.012);
        ctx.stroke();
      } else {
        ctx.fillStyle = HOSTILE;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── the tank ───────────────────────────────────────────────────────────
    {
      const hurt = s.iframes > 0 && Math.floor(s.t * 20) % 2 === 0;
      if (ready(ART["units/tank-mine"])) {
        const tx = s.px + ox;
        const ty = s.py + oy;
        ctx.save();
        ctx.fillStyle = "rgba(20,16,10,0.35)";
        ctx.beginPath();
        ctx.ellipse(tx + 1.5, ty + 2.5, TANK_R * 1.25, TANK_R * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (hurt) ctx.filter = "brightness(2.4)";
        // odometer frames: the track cycle runs with distance, replay-pure
        const frame = Math.floor((Math.abs(s.px) + Math.abs(s.py)) / 6);
        stripRot(ctx, ART["units/tank-mine"]!, STRIP_FRAMES, frame, tx, ty, TANK_R * 3.4, s.pa, () =>
          drawTank(ctx, tx, ty, s.pa, hurt),
        );
        ctx.restore();
      } else {
        drawTank(ctx, s.px + ox, s.py + oy, s.pa, hurt);
      }
    }

    // ── particles ──────────────────────────────────────────────────────────
    for (const p of s.parts) {
      const x = p.x + ox;
      const y = p.y + oy;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.2));
      ctx.fillStyle = p.kind === "spark" ? "#ffd76a" : p.kind === "smoke" ? "#6b6b63" : "#9a8f77";
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── floats ─────────────────────────────────────────────────────────────
    for (const f of s.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.t * 1.6));
      ctx.fillStyle = f.good ? "#9ff08a" : "#ffd0cb";
      ctx.font = "800 12px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText(f.txt, f.x + ox, f.y + oy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // ── HUD ────────────────────────────────────────────────────────────────
    // ON A PLATE. Every number here was thin grey type laid straight onto a
    // pale street, so the score, the rally count and the clock were all
    // competing with whatever the town happened to be doing underneath them.
    // The clock also sat exactly where RunShell puts the SFX button.
    const pill = (x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = "rgba(10,12,15,0.62)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 7);
      ctx.fill();
    };
    pill(10, 10, 132, 40);
    ctx.fillStyle = "#f4f7fa";
    ctx.font = "800 21px ui-monospace, Menlo, monospace";
    ctx.fillText(`${Math.round(s.score)}`, 18, 32);
    ctx.fillStyle = "#c4cedb";
    ctx.font = "700 11px ui-monospace, Menlo, monospace";
    ctx.fillText(`${T("RALLY")} ${Math.min(s.cpIdx + 1, CHECKPOINTS)} / ${CHECKPOINTS}`, 18, 45);
    // The clock drops BELOW the shell's SFX button rather than under it.
    const left = Math.max(0, RUN_SECONDS - s.raceT);
    pill(VIEW_W - 78, 58, 68, 26);
    ctx.fillStyle = left < 15 ? "#ff9b88" : "#e2e9f1";
    ctx.font = "800 15px ui-monospace, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`, VIEW_W - 18, 77);
    ctx.textAlign = "left";
    // HULL: a slim framed bar, not a slab of green across the whole floor.
    const hpF = Math.max(0, s.hp / s.maxHp);
    const bw = VIEW_W - 28;
    ctx.fillStyle = "rgba(10,12,15,0.6)";
    ctx.beginPath();
    ctx.roundRect(14, VIEW_H - 24, bw, 11, 5);
    ctx.fill();
    ctx.fillStyle = hpF > 0.5 ? "#7ee06a" : hpF > 0.25 ? "#ffd166" : "#ff6a5c";
    ctx.beginPath();
    ctx.roundRect(16, VIEW_H - 22, Math.max(0, (bw - 4) * hpF), 7, 3.5);
    ctx.fill();
    ctx.fillStyle = "rgba(226,233,241,0.85)";
    ctx.font = "700 9.5px ui-monospace, Menlo, monospace";
    ctx.fillText(T("HULL"), 14, VIEW_H - 30);

    // ── banner ─────────────────────────────────────────────────────────────
    if (s.banner) {
      const a = Math.min(1, s.banner.t * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(10,12,8,0.72)";
      ctx.fillRect(0, VIEW_H * 0.36, VIEW_W, 52);
      ctx.fillStyle = ACCENT;
      ctx.font = "800 19px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText(T(s.banner.txt), VIEW_W / 2, VIEW_H * 0.36 + 24);
      if (s.banner.sub) {
        ctx.fillStyle = "#c9d4dc";
        ctx.font = "700 11.5px ui-monospace, Menlo, monospace";
        ctx.fillText(T(s.banner.sub), VIEW_W / 2, VIEW_H * 0.36 + 42);
      }
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    void ready;
    void sprRot;
  }, []);

  const onFrame = useCallback((sAny: unknown, sfx: Sfx) => {
    const s = sAny as VgState;
    const p = (onFrame as unknown as { p?: { kills: number; cp: number; hp: number } }).p ?? {
      kills: 0,
      cp: 0,
      hp: s.maxHp,
    };
    if (s.kills > p.kills) sfx.play("explode");
    if (s.cpIdx > p.cp) sfx.play("powerup");
    if (s.hp < p.hp - 6) sfx.play("hit");
    (onFrame as unknown as { p?: unknown }).p = { kills: s.kills, cp: s.cpIdx, hp: s.hp };
  }, []);

  return (
    <RunShell
      game={GAME}
      title="Vanguard"
      accent={ACCENT}
      strings={strings?.shell}
      intro={<GameIntro intro={strings?.intro} daily={strings?.introDaily} more={strings?.shell?.howItWorks} />}
      worldSize={() => ({ w: VIEW_W, h: VIEW_H })}
      // THE CAMERA CONTRACT. The sim owns camX/camY and draws with them
      // subtracted, so the pointer has to have them ADDED to arrive in the same
      // space. Warpath's exact pattern.
      pointerTransform={(x, y) => ({ x: x + camRef.current.x, y: y + camRef.current.y })}
      createSim={createSim}
      step={(s, dt, input: ShellInput) => stepVanguard(s as VgState, dt, input)}
      draw={draw}
      onFrame={onFrame}
      done={(s) => vanguardDone(s as VgState)}
      score={(s) => vanguardScore(s as VgState)}
      shareBuild={(s, dayKey) => {
        const g = gridEmoji(s as VgState);
        return { grid: g, payload: sharePayload(dayKey, vanguardScore(s as VgState), g) };
      }}
      sfxPack={["powerup", "hit", "cannon", "explode", "banner", "fanfare"]}
      resultHeadline={(s) => {
        const st = s as VgState;
        return st.win ? T("THE COLUMN IS THROUGH") : st.died ? T("HULL BREACHED") : T("OUT OF TIME");
      }}
      resultSub={(s) => {
        const st = s as VgState;
        return `${T("RALLY")} ${st.cpIdx}/${CHECKPOINTS} · ${st.kills} ${T("TRUCKS")} · ${st.breaches} ${T("BREACHES")}`;
      }}
      runMeta={(s) => {
        const st = s as VgState;
        return { won: st.win, rally: st.cpIdx, kills: st.kills, breaches: st.breaches };
      }}
    />
  );
}
