"use client";
/**
 * HORDE - the SEASON SHELL client (HordeShell on RunShell<HordeState>). The
 * real /s7/games/horde page: nonce runs, the shared-seed daily, guest parking,
 * banking and the result screen all come from RunShell; this file only adapts
 * the horde sim + painters into the shell's contract.
 *
 * DIVISION OF LABOR vs Client.tsx (the /dev/s7h free-play client, which
 * keeps working unchanged):
 *  - sim.ts owns every rule; draw.ts owns every painter; fx.ts owns the
 *    presentation-memory pools. All three are REUSED here as-is.
 *  - The glue that Client.tsx keeps inside its component closure (the spawn
 *    helpers, the per-step delta engine, the fx clocks, the frame composite)
 *    is carried here at module scope, because Client.tsx exports none of it
 *    and editing it is out of scope for this wiring. Same code shape, same
 *    order of draws, grade LAST.
 *  - Per-run page state (fx pools, prev snapshot, room bake, item births,
 *    the grade) is reset inside createSim, per the RunShell contract; the
 *    audio deltas live in onFrame (the "season shell wires audio here" hook
 *    Client.tsx left open).
 *
 * INPUT MAPPING: RunShell hands the pointer in SIM px (worldSize pins the
 * world to the authored 960x640 room, pointerTransform stays identity); the
 * sim wants px/py normalized to [0,1]. step divides by ROOM_W/ROOM_H, passes
 * `down` (hold = swing) and `space` (edge = skill, edge-detected in-sim)
 * through, and ignores the shell's arrow keys - horde is pointer-walked, and
 * the keyboardHint string below says so.
 *
 * HIT-STOP under a fixed-step shell: RunShell owns the accumulator, so the
 * big-moment freeze is implemented by consuming fixed quanta in `step`
 * (decrement fx.hitStop, skip stepHorde) - stepping pauses, rendering
 * continues, exactly the free-play feel. Countdown fx advance by SIM-stepped
 * time (paused during the freeze); fx.time advances by real time so torches
 * keep flickering.
 *
 * DEATH: hordeDone flips the shell to its result overlay on the same frame,
 * so Client.tsx's dead overlay + restart edges are deliberately not ported.
 */

import {
  RunShell,
  type RunLoadout,
  type ShellView,
} from "../_shared/RunShell";
import { useEffect } from "react";
import type { Sfx } from "../_shared/sfx";
import { CLASS_IDS, type ClassId, type Loadout } from "../_shared/rules/core";
import { GRADES, makeGrade, type Grade } from "../_shared/gradekit";
import { CHUNKS, KITS, SPELL_TIER_MAX } from "./content";
import {
  FINE,
  ROOM_H,
  ROOM_W,
  createHorde,
  hordeDone,
  hordeScore,
  hordeSimSecs,
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

/** Wizard cast-range clamp mirrored for the blast fx marker only (px; the
 * sim owns the real clamp - this is where the fx ring lands, nothing more). */
const BLAST_RANGE_PX = 340;

// ── per-run page state (module scope, reset in createSim - the RunShell law;
// one shell instance runs at a time, the riot audioPrev idiom) ──────────────
let fx: Fx = mkFx();
let prev: Prev = mkPrev();
let bake: RoomBake | null = null;
let grade: Grade | null = null;
let itemBirth = new WeakMap<FloorItem, number>();
let reducedRun = false;
/** Sim-stepped seconds since the last painted frame (drives countdown fx;
 * stays 0 through a hit-stop so the freeze reads like free-play). */
let steppedDt = 0;
let lastDrawMs = 0;
/** The live pointer in SIM px, or -1: the wizard blast fx falls back exactly
 * like the sim does when the pointer is off the glass. */
const lastPtr = { x: -1, y: -1 };
/** Reused every step - the sim reads it synchronously, never stores it. */
const simInput: SimInput = { px: null, py: null, down: false, space: false };

/** CLASS_IDS validation: a server loadout with an unknown class plays the
 * stock hero (createHorde's own default) instead of crashing derive(). */
function toSimLoadout(lo: RunLoadout | null): Loadout | null {
  if (!lo || !(CLASS_IDS as readonly string[]).includes(lo.classId)) return null;
  return {
    classId: lo.classId as ClassId,
    level: lo.level,
    gear: { weapon: lo.gear.weapon, armor: lo.gear.armor, trinket: lo.gear.trinket },
  };
}

// ── audio deltas (onFrame; monotonic sim counters, the riot pattern) ────────
const audioPrev = {
  swings: 0,
  casts: 0,
  dmgDealt: 0,
  dmgTaken: 0,
  potsUsed: 0,
  rooms: 0,
  depth: 0,
  wpn: 0,
  spl: 0,
  dead: false,
};
function resetAudioPrev(): void {
  audioPrev.swings = 0;
  audioPrev.casts = 0;
  audioPrev.dmgDealt = 0;
  audioPrev.dmgTaken = 0;
  audioPrev.potsUsed = 0;
  audioPrev.rooms = 0;
  audioPrev.depth = 0;
  audioPrev.wpn = 0;
  audioPrev.spl = 0;
  audioPrev.dead = false;
}
function hordeAudio(s: HordeState, sfx: Sfx): void {
  const p = audioPrev;
  if (s.swings > p.swings) sfx.play("tap"); // swing whoosh
  if (s.dmgDealt > p.dmgDealt) sfx.play("hit"); // something got cut
  if (s.casts > p.casts) sfx.play("bombhit"); // the class skill lands heavy
  if (s.dmgTaken > p.dmgTaken) {
    sfx.play("hurt");
    sfx.buzz(24);
  }
  if (s.potsUsed > p.potsUsed) sfx.play("pickup");
  if (s.weaponTier > p.wpn || s.spellTier > p.spl) sfx.play("powerup");
  if (s.roomsCleared > p.rooms) sfx.play("score"); // exit open
  if (s.depth > p.depth) sfx.play("boss"); // the next room growls
  if (s.phase === "dead" && !p.dead) {
    sfx.play("ko");
    sfx.buzz([30, 40, 60]);
  }
  p.swings = s.swings;
  p.casts = s.casts;
  p.dmgDealt = s.dmgDealt;
  p.dmgTaken = s.dmgTaken;
  p.potsUsed = s.potsUsed;
  p.rooms = s.roomsCleared;
  p.depth = s.depth;
  p.wpn = s.weaponTier;
  p.spl = s.spellTier;
  p.dead = s.phase === "dead";
}

// ── spawn helpers (pool reuse; free-or-oldest, never allocate) ──────────────
function spawnSpark(
  x: number,
  y: number,
  vx: number,
  vy: number,
  size: number,
  color: string,
  add: boolean,
  life: number,
): void {
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
}
function spawnRing(
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
): void {
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
}
function spawnBolt(x0: number, y0: number, x1: number, y1: number, width: number, color: string, life: number): void {
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
}
function spawnGhost(x: number, y: number, flip: boolean, life: number, cls: ClassId): void {
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
  pick.cls = cls;
}
function spawnFloat(x: number, y: number, text: string, color: string, big: boolean): void {
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
}
function spawnDeath(x: number, y: number, key: string, flip: boolean, elite: boolean): void {
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
}
function banner(text: string, sub: string, color: string): void {
  const b = fx.banner;
  b.text = text;
  b.sub = sub;
  b.t = 0.0001;
  b.color = color;
}

/** Claim/find the hit-memory slot for a live enemy id. */
function eFxIdx(id: string): number {
  const arr = fx.eFx;
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
}

// ── the skill shapes (per-kit, class accent, all additive-pooled) ───────────
function spawnSkillFx(s: HordeState, prevX: number, prevY: number): void {
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
      spawnGhost(x0 + (hx - x0) * f, y0 + (hy - y0) * f, fx.heroFlip, 0.3, s.classId);
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
    let bx = lastPtr.x >= 0 ? lastPtr.x : hx + Math.cos(ang) * (BLAST_RANGE_PX / 2);
    let by = lastPtr.x >= 0 ? lastPtr.y : hy + Math.sin(ang) * (BLAST_RANGE_PX / 2);
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
}

// ── the delta engine: one call per fixed step, after stepHorde ──────────────
function applyDeltas(s: HordeState): void {
  const p = prev;
  const birth = itemBirth;
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

  // hero pain: flash + shake (the sim already resolved the damage)
  if (s.dmgTaken > p.dmgTaken) {
    fx.heroFlash = 1;
    fx.heroPunch = 1;
    fx.shake = Math.max(fx.shake, 0.6);
    fx.shakeAmp = reducedRun ? 0 : 5;
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
    // per-enemy hit memory: hp drop = white flash + scale punch (the last
    // struck position also anchors the crit flash below)
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
      fx.shakeAmp = reducedRun ? 0 : Math.max(fx.shakeAmp, eliteFell ? 4 : 3);
    } else if (s.crits > p.crits) {
      fx.shake = Math.max(fx.shake, 0.25);
      fx.shakeAmp = reducedRun ? 0 : Math.max(fx.shakeAmp, 2);
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
        if (!reducedRun) spawnRing(RK_RING, cx, cy - 14, 6, 30, 4, PAL.gold, 0.3);
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
  }

  if (s.phase === "dead" && p.phase !== "dead") {
    // the shell's result overlay takes over next frame; this shake is the
    // last painted beat of the run
    fx.deathT = 0.0001;
    fx.shake = Math.max(fx.shake, 1);
    fx.shakeAmp = reducedRun ? 0 : 7;
  }
  snap(p, s);
}

// ── fx clocks (dt = sim-stepped, realDt = wall clock) ───────────────────────
function tickFx(dt: number, realDt: number): void {
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
}

// ── actor painters (from state + fx memory only) ────────────────────────────
function paintEnemyAt(g: CanvasRenderingContext2D, s: HordeState, enIdx: number): void {
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
}

function paintHeroAt(g: CanvasRenderingContext2D, s: HordeState): void {
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
}

// ── the painted frame (RunShell draw: once per rAF, after 0+ fixed steps) ───
function drawFrame(g: CanvasRenderingContext2D, s: HordeState, view: ShellView): void {
  // clocks first: countdown fx run on sim-stepped time (a hit-stop freezes
  // them with the sim), fx.time on real time (torches keep breathing)
  const nowMs = performance.now();
  const rdt = lastDrawMs > 0 ? Math.min(0.1, Math.max(0, (nowMs - lastDrawMs) / 1000)) : 1 / 60;
  lastDrawMs = nowMs;
  tickFx(steppedDt, rdt);
  steppedDt = 0;

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
  if (!bake || bake.chunkIdx !== s.chunkIdx) bake = bakeRoom(s.chunkIdx, chunk);

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
    drawBeam(g, it.kind, ix, iy, fx.time, itemBirth.get(it) ?? fx.time);
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

  // the walk target under the held pointer (display only; view.pointer is
  // already in sim px, clamped here the same way the sim clamps its input)
  const ptr = view.pointer;
  if (ptr && ptr.down && s.phase === "run") {
    const mx = Math.max(0, Math.min(DESIGN_W, ptr.x));
    const my = Math.max(0, Math.min(DESIGN_H, ptr.y));
    drawTargetMarker(g, mx, my, fx.time, CLASS_ACCENT[s.classId]);
  }

  g.restore();
  // ── end world space ──

  // HUD chrome, unshaken (the shell's own overlay handles the dead screen)
  drawHud(g, s, fx.time, fx.orbHp, fx.orbMp);
  if (s.exitOpen === 1 && s.phase === "run") drawExitArrow(g, chunk, fx.time);
  if (fx.banner.t > 0 && fx.banner.t < 99) drawBanner(g, fx.banner.text, fx.banner.sub, fx.banner.t, fx.banner.color);

  // THE GRADE, LAST (the beauty-panel law)
  grade?.applyWorld(g, DESIGN_W, DESIGN_H);
}

// ── the shell ───────────────────────────────────────────────────────────────

/** KEYBOARD SWING (WASD wave, 2026-08-30). RunShell already tracks WASD and
 * the arrows into ShellInput.left/right/up/downKey; horde synthesizes a walk
 * target from them in step(). The mouse button is "hold to swing", so pure
 * keyboard play needs one held key for the same verb: J. Module-level like
 * the rest of the page state (one horde page mounts at a time); the step
 * closure reads it without re-renders. Tape-safe by construction: keys only
 * shape the same {px,py,down,space} SimInput the pointer does. */
let swingKeyHeld = false;

export default function HordeShell() {
  useEffect(() => {
    const set = (e: KeyboardEvent, v: boolean) => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === "function" && t.closest("button,a,input,textarea,select")) return;
      if (e.code === "KeyJ" || e.key === "j" || e.key === "J") swingKeyHeld = v;
    };
    const kd = (e: KeyboardEvent) => set(e, true);
    const ku = (e: KeyboardEvent) => set(e, false);
    const clear = () => {
      swingKeyHeld = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", clear);
      swingKeyHeld = false;
    };
  }, []);
  return (
    <RunShell<HordeState>
      game="horde"
      title="Hordebreaker"
      accent="#e07030"
      // PIN THE ROOM (the riot framing lesson): the sim is always 960x640 and
      // the camera IS the room; aspect and worldSize must agree.
      aspect={ROOM_W / ROOM_H}
      worldSize={() => ({ w: ROOM_W, h: ROOM_H })}
      createSim={(w, h, seed, reduced, stats, loadout) => {
        void stats; // horde fields the CLASS loadout, not the tank stats
        // per-run page state reset, per the RunShell contract
        fx = mkFx();
        prev = mkPrev();
        bake = null;
        itemBirth = new WeakMap();
        reducedRun = reduced;
        steppedDt = 0;
        lastDrawMs = 0;
        lastPtr.x = -1;
        lastPtr.y = -1;
        resetAudioPrev();
        grade?.dispose();
        grade = makeGrade({ ...GRADES.horde, staticGrain: reduced });
        return createHorde(w, h, seed, false, toSimLoadout(loadout));
      }}
      step={(s, dt, input) => {
        // the big-moment freeze consumes fixed quanta: stepping pauses,
        // rendering continues (the free-play hit-stop, shell edition)
        if (fx.hitStop > 0) {
          fx.hitStop = Math.max(0, fx.hitStop - dt);
          return;
        }
        // ShellInput -> SimInput: pointer arrives in sim px (worldSize is
        // pinned, pointerTransform is identity); the sim wants [0,1]
        lastPtr.x = input.px == null ? -1 : input.px;
        lastPtr.y = input.py == null ? -1 : input.py;
        simInput.px = input.px == null ? null : input.px / ROOM_W;
        simInput.py = input.py == null ? null : input.py / ROOM_H;
        // WASD/arrows (2026-08-30): while a direction key is held it wins over
        // the mouse, synthesizing a walk target 200px from the hero in the
        // pressed direction - the exact contract the pointer has, so the sim
        // and the frozen tapes never learn a new verb. Hero x/y are FINE ints
        // (8 per px); releasing all keys hands the pointer straight back.
        {
          const kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          const ky = (input.downKey ? 1 : 0) - (input.up ? 1 : 0);
          if (kx !== 0 || ky !== 0) {
            const inv = kx !== 0 && ky !== 0 ? 0.7071 : 1;
            const hx = s.x / (ROOM_W * 8);
            const hy = s.y / (ROOM_H * 8);
            simInput.px = Math.max(0.01, Math.min(0.99, hx + (kx * inv * 200) / ROOM_W));
            simInput.py = Math.max(0.01, Math.min(0.99, hy + (ky * inv * 200) / ROOM_H));
          }
        }
        simInput.down = input.down || swingKeyHeld;
        simInput.space = input.space;
        stepHorde(s, dt, simInput);
        applyDeltas(s);
        steppedDt += dt;
      }}
      draw={drawFrame}
      done={hordeDone}
      score={hordeScore}
      onFrame={hordeAudio}
      sfxPack={["tap", "hit", "hurt", "pickup", "powerup", "bombhit", "score", "boss", "ko"]}
      resultHeadline={(s) => `TAKEN AT DEPTH ${s.depth + 1}`}
      resultSub={(s) =>
        `${s.kills} undead down · ${s.roomsCleared} ${s.roomsCleared === 1 ? "room" : "rooms"} cleared · ${Math.round(hordeSimSecs(s))}s`
      }
      shareBuild={(s, dayKey) => {
        // row 1: a purple block per room cleared; row 2: a skull per 25 kills
        const rooms = "\u{1F7EA}".repeat(Math.min(10, s.roomsCleared)) || "⬛";
        const skulls = "\u{1F480}".repeat(Math.max(1, Math.min(10, 1 + Math.floor(s.kills / 25))));
        const grid = `${rooms}\n${skulls}`;
        return {
          grid,
          payload: `HORDEBREAKER ${dayKey} · ${hordeScore(s)} pts · depth ${s.depth + 1}\n${grid}\nlaunchwars.xyz/s7/games/horde`,
        };
      }}
      intro={
        <div>
          <p style={{ margin: "0 0 8px" }}>
            The undead legion holds the crypt. Walk with your pointer, and hold to swing at anything in reach.
          </p>
          <p style={{ margin: 0, opacity: 0.85 }}>
            Press SPACE for your class skill. It costs mana, so pick your moment. Clear every wave and the exit opens:
            walk through it to go deeper, where the legion is stronger and pays more. Potions and upgrades drop on the
            floor. Walk over them to grab them. Your belt drinks a potion by itself when you run low. Death is the only
            end, and how deep you get is your score.
          </p>
        </div>
      }
      strings={{
        startIdle: "Enter the dungeon",
        startAgain: "Fight again",
        dailyResultNote: "The daily run · the same dungeon for everyone today",
        keyboardHint: "Mouse or touch: point to walk, hold to swing. Keyboard: WASD or arrows walk, hold J to swing. Space fires your class skill.",
      }}
    />
  );
}
