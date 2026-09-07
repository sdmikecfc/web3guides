"use client";
/**
 * HORDE - the page client. Presentation ONLY: the sim rules, this file
 * renders FROM state and never duplicates a rule. Canvas 2D on a fixed
 * 960x640 design space (= the sim's authored room, so the camera IS the
 * room), fixed-dt accumulator stepping (1/60s quanta, the harness contract),
 * pointer normalized to [0,1] and handed to the sim raw - the sim owns every
 * hit zone and every pickup; this file adds ZERO client-side game logic.
 *
 * PRESENTATION MEMORY (the gauntlet idiom carried whole): the sim publishes
 * monotonic counters (swings/casts/crits/kills/dmgTaken/potsUsed) plus
 * per-entity positions and hp; this file diffs a Prev snapshot per fixed
 * step into countdown fx - hit flashes and scale punches, per-kit skill
 * shapes, THE LOOT BEAM moments, death sinks with bone scatter, screen
 * shake, and the big-moment hit-stop (stepping pauses, rendering continues).
 * Math.random is allowed page-side and nowhere near the sim.
 *
 * ANIMATION LAW: tween + punch only, all skill light additive under the
 * <=150 lighter-draws budget (draw.ts enforces). Composite grade LAST.
 */

import { useEffect, useRef } from "react";
import type { Loadout } from "../_shared/rules/core";
import { GRADES, makeGrade, type Grade } from "../_shared/gradekit";
import { CHUNKS, KITS, SPELL_TIER_MAX } from "./content";
import {
  FINE,
  ROOM_H,
  ROOM_W,
  createHorde,
  hordeScore,
  stepHorde,
  type FloorItem,
  type HordeState,
  type SimInput,
} from "./sim";
import {
  CLASS_ACCENT,
  DESIGN_H,
  DESIGN_W,
  PAL,
  RARITY,
  art,
  bakeRoom,
  drawBanner,
  drawBeam,
  drawBoltFx,
  drawChest,
  drawCritChip,
  drawDeadOverlay,
  drawEliteAura,
  drawEnemyVector,
  drawExit,
  drawExitArrow,
  drawHeroVector,
  drawHud,
  drawItem,
  drawProjectile,
  drawRingFx,
  drawShadow,
  drawSpriteFlip,
  drawSpriteTinted,
  drawTargetMarker,
  drawTorches,
  enemySpriteH,
  HERO_SPRITE_H,
  idPhase,
  resetAddBudget,
  txt,
  type RoomBake,
} from "./draw";
import {
  DEATH_S,
  FACE_X,
  FACE_Y,
  HIT_STOP_S,
  RK_ARC,
  RK_DISC,
  RK_PILLAR,
  RK_RING,
  SWING_S,
  clearRoomFx,
  mkFx,
  mkPrev,
  snap,
  type Fx,
  type Prev,
} from "./fx";

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 8;
const DPR_CAP = 2;
/** Wizard cast-range clamp mirrored for the blast marker only (px; the sim
 * owns the real clamp - this is where the fx ring lands, nothing more). */
const BLAST_RANGE_PX = 340;

export interface HordeClientProps {
  loadout: Loadout | null;
  seed: string;
  onDone?: (score: number) => void;
}

export default function HordeClient({ loadout, seed, onDone }: HordeClientProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<HordeState | null>(null);
  const fxRef = useRef<Fx>(mkFx());
  const prevRef = useRef<Prev>(mkPrev());
  const bakeRef = useRef<RoomBake | null>(null);
  const gradeRef = useRef<Grade | null>(null);
  const itemBirthRef = useRef<WeakMap<FloorItem, number>>(new WeakMap());
  const doneCalledRef = useRef(false);
  const pointerRef = useRef<{ x: number | null; y: number | null; down: boolean; upQueued: boolean; stepped: boolean }>({
    x: null,
    y: null,
    down: false,
    upQueued: false,
    stepped: true,
  });
  const spaceRef = useRef(false);
  const clientEdgeRef = useRef({ down: false, space: false }); // dead-screen restart edges
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
    gradeRef.current = makeGrade({ ...GRADES.horde, staticGrain: reduced });
    const simInput: SimInput = { px: null, py: null, down: false, space: false }; // reused every step

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
      stateRef.current = createHorde(ROOM_W, ROOM_H, p.seed, false, p.loadout);
      fxRef.current = mkFx();
      prevRef.current = mkPrev();
      itemBirthRef.current = new WeakMap();
      doneCalledRef.current = false;
    };

    /** Chime-ready hook: the season shell can wire audio here; the client
     * itself stays silent. Fired once per loot drop with its kind. */
    const lootChime = (kind: string): void => {
      void kind;
    };

    // ── spawn helpers (pool reuse; free-or-oldest, never allocate) ─────────
    const spawnSpark = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      size: number,
      color: string,
      add: boolean,
      life: number,
    ): void => {
      const fx = fxRef.current;
      let pick = fx.sparks[0];
      for (const sp of fx.sparks) {
        if (!sp.on) {
          pick = sp;
          break;
        }
        if (sp.t > pick.t) pick = sp;
      }
      pick.on = true;
      pick.t = 0;
      pick.life = life;
      pick.x = x;
      pick.y = y;
      pick.vx = vx;
      pick.vy = vy;
      pick.size = size;
      pick.color = color;
      pick.add = add;
      pick.drag = 3.2;
    };
    const spawnRing = (
      kind: number,
      x: number,
      y: number,
      r0: number,
      r1: number,
      width: number,
      color: string,
      life: number,
      delay = 0,
      ang = 0,
      spread = 0,
    ): void => {
      const fx = fxRef.current;
      let pick = fx.rings[0];
      for (const r of fx.rings) {
        if (!r.on) {
          pick = r;
          break;
        }
        if (r.t > pick.t) pick = r;
      }
      pick.on = true;
      pick.delay = delay;
      pick.t = 0;
      pick.life = life;
      pick.x = x;
      pick.y = y;
      pick.r0 = r0;
      pick.r1 = r1;
      pick.width = width;
      pick.color = color;
      pick.kind = kind;
      pick.ang = ang;
      pick.spread = spread;
    };
    const spawnBolt = (x0: number, y0: number, x1: number, y1: number, width: number, color: string, life: number): void => {
      const fx = fxRef.current;
      let pick = fx.bolts[0];
      for (const b of fx.bolts) {
        if (!b.on) {
          pick = b;
          break;
        }
        if (b.t > pick.t) pick = b;
      }
      pick.on = true;
      pick.t = 0;
      pick.life = life;
      pick.x0 = x0;
      pick.y0 = y0;
      pick.x1 = x1;
      pick.y1 = y1;
      pick.width = width;
      pick.color = color;
    };
    const spawnGhost = (x: number, y: number, flip: boolean, life: number): void => {
      const s = stateRef.current;
      if (!s) return;
      const fx = fxRef.current;
      let pick = fx.ghosts[0];
      for (const gh of fx.ghosts) {
        if (!gh.on) {
          pick = gh;
          break;
        }
        if (gh.t > pick.t) pick = gh;
      }
      pick.on = true;
      pick.t = 0;
      pick.life = life;
      pick.x = x;
      pick.y = y;
      pick.flip = flip;
      pick.cls = s.classId;
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
      pick.x = x + (Math.random() - 0.5) * 12;
      pick.y = y;
      pick.text = text;
      pick.color = color;
      pick.big = big;
    };
    const spawnDeath = (x: number, y: number, key: string, flip: boolean, elite: boolean): void => {
      const fx = fxRef.current;
      let pick = fx.deaths[0];
      for (const d of fx.deaths) {
        if (!d.on) {
          pick = d;
          break;
        }
        if (d.t > pick.t) pick = d;
      }
      pick.on = true;
      pick.t = 0;
      pick.x = x;
      pick.y = y;
      pick.key = key;
      pick.flip = flip;
      pick.elite = elite;
      // bone scatter: pale chips skittering out (plain draws, not additive)
      const n = elite ? 10 : 6;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 130;
        spawnSpark(x, y - 10, Math.cos(a) * sp, Math.sin(a) * sp * 0.55, 1.5 + Math.random() * 1.8, PAL.bone, false, 0.55);
      }
    };
    const banner = (text: string, sub: string, color: string): void => {
      const b = fxRef.current.banner;
      b.text = text;
      b.sub = sub;
      b.t = 0.0001;
      b.color = color;
    };

    /** Claim/find the hit-memory slot for a live enemy id. */
    const eFxIdx = (id: string): number => {
      const arr = fxRef.current.eFx;
      let free = -1;
      let weakest = 0;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return i;
        if (arr[i].id === "" && free < 0) free = i;
        if (arr[i].flash < arr[weakest].flash) weakest = i;
      }
      const j = free >= 0 ? free : weakest;
      arr[j].id = id;
      arr[j].flash = 0;
      arr[j].punch = 0;
      return j;
    };

    // ── the skill shapes (per-kit, class accent, all additive-pooled) ──────
    const spawnSkillFx = (s: HordeState, prevX: number, prevY: number): void => {
      const kit = KITS[s.classId];
      const acc = CLASS_ACCENT[s.classId];
      const tier = Math.max(0, Math.min(SPELL_TIER_MAX, s.spellTier));
      const area = kit.area[tier];
      const hx = s.x / FINE;
      const hy = s.y / FINE;
      const ang = Math.atan2(FACE_Y[s.facing], FACE_X[s.facing]);
      if (kit.shape === "nova") {
        spawnRing(RK_RING, hx, hy - 14, 12, area, 8, acc, 0.38);
        spawnRing(RK_DISC, hx, hy - 14, 6, area * 0.55, 0, acc, 0.28);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const sp = 150 + Math.random() * 130;
          spawnSpark(hx, hy - 14, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, 2, acc, true, 0.4);
        }
      } else if (kit.shape === "dash") {
        const x0 = prevX / FINE;
        const y0 = prevY / FINE;
        spawnBolt(x0, y0 - 16, hx, hy - 16, 24, acc, 0.3);
        for (let k = 1; k <= 4; k++) {
          const f = k / 5;
          spawnGhost(x0 + (hx - x0) * f, y0 + (hy - y0) * f, fxRef.current.heroFlip, 0.3);
        }
        for (let i = 0; i < 6; i++)
          spawnSpark(hx, hy - 12, (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 130, 2, acc, true, 0.3);
      } else if (kit.shape === "line") {
        const ex = hx + Math.cos(ang) * area;
        const ey = hy + Math.sin(ang) * area;
        spawnBolt(hx, hy - 16, ex, ey - 16, 12, acc, 0.28);
        spawnRing(RK_DISC, ex, ey - 16, 4, 22, 0, acc, 0.25);
        for (let i = 0; i < 4; i++)
          spawnSpark(ex, ey - 16, (Math.random() - 0.5) * 180, (Math.random() - 0.5) * 110, 2, acc, true, 0.3);
      } else if (kit.shape === "wave") {
        for (let k = 0; k < 3; k++)
          spawnRing(RK_ARC, hx, hy - 14, 16 + k * 8, area, 7, acc, 0.42, k * 0.07, ang, 1.5);
      } else if (kit.shape === "blast") {
        // at the pointer, clamped to cast range (the fx lands where the sim
        // resolved; a null pointer falls back exactly like the sim does)
        const ptr = pointerRef.current;
        let bx = ptr.x != null ? ptr.x * DESIGN_W : hx + Math.cos(ang) * (BLAST_RANGE_PX / 2);
        let by = ptr.y != null && ptr.x != null ? ptr.y * DESIGN_H : hy + Math.sin(ang) * (BLAST_RANGE_PX / 2);
        const dx = bx - hx;
        const dy = by - hy;
        const d2 = dx * dx + dy * dy;
        if (d2 > BLAST_RANGE_PX * BLAST_RANGE_PX) {
          const sc = BLAST_RANGE_PX / Math.sqrt(d2);
          bx = hx + dx * sc;
          by = hy + dy * sc;
        }
        spawnRing(RK_RING, bx, by, 8, area, 8, acc, 0.35);
        spawnRing(RK_DISC, bx, by, 4, area * 0.8, 0, acc, 0.3);
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 120 + Math.random() * 160;
          spawnSpark(bx, by, Math.cos(a) * sp, Math.sin(a) * sp * 0.7, 2, acc, true, 0.38);
        }
      } else {
        // smite: the pillar of judgement + a ground nova
        spawnRing(RK_PILLAR, hx, hy, 0, 210, 54, acc, 0.5);
        spawnRing(RK_RING, hx, hy - 8, 10, area, 7, acc, 0.4, 0.05);
        for (let i = 0; i < 8; i++)
          spawnSpark(hx + (Math.random() - 0.5) * 30, hy - 8, (Math.random() - 0.5) * 40, -60 - Math.random() * 90, 2, acc, true, 0.5);
      }
    };

    // ── the delta engine: one call per fixed step, after stepHorde ─────────
    const applyDeltas = (s: HordeState): void => {
      const p = prevRef.current;
      const fx = fxRef.current;
      const birth = itemBirthRef.current;
      if (!p.inited) {
        snap(p, s);
        return;
      }
      const newRoom = s.depth !== p.depth;
      if (newRoom) {
        clearRoomFx(fx);
        banner(`DEPTH ${s.depth + 1}`, "THE LEGION THICKENS", PAL.gold);
      }
      if (!newRoom && s.exitOpen === 1 && p.exitOpen === 0) banner("EXIT OPEN", "ROOM CLEAR +100", PAL.gold);

      // hero facing + walk memory
      const fxc = FACE_X[s.facing];
      if (fxc < 0) fx.heroFlip = true;
      else if (fxc > 0) fx.heroFlip = false;
      if (s.x !== p.x || s.y !== p.y) fx.moveT = 0.15;

      // hero pain: flash + 4-6px shake (the sim already resolved the damage)
      if (s.dmgTaken > p.dmgTaken) {
        fx.heroFlash = 1;
        fx.heroPunch = 1;
        fx.shake = Math.max(fx.shake, 0.6);
        fx.shakeAmp = reduced ? 0 : 5;
      }

      // orb pulses: any heal lights the red orb; a mana jump beyond the
      // 1-point trickle is a potion lighting the blue one
      if (s.hp > p.hp) fx.orbHp = 1;
      if (s.mana - p.mana > 1) fx.orbMp = 1;

      const hx = s.x / FINE;
      const hy = s.y / FINE;

      // tier pickups: the beam paid off
      if (s.weaponTier > p.weaponTier) {
        spawnFloat(hx, hy - 44, RARITY.wpnUp.label, RARITY.wpnUp.beam, true);
        spawnRing(RK_DISC, hx, hy - 12, 6, 34, 0, RARITY.wpnUp.beam, 0.35);
      }
      if (s.spellTier > p.spellTier) {
        spawnFloat(hx, hy - 44, RARITY.splUp.label, RARITY.splUp.beam, true);
        spawnRing(RK_DISC, hx, hy - 12, 6, 34, 0, RARITY.splUp.beam, 0.35);
      }
      if (s.hpPots > p.hpPots) spawnFloat(hx, hy - 34, RARITY.hpPot.label, RARITY.hpPot.beam, false);
      if (s.mpPots > p.mpPots) spawnFloat(hx, hy - 34, RARITY.mpPot.label, RARITY.mpPot.beam, false);

      // the swing arc (melee cadence)
      if (s.swings > p.swings) {
        const kit = KITS[s.classId];
        const ang = Math.atan2(FACE_Y[s.facing], FACE_X[s.facing]);
        spawnRing(RK_ARC, hx, hy - 14, kit.swingRange * 0.55, kit.swingRange, 9, CLASS_ACCENT[s.classId], SWING_S, 0, ang, 0.95);
      }

      // the class skill (shape per kit; dash needs the pre-step position)
      if (s.casts > p.casts) spawnSkillFx(s, p.x, p.y);

      if (!newRoom) {
        // per-enemy hit memory: hp drop = white flash + scale punch (the
        // last struck position also anchors the crit flash below)
        let struck = false;
        let struckX = 0;
        let struckY = 0;
        for (const en of s.enemies) {
          for (let j = 0; j < p.eN; j++) {
            if (p.eId[j] !== en.id) continue;
            if (en.hp < p.eHp[j]) {
              const k = eFxIdx(en.id);
              fx.eFx[k].flash = 1;
              fx.eFx[k].punch = 1;
              struck = true;
              struckX = en.x / FINE;
              struckY = en.y / FINE;
            }
            break;
          }
        }
        // deaths: a prev enemy missing now fell this step
        let eliteFell = false;
        for (let j = 0; j < p.eN; j++) {
          if (p.eHp[j] <= 0) continue;
          const id = p.eId[j];
          let alive = false;
          for (const en of s.enemies) {
            if (en.id === id) {
              alive = true;
              break;
            }
          }
          if (alive) continue;
          const dx = p.eX[j] / FINE;
          const dy = p.eY[j] / FINE;
          spawnDeath(dx, dy, p.eKey[j], hx < dx, p.eElite[j] === 1);
          struck = true; // a killing blow landed here (crit anchor = corpse)
          struckX = dx;
          struckY = dy;
          if (p.eElite[j] === 1) {
            eliteFell = true;
            spawnFloat(dx, dy - 40, `+${p.eXp[j]}`, PAL.gold, true);
            spawnRing(RK_RING, dx, dy - 12, 8, 40, 5, "#7ec8d8", 0.4);
          }
          // free the hit-memory slot
          for (const e of fx.eFx) {
            if (e.id === id) {
              e.id = "";
              e.flash = 0;
              e.punch = 0;
              break;
            }
          }
        }
        // big moments: an elite falls or a wave wipes = hit-stop + shake
        const killsD = s.kills - p.kills;
        if (eliteFell || killsD >= 3) {
          fx.hitStop = HIT_STOP_S;
          fx.shake = Math.max(fx.shake, 0.5);
          fx.shakeAmp = reduced ? 0 : Math.max(fx.shakeAmp, eliteFell ? 4 : 3);
        } else if (s.crits > p.crits) {
          fx.shake = Math.max(fx.shake, 0.25);
          fx.shakeAmp = reduced ? 0 : Math.max(fx.shakeAmp, 2);
        }
        // crit flash: the hidden d20 came up (nat >= critRange doubled the
        // dice) - a gold mini-die chip + CRIT float on the last struck enemy
        // (killing blow = the corpse), else off the hero's facing. Capped at
        // 3 live CRIT floats so horde density stays readable; reduced motion
        // keeps the float and drops the ring.
        if (s.crits > p.crits) {
          let liveCrits = 0;
          for (const f of fx.floats) if (f.on && f.text === "CRIT") liveCrits++;
          if (liveCrits < 3) {
            const cx = struck ? struckX : hx + FACE_X[s.facing] * 30;
            const cy = struck ? struckY : hy + FACE_Y[s.facing] * 30;
            spawnFloat(cx, cy - 52, "CRIT", PAL.gold, false);
            if (!reduced) spawnRing(RK_RING, cx, cy - 14, 6, 30, 4, PAL.gold, 0.3);
          }
        }
      }

      // loot drops: brand-new floor items get a birth stamp + the drop pop
      for (const it of s.items) {
        if (birth.has(it)) continue;
        birth.set(it, fx.time);
        const ix = it.x / FINE;
        const iy = it.y / FINE;
        const r = RARITY[it.kind] ?? RARITY.hpPot;
        spawnRing(RK_DISC, ix, iy - 4, 3, 24, 0, r.core, 0.3);
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 50 + Math.random() * 90;
          spawnSpark(ix, iy - 6, Math.cos(a) * sp, Math.sin(a) * sp * 0.5 - 30, 1.6, r.core, true, 0.45);
        }
        lootChime(it.kind);
      }

      if (s.phase === "dead" && p.phase !== "dead") {
        fx.deathT = 0.0001;
        fx.shake = Math.max(fx.shake, 1);
        fx.shakeAmp = reduced ? 0 : 7;
        if (!doneCalledRef.current) {
          doneCalledRef.current = true;
          onDoneRef.current?.(hordeScore(s));
        }
      }
      snap(p, s);
    };

    // ── fx clocks ─────────────────────────────────────────────────────────
    const tickFx = (dt: number, realDt: number): void => {
      const fx = fxRef.current;
      fx.time += realDt;
      if (fx.heroFlash > 0) fx.heroFlash = Math.max(0, fx.heroFlash - dt * 5);
      if (fx.heroPunch > 0) fx.heroPunch *= Math.exp(-dt * 11);
      if (fx.moveT > 0) fx.moveT = Math.max(0, fx.moveT - dt);
      if (fx.orbHp > 0) fx.orbHp = Math.max(0, fx.orbHp - dt * 2.2);
      if (fx.orbMp > 0) fx.orbMp = Math.max(0, fx.orbMp - dt * 2.2);
      if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 2.4);
      if (fx.banner.t > 0 && fx.banner.t < 99) fx.banner.t += dt;
      if (fx.deathT > 0) fx.deathT += realDt;
      for (const e of fx.eFx) {
        if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5.5);
        if (e.punch > 0) e.punch *= Math.exp(-dt * 11);
      }
      for (const sp of fx.sparks) {
        if (!sp.on) continue;
        sp.t += dt;
        if (sp.t >= sp.life) {
          sp.on = false;
          continue;
        }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        const dr = Math.max(0, 1 - sp.drag * dt);
        sp.vx *= dr;
        sp.vy *= dr;
      }
      for (const r of fx.rings) {
        if (!r.on) continue;
        if (r.delay > 0) {
          r.delay -= dt;
          continue;
        }
        r.t += dt;
        if (r.t >= r.life) r.on = false;
      }
      for (const b of fx.bolts) {
        if (!b.on) continue;
        b.t += dt;
        if (b.t >= b.life) b.on = false;
      }
      for (const gh of fx.ghosts) {
        if (!gh.on) continue;
        gh.t += dt;
        if (gh.t >= gh.life) gh.on = false;
      }
      for (const d of fx.deaths) {
        if (!d.on) continue;
        d.t += dt;
        if (d.t >= DEATH_S) d.on = false;
      }
      for (const f of fx.floats) {
        if (!f.on) continue;
        f.t += dt;
        f.y -= dt * 34;
        if (f.t > 1.1) f.on = false;
      }
    };

    // ── actor painters (from state + fx memory only) ──────────────────────
    const paintEnemyAt = (g: CanvasRenderingContext2D, s: HordeState, enIdx: number): void => {
      const fx = fxRef.current;
      const en = s.enemies[enIdx];
      const ex = en.x / FINE;
      const ey = en.y / FINE;
      const hgt = enemySpriteH(en.key);
      const phase = idPhase(en.id);
      const bob = Math.sin(fx.time * 3.1 + phase) * 1.4;
      const flip = s.x < en.x; // mirrored toward the hero (art faces right)
      drawShadow(g, ex, ey, hgt * 0.3);
      if (en.elite === 1) drawEliteAura(g, ex, ey, fx.time + phase);
      // hit memory (scan is id-stable; enemies churn, the pool never does)
      let flash = 0;
      let punch = 0;
      for (const e of fx.eFx) {
        if (e.id === en.id) {
          flash = e.flash;
          punch = e.punch;
          break;
        }
      }
      g.save();
      g.translate(ex, ey + bob);
      if (punch > 0.02) g.scale(1 + punch * 0.12, 1 - punch * 0.08);
      const im = art(`legion/side/${en.key}`);
      if (im) {
        drawSpriteFlip(g, im, 0, 0, hgt, flip);
        if (flash > 0.02) drawSpriteTinted(g, im, 0, 0, hgt, flip, "#ffffff", Math.min(1, flash));
      } else {
        if (flip) g.scale(-1, 1);
        drawEnemyVector(g, en.key, fx.time + phase, null);
        if (flash > 0.02) {
          g.globalAlpha = Math.min(1, flash);
          drawEnemyVector(g, en.key, fx.time + phase, "#ffffff");
          g.globalAlpha = 1;
        }
      }
      g.restore();
    };

    const paintHeroAt = (g: CanvasRenderingContext2D, s: HordeState): void => {
      const fx = fxRef.current;
      const hx = s.x / FINE;
      const hy = s.y / FINE;
      const bob = fx.moveT > 0 ? Math.sin(fx.time * 11) * 1.3 : Math.sin(fx.time * 2.2) * 0.6;
      drawShadow(g, hx, hy, 15);
      g.save();
      g.translate(hx, hy + bob);
      if (s.invulnF > 0) g.globalAlpha = 0.55 + 0.2 * Math.sin(fx.time * 40); // dash blur
      if (fx.heroPunch > 0.02) g.scale(1 + fx.heroPunch * 0.1, 1 - fx.heroPunch * 0.07);
      const im = art(`class/hero/${s.classId}`);
      if (im) {
        drawSpriteFlip(g, im, 0, 0, HERO_SPRITE_H, fx.heroFlip);
        if (fx.heroFlash > 0.02) drawSpriteTinted(g, im, 0, 0, HERO_SPRITE_H, fx.heroFlip, "#ffffff", Math.min(1, fx.heroFlash));
      } else {
        if (fx.heroFlip) g.scale(-1, 1);
        drawHeroVector(g, s.classId, fx.time, null);
        if (fx.heroFlash > 0.02) {
          g.globalAlpha = Math.min(1, fx.heroFlash);
          drawHeroVector(g, s.classId, fx.time, "#ffffff");
          g.globalAlpha = 1;
        }
      }
      g.restore();
    };

    // ── the painted frame ─────────────────────────────────────────────────
    const render = (): void => {
      const g = cv.getContext("2d");
      const s = stateRef.current;
      if (!g || !s) return;
      const fx = fxRef.current;
      const ptr = pointerRef.current;
      const birth = itemBirthRef.current;
      resetAddBudget();
      let shx = 0;
      let shy = 0;
      if (fx.shake > 0 && fx.shakeAmp > 0) {
        shx = (Math.random() - 0.5) * 2 * fx.shakeAmp * fx.shake;
        shy = (Math.random() - 0.5) * 2 * fx.shakeAmp * fx.shake;
      }

      g.fillStyle = PAL.ink;
      g.fillRect(0, 0, DESIGN_W, DESIGN_H);

      // room bake (once per chunk; seeded, so a revisit bakes identically)
      const chunk = CHUNKS[s.chunkIdx];
      if (!bakeRef.current || bakeRef.current.chunkIdx !== s.chunkIdx) bakeRef.current = bakeRoom(s.chunkIdx, chunk);
      const bake = bakeRef.current;

      // ── world space (everything below shakes together) ──
      g.save();
      g.translate(shx, shy);

      g.drawImage(bake.floor, 0, 0);
      drawTorches(g, bake, fx.time, 0, 0);
      for (let i = 0; i < chunk.chestSpots.length; i++) {
        const spot = chunk.chestSpots[i];
        drawChest(g, spot[0], spot[1], s.chests[i] === 1, fx.time);
      }
      drawExit(g, chunk, s.exitOpen === 1, fx.time, 0, 0);

      // THE LOOT: icon + rarity beam, persisting until pickup
      for (const it of s.items) {
        const ix = it.x / FINE;
        const iy = it.y / FINE;
        drawItem(g, it.kind, ix, iy, fx.time);
        drawBeam(g, it.kind, ix, iy, fx.time, birth.get(it) ?? fx.time);
      }

      // the fallen sink under the living
      for (const d of fx.deaths) {
        if (!d.on) continue;
        const k = d.t / DEATH_S;
        const hgt = enemySpriteH(d.key) * (1 - k * 0.25);
        g.save();
        g.globalAlpha = 1 - k;
        g.translate(d.x, d.y + k * 10);
        const im = art(`legion/side/${d.key}`);
        if (im) drawSpriteFlip(g, im, 0, 0, hgt, d.flip);
        else {
          if (d.flip) g.scale(-1, 1);
          drawEnemyVector(g, d.key, 0, null);
        }
        g.restore();
      }

      // actors, painter's order around the hero row
      const heroFineY = s.y;
      for (let i = 0; i < s.enemies.length; i++) if (s.enemies[i].y <= heroFineY) paintEnemyAt(g, s, i);
      // dash afterimages under the hero
      for (const gh of fx.ghosts) {
        if (!gh.on) continue;
        const k = gh.t / gh.life;
        g.save();
        g.globalAlpha = 0.3 * (1 - k);
        g.translate(gh.x, gh.y);
        const im = art(`class/hero/${gh.cls}`);
        if (im) drawSpriteFlip(g, im, 0, 0, HERO_SPRITE_H, gh.flip);
        else {
          if (gh.flip) g.scale(-1, 1);
          drawHeroVector(g, gh.cls, fx.time, CLASS_ACCENT[gh.cls]);
        }
        g.restore();
      }
      paintHeroAt(g, s);
      for (let i = 0; i < s.enemies.length; i++) if (s.enemies[i].y > heroFineY) paintEnemyAt(g, s, i);

      // bone bolts in flight
      for (const pr of s.projs) drawProjectile(g, pr, 0, 0);

      // skill light: bolts, rings/pillars, sparks (additive, budgeted)
      for (const b of fx.bolts) {
        if (!b.on) continue;
        drawBoltFx(g, b.x0, b.y0, b.x1, b.y1, b.width, b.color, 1 - b.t / b.life);
      }
      for (const r of fx.rings) {
        if (!r.on || r.delay > 0) continue;
        drawRingFx(g, r);
      }
      for (const sp of fx.sparks) {
        if (!sp.on) continue;
        const a = 1 - sp.t / sp.life;
        if (sp.add) {
          if (!(a > 0.02)) continue;
          g.globalCompositeOperation = "lighter";
          g.globalAlpha = a * 0.85;
          g.fillStyle = sp.color;
          g.fillRect(sp.x - sp.size, sp.y - sp.size, sp.size * 2, sp.size * 2);
          g.globalCompositeOperation = "source-over";
          g.globalAlpha = 1;
        } else {
          g.globalAlpha = a;
          g.fillStyle = sp.color;
          g.fillRect(sp.x - sp.size, sp.y - sp.size, sp.size * 2, sp.size * 2);
          g.globalAlpha = 1;
        }
      }

      // floating text
      for (const f of fx.floats) {
        if (!f.on) continue;
        const a = Math.min(1, (1.1 - f.t) / 0.3);
        g.globalAlpha = Math.max(0, a);
        g.font = `800 ${f.big ? 20 : 14}px "Arial Narrow","Roboto Condensed","Segoe UI",system-ui,sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.strokeStyle = "#05060a";
        g.lineWidth = 3;
        g.strokeText(f.text, Math.round(f.x), Math.round(f.y));
        g.fillStyle = f.color;
        g.fillText(f.text, Math.round(f.x), Math.round(f.y));
        if (f.text === "CRIT") drawCritChip(g, f.x, f.y - 16, f.t / 1.1);
        g.globalAlpha = 1;
      }

      // the walk target under the held pointer (display only)
      if (ptr.down && ptr.x != null && ptr.y != null && s.phase === "run") {
        drawTargetMarker(g, ptr.x * DESIGN_W, ptr.y * DESIGN_H, fx.time, CLASS_ACCENT[s.classId]);
      }

      g.restore();
      // ── end world space ──

      // HUD chrome, unshaken
      drawHud(g, s, fx.time, fx.orbHp, fx.orbMp);
      if (s.exitOpen === 1 && s.phase === "run") drawExitArrow(g, chunk, fx.time);
      if (fx.banner.t > 0 && fx.banner.t < 99) drawBanner(g, fx.banner.text, fx.banner.sub, fx.banner.t, fx.banner.color);
      if (s.phase === "dead") drawDeadOverlay(g, hordeScore(s), s.depth, s.kills, fx.deathT);

      // seed hint (dev free-play nicety)
      txt(g, propsRef.current.seed, DESIGN_W - 8, DESIGN_H - 8, 9, "rgba(139,133,119,0.4)", "right", 700);

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

      // dead screen: the client's own restart edge (the sim is inert now)
      if (s.phase === "dead") {
        const edges = clientEdgeRef.current;
        const downEdge = ptr.down && !edges.down;
        const spaceEdge = spaceRef.current && !edges.space;
        edges.down = ptr.down;
        edges.space = spaceRef.current;
        if ((downEdge || spaceEdge) && fx.deathT > 1.1) {
          reset();
          // swallow the restart tap so it cannot walk the fresh hero
          ptr.down = false;
          ptr.upQueued = false;
          ptr.stepped = true;
          clientEdgeRef.current.down = false;
          tickFx(0, 0);
          render();
          return;
        }
      } else {
        clientEdgeRef.current.down = ptr.down;
        clientEdgeRef.current.space = spaceRef.current;
      }

      if (fx.hitStop > 0) {
        // big-moment hit-stop: stepping pauses, rendering continues,
        // time is not owed back to the accumulator
        fx.hitStop = Math.max(0, fx.hitStop - frameDt);
        tickFx(0, frameDt);
        render();
        return;
      }

      acc += frameDt;
      let steps = 0;
      while (acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
        simInput.px = ptr.x;
        simInput.py = ptr.y;
        simInput.down = ptr.down;
        simInput.space = spaceRef.current;
        stepHorde(s, FIXED_DT, simInput);
        applyDeltas(s);
        if (ptr.down) ptr.stepped = true;
        acc -= FIXED_DT;
        steps++;
      }
      if (steps >= MAX_SUBSTEPS) acc = 0;
      // a tap shorter than one sim step still lands: release only after a step
      if (ptr.upQueued && ptr.stepped) {
        ptr.down = false;
        ptr.upQueued = false;
      }
      tickFx(frameDt, frameDt);
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

    // ── input (pointer = walk target + swing hold; space = the skill) ─────
    const setPointer = (e: PointerEvent, down: boolean | null): void => {
      const r = cv.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      pointerRef.current.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      pointerRef.current.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      if (down === true) {
        pointerRef.current.down = true;
        pointerRef.current.upQueued = false;
        pointerRef.current.stepped = false;
      } else if (down === false) {
        if (!pointerRef.current.stepped) pointerRef.current.upQueued = true;
        else pointerRef.current.down = false;
      }
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
      pointerRef.current.upQueued = false;
    };
    const onLeave = (): void => {
      pointerRef.current.x = null;
      pointerRef.current.y = null;
    };
    const onKey = (e: KeyboardEvent, v: boolean): void => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === "function" && t.closest("button,a,input,textarea,select")) return;
      if (e.code === "Space" || e.key === " ") {
        spaceRef.current = v;
        if (v) e.preventDefault();
      }
    };
    const kd = (e: KeyboardEvent): void => onKey(e, true);
    const ku = (e: KeyboardEvent): void => onKey(e, false);
    const onBlur = (): void => {
      spaceRef.current = false;
      pointerRef.current.down = false;
    };

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onCancel);
    cv.addEventListener("pointerleave", onLeave);
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
      cv.removeEventListener("pointerleave", onLeave);
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
      data-testid="horde-arena"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 2",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #232a32",
        background: "#07080c",
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="horde-canvas"
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "pointer" }}
      />
    </div>
  );
}
