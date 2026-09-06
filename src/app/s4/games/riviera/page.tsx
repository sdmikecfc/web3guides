/**
 * SEASON 4 · THE HIT LIST — 🤠 STAMPEDE (game key: "riviera")
 * A 60 second frontier-town shootout shmup. Golden hour on a dusty main
 * street: you RIDE a bounty huntress on horseback up the town while outlaw
 * riders sweep in from behind, foot cowboys strafe in squads ahead, saloon
 * fronts scroll past with gunmen popping out of the windows, and big covered
 * SHOOTER WAGONS bristling with rifles roll in as the heavies. She fires ON
 * HER OWN at the nearest threat, so the player's whole job is riding: weave
 * the outlaw fire, clear every saloon window before the building slides past
 * for a chain multiplier, topple WATER TOWERS for bonus points and a heart,
 * and scoop the shape-coded pickups. Cartoon-KO everything: hats fly, dizzy
 * stars orbit, gunmen duck away, wagons break down. Zero blood, no one dies.
 * DNF-safe: hits cost hearts and gallop speed, never the run outright; the
 * 60s clock always banks what you earned, and only losing all 4 hearts ends
 * a run early (she is BUCKED OFF, dazed, not dead).
 *
 * ⚠️ DISPLAY NAME RENAME NEEDED (do NOT rename the key): this page's local
 * strings now say "Stampede", but the registry display name in
 * src/lib/s4/games.ts (GAMES entry key "riviera", name "Riviera Run") plus
 * the arcade card in src/app/s4/landing.tsx and the two MapIntro dialogue
 * lines that list the arcade slate still say "Riviera Run" and must follow
 * in their own edit. The key "riviera" is internal + stable forever and is
 * never player-visible; only display names reskin.
 *
 * CONTROLS (one thumb first)
 * - Touch / mouse: press and HOLD anywhere and the horse eases toward a point
 *   ~64px ABOVE your finger (raid's FOLLOW=17 ease + roam band, plus the lift
 *   so the thumb never covers the horse). It only steers WHILE touching.
 * - Keyboard: WASD / arrows = 8-way roam. No action buttons anywhere: the
 *   huntress auto-fires at the nearest threat.
 * - The only tappable chrome is the small MUTE toggle circle (bottom-right).
 *   A press that starts inside it never steers the horse.
 *
 * SCORING (server clamps everything; balance here is purely feel)
 * - Saloon CLEARED (all 3 windows boarded before it scrolls off): 150 x chain
 *   (chain caps at x8). A saloon escaping un-cleared, or taking a hit,
 *   breaks the chain. Each window boarded also pays 40.
 * - Water tower toppled 260 (+ it always drops a heart) · foot cowboy 90 ·
 *   outlaw rider 240 · shooter wagon 650 (60ms hit-stop + the big floater).
 * - Heart pickup +80 when hearts are full · ammo pickup +120 · spread +100 ·
 *   distance trickle the whole run · +400 for riding out the full 60s.
 * Tuned to land in the same band as the old boat run (~14,000-16,800 full
 * runs) so the registry rules (maxScore 25000, /220 credits) stay honest.
 *
 * STAT BASELINE (ADR-0004; display names Armor/Ride/Gadgets/Weapon)
 * Numbers live in STAT_EFFECTS.riviera in lib/s4/games.ts (the one shared
 * place stat math is defined). Every effect is bounded <= ~25% advantage:
 * - botox (Armor):   hit knock resistance, -6%/lvl of the speed loss, cap 24%.
 * - drugs (Ride):    gallop + scroll speed, +4%/lvl, cap 16%.
 * - ozempic (Gadgets): evasion, 5%/lvl chance an enemy shot whiffs, cap 20%.
 * - aura (Weapon):   +0.8%/lvl her damage, cap 24%, plus the weapon ladder
 *   (thresholds 1/5/10/20/30): Rusty Six-Gun / Peacemaker / Twin Six-Shooters
 *   / Golden Colt / Gatling Gun — each tier raises her STARTING gun level
 *   (0/0/1/1/2 of 4), never the max.
 *
 * PROCEDURAL RANDOMNESS: every gameplay roll (spawns, window pop timing, drop
 * rolls, evade rolls, street dressing) comes from ONE mulberry32 stream
 * seeded per run from a hashed entropy string (the engine does not expose the
 * run nonce to init — same per-run-unique approach as slayer/waverider), so
 * no two runs share a layout and nothing is replayable. Math.random touches
 * only non-gameplay visual jitter (screenshake offsets), like the donor game.
 *
 * ART SLOTS (try-image-else-vector; real art drops in with zero code change)
 * /public/s4-art/games/riviera/   (folder follows the KEY, not the name)
 *   horse.png     player huntress on horseback, drawn FACING UP
 *   rider.png     outlaw on horseback, drawn FACING UP (it chases you)
 *   cowboy.png    foot cowboy, top-down
 *   wagon.png     covered shooter wagon + team, top-down, FACING UP
 *   saloon.png    saloon front (portrait, ~1:2 w:h)
 *   tower.png     water tower, top-down
 *   heart.png     heart pickup
 *   ammo.png      ammo crate pickup
 *   spread.png    spread-shot pickup
 *
 * QUALITY FLOOR (ADR-0020): living layered ground (packed-dirt street with
 * wheel ruts, pebbles, grass tufts + golden dust motes), a frontier edge
 * strip with its own 3-layer parallax (mesa horizon / desert scrub / plank
 * boardwalk + hitching posts), golden-hour light (sun wash from the west,
 * LONG shadows under every entity), heat shimmer over the street, dust
 * kicked by hooves, muzzle smoke, tumbleweeds, camera personality (lean tilt
 * with lateral velocity + zoom pulse + shake), juice on every hit (hit-stop
 * 35-60ms, particle bursts capped 220, score floaters, flying hats).
 * prefers-reduced-motion gates shake, lean, zoom, shimmer, twinkle and the
 * dense particles. Cartoon-KO only: buildings get boarded up, towers spill
 * water, wagons break down, people see stars — nobody bleeds.
 *
 * PRACTICE: /s4/games/riviera?practice=1 = zero server calls, nothing banks.
 * DEBUG: ?debug=1 mirrors sim numbers onto window.__st each step (QA only).
 */
"use client";

import { useEffect, useState } from "react";
import { GameShell, type GameHandle } from "../_shared/engine";
import { createSfx } from "../_shared/sfx";
import { STAT_EFFECTS } from "@/lib/s4/games";

// ── stat effects (the shared registry entry; nothing else defines stat math) ──
const STAMPEDE_STATS = STAT_EFFECTS.riviera; // keyed by the stable game key
const WEAPON_NAMES = ["Rusty Six-Gun", "Peacemaker", "Twin Six-Shooters", "Golden Colt", "Gatling Gun"];
const TIER_START_GUN = [0, 0, 1, 1, 2]; // starting gun level by weapon tier (max level is 4)

// ── tuning ────────────────────────────────────────────────────────────────────
const RUN_SECONDS = 60;
const END_HOLD = 1.4; // coast under the SUNSET RIDE / BUCKED OFF banner
const GRACE = 1.3; // spawn + invulnerability grace at the start

const FOLLOW = 17; // pointer-follow ease (the donor's proven feel)
const FINGER_LIFT = 64; // the horse rides this far ABOVE the finger
const KEY_SPEED = 340; // 8-way roam px/s before Ride
const PX_MARGIN = 34; // right clamp leaves room for the boardwalk strip
const PY_MIN = 0.14, PY_MAX = 0.9; // roam band (fraction of H)

const BASE_SCROLL = 150, SCROLL_RAMP = 1.3; // world flow px/s (up the street)
const THROTTLE_RECOVER = 0.22; // per second back toward full gallop
const HIT_THROTTLE_LOSS = 0.55; // fraction of gallop a hit costs, before Armor

const HEARTS = 4;
const INVULN = 1.8;
const SPREAD_SECS = 7; // spread-shot pickup duration

const GUN_MAX = 5; // gun levels 0..4
const FIRE_INT = [0.34, 0.28, 0.23, 0.19, 0.15]; // by gun level
const BULLET_SP = 640;
const EBULLET_SP = 200; // slow enough to weave — readable, not bullet hell
const EBULLET_CAP = 26; // the donor's hard readability cap

const RIDER_CAP = 3, FOOT_CAP = 5, WAGON_CAP = 1, TUMBLE_CAP = 3;
const SALOON_H = 96, SALOON_W = 46, SALOON_ONSCREEN_CAP = 2;
const TOWER_ONSCREEN_CAP = 2, TOWER_HP = 3;
const WAGON_HP = 11;

const SALOON_PTS = 150, CHAIN_CAP = 8, WINDOW_PTS = 40;
const FOOT_PTS = 90, RIDER_PTS = 240, WAGON_PTS = 650, TOWER_PTS = 260;
const HEART_FULL_PTS = 80, AMMO_PTS = 120, SPREAD_PTS = 100;
const DIST_SCORE = 0.055; // score per px scrolled

const PART_CAP = 220;
const PLAYER_R = 14;

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEBUG = typeof window !== "undefined" && /[?&]debug=1/.test(window.location.search);

// ── palette (charcoal base + the golden-hour frontier kit; gold #f0b340) ──────
const CHARCOAL = "#07080c";
const CRIMSON = "#e33d4e"; // the FOE cue (player is gold, enemies crimson)
const GOLD = "#f0b340";
const ICE = "#4dd8e6"; // spread-shot + splash cue
const WHITE = "#ffffff";
const DIRT_MID = "#8a6544"; // packed street
const DIRT_DARK = "#694c30";
const DIRT_LIGHT = "#a3794b";
const SAND = "#c9a06a"; // edge strips
const WOOD = "#6e4526"; // facades, posts
const WOOD_DARK = "#462c17";
const PLANK = "#8a5a33"; // boardwalk + boarded windows
const MESA_FAR = "#3a1d12"; // horizon silhouettes
const MESA_RIM = "#b4643a"; // sun-lit mesa rims
const SCRUB = "#7d6a35"; // dry brush
const DUSTC = "rgba(224,192,140,0.55)"; // hoof dust
const SMOKE = "rgba(122,112,100,0.55)"; // muzzle smoke
const SHADOWC = "rgba(46,22,8,0.38)"; // long golden-hour shadows
const HEARTC = "#ff8fa8"; // heart pickup
const WATER = "#7ec8e0"; // tower splash
const RED = "#ff6a6a"; // enemy bullet hue (white core = luminance cue)

// ── art hooks ─────────────────────────────────────────────────────────────────
function img(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const i = new Image();
  i.src = src;
  return i;
}
const ART = {
  horse: img("/s4-art/games/riviera/horse.png"),
  rider: img("/s4-art/games/riviera/rider.png"),
  cowboy: img("/s4-art/games/riviera/cowboy.png"),
  wagon: img("/s4-art/games/riviera/wagon.png"),
  saloon: img("/s4-art/games/riviera/saloon.png"),
  tower: img("/s4-art/games/riviera/tower.png"),
  heart: img("/s4-art/games/riviera/heart.png"),
  ammo: img("/s4-art/games/riviera/ammo.png"),
  spread: img("/s4-art/games/riviera/spread.png"),
};
function ready(i: HTMLImageElement | null): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}
/** Sprite at x,y rotated by rot (art faces UP = -y), else the vector fallback. */
function spr(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  rot: number,
  fb: () => void,
) {
  if (ready(im)) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    const h = size * (im.naturalHeight / im.naturalWidth);
    ctx.drawImage(im, -size / 2, -h / 2, size, h);
    ctx.restore();
  } else fb();
}

// ── math ──────────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** xmur3 string hash -> 32-bit seed for mulberry32 (per-run entropy string). */
function hashStr(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
/** Deterministic 2D hash in [0,1) for texture grids (no per-frame RNG). */
function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

// ── sfx (shared kit; mute choice sticks per tab) ──────────────────────────────
const sfx = createSfx();
let userMuted: boolean | null = null; // null = never chose; Start click is the gesture

// ── state ─────────────────────────────────────────────────────────────────────
interface Rider {
  x: number; y: number; vx: number;
  holdY: number; // screen band it station-keeps in (behind you)
  hp: number; hpMax: number; // hp <= 0 = KO (dizzy spin + falls behind)
  fireCd: number; ph: number; t: number;
  spin: number; // spin accumulator once KO'd
}
interface Foot {
  x: number; y: number; t: number; ph: number; ph2: number;
  cx: number; cy: number; ax: number; ay: number; w1: number; w2: number; // strafe path
  hp: number; fireCd: number; // hp <= 0 = sat down seeing stars
  spin: number;
}
interface Win {
  dy: number; // offset from the saloon top
  boarded: boolean;
  pop: number; // gunman visible while > 0
  cd: number; // until the next pop
  fired: boolean; // one shot per pop
}
interface Saloon {
  side: -1 | 1; // -1 = left edge, 1 = right edge
  x: number; y: number; ph: number;
  sign: number; // hash pick for the sign text
  wins: Win[];
  cleared: boolean; missed: boolean;
}
interface Tower {
  side: -1 | 1;
  x: number; y: number; hp: number; ph: number; // hp <= 0 = collapsed (splash)
}
interface Wagon {
  x: number; y: number; t: number; ph: number;
  hp: number; hpMax: number; fireCd: number; flash: number;
  dead: boolean; spin: number;
}
interface Drop { x: number; y: number; kind: "heart" | "ammo" | "spread"; ph: number }
interface Bullet { x: number; y: number; vx: number; vy: number }
interface EB { x: number; y: number; vx: number; vy: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; life0: number; c: string; r: number }
interface Ring { x: number; y: number; r: number; vr: number; life: number; c: string }
interface Floater { x: number; y: number; txt: string; c: string; life: number; big?: boolean }
interface HoofPt { x: number; y: number; age: number }
interface Hat { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number }
interface Tumbleweed { x: number; y: number; vx: number; ph: number }
interface S {
  W: number; H: number;
  rng: () => number;
  dressSeed: number; // street/edge dressing hash key
  practice: boolean;
  // stat baseline (bounded by STAMPEDE_STATS at init)
  speedMul: number; // drugs
  knockSoak: number; // botox
  evade: number; // ozempic
  gunDmg: number; // aura %
  weaponTier: number; // aura ladder 1..5
  // run
  t: number; over: boolean; ending: boolean; endT: number;
  score: number; dist: number; scrollD: number; speed: number; throttle: number;
  freeze: number; // hit-stop
  // player
  px: number; py: number; pvx: number; pvy: number; bank: number; gallop: number;
  hearts: number; invuln: number; gun: number; fireCd: number; aimA: number; spreadT: number;
  // chain
  chain: number; saloonsCleared: number;
  // entities
  riders: Rider[]; foots: Foot[]; saloons: Saloon[]; towers: Tower[]; wagons: Wagon[];
  drops: Drop[]; bullets: Bullet[]; ebullets: EB[];
  parts: Particle[]; rings: Ring[]; floats: Floater[]; hoofs: HoofPt[]; hats: Hat[]; tumbles: Tumbleweed[];
  // spawn director
  riderCd: number; footCd: number; saloonCd: number; towerCd: number; wagonCd: number;
  tumbleCd: number; hoofCd: number; hoofN: number;
  // stats + DEBUG telemetry
  kills: number; footKills: number; towersDown: number; wagonsDown: number;
  ramHits: number; bulletHits: number;
  // camera + fx
  shake: number; flash: number; zoom: number;
  msg: string; msgT: number;
  // mute-button touch bookkeeping
  muteHeld: boolean; lastDown: boolean; downX: number; downY: number;
}

// ── fx helpers ────────────────────────────────────────────────────────────────
function burst(s: S, x: number, y: number, c: string, n: number, sp: number) {
  const cap = REDUCED_MOTION ? PART_CAP / 3 : PART_CAP;
  for (let i = 0; i < n && s.parts.length < cap; i++) {
    const a = s.rng() * Math.PI * 2;
    const v = sp * (0.4 + s.rng() * 0.8);
    const life = 0.4 + s.rng() * 0.4;
    s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, life0: life, c, r: 1.5 + s.rng() * 2.6 });
  }
}
function floater(s: S, x: number, y: number, txt: string, c: string, big = false) {
  if (s.floats.length < 22) s.floats.push({ x, y, txt, c, life: big ? 1.2 : 0.95, big });
}
function ring(s: S, x: number, y: number, c: string) {
  if (s.rings.length < 14) s.rings.push({ x, y, r: 10, vr: 210, life: 0.5, c });
}
function hitStop(s: S, sec: number) {
  s.freeze = Math.max(s.freeze, sec);
}
/** Cartoon KO: the hat pops off and tumbles. */
function hatFly(s: S, x: number, y: number) {
  if (s.hats.length >= 8) return;
  s.hats.push({
    x, y,
    vx: (s.rng() - 0.5) * 170,
    vy: -150 - s.rng() * 90,
    rot: s.rng() * 6.3,
    vr: (s.rng() - 0.5) * 11,
    life: 1.1,
  });
}
function muzzleSmoke(s: S, x: number, y: number) {
  if (s.parts.length >= (REDUCED_MOTION ? 60 : PART_CAP)) return;
  s.parts.push({
    x, y,
    vx: (s.rng() - 0.5) * 26, vy: -18 - s.rng() * 20,
    life: 0.5, life0: 0.5, c: SMOKE, r: 2.4 + s.rng() * 2.2,
  });
}

// ── field geometry (edge strips flank the street) ─────────────────────────────
function edgeW(w: number) {
  return Math.max(48, Math.min(72, w * 0.15)); // left strip (town side)
}
const RIGHT_W = 30; // right boardwalk strip
function fieldLeft(s: S) {
  return edgeW(s.W) + 18; // playfield starts right of the left boardwalk
}
function winX(sa: Saloon) {
  return sa.x + sa.side * -18; // windows face the street
}

// ── spawn director (all rolls off s.rng, the one seeded stream) ─────────────
function spawnRider(s: S) {
  if (s.riders.length >= RIDER_CAP) return;
  const x = fieldLeft(s) + 20 + s.rng() * (s.W - fieldLeft(s) - PX_MARGIN - 40);
  s.riders.push({
    x,
    y: s.H + 50,
    vx: (s.rng() - 0.5) * 60,
    holdY: s.H * (0.76 + s.rng() * 0.16),
    hp: 3.6, hpMax: 3.6,
    fireCd: 1.2 + s.rng() * 1.2,
    ph: s.rng() * 6.3,
    t: 0, spin: 0,
  });
}
function spawnFootSquad(s: S) {
  const n = Math.min(2 + (s.rng() < 0.45 ? 1 : 0), FOOT_CAP - s.foots.length);
  if (n <= 0) return;
  const fromLeft = s.rng() < 0.5;
  const fl = fieldLeft(s);
  const cy = s.H * (0.2 + s.rng() * 0.32);
  const cx = fl + (s.W - fl - PX_MARGIN) * (0.3 + s.rng() * 0.4);
  for (let i = 0; i < n; i++) {
    const ph = (fromLeft ? -Math.PI / 2 : Math.PI / 2) + i * 0.3;
    const ph2 = s.rng() * 6.3;
    const cxi = cx + (i - (n - 1) / 2) * 36;
    const cyi = cy + (s.rng() - 0.5) * 26;
    const ax = (s.W - fl) * (0.2 + s.rng() * 0.14);
    const ay = 18 + s.rng() * 26;
    s.foots.push({
      // spawn ON the strafe path (no pop-in teleport, the donor's drone trick)
      x: cxi + Math.sin(ph) * ax,
      y: cyi + Math.sin(ph2) * ay,
      t: 0, ph, ph2,
      cx: cxi, cy: cyi, ax, ay,
      w1: 0.5 + s.rng() * 0.4,
      w2: 1.4 + s.rng() * 1.2,
      hp: 1,
      fireCd: 2 + s.rng() * 1.6 + i * 0.5,
      spin: 0,
    });
  }
}
/** No two structures stack on the same edge near the top of the screen. */
function sideFree(s: S, side: -1 | 1) {
  for (const sa of s.saloons) if (sa.side === side && sa.y < SALOON_H * 1.3) return false;
  for (const t of s.towers) if (t.side === side && t.y < 150) return false;
  return true;
}
function spawnSaloon(s: S) {
  if (s.saloons.filter((sa) => sa.y < s.H).length >= SALOON_ONSCREEN_CAP) return;
  let side: -1 | 1 = s.rng() < 0.5 ? -1 : 1;
  if (!sideFree(s, side)) side = side === -1 ? 1 : -1;
  if (!sideFree(s, side)) return;
  const x = side === -1 ? edgeW(s.W) - 6 : s.W - 20;
  const wins: Win[] = [22, 48, 74].map((dy) => ({
    dy, boarded: false, pop: 0, cd: 0.4 + s.rng() * 1.6, fired: false,
  }));
  s.saloons.push({ side, x, y: -SALOON_H / 2 - 8, ph: s.rng() * 6.3, sign: (s.rng() * 1000) | 0, wins, cleared: false, missed: false });
}
function spawnTower(s: S) {
  if (s.towers.filter((t) => t.y < s.H).length >= TOWER_ONSCREEN_CAP) return;
  let side: -1 | 1 = s.rng() < 0.5 ? -1 : 1;
  if (!sideFree(s, side)) side = side === -1 ? 1 : -1;
  if (!sideFree(s, side)) return;
  const x = side === -1 ? edgeW(s.W) * 0.45 : s.W - 16;
  s.towers.push({ side, x, y: -40, hp: TOWER_HP, ph: s.rng() * 6.3 });
}
function spawnWagon(s: S) {
  if (s.wagons.length >= WAGON_CAP) return;
  const fl = fieldLeft(s);
  s.wagons.push({
    x: fl + (s.W - fl - PX_MARGIN) * (0.3 + s.rng() * 0.4),
    y: s.H + 80,
    t: 0, ph: s.rng() * 6.3,
    hp: WAGON_HP, hpMax: WAGON_HP,
    fireCd: 1.6, flash: 0,
    dead: false, spin: 0,
  });
  s.msg = "SHOOTER WAGON!";
  s.msgT = 1.6;
  sfx.play("boost");
}
function spawnTumble(s: S) {
  if (s.tumbles.length >= TUMBLE_CAP) return;
  const fromLeft = s.rng() < 0.5;
  s.tumbles.push({
    x: fromLeft ? -16 : s.W + 16,
    y: s.H * (0.08 + s.rng() * 0.5),
    vx: (fromLeft ? 1 : -1) * (70 + s.rng() * 70),
    ph: s.rng() * 6.3,
  });
}
function maybeDrop(s: S, x: number, y: number, chance: number) {
  if (s.rng() > chance) return;
  const roll = s.rng();
  const needHeart = s.hearts < HEARTS;
  const needAmmo = s.gun < GUN_MAX - 1;
  let kind: Drop["kind"];
  if (needHeart && roll < 0.3) kind = "heart";
  else if (needAmmo && roll < 0.68) kind = "ammo";
  else kind = roll < 0.5 ? "spread" : needHeart ? "heart" : "spread";
  s.drops.push({ x: clamp(x, fieldLeft(s) + 14, s.W - PX_MARGIN - 14), y: y - 22, kind, ph: s.rng() * 6.3 });
}
function eFire(s: S, x: number, y: number, spread: number) {
  if (s.ebullets.length >= EBULLET_CAP) return;
  const dx = s.px - x, dy = s.py - y;
  const a = Math.atan2(dy, dx) + spread;
  s.ebullets.push({ x, y, vx: Math.cos(a) * EBULLET_SP, vy: Math.sin(a) * EBULLET_SP });
}

// ── damage to the player ──────────────────────────────────────────────────────
function hurt(s: S, x: number, y: number) {
  if (s.invuln > 0 || s.over || s.ending) return;
  s.hearts--;
  s.invuln = INVULN;
  s.throttle *= 1 - HIT_THROTTLE_LOSS * (1 - s.knockSoak); // Armor soaks the knock
  s.flash = 0.42;
  s.shake = 12;
  s.zoom = 0.5;
  hitStop(s, 0.055);
  if (s.chain > 1) floater(s, s.px, s.py - 42, "CHAIN LOST", CRIMSON);
  s.chain = 0;
  burst(s, x, y, CRIMSON, 16, 230);
  burst(s, x, y, DUSTC, 8, 150);
  sfx.play("hurt");
  if (s.hearts <= 0) {
    s.msg = "BUCKED OFF!";
    s.msgT = END_HOLD;
    s.ending = true;
    s.endT = END_HOLD;
    sfx.play("ko");
  } else {
    floater(s, s.px, s.py - 28, s.knockSoak > 0 ? "HIT (armor soaked it)" : "HIT", CRIMSON);
  }
}

// ── her auto-fire: weighted-nearest threat, else covering fire backward ──────
function aimPick(s: S): { a: number } | null {
  let bestW = Infinity;
  let bx = 0, by = 0, found = false;
  const consider = (x: number, y: number, w: number) => {
    const d = ((x - s.px) ** 2 + (y - s.py) ** 2) * w;
    if (d < bestW) { bestW = d; bx = x; by = y; found = true; }
  };
  for (const r of s.riders) if (r.hp > 0) consider(r.x, r.y, 1);
  for (const f of s.foots) if (f.hp > 0) consider(f.x, f.y, 1);
  for (const wg of s.wagons) if (!wg.dead) consider(wg.x, wg.y, 0.8); // she prefers the wagon
  for (const sa of s.saloons) {
    if (sa.cleared) continue;
    const top = sa.y - SALOON_H / 2;
    for (const wnd of sa.wins) {
      if (wnd.boarded) continue;
      const wy = top + wnd.dy;
      if (wy < 20 || wy > s.H * 0.92) continue;
      consider(winX(sa), wy, wnd.pop > 0 ? 0.85 : 1.5); // popped gunmen jump the queue
    }
  }
  for (const t of s.towers) if (t.hp > 0 && t.y > 20) consider(t.x, t.y, 2.6); // towers only when quiet
  if (!found) return null;
  return { a: Math.atan2(by - s.py, bx - s.px) };
}

// ── game handle ───────────────────────────────────────────────────────────────
const handle: GameHandle<S> = {
  init: (w, h, run) => {
    // per-run seed: the engine keeps the nonce to itself, so hash fresh entropy
    const seed = hashStr(`stampede:${Date.now()}:${Math.random()}:${performance.now()}`);
    const rng = mulberry32(seed);
    const E = STAMPEDE_STATS;
    const auraDmg = Math.min(E.aura.damageCap, run.stats.aura * E.aura.damagePerLevel);
    let tier = 1;
    for (let i = 0; i < E.aura.weaponTiers.length; i++) if (run.stats.aura >= E.aura.weaponTiers[i]) tier = i + 1;
    // mute: first Start click is the unmute gesture unless the player chose
    if (userMuted === null) sfx.setMuted(false);
    else sfx.setMuted(userMuted);
    const s: S = {
      W: w, H: h,
      rng,
      dressSeed: (seed % 100000) | 0,
      practice: run.practice,
      speedMul: 1 + Math.min(E.drugs.cap, run.stats.drugs * E.drugs.perLevel),
      knockSoak: Math.min(E.botox.cap, run.stats.botox * E.botox.perLevel),
      evade: Math.min(E.ozempic.cap, run.stats.ozempic * E.ozempic.perLevel),
      gunDmg: auraDmg,
      weaponTier: tier,
      t: 0, over: false, ending: false, endT: 0,
      score: 0, dist: 0, scrollD: 0, speed: BASE_SCROLL, throttle: 1,
      freeze: 0,
      px: w * 0.55, py: h * 0.42, pvx: 0, pvy: 0, bank: 0, gallop: 0,
      hearts: HEARTS, invuln: GRACE,
      gun: TIER_START_GUN[tier - 1], fireCd: 0.4, aimA: Math.PI / 2, spreadT: 0,
      chain: 0, saloonsCleared: 0,
      riders: [], foots: [], saloons: [], towers: [], wagons: [],
      drops: [], bullets: [], ebullets: [],
      parts: [], rings: [], floats: [], hoofs: [], hats: [], tumbles: [],
      riderCd: GRACE + 0.6, footCd: 5, saloonCd: 1.0, towerCd: 7, wagonCd: 16 + rng() * 6,
      tumbleCd: 2, hoofCd: 0, hoofN: 0,
      kills: 0, footKills: 0, towersDown: 0, wagonsDown: 0,
      ramHits: 0, bulletHits: 0,
      shake: 0, flash: 0, zoom: 0,
      msg: "STAMPEDE", msgT: 1.2,
      muteHeld: false, lastDown: false, downX: 0, downY: 0,
    };
    if (tier > 1) floater(s, s.px, s.py - 30, WEAPON_NAMES[tier - 1].toUpperCase(), GOLD);
    return s;
  },

  step: (s, dt, input, w, h) => {
    if (s.over || dt <= 0) return; // dt<=0 guard: timers must only ever count forward
    s.W = w; s.H = h;

    // ── hit-stop: the world holds its breath for 35-60ms on big moments ─────
    if (s.freeze > 0) {
      s.freeze -= dt;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
      return;
    }

    // ── end-hold: coast under the banner, then hand the shell the score ─────
    if (s.ending) {
      s.endT -= dt;
      s.t += dt;
      if (s.msgT > 0) s.msgT = Math.max(0, s.msgT - dt);
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 1.6);
      for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const r of s.rings) { r.r += r.vr * dt; r.life -= dt; }
      s.rings = s.rings.filter((r) => r.life > 0);
      for (const f of s.floats) { f.y -= 34 * dt; f.life -= dt; }
      s.floats = s.floats.filter((f) => f.life > 0);
      for (const ht of s.hats) { ht.x += ht.vx * dt; ht.vy += 320 * dt; ht.y += ht.vy * dt; ht.rot += ht.vr * dt; ht.life -= dt; }
      s.hats = s.hats.filter((ht) => ht.life > 0);
      s.scrollD += s.speed * 0.5 * dt;
      if (s.endT <= 0) s.over = true;
      return;
    }

    s.t += dt;
    if (s.t >= RUN_SECONDS) {
      s.msg = "SUNSET RIDE!";
      s.msgT = END_HOLD;
      s.ending = true;
      s.endT = END_HOLD;
      s.score += 400; // rode out the full hour bonus
      floater(s, s.px, s.py - 30, "+400 SUNSET", GOLD);
      sfx.play("score");
      return;
    }

    if (s.msgT > 0) s.msgT = Math.max(0, s.msgT - dt);
    if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 1.6);
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
    if (s.zoom > 0) s.zoom = Math.max(0, s.zoom - dt * 2.2);
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dt);
    if (s.spreadT > 0) s.spreadT = Math.max(0, s.spreadT - dt);

    // ── gallop: hits knock the pace, it recovers on its own ─────────────────
    s.throttle = Math.min(1, s.throttle + THROTTLE_RECOVER * dt);
    s.speed = (BASE_SCROLL + s.t * SCROLL_RAMP) * (0.5 + 0.5 * s.throttle) * s.speedMul;
    s.scrollD += s.speed * dt;
    s.dist += s.speed * dt;
    s.score += s.speed * dt * DIST_SCORE;
    s.gallop += dt * (6 + s.speed * 0.02);

    // ── input: mute-circle taps never steer; everything else is riding ──────
    const pressEdge = input.down && !s.lastDown;
    const releaseEdge = !input.down && s.lastDown;
    if (pressEdge && input.px != null && input.py != null) {
      s.downX = input.px;
      s.downY = input.py;
      const m = mutePos(w, h);
      s.muteHeld = Math.hypot(input.px - m.x, input.py - m.y) < 24;
    }
    if (releaseEdge) {
      if (s.muteHeld && input.px != null && input.py != null) {
        const m = mutePos(w, h);
        if (Math.hypot(input.px - m.x, input.py - m.y) < 26) {
          userMuted = !sfx.muted();
          sfx.setMuted(userMuted);
          if (!userMuted) sfx.play("tap");
        }
      }
      s.muteHeld = false;
    }
    s.lastDown = input.down;

    const px0 = s.px, py0 = s.py;
    if (input.left && !input.right) s.px -= KEY_SPEED * s.speedMul * dt;
    else if (input.right && !input.left) s.px += KEY_SPEED * s.speedMul * dt;
    if (input.up && !input.downKey) s.py -= KEY_SPEED * s.speedMul * dt;
    else if (input.downKey && !input.up) s.py += KEY_SPEED * s.speedMul * dt;
    // eased chase-the-finger roam: only WHILE touching, target lifted above
    if (input.down && !s.muteHeld && input.px != null && input.py != null) {
      const ty = clamp(input.py - FINGER_LIFT, h * PY_MIN, h * PY_MAX);
      s.px += (input.px - s.px) * Math.min(1, FOLLOW * dt);
      s.py += (ty - s.py) * Math.min(1, FOLLOW * dt);
    }
    s.px = clamp(s.px, fieldLeft(s), w - PX_MARGIN);
    s.py = clamp(s.py, h * PY_MIN, h * PY_MAX);
    // lateral velocity (smoothed) drives the lean tilt + dust
    const instVx = (s.px - px0) / Math.max(dt, 0.001);
    const instVy = (s.py - py0) / Math.max(dt, 0.001);
    s.pvx += (instVx - s.pvx) * Math.min(1, 10 * dt);
    s.pvy += (instVy - s.pvy) * Math.min(1, 10 * dt);
    s.bank += (clamp(s.pvx * 0.0011, -0.34, 0.34) - s.bank) * Math.min(1, 8 * dt);
    // hard-turn dust kick
    if (Math.abs(s.pvx) > 190 && s.parts.length < (REDUCED_MOTION ? 60 : PART_CAP)) {
      const side = Math.sign(s.pvx);
      s.parts.push({
        x: s.px - side * 12, y: s.py + 12,
        vx: -side * (90 + s.rng() * 80), vy: 30 + s.rng() * 60,
        life: 0.3, life0: 0.3, c: DUSTC, r: 1.8 + s.rng() * 2,
      });
    }
    // steady hoof dust while galloping
    if (s.throttle > 0.3 && s.parts.length < (REDUCED_MOTION ? 60 : PART_CAP) && s.rng() < 0.5) {
      s.parts.push({
        x: s.px + (s.rng() - 0.5) * 12, y: s.py + 18,
        vx: (s.rng() - 0.5) * 24, vy: 40 + s.rng() * 40,
        life: 0.35, life0: 0.35, c: DUSTC, r: 1.4 + s.rng() * 1.8,
      });
    }

    // ── she returns fire (auto, at the weighted-nearest threat) ─────────────
    s.fireCd -= dt;
    const aim = aimPick(s);
    if (aim) s.aimA += (Math.atan2(Math.sin(aim.a - s.aimA), Math.cos(aim.a - s.aimA))) * Math.min(1, 12 * dt);
    else s.aimA += (Math.PI / 2 - s.aimA) * Math.min(1, 4 * dt); // covering fire backward
    if (s.fireCd <= 0) {
      s.fireCd = FIRE_INT[s.gun];
      const twin = s.gun >= 3 ? 2 : 1; // high tiers fire twin streams
      const angles: number[] = [];
      for (let i = 0; i < twin; i++) {
        angles.push(s.aimA + (s.rng() - 0.5) * 0.09 + (twin === 2 ? (i === 0 ? -0.045 : 0.045) : 0));
      }
      if (s.spreadT > 0) angles.push(s.aimA - 0.3, s.aimA + 0.3); // pickup fan
      for (const a of angles) {
        s.bullets.push({ x: s.px + Math.cos(a) * 14, y: s.py + 4 + Math.sin(a) * 14, vx: Math.cos(a) * BULLET_SP, vy: Math.sin(a) * BULLET_SP });
      }
      if (aim) sfx.play("fire");
      burst(s, s.px + Math.cos(s.aimA) * 16, s.py + 4 + Math.sin(s.aimA) * 16, GOLD, 1, 60);
      muzzleSmoke(s, s.px + Math.cos(s.aimA) * 18, s.py + 4 + Math.sin(s.aimA) * 18);
    }
    for (const b of s.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    s.bullets = s.bullets.filter((b) => b.x > -24 && b.x < w + 24 && b.y > -24 && b.y < h + 24);
    for (const b of s.ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    s.ebullets = s.ebullets.filter((b) => b.x > -24 && b.x < w + 24 && b.y > -24 && b.y < h + 24);

    // ── spawn director ──────────────────────────────────────────────────────
    s.riderCd -= dt;
    if (s.riderCd <= 0) {
      spawnRider(s);
      if (s.t > 24 && s.wagons.length === 0 && s.rng() < 0.45) spawnRider(s); // no double-spawns during the wagon beat
      s.riderCd = Math.max(1.9, 3.3 - s.t * 0.022) * (0.75 + s.rng() * 0.5);
    }
    s.footCd -= dt;
    if (s.footCd <= 0 && s.t > 5) {
      spawnFootSquad(s);
      s.footCd = 3.8 + s.rng() * 2.0;
    }
    s.saloonCd -= dt;
    if (s.saloonCd <= 0 && s.t < RUN_SECONDS - 5) {
      spawnSaloon(s);
      s.saloonCd = 4.4 + s.rng() * 1.6;
    }
    s.towerCd -= dt;
    if (s.towerCd <= 0 && s.t < RUN_SECONDS - 6) {
      spawnTower(s);
      s.towerCd = 8 + s.rng() * 6;
    }
    s.wagonCd -= dt;
    if (s.wagonCd <= 0 && s.t > 16 && s.t < RUN_SECONDS - 8) {
      spawnWagon(s);
      s.wagonCd = 13 + s.rng() * 5;
    }
    s.tumbleCd -= dt;
    if (s.tumbleCd <= 0) {
      spawnTumble(s);
      s.tumbleCd = 3 + s.rng() * 4;
    }

    // ── outlaw riders: station-keep behind you, arc sweeps, aimed fire ──────
    const wagonAlive = s.wagons.some((wg) => !wg.dead);
    for (const c of s.riders) {
      c.t += dt; c.ph += dt;
      if (c.hp <= 0) {
        c.spin += dt * 7;
        c.y += (s.speed * 0.9 + 70) * dt; // falls away behind
        c.x += c.vx * dt;
        if (s.parts.length < PART_CAP) burst(s, c.x, c.y - 8, DUSTC, 1, 40); // dust plume
        continue;
      }
      // climb to the hold band, then pursue laterally with a wide arc
      if (c.y > c.holdY) c.y -= 90 * dt;
      else c.y += Math.sin(c.t * 1.3 + c.ph) * 16 * dt;
      c.vx += clamp(s.px - c.x, -220, 220) * 0.016 * 32 * dt;
      c.vx *= 1 - 1.4 * dt;
      c.x += c.vx * dt + Math.sin(c.t * 2.1 + c.ph) * 38 * dt; // the fast arc sweep
      c.x = clamp(c.x, fieldLeft(s) + 14, w - PX_MARGIN - 14);
      c.fireCd -= dt;
      if (c.fireCd <= 0 && c.y > 40) {
        // while a wagon volleys, riders hold back so the pattern stays readable
        c.fireCd = (wagonAlive ? 3.0 : 2.2) + s.rng() * 0.9;
        eFire(s, c.x, c.y - 14, (s.rng() - 0.5) * 0.3); // wide spread: near-misses, not lasers
        muzzleSmoke(s, c.x, c.y - 16);
      }
      // ram check
      if (s.invuln <= 0 && Math.abs(c.x - s.px) < 22 && Math.abs(c.y - s.py) < 26) {
        c.hp -= 2; c.vx += Math.sign(c.x - s.px) * 160;
        s.ramHits++;
        hurt(s, (s.px + c.x) / 2, (s.py + c.y) / 2);
        if (c.hp <= 0) koRider(s, c);
      }
    }
    s.riders = s.riders.filter((c) => c.y < h + 70);

    // ── foot cowboys: strafe in squads up front, single aimed shots ─────────
    for (const d of s.foots) {
      d.t += dt;
      if (d.hp <= 0) {
        d.spin += dt * 8;
        d.y += s.speed * dt; // sits dazed, scrolls off with the street
        continue;
      }
      if (d.t > 9) d.cy -= 170 * dt; // done strafing: sprints away up the street
      d.x = d.cx + Math.sin(d.t * d.w1 + d.ph) * d.ax;
      d.y = d.cy + Math.sin(d.t * d.w2 + d.ph2) * d.ay;
      d.fireCd -= dt;
      if (d.fireCd <= 0 && d.t <= 9) {
        d.fireCd = 2.7 + s.rng() * 1.4;
        eFire(s, d.x, d.y + 6, (s.rng() - 0.5) * 0.2);
        muzzleSmoke(s, d.x, d.y + 4);
      }
      // ram (trampling a cowboy stings you both)
      if (s.invuln <= 0 && Math.abs(d.x - s.px) < 16 && Math.abs(d.y - s.py) < 20) {
        d.hp = 0;
        s.ramHits++;
        koFoot(s, d);
        hurt(s, (s.px + d.x) / 2, (s.py + d.y) / 2);
      }
    }
    s.foots = s.foots.filter((d) => d.y < h + 40 && d.y > -50);

    // ── shooter wagons: the heavies, volley fans, extra HP ──────────────────
    for (const wg of s.wagons) {
      wg.t += dt; wg.ph += dt;
      if (wg.dead) {
        wg.spin += dt * 2.2;
        wg.y += (s.speed * 0.8 + 90) * dt; // breaks down, falls behind
        if (s.parts.length < PART_CAP) burst(s, wg.x, wg.y - 10, SMOKE, 1, 40);
        continue;
      }
      const wantY = h * 0.7;
      if (wg.y > wantY) wg.y -= 70 * dt;
      else wg.y += Math.sin(wg.t * 0.8) * 10 * dt;
      wg.x += (clamp(s.px, fieldLeft(s) + 40, w - PX_MARGIN - 40) - wg.x) * Math.min(1, 0.4 * dt) + Math.sin(wg.t * 0.7) * 22 * dt;
      wg.fireCd -= dt;
      if (wg.flash > 0) wg.flash -= dt;
      if (wg.fireCd <= 0 && wg.y < h) {
        const nsh = wg.hp < wg.hpMax * 0.5 ? 5 : 3; // hurt wagons volley wider
        wg.fireCd = 2.7 + s.rng() * 0.8;
        wg.flash = 0.14;
        for (let k = 0; k < nsh; k++) {
          eFire(s, wg.x + (k - (nsh - 1) / 2) * 8, wg.y - 20, (k - (nsh - 1) / 2) * 0.16 + (s.rng() - 0.5) * 0.06);
        }
        burst(s, wg.x, wg.y - 22, GOLD, 3, 90);
        muzzleSmoke(s, wg.x - 8, wg.y - 22);
        muzzleSmoke(s, wg.x + 8, wg.y - 22);
      }
      if (s.invuln <= 0 && Math.abs(wg.x - s.px) < 30 && Math.abs(wg.y - s.py) < 34) {
        wg.hp -= 2;
        s.ramHits++;
        hurt(s, (s.px + wg.x) / 2, (s.py + wg.y) / 2);
        if (wg.hp <= 0) koWagon(s, wg);
      }
    }
    s.wagons = s.wagons.filter((wg) => wg.y < h + 120);

    // ── saloons: windows pop gunmen; clear all 3 before it scrolls past ─────
    for (const sa of s.saloons) {
      sa.y += s.speed * dt;
      sa.ph += dt;
      const top = sa.y - SALOON_H / 2;
      for (const wnd of sa.wins) {
        if (wnd.boarded) continue;
        const wy = top + wnd.dy;
        if (wnd.pop > 0) {
          wnd.pop -= dt;
          if (!wnd.fired && wnd.pop < 0.55) {
            wnd.fired = true;
            eFire(s, winX(sa), wy, (s.rng() - 0.5) * 0.22);
            burst(s, winX(sa), wy, GOLD, 2, 70);
            muzzleSmoke(s, winX(sa), wy - 4);
          }
        } else {
          wnd.cd -= dt;
          if (wnd.cd <= 0 && wy > 30 && wy < h * 0.8) {
            wnd.pop = 0.9 + s.rng() * 0.5;
            wnd.fired = false;
            wnd.cd = 1.7 + s.rng() * 1.8;
          }
        }
      }
      if (!sa.cleared && !sa.missed && sa.y > h + 10) {
        sa.missed = true;
        if (s.chain > 1) floater(s, clamp(sa.x, 50, w - 50), h - 60, "CHAIN LOST", "#8b95ad");
        s.chain = 0;
      }
    }
    s.saloons = s.saloons.filter((sa) => sa.y < h + SALOON_H);

    // ── water towers: destructible bonus, no fire ───────────────────────────
    for (const tw of s.towers) {
      tw.y += s.speed * dt;
      tw.ph += dt;
    }
    s.towers = s.towers.filter((tw) => tw.y < h + 60);

    // ── her bullets -> riders, foots, wagons, saloon windows, towers ────────
    for (const b of s.bullets) {
      let used = false;
      for (const c of s.riders) {
        if (c.hp <= 0) continue;
        if (Math.abs(b.x - c.x) < 20 && Math.abs(b.y - c.y) < 24) {
          c.hp -= 1 + s.gunDmg;
          used = true;
          burst(s, b.x, b.y, GOLD, 3, 110);
          sfx.play("hit");
          if (c.hp <= 0) koRider(s, c);
          break;
        }
      }
      if (!used) {
        for (const d of s.foots) {
          if (d.hp <= 0) continue;
          if (Math.abs(b.x - d.x) < 14 && Math.abs(b.y - d.y) < 16) {
            d.hp -= 1 + s.gunDmg;
            used = true;
            if (d.hp <= 0) koFoot(s, d);
            sfx.play("hit");
            break;
          }
        }
      }
      if (!used) {
        for (const wg of s.wagons) {
          if (wg.dead) continue;
          if (Math.abs(b.x - wg.x) < 26 && Math.abs(b.y - wg.y) < 32) {
            wg.hp -= 1 + s.gunDmg;
            used = true;
            burst(s, b.x, b.y, GOLD, 3, 120);
            sfx.play("hit");
            if (wg.hp <= 0) koWagon(s, wg);
            break;
          }
        }
      }
      if (!used) {
        outer: for (const sa of s.saloons) {
          if (sa.cleared) continue;
          const top = sa.y - SALOON_H / 2;
          for (const wnd of sa.wins) {
            if (wnd.boarded) continue;
            const wx = winX(sa), wy = top + wnd.dy;
            if (Math.abs(b.x - wx) < 9 && Math.abs(b.y - wy) < 11) {
              used = true;
              boardWindow(s, sa, wnd, wx, wy);
              break outer;
            }
          }
        }
      }
      if (!used) {
        for (const tw of s.towers) {
          if (tw.hp <= 0) continue;
          if (Math.abs(b.x - tw.x) < 15 && Math.abs(b.y - tw.y) < 18) {
            tw.hp -= 1 + s.gunDmg;
            used = true;
            burst(s, b.x, b.y, WATER, 3, 100);
            sfx.play("hit");
            if (tw.hp <= 0) koTower(s, tw);
            break;
          }
        }
      }
      if (used) b.x = -999;
    }
    s.bullets = s.bullets.filter((b) => b.x > -500);

    // ── enemy fire -> player (Gadgets can whiff a shot entirely) ────────────
    for (const b of s.ebullets) {
      if (Math.abs(b.x - s.px) < PLAYER_R && Math.abs(b.y - s.py) < PLAYER_R + 4) {
        b.x = -999;
        if (s.invuln <= 0 && s.evade > 0 && s.rng() < s.evade) {
          floater(s, s.px + 18, s.py - 18, "EVADED", ICE);
          burst(s, s.px, s.py, ICE, 6, 130);
          sfx.play("tap");
        } else {
          if (s.invuln <= 0) s.bulletHits++;
          hurt(s, s.px, s.py);
        }
      }
    }
    s.ebullets = s.ebullets.filter((b) => b.x > -500);

    // ── drops: ride over to scoop (shape + glyph + color coded) ─────────────
    for (const d of s.drops) {
      d.y += (s.speed * 0.34 + 14) * dt; // drifts off slowly, so a dive for it is a CHOICE
      d.ph += dt;
      if (Math.abs(d.x - s.px) < 24 && Math.abs(d.y - s.py) < 26) {
        d.y = h + 999;
        if (d.kind === "heart") {
          if (s.hearts < HEARTS) {
            s.hearts++;
            floater(s, s.px, s.py - 24, "+HEART", HEARTC);
          } else {
            s.score += HEART_FULL_PTS;
            floater(s, s.px, s.py - 24, `+${HEART_FULL_PTS}`, HEARTC);
          }
          burst(s, s.px, s.py, HEARTC, 10, 150);
        } else if (d.kind === "ammo") {
          if (s.gun < GUN_MAX - 1) {
            s.gun++;
            floater(s, s.px, s.py - 24, `GUNS LV ${s.gun + 1}`, GOLD);
          } else {
            floater(s, s.px, s.py - 24, `+${AMMO_PTS}`, GOLD);
          }
          s.score += AMMO_PTS;
          burst(s, s.px, s.py, GOLD, 12, 170);
        } else {
          s.spreadT = SPREAD_SECS;
          s.score += SPREAD_PTS;
          floater(s, s.px, s.py - 24, "SPREAD SHOT", ICE);
          burst(s, s.px, s.py, ICE, 12, 170);
        }
        sfx.play("pickup");
      }
    }
    s.drops = s.drops.filter((d) => d.y < h + 30);

    // ── hoofprint trail (scrolls away behind the horse) ─────────────────────
    s.hoofCd -= dt;
    if (s.hoofCd <= 0) {
      s.hoofCd = 0.09;
      s.hoofN++;
      s.hoofs.push({ x: s.px + (s.hoofN % 2 === 0 ? -5 : 5), y: s.py + 16, age: 0 });
      if (s.hoofs.length > 28) s.hoofs.shift();
    }
    for (const hp of s.hoofs) { hp.age += dt; hp.y += s.speed * dt; }
    s.hoofs = s.hoofs.filter((hp) => hp.age < 0.9);

    // ── tumbleweeds (pure dressing, no collision) ───────────────────────────
    for (const tb of s.tumbles) {
      tb.x += tb.vx * dt;
      tb.y += s.speed * 0.75 * dt;
      tb.ph += dt * (tb.vx > 0 ? 7 : -7);
    }
    s.tumbles = s.tumbles.filter((tb) => tb.x > -40 && tb.x < w + 40 && tb.y < h + 40);

    // ── fx integration ──────────────────────────────────────────────────────
    for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    s.parts = s.parts.filter((p) => p.life > 0);
    for (const r of s.rings) { r.r += r.vr * dt; r.life -= dt; }
    s.rings = s.rings.filter((r) => r.life > 0);
    for (const f of s.floats) { f.y -= 34 * dt; f.life -= dt; }
    s.floats = s.floats.filter((f) => f.life > 0);
    for (const ht of s.hats) { ht.x += ht.vx * dt; ht.vy += 320 * dt; ht.y += ht.vy * dt; ht.rot += ht.vr * dt; ht.life -= dt; }
    s.hats = s.hats.filter((ht) => ht.life > 0);

    if (DEBUG)
      (window as unknown as Record<string, unknown>).__st = {
        t: s.t, W: s.W, H: s.H, px: s.px, py: s.py, hearts: s.hearts, gun: s.gun, spread: s.spreadT,
        chain: s.chain, score: s.score, riders: s.riders.length, foots: s.foots.length,
        wagons: s.wagons.length, saloons: s.saloons.length, towers: s.towers.length,
        cleared: s.saloonsCleared, towersDown: s.towersDown, wagonsDown: s.wagonsDown,
        rams: s.ramHits, bhits: s.bulletHits,
        drops: s.drops.map((d) => [Math.round(d.x), Math.round(d.y), d.kind]),
        wins: s.saloons
          .filter((sa) => !sa.cleared)
          .map((sa) => [Math.round(winX(sa)), Math.round(sa.y), sa.wins.filter((wn) => !wn.boarded).length]),
        twr: s.towers.filter((t) => t.hp > 0).map((t) => [Math.round(t.x), Math.round(t.y)]),
        wgn: s.wagons.filter((wg) => !wg.dead).map((wg) => [Math.round(wg.x), Math.round(wg.y)]),
        eb: s.ebullets.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy)]),
      };
  },

  draw: (ctx, s, w, h) => {
    // charcoal floor under everything (also the letterbox during lean tilt)
    ctx.fillStyle = CHARCOAL;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    // camera personality: lean tilt with lateral velocity + zoom pulse + shake
    const doMotion = !REDUCED_MOTION;
    const zoomK = 1 + (doMotion ? s.zoom * 0.028 : 0);
    ctx.translate(w / 2, h / 2);
    if (doMotion) ctx.rotate(s.bank * 0.16);
    ctx.scale(zoomK, zoomK);
    ctx.translate(-w / 2, -h / 2);
    if (s.shake > 0 && doMotion) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);

    drawStreet(ctx, s, w, h);
    drawEdges(ctx, s, w, h);

    // structures sit on the ground, under everyone
    for (const sa of s.saloons) drawSaloon(ctx, s, sa);
    for (const tw of s.towers) drawTower(ctx, tw);

    // hoofprints under the hooves
    drawHoofs(ctx, s);

    // drops
    for (const d of s.drops) drawDrop(ctx, d);

    // tumbleweeds roll over the prints, under the actors
    for (const tb of s.tumbles) drawTumble(ctx, tb);

    // enemies
    for (const d of s.foots) drawFoot(ctx, s, d);
    for (const c of s.riders) drawRider(ctx, s, c);
    for (const wg of s.wagons) drawWagon(ctx, s, wg);

    // player
    drawPlayer(ctx, s);

    // bullets over the actors: her tracers gold, enemy shots crimson dots
    ctx.shadowColor = GOLD; ctx.shadowBlur = 6;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.6; ctx.lineCap = "round";
    for (const b of s.bullets) {
      const d = Math.hypot(b.vx, b.vy) || 1;
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / d) * 8, b.y - (b.vy / d) * 8);
      ctx.lineTo(b.x + (b.vx / d) * 4, b.y + (b.vy / d) * 4);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // enemy shots: crimson dot + white core (shape + luminance coding, donor style)
    ctx.shadowColor = RED; ctx.shadowBlur = 5;
    for (const b of s.ebullets) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(b.x, b.y, 3.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0; ctx.fillStyle = WHITE;
    for (const b of s.ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 1.6, 0, Math.PI * 2); ctx.fill(); }

    // flying hats tumble over everything
    for (const ht of s.hats) drawHat(ctx, ht);

    // heat shimmer over the far street (golden hour air)
    if (!REDUCED_MOTION) {
      ctx.strokeStyle = "#ffe7b0";
      ctx.lineWidth = 6;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.04 + 0.018 * Math.sin(s.t * 2 + i * 2.1);
        const yy = h * (0.1 + i * 0.075) + Math.sin(s.t * 1.7 + i * 2.1) * 3;
        ctx.beginPath();
        for (let x = edgeW(w) - 10; x <= w + 10; x += 24) {
          const y = yy + Math.sin(x * 0.05 + s.t * 3 + i) * 2.2;
          if (x <= edgeW(w) - 10) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // particles + rings + floaters
    for (const p of s.parts) {
      ctx.globalAlpha = clamp(p.life / p.life0, 0, 1);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of s.rings) {
      ctx.globalAlpha = clamp(r.life * 2, 0, 1);
      ctx.strokeStyle = r.c; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    for (const f of s.floats) {
      ctx.font = `800 ${f.big ? 17 : 13}px ui-sans-serif, system-ui, sans-serif`;
      ctx.globalAlpha = clamp(f.life * 1.6, 0, 1);
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 3;
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillStyle = f.c;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // golden-hour sun wash from the west (screen space, over the tilt)
    const sun = ctx.createLinearGradient(w, 0, w * 0.42, 0);
    sun.addColorStop(0, "rgba(240,179,64,0.13)");
    sun.addColorStop(1, "rgba(240,179,64,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
    // warm dusk vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.36, w / 2, h / 2, h * 0.78);
    vg.addColorStop(0, "rgba(24,10,4,0)");
    vg.addColorStop(1, "rgba(24,10,4,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    if (s.flash > 0) {
      ctx.fillStyle = `rgba(227,61,78,${s.flash * 0.45})`;
      ctx.fillRect(0, 0, w, h);
    }

    drawHUD(ctx, s, w, h);

    if (s.msgT > 0) {
      ctx.globalAlpha = Math.min(1, s.msgT);
      ctx.textAlign = "center";
      // long banners scale down so they never clip on a narrow phone canvas
      ctx.font = `800 ${s.msg.length > 16 ? 17 : 24}px ui-sans-serif, system-ui, sans-serif`;
      ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 4;
      ctx.strokeText(s.msg, w / 2, h * 0.34);
      ctx.fillStyle = s.msg.includes("BUCKED") ? CRIMSON : s.msg.includes("WAGON!") ? "#ffc46b" : GOLD;
      ctx.fillText(s.msg, w / 2, h * 0.34);
      ctx.globalAlpha = 1;
    }
  },

  done: (s) => s.over,
  score: (s) => Math.round(s.score),
};

// ── KO helpers (cartoon only: stars, hats, dust — nobody bleeds) ─────────────
function koRider(s: S, c: Rider) {
  c.hp = 0;
  c.spin = 0;
  s.kills++;
  s.score += RIDER_PTS;
  floater(s, c.x, c.y - 20, `+${RIDER_PTS}`, GOLD);
  burst(s, c.x, c.y, GOLD, 14, 200);
  burst(s, c.x, c.y, DUSTC, 10, 160);
  hatFly(s, c.x, c.y - 10);
  maybeDrop(s, c.x, c.y, 0.5);
  hitStop(s, 0.045);
  s.zoom = Math.max(s.zoom, 0.6);
  sfx.play("ko");
}
function koFoot(s: S, d: Foot) {
  d.hp = 0;
  d.spin = 0;
  s.footKills++;
  s.score += FOOT_PTS;
  floater(s, d.x, d.y - 16, `+${FOOT_PTS}`, GOLD);
  burst(s, d.x, d.y, GOLD, 10, 170);
  burst(s, d.x, d.y, DUSTC, 6, 120);
  hatFly(s, d.x, d.y - 8);
  maybeDrop(s, d.x, d.y, 0.25);
  hitStop(s, 0.03);
}
function koWagon(s: S, wg: Wagon) {
  wg.dead = true;
  wg.spin = 0;
  s.wagonsDown++;
  s.score += WAGON_PTS;
  floater(s, wg.x, wg.y - 30, `+${WAGON_PTS} WAGON DOWN`, GOLD, true); // the big floater
  ring(s, wg.x, wg.y, GOLD);
  burst(s, wg.x, wg.y, GOLD, 26, 260);
  burst(s, wg.x, wg.y, DUSTC, 14, 190);
  burst(s, wg.x, wg.y, SMOKE, 10, 120);
  hatFly(s, wg.x - 10, wg.y - 16);
  hatFly(s, wg.x + 10, wg.y - 12);
  s.zoom = 1; s.shake = 10;
  hitStop(s, 0.06); // the spec'd 60ms wagon hit-stop
  s.msg = "WAGON DOWN";
  s.msgT = 1.2;
  const dropX = wg.x, dropY = wg.y;
  s.drops.push({ x: clamp(dropX, fieldLeft(s) + 14, s.W - PX_MARGIN - 14), y: dropY - 22, kind: s.gun < GUN_MAX - 1 ? "ammo" : "spread", ph: s.rng() * 6.3 });
  sfx.play("ko");
}
function koTower(s: S, tw: Tower) {
  tw.hp = 0;
  s.towersDown++;
  s.score += TOWER_PTS;
  floater(s, clamp(tw.x, 40, s.W - 40), tw.y - 24, `+${TOWER_PTS} SPLASH`, ICE);
  ring(s, tw.x, tw.y, ICE);
  burst(s, tw.x, tw.y, WATER, 22, 220);
  burst(s, tw.x, tw.y, PLANK, 10, 170);
  // the promised heart: lands in the street where you can ride it down
  s.drops.push({ x: clamp(tw.x + (tw.side === -1 ? 46 : -46), fieldLeft(s) + 14, s.W - PX_MARGIN - 14), y: tw.y, kind: "heart", ph: s.rng() * 6.3 });
  hitStop(s, 0.045);
  s.zoom = Math.max(s.zoom, 0.6);
  sfx.play("ko");
}
function boardWindow(s: S, sa: Saloon, wnd: Win, wx: number, wy: number) {
  wnd.boarded = true;
  const hadGunman = wnd.pop > 0;
  wnd.pop = 0;
  s.score += WINDOW_PTS;
  floater(s, wx, wy - 14, `+${WINDOW_PTS}`, GOLD);
  floater(s, wx + 10, wy - 26, "★", GOLD);
  burst(s, wx, wy, GOLD, 8, 150);
  burst(s, wx, wy, PLANK, 5, 110);
  if (hadGunman) hatFly(s, wx, wy - 6); // he ducks away seeing stars, hat left behind
  sfx.play("hit");
  if (sa.wins.every((wn) => wn.boarded)) {
    sa.cleared = true;
    s.chain = Math.min(CHAIN_CAP, s.chain + 1);
    s.saloonsCleared++;
    const pts = SALOON_PTS * s.chain;
    s.score += pts;
    const fx = clamp(sa.x, 50, s.W - 50);
    floater(s, fx, sa.y, s.chain > 1 ? `SALOON x${s.chain} +${pts}` : `SALOON +${pts}`, GOLD);
    ring(s, wx, sa.y, GOLD);
    ring(s, wx, sa.y - 24, GOLD);
    burst(s, wx, sa.y, GOLD, 10, 170);
    maybeDrop(s, wx + sa.side * -34, sa.y, 0.45);
    if (s.chain >= 3) hitStop(s, 0.035);
    sfx.play("score");
  }
}

// ── golden-hour helper: every actor throws a LONG shadow to the east ─────────
function longShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rw: number, rh: number) {
  ctx.fillStyle = SHADOWC;
  ctx.beginPath();
  ctx.ellipse(x - rw * 0.9, y + 3, rw * 1.5, rh * 0.45, -0.16, 0, Math.PI * 2);
  ctx.fill();
}

// ── the street: packed dirt + ruts + pebbles + golden motes ──────────────────
function drawStreet(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  const pad = 30; // cover the lean-tilt letterbox
  const bg = ctx.createLinearGradient(0, 0, w, 0);
  bg.addColorStop(0, DIRT_DARK); // shadow side of the street
  bg.addColorStop(0.45, DIRT_MID);
  bg.addColorStop(0.85, DIRT_LIGHT); // sun side glows
  bg.addColorStop(1, DIRT_MID);
  ctx.fillStyle = bg;
  ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);

  // wagon-wheel ruts: two worn pairs running the length of the street
  const fl = fieldLeft(s);
  const span = w - PX_MARGIN - fl;
  for (const fr of [0.3, 0.68]) {
    for (const off of [-7, 7]) {
      const rx = fl + span * fr + off;
      ctx.strokeStyle = "rgba(56,36,20,0.42)";
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      for (let y = -pad; y <= h + pad; y += 14) {
        const x = rx + Math.sin((y - s.scrollD) * 0.02 + fr * 9) * 3;
        if (y <= -pad) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(196,156,102,0.2)"; // sun catching the rut lip
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let y = -pad; y <= h + pad; y += 14) {
        const x = rx + 3.2 + Math.sin((y - s.scrollD) * 0.02 + fr * 9) * 3;
        if (y <= -pad) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // pebbles + dry grass tufts (hash-keyed so nothing flickers frame to frame;
  // world rows scroll DOWN with the street, same direction as the buildings)
  const cell = 26;
  const gy0 = Math.floor(-s.scrollD / cell) - 1;
  for (let gy = gy0; gy < gy0 + Math.ceil(h / cell) + 3; gy++) {
    for (let gx = 0; gx < Math.ceil(w / cell); gx++) {
      const r1 = hash2(gx + s.dressSeed, gy);
      const x = gx * cell + hash2(gy, gx) * cell;
      const y = gy * cell + s.scrollD + hash2(gx, gy + 7) * cell;
      if (r1 > 0.94) {
        ctx.fillStyle = "rgba(58,38,22,0.5)"; // pebble
        ctx.beginPath(); ctx.arc(x, y, 1.4 + r1 * 1.6, 0, Math.PI * 2); ctx.fill();
      } else if (r1 > 0.9) {
        ctx.strokeStyle = SCRUB; // dry tuft
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x - 2.4, y - 4);
        ctx.moveTo(x, y); ctx.lineTo(x + 0.6, y - 5);
        ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 3.4);
        ctx.stroke();
      }
    }
  }

  // golden dust motes drifting in the low sun (slower layer = hanging in air)
  const mcell = 24;
  const my0 = Math.floor((-s.scrollD * 0.6) / mcell) - 1;
  for (let gy = my0; gy < my0 + Math.ceil(h / mcell) + 3; gy++) {
    for (let gx = 0; gx < Math.ceil(w / mcell); gx++) {
      const r1 = hash2(gx + s.dressSeed + 31, gy);
      if (r1 > 0.92) {
        const x = gx * mcell + hash2(gy, gx + 3) * mcell;
        const y = gy * mcell + s.scrollD * 0.6 + hash2(gx, gy + 11) * mcell;
        const tw = REDUCED_MOTION ? 0.6 : 0.3 + 0.7 * Math.abs(Math.sin(s.t * 2.2 + r1 * 40));
        ctx.globalAlpha = tw * 0.3;
        ctx.fillStyle = "#ffdf9e";
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
  }
  ctx.globalAlpha = 1;
}

// ── the frontier edges: mesa horizon / scrub / boardwalk parallax ─────────────
function drawEdges(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  const lw = edgeW(w);
  const pad = 30;

  // LEFT (town side): sand base fading into the street
  const land = ctx.createLinearGradient(0, 0, lw, 0);
  land.addColorStop(0, "#241208");
  land.addColorStop(0.55, "#4a2f1a");
  land.addColorStop(1, SAND);
  ctx.fillStyle = land;
  ctx.fillRect(-pad, -pad, lw + 4 + pad, h + pad * 2);

  // far mesas (slowest layer): flat-topped silhouettes with sun-lit rims.
  // World row = y - roff, so the horizon flows DOWN with the street, slowly.
  const rcell = 110;
  const roff = s.scrollD * 0.22;
  ctx.fillStyle = MESA_FAR;
  ctx.beginPath();
  ctx.moveTo(-pad, -pad);
  for (let y = -pad; y < h + pad; y += 6) {
    ctx.lineTo(mesaX(lw, s.dressSeed, y - roff, rcell), y);
  }
  ctx.lineTo(-pad, h + pad);
  ctx.closePath();
  ctx.fill();
  // sun rim on the mesa edges
  ctx.strokeStyle = MESA_RIM;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let y = -10; y < h + 10; y += 6) {
    const x = mesaX(lw, s.dressSeed, y - roff, rcell);
    if (y <= -10) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // mid scrub: saguaros + rocks (0.5x parallax, flowing down)
  const scell = 72;
  const soff = s.scrollD * 0.5;
  for (let i = -1; i < Math.ceil(h / scell) + 2; i++) {
    const gy = Math.floor(-soff / scell) + i;
    const y = gy * scell + soff;
    const r1 = hash2(gy * 5 + 2, s.dressSeed);
    if (r1 > 0.55) {
      // saguaro: trunk + two arms
      const cx = lw * (0.3 + r1 * 0.3);
      ctx.strokeStyle = "#2e4020";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, y + 14); ctx.lineTo(cx, y - 4); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, y + 4); ctx.quadraticCurveTo(cx - 6, y + 3, cx - 6, y - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y + 8); ctx.quadraticCurveTo(cx + 6, y + 7, cx + 6, y + 2); ctx.stroke();
    } else if (r1 > 0.3) {
      // rock cluster
      const cx = lw * (0.34 + r1 * 0.3);
      ctx.fillStyle = "rgba(64,42,26,0.8)";
      ctx.beginPath(); ctx.arc(cx, y, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, y + 3, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // near layer: the plank boardwalk + hitching posts (full scroll speed)
  drawBoardwalk(ctx, s, lw - 15, lw, h, -1);
  // RIGHT strip: desert scrub beyond a thinner boardwalk
  const rx = w - RIGHT_W;
  const rland = ctx.createLinearGradient(w, 0, rx, 0);
  rland.addColorStop(0, "#5c3a1e");
  rland.addColorStop(1, SAND);
  ctx.fillStyle = rland;
  ctx.fillRect(rx, -pad, RIGHT_W + pad, h + pad * 2);
  const dcell = 58;
  const doff = s.scrollD * 0.6;
  for (let i = -1; i < Math.ceil(h / dcell) + 2; i++) {
    const gy = Math.floor(-doff / dcell) + i;
    const y = gy * dcell + doff;
    const r1 = hash2(gy * 7 + 5, s.dressSeed + 3);
    if (r1 > 0.5) {
      ctx.strokeStyle = SCRUB;
      ctx.lineWidth = 1.4;
      const bx = w - 8 - r1 * 10;
      ctx.beginPath();
      ctx.moveTo(bx, y); ctx.lineTo(bx - 3, y - 5);
      ctx.moveTo(bx, y); ctx.lineTo(bx + 2, y - 6);
      ctx.moveTo(bx, y); ctx.lineTo(bx + 4, y - 3);
      ctx.stroke();
    }
  }
  drawBoardwalk(ctx, s, rx, rx + 15, h, 1);
}
/** Flat-topped mesa profile: hash height per world cell, steep cliff between. */
function mesaX(lw: number, seed: number, worldY: number, rcell: number): number {
  const gy = Math.floor(worldY / rcell);
  const f = worldY / rcell - gy; // always [0,1), negatives included
  const step = (r: number) => lw * (0.14 + r * 0.3);
  const h1 = step(hash2(gy, seed));
  const h2 = step(hash2(gy + 1, seed));
  const tf = f < 0.8 ? 0 : (f - 0.8) / 0.2;
  const e = tf * tf * (3 - 2 * tf); // smoothstep cliff at the cell boundary
  return h1 + (h2 - h1) * e;
}
/** One strip of plank boardwalk + hitching posts along a street edge. */
function drawBoardwalk(ctx: CanvasRenderingContext2D, s: S, x0: number, x1: number, h: number, side: -1 | 1) {
  ctx.fillStyle = PLANK;
  ctx.fillRect(x0, -30, x1 - x0, h + 60);
  // plank seams scroll DOWN at full street speed
  ctx.strokeStyle = "rgba(40,24,12,0.55)";
  ctx.lineWidth = 1;
  const off = s.scrollD % 9;
  for (let y = -9 + off; y < h + 9; y += 9) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  // street-edge trim catches the low sun
  ctx.fillStyle = side === -1 ? "rgba(220,178,110,0.35)" : "rgba(70,44,23,0.6)";
  ctx.fillRect(side === -1 ? x1 - 1.6 : x0, -30, 1.6, h + 60);
  // hitching posts + rails every ~76px (world-anchored, scrolls down)
  const pcell = 76;
  const poff = s.scrollD;
  for (let i = -1; i < Math.ceil(h / pcell) + 2; i++) {
    const gy = Math.floor(-poff / pcell) + i;
    const y = gy * pcell + poff;
    if (hash2(gy * 3 + 1, s.dressSeed + side) > 0.3) {
      const px = side === -1 ? x1 - 5 : x0 + 5;
      longShadow(ctx, px, y + 12, 3, 4);
      ctx.strokeStyle = WOOD_DARK;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + 12); ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(px - 6 * side, y + 4); ctx.lineTo(px + 6 * side, y + 4); ctx.stroke();
    } else if (hash2(gy * 3 + 2, s.dressSeed + side) > 0.6) {
      // a barrel by the walk
      const bx = side === -1 ? x1 - 6 : x0 + 6;
      longShadow(ctx, bx, y + 4, 5, 5);
      ctx.fillStyle = WOOD;
      ctx.beginPath(); ctx.arc(bx, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, y, 3, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

// ── saloons: destructible fronts, gunmen in the windows ───────────────────────
const SIGNS = ["SALOON", "SALOON", "HOTEL", "STORE"];
function drawSaloon(ctx: CanvasRenderingContext2D, s: S, sa: Saloon) {
  const top = sa.y - SALOON_H / 2;
  const x0 = sa.x - SALOON_W / 2;
  longShadow(ctx, sa.x, sa.y + SALOON_H * 0.36, SALOON_W * 0.5, SALOON_H * 0.3);
  spr(ctx, ART.saloon, sa.x, sa.y, SALOON_W, 0, () => {
    // facade
    ctx.fillStyle = sa.cleared ? "#54371e" : WOOD;
    ctx.fillRect(x0, top, SALOON_W, SALOON_H);
    // plank seams
    ctx.strokeStyle = "rgba(40,24,12,0.45)";
    ctx.lineWidth = 1;
    for (let yy = top + 8; yy < top + SALOON_H; yy += 8) {
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + SALOON_W, yy); ctx.stroke();
    }
    // parapet + sun-lit trim
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(x0 - 2, top, SALOON_W + 4, 6);
    ctx.fillStyle = "rgba(240,179,64,0.4)";
    ctx.fillRect(x0 - 2, top, SALOON_W + 4, 1.6);
    // sign board
    ctx.fillStyle = "#2c1a0c";
    ctx.fillRect(x0 + 4, top + 8, SALOON_W - 8, 9);
    ctx.fillStyle = sa.cleared ? "#8b6a3a" : GOLD;
    ctx.font = "800 6.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(SIGNS[sa.sign % SIGNS.length], sa.x, top + 15);
    // batwing doors at the street side, bottom
    const dx = winX(sa);
    ctx.fillStyle = "#1c1008";
    ctx.fillRect(dx - 5, top + SALOON_H - 14, 10, 12);
    ctx.strokeStyle = PLANK;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(dx, top + SALOON_H - 13); ctx.lineTo(dx, top + SALOON_H - 3); ctx.stroke();
  });
  // windows over the sprite or vector: the interactive layer
  for (const wnd of sa.wins) {
    const wx = winX(sa);
    const wy = top + wnd.dy;
    if (wnd.boarded) {
      // boarded up: crossed planks, nail dots
      ctx.fillStyle = "#241408";
      ctx.fillRect(wx - 6, wy - 7, 12, 14);
      ctx.strokeStyle = PLANK;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(wx - 6, wy - 6); ctx.lineTo(wx + 6, wy + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx + 6, wy - 6); ctx.lineTo(wx - 6, wy + 6); ctx.stroke();
      ctx.fillStyle = "rgba(230,200,150,0.6)";
      ctx.fillRect(wx - 5.4, wy - 5.4, 1.2, 1.2);
      ctx.fillRect(wx + 4.2, wy + 4.2, 1.2, 1.2);
      continue;
    }
    // open window: dark interior + frame
    ctx.fillStyle = "#180e06";
    ctx.fillRect(wx - 6, wy - 7, 12, 14);
    ctx.strokeStyle = wnd.pop > 0 ? CRIMSON : "rgba(240,179,64,0.5)";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(wx - 6, wy - 7, 12, 14);
    if (wnd.pop > 0) {
      // the gunman: hat + head over the sill, rifle toward the street
      const aimA = Math.atan2(s.py - wy, s.px - wx);
      ctx.strokeStyle = "#2a2a30";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wx, wy + 1);
      ctx.lineTo(wx + Math.cos(aimA) * 9, wy + 1 + Math.sin(aimA) * 9);
      ctx.stroke();
      ctx.fillStyle = "#e9c39a";
      ctx.beginPath(); ctx.arc(wx, wy, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#241a10";
      ctx.beginPath(); ctx.ellipse(wx, wy - 2.4, 4.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(wx, wy - 3, 2.2, 0, Math.PI * 2); ctx.fill();
      // muzzle flash right as the shot leaves
      if (wnd.fired && wnd.pop > 0.4) {
        ctx.fillStyle = "#fff2c0";
        ctx.beginPath(); ctx.arc(wx + Math.cos(aimA) * 10, wy + 1 + Math.sin(aimA) * 10, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      // hostile chevron while a gunman is up (orientation codes allegiance)
      ctx.lineJoin = "round";
      for (const [col, lww] of [["rgba(0,0,0,0.6)", 4] as const, [WHITE, 2] as const]) {
        ctx.strokeStyle = col; ctx.lineWidth = lww;
        ctx.beginPath();
        ctx.moveTo(wx - 4, wy - 14); ctx.lineTo(wx, wy - 9); ctx.lineTo(wx + 4, wy - 14);
        ctx.stroke();
      }
    }
  }
}

// ── water towers ──────────────────────────────────────────────────────────────
function drawTower(ctx: CanvasRenderingContext2D, tw: Tower) {
  if (tw.hp <= 0) {
    // collapsed: puddle + splayed legs + broken tank arc
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = WATER;
    ctx.beginPath(); ctx.ellipse(tw.x, tw.y + 4, 22, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = WOOD_DARK;
    ctx.lineWidth = 2.4;
    for (const [ax, ay, bx, by] of [[-14, 8, -4, -2], [14, 8, 5, 0], [-10, 14, 2, 6], [12, 14, -2, 8]] as const) {
      ctx.beginPath(); ctx.moveTo(tw.x + ax, tw.y + ay); ctx.lineTo(tw.x + bx, tw.y + by); ctx.stroke();
    }
    ctx.strokeStyle = PLANK;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tw.x, tw.y - 2, 10, 0.4, Math.PI - 0.6); ctx.stroke();
    return;
  }
  longShadow(ctx, tw.x, tw.y + 12, 14, 12);
  spr(ctx, ART.tower, tw.x, tw.y, 34, 0, () => {
    // legs + cross braces peeking under the tank
    ctx.strokeStyle = WOOD_DARK;
    ctx.lineWidth = 2.4;
    for (const [ox, oy] of [[-11, 13], [11, 13], [-9, 17], [9, 17]] as const) {
      ctx.beginPath(); ctx.moveTo(tw.x + ox * 0.5, tw.y + 4); ctx.lineTo(tw.x + ox, tw.y + oy); ctx.stroke();
    }
    // the tank: planked round top
    ctx.fillStyle = "#7a4c28";
    ctx.beginPath(); ctx.arc(tw.x, tw.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(40,24,12,0.6)";
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.moveTo(tw.x, tw.y);
      ctx.lineTo(tw.x + Math.cos(a) * 14, tw.y + Math.sin(a) * 14);
      ctx.stroke();
    }
    ctx.strokeStyle = "#3a2412";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tw.x, tw.y, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(tw.x, tw.y, 8.5, 0, Math.PI * 2); ctx.stroke();
    // sun glint on the wet rim
    ctx.strokeStyle = "rgba(255,235,180,0.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(tw.x, tw.y, 12, -1.1, -0.2); ctx.stroke();
  });
  // damage cracks + drips once it has been hit
  if (tw.hp < TOWER_HP) {
    ctx.strokeStyle = "rgba(20,12,6,0.8)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(tw.x - 4, tw.y - 8); ctx.lineTo(tw.x + 1, tw.y - 1); ctx.lineTo(tw.x - 2, tw.y + 6); ctx.stroke();
    ctx.fillStyle = WATER;
    const dripY = tw.y + 10 + ((tw.ph * 30) % 12);
    ctx.beginPath(); ctx.arc(tw.x - 2, dripY, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  // bonus-target cue: a soft gold pulse, calmer than the hostile crimson
  const pulse = 0.5 + 0.5 * Math.sin(tw.ph * 3);
  ctx.strokeStyle = `rgba(240,179,64,${0.16 + 0.14 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(tw.x, tw.y, 18 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
}

// ── drops (shape + glyph + color coded, colorblind-safe like the donor) ──────
function drawDrop(ctx: CanvasRenderingContext2D, d: Drop) {
  const bob = Math.sin(d.ph * 3) * 2;
  const y = d.y + bob;
  const c = d.kind === "heart" ? HEARTC : d.kind === "ammo" ? GOLD : ICE;
  const gl = ctx.createRadialGradient(d.x, y, 2, d.x, y, 20);
  gl.addColorStop(0, d.kind === "heart" ? "rgba(255,143,168,0.3)" : d.kind === "ammo" ? "rgba(240,179,64,0.3)" : "rgba(77,216,230,0.3)");
  gl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.arc(d.x, y, 20, 0, Math.PI * 2); ctx.fill();
  const art = d.kind === "heart" ? ART.heart : d.kind === "ammo" ? ART.ammo : ART.spread;
  spr(ctx, art, d.x, y, 26, 0, () => {
    ctx.shadowColor = c; ctx.shadowBlur = 8;
    if (d.kind === "heart") {
      // heart silhouette
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(d.x, y + 8);
      ctx.bezierCurveTo(d.x - 11, y - 4, d.x - 3, y - 10, d.x, y - 3);
      ctx.bezierCurveTo(d.x + 3, y - 10, d.x + 11, y - 4, d.x, y + 8);
      ctx.fill();
    } else if (d.kind === "ammo") {
      // crate square
      ctx.strokeStyle = c; ctx.lineWidth = 2.5;
      ctx.strokeRect(d.x - 9, y - 9, 18, 18);
    } else {
      // spread: circle + three-way fan
      ctx.strokeStyle = c; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(d.x, y, 11, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  });
  // white glyph in BOTH art + vector paths (shape coding survives real art)
  ctx.fillStyle = WHITE;
  ctx.font = "800 12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  if (d.kind === "spread") {
    // fan glyph: three strokes from a point
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.8; ctx.lineCap = "round";
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(d.x, y + 5);
      ctx.lineTo(d.x + Math.sin(a) * 8, y + 5 - Math.cos(a) * 10);
      ctx.stroke();
    }
  } else {
    ctx.fillText(d.kind === "heart" ? "+" : "▲", d.x, y + 4.5);
  }
}

// ── ground dressing actors ────────────────────────────────────────────────────
function drawHoofs(ctx: CanvasRenderingContext2D, s: S) {
  for (const hp of s.hoofs) {
    ctx.globalAlpha = clamp(1 - hp.age / 0.9, 0, 1) * 0.4;
    ctx.fillStyle = "#3a2412";
    ctx.beginPath(); ctx.ellipse(hp.x, hp.y, 2.2, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawTumble(ctx: CanvasRenderingContext2D, tb: Tumbleweed) {
  const bounce = Math.abs(Math.sin(tb.ph * 1.3)) * 6;
  const y = tb.y - bounce;
  longShadow(ctx, tb.x, tb.y + 4, 6 - bounce * 0.3, 4);
  ctx.save();
  ctx.translate(tb.x, y);
  ctx.rotate(tb.ph);
  ctx.strokeStyle = "#a08148";
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(1, -1, 4.4, 0.4, Math.PI * 1.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 3); ctx.stroke();
  ctx.restore();
}
function drawHat(ctx: CanvasRenderingContext2D, ht: Hat) {
  ctx.save();
  ctx.globalAlpha = clamp(ht.life * 1.4, 0, 1);
  ctx.translate(ht.x, ht.y);
  ctx.rotate(ht.rot);
  ctx.fillStyle = "#241a10";
  ctx.beginPath(); ctx.ellipse(0, 1, 6.4, 2.4, 0, 0, Math.PI * 2); ctx.fill(); // brim
  ctx.beginPath(); ctx.arc(0, -1.4, 3.2, Math.PI, 0); ctx.fill(); // dome
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(-3, -1.2); ctx.lineTo(3, -1.2); ctx.stroke(); // band
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ── actors ────────────────────────────────────────────────────────────────────
/** Shared top-down galloping horse: body + head + animated leg flicks. */
function horseBody(
  ctx: CanvasRenderingContext2D,
  gallop: number,
  coat: string,
  coatHi: string,
) {
  // legs flick out beyond the body, phase-split fore/hind for a gallop read
  ctx.strokeStyle = coatHi;
  ctx.lineCap = "round";
  ctx.lineWidth = 2.6;
  const f = Math.sin(gallop * 2) * 4;
  const b = Math.sin(gallop * 2 + Math.PI) * 4;
  ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-9, -16 - f); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -9); ctx.lineTo(9, -16 + f); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6, 11); ctx.lineTo(-10, 18 + b); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, 11); ctx.lineTo(10, 18 - b); ctx.stroke();
  // body: shoulders wide, nose narrow, rump round
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.quadraticCurveTo(6, -20, 8, -8);
  ctx.quadraticCurveTo(10, 6, 8, 14);
  ctx.quadraticCurveTo(6, 20, 0, 20);
  ctx.quadraticCurveTo(-6, 20, -8, 14);
  ctx.quadraticCurveTo(-10, 6, -8, -8);
  ctx.quadraticCurveTo(-6, -20, 0, -26);
  ctx.closePath();
  ctx.fill();
  // ears + mane strip + tail swish
  ctx.fillStyle = coatHi;
  ctx.beginPath(); ctx.moveTo(-3, -24); ctx.lineTo(-4.5, -28); ctx.lineTo(-1.5, -26); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(3, -24); ctx.lineTo(4.5, -28); ctx.lineTo(1.5, -26); ctx.closePath(); ctx.fill();
  ctx.fillRect(-1.4, -22, 2.8, 12);
  ctx.strokeStyle = coatHi;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.quadraticCurveTo(Math.sin(gallop) * 4, 24, Math.sin(gallop) * 6, 28);
  ctx.stroke();
}
function drawPlayer(ctx: CanvasRenderingContext2D, s: S) {
  const blink = s.invuln > 0 && !s.ending && Math.floor(s.t * 18) % 2 === 0;
  longShadow(ctx, s.px, s.py + 8, 15, 24);
  if (blink) return;
  const bob = Math.sin(s.gallop * 2) * 1.6;
  const rot = s.bank * 0.9; // she visibly leans into turns
  ctx.shadowColor = GOLD; ctx.shadowBlur = 10;
  spr(ctx, ART.horse, s.px, s.py + bob, 44, rot, () => {
    ctx.save();
    ctx.translate(s.px, s.py + bob);
    ctx.rotate(rot);
    horseBody(ctx, s.gallop, "#7a4a28", "#59331a");
    // gold saddle blanket: the PLAYER cue (enemies get crimson)
    ctx.fillStyle = GOLD;
    ctx.fillRect(-6.5, -2, 13, 8);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-6.5, 5, 13, 1.4);
    // the huntress: duster shoulders, skin, hat with a gold band
    ctx.fillStyle = "#3a2a44";
    ctx.beginPath(); ctx.arc(0, 2, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e9c39a";
    ctx.beginPath(); ctx.arc(0, 0.6, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#241a10";
    ctx.beginPath(); ctx.ellipse(0, -0.6, 4.6, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -1.2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(0, -0.6, 3, 1.3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  ctx.shadowBlur = 0;
  // her rifle barrel tracks the aim in world space (drawn over any sprite)
  ctx.strokeStyle = "#2a2a30";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(s.px + Math.cos(s.aimA) * 6, s.py + 2 + Math.sin(s.aimA) * 6);
  ctx.lineTo(s.px + Math.cos(s.aimA) * 16, s.py + 2 + Math.sin(s.aimA) * 16);
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(s.px + Math.cos(s.aimA) * 13, s.py + 2 + Math.sin(s.aimA) * 13);
  ctx.lineTo(s.px + Math.cos(s.aimA) * 16, s.py + 2 + Math.sin(s.aimA) * 16);
  ctx.stroke();
}
function drawRider(ctx: CanvasRenderingContext2D, s: S, c: Rider) {
  longShadow(ctx, c.x, c.y + 7, 13, 20);
  // dust puffs are cheap: one per frame per rider, capped globally
  if (c.hp > 0 && s.parts.length < PART_CAP) {
    s.parts.push({ x: c.x + (s.rng() - 0.5) * 8, y: c.y + 18, vx: (s.rng() - 0.5) * 20, vy: 50, life: 0.25, life0: 0.25, c: DUSTC, r: 1.6 });
  }
  const rot = c.hp <= 0 ? c.spin : clamp(c.vx * 0.002, -0.3, 0.3);
  // crimson under-glow: the FOE cue (player is gold, enemies crimson)
  const gr = 26;
  const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, gr);
  g.addColorStop(0, "rgba(227,61,78,0.4)");
  g.addColorStop(1, "rgba(227,61,78,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c.x, c.y, gr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = CRIMSON; ctx.shadowBlur = 9;
  spr(ctx, ART.rider, c.x, c.y, 36, rot, () => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(rot);
    ctx.scale(0.86, 0.86);
    horseBody(ctx, c.t * 7 + c.ph, c.hp <= 0 ? "#3a2b26" : "#2e2018", "#1c1410");
    // crimson blanket + the outlaw: bandana over the face
    ctx.fillStyle = CRIMSON;
    ctx.fillRect(-6, -2, 12, 7);
    ctx.fillStyle = "#33232c";
    ctx.beginPath(); ctx.arc(0, 2, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CRIMSON;
    ctx.beginPath(); ctx.arc(0, 0.8, 2.2, 0, Math.PI * 2); ctx.fill();
    if (c.hp > 0) {
      ctx.fillStyle = "#241a10";
      ctx.beginPath(); ctx.ellipse(0, -0.6, 4.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -1, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
  ctx.shadowBlur = 0;
  if (c.hp <= 0) {
    // cartoon KO: dizzy stars orbit the reeling rider
    for (let k = 0; k < 3; k++) {
      const a = c.spin * 1.6 + (k * Math.PI * 2) / 3;
      ctx.fillStyle = GOLD;
      ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★", c.x + Math.cos(a) * 16, c.y - 18 + Math.sin(a) * 5);
    }
    return;
  }
  // down-chevron = hostile (orientation codes allegiance, donor convention)
  ctx.lineJoin = "round";
  for (const [col, lw] of [["rgba(0,0,0,0.6)", 4] as const, [WHITE, 2] as const]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(c.x - 5, c.y - 32); ctx.lineTo(c.x, c.y - 26); ctx.lineTo(c.x + 5, c.y - 32);
    ctx.stroke();
  }
  if (c.hp < c.hpMax) {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(c.x - 12, c.y - 40, 24, 4);
    const frac = c.hp / c.hpMax;
    ctx.fillStyle = frac > 0.5 ? "#6ee6a0" : frac > 0.25 ? GOLD : RED;
    ctx.fillRect(c.x - 12, c.y - 40, 24 * frac, 4);
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1; ctx.strokeRect(c.x - 12, c.y - 40, 24, 4);
  }
}
function drawFoot(ctx: CanvasRenderingContext2D, s: S, d: Foot) {
  longShadow(ctx, d.x, d.y + 5, 7, 8);
  const rot = d.hp <= 0 ? Math.sin(d.spin) * 0.3 : Math.sin(d.t * 6 + d.ph2) * 0.12;
  ctx.shadowColor = CRIMSON; ctx.shadowBlur = 7;
  spr(ctx, ART.cowboy, d.x, d.y, 18, rot, () => {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(rot);
    if (d.hp > 0) {
      // scurrying boots
      const st = Math.sin(d.t * 10 + d.ph2) * 3;
      ctx.strokeStyle = "#1c1410";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-2.4, 5); ctx.lineTo(-3.4, 8 + st * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2.4, 5); ctx.lineTo(3.4, 8 - st * 0.4); ctx.stroke();
    }
    // duster shoulders + bandana + hat
    ctx.fillStyle = "#4a3040";
    ctx.beginPath(); ctx.ellipse(0, 2, 5.4, 4.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CRIMSON;
    ctx.beginPath(); ctx.arc(0, 0.8, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e9c39a";
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
    if (d.hp > 0) {
      ctx.fillStyle = "#241a10";
      ctx.beginPath(); ctx.ellipse(0, -1, 4, 1.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -1.4, 2, 0, Math.PI * 2); ctx.fill();
      // pistol flashes toward you right before a shot
      if (d.fireCd < 0.4) {
        const a = Math.atan2(s.py - d.y, s.px - d.x);
        ctx.strokeStyle = "#2a2a30";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, 2 + Math.sin(a) * 4);
        ctx.lineTo(Math.cos(a) * 9, 2 + Math.sin(a) * 9);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
  ctx.shadowBlur = 0;
  if (d.hp <= 0) {
    for (let k = 0; k < 3; k++) {
      const a = d.spin * 1.4 + (k * Math.PI * 2) / 3;
      ctx.fillStyle = GOLD;
      ctx.font = "700 9px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★", d.x + Math.cos(a) * 12, d.y - 12 + Math.sin(a) * 4);
    }
    return;
  }
  ctx.lineJoin = "round";
  for (const [col, lw] of [["rgba(0,0,0,0.6)", 4] as const, [WHITE, 2] as const]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(d.x - 4, d.y - 18); ctx.lineTo(d.x, d.y - 13); ctx.lineTo(d.x + 4, d.y - 18);
    ctx.stroke();
  }
}
function drawWagon(ctx: CanvasRenderingContext2D, s: S, wg: Wagon) {
  longShadow(ctx, wg.x, wg.y + 16, 24, 30);
  if (!wg.dead && s.parts.length < PART_CAP) {
    s.parts.push({ x: wg.x + (s.rng() - 0.5) * 20, y: wg.y + 30, vx: (s.rng() - 0.5) * 24, vy: 55, life: 0.3, life0: 0.3, c: DUSTC, r: 2 });
  }
  const rot = wg.dead ? Math.sin(wg.spin) * 0.22 : Math.sin(wg.t * 0.9) * 0.04;
  // crimson under-glow, wider: this is the heavy
  const gr = 42;
  const g = ctx.createRadialGradient(wg.x, wg.y, 8, wg.x, wg.y, gr);
  g.addColorStop(0, "rgba(227,61,78,0.4)");
  g.addColorStop(1, "rgba(227,61,78,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(wg.x, wg.y, gr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = CRIMSON; ctx.shadowBlur = 10;
  spr(ctx, ART.wagon, wg.x, wg.y, 52, rot, () => {
    ctx.save();
    ctx.translate(wg.x, wg.y);
    ctx.rotate(rot);
    // the two-horse team out front
    for (const hx of [-8, 8]) {
      ctx.save();
      ctx.translate(hx, -34);
      ctx.scale(0.45, 0.45);
      horseBody(ctx, wg.t * 8 + hx, "#241a12", "#140e08");
      ctx.restore();
    }
    ctx.strokeStyle = "#1c1410";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-8, -28); ctx.lineTo(-4, -22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -28); ctx.lineTo(4, -22); ctx.stroke();
    // wheels: spoked, spinning with ph
    for (const [wx, wy] of [[-21, -12], [21, -12], [-21, 16], [21, 16]] as const) {
      ctx.fillStyle = "#181008";
      ctx.beginPath(); ctx.arc(wx, wy, 6.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#5c4426";
      ctx.lineWidth = 1.4;
      for (let k = 0; k < 3; k++) {
        const a = wg.ph * (wg.dead ? 1 : 6) + (k * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(wx - Math.cos(a) * 5.4, wy - Math.sin(a) * 5.4);
        ctx.lineTo(wx + Math.cos(a) * 5.4, wy + Math.sin(a) * 5.4);
        ctx.stroke();
      }
    }
    // bed + canvas top with bows
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(-18, -24, 36, 50);
    ctx.fillStyle = wg.dead ? "#9a8f7c" : "#d9cdb4";
    ctx.beginPath();
    ctx.moveTo(-15, -20);
    ctx.quadraticCurveTo(0, -26, 15, -20);
    ctx.lineTo(15, 22);
    ctx.quadraticCurveTo(0, 27, -15, 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(90,74,54,0.7)";
    ctx.lineWidth = 1.2;
    for (let yy = -16; yy <= 20; yy += 9) {
      ctx.beginPath();
      ctx.moveTo(-15, yy);
      ctx.quadraticCurveTo(0, yy - 4, 15, yy);
      ctx.stroke();
    }
    // rifles bristling from the sides
    ctx.strokeStyle = "#2a2a30";
    ctx.lineWidth = 2;
    for (const yy of [-10, 2, 14]) {
      ctx.beginPath(); ctx.moveTo(-15, yy); ctx.lineTo(-24, yy - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(15, yy); ctx.lineTo(24, yy - 2); ctx.stroke();
    }
    // volley flash across the bow rifles
    if (!wg.dead && wg.flash > 0) {
      ctx.fillStyle = "#fff2c0";
      for (const fx of [-10, 0, 10]) {
        ctx.beginPath(); ctx.arc(fx, -24, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  });
  ctx.shadowBlur = 0;
  if (wg.dead) {
    for (let k = 0; k < 4; k++) {
      const a = wg.spin * 1.2 + (k * Math.PI * 2) / 4;
      ctx.fillStyle = GOLD;
      ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★", wg.x + Math.cos(a) * 22, wg.y - 26 + Math.sin(a) * 6);
    }
    return;
  }
  ctx.lineJoin = "round";
  for (const [col, lw] of [["rgba(0,0,0,0.6)", 4] as const, [WHITE, 2] as const]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(wg.x - 6, wg.y - 52); ctx.lineTo(wg.x, wg.y - 45); ctx.lineTo(wg.x + 6, wg.y - 52);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(wg.x - 17, wg.y - 62, 34, 4);
  const frac = clamp(wg.hp / wg.hpMax, 0, 1);
  ctx.fillStyle = frac > 0.5 ? "#6ee6a0" : frac > 0.25 ? GOLD : RED;
  ctx.fillRect(wg.x - 17, wg.y - 62, 34 * frac, 4);
  ctx.strokeStyle = WHITE; ctx.lineWidth = 1; ctx.strokeRect(wg.x - 17, wg.y - 62, 34, 4);
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function mutePos(w: number, h: number) {
  return { x: w - 28, y: h - 54 };
}
function drawHUD(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  // score + chain + weapon (top-left)
  ctx.textAlign = "left";
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 3;
  ctx.font = "800 20px ui-sans-serif, system-ui, sans-serif";
  const sc = String(Math.round(s.score));
  ctx.strokeText(sc, 12, 26);
  ctx.fillStyle = "#f2ead8";
  ctx.fillText(sc, 12, 26);
  ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  if (s.chain > 1) {
    ctx.fillStyle = GOLD;
    ctx.strokeText(`CHAIN x${s.chain}`, 12, 42);
    ctx.fillText(`CHAIN x${s.chain}`, 12, 42);
  } else {
    ctx.fillStyle = "#b09b7d";
    ctx.strokeText(`${Math.round(s.dist)} m`, 12, 42);
    ctx.fillText(`${Math.round(s.dist)} m`, 12, 42);
  }
  ctx.fillStyle = s.gun >= GUN_MAX - 1 ? GOLD : "#b09b7d";
  const gunTxt = `${WEAPON_NAMES[s.weaponTier - 1]} · Lv ${s.gun + 1}${s.gun >= GUN_MAX - 1 ? " MAX" : ""}`;
  ctx.strokeText(gunTxt, 12, 57);
  ctx.fillText(gunTxt, 12, 57);

  // clock + hearts (top-right)
  const left = Math.max(0, Math.ceil(RUN_SECONDS - s.t));
  ctx.textAlign = "right";
  ctx.font = "800 18px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = left <= 10 ? "#ffc46b" : "#f2ead8";
  ctx.strokeText(`${left}s`, w - 12, 26);
  ctx.fillText(`${left}s`, w - 12, 26);
  for (let i = 0; i < HEARTS; i++) {
    const x = w - 20 - i * 18;
    const on = i < s.hearts;
    ctx.fillStyle = on ? CRIMSON : "rgba(255,255,255,0.16)";
    // heart glyph (grit)
    ctx.beginPath();
    ctx.moveTo(x, 44);
    ctx.bezierCurveTo(x - 8, 34, x - 2, 30, x, 35);
    ctx.bezierCurveTo(x + 2, 30, x + 8, 34, x, 44);
    ctx.fill();
  }
  if (s.practice) {
    ctx.textAlign = "center";
    ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(94,234,212,0.9)";
    ctx.fillText("PRACTICE", w / 2, 18);
  }

  // spread-shot timer (bottom, full width, only while the pickup burns)
  if (s.spreadT > 0) {
    const gx = 12, gw = w - 24, gy = h - 20;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(gx, gy, gw, 9);
    ctx.fillStyle = ICE;
    ctx.fillRect(gx, gy, gw * (s.spreadT / SPREAD_SECS), 9);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, 9);
    ctx.fillStyle = "#cde8f0";
    ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("SPREAD SHOT", gx + 2, gy - 4);
  }

  // mute toggle (the ONE tappable chrome; presses inside never steer)
  const m = mutePos(w, h);
  ctx.fillStyle = "rgba(26,16,8,0.6)";
  ctx.beginPath(); ctx.arc(m.x, m.y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(m.x, m.y, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = sfx.muted() ? "#b09b7d" : GOLD;
  // tiny speaker glyph
  ctx.beginPath();
  ctx.moveTo(m.x - 6, m.y - 3);
  ctx.lineTo(m.x - 2, m.y - 3);
  ctx.lineTo(m.x + 2, m.y - 7);
  ctx.lineTo(m.x + 2, m.y + 7);
  ctx.lineTo(m.x - 2, m.y + 3);
  ctx.lineTo(m.x - 6, m.y + 3);
  ctx.closePath();
  ctx.fill();
  if (sfx.muted()) {
    ctx.strokeStyle = "#b09b7d";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(m.x + 4, m.y - 5); ctx.lineTo(m.x + 9, m.y + 5); ctx.stroke();
  } else {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(m.x + 3, m.y, 6, -0.8, 0.8); ctx.stroke();
  }
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function StampedeGame() {
  // ?practice=1 = free warm-up: no wallet gate, no server calls, nothing banks.
  const [practice, setPractice] = useState(false);
  useEffect(() => {
    setPractice(new URLSearchParams(window.location.search).get("practice") === "1");
  }, []);
  return (
    <GameShell
      game="riviera"
      title="Stampede"
      practice={practice}
      instructions="Golden hour on the frontier main street. Press and hold anywhere and your horse chases the finger, riding just above it so your thumb never blocks the view. Keys work too, WASD or the arrows. The bounty huntress fires on her own, so just ride: weave the outlaw fire, board up every saloon window before the building slides past to build a chain, and topple water towers for a heart. Big shooter wagons volley hard and pay the most. Hits cost hearts and gallop, never the run. Last the full 60 seconds and ride into the sunset."
      handle={handle}
    />
  );
}
