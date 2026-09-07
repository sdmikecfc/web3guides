"use client";
/**
 * CRYPT SHELL - the season wiring. CryptShell mounts the crypt sim on the
 * franchise RunShell (nonce handshake, shared-seed daily, floor, banking,
 * share grid); the free-play dev client (./Client.tsx, /dev/s7c) stays
 * untouched and keeps its own loop.
 *
 * PRESENTATION REUSE, NOT REIMPLEMENTATION: the corridor renderer, fog
 * ladder, billboards and crossfade-step offscreens all come from ./draw and
 * ./fx exactly as the dev client uses them. This file owns only the RunShell
 * adaptation:
 *
 *  - createSim VALIDATES the server RunLoadout (unknown classId -> stock
 *    hero, level/gear clamped) and RESETS the per-run page state: fx pools,
 *    prev snapshot, the offscreen scene/prev canvases, the grade, the
 *    keyboard synth phase. PlayerStats are ignored - S7 sims read the class
 *    loadout (ADR-0129), not the tank stats.
 *  - step ADAPTS ShellInput to the sim's normalized zones. pointerTransform
 *    normalizes the shell's sim-px pointer to [0,1], so the sim sees the
 *    exact tape-contract coordinates. RunShell's keyboard (left/right/up/
 *    downKey) SYNTHESIZES zone taps the way Client.tsx does - same KEY_PX/
 *    KEY_PY numbers, parity edges every other fixed step - so keyboard flows
 *    through the same sim zones and no parallel input path exists. One
 *    divergence, stated: RunShell exposes held BOOLEANS with no press order,
 *    so two held keys resolve by fixed priority (fwd > back > turnL > turnR)
 *    instead of Client.tsx's last-pressed stack. Space passes through as the
 *    attack verb (the sim edge-detects it).
 *  - The crit hit-stop pauses SIM stepping inside step() (page-side fx keep
 *    ticking), mirroring the dev client's loop; the run floor is wall-clock
 *    server-side, so a paused step only ever makes the envelope looser.
 *  - draw is the dev client's composite minus the client-owned chrome
 *    (restart edge, minimap, dead overlay, seed hint - RunShell owns the
 *    result screen). Grade composites LAST (the beauty-panel law).
 *  - done/score = cryptDone/cryptScore; fx clocks tick per fixed step
 *    (identical at 60Hz; at higher refresh the fx advance in 60Hz quanta,
 *    which the crossfades and floats absorb invisibly).
 */

import { RunShell, type RunLoadout, type ShellInput, type ShellView } from "../_shared/RunShell";
import { CLASS_IDS, type Loadout } from "../_shared/rules/core";
import { GRADES, makeGrade, type Grade } from "../_shared/gradekit";
import {
  DIR_DX,
  DIR_DY,
  DP_ENTER,
  DP_NEXT,
  FLOOR_BONUS,
  FWD_SPLIT_Y,
  TURN_L_X,
  TURN_R_X,
  createCrypt,
  cryptDone,
  cryptScore,
  cryptSimSecs,
  facedEnemy,
  stepCrypt,
  type CryptState,
  type EnemyState,
  type SimInput,
} from "./sim";
import {
  CLASS_ACCENT,
  DESIGN_H,
  DESIGN_W,
  DIE_CRIT,
  DIE_FOE_HIT,
  DIE_FOE_MISS,
  DIE_HIT,
  DIE_MISS,
  DIE_NAT1,
  PAL,
  drawBanner,
  drawBone,
  drawCollapse,
  drawD20,
  drawDuelHud,
  drawDuelZoneHints,
  drawGuardFlash,
  drawHud,
  drawSlash,
  drawTargetBrackets,
  drawZoneHints,
  hurtPlate,
  mkProj,
  preloadArt,
  projectCell,
  renderScene,
  torchPlate,
  type ProjOut,
} from "./draw";
import {
  BONE_S,
  COLLAPSE_S,
  DESCEND_FADE_S,
  DIE_FLICK,
  DIE_LIFE,
  HIT_STOP_S,
  SLASH_CRIT,
  SLASH_HIT,
  SLASH_S,
  SLASH_WHIFF,
  STEP_FADE_S,
  TR_BACK,
  TR_DESCEND,
  TR_FWD,
  TR_NONE,
  TR_TURN_L,
  TR_TURN_R,
  clearEnemyFx,
  enemyFxFor,
  faceForCrit,
  faceForHit,
  faceForMiss,
  mkFx,
  mkLcg,
  mkPrev,
  type Fx,
  type Prev,
} from "./fx";

// keyboard verb -> the sim zone it taps (IDENTICAL numbers to Client.tsx:
// fwd, back, turnL, turnR - the tape-contract coordinates)
const KEY_PX = [0.5, 0.5, 0.1, 0.9] as const;
const KEY_PY = [0.25, 0.85, 0.5, 0.5] as const;

// ── per-run page state (module singleton: one crypt page mounts at a time,
// the same precedent as RunShell's own module-level sceneChain) ─────────────

interface RenderState {
  reduced: boolean;
  fx: Fx;
  prev: Prev;
  grade: Grade | null;
  sceneCv: HTMLCanvasElement;
  sceneG: CanvasRenderingContext2D;
  prevCv: HTMLCanvasElement;
  prevG: CanvasRenderingContext2D;
  lastVisEnemies: number;
  // page-fx stream for the torch flicker (never sim RNG)
  flick: () => number;
  flickNoise: number;
  flickT: number;
  synthPhase: boolean; // keyboard tap parity (edge every other step)
  pj: ProjOut; // projection scratch for fx spawns + the crosshair
  fxP: { x: number; y: number; sc: number };
  simInput: SimInput; // reused every step, never allocated in the loop
  lastPtrX: number | null;
  lastPtrY: number | null;
  pointerMovedAt: number;
}

let R: RenderState | null = null;
// the offscreen pair survives across runs (cleared per run, never re-created)
let sceneCv: HTMLCanvasElement | null = null;
let prevCv: HTMLCanvasElement | null = null;

/** Per-run reset: fresh fx pools + prev snapshot, cleared offscreens, a new
 * grade (the old one disposed), reset flicker/synth clocks. Called from
 * createSim inside the Start tap, so `document` always exists here. */
function resetRender(reduced: boolean): void {
  if (!sceneCv) {
    sceneCv = document.createElement("canvas");
    sceneCv.width = DESIGN_W;
    sceneCv.height = DESIGN_H;
  }
  if (!prevCv) {
    prevCv = document.createElement("canvas");
    prevCv.width = DESIGN_W;
    prevCv.height = DESIGN_H;
  }
  const sceneG = sceneCv.getContext("2d")!;
  const prevG = prevCv.getContext("2d")!;
  sceneG.setTransform(1, 0, 0, 1, 0, 0);
  sceneG.clearRect(0, 0, DESIGN_W, DESIGN_H);
  prevG.setTransform(1, 0, 0, 1, 0, 0);
  prevG.clearRect(0, 0, DESIGN_W, DESIGN_H);
  R?.grade?.dispose();
  R = {
    reduced,
    fx: mkFx(),
    prev: mkPrev(),
    grade: makeGrade({ ...GRADES.crypt, staticGrain: reduced }),
    sceneCv,
    sceneG,
    prevCv,
    prevG,
    lastVisEnemies: 1, // force the first paint
    flick: mkLcg(0x70c41e55),
    flickNoise: 0.5,
    flickT: 0,
    synthPhase: false,
    pj: mkProj(),
    fxP: { x: 0, y: 0, sc: 1 },
    simInput: { px: null, py: null, down: false, space: false },
    lastPtrX: null,
    lastPtrY: null,
    pointerMovedAt: 0,
  };
}

/** Server RunLoadout -> core Loadout, validated: an unknown classId fields
 * the stock hero (createCrypt's own default) instead of crashing derive();
 * level and gear tiers clamp to their legal ranges. */
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

function spawnFloat(rs: RenderState, x: number, y: number, text: string, color: string, big: boolean): void {
  const fx = rs.fx;
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
}

function spawnDie(
  rs: RenderState,
  x: number,
  y: number,
  r: number,
  face: number,
  kind: number,
  victimId: string,
  delay: number,
  accent: string,
  label: string,
): void {
  const fx = rs.fx;
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
  pick.victimId = victimId;
  pick.armed = kind === DIE_CRIT;
  pick.accent = accent;
  pick.label = label;
}

function spawnCollapse(rs: RenderState, key: string, x: number, feetY: number, sc: number): void {
  const fx = rs.fx;
  let pick = fx.collapses[0];
  for (const c of fx.collapses) {
    if (!c.on) {
      pick = c;
      break;
    }
    if (c.t > pick.t) pick = c;
  }
  pick.on = true;
  pick.t = 0;
  pick.key = key;
  pick.x = x;
  pick.feetY = feetY;
  pick.scale = sc;
}

function spawnBones(rs: RenderState, x: number, y: number, sc: number): void {
  const fx = rs.fx;
  let n = 0;
  for (const b of fx.bones) {
    if (n >= 7) break;
    if (b.on && b.t < BONE_S * 0.5) continue;
    b.on = true;
    b.t = 0;
    b.x = x + (Math.random() - 0.5) * 40 * sc;
    b.y = y - (20 + Math.random() * 90) * sc;
    b.vx = (Math.random() - 0.5) * 260 * sc;
    b.vy = -(120 + Math.random() * 240) * sc;
    b.r = (2 + Math.random() * 2.5) * Math.max(0.5, sc);
    n++;
  }
}

function banner(rs: RenderState, text: string, sub: string, color: string): void {
  const b = rs.fx.banner;
  b.text = text;
  b.sub = sub;
  b.t = 0.0001;
  b.color = color;
}

/** Screen position of a world cell for fx (chest-height point). */
function fxPos(rs: RenderState, s: CryptState, x: number, y: number): { x: number; y: number; sc: number } {
  projectCell(s, x, y, rs.pj);
  if (rs.pj.vis) {
    rs.fxP.x = rs.pj.x;
    rs.fxP.y = rs.pj.feetY - 130 * rs.pj.scale;
    rs.fxP.sc = rs.pj.scale;
  } else {
    rs.fxP.x = DESIGN_W / 2;
    rs.fxP.y = 330;
    rs.fxP.sc = 0.6;
  }
  return rs.fxP;
}

function snapPrev(p: Prev, s: CryptState): void {
  p.inited = true;
  p.x = s.x;
  p.y = s.y;
  p.facing = s.facing;
  p.depth = s.depth;
  p.hp = s.hp;
  p.belt = s.belt;
  p.whet = s.whet;
  p.kills = s.kills;
  p.crits = s.crits;
  p.swings = s.swings;
  p.whiffs = s.whiffs;
  p.enemyWhiffs = s.enemyWhiffs;
  p.dmgDealt = s.dmgDealt;
  p.dmgTaken = s.dmgTaken;
  p.drinks = s.drinks;
  p.chestsOpened = s.chestsOpened;
  p.floorsDescended = s.floorsDescended;
  p.dead = s.dead;
  const fe = facedEnemy(s);
  p.facedId = fe ? fe.id : "";
  p.facedAc = fe ? fe.ac : 10;
  p.facedD = fe ? Math.abs(fe.x - s.x) + Math.abs(fe.y - s.y) : 1;
  p.duelId = s.duelId;
  p.duelPhase = s.duelPhase;
  p.duelStyle = s.duelStyle;
  p.duels = s.duels;
  p.guards = s.guards;
  p.deflects = s.deflects;
  p.countersEaten = s.countersEaten;
  p.baited = s.baited;
  p.enN = Math.min(8, s.enemies.length);
  for (let i = 0; i < p.enN; i++) {
    const e = s.enemies[i];
    const pe = p.en[i];
    pe.id = e.id;
    pe.key = e.key;
    pe.x = e.x;
    pe.y = e.y;
    pe.hp = e.hp;
    pe.windup = e.windup;
    pe.atk = e.atk;
    pe.ac = e.ac;
    pe.wk = e.conds.weaken;
    pe.xp = e.xp;
  }
}

// ── the delta engine: one call per fixed step, after stepCrypt (a straight
// port of Client.tsx minus the client-owned onDone/restart wiring) ──────────

function applyDeltas(rs: RenderState, s: CryptState): void {
  const p = rs.prev;
  const fx = rs.fx;
  if (!p.inited) {
    snapPrev(p, s);
    fx.sceneDirty = true;
    return;
  }

  // pose change -> the step-feel transition
  const poseChanged = s.x !== p.x || s.y !== p.y || s.facing !== p.facing || s.depth !== p.depth;
  if (poseChanged) {
    let type = TR_FWD;
    if (s.depth !== p.depth) type = TR_DESCEND;
    else if (s.facing !== p.facing) type = ((s.facing - p.facing + 4) & 3) === 3 ? TR_TURN_L : TR_TURN_R;
    else if (!(s.x - p.x === DIR_DX[p.facing] && s.y - p.y === DIR_DY[p.facing])) type = TR_BACK;
    fx.transPending = type;
    fx.sceneDirty = true;
  }
  const descended = s.depth !== p.depth;
  if (descended) clearEnemyFx(fx);

  const critsD = s.crits - p.crits;
  const whiffsD = s.whiffs - p.whiffs;
  const dmgDealtD = s.dmgDealt - p.dmgDealt;
  const dmgTakenD = s.dmgTaken - p.dmgTaken;
  const deflectsD = s.deflects - p.deflects;
  const guardsD = s.guards - p.guards;
  const baitedD = s.baited - p.baited;

  // per-enemy diffs against the snapshot (damage, deaths, movement).
  // On a descent the whole roster is REPLACED, not killed: skip the diff
  // or every survivor left upstairs would collapse into bones.
  let sceneTouched = poseChanged;
  let whiffsLeft = s.enemyWhiffs - p.enemyWhiffs;
  let foeHitAssigned = false;
  let hitAc = -1; // exact AC of the body the hero's swing connected with
  for (let i = 0; i < (descended ? 0 : p.enN); i++) {
    const pe = p.en[i];
    let cur: EnemyState | null = null;
    for (const e of s.enemies)
      if (e.id === pe.id) {
        cur = e;
        break;
      }
    if (!cur) {
      // the kill: collapse + bone scatter + the xp float
      projectCell(s, pe.x, pe.y, rs.pj);
      const cx = rs.pj.vis ? rs.pj.x : DESIGN_W / 2;
      const cfy = rs.pj.vis ? rs.pj.feetY : 400;
      const csc = rs.pj.vis ? rs.pj.scale : 0.6;
      spawnCollapse(rs, pe.key, cx, cfy, csc);
      spawnBones(rs, cx, cfy, csc);
      spawnFloat(rs, cx, cfy - 170 * csc, `+${pe.xp}`, PAL.gold, true);
      if (hitAc < 0) hitAc = pe.ac;
      sceneTouched = true;
      continue;
    }
    if (cur.hp < pe.hp) {
      if (hitAc < 0) hitAc = pe.ac;
      const ef = enemyFxFor(fx, cur.id);
      ef.flash = 1;
      ef.gold = critsD > 0 && cur.id === p.facedId ? 1 : 0;
      ef.punch = 1;
      const at = fxPos(rs, s, cur.x, cur.y);
      spawnFloat(rs, at.x, at.y, `-${pe.hp - cur.hp}`, PAL.text, false);
      sceneTouched = true;
    }
    if (cur.x !== pe.x || cur.y !== pe.y || cur.windup !== pe.windup) sceneTouched = true;
    // the tell expired this step: the duelist's strike resolved. Only a real
    // dice resolution shows a die - dodges, feints and guarded lights draw
    // NO rng in the sim, so they get floats/flashes instead.
    if (pe.windup === 1) {
      const at = fxPos(rs, s, cur.x, cur.y);
      if (whiffsLeft > 0) {
        // dodged or feinted (enemyWhiffs counts both)
        whiffsLeft--;
        if (baitedD > 0) {
          // the fake bought your dodge: the BAITED float below owns it
        } else if (p.duelStyle === "feint") {
          spawnFloat(rs, at.x, at.y - 26, "FEINT", PAL.steel, false);
        } else {
          spawnFloat(rs, at.x, at.y - 26, "DODGED", PAL.green, false);
        }
      } else if (guardsD > 0) {
        // guarded light: zero damage, no rng - the shield flash owns it
      } else {
        const need = s.ac - (pe.atk - (pe.wk > 0 ? 2 : 0));
        if (dmgTakenD > 0 && !foeHitAssigned) {
          foeHitAssigned = true;
          spawnDie(rs, at.x - 46 * at.sc, at.y - 30 * at.sc, 21, faceForHit(need, 20), DIE_FOE_HIT, "", 0.06, "", cur.name.toUpperCase());
        } else {
          spawnDie(rs, at.x - 46 * at.sc, at.y - 30 * at.sc, 21, faceForMiss(need), DIE_FOE_MISS, "", 0.06, "", cur.name.toUpperCase());
        }
      }
    }
  }
  if (s.enemies.length !== p.enN) sceneTouched = true;

  // the hero was hit: red vignette pulse + shake + damage float
  if (dmgTakenD > 0) {
    fx.redPulse = 1;
    fx.shake = Math.max(fx.shake, 0.55);
    fx.shakeAmp = rs.reduced ? 0 : 5;
    spawnFloat(rs, DESIGN_W / 2, 452, `-${dmgTakenD}`, PAL.blood, true);
  }

  // the hero swung: slash arc + the d20 (air whiffs AND deflects roll no
  // die - the sim draws no rng for either, so the theater shows none)
  if (s.swings > p.swings) {
    projectCell(s, s.x + DIR_DX[s.facing] * p.facedD, s.y + DIR_DY[s.facing] * p.facedD, rs.pj);
    const sx = rs.pj.vis ? rs.pj.x : DESIGN_W / 2;
    const sy = rs.pj.vis ? rs.pj.feetY - 140 * rs.pj.scale : 300;
    const ssc = rs.pj.vis ? Math.max(0.35, rs.pj.scale) : 0.8;
    const sl = fx.slash;
    sl.t = 0;
    sl.x = sx;
    sl.y = sy;
    sl.scale = ssc;
    sl.kind = whiffsD > 0 || deflectsD > 0 ? SLASH_WHIFF : critsD > 0 ? SLASH_CRIT : SLASH_HIT;
    if (whiffsD === 0 && deflectsD === 0) {
      // the connected body's real AC beats the pre-step snapshot when
      // damage tells us exactly who was struck
      const need = (hitAc >= 0 ? hitAc : p.facedAc) - s.atk;
      const acc = CLASS_ACCENT[s.classId];
      if (critsD > 0) {
        spawnDie(rs, sx + 62 * ssc, sy - 30 * ssc, 27, faceForCrit(s.critRange), DIE_CRIT, p.facedId, 0.05, acc, "YOU");
      } else if (dmgDealtD > 0) {
        spawnDie(rs, sx + 62 * ssc, sy - 30 * ssc, 27, faceForHit(need, s.critRange), DIE_HIT, "", 0.05, acc, "YOU");
      } else {
        const face = faceForMiss(need);
        spawnDie(rs, sx + 62 * ssc, sy - 30 * ssc, 27, face, face === 1 ? DIE_NAT1 : DIE_MISS, "", 0.05, acc, "YOU");
      }
    }
  }

  // ── duel theater (CRYPT DUELS: the counters are the script) ──────────────
  let de: EnemyState | null = null;
  if (s.duelId !== "") {
    for (const en of s.enemies)
      if (en.id === s.duelId && en.hp > 0) {
        de = en;
        break;
      }
  }
  if (deflectsD > 0) {
    // a swing thrown outside the open window bounced off
    const at = de ? fxPos(rs, s, de.x, de.y) : null;
    spawnFloat(rs, at ? at.x : DESIGN_W / 2, at ? at.y - 8 : 330, "DEFLECT", PAL.dim, false);
  }
  if (guardsD > 0) {
    fx.guardFlash = 1;
    spawnFloat(rs, DESIGN_W / 2, 428, "GUARDED", PAL.steel, false);
  }
  if (baitedD > 0) {
    const at = de ? fxPos(rs, s, de.x, de.y) : null;
    spawnFloat(rs, at ? at.x : DESIGN_W / 2, (at ? at.y : 330) - 26, "BAITED", PAL.steel, true);
  }
  if (s.countersEaten > p.countersEaten) {
    banner(rs, "COUNTERED", "TOO MANY BLOCKED SWINGS", PAL.blood);
    fx.redPulse = Math.max(fx.redPulse, 0.7);
    fx.shake = Math.max(fx.shake, 0.35);
    fx.shakeAmp = rs.reduced ? 0 : 4;
  }
  if (s.duels > p.duels) {
    banner(rs, `A ${(de ? de.name : "CHALLENGER").toUpperCase()} CHALLENGES YOU`, "", PAL.ember);
  }
  if (s.duelPhase === DP_NEXT && p.duelPhase !== DP_NEXT) {
    let living = 0;
    for (const en of s.enemies) if (en.hp > 0) living += 1;
    if (living > 0) banner(rs, "NEXT CHALLENGER", "", PAL.gold);
  }

  // the belt fired
  if (s.drinks > p.drinks) spawnFloat(rs, DESIGN_W / 2, 430, `DRAUGHT +${Math.floor(s.hpMax / 2)}`, PAL.green, false);
  // loot theater
  if (s.belt > p.belt) spawnFloat(rs, DESIGN_W / 2, 402, "+DRAUGHT", PAL.gold, false);
  if (s.whet > p.whet) spawnFloat(rs, DESIGN_W / 2, 402, "+WHETSTONE", PAL.gold, false);
  if (s.chestsOpened > p.chestsOpened) {
    sceneTouched = true;
    if (s.belt <= p.belt && s.whet <= p.whet) spawnFloat(rs, DESIGN_W / 2, 402, "DUST", PAL.dim, false);
  }

  // the descent
  if (s.floorsDescended > p.floorsDescended) {
    banner(rs, `DEPTH ${s.depth}`, `+${FLOOR_BONUS} · THE CRYPT DEEPENS`, PAL.gold);
    spawnFloat(rs, DESIGN_W / 2, 380, `+${FLOOR_BONUS}`, PAL.gold, true);
  }

  // death fx (RunShell owns the result screen; this is just the final beat)
  if (s.dead === 1 && p.dead === 0) {
    fx.deathT = 0.0001;
    fx.shake = Math.max(fx.shake, 1);
    fx.shakeAmp = rs.reduced ? 0 : 7;
    fx.redPulse = 1;
  }

  if (sceneTouched) fx.sceneDirty = true;
  snapPrev(p, s);
}

// ── fx clocks (port of Client.tsx tickFx) ───────────────────────────────────

function tickFx(rs: RenderState, dt: number, realDt: number): void {
  const fx = rs.fx;
  fx.time += realDt;
  for (const e of fx.enemies) {
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
    if (e.gold > 0 && e.flash <= 0) e.gold = 0;
    if (e.punch > 0) e.punch *= Math.exp(-dt * 11);
  }
  if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 2.4);
  if (fx.redPulse > 0) fx.redPulse = Math.max(0, fx.redPulse - dt * 2.6);
  if (fx.guardFlash > 0) fx.guardFlash = Math.max(0, fx.guardFlash - dt * 2.2);
  if (fx.banner.t > 0 && fx.banner.t < 99) fx.banner.t += dt;
  if (fx.deathT > 0) fx.deathT += realDt;
  if (fx.slash.t < SLASH_S) fx.slash.t += dt;
  if (fx.trans.t < fx.trans.dur) fx.trans.t += realDt;
  for (const f of fx.floats) {
    if (!f.on) continue;
    f.t += dt;
    f.y -= dt * 42;
    if (f.t > 1.1) f.on = false;
  }
  for (const c of fx.collapses) {
    if (!c.on) continue;
    c.t += dt;
    if (c.t > COLLAPSE_S) c.on = false;
  }
  for (const b of fx.bones) {
    if (!b.on) continue;
    b.t += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vy += 900 * dt;
    if (b.t > BONE_S) b.on = false;
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
      fx.shakeAmp = rs.reduced ? 0 : 6;
      if (d.victimId !== "") {
        const ef = enemyFxFor(fx, d.victimId);
        ef.flash = 1;
        ef.gold = 1;
        ef.punch = 1;
      }
    }
    if (d.t > DIE_LIFE) d.on = false;
  }
}

// ── the RunShell callbacks ──────────────────────────────────────────────────

function shellStep(s: CryptState, dt: number, input: ShellInput): void {
  const rs = R;
  if (!rs) return; // createSim always runs first; belt and braces
  const fx = rs.fx;
  // crit hit-stop: SIM stepping pauses, page fx keep running (dev-client
  // parity; the run floor is wall-clock server-side, so no time is owed)
  if (fx.hitStop > 0) {
    fx.hitStop = Math.max(0, fx.hitStop - dt);
    tickFx(rs, 0, dt);
    return;
  }
  const si = rs.simInput;
  if (input.down && input.px != null && input.py != null) {
    // the real pointer: already normalized to [0,1] by pointerTransform
    si.px = input.px;
    si.py = input.py;
    si.down = true;
  } else {
    // keyboard: SYNTHESIZE the zone tap - same sim zones, no parallel path;
    // parity gives a clean down-edge every other fixed step (Client.tsx's
    // idiom). Held-boolean priority: fwd > back > turnL > turnR (RunShell
    // does not expose press order; see the header).
    const verb = input.up ? 0 : input.downKey ? 1 : input.left ? 2 : input.right ? 3 : -1;
    if (verb !== -1) {
      rs.synthPhase = !rs.synthPhase;
      si.px = KEY_PX[verb];
      si.py = KEY_PY[verb];
      si.down = rs.synthPhase;
    } else {
      si.px = input.px;
      si.py = input.py;
      si.down = false;
      rs.synthPhase = false; // next hold starts on a clean down edge
    }
  }
  si.space = input.space;
  stepCrypt(s, dt, si);
  applyDeltas(rs, s);
  tickFx(rs, dt, dt);
}

function zoomAbout(g: CanvasRenderingContext2D, z: number): void {
  g.translate(DESIGN_W / 2, DESIGN_H / 2);
  g.scale(z, z);
  g.translate(-DESIGN_W / 2, -DESIGN_H / 2);
}

function shellDraw(g: CanvasRenderingContext2D, s: CryptState, view: ShellView): void {
  const rs = R;
  if (!rs) return;
  const fx = rs.fx;
  const FIXED = 1 / 60;

  // pointer idle tracking: the dev client sampled pointermove events; the
  // shell derives "moved" by comparing the view pointer between frames
  const ptr = view.pointer ?? null;
  if (ptr && (ptr.x !== rs.lastPtrX || ptr.y !== rs.lastPtrY)) {
    rs.lastPtrX = ptr.x;
    rs.lastPtrY = ptr.y;
    rs.pointerMovedAt = fx.time;
  }

  // the step transition was requested: snapshot the OLD scene first
  if (fx.transPending !== TR_NONE) {
    rs.prevG.setTransform(1, 0, 0, 1, 0, 0);
    rs.prevG.drawImage(rs.sceneCv, 0, 0);
    fx.trans.type = fx.transPending;
    fx.trans.dur = fx.transPending === TR_DESCEND ? DESCEND_FADE_S : STEP_FADE_S;
    fx.trans.t = 0;
    fx.transPending = TR_NONE;
  }
  // repaint the scene offscreen only when state changed or bodies animate
  if (fx.sceneDirty || rs.lastVisEnemies > 0) {
    rs.lastVisEnemies = renderScene(rs.sceneG, s, fx.time, fx, rs.reduced);
    fx.sceneDirty = false;
  }

  let shx = 0;
  let shy = 0;
  if (fx.shake > 0 && fx.shakeAmp > 0) {
    shx = (Math.random() - 0.5) * 2 * fx.shakeAmp * fx.shake;
    shy = (Math.random() - 0.5) * 2 * fx.shakeAmp * fx.shake;
  }

  g.fillStyle = PAL.ink;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // ── world group (scene composite + world fx), shaken together ──────────
  g.save();
  const tr = fx.trans;
  const trActive = tr.t < tr.dur;
  let bob = 0;
  if (trActive && !rs.reduced && (tr.type === TR_FWD || tr.type === TR_BACK || tr.type === TR_DESCEND)) {
    bob = Math.sin((tr.t / tr.dur) * Math.PI) * (tr.type === TR_DESCEND ? 8 : 5);
  }
  g.translate(shx, shy + bob);
  if (trActive) {
    const k = tr.t / tr.dur;
    const ke = k * k * (3 - 2 * k);
    // the old view moves out...
    g.save();
    if (!rs.reduced) {
      if (tr.type === TR_FWD) zoomAbout(g, 1 + 0.05 * ke);
      else if (tr.type === TR_BACK) zoomAbout(g, 1 - 0.045 * ke);
      else if (tr.type === TR_DESCEND) zoomAbout(g, 1 + 0.08 * ke);
      else if (tr.type === TR_TURN_L) g.translate(42 * ke, 0);
      else if (tr.type === TR_TURN_R) g.translate(-42 * ke, 0);
    }
    g.drawImage(rs.prevCv, 0, 0);
    if (tr.type === TR_DESCEND) {
      g.fillStyle = `rgba(5,6,10,${0.55 * ke})`;
      g.fillRect(-60, -60, DESIGN_W + 120, DESIGN_H + 120);
    }
    g.restore();
    // ...and the new state fades in over it
    g.save();
    g.globalAlpha = ke;
    if (!rs.reduced) {
      if (tr.type === TR_TURN_L) g.translate(-30 * (1 - ke), 0);
      else if (tr.type === TR_TURN_R) g.translate(30 * (1 - ke), 0);
      else if (tr.type === TR_BACK) zoomAbout(g, 1 + 0.03 * (1 - ke));
    }
    g.drawImage(rs.sceneCv, 0, 0);
    g.restore();
  } else {
    g.drawImage(rs.sceneCv, 0, 0);
  }

  // torchlight: baked vignette, alpha flickered on the page-fx stream
  rs.flickT += FIXED;
  if (rs.flickT > 0.12) {
    rs.flickT = 0;
    rs.flickNoise = rs.flick();
  }
  const torchA = rs.reduced ? 0.93 : 0.93 + 0.025 * Math.sin(fx.time * 1.6) + (rs.flickNoise - 0.5) * 0.03;
  g.globalAlpha = Math.max(0, Math.min(1, torchA));
  g.drawImage(torchPlate(), 0, 0);
  g.globalAlpha = 1;

  // hero-hurt vignette pulse
  if (fx.redPulse > 0.01) {
    g.globalAlpha = Math.min(1, fx.redPulse);
    g.drawImage(hurtPlate(), 0, 0);
    g.globalAlpha = 1;
  }

  // death theater: collapses + bone scatter
  for (const c of fx.collapses) {
    if (!c.on) continue;
    drawCollapse(g, c.key, c.x, c.feetY, c.scale, c.t / COLLAPSE_S);
  }
  for (const b of fx.bones) {
    if (!b.on) continue;
    drawBone(g, b.x, b.y, b.r, Math.max(0, 1 - b.t / BONE_S));
  }

  // the hero's weapon arc
  if (fx.slash.t < SLASH_S) {
    drawSlash(
      g,
      fx.slash.x,
      fx.slash.y,
      fx.slash.scale,
      fx.slash.t / SLASH_S,
      CLASS_ACCENT[s.classId],
      fx.slash.kind === SLASH_WHIFF,
      fx.slash.kind === SLASH_CRIT,
    );
  }

  // the "GUARDED" shield flash
  drawGuardFlash(g, fx.guardFlash, rs.reduced);

  // the d20s + damage floats
  for (const d of fx.dice) {
    if (!d.on || d.delay > 0) continue;
    const settle01 = Math.min(1, d.t / DIE_FLICK);
    const face = settle01 >= 1 ? d.face : 1 + Math.floor(Math.random() * 20);
    const alpha = Math.min(1, (DIE_LIFE - d.t) / 0.25);
    const pop = settle01 >= 1 ? Math.exp(-(d.t - DIE_FLICK) * 6) : 0;
    drawD20(
      g,
      d.x,
      d.y,
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
    g.strokeText(f.text, Math.round(f.x), Math.round(f.y));
    g.fillStyle = f.color;
    g.fillText(f.text, Math.round(f.x), Math.round(f.y));
    g.globalAlpha = 1;
  }
  g.restore(); // end of the shaken world group

  // crosshair on the faced enemy (sim truth, display only)
  if (s.dead === 0 && !trActive) {
    const fe = facedEnemy(s);
    if (fe) {
      projectCell(s, fe.x, fe.y, rs.pj);
      if (rs.pj.vis) drawTargetBrackets(g, rs.pj, fe.key, CLASS_ACCENT[s.classId], fx.time);
    }
  }

  // input zone hints (fade when the pointer goes idle); pointer coords are
  // normalized [0,1] here, the same space the hint painters expect. During a
  // duel the SAME zones mean sidestep/strike/guard/skill, so the overlay
  // switches; ENTER keeps inputs dead and dims the hints to say so.
  if (s.dead === 0 && ptr) {
    const idle = fx.time - rs.pointerMovedAt;
    const fade = Math.max(0, Math.min(1, (1.9 - idle) / 0.5));
    if (s.duelId !== "") {
      drawDuelZoneHints(
        g,
        ptr.x,
        ptr.y,
        fade * (s.duelPhase === DP_ENTER ? 0.35 : 1),
        TURN_L_X,
        TURN_R_X,
        FWD_SPLIT_Y,
        CLASS_ACCENT[s.classId],
      );
    } else {
      drawZoneHints(g, ptr.x, ptr.y, fade, TURN_L_X, TURN_R_X, FWD_SPLIT_Y);
    }
  }

  if (fx.banner.t > 0 && fx.banner.t < 99) drawBanner(g, fx.banner.text, fx.banner.sub, fx.banner.t, fx.banner.color);
  drawHud(g, s);
  drawDuelHud(g, s);

  // THE GRADE, LAST (the beauty-panel law)
  rs.grade?.applyWorld(g, DESIGN_W, DESIGN_H);
}

// ── the shell ───────────────────────────────────────────────────────────────

export default function CryptShell() {
  return (
    <RunShell<CryptState>
      game="crypt"
      title="The Crypt"
      accent="#3f6adf"
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
        preloadArt();
        return createCrypt(w, h, seed, false, toLoadout(loadout));
      }}
      step={shellStep}
      draw={shellDraw}
      done={cryptDone}
      score={cryptScore}
      resultHeadline={(s) => `FELL AT DEPTH ${s.depth}`}
      resultSub={(s) =>
        `${s.kills} kills · ${s.floorsDescended} floors · ${s.crits} crits · ${s.enemyWhiffs} sidesteps · ${Math.round(cryptSimSecs(s))}s below`
      }
      runMeta={(s) => ({ v: 1, depth: s.depth, kills: s.kills, waltz: s.enemyWhiffs })}
      shareBuild={(s, dayKey) => {
        const grid = `${"\u{1F7E6}".repeat(Math.min(12, s.floorsDescended + 1))}\u{1F480}`;
        return {
          grid,
          payload: `THE CRYPT ${dayKey} · ${cryptScore(s)} pts · depth ${s.depth}\n${grid}\nlaunchwars.xyz/s7/games/crypt`,
        };
      }}
      intro={
        <div>
          <p style={{ margin: "0 0 8px" }}>
            A first-person crawl through the undead legion. Tap the LEFT or RIGHT edge to turn. Tap the middle,
            top half to step forward, bottom half to step back.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            The first body to reach you locks you into a DUEL, and the same zones change meaning: tap LEFT or
            RIGHT to sidestep, tap the middle top half to strike, HOLD the middle bottom half to guard, press
            Space for your class skill. Every real strike rolls a visible d20.
          </p>
          <p style={{ margin: 0, opacity: 0.85 }}>
            Watch the glow before each enemy swing. Amber means a quick hit that your guard can block. Deep red
            means a heavy blow that breaks through guard: sidestep on the side the arrows show. A pale grey
            shimmer is a fake that never lands. Dodge a real swing and the enemy is open: that is your moment to
            strike. Swinging while it is not open just bounces off. Chests open when you walk onto them. Take the
            stairs to go deeper; every floor down pays a bonus. The legion never ends. Death is the only exit.
          </p>
        </div>
      }
      strings={{
        startIdle: "Step inside",
        startAgain: "Go back down",
        dailyResultNote: "The daily run · the same crypt for everyone today",
        keyboardHint:
          "Keyboard works too: A and D turn or sidestep, W steps forward or strikes, S steps back, hold S to guard in a duel, Space is your class skill.",
      }}
    />
  );
}
