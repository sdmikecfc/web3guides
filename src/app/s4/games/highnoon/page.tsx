/**
 * SEASON 4 · HIGH NOON — a 75 second frontier survivors-like. You are the
 * bounty huntress holding the main street at high noon; outlaw GANGS circle in
 * from every edge and you only steer. Your weapon fires by itself; the weapon
 * TIER comes from your Weapon stat (aura) ladder:
 *   Knife Fan -> Six-Shooter -> Katana Spin -> Golden Deagle -> Briefcase Minigun.
 *
 * CONTROLS (one thumb first):
 * - Touch: HOLD and drag anywhere; the huntress chases a point ~40px ABOVE
 *   your finger so your thumb never hides her (THUMB_LIFT). She only follows
 *   while the pointer is HELD DOWN (input.down): no steering from hover or a
 *   stale last-known point — both are deliberate fixes over the slayer donor.
 * - Keys: WASD / arrows to roam. Keys win over touch when both are active.
 * - Level-up: the run PAUSES and three big tap cards appear (pause-safe).
 * - Mute toggle: small speaker icon top-right of the HUD (canvas hit-tested).
 *
 * FICTION / WAVES: bandit rustlers rush you, dynamite tossers lob sticks you
 * must dodge (arcing throw -> fuse ring telegraph -> blast that also hurts
 * outlaws, so baiting the toss is real play), lasso wranglers rope-slow you,
 * vultures swarm erratically, keg bandits are tanks whose kegs chain-blast
 * other outlaws on KO. A RUNAWAY STAGECOACH (vehicle mini-boss) hits at 30s,
 * the Gang Boss BUTCH GOLDTOOTH at 60s. Boss intros = 500ms hit-stop + a
 * WANTED name plate. Humanoids are only ever cartoon-KO'd: they spin out with
 * stars and slide off screen. Zero blood, ever.
 *
 * STAT BASELINE (ADR-0004, display names in brackets):
 * - botox   [Armor]   = damage resistance, +6%/level, cap 24%.
 * - drugs   [Ride]    = move speed, +4%/level, cap 16%.
 * - ozempic [Gadgets] = dodge chance, +5%/level, cap 20%.
 * - aura    [Weapon]  = +1% damage per level (cap 25%) + the weapon tier
 *   ladder, thresholds [1, 5, 10, 20, 30].
 * All bounded <= ~25% advantage per stat. The game prefers STAT_EFFECTS.highnoon
 * from lib/s4/games if the wiring agent adds it; until then HN_FALLBACK below
 * carries the exact same numbers (this file must not edit lib/s4/games.ts).
 * In-run level-up picks stack ON the baseline, hard-bounded by RUN_CAPS.
 *
 * PROCEDURAL: every run's spawn timing, spawn edges, wave mix, prop layout,
 * storefront row, and level-up choices come from ONE mulberry32 stream seeded
 * by hashing the run nonce string when the shell passes one (RunContext does
 * not carry it yet, so we read an optional run.nonce defensively) else a
 * per-run unique string. No two runs share a layout; nothing is replayable.
 *
 * FEEL (ADR-0020 floor): golden-hour sky, mesa + storefront parallax rows that
 * shift against a leading camera, punch-in zoom on boss intros, long baked
 * shadows under every entity, drifting dust motes, rolling tumbleweeds, a heat
 * shimmer band over the street, muzzle smoke + shell-casing particles with a
 * ground bounce, screenshake + hit-stop + score floaters on every big moment.
 * prefers-reduced-motion gates shake, flash, and thins all ambient particles.
 *
 * ART (try-image-else-vector, drops in with zero code change):
 *   /s4-art/games/highnoon/bg-street.png     full-canvas backdrop
 *   /s4-art/games/highnoon/player.png        the bounty huntress
 *   /s4-art/games/highnoon/coin.png          gold bounty coin (XP drop)
 *   /s4-art/games/highnoon/foe-rustler.png   bandit runner
 *   /s4-art/games/highnoon/foe-brawler.png   bar brawler (horde)
 *   /s4-art/games/highnoon/foe-dynamite.png  dynamite tosser
 *   /s4-art/games/highnoon/foe-lasso.png     lasso wrangler
 *   /s4-art/games/highnoon/foe-vulture.png   vulture (flying swarm)
 *   /s4-art/games/highnoon/foe-keg.png       keg bandit (tank)
 *   /s4-art/games/highnoon/boss-stagecoach.png  runaway stagecoach
 *   /s4-art/games/highnoon/boss-gangboss.png    Butch Goldtooth
 *
 * SCORING (DNF-safe: dying banks everything earned so far):
 *   survival 10/s + weighted KOs + 15/bounty coin + 40/level-up. Measured in
 *   headless sim: a max-stat full run ~7,200, a zero-stat death at ~50s
 *   ~3,700, so a strong human run lands ~4,500-7,500. Suggested registry
 *   entry for the wiring agent:
 *   { key: "highnoon", maxScore: 9000, toCredits: s => Math.round(s / 55),
 *     creditsCap: 120, pointsCap: 10, attempts: 3, floorMs: 20000 }.
 *
 * PRACTICE: /s4/games/highnoon?practice=1 runs with zero server calls.
 */
"use client";

import { useEffect, useState } from "react";
import { GameShell, type GameHandle, type GameInput, type RunContext } from "../_shared/engine";
import { ACCENT } from "../_shared/shared";
import { createSfx } from "../_shared/sfx";
import { STAT_EFFECTS, type StatKey } from "@/lib/s4/games";

// ---- tuning ---------------------------------------------------------------
const RUN_SECONDS = 75;
const MARGIN = 18;
const PLAYER_HP = 100;
const BASE_SPEED = 200;
const PLAYER_R = 13;
const THUMB_LIFT = 40; // roam target sits this far ABOVE the finger
const HIT_IFRAMES = 0.6;
const TOUCH_CD = 0.7; // per-mob contact damage cooldown
const ROPE_SECONDS = 0.85; // lasso snare duration
const ROPE_SLOW = 0.4; // move speed multiplier while roped
const COIN_SCORE = 15;
const LEVEL_SCORE = 40;
const SURVIVAL_SCORE_PER_S = 10;
const COIN_MAGNET = 92;
const MOB_CAP = 100;
const PART_CAP = 220;
const STAGE_T = 30; // stagecoach mini-boss
const GANG_T = 60; // the Gang Boss
const BLAST_R = 54; // dynamite blast radius
const BLAST_DMG = 16; // to the player
const BLAST_DMG_MOB = 12; // dynamite also hurts outlaws: bait the toss
const STREET_TOP = 0.26; // fraction of H where the playable street begins

// Respect prefers-reduced-motion: shake + flash gated, ambient particles thinned.
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// One synth kit for the page; muted by default, toggled from the canvas HUD.
const sfx = createSfx();

// In-run level-up boosts. These STACK with the persistent baseline; RUN_CAPS
// are the in-run hard ceilings so stacking stays bounded no matter what.
const PICK = { botox: 0.06, drugs: 0.04, ozempic: 0.05, auraLevels: 3 } as const;
const RUN_CAPS = { resist: 0.6, speed: 0.5, dodge: 0.55, auraDamage: 0.5 } as const;

// ---- stat effects (prefers lib/s4/games STAT_EFFECTS.highnoon if wired) ----
const HN_FALLBACK = {
  botox: { perLevel: 0.06, cap: 0.24 },
  drugs: { perLevel: 0.04, cap: 0.16 },
  ozempic: { perLevel: 0.05, cap: 0.2 },
  aura: { damagePerLevel: 0.01, damageCap: 0.25, weaponTiers: [1, 5, 10, 20, 30] as readonly number[] },
};
type HNEffects = typeof HN_FALLBACK;
const E: HNEffects =
  (STAT_EFFECTS as unknown as Record<string, HNEffects | undefined>).highnoon ?? HN_FALLBACK;

// ---- weapons (tier = Weapon/aura ladder) ------------------------------------
type WeaponKind = "knife" | "bullet" | "spin" | "gold" | "hose";
const WEAPONS: { name: string; kind: WeaponKind; range: number; dmg: number; interval: number }[] = [
  { name: "Knife Fan", kind: "knife", range: 210, dmg: 5, interval: 0.5 },
  { name: "Six-Shooter", kind: "bullet", range: 380, dmg: 12, interval: 0.32 },
  { name: "Katana Spin", kind: "spin", range: 100, dmg: 10, interval: 0.55 },
  { name: "Golden Deagle", kind: "gold", range: 430, dmg: 18, interval: 0.28 },
  { name: "Briefcase Minigun", kind: "hose", range: 300, dmg: 5, interval: 0.08 },
];

/** Weapon stat level -> tier 1..5. Level 0 still throws knives (tier 1 floor). */
function weaponTier(aura: number): number {
  let tier = 1;
  const t = E.aura.weaponTiers;
  for (let i = 0; i < t.length; i++) if (aura >= t[i]) tier = i + 1;
  return tier;
}

// ---- enemies ----------------------------------------------------------------
type FoeKind = "rustler" | "brawler" | "vulture" | "lasso" | "dyno" | "keg";
type BossKind = "stage" | "gang";
type MobKind = FoeKind | BossKind;

const FOE: Record<FoeKind, { hp: number; speed: number; dmg: number; r: number; pts: number; coin: number }> = {
  rustler: { hp: 3, speed: 105, dmg: 9, r: 13, pts: 10, coin: 0.55 }, // fast rush
  brawler: { hp: 1, speed: 85, dmg: 5, r: 10, pts: 6, coin: 0.3 }, // mass horde
  vulture: { hp: 2, speed: 95, dmg: 7, r: 11, pts: 12, coin: 0.45 }, // erratic flyer
  lasso: { hp: 5, speed: 62, dmg: 8, r: 14, pts: 15, coin: 0.7 }, // ranged rope-slow
  dyno: { hp: 4, speed: 55, dmg: 6, r: 14, pts: 18, coin: 0.75 }, // dynamite lobber
  keg: { hp: 16, speed: 40, dmg: 18, r: 19, pts: 25, coin: 0.95 }, // tank, chain blast on KO
};
const BOSSD: Record<BossKind, { hp: number; speed: number; dmg: number; r: number; pts: number; name: string; sub: string }> = {
  stage: { hp: 120, speed: 58, dmg: 20, r: 30, pts: 200, name: "RUNAWAY STAGECOACH", sub: "Shoot the wheels off" },
  gang: { hp: 200, speed: 44, dmg: 16, r: 26, pts: 300, name: "BUTCH GOLDTOOTH", sub: "Leader of the gang" },
};

const FOE_COLOR: Record<MobKind, string> = {
  rustler: "#b06a3e",
  brawler: "#c99a62",
  vulture: "#4a4a56",
  lasso: "#8a6f4a",
  dyno: "#7d8a5a",
  keg: "#9a6a38",
  stage: "#7a4a2a",
  gang: "#2c2530",
};

// ---- colors (charcoal base + S4 crimson/gold/ice + frontier era) -----------
const CHAR = "#07080c";
const CRIMSON = "#e33d4e";
const GOLD = ACCENT; // #f0b340, the one S4 chrome accent
const ICE = "#4dd8e6";
const SAND = "#c9a06a";
const SAND_DARK = "#a87f4e";
const ADOBE = "#8a5a33";
const WOOD = "#6e4526";
const SKY_HI = "#e08a3c";
const SKY_LO = "#f7d489";
const SAGE = "#7d8a5a";
const WHITE = "#ffffff";
const INK = "#20242e";

// ---- art hooks (real sprites swap in by name; vectors until then) ----------
function img(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const i = new Image();
  i.src = src;
  return i;
}
const ART: Record<string, HTMLImageElement | null> = {
  bg: img("/s4-art/games/highnoon/bg-street.png"),
  player: img("/s4-art/games/highnoon/player.png"),
  coin: img("/s4-art/games/highnoon/coin.png"),
  rustler: img("/s4-art/games/highnoon/foe-rustler.png"),
  brawler: img("/s4-art/games/highnoon/foe-brawler.png"),
  vulture: img("/s4-art/games/highnoon/foe-vulture.png"),
  lasso: img("/s4-art/games/highnoon/foe-lasso.png"),
  dyno: img("/s4-art/games/highnoon/foe-dynamite.png"),
  keg: img("/s4-art/games/highnoon/foe-keg.png"),
  stage: img("/s4-art/games/highnoon/boss-stagecoach.png"),
  gang: img("/s4-art/games/highnoon/boss-gangboss.png"),
};
function ready(i: HTMLImageElement | null): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}
function spr(ctx: CanvasRenderingContext2D, im: HTMLImageElement | null, x: number, y: number, size: number, fb: () => void) {
  if (ready(im)) {
    const h = size * (im.naturalHeight / im.naturalWidth);
    ctx.drawImage(im, x - size / 2, y - h / 2, size, h);
  } else fb();
}

// ---- math -------------------------------------------------------------------
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** FNV-1a: any string (the run nonce) -> uint32 seed for mulberry32. */
function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Seed string per run: the server nonce when the shell exposes one (future-
 *  proof: RunContext does not carry it yet), else a unique per-run string. */
function seedFrom(run: RunContext): number {
  const maybe = (run as unknown as { nonce?: unknown }).nonce;
  const str = typeof maybe === "string" && maybe.length > 0
    ? maybe
    : `${Date.now()}|${Math.random()}|${typeof performance !== "undefined" ? performance.now() : 0}`;
  return hashSeed(str);
}

// ---- state ------------------------------------------------------------------
interface Mob {
  id: number;
  kind: MobKind;
  boss: boolean;
  x: number; y: number;
  hp: number; hpMax: number;
  r: number; speed: number; dmg: number; pts: number; coin: number;
  fireCd: number; // throw / rope / summon timer
  touchCd: number;
  ph: number; // wobble phase
  mode: number; modeT: number; // boss state machine
  tx: number; ty: number; // boss charge direction
  ko: number; kvx: number; kvy: number; spin: number; // cartoon KO slide-out
}
interface Bomb { x: number; y: number; sx: number; sy: number; air: number; airT: number; fuse: number }
interface Rope { x: number; y: number; vx: number; vy: number; dmg: number }
interface PShot { x: number; y: number; vx: number; vy: number; dmg: number; pierce: number; life: number; r: number; kind: "knife" | "bullet" | "gold" | "hose"; rot: number; hit: Set<number> }
interface Coin { x: number; y: number; ph: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; c: string; r: number; kind: "dot" | "star" | "smoke" | "casing"; rot: number; rv: number; gy: number }
interface Floater { x: number; y: number; txt: string; c: string; life: number }
interface Blast { x: number; y: number; t: number }
interface Prop { kind: "cactus" | "barrel" | "skull" | "post"; x: number; y: number; r: number }
interface Front { x: number; w: number; roofY: number; c: string; sign: string; poster: boolean; awning: boolean }
interface Weed { x: number; y: number; r: number; vx: number; rot: number; rv: number }
interface Mote { x: number; y: number; vx: number; ph: number }

interface S {
  W: number; H: number;
  rng: () => number;
  practice: boolean;
  t: number; over: boolean; win: boolean;
  score: number; kills: number; coinsGot: number;
  // player
  px: number; py: number; prevPx: number; prevPy: number; pvx: number; pvy: number;
  hp: number; iframes: number; rope: number; facing: number;
  // persistent baseline (bounded by E at init)
  baseResist: number; baseSpeed: number; baseDodge: number; baseAura: number;
  // in-run picks (stack with baseline, bounded by RUN_CAPS at use)
  addResist: number; addSpeed: number; addDodge: number; addAura: number;
  level: number; xp: number; xpNeed: number;
  choosing: StatKey[] | null;
  lastDown: boolean; uiLatch: boolean;
  // combat
  atkCd: number; spinFx: number; muzzle: number; lastFireSfx: number;
  nextId: number;
  mobs: Mob[]; ropes: Rope[]; pshots: PShot[]; bombs: Bomb[]; blasts: Blast[];
  coins: Coin[]; parts: Particle[]; floats: Floater[];
  spawnCd: number; stageDone: boolean; gangDone: boolean;
  plate: { name: string; sub: string; t: number } | null;
  hitstop: number;
  msg: string; msgT: number; shake: number; flash: number;
  // camera personality: lead toward velocity + boss punch-in zoom
  camX: number; camY: number; zoom: number;
  // world dressing (all placed once per run from the seed)
  props: Prop[]; fronts: Front[]; speckles: { x: number; y: number }[];
  weeds: Weed[]; weedCd: number; motes: Mote[];
}

// ---- fx helpers ---------------------------------------------------------------
function burst(s: S, x: number, y: number, c: string, n: number, sp: number, star = false) {
  const cap = REDUCED_MOTION ? PART_CAP / 3 : PART_CAP;
  for (let i = 0; i < n && s.parts.length < cap; i++) {
    const a = s.rng() * Math.PI * 2, v = sp * (0.4 + s.rng() * 0.8);
    s.parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + s.rng() * 0.4,
      c, r: 1.5 + s.rng() * 2.5, kind: star ? "star" : "dot", rot: 0, rv: 0, gy: 0,
    });
  }
}
function smokePuff(s: S, x: number, y: number, n: number) {
  const cap = REDUCED_MOTION ? PART_CAP / 3 : PART_CAP;
  for (let i = 0; i < n && s.parts.length < cap; i++) {
    s.parts.push({
      x: x + (s.rng() - 0.5) * 6, y: y + (s.rng() - 0.5) * 6,
      vx: (s.rng() - 0.5) * 24, vy: -14 - s.rng() * 20, life: 0.5 + s.rng() * 0.35,
      c: "#cbb9a2", r: 2.5 + s.rng() * 3, kind: "smoke", rot: 0, rv: 0, gy: 0,
    });
  }
}
function casing(s: S, x: number, y: number, facing: number) {
  if (REDUCED_MOTION || s.parts.length >= PART_CAP) return;
  const side = facing + Math.PI / 2 + (s.rng() - 0.5) * 0.5;
  s.parts.push({
    x, y, vx: Math.cos(side) * (60 + s.rng() * 50), vy: -80 - s.rng() * 50,
    life: 0.7 + s.rng() * 0.3, c: GOLD, r: 2, kind: "casing",
    rot: s.rng() * 6.3, rv: 8 + s.rng() * 10, gy: y + 14 + s.rng() * 10,
  });
}
function float(s: S, x: number, y: number, txt: string, c: string) {
  if (s.floats.length < 24) s.floats.push({ x, y, txt, c, life: 0.85 });
}

// ---- spawning -----------------------------------------------------------------
function streetTop(h: number) { return h * STREET_TOP; }

/** A random point just outside a random edge (top spawns come out of the alleys). */
function edgePoint(s: S): { x: number; y: number } {
  const e = Math.floor(s.rng() * 4);
  const t = s.rng();
  if (e === 0) return { x: t * s.W, y: streetTop(s.H) - 20 };
  if (e === 1) return { x: s.W + 24, y: streetTop(s.H) + t * (s.H - streetTop(s.H)) };
  if (e === 2) return { x: t * s.W, y: s.H + 24 };
  return { x: -24, y: streetTop(s.H) + t * (s.H - streetTop(s.H)) };
}

function addFoe(s: S, kind: FoeKind, x: number, y: number) {
  if (s.mobs.length >= MOB_CAP) return;
  const sp = FOE[kind];
  s.mobs.push({
    id: s.nextId++, kind, boss: false, x, y,
    hp: sp.hp, hpMax: sp.hp, r: sp.r, speed: sp.speed * (0.9 + s.rng() * 0.2),
    dmg: sp.dmg, pts: sp.pts, coin: sp.coin,
    fireCd: 1.4 + s.rng() * 1.6, touchCd: 0, ph: s.rng() * 6.3,
    mode: 0, modeT: 0, tx: 0, ty: 0, ko: 0, kvx: 0, kvy: 0, spin: 0,
  });
}

/** Boss entrance: 500ms hit-stop, punch-in zoom, WANTED name plate. */
function addBoss(s: S, kind: BossKind) {
  const sp = BOSSD[kind];
  const { x, y } = edgePoint(s);
  s.mobs.push({
    id: s.nextId++, kind, boss: true, x, y,
    hp: sp.hp, hpMax: sp.hp, r: sp.r, speed: sp.speed,
    dmg: sp.dmg, pts: sp.pts, coin: 1,
    fireCd: 2.4, touchCd: 0, ph: s.rng() * 6.3,
    mode: 0, modeT: 1.2, tx: 0, ty: 0, ko: 0, kvx: 0, kvy: 0, spin: 0,
  });
  s.plate = { name: sp.name, sub: sp.sub, t: 2.2 };
  s.hitstop = 0.5;
  s.zoom = 1.085;
  s.shake = 9;
  sfx.play("boost");
}

/** Escalating spawn director: mix and density grow with s.t, all from the seed. */
function spawnWave(s: S) {
  const r = s.rng();
  const grow = 1 + s.t / 40;
  const at = edgePoint(s);
  const scatter = (n: number, kind: FoeKind, spread: number) => {
    for (let i = 0; i < n; i++) {
      addFoe(s, kind, at.x + (s.rng() - 0.5) * spread, at.y + (s.rng() - 0.5) * spread);
    }
  };
  if (s.t > 26 && r < 0.1) scatter(Math.round(1 * grow), "keg", 50);
  else if (s.t > 16 && r < 0.26) scatter(1 + Math.floor(s.rng() * 2), "dyno", 70);
  else if (s.t > 10 && r < 0.4) scatter(1 + Math.floor(s.rng() * 2), "lasso", 70);
  else if (s.t > 8 && r < 0.52) scatter(3 + Math.floor(s.rng() * 3), "vulture", 90);
  else if (r < 0.74) scatter(Math.round(1.6 * grow), "rustler", 60);
  else scatter(Math.round(5 + s.t / 12), "brawler", 100);
}

function throwBomb(s: S, fromX: number, fromY: number, atX: number, atY: number) {
  if (s.bombs.length >= 16) return;
  const air = 0.7 + s.rng() * 0.2;
  s.bombs.push({ x: atX, y: atY, sx: fromX, sy: fromY, air, airT: air, fuse: 0.9 });
}
function throwRope(s: S, x: number, y: number, angle: number, speed: number, dmg: number) {
  if (s.ropes.length >= 24) return;
  s.ropes.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg });
}

// ---- combat -------------------------------------------------------------------
function hitPlayer(s: S, dmg: number, roped: boolean) {
  if (s.over || s.iframes > 0) return;
  const dodge = Math.min(RUN_CAPS.dodge, s.baseDodge + s.addDodge);
  if (s.rng() < dodge) {
    float(s, s.px, s.py - 22, "DODGE!", ICE);
    s.iframes = 0.25;
    return;
  }
  const resist = Math.min(RUN_CAPS.resist, s.baseResist + s.addResist);
  s.hp -= dmg * (1 - resist);
  s.iframes = HIT_IFRAMES;
  s.flash = 0.35;
  s.shake = 9;
  if (dmg >= 15) s.hitstop = Math.max(s.hitstop, 0.04); // big hits sting
  sfx.play("hurt");
  if (roped) {
    s.rope = ROPE_SECONDS;
    float(s, s.px, s.py - 22, "ROPED!", GOLD);
  }
  if (s.hp <= 0) {
    s.hp = 0;
    s.over = true;
    s.msg = "THE GANG GOT YOU!";
    s.msgT = 2;
    sfx.play("ko");
  }
}

/** Dynamite goes off: hurts the player AND outlaws (bait the toss = real play). */
function explode(s: S, x: number, y: number) {
  s.blasts.push({ x, y, t: 0.28 });
  burst(s, x, y, GOLD, 14, 240);
  burst(s, x, y, CRIMSON, 6, 180);
  smokePuff(s, x, y, 5);
  s.shake = Math.max(s.shake, 10);
  sfx.play("hit");
  if (Math.hypot(x - s.px, y - s.py) < BLAST_R + PLAYER_R) hitPlayer(s, BLAST_DMG, false);
  for (const m of s.mobs) {
    if (m.ko > 0 || m.hp <= 0) continue;
    if (Math.hypot(m.x - x, m.y - y) < BLAST_R + m.r) damageMob(s, m, BLAST_DMG_MOB);
  }
}

function damageMob(s: S, m: Mob, dmg: number) {
  if (m.hp <= 0 || m.ko > 0) return;
  m.hp -= dmg;
  if (m.hp > 0) return;
  // cartoon KO: spin out with stars and slide off screen. Never blood.
  s.kills++;
  s.score += m.pts;
  m.ko = 0.8;
  const away = Math.atan2(m.y - s.py, m.x - s.px) + (s.rng() - 0.5) * 0.6;
  const v = m.boss ? 180 : 260 + s.rng() * 120;
  m.kvx = Math.cos(away) * v;
  m.kvy = Math.sin(away) * v - 60;
  m.spin = (s.rng() < 0.5 ? -1 : 1) * (7 + s.rng() * 6);
  burst(s, m.x, m.y, FOE_COLOR[m.kind], m.boss ? 26 : 9, m.boss ? 260 : 170, true);
  float(s, m.x, m.y - m.r - 6, `+${m.pts}`, "#ffe9b0");
  sfx.play(m.boss ? "ko" : "hit");
  const coinDrops = m.boss ? 5 : s.rng() < m.coin ? 1 : 0;
  for (let i = 0; i < coinDrops && s.coins.length < 80; i++) {
    s.coins.push({ x: m.x + (s.rng() - 0.5) * 26, y: m.y + (s.rng() - 0.5) * 26, ph: s.rng() * 6.3 });
  }
  if (m.kind === "keg") {
    // the powder keg chain-blasts OTHER outlaws only (hurting the player here
    // would punish the exact play we reward: closing in on the tank)
    s.blasts.push({ x: m.x, y: m.y, t: 0.28 });
    burst(s, m.x, m.y, GOLD, 12, 220);
    s.shake = Math.max(s.shake, 8);
    for (const o of s.mobs) {
      if (o.id === m.id || o.ko > 0 || o.hp <= 0) continue;
      if (Math.hypot(o.x - m.x, o.y - m.y) < 70 + o.r) damageMob(s, o, 10);
    }
  }
  if (m.boss) {
    s.msg = m.kind === "stage" ? "STAGECOACH DOWN!" : "GOLDTOOTH DOWN!";
    s.msgT = 1.4;
    s.shake = 10;
    s.hitstop = Math.max(s.hitstop, 0.06);
    if (m.kind === "stage") s.stageDone = true;
    else s.gangDone = true;
  }
}

// ---- level-ups ------------------------------------------------------------------
function openChoices(s: S) {
  const keys: StatKey[] = ["botox", "drugs", "ozempic", "aura"];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(s.rng() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  s.choosing = keys.slice(0, 3);
  sfx.play("score");
}

function applyPick(s: S, k: StatKey) {
  if (k === "botox") { s.addResist += PICK.botox; float(s, s.px, s.py - 26, "ARMORED!", ICE); }
  else if (k === "drugs") { s.addSpeed += PICK.drugs; float(s, s.px, s.py - 26, "FASTER!", ICE); }
  else if (k === "ozempic") { s.addDodge += PICK.ozempic; float(s, s.px, s.py - 26, "SLIPPERY!", "#b8f4c8"); }
  else {
    const before = weaponTier(s.baseAura + s.addAura);
    s.addAura += PICK.auraLevels;
    const after = weaponTier(s.baseAura + s.addAura);
    if (after > before) {
      s.msg = `NEW IRON: ${WEAPONS[after - 1].name.toUpperCase()}`;
      s.msgT = 1.8;
      sfx.play("boost");
    } else {
      float(s, s.px, s.py - 26, "DEADLIER!", GOLD);
    }
  }
  s.level++;
  s.score += LEVEL_SCORE;
  s.xpNeed = 5 + (s.level - 1) * 3;
  s.choosing = null;
  sfx.play("tap");
  if (s.xp >= s.xpNeed) {
    s.xp -= s.xpNeed;
    openChoices(s);
  }
}

/** Level-up card rect i=0..2 (also the pointer hit test in step). */
function choiceRect(i: number, W: number, H: number) {
  const w = W - 72;
  const h = 62;
  return { x: 36, y: H * 0.3 + i * (h + 14), w, h };
}

// Display names per the S4 sheet: Armor / Ride / Gadgets / Weapon.
const PICK_LABEL: Record<StatKey, { name: string; line: string }> = {
  botox: { name: "Armor", line: "Plated duster. Take 6% less damage" },
  drugs: { name: "Ride", line: "Spurred boots. Move 4% faster" },
  ozempic: { name: "Gadgets", line: "Smoke pellets. Dodge 5% more hits" },
  aura: { name: "Weapon", line: "+3 Weapon. Hit harder, unlock bigger irons" },
};

/** Mute toggle hit box (top-right, under the clock). */
function muteRect(w: number) { return { x: w - 40, y: 34, w: 28, h: 28 }; }

// ---- the game -------------------------------------------------------------------
const handle: GameHandle<S> = {
  init: (w, h, run) => {
    const rng = mulberry32(seedFrom(run));
    const sTop = streetTop(h);

    // street furniture, placed once per run from the seed (decorative)
    const props: Prop[] = [];
    for (let i = 0; i < 2; i++) props.push({ kind: "cactus", x: 24 + rng() * (w - 48), y: sTop + 30 + rng() * (h - sTop - 70), r: 12 + rng() * 6 });
    for (let i = 0; i < 2; i++) props.push({ kind: "barrel", x: 24 + rng() * (w - 48), y: sTop + 26 + rng() * (h - sTop - 60), r: 9 + rng() * 4 });
    props.push({ kind: "skull", x: 30 + rng() * (w - 60), y: sTop + 40 + rng() * (h - sTop - 80), r: 7 });
    for (let i = 0; i < 2; i++) props.push({ kind: "post", x: 20 + rng() * (w - 40), y: sTop + 8 + rng() * 14, r: 5 });

    // the storefront parallax row, seeded per run
    const SIGNS = ["SALOON", "BANK", "HOTEL", "JAIL", "GENERAL", "BARBER", "ASSAY"];
    const fronts: Front[] = [];
    let fx = -14;
    while (fx < w + 14) {
      const bw = 54 + rng() * 46;
      fronts.push({
        x: fx, w: bw, roofY: h * (0.055 + rng() * 0.05),
        c: rng() < 0.4 ? ADOBE : rng() < 0.5 ? WOOD : "#7a5230",
        sign: SIGNS[Math.floor(rng() * SIGNS.length)],
        poster: rng() < 0.3, awning: rng() < 0.5,
      });
      fx += bw + 3;
    }

    // baked street speckle texture (drawn every frame from these fixed dots)
    const speckles: { x: number; y: number }[] = [];
    for (let i = 0; i < 120; i++) speckles.push({ x: rng() * w, y: sTop + rng() * (h - sTop) });

    // ambient dust motes
    const motes: Mote[] = [];
    const nMotes = REDUCED_MOTION ? 8 : 24;
    for (let i = 0; i < nMotes; i++) motes.push({ x: rng() * w, y: rng() * h, vx: 6 + rng() * 12, ph: rng() * 6.3 });

    return {
      W: w, H: h, rng, practice: run.practice,
      t: 0, over: false, win: false, score: 0, kills: 0, coinsGot: 0,
      px: w / 2, py: h * 0.62, prevPx: w / 2, prevPy: h * 0.62, pvx: 0, pvy: 0,
      hp: PLAYER_HP, iframes: 1, rope: 0, facing: -Math.PI / 2,
      baseResist: Math.min(E.botox.cap, run.stats.botox * E.botox.perLevel),
      baseSpeed: Math.min(E.drugs.cap, run.stats.drugs * E.drugs.perLevel),
      baseDodge: Math.min(E.ozempic.cap, run.stats.ozempic * E.ozempic.perLevel),
      baseAura: run.stats.aura,
      addResist: 0, addSpeed: 0, addDodge: 0, addAura: 0,
      level: 1, xp: 0, xpNeed: 5,
      choosing: null, lastDown: false, uiLatch: false,
      atkCd: 0.4, spinFx: 0, muzzle: 0, lastFireSfx: 0,
      nextId: 1,
      mobs: [], ropes: [], pshots: [], bombs: [], blasts: [],
      coins: [], parts: [], floats: [],
      spawnCd: 0.8, stageDone: false, gangDone: false,
      plate: null, hitstop: 0,
      msg: "HIGH NOON!", msgT: 1.4, shake: 0, flash: 0,
      camX: 0, camY: 0, zoom: 1,
      props, fronts, speckles,
      weeds: [], weedCd: 2 + rng() * 4, motes,
    };
  },

  step: (s, dt, input, w, h) => {
    s.W = w; s.H = h;
    if (s.over) return;

    // one fresh-down edge for every canvas tap (mute icon, level-up cards)
    const freshDown = input.down && !s.lastDown;
    s.lastDown = input.down;
    if (!input.down) s.uiLatch = false;

    // mute toggle first: it must work mid-run AND while paused on cards
    if (freshDown && input.px != null && input.py != null) {
      const mr = muteRect(w);
      if (input.px >= mr.x - 4 && input.px <= mr.x + mr.w + 4 && input.py >= mr.y - 4 && input.py <= mr.y + mr.h + 4) {
        sfx.setMuted(!sfx.muted());
        sfx.play("tap");
        s.uiLatch = true; // this touch never steers the huntress
      }
    }

    // hit-stop: the whole world freezes (boss intro 500ms, big hits 40-60ms)
    if (s.hitstop > 0) {
      s.hitstop = Math.max(0, s.hitstop - dt);
      return;
    }

    // ── LEVEL UP: the run is paused until a boost card is tapped ─────────────
    if (s.choosing) {
      if (freshDown && !s.uiLatch && input.px != null && input.py != null) {
        for (let i = 0; i < s.choosing.length; i++) {
          const rc = choiceRect(i, w, h);
          if (input.px >= rc.x && input.px <= rc.x + rc.w && input.py >= rc.y && input.py <= rc.y + rc.h) {
            applyPick(s, s.choosing[i]);
            break;
          }
        }
      }
      return; // timer, spawns, and mobs all hold their breath
    }

    s.t += dt;
    s.score += SURVIVAL_SCORE_PER_S * dt;
    if (s.t >= RUN_SECONDS) {
      s.over = true; s.win = true;
      s.msg = "SUNDOWN. STREET HELD!";
      s.msgT = 2;
      sfx.play("score");
      return;
    }
    if (s.msgT > 0) s.msgT = Math.max(0, s.msgT - dt);
    if (s.plate) { s.plate.t -= dt; if (s.plate.t <= 0) s.plate = null; }
    if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 1.6);
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
    if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - dt);
    if (s.rope > 0) s.rope = Math.max(0, s.rope - dt);
    if (s.spinFx > 0) s.spinFx = Math.max(0, s.spinFx - dt);
    if (s.muzzle > 0) s.muzzle = Math.max(0, s.muzzle - dt);

    // ── movement ─────────────────────────────────────────────────────────────
    // Keys first; else chase-the-finger — but ONLY while held (input.down; fix
    // over the slayer donor which steered from hover/stale points), and the
    // roam target sits THUMB_LIFT px above the finger so the thumb never
    // occludes the huntress (donor fix #2).
    const sTop = streetTop(h);
    const speedMul = (1 + Math.min(RUN_CAPS.speed, s.baseSpeed + s.addSpeed)) * (s.rope > 0 ? ROPE_SLOW : 1);
    const spd = BASE_SPEED * speedMul;
    let mvx = 0, mvy = 0;
    if (input.left) mvx -= 1;
    if (input.right) mvx += 1;
    if (input.up) mvy -= 1;
    if (input.downKey) mvy += 1;
    if (mvx || mvy) {
      const n = Math.hypot(mvx, mvy);
      s.px += (mvx / n) * spd * dt;
      s.py += (mvy / n) * spd * dt;
      s.facing = Math.atan2(mvy, mvx);
    } else if (input.down && !s.uiLatch && input.px != null && input.py != null) {
      const tx = clamp(input.px, MARGIN, w - MARGIN);
      const ty = clamp(input.py - THUMB_LIFT, sTop + 10, h - MARGIN);
      const dx = tx - s.px, dy = ty - s.py, d = Math.hypot(dx, dy);
      if (d > 8) {
        const step = Math.min(spd * dt, d - 4);
        s.px += (dx / d) * step;
        s.py += (dy / d) * step;
        s.facing = Math.atan2(dy, dx);
      }
    }
    s.px = clamp(s.px, MARGIN, w - MARGIN);
    s.py = clamp(s.py, sTop + 10, h - MARGIN);

    // camera lead: drift a touch toward where she is heading, ease zoom home
    const instVx = (s.px - s.prevPx) / Math.max(dt, 0.001);
    const instVy = (s.py - s.prevPy) / Math.max(dt, 0.001);
    s.pvx += (instVx - s.pvx) * Math.min(1, dt * 6);
    s.pvy += (instVy - s.pvy) * Math.min(1, dt * 6);
    s.prevPx = s.px; s.prevPy = s.py;
    s.camX += (clamp(s.pvx * 0.07, -12, 12) - s.camX) * Math.min(1, dt * 3.5);
    s.camY += (clamp(s.pvy * 0.05, -8, 8) - s.camY) * Math.min(1, dt * 3.5);
    s.zoom += (1 - s.zoom) * Math.min(1, dt * 2.2);

    // ── auto-fire: tier from Weapon stat (persistent + in-run picks) ─────────
    const effAura = s.baseAura + s.addAura;
    const tier = weaponTier(effAura);
    const wp = WEAPONS[tier - 1];
    // persistent baseline bounded by E.aura.damageCap on its own; in-run picks
    // stack on top, and the whole thing is bounded by the RUN_CAPS ceiling
    const baseAuraDmg = Math.min(E.aura.damageCap, s.baseAura * E.aura.damagePerLevel);
    const dmgMul = 1 + Math.min(RUN_CAPS.auraDamage, baseAuraDmg + s.addAura * E.aura.damagePerLevel);
    let nearest: Mob | null = null, nd = Infinity;
    for (const m of s.mobs) {
      if (m.ko > 0) continue;
      const d = Math.hypot(m.x - s.px, m.y - s.py);
      if (d < nd) { nd = d; nearest = m; }
    }
    if (nearest) s.facing = Math.atan2(nearest.y - s.py, nearest.x - s.px);
    s.atkCd -= dt;
    if (s.atkCd <= 0 && nearest) {
      const aim = Math.atan2(nearest.y - s.py, nearest.x - s.px);
      const hx = s.px + Math.cos(aim) * 16, hy = s.py + Math.sin(aim) * 16;
      const fire = () => {
        s.muzzle = 0.05;
        if (s.t - s.lastFireSfx > 0.09) { sfx.play("fire"); s.lastFireSfx = s.t; }
      };
      if (wp.kind === "knife") {
        if (nd < wp.range) {
          s.atkCd = wp.interval;
          fire();
          for (const off of [-0.28, 0, 0.28]) {
            const v = 360;
            s.pshots.push({ x: hx, y: hy, vx: Math.cos(aim + off) * v, vy: Math.sin(aim + off) * v, dmg: wp.dmg * dmgMul, pierce: 0, life: wp.range / v, r: 5, kind: "knife", rot: aim, hit: new Set() });
          }
        }
      } else if (wp.kind === "bullet" || wp.kind === "gold") {
        if (nd < wp.range) {
          s.atkCd = wp.interval;
          fire();
          smokePuff(s, hx, hy, 1);
          casing(s, hx, hy, aim);
          const v = wp.kind === "gold" ? 540 : 480;
          s.pshots.push({ x: hx, y: hy, vx: Math.cos(aim) * v, vy: Math.sin(aim) * v, dmg: wp.dmg * dmgMul, pierce: wp.kind === "gold" ? 1 : 0, life: 1, r: wp.kind === "gold" ? 6 : 5, kind: wp.kind, rot: aim, hit: new Set() });
        }
      } else if (wp.kind === "spin") {
        if (nd < wp.range + 14) {
          s.atkCd = wp.interval;
          s.spinFx = 0.25;
          fire();
          for (const m of s.mobs) {
            if (m.ko > 0) continue;
            if (Math.hypot(m.x - s.px, m.y - s.py) < wp.range + m.r) damageMob(s, m, wp.dmg * dmgMul);
          }
        }
      } else {
        // briefcase minigun: the bullet hose
        if (nd < wp.range + 40) {
          s.atkCd = wp.interval;
          fire();
          casing(s, hx, hy, aim);
          if (s.rng() < 0.34) smokePuff(s, hx, hy, 1);
          const a = aim + (s.rng() - 0.5) * 0.32;
          const v = 460;
          s.pshots.push({ x: hx, y: hy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: wp.dmg * dmgMul, pierce: 0, life: wp.range / v, r: 4, kind: "hose", rot: a, hit: new Set() });
        }
      }
    }

    // ── spawn director + bosses ─────────────────────────────────────────────
    s.spawnCd -= dt;
    if (s.spawnCd <= 0) {
      spawnWave(s);
      s.spawnCd = Math.max(0.32, 1.15 - s.t * 0.009) * (0.75 + s.rng() * 0.5);
    }
    if (!s.stageDone && s.t >= STAGE_T && !s.mobs.some((m) => m.kind === "stage")) addBoss(s, "stage");
    if (!s.gangDone && s.t >= GANG_T && !s.mobs.some((m) => m.kind === "gang")) addBoss(s, "gang");

    // ── mobs ────────────────────────────────────────────────────────────────
    for (const m of s.mobs) {
      m.ph += dt;
      // KO'd outlaws: spin out with stars and slide off screen (no collision)
      if (m.ko > 0) {
        m.ko -= dt;
        m.x += m.kvx * dt;
        m.y += m.kvy * dt;
        m.kvy += 140 * dt;
        continue;
      }
      if (m.touchCd > 0) m.touchCd -= dt;
      const dx = s.px - m.x, dy = s.py - m.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;

      if (!m.boss) {
        if (m.kind === "dyno") {
          // holds a lob range and tosses dynamite at your future position
          if (d > 200) { m.x += ux * m.speed * dt; m.y += uy * m.speed * dt; }
          else if (d < 130) { m.x -= ux * m.speed * dt; m.y -= uy * m.speed * dt; }
          else { m.x += -uy * m.speed * 0.5 * dt; m.y += ux * m.speed * 0.5 * dt; }
          m.fireCd -= dt;
          if (m.fireCd <= 0 && d < 280) {
            m.fireCd = 2.8 + s.rng() * 0.9;
            throwBomb(s, m.x, m.y, s.px + s.pvx * 0.35 + (s.rng() - 0.5) * 30, s.py + s.pvy * 0.35 + (s.rng() - 0.5) * 30);
          }
        } else if (m.kind === "lasso") {
          // circles at rope range and throws the loop
          if (d > 170) { m.x += ux * m.speed * dt; m.y += uy * m.speed * dt; }
          else if (d < 110) { m.x -= ux * m.speed * dt; m.y -= uy * m.speed * dt; }
          else { m.x += -uy * m.speed * 0.6 * dt; m.y += ux * m.speed * 0.6 * dt; }
          m.fireCd -= dt;
          if (m.fireCd <= 0 && d < 240) {
            m.fireCd = 2.6 + s.rng() * 0.8;
            throwRope(s, m.x, m.y, Math.atan2(dy, dx), 230, m.dmg);
          }
        } else if (m.kind === "vulture") {
          // erratic: seek + strong perpendicular wobble
          const wob = Math.sin(m.ph * 5) * 1.1;
          m.x += (ux + -uy * wob) * m.speed * dt;
          m.y += (uy + ux * wob) * m.speed * dt;
        } else {
          m.x += ux * m.speed * dt;
          m.y += uy * m.speed * dt;
        }
      } else if (m.kind === "stage") {
        // runaway stagecoach: line up, CHARGE across, rest; spills rustlers
        m.modeT -= dt;
        if (m.mode === 0) {
          m.x += ux * m.speed * dt; m.y += uy * m.speed * dt;
          if (m.modeT <= 0) { m.mode = 1; m.modeT = 0.7; m.tx = ux; m.ty = uy; }
        } else if (m.mode === 1) {
          m.tx = ux; m.ty = uy; // track while telegraphing
          if (m.modeT <= 0) { m.mode = 2; m.modeT = 0.8; }
        } else {
          m.x += m.tx * m.speed * 5.2 * dt;
          m.y += m.ty * m.speed * 5.2 * dt;
          if (s.rng() < 0.3) smokePuff(s, m.x - m.tx * m.r, m.y + m.r * 0.6, 1); // dust trail
          if (m.modeT <= 0) { m.mode = 0; m.modeT = 1.2; }
        }
        m.fireCd -= dt;
        if (m.fireCd <= 0) {
          m.fireCd = 6.5;
          for (let i = 0; i < 3; i++) addFoe(s, "rustler", m.x + (s.rng() - 0.5) * 60, m.y + (s.rng() - 0.5) * 60);
        }
      } else {
        // Butch Goldtooth: slow stalk + a ring of dynamite around YOU. Run the gaps.
        m.x += ux * m.speed * dt;
        m.y += uy * m.speed * dt;
        m.fireCd -= dt;
        if (m.fireCd <= 0) {
          m.fireCd = 5.5;
          const n = 6, off = s.rng() * Math.PI * 2, ringR = 70 + s.rng() * 40;
          for (let i = 0; i < n; i++) {
            const a = off + (i / n) * Math.PI * 2;
            throwBomb(s, m.x, m.y, s.px + Math.cos(a) * ringR, s.py + Math.sin(a) * ringR);
          }
          float(s, m.x, m.y - m.r - 10, "EAT DIRT!", CRIMSON);
        }
      }
      if (m.boss) {
        m.x = clamp(m.x, MARGIN, w - MARGIN);
        m.y = clamp(m.y, sTop, h - MARGIN);
      }
      // contact
      if (m.touchCd <= 0 && Math.hypot(m.x - s.px, m.y - s.py) < m.r + PLAYER_R) {
        m.touchCd = TOUCH_CD;
        hitPlayer(s, m.dmg, false);
      }
    }
    // sweep: KO slide finished or fully off screen
    s.mobs = s.mobs.filter((m) => (m.ko > 0 ? m.ko > 0.001 && m.x > -60 && m.x < w + 60 && m.y < h + 60 : m.hp > 0));

    // ── player shots -> outlaws ─────────────────────────────────────────────
    for (const b of s.pshots) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.kind === "knife") b.rot += 14 * dt;
      for (const m of s.mobs) {
        if (m.hp <= 0 || m.ko > 0 || b.hit.has(m.id)) continue;
        if (Math.hypot(m.x - b.x, m.y - b.y) < m.r + b.r) {
          b.hit.add(m.id);
          damageMob(s, m, b.dmg);
          b.pierce--;
          if (b.pierce < 0) { b.life = 0; break; }
        }
      }
    }
    s.pshots = s.pshots.filter((b) => b.life > 0 && b.x > -30 && b.x < w + 30 && b.y > -30 && b.y < h + 30);

    // ── lasso loops -> player ───────────────────────────────────────────────
    for (const b of s.ropes) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (Math.hypot(b.x - s.px, b.y - s.py) < PLAYER_R + 7) {
        hitPlayer(s, b.dmg, true);
        b.x = -999;
      }
    }
    s.ropes = s.ropes.filter((b) => b.x > -40 && b.x < w + 40 && b.y > -40 && b.y < h + 40);

    // ── dynamite: flight -> fuse ring -> blast ──────────────────────────────
    for (const b of s.bombs) {
      if (b.air > 0) {
        b.air -= dt;
        if (b.air <= 0) burst(s, b.x, b.y, "#cbb9a2", 3, 60); // thud puff
      } else {
        b.fuse -= dt;
        if (b.fuse <= 0) explode(s, b.x, b.y);
      }
    }
    s.bombs = s.bombs.filter((b) => b.air > 0 || b.fuse > 0);
    for (const bl of s.blasts) bl.t -= dt;
    s.blasts = s.blasts.filter((b) => b.t > 0);

    // ── bounty coins: magnet, pickup, level-ups ─────────────────────────────
    for (const c of s.coins) {
      c.ph += dt;
      const dx = s.px - c.x, dy = s.py - c.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < COIN_MAGNET) {
        c.x += (dx / dd) * 250 * dt;
        c.y += (dy / dd) * 250 * dt;
      }
      if (dd < 22) {
        c.x = -999;
        s.coinsGot++;
        s.xp++;
        s.score += COIN_SCORE;
        burst(s, s.px, s.py, GOLD, 4, 120);
        sfx.play("pickup");
        if (s.xp >= s.xpNeed && !s.choosing) {
          s.xp -= s.xpNeed;
          openChoices(s);
        }
      }
    }
    s.coins = s.coins.filter((c) => c.x > -500);

    // ── ambient west: tumbleweeds + dust motes ──────────────────────────────
    s.weedCd -= dt;
    if (s.weedCd <= 0 && s.weeds.length < 2) {
      s.weedCd = 5 + s.rng() * 5;
      const fromLeft = s.rng() < 0.5;
      s.weeds.push({
        x: fromLeft ? -20 : w + 20,
        y: sTop + 30 + s.rng() * (h - sTop - 80),
        r: 8 + s.rng() * 7,
        vx: (fromLeft ? 1 : -1) * (40 + s.rng() * 45),
        rot: 0, rv: (fromLeft ? 1 : -1) * (3 + s.rng() * 2),
      });
    }
    for (const tw of s.weeds) { tw.x += tw.vx * dt; tw.rot += tw.rv * dt; }
    s.weeds = s.weeds.filter((tw) => tw.x > -40 && tw.x < w + 40);
    for (const mo of s.motes) {
      mo.x += mo.vx * dt;
      mo.ph += dt;
      if (mo.x > w + 4) { mo.x = -4; mo.y = s.rng() * h; }
    }

    // particles + floaters
    for (const p of s.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.kind === "smoke") { p.vy -= 10 * dt; p.r += 6 * dt; }
      else if (p.kind === "casing") {
        p.vy += 900 * dt; p.rot += p.rv * dt;
        if (p.y > p.gy && p.vy > 0) { p.vy *= -0.45; p.vx *= 0.7; }
      } else p.vy += 60 * dt;
    }
    s.parts = s.parts.filter((p) => p.life > 0);
    for (const f of s.floats) { f.y -= 34 * dt; f.life -= dt; }
    s.floats = s.floats.filter((f) => f.life > 0);
  },

  draw: (ctx, s, w, h) => {
    ctx.save();
    // camera: punch-in zoom about center + lead offset + shake
    const jx = s.shake > 0 && !REDUCED_MOTION ? (Math.random() - 0.5) * s.shake : 0;
    const jy = s.shake > 0 && !REDUCED_MOTION ? (Math.random() - 0.5) * s.shake : 0;
    ctx.translate(w / 2, h / 2);
    ctx.scale(s.zoom, s.zoom);
    ctx.translate(-w / 2, -h / 2);
    ctx.translate(-s.camX + jx, -s.camY + jy);

    drawWorld(ctx, s, w, h);

    // bounty coins
    for (const c of s.coins) {
      const bob = Math.sin(c.ph * 4) * 2;
      spr(ctx, ART.coin, c.x, c.y + bob, 18, () => drawCoin(ctx, c.x, c.y + bob, 7, c.ph));
    }

    // dynamite (flight arc, then the fuse ring telegraph)
    for (const b of s.bombs) drawBomb(ctx, s, b);

    // outlaws + bosses
    for (const m of s.mobs) drawMob(ctx, s, m);

    // player shots
    for (const b of s.pshots) drawPShot(ctx, b);

    // lasso loops
    for (const b of s.ropes) {
      ctx.strokeStyle = "#d8b06a";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x + 4, b.y + 4, 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // blast rings
    for (const bl of s.blasts) {
      const p = 1 - bl.t / 0.28;
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 4 - p * 3;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, BLAST_R * (0.4 + p * 0.8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawPlayer(ctx, s);

    // particles (dots, stars, smoke, casings)
    for (const p of s.parts) {
      ctx.globalAlpha = clamp(p.life * 1.8, 0, 1);
      if (p.kind === "star") drawStar(ctx, p.x, p.y, p.r + 1.5, p.c);
      else if (p.kind === "smoke") {
        ctx.fillStyle = p.c;
        ctx.globalAlpha *= 0.45;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "casing") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-2.5, -1, 5, 2);
        ctx.restore();
      } else {
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // floaters
    ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const f of s.floats) {
      ctx.globalAlpha = clamp(f.life * 1.6, 0, 1);
      ctx.fillStyle = f.c;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore(); // end camera

    // noon vignette: warm center, baked dark corners (outside the camera)
    const v = ctx.createRadialGradient(w / 2, h * 0.42, h * 0.18, w / 2, h / 2, h * 0.78);
    v.addColorStop(0, "rgba(255,214,140,0.07)");
    v.addColorStop(0.55, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(7,8,12,0.34)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);

    // damage flash (reduced motion: a static border instead)
    if (s.flash > 0 && !REDUCED_MOTION) { ctx.fillStyle = `rgba(227,61,78,${s.flash * 0.35})`; ctx.fillRect(0, 0, w, h); }
    else if (s.flash > 0) { ctx.strokeStyle = "rgba(227,61,78,0.7)"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6); }

    drawHUD(ctx, s, w, h);
    if (s.plate) drawPlate(ctx, s.plate, w, h);
    if (s.choosing) drawChoices(ctx, s, w, h);

    if (s.msgT > 0 && !s.choosing && !s.plate) {
      ctx.globalAlpha = Math.min(1, s.msgT);
      ctx.textAlign = "center";
      ctx.fillStyle = s.msg.startsWith("NEW IRON") ? GOLD : s.msg.startsWith("SUNDOWN") ? ICE : s.msg.includes("GOT YOU") ? CRIMSON : WHITE;
      ctx.font = "800 22px Georgia, 'Times New Roman', serif";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 4;
      ctx.strokeText(s.msg, w / 2, h * 0.4);
      ctx.fillText(s.msg, w / 2, h * 0.4);
      ctx.globalAlpha = 1;
    }
  },
  done: (s) => s.over,
  score: (s) => Math.round(s.score),
};

// ---- draw helpers -----------------------------------------------------------
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
/** The long baked shadow every street entity casts (sun high to the left). */
function longShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k = 1) {
  ctx.save();
  ctx.fillStyle = "rgba(35,18,8,0.28)";
  ctx.beginPath();
  ctx.ellipse(x + r * 1.05 * k, y + r * 0.5, r * 1.65 * k, r * 0.4, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ph: number) {
  const squish = 0.55 + Math.abs(Math.sin(ph * 2.6)) * 0.45; // spinning coin
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(squish, 1);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b07f1e";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#b07f1e";
  ctx.font = "800 8px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("$", 0, 3);
  ctx.restore();
}

/** Sky, mesa, storefront row (each on its own parallax plane), street, props. */
function drawWorld(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  if (ready(ART.bg)) {
    ctx.drawImage(ART.bg, -16, -16, w + 32, h + 32);
    return;
  }
  const sTop = streetTop(h);
  const horizon = h * 0.16;

  // ── sky plane (moves the least against the camera) ───────────────────────
  ctx.save();
  ctx.translate(s.camX * 0.75, s.camY * 0.75);
  const sky = ctx.createLinearGradient(0, -16, 0, sTop);
  sky.addColorStop(0, SKY_HI);
  sky.addColorStop(1, SKY_LO);
  ctx.fillStyle = sky;
  ctx.fillRect(-24, -24, w + 48, sTop + 40);
  // the noon sun + glow, upper left
  const sunX = w * 0.2, sunY = h * 0.055;
  const glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 60);
  glow.addColorStop(0, "rgba(255,240,200,0.95)");
  glow.addColorStop(0.3, "rgba(255,220,150,0.5)");
  glow.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 60, sunY - 60, 120, 120);
  ctx.fillStyle = "#fff2cf";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 11, 0, Math.PI * 2);
  ctx.fill();
  // distant mesas
  ctx.fillStyle = "#b8743f";
  ctx.beginPath();
  ctx.moveTo(-24, horizon);
  ctx.lineTo(w * 0.1, horizon - 22);
  ctx.lineTo(w * 0.22, horizon - 22);
  ctx.lineTo(w * 0.3, horizon);
  ctx.lineTo(w * 0.55, horizon);
  ctx.lineTo(w * 0.66, horizon - 30);
  ctx.lineTo(w * 0.82, horizon - 30);
  ctx.lineTo(w * 0.94, horizon);
  ctx.lineTo(w + 24, horizon);
  ctx.lineTo(w + 24, sTop + 20);
  ctx.lineTo(-24, sTop + 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── storefront plane (middle parallax) ───────────────────────────────────
  ctx.save();
  ctx.translate(s.camX * 0.5, s.camY * 0.5);
  for (const f of s.fronts) drawFront(ctx, f, sTop);
  // boardwalk planks
  ctx.fillStyle = "#8a5f38";
  ctx.fillRect(-24, sTop - 12, w + 48, 12);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  for (let x = -20; x < w + 24; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, sTop - 12);
    ctx.lineTo(x, sTop);
    ctx.stroke();
  }
  ctx.restore();

  // ── street plane (full camera) ───────────────────────────────────────────
  const street = ctx.createLinearGradient(0, sTop, 0, h);
  street.addColorStop(0, "#d4ad76");
  street.addColorStop(0.3, SAND);
  street.addColorStop(1, SAND_DARK);
  ctx.fillStyle = street;
  ctx.fillRect(-24, sTop, w + 48, h - sTop + 24);
  // the storefronts throw one long shadow band onto the street
  const bandShadow = ctx.createLinearGradient(0, sTop, 0, sTop + 34);
  bandShadow.addColorStop(0, "rgba(35,18,8,0.3)");
  bandShadow.addColorStop(1, "rgba(35,18,8,0)");
  ctx.fillStyle = bandShadow;
  ctx.fillRect(-24, sTop, w + 48, 34);
  // baked speckle texture + wagon ruts
  ctx.fillStyle = "rgba(60,35,15,0.09)";
  for (const sp of s.speckles) {
    ctx.fillRect(sp.x, sp.y, 2, 1.4);
  }
  ctx.strokeStyle = "rgba(60,35,15,0.13)";
  ctx.lineWidth = 5;
  for (const ry of [0.55, 0.72]) {
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 14) {
      const y = h * ry + Math.sin(x * 0.03 + ry * 9) * 5;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // heat shimmer band over the street top (subtle, animated)
  if (!REDUCED_MOTION) {
    ctx.strokeStyle = "rgba(255,244,214,0.07)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const yy = sTop + 8 + k * 7;
      for (let x = -20; x <= w + 20; x += 10) {
        const y = yy + Math.sin(x * 0.06 + s.t * (2 + k * 0.7)) * 2;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // props with their long shadows
  for (const p of s.props) drawProp(ctx, p);
  // tumbleweeds
  for (const tw of s.weeds) drawWeed(ctx, tw);
  // drifting dust motes
  ctx.fillStyle = "rgba(255,236,190,1)";
  for (const mo of s.motes) {
    ctx.globalAlpha = 0.08 + Math.abs(Math.sin(mo.ph)) * 0.1;
    ctx.beginPath();
    ctx.arc(mo.x, mo.y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawFront(ctx: CanvasRenderingContext2D, f: Front, sTop: number) {
  // facade
  ctx.fillStyle = f.c;
  ctx.fillRect(f.x, f.roofY, f.w, sTop - 12 - f.roofY);
  // false-front roofline + trim
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(f.x, f.roofY, f.w, 6);
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(f.x + (f.w / 4) * i, f.roofY + 6);
    ctx.lineTo(f.x + (f.w / 4) * i, sTop - 12);
    ctx.stroke();
  }
  // sign board
  ctx.fillStyle = "#3a2415";
  ctx.fillRect(f.x + 4, f.roofY + 9, f.w - 8, 13);
  ctx.fillStyle = "#e8d5a8";
  ctx.font = "700 8px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.fillText(f.sign, f.x + f.w / 2, f.roofY + 18, f.w - 12);
  // door + window
  ctx.fillStyle = "rgba(20,12,6,0.75)";
  ctx.fillRect(f.x + f.w * 0.15, sTop - 34, f.w * 0.22, 22);
  ctx.fillStyle = "#f7dfa0";
  ctx.globalAlpha = 0.5;
  ctx.fillRect(f.x + f.w * 0.55, sTop - 34, f.w * 0.28, 14);
  ctx.globalAlpha = 1;
  // awning
  if (f.awning) {
    ctx.fillStyle = "rgba(140,40,40,0.85)";
    ctx.beginPath();
    ctx.moveTo(f.x + 2, f.roofY + 26);
    ctx.lineTo(f.x + f.w - 2, f.roofY + 26);
    ctx.lineTo(f.x + f.w - 8, f.roofY + 36);
    ctx.lineTo(f.x + 8, f.roofY + 36);
    ctx.closePath();
    ctx.fill();
  }
  // WANTED poster (the era wink)
  if (f.poster) {
    ctx.fillStyle = "#e8d5a8";
    ctx.fillRect(f.x + f.w * 0.4, sTop - 40, 14, 18);
    ctx.fillStyle = "#3a2415";
    ctx.font = "700 4.5px Georgia, serif";
    ctx.fillText("WANTED", f.x + f.w * 0.4 + 7, sTop - 34);
    ctx.fillStyle = "rgba(58,36,21,0.6)";
    ctx.beginPath();
    ctx.arc(f.x + f.w * 0.4 + 7, sTop - 28, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawProp(ctx: CanvasRenderingContext2D, p: Prop) {
  longShadow(ctx, p.x, p.y, p.r, 0.9);
  if (p.kind === "cactus") {
    ctx.fillStyle = SAGE;
    rrect(ctx, p.x - 3.5, p.y - p.r * 1.8, 7, p.r * 1.9, 3.5);
    ctx.fill();
    rrect(ctx, p.x - p.r, p.y - p.r * 1.3, 6, p.r * 0.7, 3);
    ctx.fill();
    rrect(ctx, p.x + p.r - 6, p.y - p.r * 1.1, 6, p.r * 0.6, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(p.x - 1, p.y - p.r * 1.7, 2, p.r * 1.6);
  } else if (p.kind === "barrel") {
    ctx.fillStyle = WOOD;
    rrect(ctx, p.x - p.r * 0.8, p.y - p.r * 1.3, p.r * 1.6, p.r * 1.4, 3);
    ctx.fill();
    ctx.strokeStyle = "#3a2415";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.x - p.r * 0.8, p.y - p.r * 0.9);
    ctx.lineTo(p.x + p.r * 0.8, p.y - p.r * 0.9);
    ctx.moveTo(p.x - p.r * 0.8, p.y - p.r * 0.35);
    ctx.lineTo(p.x + p.r * 0.8, p.y - p.r * 0.35);
    ctx.stroke();
  } else if (p.kind === "skull") {
    ctx.fillStyle = "#e8ddc4";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, p.r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x - p.r, p.y - p.r * 0.7);
    ctx.lineTo(p.x - p.r * 1.5, p.y - p.r * 1.1);
    ctx.moveTo(p.x + p.r, p.y - p.r * 0.7);
    ctx.lineTo(p.x + p.r * 1.5, p.y - p.r * 1.1);
    ctx.strokeStyle = "#e8ddc4";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(p.x - 2.4, p.y - 3.6, 1.4, 0, Math.PI * 2);
    ctx.arc(p.x + 2.4, p.y - 3.6, 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // hitching post
    ctx.strokeStyle = WOOD;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x - 10, p.y);
    ctx.lineTo(p.x - 10, p.y - 14);
    ctx.moveTo(p.x + 10, p.y);
    ctx.lineTo(p.x + 10, p.y - 14);
    ctx.moveTo(p.x - 12, p.y - 13);
    ctx.lineTo(p.x + 12, p.y - 13);
    ctx.stroke();
  }
}
function drawWeed(ctx: CanvasRenderingContext2D, tw: Weed) {
  longShadow(ctx, tw.x, tw.y + tw.r * 0.5, tw.r * 0.8, 0.8);
  ctx.save();
  ctx.translate(tw.x, tw.y);
  ctx.rotate(tw.rot);
  ctx.strokeStyle = "#a08348";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * tw.r * 0.3, Math.sin(a) * tw.r * 0.3, tw.r * 0.7, a, a + 2.2);
    ctx.stroke();
  }
  ctx.restore();
}
function drawBomb(ctx: CanvasRenderingContext2D, s: S, b: Bomb) {
  if (b.air > 0) {
    // landing shadow grows as the stick falls
    const p = 1 - b.air / b.airT;
    ctx.fillStyle = `rgba(35,18,8,${0.1 + p * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, 5 + p * 4, 2.4 + p * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // the stick arcs through the air, spinning
    const ax = b.sx + (b.x - b.sx) * p;
    const ay = b.sy + (b.y - b.sy) * p - Math.sin(p * Math.PI) * 46;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(p * 9);
    ctx.fillStyle = CRIMSON;
    rrect(ctx, -6, -2.5, 12, 5, 2);
    ctx.fill();
    ctx.strokeStyle = "#e8d5a8";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(9, -3);
    ctx.stroke();
    ctx.restore();
  } else {
    // fuse ring telegraph: blinks faster as it runs out
    const urgency = 1 - b.fuse / 0.9;
    const blink = Math.sin(s.t * (8 + urgency * 18)) > 0;
    ctx.globalAlpha = blink ? 0.75 : 0.3;
    ctx.strokeStyle = CRIMSON;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, BLAST_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = CRIMSON;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BLAST_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // the stick itself with a sparking fuse
    ctx.fillStyle = CRIMSON;
    rrect(ctx, b.x - 6, b.y - 2.5, 12, 5, 2);
    ctx.fill();
    drawStar(ctx, b.x + 8, b.y - 5, 3 + Math.sin(s.t * 20) * 1.2, GOLD);
  }
}
function drawPShot(ctx: CanvasRenderingContext2D, b: PShot) {
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.kind === "knife") {
    ctx.rotate(b.rot);
    ctx.fillStyle = "#d7dde8";
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-3, -2.5);
    ctx.lineTo(-3, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = WOOD;
    ctx.fillRect(-6, -1.5, 3.5, 3);
  } else if (b.kind === "bullet") {
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = "#ffd27a";
    ctx.shadowColor = "#ffd27a";
    ctx.shadowBlur = 6;
    ctx.fillRect(-6, -2, 12, 4);
    ctx.shadowBlur = 0;
  } else if (b.kind === "gold") {
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = GOLD;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 10;
    ctx.fillRect(-8, -2.5, 16, 5);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = "#ffe9b0";
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
/** KO'd outlaws spin with orbiting stars; alive ones get faces + era props. */
function drawMob(ctx: CanvasRenderingContext2D, s: S, m: Mob) {
  if (m.ko > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(m.ko * 2.2, 0, 1);
    ctx.translate(m.x, m.y);
    ctx.rotate((0.8 - m.ko) * m.spin);
    ctx.translate(-m.x, -m.y);
    drawMobBody(ctx, s, m);
    ctx.restore();
    // dizzy stars orbit the KO'd outlaw
    for (let i = 0; i < 3; i++) {
      const a = s.t * 6 + (i / 3) * Math.PI * 2;
      drawStar(ctx, m.x + Math.cos(a) * (m.r + 8), m.y - m.r - 4 + Math.sin(a) * 4, 3.5, GOLD);
    }
    ctx.globalAlpha = 1;
    return;
  }
  longShadow(ctx, m.x, m.y + m.r * 0.6, m.r, m.boss ? 1.2 : 1);
  drawMobBody(ctx, s, m);
  // damaged HP pip
  if (m.hp < m.hpMax && !m.boss) {
    const frac = m.hp / m.hpMax;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(m.x - m.r * 0.8, m.y - m.r - 7, m.r * 1.6, 3.5);
    ctx.fillStyle = frac > 0.5 ? "#6ee6a0" : frac > 0.25 ? GOLD : CRIMSON;
    ctx.fillRect(m.x - m.r * 0.8, m.y - m.r - 7, m.r * 1.6 * frac, 3.5);
  }
}
function drawMobBody(ctx: CanvasRenderingContext2D, s: S, m: Mob) {
  const im = ART[m.kind];
  spr(ctx, im, m.x, m.y, m.r * 2.6, () => {
    const { x, y, r } = m;
    if (m.kind === "stage") {
      // runaway stagecoach: cabin + luggage + spinning wheels
      ctx.fillStyle = FOE_COLOR.stage;
      rrect(ctx, x - r, y - r * 0.8, r * 2, r * 1.2, 6);
      ctx.fill();
      ctx.fillStyle = "#5a3620";
      rrect(ctx, x - r * 0.7, y - r * 1.15, r * 1.4, r * 0.4, 3);
      ctx.fill();
      ctx.fillStyle = "#f7dfa0";
      ctx.globalAlpha = 0.6;
      rrect(ctx, x - r * 0.55, y - r * 0.55, r * 0.5, r * 0.5, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.5;
      rrect(ctx, x - r, y - r * 0.8, r * 2, r * 1.2, 6);
      ctx.stroke();
      // wheels
      for (const wx of [-0.62, 0.62]) {
        const cx = x + r * wx, cy = y + r * 0.55;
        ctx.fillStyle = "#3a2415";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#d8b06a";
        ctx.lineWidth = 2;
        const spin = m.ph * (m.mode === 2 ? 26 : 9);
        for (let i = 0; i < 4; i++) {
          const a = spin + (i / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36);
          ctx.stroke();
        }
      }
      if (m.mode === 1) { // telegraphing the charge
        ctx.fillStyle = CRIMSON;
        ctx.font = "800 18px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText("!", x, y - r * 1.4);
      }
      return;
    }
    // body
    ctx.fillStyle = FOE_COLOR[m.kind];
    ctx.beginPath();
    if (m.kind === "keg") rrect(ctx, x - r, y - r, r * 2, r * 2, 6);
    else if (m.kind === "vulture") ctx.ellipse(x, y, r * 1.1, r * 0.75, 0, 0, Math.PI * 2);
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // faces + era props (cute vectors the sprite will replace)
    if (m.kind === "vulture") {
      const flap = Math.sin(m.ph * 9) * r * 0.5;
      ctx.fillStyle = "#3a3a44";
      ctx.beginPath();
      ctx.moveTo(x - r * 0.6, y);
      ctx.quadraticCurveTo(x - r * 1.7, y - flap, x - r * 2.1, y - flap * 0.4);
      ctx.quadraticCurveTo(x - r * 1.4, y + r * 0.3, x - r * 0.6, y + r * 0.2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + r * 0.6, y);
      ctx.quadraticCurveTo(x + r * 1.7, y - flap, x + r * 2.1, y - flap * 0.4);
      ctx.quadraticCurveTo(x + r * 1.4, y + r * 0.3, x + r * 0.6, y + r * 0.2);
      ctx.fill();
      ctx.fillStyle = CRIMSON; // bald red head
      ctx.beginPath();
      ctx.arc(x, y - r * 0.5, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GOLD; // beak
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.5);
      ctx.lineTo(x + r * 0.55, y - r * 0.35);
      ctx.lineTo(x, y - r * 0.2);
      ctx.closePath();
      ctx.fill();
      return;
    }
    // eyes + bandana mask for the humans
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.25, r * 0.11, 0, Math.PI * 2);
    ctx.arc(x + r * 0.3, y - r * 0.25, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
    if (m.kind === "rustler" || m.kind === "keg" || m.kind === "gang") {
      ctx.fillStyle = m.kind === "gang" ? CRIMSON : "#a83232";
      ctx.beginPath();
      ctx.moveTo(x - r * 0.62, y);
      ctx.lineTo(x + r * 0.62, y);
      ctx.lineTo(x, y + r * 0.62);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y + r * 0.22, r * 0.26, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    // hats all around (the era read)
    ctx.fillStyle = m.kind === "gang" ? CHAR : "#4a341f";
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.62, r * 0.85, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    rrect(ctx, x - r * 0.42, y - r * 1.15, r * 0.84, r * 0.6, 3);
    ctx.fill();
    if (m.kind === "gang") {
      ctx.fillStyle = GOLD; // hat band + the gold tooth grin
      ctx.fillRect(x - r * 0.42, y - r * 0.72, r * 0.84, r * 0.12);
      ctx.fillRect(x - r * 0.1, y + r * 0.26, r * 0.2, r * 0.16);
      // bandolier
      ctx.strokeStyle = "#5a4a2a";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y - r * 0.2);
      ctx.lineTo(x + r * 0.6, y + r * 0.7);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x - r * 0.5 + i * r * 0.4, y - r * 0.06 + i * r * 0.28, 3, 6);
      }
    } else if (m.kind === "dyno") {
      // holds a lit stick when a throw is coming
      if (m.fireCd < 0.6) {
        ctx.fillStyle = CRIMSON;
        rrect(ctx, x + r * 0.5, y - r * 0.9, 5, 11, 2);
        ctx.fill();
        drawStar(ctx, x + r * 0.62, y - r * 1.1, 2.6 + Math.sin(s.t * 20), GOLD);
      }
    } else if (m.kind === "lasso") {
      // rope loop spins overhead
      const a = m.ph * 7;
      ctx.strokeStyle = "#d8b06a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 4, y - r - 8, 9, 3.5, a, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m.kind === "keg") {
      // the powder keg on his back
      ctx.fillStyle = WOOD;
      rrect(ctx, x - r * 0.55, y - r - 10, r * 1.1, 10, 3);
      ctx.fill();
      ctx.strokeStyle = "#3a2415";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.55, y - r - 5);
      ctx.lineTo(x + r * 0.55, y - r - 5);
      ctx.stroke();
    }
  });
}
function drawPlayer(ctx: CanvasRenderingContext2D, s: S) {
  const blink = s.iframes > 0 && Math.floor(s.t * 18) % 2 === 0;
  if (blink) return;
  const { px: x, py: y } = s;
  longShadow(ctx, x, y + 12, PLAYER_R, 1.1);
  // katana spin ring
  if (s.spinFx > 0) {
    const p = 1 - s.spinFx / 0.25;
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = "#e6ecf5";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 40 + p * 62, s.t * 9, s.t * 9 + 4.6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  spr(ctx, ART.player, x, y, 46, () => {
    // crimson poncho body
    ctx.fillStyle = CRIMSON;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 11, y + 14);
    ctx.lineTo(x - 11, y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 9);
    ctx.lineTo(x + 8, y + 9);
    ctx.stroke();
    // head
    ctx.fillStyle = "#ffd9a8";
    ctx.beginPath();
    ctx.arc(x, y - 9, 8.5, 0, Math.PI * 2);
    ctx.fill();
    // determined anime eyes
    ctx.fillStyle = INK;
    ctx.fillRect(x - 5, y - 11, 3, 3.6);
    ctx.fillRect(x + 2, y - 11, 3, 3.6);
    // wide-brim hat with a gold band
    ctx.fillStyle = CHAR;
    ctx.beginPath();
    ctx.ellipse(x, y - 14.5, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    rrect(ctx, x - 6.5, y - 24, 13, 10, 3);
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.fillRect(x - 6.5, y - 16.5, 13, 2.4);
    // the bounty star on her chest
    drawStar(ctx, x, y + 3, 3.4, GOLD);
  });
  // roped marker
  if (s.rope > 0) {
    ctx.strokeStyle = "#d8b06a";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 15, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // weapon at the hand + muzzle flash
  const tier = weaponTier(s.baseAura + s.addAura);
  const wp = WEAPONS[tier - 1];
  const hx = x + Math.cos(s.facing) * 16, hy = y + Math.sin(s.facing) * 16;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(s.facing);
  if (wp.kind === "knife") {
    ctx.fillStyle = "#d7dde8";
    for (const o of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(9, o * 1.3);
      ctx.lineTo(2, o - 1.5);
      ctx.lineTo(2, o + 1.5);
      ctx.closePath();
      ctx.fill();
    }
  } else if (wp.kind === "bullet") {
    ctx.fillStyle = "#5c6470";
    rrect(ctx, 0, -2.5, 11, 5, 2);
    ctx.fill();
    ctx.fillStyle = WOOD;
    rrect(ctx, -3, -1, 5, 5, 1.5);
    ctx.fill();
  } else if (wp.kind === "spin") {
    ctx.strokeStyle = "#e6ecf5";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();
  } else if (wp.kind === "gold") {
    ctx.fillStyle = GOLD;
    rrect(ctx, 0, -3, 13, 6, 2);
    ctx.fill();
    ctx.fillStyle = "#b07f1e";
    rrect(ctx, -3, -1, 5, 5, 1.5);
    ctx.fill();
  } else {
    // the briefcase minigun
    ctx.fillStyle = CHAR;
    rrect(ctx, -2, -6, 14, 12, 2);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.2;
    rrect(ctx, -2, -6, 14, 12, 2);
    ctx.stroke();
    ctx.fillStyle = "#5c6470";
    for (const o of [-3, 0, 3]) ctx.fillRect(12, o - 1, 7, 2);
  }
  if (s.muzzle > 0 && wp.kind !== "spin" && wp.kind !== "knife") {
    drawStar(ctx, wp.kind === "hose" ? 21 : 14, 0, 5, "#fff2cf");
  }
  ctx.restore();
}
function drawHUD(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  // score + KOs
  ctx.textAlign = "left";
  ctx.fillStyle = WHITE;
  ctx.font = "800 20px ui-sans-serif, system-ui, sans-serif";
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 3;
  const sc = String(Math.round(s.score));
  ctx.strokeText(sc, 12, 26);
  ctx.fillText(sc, 12, 26);
  ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#f5ead0";
  ctx.strokeText(`${s.kills} outlaws run out of town`, 12, 42);
  ctx.fillText(`${s.kills} outlaws run out of town`, 12, 42);
  // time left
  const left = Math.max(0, Math.ceil(RUN_SECONDS - s.t));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  ctx.textAlign = "right";
  ctx.font = "800 18px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = left <= 10 ? "#ffe9b0" : WHITE;
  ctx.strokeText(clock, w - 12, 26);
  ctx.fillText(clock, w - 12, 26);
  // mute toggle (canvas hit-tested in step)
  const mr = muteRect(w);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  rrect(ctx, mr.x, mr.y, mr.w, mr.h, 7);
  ctx.fill();
  ctx.fillStyle = sfx.muted() ? "#8b95ad" : GOLD;
  ctx.beginPath(); // speaker
  ctx.moveTo(mr.x + 7, mr.y + 11);
  ctx.lineTo(mr.x + 11, mr.y + 11);
  ctx.lineTo(mr.x + 16, mr.y + 6);
  ctx.lineTo(mr.x + 16, mr.y + 22);
  ctx.lineTo(mr.x + 11, mr.y + 17);
  ctx.lineTo(mr.x + 7, mr.y + 17);
  ctx.closePath();
  ctx.fill();
  if (sfx.muted()) {
    ctx.strokeStyle = CRIMSON;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(mr.x + 19, mr.y + 9);
    ctx.lineTo(mr.x + 25, mr.y + 19);
    ctx.stroke();
  } else {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(mr.x + 17, mr.y + 14, 5, -0.8, 0.8);
    ctx.stroke();
  }
  if (s.practice) {
    ctx.textAlign = "center";
    ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(94,234,212,0.9)";
    ctx.fillText("PRACTICE", w / 2, 18);
  }
  // boss bar (first live boss)
  const boss = s.mobs.find((m) => m.boss && m.ko <= 0);
  if (boss) {
    const bw = w * 0.56, bx = (w - bw) / 2, by = 34;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    rrect(ctx, bx - 2, by - 2, bw + 4, 12, 5);
    ctx.fill();
    ctx.fillStyle = CRIMSON;
    ctx.fillRect(bx, by, bw * clamp(boss.hp / boss.hpMax, 0, 1), 8);
    ctx.textAlign = "center";
    ctx.font = "800 10px Georgia, serif";
    ctx.fillStyle = WHITE;
    ctx.fillText(BOSSD[boss.kind as BossKind].name, w / 2, by + 20);
  }
  // bottom: XP sliver + HP bar + weapon + level
  const gx = 12, gw = w - 24;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  rrect(ctx, gx - 2, h - 36, gw + 4, 28, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(gx + 2, h - 32, gw - 4, 4);
  ctx.fillStyle = GOLD;
  ctx.fillRect(gx + 2, h - 32, (gw - 4) * clamp(s.xp / s.xpNeed, 0, 1), 4);
  const hpFrac = clamp(s.hp / PLAYER_HP, 0, 1);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(gx + 2, h - 24, gw - 4, 9);
  ctx.fillStyle = hpFrac > 0.5 ? "#6ee6a0" : hpFrac > 0.25 ? GOLD : CRIMSON;
  ctx.fillRect(gx + 2, h - 24, (gw - 4) * hpFrac, 9);
  ctx.textAlign = "left";
  ctx.font = "700 9.5px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#e8ecf5";
  const tier = weaponTier(s.baseAura + s.addAura);
  ctx.fillText(`Lv ${s.level} · ${WEAPONS[tier - 1].name}`, gx + 2, h - 39);
}
/** The WANTED boss name plate (paired with the 500ms intro hit-stop). */
function drawPlate(ctx: CanvasRenderingContext2D, plate: { name: string; sub: string; t: number }, w: number, h: number) {
  const a = clamp(plate.t / 0.4, 0, 1); // quick fade at the end
  ctx.globalAlpha = a;
  const pw = Math.min(w - 48, 300), px = (w - pw) / 2, py = h * 0.3, ph = 74;
  ctx.fillStyle = "rgba(7,8,12,0.88)";
  rrect(ctx, px, py, pw, ph, 6);
  ctx.fill();
  ctx.strokeStyle = CRIMSON;
  ctx.lineWidth = 2;
  rrect(ctx, px + 3, py + 3, pw - 6, ph - 6, 4);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "700 10px Georgia, serif";
  ctx.fillText("· W A N T E D ·", w / 2, py + 18);
  ctx.fillStyle = WHITE;
  ctx.font = "800 19px Georgia, 'Times New Roman', serif";
  ctx.fillText(plate.name, w / 2, py + 42, pw - 24);
  ctx.fillStyle = "#aeb6c8";
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(plate.sub, w / 2, py + 60, pw - 24);
  ctx.globalAlpha = 1;
}
function drawChoices(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  if (!s.choosing) return;
  ctx.fillStyle = "rgba(7,8,12,0.72)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "800 24px Georgia, 'Times New Roman', serif";
  ctx.fillText("BOUNTY UP!", w / 2, h * 0.3 - 42);
  ctx.fillStyle = "#aeb6c8";
  ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Tap a boost for this run", w / 2, h * 0.3 - 20);
  for (let i = 0; i < s.choosing.length; i++) {
    const k = s.choosing[i];
    const rc = choiceRect(i, w, h);
    ctx.fillStyle = "rgba(13,17,32,0.95)";
    rrect(ctx, rc.x, rc.y, rc.w, rc.h, 12);
    ctx.fill();
    ctx.strokeStyle = `${GOLD}66`;
    ctx.lineWidth = 1.5;
    rrect(ctx, rc.x, rc.y, rc.w, rc.h, 12);
    ctx.stroke();
    // stat glyph
    const ix = rc.x + 26, iy = rc.y + rc.h / 2;
    if (k === "botox") {
      // shield
      ctx.fillStyle = ICE;
      ctx.beginPath();
      ctx.moveTo(ix, iy - 11);
      ctx.lineTo(ix + 9, iy - 7);
      ctx.lineTo(ix + 7, iy + 5);
      ctx.lineTo(ix, iy + 11);
      ctx.lineTo(ix - 7, iy + 5);
      ctx.lineTo(ix - 9, iy - 7);
      ctx.closePath();
      ctx.fill();
    } else if (k === "drugs") {
      // horseshoe
      ctx.strokeStyle = "#ff8f6a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ix, iy - 1, 8, Math.PI * 0.85, Math.PI * 2.15);
      ctx.stroke();
    } else if (k === "ozempic") {
      // smoke pellet
      ctx.fillStyle = "#b8f4c8";
      ctx.beginPath();
      ctx.arc(ix, iy + 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(ix + 6, iy - 6, 4, 0, Math.PI * 2);
      ctx.arc(ix - 5, iy - 8, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      drawStar(ctx, ix, iy, 11, GOLD);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = WHITE;
    ctx.font = "800 15px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(PICK_LABEL[k].name, rc.x + 48, iy - 4);
    ctx.fillStyle = "#aeb6c8";
    ctx.font = "600 11.5px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(PICK_LABEL[k].line, rc.x + 48, iy + 13);
  }
}

// ---- page -------------------------------------------------------------------
export default function HighNoonGame() {
  // ?practice=1 = free warm-up: no wallet gate, no server calls, nothing banks.
  // Read once on mount (plain <a> links force a reload when switching modes).
  const [practice, setPractice] = useState(false);
  useEffect(() => {
    setPractice(new URLSearchParams(window.location.search).get("practice") === "1");
  }, []);
  return (
    <GameShell
      game="highnoon"
      title="High Noon"
      practice={practice}
      instructions="High noon on the frontier. Outlaw gangs pour in from every edge and your bounty huntress fires by herself. Hold and drag, she chases just above your thumb, or use WASD or arrows. Dodge the dynamite rings, grab the gold bounty coins, pick a boost every level. A runaway stagecoach hits at 30 seconds and Butch Goldtooth himself at 60. Survive all 75 to bank your best run."
      handle={handle}
    />
  );
}
