"use client";
/**
 * GAUNTLET - the page client. Presentation ONLY: the sim rules, this file
 * renders FROM state and never duplicates a rule. Canvas 2D on a fixed
 * 800x600 design space (the tape viewport), fixed-dt accumulator stepping
 * (1/60s quanta, the harness contract), pointer normalized to [0,1] and
 * handed to the sim raw - the sim owns every hit zone, this file adds ZERO
 * client-side hit logic beyond hover highlights.
 *
 * PRESENTATION MEMORY (the riot/ironjaw pattern): the sim publishes monotonic
 * counters (crits/whiffs/dmgDealt/dmgTaken/kills/cardsPlayed) plus per-entity
 * hp/block; this file diffs a snapshot per fixed step into countdown fx -
 * lunges, victim flashes, damage floats, screen shake, the crit hit-stop, and
 * THE d20 (pools + face synthesis live in ./fx.ts, painters in ./draw.ts).
 * Math.random is allowed page-side and nowhere near the sim.
 *
 * ANIMATION LAW: tween + punch only. Attack = 120ms lunge toward the target,
 * hit = white flash composite + scale punch, crit = gold flash + 120ms
 * hit-stop (stepping pauses, rendering continues) + a small shake, block
 * gain = rim pulse. No walk cycles. Composite grade (gradekit) LAST.
 */

import { useEffect, useRef } from "react";
import type { Loadout } from "../_shared/rules/core";
import { GRADES, makeGrade, type Grade } from "../_shared/gradekit";
import { CARD_INDEX, RELICS, bandFor, isBossFloor } from "./content";
import {
  CARD_BAND_Y,
  CARD_SLOTS,
  END_X,
  createGauntlet,
  gauntletScore,
  stepGauntlet,
  type GauntletState,
  type SimInput,
} from "./sim";
import {
  BOSS_SCALE,
  CLASS_ACCENT,
  DESIGN_H,
  DESIGN_W,
  DIE_CRIT,
  DIE_FOE_HIT,
  DIE_FOE_MISS,
  DIE_HIT,
  DIE_MISS,
  DIE_NAT1,
  FLOOR_Y,
  HERO_X,
  PAL,
  art,
  bakeStage,
  choiceGrace,
  draftGrace,
  drawArt,
  drawBanner,
  drawCardBand,
  drawCardFrame,
  drawChoiceHeader,
  drawD20,
  drawDeadOverlay,
  drawDoorPanel,
  drawEndTurn,
  drawEnemyOverlays,
  drawEventPanel,
  drawFog,
  drawHintLine,
  drawHud,
  drawShadow,
  drawTorches,
  enemyX,
  heroGraceUrgency,
  paintEnemy,
  paintHero,
  txt,
  type StageBake,
} from "./draw";
import {
  DEATH_S,
  DIE_FLICK,
  DIE_LIFE,
  HINT_TEXT,
  HIT_STOP_S,
  LUNGE_S,
  faceForCrit,
  faceForHit,
  faceForMiss,
  markHintSeen,
  mkFx,
  mkPrev,
  randInt,
  readHintsSeen,
  snap,
  type ActorFx,
  type Fx,
  type HintKey,
  type Prev,
} from "./fx";

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 8;
const DPR_CAP = 2;

/** Hit-flash tint sprites for painted art: the image's own silhouette filled
 * flat white/gold (source-in keeps alpha), baked once per (art key, color) so
 * the 60fps flash never allocates. Vector heroes keep the paintHero repaint. */
const tintCache: Record<string, HTMLCanvasElement> = {};
function tintedArt(im: HTMLImageElement, key: string, color: string): HTMLCanvasElement {
  const k = `${key}|${color}`;
  let c = tintCache[k];
  if (!c) {
    c = document.createElement("canvas");
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const tg = c.getContext("2d")!;
    tg.drawImage(im, 0, 0);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = color;
    tg.fillRect(0, 0, c.width, c.height);
    tintCache[k] = c;
  }
  return c;
}

export interface GauntletClientProps {
  loadout: Loadout | null;
  seed: string;
  onDone?: (score: number) => void;
}

export default function GauntletClient({ loadout, seed, onDone }: GauntletClientProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GauntletState | null>(null);
  const fxRef = useRef<Fx>(mkFx());
  const prevRef = useRef<Prev>(mkPrev());
  const bakeRef = useRef<StageBake | null>(null);
  const gradeRef = useRef<Grade | null>(null);
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
    gradeRef.current = makeGrade({ ...GRADES.gauntlet, staticGrain: reduced });
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
      stateRef.current = createGauntlet(DESIGN_W, DESIGN_H, p.seed, false, p.loadout);
      fxRef.current = mkFx();
      prevRef.current = mkPrev();
      doneCalledRef.current = false;
    };

    // ── spawn helpers (pool reuse) ────────────────────────────────────────
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
      pick.x = x + (Math.random() - 0.5) * 14;
      pick.y = y;
      pick.text = text;
      pick.color = color;
      pick.big = big;
    };
    const spawnDie = (
      x: number,
      y: number,
      r: number,
      face: number,
      kind: number,
      slot: number,
      delay: number,
      label = "",
      accent = "",
    ): void => {
      const fx = fxRef.current;
      let pick = fx.dice[0];
      for (const d of fx.dice) {
        if (!d.on) {
          pick = d;
          break;
        }
        if (d.t > pick.t) pick = d;
      }
      pick.on = true;
      pick.delay = delay;
      pick.t = 0;
      pick.x = x;
      pick.y = y;
      pick.r = r;
      pick.face = face;
      pick.kind = kind;
      pick.slot = slot;
      pick.armed = kind === DIE_CRIT;
      pick.label = label;
      pick.accent = accent;
    };
    const banner = (text: string, sub: string, color: string): void => {
      const b = fxRef.current.banner;
      b.text = text;
      b.sub = sub;
      b.t = 0.0001;
      b.color = color;
    };

    // ── the delta engine: one call per fixed step, after stepGauntlet ─────
    const applyDeltas = (s: GauntletState): void => {
      const p = prevRef.current;
      const fx = fxRef.current;
      if (!p.inited) {
        snap(p, s);
        return;
      }
      const freshCombat = s.phase === "combat" && p.phase !== "combat";
      if (freshCombat) {
        if (isBossFloor(s.floor) && s.enemies.length > 0) {
          // the boss gate opens: the ladder name IS EnemyState.name
          banner(s.enemies[0].name, `GUARDIAN OF FLOOR ${s.floor + 1}`, PAL.blood);
        } else {
          banner("THE LEGION BARS THE WAY", "", PAL.blood);
        }
        fx.handEnter = 0;
      }
      if (s.phase === "combat" && s.sub === "hero" && s.turn > p.turn && !freshCombat) fx.handEnter = 0;

      // which card was just played (splice point in the previous hand)
      const cardPlayed = s.cardsPlayed > p.cardsPlayed;
      let playedId = "";
      if (cardPlayed) {
        let idx = p.handLen - 1;
        for (let i = 0; i < p.handLen; i++) {
          if (i >= s.hand.length || s.hand[i] !== p.hand[i]) {
            idx = i;
            break;
          }
        }
        playedId = p.hand[Math.max(0, idx)];
      }
      const played = playedId ? CARD_INDEX[playedId] : undefined;

      const n = s.enemies.length;
      // per-enemy diffs: damage flashes, guard pulses, deaths (covers card
      // damage AND burn ticks without caring who moved)
      if (!freshCombat) {
        for (let i = 0; i < n && i < 3; i++) {
          const en = s.enemies[i];
          const ex = enemyX(i, n);
          const hpDrop = p.eHp[i] - en.hp;
          if (hpDrop > 0 && p.eHp[i] > 0) {
            const f = fx.foes[i];
            f.flash = 1;
            f.gold = cardPlayed && s.crits > p.crits ? 1 : 0;
            f.punch = 1;
            spawnFloat(ex, FLOOR_Y - 130, `-${hpDrop}`, PAL.text, false);
            if (en.hp <= 0) {
              f.death = DEATH_S;
              spawnFloat(ex, FLOOR_Y - 158, `+${en.xp}`, PAL.gold, true);
            }
          } else if (p.eHp[i] > 0 && p.eBlock[i] - en.block > 0 && en.block === 0 && hpDrop <= 0 && cardPlayed) {
            spawnFloat(ex, FLOOR_Y - 130, "BLOCKED", PAL.dim, false);
          }
          if (en.block > p.eBlock[i]) fx.foes[i].rim = 0.5; // guard raised
        }
      }

      // hero hp/block deltas
      const hpD = s.hp - p.hp;
      if (hpD > 0) spawnFloat(HERO_X, FLOOR_Y - 130, `+${hpD}`, PAL.green, false);
      else if (hpD < 0) {
        if (cardPlayed && played && played.hpCost > 0) {
          spawnFloat(HERO_X, FLOOR_Y - 130, `${hpD}`, PAL.ember, false); // the rage tax
        } else {
          spawnFloat(HERO_X, FLOOR_Y - 130, `${hpD}`, PAL.blood, false);
        }
      }
      if (s.block > p.block && s.phase === "combat") fx.hero.rim = 0.5;

      // the legion acted (endTurn frame or a busyF expiry mid-line)
      if (s.phase === "combat" && s.sub === "units" && !freshCombat) {
        const acted = p.sub !== "units" ? s.enemyIdx > 0 : s.enemyIdx > p.enemyIdx;
        const ai = Math.min(s.enemyIdx, n) - 1;
        if (acted && ai >= 0 && ai < 3) {
          const en = s.enemies[ai];
          const f = fx.foes[ai];
          const ex = enemyX(ai, n);
          const diedNow = p.eHp[ai] > 0 && en.hp <= 0; // burn took it before it swung
          if (p.eStun[ai] > 0 && en.hp > 0) {
            spawnFloat(ex, FLOOR_Y - 150, "STUNNED", PAL.gold, false);
          } else if (en.block > p.eBlock[ai]) {
            // guard: rim pulse already fired above
          } else if (!diedNow && en.hp > 0) {
            f.lunge = LUNGE_S;
            const hurt = s.hp < p.hp || s.block < p.block;
            const need = s.ac - en.atk;
            spawnDie(
              ex - 58,
              FLOOR_Y - 158,
              21,
              hurt ? faceForHit(need, 20) : faceForMiss(need),
              hurt ? DIE_FOE_HIT : DIE_FOE_MISS,
              -1,
              0.06,
              en.name.toUpperCase(),
            );
            if (hurt) {
              fx.hero.flash = 1;
              fx.hero.gold = 0;
              fx.hero.punch = 1;
              fx.shake = Math.max(fx.shake, 0.5);
              fx.shakeAmp = reduced ? 0 : 4;
              if (s.block < p.block && s.hp >= p.hp) spawnFloat(HERO_X, FLOOR_Y - 148, "BLOCKED", PAL.steel, false);
            }
          }
        }
      }

      // the hero's own rolls: dice from the card just played
      if (cardPlayed && played) {
        fx.handEnter = 1; // hand settled; remaining cards sit still
        let attempts = 0;
        let hasDmg = false;
        for (const eff of played.effects) {
          if (eff.k === "dmg") {
            hasDmg = true;
            attempts += eff.hits * (eff.all ? Math.max(1, p.eAlive) : 1);
          }
        }
        const critsD = s.crits - p.crits;
        const missD = s.whiffs - p.whiffs;
        attempts = Math.min(6, Math.max(attempts, critsD + missD));
        if (hasDmg) {
          // first target from the PRE-play line (single-target law: first alive)
          let tgt = 0;
          for (let i = 0; i < 3; i++)
            if (p.eHp[i] > 0) {
              tgt = i;
              break;
            }
          fx.hero.lunge = LUNGE_S;
          const atkB = s.atk + s.bonusAtk;
          const hitsD = Math.max(0, attempts - critsD - missD);
          let ti = tgt;
          for (let i = 0; i < attempts; i++) {
            // hits first, misses next, crits LAST (the finale reads best)
            const kindIdx = i < hitsD ? 0 : i < hitsD + missD ? 1 : 2;
            // cycle aoe dice across the pre-play living line
            if (i > 0) {
              let next = ti;
              for (let k = 1; k <= 3; k++) {
                const cand = (ti + k) % 3;
                if (p.eHp[cand] > 0 && cand < n) {
                  next = cand;
                  break;
                }
              }
              ti = next;
            }
            const en = ti < n ? s.enemies[ti] : null;
            const need = (en ? en.ac : 12) - atkB;
            let face: number;
            let kind: number;
            if (kindIdx === 2) {
              face = faceForCrit(s.critRange);
              kind = DIE_CRIT;
            } else if (kindIdx === 1) {
              face = faceForMiss(need);
              kind = face === 1 ? DIE_NAT1 : DIE_MISS;
            } else {
              face = faceForHit(need, s.critRange);
              kind = DIE_HIT;
            }
            // hero dice land on the HERO side of the stage, labeled and
            // accented as the player's own (dice ownership pass); the crit
            // victim flash still targets slot ti
            spawnDie(
              HERO_X + 64 + (i % 2) * 40,
              FLOOR_Y - 170 - (i % 3) * 30,
              27,
              face,
              kind,
              ti,
              i * 0.09,
              "YOU",
              CLASS_ACCENT[s.classId],
            );
          }
        }
      }

      // phase beats
      if (s.cower === 1 && p.cower !== 1) banner("HESITATION", "THE LEGION SMELLS FEAR AND OVERRUNS", PAL.blood);
      if (s.phase === "draft" && p.phase === "combat") {
        if (isBossFloor(s.floor) && s.relics.length > p.relicN) {
          // the boss gate pays its guaranteed relic before the draft
          const rl = RELICS.find((r) => r.id === s.relics[s.relics.length - 1]);
          banner("RELIC CLAIMED", (rl?.name ?? "").toUpperCase(), PAL.gold);
        } else {
          banner("VICTORY", "CLAIM A CARD FOR THE DEPTHS", PAL.gold);
        }
      }
      if (s.floorsCleared > p.floorsCleared) banner(`FLOOR ${p.floor + 1} CLEARED`, "+100", PAL.gold);
      if (s.phase === "dead" && p.phase !== "dead") {
        fx.deathT = 0.0001;
        fx.shake = Math.max(fx.shake, 1);
        fx.shakeAmp = reduced ? 0 : 7;
        if (!doneCalledRef.current) {
          doneCalledRef.current = true;
          onDoneRef.current?.(gauntletScore(s));
        }
      }
      snap(p, s);
    };

    // ── fx clocks ─────────────────────────────────────────────────────────
    const decayActor = (a: ActorFx, dt: number): void => {
      if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 5);
      if (a.gold > 0 && a.flash <= 0) a.gold = 0;
      if (a.punch > 0) a.punch *= Math.exp(-dt * 11);
      if (a.lunge > 0) a.lunge = Math.max(0, a.lunge - dt);
      if (a.rim > 0) a.rim = Math.max(0, a.rim - dt * 2.2);
      if (a.death > 0) a.death = Math.max(0, a.death - dt);
    };
    const tickFx = (dt: number, realDt: number): void => {
      const fx = fxRef.current;
      fx.time += realDt;
      decayActor(fx.hero, dt);
      for (const f of fx.foes) decayActor(f, dt);
      if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 2.4);
      if (fx.banner.t > 0 && fx.banner.t < 99) fx.banner.t += dt;
      if (fx.deathT > 0) fx.deathT += realDt;
      if (fx.handEnter < 1) fx.handEnter = Math.min(1, fx.handEnter + dt);
      for (const f of fx.floats) {
        if (!f.on) continue;
        f.t += dt;
        f.y -= dt * 42;
        if (f.t > 1.1) f.on = false;
      }
      // dice run on REAL time so they keep flickering through the hit-stop
      for (const d of fx.dice) {
        if (!d.on) continue;
        if (d.delay > 0) {
          d.delay -= realDt;
          continue;
        }
        const was = d.t;
        d.t += realDt;
        if (d.armed && was < DIE_FLICK && d.t >= DIE_FLICK) {
          d.armed = false;
          fx.hitStop = HIT_STOP_S; // the crit lands: freeze the world
          fx.shake = Math.max(fx.shake, 0.8);
          fx.shakeAmp = reduced ? 0 : 6;
          if (d.slot >= 0 && d.slot < 3) {
            fx.foes[d.slot].flash = 1;
            fx.foes[d.slot].gold = 1;
            fx.foes[d.slot].punch = 1;
          }
        }
        if (d.t > DIE_LIFE) d.on = false;
      }
    };

    // ── the painted frame ─────────────────────────────────────────────────
    const render = (): void => {
      const g = cv.getContext("2d");
      const s = stateRef.current;
      if (!g || !s) return;
      const fx = fxRef.current;
      const ptr = pointerRef.current;
      let shx = 0;
      let shy = 0;
      if (fx.shake > 0 && fx.shakeAmp > 0) {
        shx = (Math.random() - 0.5) * 2 * fx.shakeAmp * fx.shake;
        shy = (Math.random() - 0.5) * 2 * fx.shakeAmp * fx.shake;
      }
      // hover zones (display only; the sim owns the real zones)
      let hoverSlot = -1;
      let hoverThird = -1;
      let hoverEnd = false;
      if (ptr.x != null && ptr.y != null) {
        if (ptr.y > CARD_BAND_Y) hoverSlot = Math.min(CARD_SLOTS - 1, Math.floor(ptr.x * CARD_SLOTS));
        else {
          hoverThird = Math.min(2, Math.floor(ptr.x * 3));
          hoverEnd = ptr.x >= END_X;
        }
      }

      g.fillStyle = PAL.ink;
      g.fillRect(0, 0, DESIGN_W, DESIGN_H);

      // stage: far / mid / floor (parallax under shake), rebaked per band
      const band = bandFor(s.floor);
      if (!bakeRef.current || bakeRef.current.band !== band) bakeRef.current = bakeStage(band);
      const bake = bakeRef.current;
      const farIm = art("bg-far");
      if (farIm) g.drawImage(farIm, shx * 0.3, shy * 0.3, DESIGN_W, DESIGN_H);
      else g.drawImage(bake.far, shx * 0.3, shy * 0.3);
      drawTorches(g, bake, fx.time, shx * 0.3, shy * 0.3);
      const midIm = art("bg-mid");
      if (midIm) g.drawImage(midIm, shx * 0.6, shy * 0.6, DESIGN_W, DESIGN_H);
      else g.drawImage(bake.mid, shx * 0.6, shy * 0.6);
      drawFog(g, fx.time);
      g.drawImage(bake.floor, shx, shy);

      // hero (combat/event/dead; node + draft phases belong to the panels,
      // which span the same thirds the hero would stand in)
      if (s.phase === "combat" || s.phase === "event" || s.phase === "dead") {
        const hf = fx.hero;
        const lunge = hf.lunge > 0 ? Math.sin((1 - hf.lunge / LUNGE_S) * Math.PI) * 46 : 0;
        const hx = HERO_X + lunge + shx;
        const hy = FLOOR_Y + shy;
        drawShadow(g, hx, hy, 30);
        g.save();
        g.translate(hx, hy);
        if (hf.punch > 0.02) g.scale(1 + hf.punch * 0.1, 1 - hf.punch * 0.07);
        const im = art(`hero-${s.classId}`);
        if (im) drawArt(g, im, 0, 0, 132);
        else paintHero(g, s.classId, fx.time, null);
        if (hf.flash > 0.02) {
          g.globalAlpha = Math.min(1, hf.flash);
          const col = hf.gold > 0 ? PAL.goldHi : "#ffffff";
          if (im) {
            // tinted copy of the SAME art, drawArt's anchor math (feet at origin, h=132)
            const tc = tintedArt(im, `hero-${s.classId}`, col);
            const w = tc.width * (132 / tc.height);
            g.drawImage(tc, Math.round(-w / 2), -132, Math.round(w), 132);
          } else {
            paintHero(g, s.classId, fx.time, col);
          }
          g.globalAlpha = 1;
        }
        if (hf.rim > 0.02) {
          g.strokeStyle = PAL.steel;
          g.globalAlpha = hf.rim;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(0, -58, 54, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
        }
        g.restore();
      }

      // the legion (a boss gate keeper paints at BOSS_SCALE with a name plate)
      if (s.phase === "combat" || fx.foes.some((f) => f.death > 0)) {
        const bossNow = isBossFloor(s.floor);
        const n = s.enemies.length;
        for (let i = 0; i < n && i < 3; i++) {
          const en = s.enemies[i];
          const f = fx.foes[i];
          const dying = f.death > 0;
          if (en.hp <= 0 && !dying) continue;
          const lunge = f.lunge > 0 ? Math.sin((1 - f.lunge / LUNGE_S) * Math.PI) * 40 : 0;
          const ex = enemyX(i, n) - lunge + shx;
          const ey = FLOOR_Y + shy;
          g.save();
          if (dying) {
            g.globalAlpha = f.death / DEATH_S;
            g.translate(ex, ey + (1 - f.death / DEATH_S) * 16);
          } else {
            g.translate(ex, ey);
          }
          if (bossNow) g.scale(BOSS_SCALE, BOSS_SCALE);
          drawShadow(g, 0, 0, 30);
          if (f.punch > 0.02) g.scale(1 + f.punch * 0.12, 1 - f.punch * 0.08);
          const im = art(`enemy-${en.key}`);
          if (im) drawArt(g, im, 0, 0, 128);
          else paintEnemy(g, en.key, fx.time + i * 1.7, null);
          if (f.flash > 0.02) {
            g.globalAlpha = Math.min(1, f.flash) * (dying ? f.death / DEATH_S : 1);
            paintEnemy(g, en.key, fx.time + i * 1.7, f.gold > 0 ? PAL.goldHi : "#ffffff");
          }
          if (f.rim > 0.02 && !dying) {
            g.strokeStyle = PAL.teal;
            g.globalAlpha = f.rim;
            g.lineWidth = 3;
            g.beginPath();
            g.arc(0, -56, 52, 0, Math.PI * 2);
            g.stroke();
          }
          g.restore();
          if (en.hp > 0 && s.phase === "combat")
            drawEnemyOverlays(g, en, enemyX(i, n) + shx, ey, fx.time + i, bossNow);
        }
      }

      // phase furniture in the fixed thirds (the sim's zones; we only dress them)
      if (s.phase === "node") {
        drawChoiceHeader(g, "CHOOSE YOUR PATH", `FLOOR ${s.floor + 1}`, choiceGrace(s));
        for (let i = 0; i < 3; i++) drawDoorPanel(g, i, s.nodeOpts[i], hoverThird === i && s.nodeOpts[i] !== "" ? 1 : 0);
      } else if (s.phase === "draft") {
        drawChoiceHeader(g, "CLAIM A CARD", "SPACE TO SKIP", draftGrace(s));
        for (let i = 0; i < 3; i++) {
          const card = CARD_INDEX[s.draftOpts[i]];
          if (!card) continue;
          const cx = Math.round(((i + 0.5) / 3) * DESIGN_W);
          drawCardFrame(g, cx - 84, 168, 168, 200, card, {
            lit: true,
            hover: hoverThird === i,
            enter: 1,
            alpha: 1,
          });
        }
      } else if (s.phase === "event") {
        drawEventPanel(g, s.lastEvent, fx.time);
      }

      // dice + floats
      for (const d of fx.dice) {
        if (!d.on || d.delay > 0) continue;
        const settle01 = Math.min(1, d.t / DIE_FLICK);
        const face = settle01 >= 1 ? d.face : randInt(1, 20);
        const alpha = Math.min(1, (DIE_LIFE - d.t) / 0.25);
        const pop = settle01 >= 1 ? Math.exp(-(d.t - DIE_FLICK) * 6) : 0;
        drawD20(
          g,
          d.x + shx,
          d.y + shy,
          d.r,
          face,
          d.kind,
          settle01,
          Math.max(0, alpha),
          pop,
          d.label ? { accent: d.accent || undefined, label: d.label } : undefined,
        );
      }
      for (const f of fx.floats) {
        if (!f.on) continue;
        const a = Math.min(1, (1.1 - f.t) / 0.3);
        g.globalAlpha = Math.max(0, a);
        g.font = `800 ${f.big ? 22 : 16}px "Arial Narrow","Roboto Condensed","Segoe UI",system-ui,sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.strokeStyle = "#05060a";
        g.lineWidth = 3;
        g.strokeText(f.text, Math.round(f.x + shx), Math.round(f.y + shy));
        g.fillStyle = f.color;
        g.fillText(f.text, Math.round(f.x + shx), Math.round(f.y + shy));
        g.globalAlpha = 1;
      }

      // chiaroscuro frame over the stage, then chrome
      g.drawImage(bake.fg, shx * 1.15, shy * 1.15);
      drawCardBand(g, s, s.phase === "combat" && s.sub === "hero" && s.busyF === 0 ? hoverSlot : -1, fx.handEnter, s.phase === "combat" && s.sub === "hero");
      if (s.phase === "combat")
        drawEndTurn(g, s.sub === "hero" && s.busyF === 0, hoverEnd, heroGraceUrgency(s), fx.time);
      drawHud(g, s, fx.time);
      // first-run hints: one dim line per lesson, once ever per browser
      // (localStorage-gated in fx.ts; latched for the whole phase it opened in)
      {
        const seen = readHintsSeen();
        let want: HintKey | null = null;
        if (s.phase === "node") {
          const bossDoor = s.nodeOpts[0] === "boss" || s.nodeOpts[1] === "boss" || s.nodeOpts[2] === "boss";
          if (bossDoor && !seen.boss) want = "boss";
          else if (!bossDoor && !seen.node) want = "node";
        } else if (s.phase === "draft" && !seen.draft) {
          want = "draft";
        } else if (s.phase === "event" && s.lastEvent !== "" && s.lastEvent !== "rest" && !seen.shrine) {
          want = "shrine";
        }
        const latchOk =
          fx.hintKey === "node" || fx.hintKey === "boss"
            ? s.phase === "node"
            : fx.hintKey === "draft"
              ? s.phase === "draft"
              : fx.hintKey === "shrine"
                ? s.phase === "event"
                : false;
        if (fx.hintKey && !latchOk) fx.hintKey = "";
        if (!fx.hintKey && want) {
          fx.hintKey = want;
          fx.hintText = HINT_TEXT[want];
          markHintSeen(want);
        }
        if (fx.hintKey) drawHintLine(g, fx.hintText);
      }
      if (fx.banner.t > 0 && fx.banner.t < 99) drawBanner(g, fx.banner.text, fx.banner.sub, fx.banner.t, fx.banner.color);
      if (s.phase === "dead") drawDeadOverlay(g, gauntletScore(s), s.floorsCleared, s.kills, fx.deathT);

      // seed hint (dev free-play nicety, tucked under the band)
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
          // swallow the restart tap so it cannot click through into the
          // fresh run's node choice on its first stepped frame
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
        // crit hit-stop: stepping pauses, rendering continues, time is not owed
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
        stepGauntlet(s, FIXED_DT, simInput);
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
      // fx run on real time regardless of how many fixed steps this painted
      // frame consumed (only the crit hit-stop path freezes them)
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

    // ── input ─────────────────────────────────────────────────────────────
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
      data-testid="gauntlet-arena"
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
        data-testid="gauntlet-canvas"
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "pointer" }}
      />
    </div>
  );
}
