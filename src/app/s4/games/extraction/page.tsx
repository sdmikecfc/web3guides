/**
 * SEASON 4 · THE HIT LIST — 🏍️⛓️ EXTRACTION v2
 * A 60 second three.js cyberpunk motorcycle brawler. The Agency girl rides a
 * sport bike down a FLAT rain-slick four-lane arterial, futuristic city
 * stacked along both borders. Enemy riders cruise up from behind to knife
 * range and she SWINGS HER CHAIN to send them spinning out; between fights
 * she weaves slow traffic, threads police roadblock gaps and rides glowing
 * boost strips. Trench-run DNA (chase camera, banking, one-thumb controls)
 * but flat, wider, and much more detailed.
 *
 * ARCHITECTURE (unchanged, the proven S3 trench pattern): this page does NOT
 * use GameShell — a WebGL game owns its renderer, its own rAF loop, DOM-ref
 * HUD (zero React re-renders while playing), and the same session gate /
 * run-nonce / submit-score flow via the S4 _shared harness. Practice mode
 * (?practice=1) mirrors engine.tsx: zero server calls, no gate, nothing banks.
 * (WebGL doesn't render headless — eyeball on deploy.)
 *
 * CONTROLS (one thumb first):
 * - HOLD + drag = RELATIVE JOYSTICK: horizontal offset from the canvas center
 *   steers (deadzone 0.07, the franchise scheme). Chosen over
 *   hold-where-you-want-to-go because the chase camera banks WITH the bike:
 *   an absolute target under a banking camera drifts, a center-relative
 *   offset always means "lean this hard", which stays honest mid-bank. The
 *   bike holds its line when you let go and leans hard into the steer.
 * - QUICK TAP anywhere (<0.28s, <14px movement — the franchise tapEdge
 *   pattern) = CHAIN SWING: her right arm flings the chain in a visible arc
 *   toward the nearest-side enemy. Hit = they wobble and spin out (cartoon
 *   sparks + stars, zero blood). Miss = a short recovery cooldown.
 * - Keyboard: A/D or arrows steer, SPACE (or W / ArrowUp) = chain swing.
 *
 * GEOMETRY (flat, not a trench):
 * - Four-lane road (3 dashed lane lines) receding into exponential fog, the
 *   asphalt texture itself scrolls; wet-asphalt reflection smears pool under
 *   every light source (signs, taillights, roadblock strobes, streetlights).
 * - City at the BORDERS, three parallax layers deep (depth does the parallax):
 *   near lit-window blocks with varied mass, a far darker silhouette layer,
 *   and the fog-immune skyline panorama at the horizon. Streetlight cones
 *   line the curb, holo billboards float over the rooftops, and neon sign
 *   boards carry invented cyber-glyphs (deliberately no readable text).
 *
 * THE RIDER (she must read as a girl on a bike from the chase camera):
 * a stylized low-poly 3D figure built from primitives on a sport bike with
 * emissive trim — cap with a gold badge, a 4-segment PONYTAIL that flutters
 * with speed and whips with the lean, crop jacket with an ice spine stripe
 * and crimson collar, bare midriff, gold belt, dark pants, trim boots. The
 * jacket tail is a fluttering plane; the front fork counter-steers; the whole
 * rig banks into turns like the trench ship. 3D beat the sprite here because
 * the chain swing needs a real arm fling + a horizontal arc in world space.
 *
 * COMBAT (the new verb):
 * - Enemy riders spawn behind the camera and CRUISE UP alongside into your
 *   lane or the next one, rubber-banding to knife range. Telegraphs: engine
 *   rev sfx on spawn, then their headlight blink accelerates as the shove
 *   winds up.
 * - A chain hit = the enemy wobbles + spins out past the camera in cartoon
 *   sparks and gold stars. 50ms hit-stop, screenshake, +300.
 * - An enemy that reaches your side and lingers SHOVES you: speed loss +
 *   knockback + i-frames, NEVER instant death, then it drops back.
 * - Dodging stays: slow traffic (crash = speed loss + 1 of 3 shields, the 3rd
 *   crash ends the run early with everything banked), roadblocks with a gap
 *   to thread, boost strips (free speed surge + FOV kick + ghosted grazes).
 *
 * PER-RUN PROCEDURAL CHAOS (no two runs share a layout, nothing replayable):
 * every gameplay roll — traffic lanes/speeds/wobble, roadblock gaps, strip
 * placement, enemy sides/timings, sign+building+billboard order — comes from
 * ONE mulberry32 RNG seeded by hashing the run nonce (xmur3). Practice seeds
 * from the clock. Recycling mid-run draws from the same stream.
 *
 * SCORING (hits cost speed, never instant death):
 * distance ticks constantly (speed ramps all run) + riders CHAINED 300 + near
 * misses 100 + threaded roadblocks 150 + boost strips 75 + ghosted grazes 50
 * + EXTRACTED bonus 1500 for surviving the full 60s. A strong run lands
 * ~9,000-13,000; the registry entry (lib/s4/games) is unchanged: maxScore
 * 18000, toCredits s/150, creditsCap 120, pointsCap 10, attempts 3,
 * floorMs 30000.
 *
 * STAT BASELINE (ADR-0004; every effect bounded ≤ ~25%):
 * /api/s4/run-start returns the wallet's persistent stats with the nonce.
 *   botox   (Armor)   = shove/crash resistance: shoves + crashes cost 6%/lvl
 *                       less speed + knockback, cap 24%.
 *   drugs   (Ride)    = top speed +3%/lvl, cap 12% (speed feeds distance
 *                       score, the tightest bound).
 *   ozempic (Gadgets) = evasion: collision hitbox 5%/lvl slimmer, cap 20%
 *                       (traffic, roadblock margins, enemy shove range).
 *   aura    (Weapon)  = chain power +0.8%/lvl, cap 24% (longer reach + wider
 *                       arc), plus the RIDE TIER ladder [1,5,10,20,30] =
 *                       Courier / Tuned / Race-Spec / Phantom / Oni-Class:
 *                       chain + exhaust color flair, tier never changes caps.
 * The numbers live in STAT_EFFECTS.extraction in lib/s4/games.ts (the one
 * shared place stat math is defined); this page only reads them.
 *
 * ART SLOTS (try-image-else-procedural; a PNG landing at the path swaps in
 * with zero code change, a 404 keeps the procedural look, hydration-safe):
 *   /public/s4-art/games/extraction/skyline.png    far city panorama ~4:1
 *   /public/s4-art/games/extraction/car-back.png   sedan rear face, square
 *   /public/s4-art/games/extraction/van-back.png   van rear face, square
 *   /public/s4-art/games/extraction/truck-back.png truck rear face, square
 *   /public/s4-art/games/extraction/sign-a.png     neon boards; a/b VERTICAL
 *   /public/s4-art/games/extraction/sign-b.png     ~1:2, c/d HORIZONTAL ~2:1
 *   /public/s4-art/games/extraction/sign-c.png
 *   /public/s4-art/games/extraction/sign-d.png
 * The rider + enemy bikes are procedural 3D rigs, no art slot.
 *
 * JUICE: 50ms hit-stop + gold star sparks + screenshake on a chain hit,
 * camera banks into turns and leads the steer, FOV kick on boost strips,
 * score floaters, slow-mo on the final crash, forward speed streaks, rain in
 * the headlight, ponytail + jacket flutter, strobing roadblocks, holo shimmer.
 * SFX map (shared S4 kit): fire=chain swing, hit=chain connect, tap=whiff or
 * near miss, hurt=shove/crash, boost=strip surge AND the enemy engine-rev
 * telegraph, score=threaded/extracted, ko=final crash. prefers-reduced-motion
 * gates shake, particle + rain density, ribbon flash and the boost overlay.
 *
 * SAFETY: cartoon spin-outs only — sparks, stars and a wobble. No blood, no
 * pedestrians, nothing living gets run down.
 *
 * PRACTICE: /s4/games/extraction?practice=1 runs this with zero server calls.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  ACCENT,
  THEME,
  SessionGate,
  startRun,
  submitScore,
  useS4Session,
  type RunStartResult,
  type ScoreResult,
} from "../_shared/shared";
import { GAME_RULES, STAT_EFFECTS, ZERO_STATS, type PlayerStats } from "@/lib/s4/games";
import { createSfx, type Sfx } from "../_shared/sfx";

const GAME = "extraction";

// ---- stat synergy (the shared registry entry; nothing else defines stat math)
const E = STAT_EFFECTS.extraction;
const TIER_NAMES = ["Courier", "Tuned", "Race-Spec", "Phantom", "Oni-Class"] as const;
const TIER_FLAME = ["#f0b340", "#4dd8e6", "#8ef0ff", "#b18cff", "#ffffff"] as const;

/** Aura level -> ride tier 1..5 (tier 1 floor at aura 0; cosmetic flair only). */
function rideTier(aura: number): number {
  let tier = 1;
  for (let i = 0; i < E.aura.rideTiers.length; i++) if (aura >= E.aura.rideTiers[i]) tier = i + 1;
  return tier;
}

// ---- tuning -----------------------------------------------------------------
const RUN_SECONDS = 60;
const XB = 6.6; // road half width (4 lanes)
const PX = 5.6; // player lateral clamp
const BIKE_Z = 0; // bike sits here; the world scrolls toward +z
const CAM_Z = 6.2;
const CAM_Y = 2.7;
const BASE_FOV = 78;
const BASE_SPEED = 26; // u/s at t=0, before Ride
const SPEED_RAMP = 0.34; // +u/s per second — the whole run gets faster
const STEER_SPEED = 16; // u/s lateral
const BOOST_T = 0.9; // strip surge seconds
const BOOST_BONUS = 0.45; // speed multiplier bonus while surging
const SWING_T = 0.24; // chain swing animation seconds
const SWING_CD_HIT = 0.5; // recovery after a connect (accuracy is rewarded)
const SWING_CD_MISS = 0.95; // recovery after a whiff
const CHAIN_REACH = 2.2; // lateral strike reach, before Weapon
const CHAIN_Z = 2.8; // fore/aft strike window
const KNIFE_X = 1.35; // the enemy's hold-beside-you distance
const SHOVE_LOSS = 0.3; // fraction of speed a shove costs, before Armor
const SHOVE_KNOCK = 1.7; // lateral push off a shove, before Armor
const MENACE_MIN = 1.7; // seconds an enemy lingers before the shove attempt
const SPIN_T = 1.1; // chained enemy spin-out seconds
const CRASH_LOSS = 0.55; // fraction of speed a crash costs, before Armor
const CRASH_KNOCK = 2.2; // lateral shove off the car you hit, before Armor
const IFRAMES = 1.2; // post-hit mercy window
const HIT_STOP = 0.05; // freeze-frame on chain hits + crashes (the juice floor)
const SHIELDS = 3; // 3 crashes = early finish, score banked
const DIST_SCORE = 2.2; // points per unit traveled
const CHAIN_SCORE = 300;
const NEAR_SCORE = 100;
const THREAD_SCORE = 150;
const STRIP_SCORE = 75;
const GHOST_SCORE = 50; // boosting through a car = ghosted graze
const EXTRACT_BONUS = 1500; // surviving the full run
const CAR_N = 12;
const ENEMY_N = 5; // enemy rider pool
const BLOCK_N = 3;
const BLOCK_UNITS = 8; // barrier segments across the road; the gap hides 2-3
const UNIT_W = (2 * XB) / BLOCK_UNITS;
const STRIP_N = 4;
const SIGN_N = 12;
const SIGN_GAP = 26;
const BUILD_N = 26; // near layer, 13 per side
const BUILD_GAP = 15;
const FAR_N = 16; // far silhouette layer, 8 per side
const FAR_GAP = 24;
const LAMP_N = 10; // streetlights, alternating curbs
const LAMP_GAP = 26;
const HOLO_N = 5; // holo billboards over the rooftops
const HOLO_GAP = 55;
const PART_CAP = 220; // particle pool ceiling (ADR-0020)
const RAIN_N = 340;
const STREAK_N = 140;
const TAP_MAX_T = 0.28; // quick tap = chain swing (the franchise tapEdge)
const TAP_MAX_MOVE = 14;
const JOY_DEAD = 0.07; // relative-joystick deadzone (the franchise scheme)
const JOY_RANGE = 0.4;

// Respect prefers-reduced-motion: shake, particle density, rain density, the
// ribbon flash and boost overlay are gated (evaluated once; SSR-safe).
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const RAIN_COUNT = REDUCED_MOTION ? 90 : RAIN_N;
const PART_COUNT = REDUCED_MOTION ? 60 : PART_CAP;

// ---- palette (charcoal base + crimson/gold/ice + the neon-anime era) --------
const FOGC = 0x080a12;
const ICE = "#4dd8e6";
const CRIMSON = "#e33d4e";
const GOLD = "#f0b340";
const VIOLET = "#b18cff";
const AMBER = "#ffd98a";

// ---- seeded RNG (ALL gameplay randomness flows from the run nonce) ----------
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- procedural texture kit -------------------------------------------------
// Everything is painted on canvas at world-build time (client only). These are
// AMBIENCE, deterministic via fixed decorative seeds — the gameplay layout is
// what re-rolls per run from the nonce RNG.
function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  paint(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Wet asphalt, FOUR lanes: charcoal base, speckle grain, 3 dashed lane lines,
 *  ice edge strips, vertical sheen streaks that read as standing water. */
function asphaltTex(): THREE.CanvasTexture {
  const r = mulberry32(101);
  const t = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = "#0b0d13";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 950; i++) {
      const v = 18 + r() * 26;
      g.fillStyle = `rgba(${v + 6},${v + 10},${v + 20},${0.25 + r() * 0.3})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // wet sheen streaks (the rain look lives in the texture too)
    for (let i = 0; i < 12; i++) {
      const x = r() * w;
      const grad = g.createLinearGradient(x, 0, x + 14, 0);
      grad.addColorStop(0, "rgba(150,190,225,0)");
      grad.addColorStop(0.5, `rgba(150,190,225,${0.03 + r() * 0.05})`);
      grad.addColorStop(1, "rgba(150,190,225,0)");
      g.fillStyle = grad;
      g.fillRect(x, 0, 14, h);
    }
    // three dashed lane lines = four lanes
    g.fillStyle = "rgba(210,220,235,0.4)";
    for (const lx of [w * 0.25, w * 0.5, w * 0.75]) {
      for (let y = 0; y < h; y += 56) g.fillRect(lx - 2, y, 4, 26);
    }
    // ice edge strips
    g.fillStyle = "rgba(77,216,230,0.32)";
    g.fillRect(4, 0, 5, h);
    g.fillRect(w - 9, 0, 5, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 24);
  t.anisotropy = 4;
  return t;
}

/** Lit-window building face; 3 variants keep the border from tiling flat. */
function windowsTex(variant: number): THREE.CanvasTexture {
  const r = mulberry32(400 + variant * 37);
  return canvasTex(96, 192, (g, w, h) => {
    g.fillStyle = "#0c0f1a";
    g.fillRect(0, 0, w, h);
    const cols = 7;
    const rows = 17;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const x = 6 + cx * 12.5;
        const y = 6 + cy * 10.8;
        const roll = r();
        if (roll < 0.3) {
          const c = r() < 0.6 ? "255,217,138" : r() < 0.8 ? "159,232,245" : "227,61,78";
          g.fillStyle = `rgba(${c},${0.35 + r() * 0.5})`;
        } else {
          g.fillStyle = `rgba(32,44,72,${0.4 + r() * 0.3})`;
        }
        g.fillRect(x, y, 8, 6);
      }
    }
  });
}

/** Far-layer building face: near-silhouette with sparse window specks. */
function farTex(variant: number): THREE.CanvasTexture {
  const r = mulberry32(880 + variant * 31);
  return canvasTex(64, 160, (g, w, h) => {
    g.fillStyle = "#080a12";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      if (r() < 0.74) continue;
      g.fillStyle = r() < 0.6 ? "rgba(255,217,138,0.4)" : "rgba(159,232,245,0.35)";
      g.fillRect(4 + r() * (w - 8), 4 + r() * (h - 8), 2, 2);
    }
  });
}

/** Far city panorama: layered silhouettes + neon haze at the horizon. */
function skylineTex(): THREE.CanvasTexture {
  const r = mulberry32(777);
  return canvasTex(1024, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#05060b");
    grad.addColorStop(1, "#0b0f1c");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // neon haze pools behind the towers
    const haze: [string, number][] = [
      ["227,61,78", 0.1],
      ["77,216,230", 0.12],
      ["177,140,255", 0.08],
      ["240,179,64", 0.07],
    ];
    for (let i = 0; i < 8; i++) {
      const [c, a] = haze[i % haze.length];
      const x = r() * w;
      const rad = 90 + r() * 160;
      const hg = g.createRadialGradient(x, h - 20, 0, x, h - 20, rad);
      hg.addColorStop(0, `rgba(${c},${a})`);
      hg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = hg;
      g.fillRect(x - rad, h - 20 - rad, rad * 2, rad * 2);
    }
    // two silhouette layers
    for (const [col, hMax] of [["#0a0d16", 150] as const, ["#070910", 105] as const]) {
      let x = 0;
      while (x < w) {
        const bw = 26 + r() * 54;
        const bh = 34 + r() * hMax;
        g.fillStyle = col;
        g.fillRect(x, h - bh, bw, bh);
        if (r() < 0.3) g.fillRect(x + bw * 0.4, h - bh - 12, 2, 12); // antenna
        // window specks
        for (let i = 0; i < bw * bh * 0.004; i++) {
          g.fillStyle = r() < 0.55 ? "rgba(255,217,138,0.5)" : "rgba(159,232,245,0.45)";
          g.fillRect(x + 3 + r() * (bw - 6), h - bh + 4 + r() * (bh - 8), 1.6, 1.6);
        }
        x += bw + 4 + r() * 14;
      }
    }
  });
}

// Neon sign boards: invented cyber-glyph strokes, DELIBERATELY unreadable —
// the spec bans readable text, so the street speaks a language nobody does.
const SIGN_COLS = [CRIMSON, ICE, GOLD, VIOLET] as const;
const signVertical = (idx: number) => idx % 2 === 0;
function glyphSignTex(idx: number): THREE.CanvasTexture {
  const r = mulberry32(560 + idx * 41);
  const v = signVertical(idx);
  const c = SIGN_COLS[idx % SIGN_COLS.length];
  const w = v ? 128 : 256;
  const h = v ? 256 : 128;
  return canvasTex(w, h, (g) => {
    g.fillStyle = "rgba(8,10,16,0.94)";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = c;
    g.lineWidth = 4;
    g.shadowColor = c;
    g.shadowBlur = 14;
    g.strokeRect(6, 6, w - 12, h - 12);
    const cells = v ? 5 : 6;
    for (let i = 0; i < cells; i++) {
      const cx = v ? w / 2 : 18 + ((w - 36) / cells) * (i + 0.5);
      const cy = v ? 22 + ((h - 44) / cells) * (i + 0.5) : h / 2;
      const s = v ? 16 : 13; // glyph half-size
      g.strokeStyle = r() < 0.22 ? "#ffffff" : c;
      g.lineWidth = 3.5;
      g.shadowBlur = 10;
      g.lineCap = "round";
      const strokes = 2 + Math.floor(r() * 3);
      for (let k = 0; k < strokes; k++) {
        g.beginPath();
        if (r() < 0.3) {
          g.arc(cx + (r() - 0.5) * s, cy + (r() - 0.5) * s, 2.5 + r() * 5, r() * Math.PI, Math.PI * (0.8 + r()));
        } else {
          g.moveTo(cx + (r() - 0.5) * 2 * s, cy + (r() - 0.5) * 2 * s);
          g.lineTo(cx + (r() - 0.5) * 2 * s, cy + (r() - 0.5) * 2 * s);
        }
        g.stroke();
      }
      // a dot accent sells "writing system"
      if (r() < 0.5) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(cx + (r() - 0.5) * s, cy + s * 0.8, 1.8, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** Holo billboard: additive scan grid + glyph blocks + an abstract emblem. */
function holoTex(seed: number): THREE.CanvasTexture {
  const r = mulberry32(9000 + seed * 77);
  const t = canvasTex(256, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(77,216,230,0.28)";
    g.lineWidth = 1;
    for (let y = 8; y < h; y += 10) {
      g.beginPath();
      g.moveTo(6, y);
      g.lineTo(w - 6, y);
      g.stroke();
    }
    const cols = ["rgba(77,216,230,0.8)", "rgba(227,61,78,0.75)", "rgba(240,179,64,0.75)", "rgba(177,140,255,0.75)"];
    for (let i = 0; i < 26; i++) {
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(10 + r() * (w - 44), 10 + r() * (h - 26), 3 + r() * 18, 3 + r() * 6);
    }
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(w * (0.3 + r() * 0.4), h * 0.45, 16 + r() * 14, 0, Math.PI * 2);
    g.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Vehicle rear faces: taillight bars glowing crimson on charcoal bodywork. */
function carBackTex(kind: 0 | 1 | 2): THREE.CanvasTexture {
  return canvasTex(160, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = kind === 2 ? "#141720" : "#12151f";
    g.fillRect(6, 10, w - 12, h - 16);
    if (kind === 0) {
      // sedan: window band, trunk line, low wide taillights
      g.fillStyle = "#0a0c12";
      g.fillRect(22, 18, w - 44, 40);
      g.strokeStyle = "rgba(150,190,225,0.25)";
      g.lineWidth = 2;
      g.strokeRect(22, 18, w - 44, 40);
      g.fillStyle = "#0e1118";
      g.fillRect(6, 96, w - 12, 6);
      lightBar(g, 14, 104, 44, 12);
      lightBar(g, w - 58, 104, 44, 12);
    } else if (kind === 1) {
      // van: tall doors with a center seam, high taillights
      g.fillStyle = "#0e1118";
      g.fillRect(w / 2 - 2, 14, 4, h - 34);
      g.fillStyle = "#0a0c12";
      g.fillRect(20, 20, w - 40, 34);
      lightBar(g, 10, 26, 12, 46);
      lightBar(g, w - 22, 26, 12, 46);
    } else {
      // truck: container back with hazard chevrons + marker lights
      g.fillStyle = "#171a24";
      g.fillRect(10, 14, w - 20, h - 40);
      g.save();
      g.beginPath();
      g.rect(10, h - 56, w - 20, 26);
      g.clip();
      for (let x = -20; x < w + 20; x += 24) {
        g.fillStyle = "#f0b340";
        g.beginPath();
        g.moveTo(x, h - 30);
        g.lineTo(x + 12, h - 56);
        g.lineTo(x + 24, h - 56);
        g.lineTo(x + 12, h - 30);
        g.closePath();
        g.fill();
      }
      g.restore();
      for (let i = 0; i < 5; i++) lightBar(g, 20 + i * 28, 16, 10, 6);
      lightBar(g, 12, h - 22, 30, 10);
      lightBar(g, w - 42, h - 22, 30, 10);
    }
    // plate
    g.fillStyle = "#c9cfda";
    g.fillRect(w / 2 - 16, h - 26, 32, 12);
    function lightBar(gg: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number) {
      gg.shadowColor = CRIMSON;
      gg.shadowBlur = 14;
      gg.fillStyle = "#ff5a67";
      gg.fillRect(x, y, bw, bh);
      gg.shadowBlur = 0;
      gg.fillStyle = "rgba(255,255,255,0.5)";
      gg.fillRect(x + 2, y + 2, bw - 4, Math.max(2, bh * 0.25));
    }
  });
}

/** Shared soft gradient used for every reflection smear + light pools. */
function smearTex(): THREE.CanvasTexture {
  return canvasTex(64, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Radial glow: shadows, headlight sprites. */
function glowTex(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.3, "rgba(255,244,214,0.7)");
    grad.addColorStop(1, "rgba(255,244,214,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function chevronTex(): THREE.CanvasTexture {
  const t = canvasTex(128, 256, (g, w) => {
    g.clearRect(0, 0, w, 256);
    g.shadowColor = ICE;
    g.shadowBlur = 16;
    g.fillStyle = "rgba(120,235,255,0.9)";
    for (let i = 0; i < 3; i++) {
      const y = 30 + i * 74;
      g.beginPath();
      g.moveTo(14, y + 34);
      g.lineTo(w / 2, y);
      g.lineTo(w - 14, y + 34);
      g.lineTo(w - 14, y + 54);
      g.lineTo(w / 2, y + 20);
      g.lineTo(14, y + 54);
      g.closePath();
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Barricade stripes for roadblock units. */
function barrierTex(): THREE.CanvasTexture {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = "#1a1e2b";
    g.fillRect(0, 0, w, h);
    for (let x = -h; x < w + h; x += 32) {
      g.fillStyle = "#e33d4e";
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, h);
      g.closePath();
      g.fill();
      g.fillStyle = "#e8ecf5";
      g.beginPath();
      g.moveTo(x + 16, h);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 48, 0);
      g.lineTo(x + 32, h);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "rgba(7,8,12,0.4)";
    g.fillRect(0, h - 10, w, 10);
  });
}

// ---- art slots: PNG at the path swaps the material map, 404 keeps the vector.
const ART_DIR = "/s4-art/games/extraction";
function tryArt(url: string, apply: (t: THREE.Texture) => void) {
  if (typeof window === "undefined") return;
  const img = new Image();
  img.onload = () => {
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    apply(t);
  };
  img.src = url;
}

// ---- 3D rig helpers ----------------------------------------------------------
/** Cylinder limb from a to b (pivot at a); the cheap IK the rigs run on. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r, r * 0.85, len, 8);
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a);
  m.lookAt(b);
  m.rotateX(-Math.PI / 2); // cylinder -y now points at b
  return m;
}

interface HeroRig {
  grp: THREE.Group;
  forkGrp: THREE.Group;
  armR: THREE.Group;
  pony: { m: THREE.Mesh; base: THREE.Vector3 }[];
  flap: THREE.Mesh;
  chain: THREE.Mesh[];
  chainMat: THREE.MeshBasicMaterial;
  ribbonGrp: THREE.Group;
  ribbonMat: THREE.MeshBasicMaterial;
  flame: THREE.Mesh;
  flameMat: THREE.MeshBasicMaterial;
}

/** The Agency girl on her sport bike, all primitives + emissive trim. Built in
 *  bike space: -z is forward, y up; the group itself banks/steers/blinks. */
function buildHero(smear: THREE.Texture, glow: THREE.Texture): HeroRig {
  const grp = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x151a28, metalness: 0.7, roughness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b0d14, metalness: 0.4, roughness: 0.6 });
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0x1a1e2e, metalness: 0.2, roughness: 0.55 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2a1320, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe3aa7e, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x241536, roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x10131f, roughness: 0.6 });
  const iceMat = new THREE.MeshBasicMaterial({ color: 0x7deeff });
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xf0b340 });
  const crimMat = new THREE.MeshBasicMaterial({ color: 0xff4757 });

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    grp.add(m);
    return m;
  };
  const wheel = (parent: THREE.Object3D, z: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.15, 18), darkMat);
    m.rotation.z = Math.PI / 2;
    m.position.set(0, 0.34, z);
    parent.add(m);
  };

  // ---- the sport bike
  wheel(grp, 0.72); // rear
  box(0.34, 0.3, 1.3, frameMat, 0, 0.52, 0); // frame
  box(0.4, 0.26, 0.52, frameMat, 0, 0.8, -0.24, 0.16); // tank
  box(0.36, 0.09, 0.5, darkMat, 0, 0.84, 0.3); // seat
  box(0.3, 0.15, 0.46, frameMat, 0, 0.9, 0.66, -0.2); // tail cowl
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.07), crimMat);
  tail.position.set(0, 0.94, 0.9);
  grp.add(tail);
  for (const s of [-1, 1]) {
    // exhausts, gold tipped
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 10), frameMat);
    ex.rotation.x = Math.PI / 2;
    ex.position.set(s * 0.19, 0.42, 0.5);
    grp.add(ex);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), goldMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(s * 0.19, 0.42, 0.82);
    grp.add(tip);
    // emissive frame trim
    box(0.02, 0.03, 1.0, iceMat, s * 0.185, 0.6, 0);
  }
  // front fork group: pivots at the head tube so it counter-steers
  const forkGrp = new THREE.Group();
  forkGrp.position.set(0, 0, -0.5);
  grp.add(forkGrp);
  wheel(forkGrp, -0.36);
  for (const s of [-1, 1]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8), frameMat);
    tube.position.set(s * 0.09, 0.62, -0.18);
    tube.rotation.x = 0.42;
    forkGrp.add(tube);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), darkMat);
  bar.position.set(0, 1.02, 0.04);
  forkGrp.add(bar);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.1), frameMat);
  hl.position.set(0, 0.78, -0.3);
  forkGrp.add(hl);
  const hlFace = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), iceMat);
  hlFace.position.set(0, 0.78, -0.36);
  hlFace.rotation.y = Math.PI;
  forkGrp.add(hlFace);

  // ---- the rider (unmistakably her: ponytail out the cap, crop jacket, waist)
  box(0.4, 0.2, 0.34, pantsMat, 0, 1.0, 0.3); // hips on the seat
  // covered midriff (fitted top under the jacket) — the franchise modesty
  // rule has no exceptions, stylized rig or not
  box(0.3, 0.12, 0.22, jacketMat, 0, 1.11, 0.24);
  box(0.42, 0.05, 0.36, goldMat, 0, 1.04, 0.3); // gold belt
  const torsoGrp = new THREE.Group();
  torsoGrp.position.set(0, 1.3, 0.14);
  torsoGrp.rotation.x = -0.42; // leaned into the bars
  grp.add(torsoGrp);
  torsoGrp.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.22), jacketMat));
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.1), jacketMat);
  chest.position.set(0, 0.08, -0.13);
  torsoGrp.add(chest);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), iceMat);
  spine.position.set(0, 0, 0.12);
  torsoGrp.add(spine);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.24), crimMat);
  collar.position.set(0, 0.24, 0);
  torsoGrp.add(collar);
  // head + cap + the ponytail
  const headGrp = new THREE.Group();
  headGrp.position.set(0, 1.6, -0.04);
  grp.add(headGrp);
  headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), skinMat));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.1, 14), capMat);
  cap.position.y = 0.07;
  headGrp.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.16), capMat);
  brim.position.set(0, 0.05, -0.17);
  headGrp.add(brim);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), goldMat);
  badge.position.set(0, 0.07, 0.145);
  headGrp.add(badge);
  const pony: { m: THREE.Mesh; base: THREE.Vector3 }[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.075 - i * 0.013, 10, 8), hairMat);
    const base = new THREE.Vector3(0, 0.02 - i * 0.02, 0.17 + i * 0.11);
    m.position.copy(base);
    headGrp.add(m);
    pony.push({ m, base });
  }
  // arms: left rides the bars, right is the chain arm (pivots at the shoulder)
  const jacketArm = jacketMat;
  const shL = new THREE.Vector3(-0.17, 1.46, 0.06);
  const gripL = new THREE.Vector3(-0.28, 1.06, -0.44);
  grp.add(limb(shL, gripL, 0.048, jacketArm));
  const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), darkMat);
  gloveL.position.copy(gripL);
  grp.add(gloveL);
  const armR = new THREE.Group();
  armR.position.set(0.17, 1.46, 0.06);
  grp.add(armR);
  const gripR = new THREE.Vector3(0.28, 1.06, -0.44).sub(armR.position);
  armR.add(limb(new THREE.Vector3(0, 0, 0), gripR, 0.048, jacketArm));
  const gloveR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), darkMat);
  gloveR.position.copy(gripR);
  armR.add(gloveR);
  // legs to the pegs + trim boots
  for (const s of [-1, 1]) {
    const hip = new THREE.Vector3(s * 0.14, 1.0, 0.34);
    const knee = new THREE.Vector3(s * 0.21, 0.66, -0.06);
    const foot = new THREE.Vector3(s * 0.19, 0.42, 0.14);
    grp.add(limb(hip, knee, 0.07, pantsMat));
    grp.add(limb(knee, foot, 0.05, darkMat));
    box(0.09, 0.08, 0.2, darkMat, s * 0.19, 0.4, 0.1);
    box(0.095, 0.02, 0.21, iceMat, s * 0.19, 0.445, 0.1);
  }
  // jacket tail: a fluttering plane over the seat
  const flap = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x1a1e2e, side: THREE.DoubleSide, roughness: 0.6 }),
  );
  flap.position.set(0, 1.12, 0.38);
  flap.rotation.x = 0.6;
  grp.add(flap);

  // ---- the chain: 9 links repositioned every frame (dangle or swing arc)
  const chainMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(TIER_FLAME[0]) });
  const chain: THREE.Mesh[] = [];
  const linkGeo = new THREE.SphereGeometry(0.035, 6, 6);
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(linkGeo, chainMat);
    c.position.set(0.3, 1.0 - i * 0.05, 0.15);
    grp.add(c);
    chain.push(c);
  }
  // swing arc ribbon: a flat ring sector that flashes through the swipe
  const ribbonGrp = new THREE.Group();
  ribbonGrp.position.set(0, 1.05, 0);
  ribbonGrp.rotation.x = -Math.PI / 2;
  grp.add(ribbonGrp);
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(TIER_FLAME[0]),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ribbonGrp.add(new THREE.Mesh(new THREE.RingGeometry(0.55, 2.4, 24, 1, -0.7, 2.2), ribbonMat));

  // exhaust flame (aura ride-tier color; pulses on boost)
  const flameMat = new THREE.MeshBasicMaterial({
    map: smear,
    color: new THREE.Color(TIER_FLAME[0]),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.6), flameMat);
  flame.position.set(0, 0.46, 1.2);
  flame.rotation.x = -0.5;
  grp.add(flame);
  // soft shadow + ice underglow (depth cue + the cyberpunk sell)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 2.4),
    new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  grp.add(shadow);
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.9),
    new THREE.MeshBasicMaterial({ map: glow, color: 0x2fb4c8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = 0.03;
  grp.add(under);

  return { grp, forkGrp, armR, pony, flap, chain, chainMat, ribbonGrp, ribbonMat, flame, flameMat };
}

// ---- world types --------------------------------------------------------------
interface Car {
  grp: THREE.Group;
  smear: THREE.Mesh;
  z: number;
  baseX: number;
  wobA: number;
  wobF: number;
  wobP: number;
  spd: number;
  w: number;
  d: number;
  passed: boolean;
  active: boolean;
}
interface Block {
  grp: THREE.Group;
  units: THREE.Mesh[];
  bars: THREE.Mesh[];
  smear: THREE.Mesh;
  z: number;
  gapLo: number;
  gapHi: number;
  passed: boolean;
}
interface Strip {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  z: number;
  x: number;
  passed: boolean;
}
interface Sign {
  grp: THREE.Group;
  smear: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  smearMat: THREE.MeshBasicMaterial;
  z: number;
}
interface Lamp {
  grp: THREE.Group;
  z: number;
  side: number;
}
interface Holo {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  z: number;
}
type EnemyState = "off" | "approach" | "menace" | "retreat" | "spun";
interface Enemy {
  grp: THREE.Group;
  glowMat: THREE.SpriteMaterial;
  smear: THREE.Mesh;
  state: EnemyState;
  z: number;
  x: number;
  side: 1 | -1;
  wobP: number;
  menaceT: number;
  spinT: number;
}
interface Particles {
  pts: THREE.Points;
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  col: Float32Array;
  next: number;
}
interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  bike: THREE.Group; // = hero.grp (the banking root)
  hero: HeroRig;
  head: THREE.SpotLight;
  cone: THREE.Mesh;
  pool: THREE.Mesh;
  roadTex: THREE.Texture;
  builds: { m: THREE.Mesh; side: number }[];
  far: { m: THREE.Mesh; side: number }[];
  lamps: Lamp[];
  holos: Holo[];
  signs: Sign[];
  cars: Car[];
  enemies: Enemy[];
  blocks: Block[];
  strips: Strip[];
  rain: THREE.LineSegments;
  rainDrops: Float32Array; // x,y,z,len per drop
  streaks: THREE.Points;
  streakMat: THREE.PointsMaterial;
  parts: Particles;
  rng: () => number;
  layout: () => void;
  state: "idle" | "playing";
  t: number;
  speed: number;
  dist: number;
  score: number;
  chained: number;
  near: number;
  shoves: number;
  crashes: number;
  boostT: number;
  swingT: number;
  swingCd: number;
  swingCdMax: number;
  swingSide: 1 | -1;
  swingHit: boolean;
  swingReq: boolean;
  nextEnemyT: number;
  iframes: number;
  freeze: number;
  dieT: number;
  finishT: number;
  extracted: boolean;
  shake: number;
  lean: number;
  bikeX: number;
  fov: number;
  keyX: number;
  pjoyX: number;
  pjoyActive: boolean;
  // per-run stat multipliers (bounded by E)
  topMul: number;
  shoveRes: number;
  hitboxMul: number;
  chainPow: number;
  tier: number;
  resize: () => void;
}

// =============================================================================
export default function ExtractionGame() {
  const session = useS4Session();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const nonceRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const sfxRef = useRef<Sfx | null>(null);
  const tapRef = useRef({ t: 0, x: 0, y: 0, moved: 0, down: false });
  const onOverRef = useRef<(score: number, meta: Record<string, unknown>) => void>(() => {});

  // DOM-ref HUD (no React re-renders inside the run)
  const scoreElRef = useRef<HTMLSpanElement | null>(null);
  const chainElRef = useRef<HTMLSpanElement | null>(null);
  const shieldsElRef = useRef<HTMLSpanElement | null>(null);
  const speedElRef = useRef<HTMLSpanElement | null>(null);
  const tierElRef = useRef<HTMLSpanElement | null>(null);
  const timeBarRef = useRef<HTMLDivElement | null>(null);
  const swingFillRef = useRef<HTMLDivElement | null>(null);
  const swingTextRef = useRef<HTMLDivElement | null>(null);
  const boostFxRef = useRef<HTMLDivElement | null>(null);
  const floatWrapRef = useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = useState<"idle" | "playing" | "over">("idle");
  const [finalScore, setFinalScore] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [banking, setBanking] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [glFail, setGlFail] = useState(false);
  const [muted, setMuted] = useState(true);

  // ?practice=1 = free warm-up: no wallet gate, no server calls, nothing banks.
  const [practice, setPractice] = useState(false);
  useEffect(() => {
    setPractice(new URLSearchParams(window.location.search).get("practice") === "1");
  }, []);

  const rules = GAME_RULES[GAME];
  const floorMs = rules ? rules.floorMs : 30000;
  const attempts = rules ? rules.attempts : 3;

  const finish = useCallback(
    async (score: number, meta: Record<string, unknown>) => {
      setFinalScore(score);
      setPhase("over");
      if (practice) return; // nothing banks, nothing leaves the browser
      if (!session.token || !nonceRef.current) return;
      if (Date.now() - startedAtRef.current < floorMs) {
        setResult({ ok: false, error: "Too quick to count. Hold out a little longer next run." });
        return;
      }
      setBanking(true);
      const r = await submitScore(session.token, GAME, score, nonceRef.current, meta).catch(
        () => ({ ok: false, error: "Network hiccup. Your score did not bank." }) as ScoreResult,
      );
      setResult(r);
      setBanking(false);
    },
    [session.token, floorMs, practice],
  );
  onOverRef.current = finish;

  // ---- build the WebGL world once the gate opens (or immediately in practice)
  useEffect(() => {
    if ((!practice && !session.token) || !mountRef.current || worldRef.current) return;
    const mount = mountRef.current;
    let world: World;
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05060b);
      scene.fog = new THREE.FogExp2(FOGC, 0.016); // exponential fog eats the road

      const camera = new THREE.PerspectiveCamera(BASE_FOV, mount.clientWidth / mount.clientHeight, 0.1, 500);
      camera.position.set(0, CAM_Y, CAM_Z);
      camera.rotation.x = -0.1; // fixed gentle down-pitch; bank is rotation.z

      // cool ambient night + a moonlight rim so bodywork and the rider read
      scene.add(new THREE.AmbientLight(0x22304a, 1.1));
      const moon = new THREE.DirectionalLight(0x9fb6e0, 0.9);
      moon.position.set(-0.5, 1, 0.35);
      scene.add(moon);

      const smear = smearTex();
      const glowT = glowTex();

      // ---- flat wide road (standard material so the headlight pools on it)
      const roadTex = asphaltTex();
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(XB * 2 + 2.0, 600),
        new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.35, metalness: 0.55 }),
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0, -270);
      scene.add(road);
      // sidewalk aprons so the road ends at a curb, not a void
      for (const s of [-1, 1]) {
        const walk = new THREE.Mesh(
          new THREE.PlaneGeometry(3.4, 600),
          new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.8, metalness: 0.2 }),
        );
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(s * (XB + 2.7), 0.005, -270);
        scene.add(walk);
      }

      // ---- far skyline (fog-immune backdrop so the street has a horizon)
      const sky = new THREE.Mesh(
        new THREE.PlaneGeometry(320, 74),
        new THREE.MeshBasicMaterial({ map: skylineTex(), fog: false, depthWrite: false, transparent: true }),
      );
      sky.position.set(0, 22, -250);
      scene.add(sky);
      tryArt(`${ART_DIR}/skyline.png`, (t) => {
        (sky.material as THREE.MeshBasicMaterial).map = t;
        (sky.material as THREE.MeshBasicMaterial).needsUpdate = true;
      });

      // ---- border city, two 3D layers (depth = free parallax) --------------
      const winTex = [windowsTex(0), windowsTex(1), windowsTex(2)];
      const builds: { m: THREE.Mesh; side: number }[] = [];
      for (let i = 0; i < BUILD_N; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: winTex[i % 3] }));
        scene.add(m);
        builds.push({ m, side });
      }
      const farTexes = [farTex(0), farTex(1)];
      const far: { m: THREE.Mesh; side: number }[] = [];
      for (let i = 0; i < FAR_N; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshBasicMaterial({ map: farTexes[i % 2], color: 0x9aa6c8 }),
        );
        scene.add(m);
        far.push({ m, side });
      }

      // ---- streetlights: pole + arm + amber cone + a pool on the wet road
      const lamps: Lamp[] = [];
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.6, roughness: 0.5 });
      const amber = new THREE.Color(AMBER);
      for (let i = 0; i < LAMP_N; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const grp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.4, 8), poleMat);
        pole.position.set(side * (XB + 0.85), 2.2, 0);
        grp.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), poleMat);
        arm.position.set(side * (XB + 0.35), 4.36, 0);
        grp.add(arm);
        const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.14), new THREE.MeshBasicMaterial({ color: amber }));
        headBox.position.set(side * (XB - 0.15), 4.32, 0);
        grp.add(headBox);
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.5, 3.6, 16, 1, true),
          new THREE.MeshBasicMaterial({
            color: amber, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          }),
        );
        cone.position.set(side * (XB - 0.15), 2.5, 0);
        grp.add(cone);
        const pool = new THREE.Mesh(
          new THREE.PlaneGeometry(2.4, 4.4),
          new THREE.MeshBasicMaterial({ map: smear, color: amber, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(side * (XB - 0.15), 0.02, 0.6);
        grp.add(pool);
        scene.add(grp);
        lamps.push({ grp, z: -i * LAMP_GAP - 6, side });
      }

      // ---- holo billboards floating over the rooftops
      const holos: Holo[] = [];
      for (let i = 0; i < HOLO_N; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: holoTex(i), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), mat);
        scene.add(mesh);
        holos.push({ mesh, mat, z: -999 });
      }

      // ---- neon glyph signs + their wet reflections
      const signTexes: THREE.Texture[] = [];
      for (let i = 0; i < SIGN_N; i++) signTexes.push(glyphSignTex(i));
      const signs: Sign[] = [];
      for (let i = 0; i < SIGN_N; i++) {
        const v = signVertical(i);
        const wpx = v ? 1.5 : 3.0;
        const hpx = v ? 3.0 : 1.5;
        const mat = new THREE.MeshBasicMaterial({ map: signTexes[i], transparent: true });
        const glowMat = new THREE.MeshBasicMaterial({
          map: signTexes[i], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const grp = new THREE.Group();
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(wpx * 1.5, hpx * 1.5), glowMat);
        glow.position.z = -0.02;
        grp.add(glow);
        grp.add(new THREE.Mesh(new THREE.PlaneGeometry(wpx, hpx), mat));
        scene.add(grp);
        const smearMat = new THREE.MeshBasicMaterial({
          map: smear,
          color: new THREE.Color(SIGN_COLS[i % SIGN_COLS.length]),
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 8), smearMat);
        sm.rotation.x = -Math.PI / 2;
        sm.position.y = 0.02;
        scene.add(sm);
        signs.push({ grp, smear: sm, mat, glowMat, smearMat, z: -i * SIGN_GAP - 10 });
      }
      // sign art slots: a/b land on the first two vertical boards, c/d on the
      // first two horizontals (indices 0,2 vertical / 1,3 horizontal).
      const artIdx = [0, 2, 1, 3];
      ["a", "b", "c", "d"].forEach((s, i) => {
        tryArt(`${ART_DIR}/sign-${s}.png`, (t) => {
          const w = worldRef.current;
          if (!w) return;
          const sg = w.signs[artIdx[i]];
          sg.mat.map = t;
          sg.mat.needsUpdate = true;
          sg.glowMat.map = t;
          sg.glowMat.needsUpdate = true;
        });
      });

      // ---- traffic pool: 6 sedans, 4 vans, 2 trucks. Rear face carries the
      // texture (it is what the player sees); the body is a lit charcoal box.
      const kinds: (0 | 1 | 2)[] = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2];
      const backTex: THREE.CanvasTexture[] = [carBackTex(0), carBackTex(1), carBackTex(2)];
      const backMats = backTex.map((t) => new THREE.MeshBasicMaterial({ map: t, transparent: true }));
      (["car-back", "van-back", "truck-back"] as const).forEach((n, i) => {
        tryArt(`${ART_DIR}/${n}.png`, (t) => {
          backMats[i].map = t;
          backMats[i].needsUpdate = true;
        });
      });
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x141824, metalness: 0.6, roughness: 0.4 });
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4757 });
      const cars: Car[] = [];
      for (let i = 0; i < CAR_N; i++) {
        const kind = kinds[i];
        const dims = kind === 0 ? [2.0, 1.35, 3.6] : kind === 1 ? [2.3, 2.0, 4.4] : [2.5, 2.6, 6.0];
        const [cw, ch, cd] = dims;
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), bodyMat);
        body.position.y = ch / 2 + 0.12;
        grp.add(body);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), backMats[kind]);
        back.position.set(0, ch / 2 + 0.12, cd / 2 + 0.01);
        grp.add(back);
        // two extra emissive taillight nubs so the glow reads at distance
        for (const s of [-1, 1]) {
          const tl = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.28, 0.16), tailMat);
          tl.position.set((s * cw) / 3, ch * 0.42, cd / 2 + 0.02);
          grp.add(tl);
        }
        scene.add(grp);
        const smearMat = new THREE.MeshBasicMaterial({
          map: smear, color: new THREE.Color(CRIMSON), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.8, 6), smearMat);
        sm.rotation.x = -Math.PI / 2;
        sm.position.y = 0.02;
        scene.add(sm);
        cars.push({
          grp, smear: sm, z: -999, baseX: 0, wobA: 0, wobF: 0, wobP: 0,
          spd: 10, w: cw, d: cd, passed: false, active: false,
        });
      }

      // ---- enemy riders: dark goon rigs with warm headlight glow sprites ----
      const enemyFrameMat = new THREE.MeshStandardMaterial({ color: 0x1d1218, metalness: 0.6, roughness: 0.4 });
      const enemyDarkMat = new THREE.MeshStandardMaterial({ color: 0x0d0f16, metalness: 0.3, roughness: 0.7 });
      const enemyRiderMat = new THREE.MeshStandardMaterial({ color: 0x141019, roughness: 0.7 });
      const enemyVisorMat = new THREE.MeshBasicMaterial({ color: 0xff4757 });
      const enemies: Enemy[] = [];
      for (let i = 0; i < ENEMY_N; i++) {
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 1.5), enemyFrameMat);
        body.position.y = 0.52;
        grp.add(body);
        const hump = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.5), enemyFrameMat);
        hump.position.set(0, 0.72, -0.2);
        grp.add(hump);
        for (const wz of [-0.72, 0.72]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 14), enemyDarkMat);
          wh.rotation.z = Math.PI / 2;
          wh.position.set(0, 0.32, wz);
          grp.add(wh);
        }
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.22), enemyRiderMat);
        torso.position.set(0, 1.18, 0.14);
        torso.rotation.x = -0.4;
        grp.add(torso);
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), enemyDarkMat);
        helmet.position.set(0, 1.48, -0.02);
        grp.add(helmet);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.02), enemyVisorMat);
        visor.position.set(0, 1.48, -0.14);
        grp.add(visor);
        for (const s of [-1, 1]) {
          grp.add(limb(new THREE.Vector3(s * 0.15, 1.36, 0.08), new THREE.Vector3(s * 0.24, 0.98, -0.42), 0.045, enemyRiderMat));
        }
        const tl = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.06), tailMat);
        tl.position.set(0, 0.78, 0.78);
        grp.add(tl);
        // headlight: glow sprite (reads from any angle) + a faint cone forward
        const glowMat = new THREE.SpriteMaterial({
          map: glowT, color: 0xfff1d0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const spr = new THREE.Sprite(glowMat);
        spr.position.set(0, 0.68, -0.85);
        spr.scale.set(0.9, 0.9, 1);
        grp.add(spr);
        const eCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.9, 5, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xd8c9a0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        );
        eCone.rotation.x = Math.PI / 2;
        eCone.position.set(0, 0.6, -2.9);
        grp.add(eCone);
        grp.visible = false;
        scene.add(grp);
        const smearMat = new THREE.MeshBasicMaterial({
          map: smear, color: 0xd8c9a0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5), smearMat);
        sm.rotation.x = -Math.PI / 2;
        sm.position.y = 0.02;
        sm.visible = false;
        scene.add(sm);
        enemies.push({ grp, glowMat, smear: sm, state: "off", z: 999, x: 0, side: 1, wobP: 0, menaceT: 0, spinT: 0 });
      }

      // ---- roadblocks: 8 barricade units across the road; the gap hides 2-3.
      const barTexture = barrierTex();
      const barMat = new THREE.MeshStandardMaterial({ map: barTexture, roughness: 0.7, metalness: 0.2 });
      const lightIce = new THREE.MeshBasicMaterial({ color: 0x7deeff });
      const lightCrim = new THREE.MeshBasicMaterial({ color: 0xff4757 });
      const blocks: Block[] = [];
      for (let b = 0; b < BLOCK_N; b++) {
        const grp = new THREE.Group();
        const units: THREE.Mesh[] = [];
        const bars: THREE.Mesh[] = [];
        for (let i = 0; i < BLOCK_UNITS; i++) {
          const u = new THREE.Mesh(new THREE.BoxGeometry(UNIT_W * 0.94, 1.1, 0.5), barMat);
          u.position.set(-XB + (i + 0.5) * UNIT_W, 0.55, 0);
          grp.add(u);
          units.push(u);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(UNIT_W * 0.5, 0.14, 0.2), i % 2 === 0 ? lightIce : lightCrim);
          bar.position.set(u.position.x, 1.22, 0);
          grp.add(bar);
          bars.push(bar);
        }
        scene.add(grp);
        const smearMat = new THREE.MeshBasicMaterial({
          map: smear, color: new THREE.Color(ICE), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(XB * 2, 7), smearMat);
        sm.rotation.x = -Math.PI / 2;
        sm.position.y = 0.02;
        scene.add(sm);
        blocks.push({ grp, units, bars, smear: sm, z: -999, gapLo: -1.7, gapHi: 1.7, passed: false });
      }

      // ---- boost strips (glowing chevrons flat on the road, scroll animated)
      const strips: Strip[] = [];
      for (let i = 0; i < STRIP_N; i++) {
        const tex = chevronTex();
        const mat = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 5.2), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.03;
        scene.add(mesh);
        strips.push({ mesh, mat, z: -999, x: 0, passed: false });
      }

      // ---- the hero: the Agency girl on her bike, primitives + emissive trim
      const hero = buildHero(smear, glowT);
      hero.grp.position.set(0, 0, BIKE_Z);
      scene.add(hero.grp);

      // ---- headlight: real spot + a baked additive cone + a road pool so the
      // look holds even where physical light falls off
      const head = new THREE.SpotLight(0xcfeaff, 260, 70, 0.38, 0.6, 1.6);
      head.position.set(0, 1.1, BIKE_Z - 0.4);
      head.target.position.set(0, 0.3, -40);
      scene.add(head);
      scene.add(head.target);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(3.4, 26, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x9fd8e8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 1.0, BIKE_Z - 13.5);
      scene.add(cone);
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 16),
        new THREE.MeshBasicMaterial({
          map: smear, color: 0xbfe4f2, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(0, 0.025, BIKE_Z - 9);
      scene.add(pool);

      // ---- rain: slanted line streaks, brightest around the headlight cone
      const rainDrops = new Float32Array(RAIN_COUNT * 4); // x,y,z,len
      const rainPos = new Float32Array(RAIN_COUNT * 6);
      const rr = mulberry32(2026);
      for (let i = 0; i < RAIN_COUNT; i++) {
        rainDrops[i * 4] = (rr() - 0.5) * 26;
        rainDrops[i * 4 + 1] = rr() * 14;
        rainDrops[i * 4 + 2] = CAM_Z - rr() * 80;
        rainDrops[i * 4 + 3] = 0.45 + rr() * 0.5;
      }
      const rainGeo = new THREE.BufferGeometry();
      rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
      const rain = new THREE.LineSegments(
        rainGeo,
        new THREE.LineBasicMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending }),
      );
      scene.add(rain);

      // ---- forward speed streaks (rushing night air)
      const stGeo = new THREE.BufferGeometry();
      const stPos = new Float32Array(STREAK_N * 3);
      for (let i = 0; i < STREAK_N; i++) {
        stPos[i * 3] = (rr() - 0.5) * 40;
        stPos[i * 3 + 1] = rr() * 14;
        stPos[i * 3 + 2] = -rr() * 300;
      }
      stGeo.setAttribute("position", new THREE.BufferAttribute(stPos, 3));
      const streakMat = new THREE.PointsMaterial({
        color: 0xbcd8ff, size: 0.32, transparent: true, opacity: 0.4, sizeAttenuation: true,
      });
      const streaks = new THREE.Points(stGeo, streakMat);
      scene.add(streaks);

      // ---- particle pool (sparks, stars) — capped, additive
      const pPos = new Float32Array(PART_COUNT * 3);
      const pVel = new Float32Array(PART_COUNT * 3);
      const pLife = new Float32Array(PART_COUNT);
      const pCol = new Float32Array(PART_COUNT * 3);
      for (let i = 0; i < PART_COUNT; i++) pPos[i * 3 + 1] = -100; // parked
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
      pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
      const pts = new THREE.Points(
        pGeo,
        new THREE.PointsMaterial({
          size: 0.22, vertexColors: true, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        }),
      );
      scene.add(pts);
      const parts: Particles = { pts, pos: pPos, vel: pVel, life: pLife, col: pCol, next: 0 };

      const resize = () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", resize);

      world = {
        renderer, scene, camera, bike: hero.grp, hero, head, cone, pool,
        roadTex, builds, far, lamps, holos, signs, cars, enemies, blocks, strips,
        rain, rainDrops, streaks, streakMat, parts,
        rng: mulberry32(1), layout: () => {},
        state: "idle", t: 0, speed: BASE_SPEED * 0.55, dist: 0, score: 0,
        chained: 0, near: 0, shoves: 0, crashes: 0,
        boostT: 0, swingT: 0, swingCd: 0, swingCdMax: 1, swingSide: 1,
        swingHit: false, swingReq: false, nextEnemyT: 6,
        iframes: 0, freeze: 0,
        dieT: 0, finishT: 0, extracted: false, shake: 0, lean: 0, bikeX: 0,
        fov: BASE_FOV, keyX: 0, pjoyX: 0, pjoyActive: false,
        topMul: 1, shoveRes: 0, hitboxMul: 1, chainPow: 0, tier: 1,
        resize,
      };

      // ---- layout: EVERY per-run roll comes from w.rng (the nonce seed) ----
      world.layout = () => {
        const w = world;
        const rng = w.rng;
        // near buildings: staggered border blocks with re-rolled mass
        w.builds.forEach((b, i) => {
          const row = Math.floor(i / 2);
          const bw = 6 + rng() * 4.5;
          const bh = 8 + rng() * 17;
          const bd = 10 + rng() * 6;
          b.m.scale.set(bw, bh, bd);
          b.m.position.set(b.side * (XB + 4.6 + rng() * 3.2 + bw / 2), bh / 2, -row * BUILD_GAP - 8 - rng() * 5);
        });
        // far silhouettes: taller, darker, deeper (the parallax layer)
        w.far.forEach((b, i) => {
          const row = Math.floor(i / 2);
          const bw = 9 + rng() * 8;
          const bh = 18 + rng() * 26;
          const bd = 14 + rng() * 8;
          b.m.scale.set(bw, bh, bd);
          b.m.position.set(b.side * (XB + 14 + rng() * 8 + bw / 2), bh / 2, -row * FAR_GAP - 14 - rng() * 8);
        });
        // streetlights: fixed cadence, both curbs
        w.lamps.forEach((l, i) => {
          l.z = -i * LAMP_GAP - 6;
          l.grp.position.z = l.z;
        });
        // holo billboards: fresh side/height/order
        w.holos.forEach((h, i) => {
          const side = rng() < 0.5 ? -1 : 1;
          h.z = -30 - i * HOLO_GAP - rng() * 20;
          h.mesh.position.set(side * (XB + 6 + rng() * 4), 8.5 + rng() * 5, h.z);
          h.mesh.rotation.y = side * (0.35 + rng() * 0.25);
        });
        // neon signs: fresh side/height every run
        w.signs.forEach((s, i) => {
          const side = rng() < 0.5 ? -1 : 1;
          const y = 2.4 + rng() * 5.2;
          s.z = -i * SIGN_GAP - 10 - rng() * 8;
          s.grp.position.set(side * (XB + 3.0 + rng() * 2.2), y, s.z);
          s.grp.rotation.y = side * (0.5 + rng() * 0.35); // angled toward the road
          s.smear.position.set(side * (XB - 1.0), 0.02, s.z + 2.5);
          s.smear.scale.set(1, 1 + rng() * 0.6, 1);
        });
        // traffic: staggered start, everything about each car re-rolled
        let z = -30;
        w.cars.forEach((c, i) => {
          c.z = z;
          z -= 16 + rng() * 30;
          c.baseX = (rng() * 2 - 1) * (XB - 1.8);
          c.spd = 9 + rng() * 6;
          c.wobA = rng() < 0.55 ? 0.15 + rng() * 0.45 : 0;
          c.wobF = 0.4 + rng() * 0.7;
          c.wobP = rng() * Math.PI * 2;
          c.passed = false;
          c.active = i < 7; // density ramps +1 active car every 9s
          c.grp.visible = c.active;
          c.smear.visible = c.active;
        });
        // enemy riders: all parked; the spawner wakes them
        w.enemies.forEach((e) => {
          e.state = "off";
          e.grp.visible = false;
          e.smear.visible = false;
          e.z = 999;
        });
        w.nextEnemyT = 5 + rng() * 2;
        // roadblocks: seeded gap position + width
        w.blocks.forEach((b, i) => {
          b.z = -140 - i * (60 + rng() * 30);
          rollGap(b, rng);
        });
        // boost strips
        w.strips.forEach((s, i) => {
          s.z = -55 - i * (38 + rng() * 26);
          s.x = (rng() * 2 - 1) * (XB - 2.0);
          s.passed = false;
        });
      };

      // one decorative pass so the idle attract screen shows a dressed street
      // (begin() re-seeds from the run nonce and lays the REAL run out fresh)
      world.rng = mulberry32(0xbeefcafe);
      world.layout();

      worldRef.current = world;
    } catch {
      setGlFail(true);
      return;
    }

    // gap re-roll: hide 2-3 contiguous barricade units, that hole is the gap
    function rollGap(b: Block, rng: () => number) {
      const gapLen = rng() < 0.42 ? 3 : 2;
      const gapIdx = 1 + Math.floor(rng() * (BLOCK_UNITS - 1 - gapLen));
      for (let i = 0; i < BLOCK_UNITS; i++) {
        const inGap = i >= gapIdx && i < gapIdx + gapLen;
        b.units[i].visible = !inGap;
        b.bars[i].visible = !inGap;
      }
      b.gapLo = -XB + gapIdx * UNIT_W;
      b.gapHi = b.gapLo + gapLen * UNIT_W;
      b.passed = false;
    }

    // ---- score floaters (DOM; capped; CSS animation does the motion) -------
    const floater = (text: string, color: string, xFrac: number, big = false) => {
      const wrap = floatWrapRef.current;
      if (!wrap) return;
      while (wrap.childElementCount >= 10) wrap.removeChild(wrap.firstChild as Node);
      const el = document.createElement("div");
      el.className = "exfl";
      el.textContent = text;
      el.style.color = color;
      el.style.left = `${(0.5 + xFrac * 0.3) * 100}%`;
      el.style.top = big ? "30%" : "38%";
      if (big) el.style.fontSize = "26px";
      wrap.appendChild(el);
      window.setTimeout(() => {
        if (el.parentNode === wrap) wrap.removeChild(el);
      }, 980);
    };

    const burst = (x: number, y: number, z: number, n: number, color: number, spread: number, up: number) => {
      const w = worldRef.current;
      if (!w) return;
      const p = w.parts;
      const c = new THREE.Color(color);
      const count = REDUCED_MOTION ? Math.min(8, n) : n;
      for (let i = 0; i < count; i++) {
        const j = p.next;
        p.next = (p.next + 1) % PART_COUNT;
        p.pos[j * 3] = x;
        p.pos[j * 3 + 1] = y;
        p.pos[j * 3 + 2] = z;
        p.vel[j * 3] = (Math.random() - 0.5) * spread;
        p.vel[j * 3 + 1] = Math.random() * up + 0.5;
        p.vel[j * 3 + 2] = (Math.random() - 0.5) * spread + 2;
        p.life[j] = 0.5 + Math.random() * 0.4;
        p.col[j * 3] = c.r;
        p.col[j * 3 + 1] = c.g;
        p.col[j * 3 + 2] = c.b;
      }
    };

    // one crash path for traffic + roadblocks: speed loss (Armor-reduced),
    // knockback, shake, hit-stop, sparks; the 3rd crash starts slow-mo out.
    const crash = (hitX: number) => {
      const w = worldRef.current;
      if (!w) return;
      const loss = CRASH_LOSS * (1 - w.shoveRes);
      w.speed *= 1 - loss;
      const dir = w.bikeX >= hitX ? 1 : -1;
      w.bikeX = Math.max(-PX, Math.min(PX, w.bikeX + dir * CRASH_KNOCK * (1 - w.shoveRes)));
      w.iframes = IFRAMES;
      w.freeze = HIT_STOP;
      w.shake = REDUCED_MOTION ? 0 : 0.8;
      w.crashes += 1;
      burst(w.bikeX, 0.9, BIKE_Z, 26, 0xffb060, 6, 4);
      burst(w.bikeX, 0.9, BIKE_Z, 14, 0xff4757, 4, 3);
      if (w.crashes >= SHIELDS) {
        w.dieT = 0.9; // slow-mo out, then bank everything
        sfxRef.current?.play("ko");
      } else {
        sfxRef.current?.play("hurt");
      }
    };

    const loop = (now: number) => {
      const w = worldRef.current;
      if (!w) return;
      let dt = Math.min(0.05, (now - lastRef.current) / 1000 || 0);
      lastRef.current = now;

      // hit-stop: the world holds its breath for a few frames
      if (w.freeze > 0) {
        w.freeze -= dt;
        w.renderer.render(w.scene, w.camera);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (w.dieT > 0) dt *= 0.35; // final-crash slow-mo

      const playing = w.state === "playing";
      if (playing) {
        w.t += dt;
        // ---- speed: ramps the whole run (+~20 u/s by the buzzer, then Ride);
        // boost strips surge on top
        const targetSpeed = (BASE_SPEED + w.t * SPEED_RAMP) * w.topMul;
        const boostMul = w.boostT > 0 ? 1 + BOOST_BONUS : 1;
        const eff = targetSpeed * boostMul;
        const accel = (w.boostT > 0 ? 55 : 10) * dt;
        w.speed += Math.max(-accel * 4, Math.min(accel, eff - w.speed));
        if (w.boostT > 0) w.boostT -= dt;
        if (w.iframes > 0) w.iframes -= dt;

        // ---- steering: keys beat the joystick; velocity steer, hold your line
        const sx = w.keyX !== 0 ? w.keyX : w.pjoyActive ? w.pjoyX : 0;
        if (w.dieT <= 0 && w.finishT <= 0) {
          w.bikeX = Math.max(-PX, Math.min(PX, w.bikeX + sx * STEER_SPEED * dt));
        }
        w.lean += (sx - w.lean) * Math.min(1, 10 * dt);

        // ---- distance score
        w.dist += w.speed * dt;
        w.score += w.speed * dt * DIST_SCORE;

        // ---- run clock
        if (!w.extracted && w.dieT <= 0 && w.t >= RUN_SECONDS) {
          w.extracted = true;
          w.finishT = 1.1; // coast to the extraction point
          w.score += EXTRACT_BONUS;
          sfxRef.current?.play("score");
          floater(`EXTRACTED +${EXTRACT_BONUS}`, GOLD, w.bikeX / PX, true);
        }
        if (w.finishT > 0) {
          w.finishT -= dt;
          if (w.finishT <= 0) {
            w.state = "idle";
            onOverRef.current(Math.round(w.score), { v: 2, chained: w.chained, near: w.near, shoves: w.shoves, crashes: w.crashes });
          }
        }
        if (w.dieT > 0) {
          w.dieT -= dt;
          if (w.dieT <= 0) {
            w.state = "idle";
            onOverRef.current(Math.round(w.score), { v: 2, chained: w.chained, near: w.near, shoves: w.shoves, crashes: w.crashes, wrecked: true });
          }
        }
      } else {
        // idle attract: gentle cruise so the street breathes behind the overlay
        w.speed += (BASE_SPEED * 0.55 - w.speed) * Math.min(1, 2 * dt);
        w.lean *= 1 - Math.min(1, 4 * dt);
      }

      const mv = w.speed * dt; // world scroll this frame

      // ---- rider pose: bank, counter-steer fork, ponytail + jacket flutter
      w.bike.position.x = w.bikeX;
      w.bike.rotation.z = -w.lean * 0.5;
      w.bike.position.y = Math.sin(w.t * 22) * 0.012 * (w.speed / 40);
      w.hero.forkGrp.rotation.y = w.lean * 0.28;
      const windK = Math.min(1.4, w.speed / 34);
      w.hero.pony.forEach((p, i) => {
        const ph = w.t * (7 + i * 1.3) + i * 1.1;
        p.m.position.set(
          p.base.x - w.lean * 0.05 * (i + 1) + Math.sin(ph) * 0.012 * (i + 1),
          p.base.y + windK * 0.02 * (i + 1) + Math.sin(ph * 1.4) * 0.008 * (i + 1),
          p.base.z + windK * 0.018 * (i + 1),
        );
      });
      w.hero.flap.rotation.x = 0.55 + windK * 0.35 + Math.sin(w.t * 9) * 0.06 * windK;
      // i-frame blink (whole rig)
      w.bike.visible = !(w.iframes > 0 && Math.sin(w.t * 26) > 0.25);
      // exhaust flame: alive at speed, huge on boost, tier-colored
      const fl = w.boostT > 0 ? 0.95 : Math.min(0.35, w.speed / 140);
      w.hero.flameMat.opacity += (fl - w.hero.flameMat.opacity) * Math.min(1, 12 * dt);
      w.hero.flame.scale.y = 1 + (w.boostT > 0 ? 0.9 : 0.15) * Math.abs(Math.sin(w.t * 30));

      // ---- chain swing: pick a side, fling the arm, sweep the links --------
      if (w.swingCd > 0) w.swingCd -= dt;
      if (w.swingReq) {
        w.swingReq = false;
        if (playing && w.swingT <= 0 && w.swingCd <= 0 && w.dieT <= 0 && w.finishT <= 0) {
          let side: 1 | -1 = w.lean >= 0 ? 1 : -1;
          let best = Infinity;
          for (const e of w.enemies) {
            if (e.state === "off" || e.state === "spun") continue;
            const dxE = e.x - w.bikeX;
            if (Math.abs(e.z - BIKE_Z) < CHAIN_Z && Math.abs(dxE) < best) {
              best = Math.abs(dxE);
              side = dxE >= 0 ? 1 : -1;
            }
          }
          w.swingT = SWING_T;
          w.swingSide = side;
          w.swingHit = false;
          sfxRef.current?.play("fire");
        }
      }
      if (w.swingT > 0) {
        w.swingT -= dt;
        const p = 1 - Math.max(0, w.swingT) / SWING_T; // 0 -> 1 through the arc
        const side = w.swingSide;
        const reach = CHAIN_REACH * (1 + w.chainPow);
        // strike window: the meat of the arc
        if (playing && !w.swingHit && p > 0.3 && p < 0.8) {
          for (const e of w.enemies) {
            if (e.state === "off" || e.state === "spun") continue;
            const dxE = e.x - w.bikeX;
            if ((dxE >= 0 ? 1 : -1) !== side) continue;
            if (Math.abs(dxE) > reach + 0.7 || Math.abs(e.z - BIKE_Z) > CHAIN_Z) continue;
            // CHAINED: wobble + spin out. Cartoon sparks + stars, zero blood.
            w.swingHit = true;
            e.state = "spun";
            e.spinT = SPIN_T;
            w.chained += 1;
            w.score += CHAIN_SCORE;
            w.freeze = HIT_STOP; // the 50ms hit-stop
            w.shake = REDUCED_MOTION ? 0 : 0.4;
            w.swingCd = SWING_CD_HIT;
            w.swingCdMax = SWING_CD_HIT;
            sfxRef.current?.play("hit");
            burst(e.x, 1.2, e.z, 20, 0xf0b340, 5, 4);
            burst(e.x, 1.6, e.z, 8, 0xffffff, 3, 5);
            floater(`★ CHAINED +${CHAIN_SCORE}`, GOLD, w.bikeX / PX, true);
            break;
          }
        }
        if (w.swingT <= 0 && !w.swingHit) {
          w.swingCd = SWING_CD_MISS; // whiff
          w.swingCdMax = SWING_CD_MISS;
          sfxRef.current?.play("tap");
        }
        // the visible arc: arm fling + chain links sweeping behind -> side -> front
        const lift = Math.sin(p * Math.PI);
        w.hero.armR.rotation.z = -side * lift * 1.15;
        w.hero.armR.rotation.y = side * lift * 0.5;
        const th0 = 1.5 - p * 3.1;
        w.hero.chain.forEach((c, i) => {
          const th = th0 + i * 0.13;
          const r = 0.45 + i * 0.26 * (1 + w.chainPow * 0.6);
          c.position.set(side * Math.cos(th) * r, 1.12 + lift * 0.16 - i * 0.015, Math.sin(th) * r * 0.8);
        });
        const rs = 1 + w.chainPow * 0.4;
        w.hero.ribbonGrp.scale.set(side * rs, rs, 1);
        w.hero.ribbonMat.opacity = lift * (REDUCED_MOTION ? 0.3 : 0.55);
      } else {
        // chain at rest: a lazy dangle off her right hip (always visible = identity)
        w.hero.armR.rotation.z *= 1 - Math.min(1, 8 * dt);
        w.hero.armR.rotation.y *= 1 - Math.min(1, 8 * dt);
        w.hero.ribbonMat.opacity += (0 - w.hero.ribbonMat.opacity) * Math.min(1, 10 * dt);
        w.hero.chain.forEach((c, i) => {
          const f = i / (w.hero.chain.length - 1);
          c.position.set(
            0.3 + f * 0.12 + Math.sin(w.t * 3 + i * 0.8) * 0.03 * f,
            1.02 - f * 0.52,
            0.14 + f * 0.3,
          );
        });
      }

      // ---- camera: follow with lead, bank into the turn, FOV kick on boost
      const camTarget = w.bikeX * 0.88 + w.lean * 0.5;
      w.camera.position.x += (camTarget - w.camera.position.x) * Math.min(1, 8 * dt);
      if (w.shake > 0) {
        w.camera.position.x += (Math.random() - 0.5) * w.shake;
        w.camera.position.y = CAM_Y + (Math.random() - 0.5) * w.shake * 0.5;
        w.shake = Math.max(0, w.shake - dt * 1.6);
      } else {
        w.camera.position.y = CAM_Y;
      }
      w.camera.rotation.z = -w.lean * 0.14;
      const fovT =
        BASE_FOV +
        (w.boostT > 0 ? (REDUCED_MOTION ? 5 : 12) : 0) +
        Math.min(4, (w.speed - BASE_SPEED) * 0.12);
      w.fov += (fovT - w.fov) * Math.min(1, 6 * dt);
      if (Math.abs(w.fov - w.camera.fov) > 0.05) {
        w.camera.fov = w.fov;
        w.camera.updateProjectionMatrix();
      }
      // headlight + cone + pool track the bike
      w.head.position.x = w.bikeX;
      w.head.target.position.x = w.bikeX + w.lean * 6;
      w.cone.position.x = w.bikeX + w.lean * 1.6;
      w.cone.rotation.z = -w.lean * 0.2;
      w.pool.position.x = w.bikeX + w.lean * 2.2;

      // ---- road scroll (the asphalt itself streams past)
      w.roadTex.offset.y -= mv / 25;

      // ---- border city recycles down the street ----------------------------
      for (const b of w.builds) {
        b.m.position.z += mv;
        if (b.m.position.z - b.m.scale.z / 2 > CAM_Z + 6) {
          b.m.position.z -= (BUILD_N / 2) * BUILD_GAP;
          const bh = 8 + w.rng() * 17;
          b.m.scale.y = bh;
          b.m.position.y = bh / 2;
        }
      }
      for (const b of w.far) {
        b.m.position.z += mv;
        if (b.m.position.z - b.m.scale.z / 2 > CAM_Z + 8) {
          b.m.position.z -= (FAR_N / 2) * FAR_GAP;
          const bh = 18 + w.rng() * 26;
          b.m.scale.y = bh;
          b.m.position.y = bh / 2;
        }
      }
      for (const l of w.lamps) {
        l.z += mv;
        if (l.z > CAM_Z + 4) l.z -= LAMP_N * LAMP_GAP;
        l.grp.position.z = l.z;
      }
      for (const h of w.holos) {
        h.z += mv * 0.995; // a hair slower = drifting-hologram feel
        if (h.z > CAM_Z + 8) {
          const side = w.rng() < 0.5 ? -1 : 1;
          h.z -= HOLO_N * HOLO_GAP;
          h.mesh.position.x = side * (XB + 6 + w.rng() * 4);
          h.mesh.position.y = 8.5 + w.rng() * 5;
          h.mesh.rotation.y = side * (0.35 + w.rng() * 0.25);
        }
        h.mesh.position.z = h.z;
        if (h.mat.map) h.mat.map.offset.y = Math.sin(w.t * 0.7 + h.z * 0.05) * 0.04;
        h.mat.opacity = 0.45 + 0.15 * Math.sin(w.t * 2.2 + h.z);
      }
      for (const s of w.signs) {
        s.z += mv;
        if (s.z > CAM_Z + 6) {
          s.z -= SIGN_N * SIGN_GAP;
          const side = w.rng() < 0.5 ? -1 : 1;
          s.grp.position.x = side * (XB + 3.0 + w.rng() * 2.2);
          s.grp.position.y = 2.4 + w.rng() * 5.2;
          s.grp.rotation.y = side * (0.5 + w.rng() * 0.35);
          s.smear.position.x = side * (XB - 1.0);
        }
        s.grp.position.z = s.z;
        s.smear.position.z = s.z + 2.5;
        // signs shimmer on the wet road
        s.smearMat.opacity = 0.22 + 0.1 * Math.sin(w.t * 7 + s.z);
      }

      // ---- traffic: drive, wobble, collide, near-miss ----------------------
      const activeCars = Math.min(CAR_N, 7 + Math.floor(w.t / 9));
      w.cars.forEach((c, i) => {
        if (!c.active && i < activeCars) {
          c.active = true;
          c.grp.visible = true;
          c.smear.visible = true;
          c.z = Math.min(...w.cars.filter((x) => x.active).map((x) => x.z)) - (16 + w.rng() * 30);
        }
        if (!c.active) return;
        c.z += (w.speed - c.spd) * dt;
        const cx = c.baseX + (c.wobA ? Math.sin(w.t * c.wobF + c.wobP) * c.wobA : 0);
        c.grp.position.set(cx, 0, c.z);
        c.smear.position.set(cx, 0.02, c.z + c.d / 2 + 2.6);
        if (playing && w.dieT <= 0 && w.finishT <= 0) {
          const dz = c.z - BIKE_Z;
          const dx = cx - w.bikeX;
          // collision band (Gadgets slims the lateral hitbox)
          if (Math.abs(dz) < c.d / 2 + 1.0 && Math.abs(dx) < c.w / 2 + 0.5 * w.hitboxMul) {
            if (w.boostT > 0) {
              if (!c.passed) {
                c.passed = true;
                w.score += GHOST_SCORE;
                sfxRef.current?.play("tap");
                floater(`GHOSTED +${GHOST_SCORE}`, ICE, w.bikeX / PX);
                burst(w.bikeX, 1.0, BIKE_Z - 1, 10, 0x7deeff, 3, 2);
              }
            } else if (w.iframes <= 0) {
              c.passed = true;
              crash(cx);
            }
          } else if (!c.passed && dz > -0.2) {
            // crossed the bike's z clean: near miss if it was tight
            c.passed = true;
            if (Math.abs(dx) < c.w / 2 + 2.0) {
              w.near += 1;
              w.score += NEAR_SCORE;
              sfxRef.current?.play("tap");
              floater(`NEAR MISS +${NEAR_SCORE}`, "#e8ecf5", w.bikeX / PX);
            }
          }
        }
        if (c.z > CAM_Z + 8) {
          // recycle far ahead with a fresh seeded roll
          c.z = Math.min(...w.cars.filter((x) => x.active).map((x) => x.z)) - (16 + w.rng() * 30);
          c.baseX = (w.rng() * 2 - 1) * (XB - 1.8);
          c.spd = 9 + w.rng() * 6;
          c.wobA = w.rng() < 0.55 ? 0.15 + w.rng() * 0.45 : 0;
          c.wobF = 0.4 + w.rng() * 0.7;
          c.wobP = w.rng() * Math.PI * 2;
          c.passed = false;
        }
      });

      // ---- enemy riders: spawn behind, cruise up, menace, shove or get chained
      if (playing && w.dieT <= 0 && w.finishT <= 0) {
        w.nextEnemyT -= dt;
        const maxActive = w.t < 14 ? 1 : w.t < 34 ? 2 : 3;
        const active = w.enemies.filter((e) => e.state !== "off").length;
        if (w.nextEnemyT <= 0 && active < maxActive) {
          const e = w.enemies.find((x) => x.state === "off");
          if (e) {
            e.state = "approach";
            e.side = w.rng() < 0.5 ? -1 : 1;
            e.z = CAM_Z + 7; // behind the camera: it CRUISES UP into frame
            e.x = Math.max(-PX + 0.4, Math.min(PX - 0.4, w.bikeX + e.side * 2.6));
            e.wobP = w.rng() * Math.PI * 2;
            e.menaceT = MENACE_MIN + w.rng() * 1.3;
            e.spinT = 0;
            e.grp.visible = true;
            e.smear.visible = true;
            e.grp.rotation.set(0, 0, 0);
            sfxRef.current?.play("boost"); // the engine-rev telegraph
          }
          w.nextEnemyT = Math.max(2.6, 6.5 - w.t * 0.055) + w.rng() * 1.6;
        }
      }
      for (const e of w.enemies) {
        if (e.state === "off") continue;
        const targetX = Math.max(-PX + 0.3, Math.min(PX - 0.3, w.bikeX + e.side * KNIFE_X));
        if (e.state === "approach") {
          e.z += (0.3 - e.z) * Math.min(1, 1.7 * dt); // rubber-band to knife range
          e.x += (targetX - e.x) * Math.min(1, 2.4 * dt);
          e.glowMat.opacity = 0.8;
          if (Math.abs(e.z - 0.3) < 0.6) e.state = "menace";
        } else if (e.state === "menace") {
          e.z += (0.15 - e.z) * Math.min(1, 2 * dt);
          e.x += (targetX - e.x) * Math.min(1, 3 * dt) + Math.sin(w.t * 5 + e.wobP) * 0.15 * dt;
          e.menaceT -= dt;
          // headlight blink accelerates as the shove winds up
          e.glowMat.opacity = 0.55 + 0.45 * Math.sin(w.t * (6 + Math.max(0, 2 - e.menaceT) * 9));
          if (playing && e.menaceT <= 0 && w.dieT <= 0 && w.finishT <= 0) {
            if (Math.abs(e.x - w.bikeX) < (KNIFE_X + 0.9) * w.hitboxMul && Math.abs(e.z - BIKE_Z) < 2.2) {
              // SHOVE: speed loss + i-frames. Never instant death, no shield lost.
              if (w.iframes <= 0) {
                const res = 1 - w.shoveRes;
                w.speed *= 1 - SHOVE_LOSS * res;
                w.bikeX = Math.max(-PX, Math.min(PX, w.bikeX - e.side * SHOVE_KNOCK * res));
                w.iframes = IFRAMES;
                w.shake = REDUCED_MOTION ? 0 : 0.55;
                w.shoves += 1;
                sfxRef.current?.play("hurt");
                burst((e.x + w.bikeX) / 2, 1.1, BIKE_Z, 16, 0xff8090, 5, 3);
                floater("SHOVED", CRIMSON, w.bikeX / PX);
              }
              e.state = "retreat";
            } else {
              e.menaceT = 1.2 + w.rng(); // missed the window, line up again
            }
          }
        } else if (e.state === "retreat") {
          e.z += (CAM_Z + 9 - e.z) * Math.min(1, 1.2 * dt);
          e.x += (targetX - e.x) * Math.min(1, 0.8 * dt);
          e.glowMat.opacity = 0.7;
          if (e.z > CAM_Z + 6) {
            e.state = "off";
            e.grp.visible = false;
            e.smear.visible = false;
          }
        } else if (e.state === "spun") {
          // cartoon spin-out: pinwheel past the camera in sparks
          e.spinT -= dt;
          e.z += (11 + (SPIN_T - e.spinT) * 9) * dt;
          e.grp.rotation.y += 13 * dt;
          e.grp.rotation.z = Math.sin((SPIN_T - e.spinT) * 9) * 0.3;
          e.glowMat.opacity = Math.max(0, e.spinT / SPIN_T);
          if (Math.random() < 0.3) burst(e.x, 0.7, e.z, 3, 0xffd98a, 3, 2);
          if (e.spinT <= 0 || e.z > CAM_Z + 7) {
            e.state = "off";
            e.grp.visible = false;
            e.smear.visible = false;
          }
        }
        if (e.state !== "spun" && e.state !== "off") {
          e.grp.rotation.y = 0;
          e.grp.rotation.z = Math.max(-0.3, Math.min(0.3, (targetX - e.x) * 0.6));
        }
        e.grp.position.set(e.x, 0, e.z);
        e.smear.position.set(e.x, 0.02, e.z - 2.2);
      }

      // ---- roadblocks: thread the gap or eat a crash ------------------------
      for (const b of w.blocks) {
        b.z += mv;
        b.grp.position.z = b.z;
        b.smear.position.z = b.z + 3.2;
        // lightbars strobe ice/crimson
        const on = Math.floor(w.t * 3) % 2 === 0;
        b.bars.forEach((bar, i) => {
          bar.visible = b.units[i].visible && (i % 2 === 0 ? on : !on);
        });
        if (playing && !b.passed && b.z >= BIKE_Z && w.dieT <= 0 && w.finishT <= 0) {
          b.passed = true;
          const margin = 0.35 * w.hitboxMul; // Gadgets threads tighter gaps
          if (w.bikeX > b.gapLo + margin && w.bikeX < b.gapHi - margin) {
            w.score += THREAD_SCORE;
            sfxRef.current?.play("score");
            floater(`THREADED +${THREAD_SCORE}`, GOLD, w.bikeX / PX);
          } else if (w.iframes <= 0 && w.boostT <= 0) {
            crash(w.bikeX > (b.gapLo + b.gapHi) / 2 ? w.bikeX - 1 : w.bikeX + 1);
          }
        }
        if (b.z > CAM_Z + 6) {
          b.z = Math.min(...w.blocks.map((x) => x.z)) - (60 + w.rng() * 30);
          rollGap(b, w.rng);
        }
      }

      // ---- boost strips ------------------------------------------------------
      for (const s of w.strips) {
        s.z += mv;
        s.mesh.position.set(s.x, 0.03, s.z);
        if (s.mat.map) s.mat.map.offset.y -= dt * 1.6;
        if (playing && !s.passed && Math.abs(s.z - BIKE_Z) < 2.6 && Math.abs(s.x - w.bikeX) < 1.2 && w.dieT <= 0) {
          s.passed = true;
          w.boostT = Math.max(w.boostT, BOOST_T); // the free surge
          w.score += STRIP_SCORE;
          sfxRef.current?.play("boost");
          floater(`BOOST +${STRIP_SCORE}`, ICE, w.bikeX / PX);
          burst(w.bikeX, 0.4, BIKE_Z + 0.5, 14, 0x7deeff, 4, 3);
        }
        if (s.z > CAM_Z + 4) {
          s.z = Math.min(...w.strips.map((x) => x.z)) - (38 + w.rng() * 26);
          s.x = (w.rng() * 2 - 1) * (XB - 2.0);
          s.passed = false;
        }
      }

      // ---- rain --------------------------------------------------------------
      {
        const drops = w.rainDrops;
        const attr = w.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < RAIN_COUNT; i++) {
          let x = drops[i * 4];
          let y = drops[i * 4 + 1] - 22 * dt;
          let z = drops[i * 4 + 2] + mv * 0.55;
          const len = drops[i * 4 + 3];
          if (y < 0 || z > CAM_Z + 2) {
            x = w.bikeX + (Math.random() - 0.5) * 26;
            y = 8 + Math.random() * 8;
            z = CAM_Z - 4 - Math.random() * 80;
          }
          drops[i * 4] = x;
          drops[i * 4 + 1] = y;
          drops[i * 4 + 2] = z;
          arr[i * 6] = x;
          arr[i * 6 + 1] = y;
          arr[i * 6 + 2] = z;
          arr[i * 6 + 3] = x + 0.06;
          arr[i * 6 + 4] = y + len;
          arr[i * 6 + 5] = z - len * 0.5;
        }
        attr.needsUpdate = true;
      }

      // ---- speed streaks (brighter on boost = the tunnel-vision partner)
      {
        const attr = w.streaks.geometry.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 2] += mv * 1.6;
          if (arr[i + 2] > CAM_Z + 4) {
            arr[i + 2] -= 320;
            arr[i] = (Math.random() - 0.5) * 40;
            arr[i + 1] = Math.random() * 14;
          }
        }
        attr.needsUpdate = true;
        w.streakMat.opacity = Math.min(0.85, 0.18 + w.speed / 90 + (w.boostT > 0 ? 0.3 : 0));
      }

      // ---- particles -----------------------------------------------------------
      {
        const p = w.parts;
        const attr = p.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
        const cAttr = p.pts.geometry.getAttribute("color") as THREE.BufferAttribute;
        for (let i = 0; i < PART_COUNT; i++) {
          if (p.life[i] <= 0) continue;
          p.life[i] -= dt;
          if (p.life[i] <= 0) {
            p.pos[i * 3 + 1] = -100;
            continue;
          }
          p.vel[i * 3 + 1] -= 9 * dt;
          p.pos[i * 3] += p.vel[i * 3] * dt;
          p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt;
          p.pos[i * 3 + 2] += (p.vel[i * 3 + 2] + w.speed * 0.4) * dt;
          // additive fade: darken toward black as life runs out
          const f = Math.min(1, p.life[i] * 2.2);
          p.col[i * 3] *= 0.92 + f * 0.08;
          p.col[i * 3 + 1] *= 0.92 + f * 0.08;
          p.col[i * 3 + 2] *= 0.92 + f * 0.08;
        }
        attr.needsUpdate = true;
        cAttr.needsUpdate = true;
      }

      // ---- HUD (DOM refs; zero React) ---------------------------------------
      if (playing) {
        if (scoreElRef.current) scoreElRef.current.textContent = `${Math.round(w.score)}`;
        if (chainElRef.current) chainElRef.current.textContent = `⛓ ${w.chained}`;
        if (shieldsElRef.current)
          shieldsElRef.current.textContent = "▮".repeat(Math.max(0, SHIELDS - w.crashes)) + "▯".repeat(Math.min(SHIELDS, w.crashes));
        if (speedElRef.current) speedElRef.current.textContent = `${Math.round(w.speed * 4.4)} km/h`;
        if (timeBarRef.current)
          timeBarRef.current.style.width = `${Math.max(0, 100 - (w.t / RUN_SECONDS) * 100)}%`;
        if (swingFillRef.current) {
          if (w.swingT > 0) {
            swingFillRef.current.style.width = "100%";
            swingFillRef.current.style.background = GOLD;
          } else if (w.swingCd > 0) {
            swingFillRef.current.style.width = `${Math.round((1 - w.swingCd / w.swingCdMax) * 100)}%`;
            swingFillRef.current.style.background = "rgba(240,179,64,0.35)";
          } else {
            swingFillRef.current.style.width = "100%";
            swingFillRef.current.style.background = ICE;
          }
        }
        if (swingTextRef.current)
          swingTextRef.current.textContent = w.swingT > 0 ? "SWINGING" : w.swingCd > 0 ? "RECOVERING" : "TAP TO SWING";
        if (boostFxRef.current) {
          const target = w.boostT > 0 ? (REDUCED_MOTION ? 0.25 : 0.8) : 0;
          const cur = parseFloat(boostFxRef.current.style.opacity || "0");
          boostFxRef.current.style.opacity = `${cur + (target - cur) * Math.min(1, 10 * dt)}`;
        }
      }

      w.renderer.render(w.scene, w.camera);
      rafRef.current = requestAnimationFrame(loop);
    };
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      const w = worldRef.current;
      if (w) {
        window.removeEventListener("resize", w.resize);
        w.renderer.dispose();
        if (w.renderer.domElement.parentNode) w.renderer.domElement.parentNode.removeChild(w.renderer.domElement);
      }
      worldRef.current = null;
    };
  }, [session.token, practice]);

  // ---- begin a run: nonce -> seed -> fresh procedural layout -----------------
  const begin = useCallback(async () => {
    const w = worldRef.current;
    if (!w) return;
    // wake the sfx kit NOW, before any await: the AudioContext must be born
    // inside the click gesture or mobile autoplay policy leaves it suspended.
    // The player's own mute toggle always wins over this first-run unmute.
    if (!sfxRef.current) {
      sfxRef.current = createSfx(true);
      setMuted(false);
    }
    let stats: PlayerStats = ZERO_STATS;
    let seedStr: string;
    if (practice) {
      nonceRef.current = null; // zero server calls in practice
      seedStr = `practice-${Date.now()}-${Math.random()}`;
    } else {
      if (!session.token) return;
      setStartError(null);
      const rs: RunStartResult = await startRun(session.token, GAME).catch(() => ({ ok: false, error: "network" }));
      if (!rs.ok || !rs.nonce) {
        // a stale/expired token must bounce back to the sign-in gate
        if (/session expired|sign in|fresh run/i.test(rs.error || "")) {
          session.reset();
          return;
        }
        setStartError(rs.error || "Could not open a run. Try again.");
        return;
      }
      nonceRef.current = rs.nonce;
      if (rs.stats) stats = rs.stats;
      seedStr = rs.nonce;
    }

    // stats -> bounded run multipliers (display names: Armor/Ride/Gadgets/Weapon)
    w.shoveRes = Math.min(E.botox.cap, (stats.botox || 0) * E.botox.perLevel);
    w.topMul = 1 + Math.min(E.drugs.cap, (stats.drugs || 0) * E.drugs.perLevel);
    w.hitboxMul = 1 - Math.min(E.ozempic.cap, (stats.ozempic || 0) * E.ozempic.perLevel);
    w.chainPow = Math.min(E.aura.chainCap, (stats.aura || 0) * E.aura.chainPerLevel);
    w.tier = rideTier(stats.aura || 0);
    const tierCol = new THREE.Color(TIER_FLAME[w.tier - 1]);
    w.hero.flameMat.color = tierCol;
    w.hero.chainMat.color = tierCol.clone();
    w.hero.ribbonMat.color = tierCol.clone();
    if (tierElRef.current) tierElRef.current.textContent = TIER_NAMES[w.tier - 1];

    // seed EVERYTHING from the nonce; no two runs share a layout
    w.rng = mulberry32(xmur3(seedStr)());
    w.layout();

    startedAtRef.current = Date.now();
    w.t = 0;
    w.speed = BASE_SPEED * 0.7;
    w.dist = 0;
    w.score = 0;
    w.chained = 0;
    w.near = 0;
    w.shoves = 0;
    w.crashes = 0;
    w.boostT = 0;
    w.swingT = 0;
    w.swingCd = 0;
    w.swingCdMax = 1;
    w.swingSide = 1;
    w.swingHit = false;
    w.swingReq = false;
    w.iframes = 0;
    w.freeze = 0;
    w.dieT = 0;
    w.finishT = 0;
    w.extracted = false;
    w.shake = 0;
    w.lean = 0;
    w.bikeX = 0;
    w.keyX = 0;
    w.pjoyX = 0;
    w.pjoyActive = false;
    w.state = "playing";
    setResult(null);
    setPhase("playing");
  }, [session, practice]);

  // ---- pointer: relative joystick (x only) + quick tap = chain swing ---------
  const joy = (e: React.PointerEvent<HTMLDivElement>) => {
    const w = worldRef.current;
    const mount = mountRef.current;
    if (!w || !mount) return;
    const r = mount.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1; // -1..1 from center
    const a = Math.abs(nx);
    w.pjoyX = a < JOY_DEAD ? 0 : Math.sign(nx) * Math.min(1, (a - JOY_DEAD) / (JOY_RANGE - JOY_DEAD));
    w.pjoyActive = true;
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    tapRef.current = { t: performance.now(), x: e.clientX, y: e.clientY, moved: 0, down: true };
    joy(e);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const tp = tapRef.current;
    if (tp.down) tp.moved = Math.max(tp.moved, Math.hypot(e.clientX - tp.x, e.clientY - tp.y));
    joy(e);
  };
  const onUp = () => {
    const w = worldRef.current;
    const tp = tapRef.current;
    if (w && tp.down && performance.now() - tp.t < TAP_MAX_T * 1000 && tp.moved < TAP_MAX_MOVE) {
      w.swingReq = true; // the one-thumb chain swing
    }
    tp.down = false;
    if (w) w.pjoyActive = false;
  };
  const onLeave = () => {
    const w = worldRef.current;
    tapRef.current.down = false;
    if (w) w.pjoyActive = false;
  };

  // ---- keyboard: A/D + arrows steer, Space/W/Up = chain swing -----------------
  useEffect(() => {
    const k = (down: boolean) => (e: KeyboardEvent) => {
      const w = worldRef.current;
      if (!w) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "ArrowLeft" || key === "a") w.keyX = down ? -1 : w.keyX < 0 ? 0 : w.keyX;
      else if (key === "ArrowRight" || key === "d") w.keyX = down ? 1 : w.keyX > 0 ? 0 : w.keyX;
      else if (key === " " || key === "ArrowUp" || key === "w") {
        if (down && !e.repeat) w.swingReq = true;
        if (key === " ") e.preventDefault();
      }
    };
    const kd = k(true);
    const ku = k(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const toggleMute = () => {
    if (!sfxRef.current) sfxRef.current = createSfx(false);
    const m = !muted;
    sfxRef.current.setMuted(m);
    setMuted(m);
  };

  // ---- page chrome + HUD -----------------------------------------------------
  const arena = (
    <>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #1c2236",
          background: "#05070f",
        }}
      >
        <div
          ref={mountRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onLeave}
          style={{ width: "100%", height: "100%", touchAction: "none", cursor: phase === "playing" ? "crosshair" : "default" }}
        />
        {/* boost tunnel-vision (opacity driven from the loop) */}
        <div
          ref={boostFxRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(77,216,230,0.22) 74%, rgba(227,61,78,0.16) 100%)",
          }}
        />
        {/* faint scanlines: the VHS-anime era filter (static, motion-safe) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.05,
            background: "repeating-linear-gradient(0deg, #000 0px, #000 1px, transparent 1px, transparent 3px)",
          }}
        />
        {/* time remaining */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.08)", pointerEvents: "none" }}>
          <div ref={timeBarRef} style={{ height: "100%", width: "100%", background: GOLD, transition: "width 0.2s linear" }} />
        </div>
        {/* HUD: score + chained left, shields + mute right, swing pill bottom */}
        <div style={{ position: "absolute", top: 12, left: 14, pointerEvents: "none", textShadow: "0 1px 4px #000" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
            <span ref={scoreElRef}>0</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginTop: 4 }}>
            <span ref={chainElRef}>⛓ 0</span>
          </div>
        </div>
        {/* pointerEvents none on the wrapper so corner drags still steer; the
            mute button alone opts back in */}
        <div style={{ position: "absolute", top: 12, right: 14, textAlign: "right", pointerEvents: "none" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: CRIMSON, letterSpacing: 2, textShadow: "0 1px 4px #000" }}>
            <span ref={shieldsElRef}>▮▮▮</span>
          </div>
          <button
            onClick={toggleMute}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            style={{
              pointerEvents: "auto",
              marginTop: 6,
              padding: "3px 9px",
              fontSize: 13,
              background: "rgba(10,13,22,0.7)",
              color: muted ? "#8b95ad" : ICE,
              border: "1px solid #232a3d",
              borderRadius: 7,
              cursor: "pointer",
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
        <div style={{ position: "absolute", bottom: 40, left: 14, pointerEvents: "none", textShadow: "0 1px 4px #000" }}>
          <span ref={tierElRef} style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: ICE, textTransform: "uppercase" }} />
        </div>
        <div style={{ position: "absolute", bottom: 40, right: 14, pointerEvents: "none", textShadow: "0 1px 4px #000" }}>
          <span ref={speedElRef} style={{ fontSize: 12, fontWeight: 700, color: "#8b95ad" }} />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            width: 150,
            pointerEvents: "none",
            textAlign: "center",
          }}
        >
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div ref={swingFillRef} style={{ height: "100%", width: "100%", background: ICE }} />
          </div>
          <div ref={swingTextRef} style={{ marginTop: 3, fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#aeb6c8" }}>
            TAP TO SWING
          </div>
        </div>
        {/* score floaters live here */}
        <div ref={floatWrapRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} />

        {phase !== "playing" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              background: "rgba(5,7,15,0.72)",
              textAlign: "center",
              padding: 24,
            }}
          >
            {practice && (
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(94,234,212,0.5)",
                  color: "#5eead4",
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Practice, nothing banked
              </div>
            )}
            {phase === "over" && (
              <>
                <div style={{ fontSize: 14, color: "#aeb6c8", letterSpacing: 2, textTransform: "uppercase" }}>Run over</div>
                <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{finalScore}</div>
                {practice ? (
                  <div style={{ color: "#8b95ad", fontSize: 14 }}>Practice run. Nothing was saved.</div>
                ) : banking ? (
                  <div style={{ color: "#aeb6c8", fontSize: 14 }}>Banking…</div>
                ) : result?.ok ? (
                  <div style={{ color: "#86f0c4", fontSize: 14, lineHeight: 1.5 }}>
                    +{result.credits ?? 0} {THEME.playCurrency}
                    {(result.points ?? 0) > 0 ? ` · +${result.points} ${THEME.points}` : ""}
                    <br />
                    <span style={{ color: "#8b95ad" }}>
                      {result.improved ? "New daily best!" : "No improvement on today's best."} ·{" "}
                      {result.attemptsLeft ?? 0} run{(result.attemptsLeft ?? 0) === 1 ? "" : "s"} left today
                    </span>
                  </div>
                ) : result?.already ? (
                  <div style={{ color: "#8b95ad", fontSize: 14 }}>That was your last run today. Come back tomorrow.</div>
                ) : result?.error ? (
                  <div style={{ color: "#f8b37a", fontSize: 13, lineHeight: 1.5 }}>{result.error}</div>
                ) : null}
              </>
            )}
            {phase === "idle" && (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>Extraction</div>
                <p style={{ fontSize: 13.5, color: "#aeb6c8", lineHeight: 1.55, margin: "0 0 6px", maxWidth: 320 }}>
                  Night ride through the neon quarter. Slide to steer. When a rider cruises up beside you, quick tap to
                  swing your chain and spin them out. Weave the traffic, thread the roadblocks, ride the boost strips.
                  Shoves and crashes cost speed, three crashes ends the run. Keys: A/D steer, Space swings.
                </p>
                {glFail && (
                  <div style={{ color: "#f8b37a", fontSize: 12.5 }}>
                    3D could not start on this device. Try another browser.
                  </div>
                )}
              </>
            )}
            <button
              onClick={begin}
              style={{
                marginTop: 4,
                padding: "13px 30px",
                background: ACCENT,
                color: "#1a1205",
                border: "none",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {phase === "over" ? "Ride again" : "Start the run"}
            </button>
            {startError && <div style={{ color: "#f87171", fontSize: 13 }}>{startError}</div>}
          </div>
        )}
      </div>
      <p style={{ color: "#5b6478", fontSize: 12, marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
        {practice
          ? "Practice arena. Scores here never save and never bank."
          : `Best of ${attempts} runs a day counts. Runs earn ${THEME.playCurrency} plus a little ${THEME.points} for your ${THEME.team.singular}.`}
        <br />
        {/* plain <a>, not <Link>: the practice flag is read once on page load */}
        {practice ? (
          <a href={`/s4/games/${GAME}`} style={{ color: "#8b95ad" }}>
            Ready to ride for real?
          </a>
        ) : (
          <a href={`/s4/games/${GAME}?practice=1`} style={{ color: "#8b95ad" }}>
            Warm up in practice mode
          </a>
        )}
      </p>
    </>
  );

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(900px 500px at 50% -10%, #131a2e 0%, #060912 60%)",
        color: "#e8ecf5",
        padding: "106px 16px 56px", // 52 nav + 38 contract ticker (both fixed overlays) + breathing room
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        @keyframes exfloat {
          from { opacity: 1; transform: translate(-50%, 0) scale(1); }
          to { opacity: 0; transform: translate(-50%, -52px) scale(1.06); }
        }
        .exfl {
          position: absolute;
          font-weight: 800;
          font-size: 13px;
          letter-spacing: 0.08em;
          pointer-events: none;
          text-shadow: 0 1px 6px rgba(0,0,0,0.85);
          animation: exfloat 0.95s ease-out forwards;
          white-space: nowrap;
        }
      `}</style>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Link
            href="/s4/play"
            style={{
              color: "#cdd4e4",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
              // 44px hit area without moving the header row
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              padding: "0 10px",
              margin: "-11px 0 -11px -10px",
            }}
          >
            ‹ Games
          </Link>
          <span style={{ fontSize: 12, letterSpacing: 2, color: ACCENT, textTransform: "uppercase", fontWeight: 700 }}>
            Extraction
          </span>
        </div>

        {practice ? arena : <SessionGate session={session}>{arena}</SessionGate>}
      </div>
    </main>
  );
}
