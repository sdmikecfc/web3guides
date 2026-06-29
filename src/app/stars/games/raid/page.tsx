/**
 * STARFALL · Asteroid Raid — a 1942/1944-style OPEN-FIELD vertical shooter. You fly a
 * strike fighter over an open MOONSCAPE (craters + enemy bunkers), free to roam the whole
 * field (no canyon walls). Auto-fire upward. Fight three ship classes sized by HP — fast
 * scouts (1 hit), fighters (tougher, shoot back), and a huge CRUISER you mostly dodge unless
 * your guns are maxed — plus ground BUNKERS and TURRETS. Kills and bombed buildings DROP
 * fuel + gun upgrades; fuel drains the whole run, so keep scooping it. Lots of fire, but
 * readable and dodgeable — not bullet hell. Out of fuel OR out of shields ends the run.
 *
 * Built on the shared GameShell + anti-cheat flow. Canvas/rAF behind the wallet gate is not
 * headless-verifiable — eyeball on deploy. Sprites degrade to vector fallbacks if an asset
 * 404s. Tuning is up top. (Score is clamped server-side, so balance is purely about feel.)
 */
"use client";

import { GameShell, type GameHandle } from "../engine";

// ---- tuning ---------------------------------------------------------------
const MARGIN = 24;
const PLAYER_SPEED = 360; // key steering px/s
const FOLLOW = 17; // pointer-follow ease
const PY_REST = 0.8, PY_MIN = 0.14, PY_MAX = 0.92; // vertical band the ship can roam
const BASE_SCROLL = 128, MAX_SCROLL = 290, SCROLL_RAMP = 3.0; // ground scroll
const FUEL_MAX = 100, FUEL_DRAIN = 5.2, FUEL_REFILL = 36;
const LIVES = 3, INVULN = 1.6, GRACE = 1.4;
const BULLET_V = -720, EBULLET_SP = 250; // enemy shots are SLOW enough to dodge
const FIRE_INT = [0.2, 0.17, 0.15, 0.13, 0.11]; // by gun level 0..4
const GUN_MAX = 5;
const EBULLET_CAP = 26; // hard cap on enemy bullets on screen — keeps it readable, not bullet-hell
const PLAYER_R = 15;

type EKind = "scout" | "fighter" | "cruiser";
const ESPEC: Record<EKind, { hp: number; r: number; pts: number; size: number; fire: number; drop: number; vy: number }> = {
  scout: { hp: 1, r: 17, pts: 60, size: 40, fire: 0, drop: 0.1, vy: 150 },
  fighter: { hp: 3, r: 24, pts: 160, size: 60, fire: 1.7, drop: 0.34, vy: 70 },
  cruiser: { hp: 110, r: 58, pts: 700, size: 150, fire: 1.5, drop: 1, vy: 58 },
};
type BKind = "bunker" | "turret";
const BSPEC: Record<BKind, { hp: number; pts: number; size: number; fire: number; drop: number }> = {
  bunker: { hp: 4, pts: 200, size: 62, fire: 0, drop: 0.45 },
  turret: { hp: 7, pts: 320, size: 70, fire: 2.0, drop: 0.6 },
};

const GOLD = "#f0b340"; // player token (reserved)
const CYAN = "#5eead4"; // player token (reserved)
const RED = "#ff6a6a";
const FUELC = "#6ee6a0";
const VIOLET = "#7c6aff";
// Enemy cues = the PLAYER'S glow STYLE (a soft under-glow) but in a FOE colour, never the hero's
// gold/cyan. Magenta is high-luminance (stands out on the dark moonscape for colourblind vision)
// and clearly distinct from gold+cyan. A small caret COUNT (1/2/3) codes class; orientation codes
// friend(up)/foe(down). Magenta = enemy-only; cyan+gold = player-only.
const FOE = "255,77,196";   // enemy glow rgb (magenta)
const FOE_HEX = "#ff4dc4";
const WHITE = "#ffffff";

// ---- art ------------------------------------------------------------------
function img(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const i = new Image();
  i.src = src;
  return i;
}
const ART = {
  raider: img("/stars-art/raider.png"),
  scout: img("/stars-art/enemy-drone.png"),
  fighter: img("/stars-art/enemy-gunship.png"),
  cruiser: img("/stars-art/enemy-cruiser.png"),
  building: img("/stars-art/raid-building.png"),
  fuel: img("/stars-art/fuel.png"),
  power: img("/stars-art/powerup.png"),
  moon: img("/stars-art/bg-rally-luna.png"),
};
function ready(i: HTMLImageElement | null): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}

// ---- math -----------------------------------------------------------------
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function hash(a: number, b: number): number { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return (h ^ (h >> 16)) >>> 0; }

// ---- state ----------------------------------------------------------------
interface Enemy { x: number; y: number; vx: number; vy: number; hp: number; hpMax: number; kind: EKind; fireCd: number; ph: number; t: number }
interface Building { x: number; y: number; hp: number; hpMax: number; kind: BKind; fireCd: number; ph: number }
interface Drop { x: number; y: number; vy: number; kind: "fuel" | "gun"; ph: number }
interface Bullet { x: number; y: number }
interface EB { x: number; y: number; vx: number; vy: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; c: string; r: number }
interface Speck { x: number; y: number; z: number }
interface Crater { x: number; y: number; r: number }
interface S {
  W: number; H: number; t: number; over: boolean; score: number; dist: number;
  scrollD: number; speed: number;
  px: number; py: number; invuln: number; lives: number; fuel: number; gun: number; fireCd: number;
  bullets: Bullet[]; ebullets: EB[]; enemies: Enemy[]; buildings: Building[]; drops: Drop[]; parts: Particle[]; specks: Speck[]; craters: Crater[];
  waveCd: number; bldCd: number; cruiserCd: number;
  msg: string; msgT: number; flash: number; shake: number;
}

function burst(s: S, x: number, y: number, c: string, n: number, sp: number) {
  for (let i = 0; i < n && s.parts.length < 240; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.8);
    s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.4, c, r: 1.5 + Math.random() * 2.5 });
  }
}
function hurt(s: S, x: number, y: number) {
  if (s.invuln > 0 || s.over) return;
  s.lives--; s.invuln = INVULN; s.flash = 0.4; s.shake = 11;
  burst(s, x, y, RED, 18, 240);
  if (s.lives <= 0) { s.msg = "WRECKED"; s.msgT = 1.8; s.over = true; }
}
function maybeDrop(s: S, x: number, y: number, chance: number) {
  if (Math.random() > chance) return;
  const kind: "fuel" | "gun" = (s.fuel < 45 || s.gun >= GUN_MAX - 1 || Math.random() < 0.55) ? "fuel" : "gun";
  s.drops.push({ x, y, vy: 40, kind, ph: Math.random() * 6 });
}
function eFire(s: S, x: number, y: number, spread: number) {
  if (s.ebullets.length >= EBULLET_CAP) return;
  const dx = s.px - x, dy = s.py - y, d = Math.hypot(dx, dy) || 1;
  const base = Math.atan2(dy, dx);
  const a = base + spread;
  s.ebullets.push({ x, y, vx: Math.cos(a) * EBULLET_SP, vy: Math.sin(a) * EBULLET_SP });
}

const handle: GameHandle<S> = {
  init: (w, h) => {
    const specks: Speck[] = [];
    for (let i = 0; i < 46; i++) specks.push({ x: Math.random() * w, y: Math.random() * h, z: 0.4 + Math.random() });
    const craters: Crater[] = [];
    for (let i = 0; i < 14; i++) craters.push({ x: Math.random() * w, y: Math.random() * h * 2, r: 16 + Math.random() * 44 });
    return {
      W: w, H: h, t: 0, over: false, score: 0, dist: 0, scrollD: 0, speed: BASE_SCROLL,
      px: w / 2, py: h * PY_REST, invuln: GRACE, lives: LIVES, fuel: FUEL_MAX, gun: 0, fireCd: 0,
      bullets: [], ebullets: [], enemies: [], buildings: [], drops: [], parts: [], specks, craters,
      waveCd: GRACE + 0.5, bldCd: 2.4, cruiserCd: 22, msg: "RAID!", msgT: 1, flash: 0, shake: 0,
    };
  },

  step: (s, dt, input) => {
    if (s.over) return;
    s.t += dt;
    if (s.msgT > 0) s.msgT = Math.max(0, s.msgT - dt);
    if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 1.6);
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dt);

    s.speed = Math.min(MAX_SCROLL, BASE_SCROLL + s.t * SCROLL_RAMP);
    s.scrollD += s.speed * dt; s.dist += s.speed * dt;
    s.score += s.speed * dt * 0.09;

    s.fuel -= FUEL_DRAIN * dt;
    if (s.fuel <= 0) { s.fuel = 0; s.msg = "OUT OF FUEL"; s.msgT = 1.8; s.over = true; return; }

    // ── steering: full 2D roam (drag anywhere, or arrow keys) ───────────────
    if (input.left && !input.right) s.px -= PLAYER_SPEED * dt;
    else if (input.right && !input.left) s.px += PLAYER_SPEED * dt;
    if (input.up && !input.downKey) s.py -= PLAYER_SPEED * dt;
    else if (input.downKey && !input.up) s.py += PLAYER_SPEED * dt;
    if (input.px != null) s.px += (input.px - s.px) * Math.min(1, FOLLOW * dt);
    if (input.py != null) s.py += (input.py - s.py) * Math.min(1, FOLLOW * dt);
    s.px = clamp(s.px, MARGIN, s.W - MARGIN);
    s.py = clamp(s.py, s.H * PY_MIN, s.H * PY_MAX);

    // ── auto-fire (spread widens with gun level) ────────────────────────────
    s.fireCd -= dt;
    if (s.fireCd <= 0) {
      s.fireCd = FIRE_INT[s.gun];
      const ny = s.py - 18, n = s.gun + 1;
      for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 11; s.bullets.push({ x: s.px + o, y: ny - Math.abs(o) * 0.18 }); }
    }
    for (const b of s.bullets) b.y += BULLET_V * dt;
    s.bullets = s.bullets.filter((b) => b.y > -20);
    for (const b of s.ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    s.ebullets = s.ebullets.filter((b) => b.y < s.H + 24 && b.y > -24 && b.x > -24 && b.x < s.W + 24);

    // ── spawns ──────────────────────────────────────────────────────────────
    s.waveCd -= dt;
    if (s.waveCd <= 0) {
      const r = Math.random();
      if (r < 0.55) { // scout stream / arc
        const n = 3 + Math.floor(Math.random() * 3), x0 = MARGIN + 30 + Math.random() * (s.W - MARGIN * 2 - 60), dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) addEnemy(s, "scout", clamp(x0 + dir * i * 30, MARGIN + 14, s.W - MARGIN - 14), -30 - i * 46, dir * 60);
      } else if (r < 0.85) { // a fighter (or two)
        addEnemy(s, "fighter", MARGIN + 30 + Math.random() * (s.W - MARGIN * 2 - 60), -40, (Math.random() - 0.5) * 60);
        if (s.t > 30 && Math.random() < 0.4) addEnemy(s, "fighter", MARGIN + 30 + Math.random() * (s.W - MARGIN * 2 - 60), -90, (Math.random() - 0.5) * 60);
      } else { addEnemy(s, "scout", s.W / 2, -30, 0); }
      s.waveCd = Math.max(0.7, 1.7 - s.t * 0.01) * (0.7 + Math.random() * 0.6);
    }
    s.cruiserCd -= dt;
    if (s.cruiserCd <= 0 && s.t > 16) {
      s.cruiserCd = 20 + Math.random() * 10;
      addEnemy(s, "cruiser", MARGIN + 60 + Math.random() * (s.W - MARGIN * 2 - 120), -110, (Math.random() - 0.5) * 24);
      s.msg = "CRUISER — DODGE OR MAX GUNS"; s.msgT = 1.6;
    }
    s.bldCd -= dt;
    if (s.bldCd <= 0) {
      s.bldCd = 1.8 + Math.random() * 1.8;
      const kind: BKind = Math.random() < 0.5 ? "turret" : "bunker";
      const sp = BSPEC[kind];
      s.buildings.push({ x: MARGIN + 24 + Math.random() * (s.W - MARGIN * 2 - 48), y: -sp.size, hp: sp.hp, hpMax: sp.hp, kind, fireCd: 1.4 + Math.random() * 1.6, ph: Math.random() * 6 });
    }

    // ── enemies ───────────────────────────────────────────────────────────
    for (const e of s.enemies) {
      e.t += dt; e.ph += dt;
      e.y += e.vy * dt;
      e.x += e.vx * dt;
      if (e.kind === "scout") e.x += Math.sin(e.t * 3.2 + e.ph) * 40 * dt; // weave
      if (e.x < MARGIN + 14) { e.x = MARGIN + 14; e.vx = Math.abs(e.vx); }
      else if (e.x > s.W - MARGIN - 14) { e.x = s.W - MARGIN - 14; e.vx = -Math.abs(e.vx); }
      const sp = ESPEC[e.kind];
      if (sp.fire > 0) {
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.y > 0 && e.y < s.H * 0.8) {
          e.fireCd = sp.fire + Math.random() * 0.8;
          if (e.kind === "cruiser") { for (const a of [-0.34, -0.17, 0, 0.17, 0.34]) eFire(s, e.x, e.y + 30, a); }
          else eFire(s, e.x, e.y + 18, (Math.random() - 0.5) * 0.18);
        }
      }
    }
    // player bullets -> enemies
    for (const b of s.bullets) {
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const sp = ESPEC[e.kind];
        if (Math.abs(b.x - e.x) < sp.r && Math.abs(b.y - e.y) < sp.r) {
          e.hp--; b.y = -999; burst(s, b.x, b.y, e.kind === "scout" ? CYAN : "#ffb070", 3, 110);
          if (e.hp <= 0) { s.score += sp.pts; burst(s, e.x, e.y, e.kind === "cruiser" ? "#ffd070" : "#ffb070", e.kind === "cruiser" ? 30 : 16, e.kind === "cruiser" ? 280 : 200); maybeDrop(s, e.x, e.y, sp.drop); if (e.kind === "cruiser") { s.flash = 0.3; s.shake = 8; s.msg = "CRUISER DOWN"; s.msgT = 1; } }
          break;
        }
      }
    }
    s.enemies = s.enemies.filter((e) => e.hp > 0 && e.y < s.H + 70);
    // ram + enemy fire -> player
    for (const e of s.enemies) { const sp = ESPEC[e.kind]; if (Math.abs(e.x - s.px) < sp.r * 0.7 + PLAYER_R && Math.abs(e.y - s.py) < sp.r * 0.7 + PLAYER_R) { if (e.kind !== "cruiser") { e.hp = 0; burst(s, e.x, e.y, RED, 12, 180); } hurt(s, s.px, s.py); } }
    for (const b of s.ebullets) if (Math.abs(b.x - s.px) < PLAYER_R && Math.abs(b.y - s.py) < PLAYER_R + 2) { b.y = s.H + 999; hurt(s, s.px, s.py); }
    s.ebullets = s.ebullets.filter((b) => b.y < s.H + 24);

    // ── buildings (ground targets, scroll with the moon) ────────────────────
    for (const bl of s.buildings) {
      bl.y += s.speed * dt; bl.ph += dt;
      const sp = BSPEC[bl.kind];
      if (sp.fire > 0 && bl.hp > 0) {
        bl.fireCd -= dt;
        if (bl.fireCd <= 0 && bl.y > 0 && bl.y < s.H * 0.85) { bl.fireCd = sp.fire + Math.random() * 1.0; eFire(s, bl.x, bl.y, (Math.random() - 0.5) * 0.12); }
      }
    }
    for (const b of s.bullets) {
      for (const bl of s.buildings) {
        if (bl.hp <= 0) continue;
        const sp = BSPEC[bl.kind], rr = sp.size * 0.42;
        if (Math.abs(b.x - bl.x) < rr && Math.abs(b.y - bl.y) < rr) {
          bl.hp--; b.y = -999; burst(s, b.x, b.y, "#caa46a", 3, 90);
          if (bl.hp <= 0) { s.score += sp.pts; burst(s, bl.x, bl.y, "#ffce7a", 18, 210); maybeDrop(s, bl.x, bl.y, sp.drop); }
          break;
        }
      }
    }
    s.buildings = s.buildings.filter((bl) => bl.hp > 0 && bl.y < s.H + 70);

    // ── drops (scoop by flying over) ────────────────────────────────────────
    for (const d of s.drops) {
      d.y += (s.speed * 0.4 + d.vy) * dt; d.ph += dt;
      if (Math.abs(d.x - s.px) < 24 && Math.abs(d.y - s.py) < 24) {
        d.y = s.H + 999;
        if (d.kind === "fuel") { s.fuel = Math.min(FUEL_MAX, s.fuel + FUEL_REFILL); s.score += 40; burst(s, d.x, d.y, FUELC, 12, 150); s.msg = "+FUEL"; s.msgT = 0.7; }
        else { if (s.gun < GUN_MAX - 1) { s.gun++; s.msg = `GUNS LV ${s.gun + 1}`; } else s.msg = "+FUEL"; if (s.gun >= GUN_MAX - 1) s.fuel = Math.min(FUEL_MAX, s.fuel + 20); s.score += 120; burst(s, d.x, d.y, GOLD, 14, 170); s.msgT = 1; }
      }
    }
    s.drops = s.drops.filter((d) => d.y < s.H + 30);

    // particles + foreground motion
    for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    s.parts = s.parts.filter((p) => p.life > 0);
    for (const sp of s.specks) { sp.y += (50 + sp.z * s.speed) * dt; if (sp.y > s.H) { sp.y = -4; sp.x = Math.random() * s.W; } }
    for (const cr of s.craters) { cr.y += s.speed * dt; if (cr.y - cr.r > s.H) { cr.y = -cr.r - Math.random() * s.H; cr.x = Math.random() * s.W; cr.r = 16 + Math.random() * 44; } }
  },

  draw: (ctx, s, w, h) => {
    ctx.save();
    if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);

    // ── open MOONSCAPE ground (scrolling), not a canyon ─────────────────────
    const moon = ART.moon;
    if (ready(moon)) {
      const th = w; // square art drawn at field width
      const y0 = ((s.scrollD % th) + th) % th;
      for (let y = y0 - th; y < h + th; y += th) ctx.drawImage(moon, 0, y, w, th);
      ctx.fillStyle = "rgba(6,9,20,0.5)"; ctx.fillRect(-20, -20, w + 40, h + 40);
    } else {
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#1a1626"); bg.addColorStop(1, "#0a0a12"); ctx.fillStyle = bg; ctx.fillRect(-20, -20, w + 40, h + 40);
    }
    // procedural craters for depth
    for (const cr of s.craters) {
      const g = ctx.createRadialGradient(cr.x, cr.y - cr.r * 0.2, cr.r * 0.2, cr.x, cr.y, cr.r);
      g.addColorStop(0, "rgba(0,0,0,0.34)"); g.addColorStop(0.7, "rgba(0,0,0,0.14)"); g.addColorStop(1, "rgba(220,220,235,0.05)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(200,205,225,0.08)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cr.x, cr.y, cr.r, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }

    // buildings (ground)
    for (const bl of s.buildings) drawBuilding(ctx, bl);

    // drops
    for (const d of s.drops) {
      const bob = Math.sin(d.ph * 3) * 2, gy = d.y + bob;
      if (d.kind === "fuel") spr(ctx, ART.fuel, d.x, gy, 32, 0, () => ring(ctx, d.x, d.y, 13, FUELC));
      else spr(ctx, ART.power, d.x, gy, 30, 0, () => ring(ctx, d.x, d.y, 13, GOLD));
      // white SHAPE glyph in BOTH sprite + fallback paths: '+' fuel vs '▲' gun — splits the
      // green-vs-gold red-green confusion pair by shape, not hue.
      ctx.fillStyle = WHITE; ctx.font = "800 13px ui-sans-serif, system-ui"; ctx.textAlign = "center";
      ctx.fillText(d.kind === "fuel" ? "+" : "▲", d.x, gy + 5);
    }

    // player bullets
    for (const b of s.bullets) { ctx.fillStyle = CYAN; ctx.shadowColor = CYAN; ctx.shadowBlur = 6; ctx.fillRect(b.x - 1.7, b.y - 9, 3.4, 12); }
    ctx.shadowBlur = 0;

    // enemies
    for (const e of s.enemies) drawEnemy(ctx, e, h);

    // enemy bullets — red dot (shape: enemy=dot vs player=streak) + WHITE core for luminance
    ctx.shadowColor = RED; ctx.shadowBlur = 5;
    for (const b of s.ebullets) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(b.x, b.y, 3.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0; ctx.fillStyle = WHITE;
    for (const b of s.ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 1.6, 0, Math.PI * 2); ctx.fill(); }

    // particles
    for (const p of s.parts) { ctx.globalAlpha = clamp(p.life * 1.7, 0, 1); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;

    // foreground dust streaks (speed feel)
    for (const sp of s.specks) { ctx.globalAlpha = 0.18 + sp.z * 0.32; ctx.fillStyle = sp.z > 0.95 ? "#cdd9ff" : "#8694b8"; ctx.fillRect(sp.x, sp.y, 1.4, 2.2 + sp.z * 3); }
    ctx.globalAlpha = 1;

    // player
    const blink = s.invuln > 0 && Math.floor(s.t * 18) % 2 === 0;
    if (!blink) {
      ctx.shadowColor = GOLD; ctx.shadowBlur = 12;
      spr(ctx, ART.raider, s.px, s.py, 46, 0, () => {
        ctx.fillStyle = "#dfe5ee"; ctx.beginPath(); ctx.moveTo(s.px, s.py - 22); ctx.lineTo(s.px - 16, s.py + 16); ctx.lineTo(s.px + 16, s.py + 16); ctx.closePath(); ctx.fill();
        ctx.fillStyle = GOLD; ctx.fillRect(s.px - 4, s.py - 6, 8, 14);
      });
      ctx.shadowBlur = 0;
      carets(ctx, s.px, s.py - 26, 1, true); // UP caret (cyan) = friendly — orientation codes allegiance
    }
    ctx.fillStyle = "rgba(94,234,212,0.7)"; ctx.beginPath(); ctx.moveTo(s.px - 6, s.py + 18); ctx.lineTo(s.px + 6, s.py + 18); ctx.lineTo(s.px, s.py + 24 + Math.random() * 8); ctx.closePath(); ctx.fill();

    ctx.restore();
    if (s.flash > 0) { ctx.fillStyle = `rgba(255,60,60,${s.flash * 0.5})`; ctx.fillRect(0, 0, w, h); }
    drawHUD(ctx, s, w, h);
  },
  done: (s) => s.over,
  score: (s) => Math.round(s.score),
};

function addEnemy(s: S, kind: EKind, x: number, y: number, vx: number) {
  const sp = ESPEC[kind];
  s.enemies.push({ x, y, vx, vy: sp.vy, hp: sp.hp, hpMax: sp.hp, kind, fireCd: 1 + Math.random() * 1.4, ph: Math.random() * 6, t: 0 });
}

// ---- draw helpers ---------------------------------------------------------
function spr(ctx: CanvasRenderingContext2D, im: HTMLImageElement | null, x: number, y: number, size: number, rot: number, fb: () => void) {
  if (ready(im)) { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); const w = size, hh = size * (im.naturalHeight / im.naturalWidth); ctx.drawImage(im, -w / 2, -hh / 2, w, hh); ctx.restore(); }
  else fb();
}
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.shadowColor = c; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
}
function hpbar(ctx: CanvasRenderingContext2D, x: number, y: number, wpx: number, frac: number) {
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x - wpx / 2, y, wpx, 4);
  ctx.fillStyle = frac > 0.5 ? "#6ee6a0" : frac > 0.25 ? "#f0b340" : RED; ctx.fillRect(x - wpx / 2, y, wpx * frac, 4);
  ctx.strokeStyle = WHITE; ctx.lineWidth = 1; ctx.strokeRect(x - wpx / 2, y, wpx, 4); // length, not just hue, reads as damage
}
// down-pointing chevron carets stacked above an enemy: COUNT = class (scout1/fighter2/cruiser3),
// DOWN = hostile. White over a dark under-stroke so they survive on the yellow halo + bright hulls.
function carets(ctx: CanvasRenderingContext2D, cx: number, baseY: number, count: number, up: boolean) {
  ctx.lineJoin = "round";
  for (let i = 0; i < count; i++) {
    const y = baseY - i * 9, tip = up ? y - 6 : y, arm = up ? y : y - 6;
    for (const [col, lw] of [["rgba(0,0,0,0.6)", 4] as const, [up ? CYAN : WHITE, 2] as const]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      ctx.moveTo(cx - 5, arm); ctx.lineTo(cx, tip); ctx.lineTo(cx + 5, arm); ctx.stroke();
    }
  }
}
function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, h: number) {
  const sp = ESPEC[e.kind];
  const im = e.kind === "scout" ? ART.scout : e.kind === "fighter" ? ART.fighter : ART.cruiser;
  const drawSize = e.kind === "scout" ? 46 : sp.size; // visual bump; hitbox sp.r unchanged
  // soft FOE under-glow — same glow STYLE as the player, but magenta (never the hero's gold/cyan)
  const gr = sp.r * 1.7, g = ctx.createRadialGradient(e.x, e.y, sp.r * 0.25, e.x, e.y, gr);
  g.addColorStop(0, `rgba(${FOE},0.55)`); g.addColorStop(0.6, `rgba(${FOE},0.22)`); g.addColorStop(1, `rgba(${FOE},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, gr, 0, Math.PI * 2); ctx.fill();
  // sprite with a soft magenta glow hugging it (mirrors the player's gold shadow-glow)
  ctx.shadowColor = FOE_HEX; ctx.shadowBlur = 12;
  spr(ctx, im, e.x, e.y, drawSize, Math.PI, () => {
    ctx.fillStyle = e.kind === "cruiser" ? "#9a2f2f" : e.kind === "fighter" ? "#b03b3b" : "#d65a5a";
    ctx.beginPath(); ctx.moveTo(e.x, e.y + sp.size * 0.36); ctx.lineTo(e.x - sp.size * 0.36, e.y - sp.size * 0.3); ctx.lineTo(e.x + sp.size * 0.36, e.y - sp.size * 0.3); ctx.closePath(); ctx.fill();
  });
  ctx.shadowBlur = 0;
  // small class carets (count = scout1/fighter2/cruiser3) + HP — no rings, no clutter
  const nc = e.kind === "scout" ? 1 : e.kind === "fighter" ? 2 : 3, topY = e.y - sp.size * 0.4 - 6;
  carets(ctx, e.x, topY, nc, false);
  if (e.kind !== "scout" && e.hp < e.hpMax) hpbar(ctx, e.x, topY - nc * 9 - 8, sp.size * 0.7, e.hp / e.hpMax);
}
function drawBuilding(ctx: CanvasRenderingContext2D, bl: Building) {
  const sp = BSPEC[bl.kind];
  // soft ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.32)"; ctx.beginPath(); ctx.ellipse(bl.x, bl.y + sp.size * 0.32, sp.size * 0.5, sp.size * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  spr(ctx, ART.building, bl.x, bl.y, sp.size, 0, () => {
    ctx.fillStyle = bl.kind === "turret" ? "#3a3340" : "#33323a"; ctx.beginPath(); ctx.arc(bl.x, bl.y, sp.size * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,90,90,0.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bl.x, bl.y, sp.size * 0.42, 0, Math.PI * 2); ctx.stroke();
    if (bl.kind === "turret") { ctx.fillStyle = "#6a6470"; ctx.fillRect(bl.x - 3, bl.y - sp.size * 0.42, 6, sp.size * 0.3); }
  });
  if (bl.hp < bl.hpMax) hpbar(ctx, bl.x, bl.y - sp.size * 0.5, sp.size * 0.6, bl.hp / bl.hpMax);
}
function drawHUD(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  ctx.textAlign = "left"; ctx.fillStyle = "#e8ecf5"; ctx.font = "800 20px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(String(Math.round(s.score)), 14, 28);
  ctx.fillStyle = "#aeb6c8"; ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`${Math.round(s.dist)} m`, 14, 46);
  ctx.fillStyle = s.gun >= GUN_MAX - 1 ? GOLD : "#aeb6c8"; ctx.fillText(`Guns Lv ${s.gun + 1}${s.gun >= GUN_MAX - 1 ? " · MAX" : ""}`, 14, 62);

  ctx.textAlign = "right"; ctx.fillStyle = "#aeb6c8"; ctx.fillText("SHIELDS", w - 14, 18);
  for (let i = 0; i < LIVES; i++) {
    const x = w - 18 - i * 18, on = i < s.lives;
    ctx.fillStyle = on ? GOLD : "rgba(255,255,255,0.16)";
    ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x - 6, 38); ctx.lineTo(x + 6, 38); ctx.closePath(); ctx.fill();
  }

  const low = s.fuel < FUEL_MAX * 0.25, gw = w - 28, gx = 14, gy = h - 20;
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(gx, gy, gw, 9);
  ctx.fillStyle = low ? (Math.floor(s.t * 6) % 2 === 0 ? RED : "#7a1f1f") : FUELC;
  ctx.fillRect(gx, gy, gw * (s.fuel / FUEL_MAX), 9);
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, 9);
  ctx.fillStyle = "#cdd4e4"; ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText("FUEL", gx + 2, gy - 4);

  if (s.msgT > 0) {
    ctx.globalAlpha = Math.min(1, s.msgT); ctx.textAlign = "center";
    ctx.fillStyle = s.msg === "+FUEL" ? FUELC : s.msg.startsWith("GUN") ? GOLD : s.msg === "RAID!" ? CYAN : s.msg.includes("CRUISER") ? VIOLET : RED;
    ctx.font = "800 26px ui-sans-serif, system-ui, sans-serif"; ctx.fillText(s.msg, w / 2, h * 0.4);
    ctx.globalAlpha = 1; ctx.textAlign = "left";
  }
}

export default function RaidGame() {
  return (
    <GameShell
      game="raid"
      title="Asteroid Raid"
      floorMs={9000}
      instructions="Fly an open moonscape. Drag anywhere (or arrow keys) to roam — your cannons fire on their own. Blast scouts, fighters and ground bunkers; the huge CRUISER you dodge unless your guns are maxed. Kills and bombed buildings drop FUEL and GUN upgrades — scoop them, because fuel drains the whole run. Out of fuel or shields ends it. Fly far + shoot true to bank Salvage."
      handle={handle}
    />
  );
}
