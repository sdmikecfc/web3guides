/**
 * STARFALL · Gravity Slingshot — a Gravitee-Wars-style aim-and-shoot.
 * Pull back from the launch pad (slingshot style) to set angle + power (a dotted line previews the near arc), release
 * to fire. A planet's gravity bends the shot, so slingshot it into the rival ship.
 * Hit → next level (+score); miss (fall in, fly off, or burn out) → costs a shot; out of shots →
 * game over. Banks via the shared 2D engine. Turn-based feel, no time pressure.
 */
"use client";

import { GameShell, type GameHandle } from "../engine";

const GOLD = "#f0b340";
const TEAL = "#5eead4";
const GRAV = 7.5e6; // gravity constant (tune for curve strength; lower = gentler/more predictable bend)
const MAXSPEED = 360; // launch speed at full pull
const MAXPULL = 150; // px of pull-back for full power (smaller = less finger travel, better on mobile)
const MAXSHOTS = 8; // misses allowed before game over
const PREVIEW_LEN = 250; // dotted aim line: FIXED arc length in px (same every shot; lower = harder to read the curve)
const FLIGHT_MAX = 6; // seconds a shot may fly before its fuel is spent (kills endless gravity orbits)

// Sector art (existing assets). Planet/ship PNGs are transparent cutouts, so they
// compose over the painted backdrop. Module-level + SSR-guarded; draw falls back to
// vector shapes until each image decodes, so the game never blocks on art.
function img(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const i = new Image();
  i.src = src;
  return i;
}
const ART = {
  bg: img("/stars-art/bg-swarm.png"), // clean orbital backdrop (bg-slingshot was too busy)
  rival: img("/stars-art/flagship-pulsar.png"), // the teal rival ship = the target
  planet0: img("/stars-art/cosmo-dormant.png"), // primary gravity well
  planet1: img("/stars-art/smoothie-ignited.png"), // 2nd well (level 3+)
};
function ready(i: HTMLImageElement | null): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}
function spriteH(im: HTMLImageElement, w: number): number {
  return w * (im.naturalHeight / im.naturalWidth);
}
function drawCover(ctx: CanvasRenderingContext2D, im: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / im.naturalWidth, h / im.naturalHeight);
  const dw = im.naturalWidth * scale;
  const dh = im.naturalHeight * scale;
  ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

interface Body { x: number; y: number; r: number; mass: number }
interface Vec { x: number; y: number }
interface S {
  phase: "aim" | "fly";
  ship: { x: number; y: number; vx: number; vy: number };
  start: Vec;
  target: { x: number; y: number; r: number };
  bodies: Body[];
  aimV: { vx: number; vy: number } | null;
  pull: Vec | null; // finger position during a pull-back (drives the slingshot band)
  prevDown: boolean;
  trail: Vec[];
  score: number;
  shots: number;
  level: number;
  msg: string;
  msgT: number;
  t: number;
  flightT: number; // seconds the current shot has been flying (orbit-timeout)
}

function resetShip(s: S, w: number, h: number) {
  s.start = { x: w * 0.5, y: h * 0.86 };
  s.ship = { x: s.start.x, y: s.start.y, vx: 0, vy: 0 };
  s.phase = "aim";
  s.trail = [];
  s.aimV = null;
  s.flightT = 0;
}

function setupLevel(s: S, lvl: number, w: number, h: number) {
  s.bodies = [{ x: w * 0.5, y: h * 0.42, r: 26, mass: 1 }];
  if (lvl >= 3) s.bodies.push({ x: w * (lvl % 2 ? 0.26 : 0.74), y: h * 0.62, r: 15, mass: 0.5 });
  let t: { x: number; y: number; r: number };
  let tries = 0;
  do {
    t = { x: 44 + Math.random() * (w - 88), y: h * (0.1 + Math.random() * 0.28), r: 20 };
    tries++;
  } while (tries < 24 && s.bodies.some((b) => Math.hypot(b.x - t.x, b.y - t.y) < b.r + t.r + 55));
  s.target = t;
  resetShip(s, w, h);
}

// Forward-simulate the shot for the dotted aim preview (no state mutation).
function predict(s: S, vx: number, vy: number, w: number, h: number): Vec[] {
  let x = s.start.x;
  let y = s.start.y;
  let px = vx;
  let py = vy;
  const pts: Vec[] = [];
  const sdt = 0.03;
  for (let i = 0; i < 170; i++) {
    for (const b of s.bodies) {
      const dx = b.x - x;
      const dy = b.y - y;
      const r2 = Math.max(b.r * b.r, dx * dx + dy * dy);
      const r = Math.sqrt(r2);
      const a = (GRAV * b.mass) / r2;
      px += (dx / r) * a * sdt;
      py += (dy / r) * a * sdt;
    }
    x += px * sdt;
    y += py * sdt;
    if (i % 3 === 0) pts.push({ x, y });
    let stop = false;
    for (const b of s.bodies) if (Math.hypot(b.x - x, b.y - y) < b.r) stop = true;
    if (Math.hypot(s.target.x - x, s.target.y - y) < s.target.r) stop = true;
    if (x < -40 || x > w + 40 || y < -40 || y > h + 40) stop = true;
    if (stop) break;
  }
  return pts;
}

const handle: GameHandle<S> = {
  init: (w, h) => {
    const s: S = {
      phase: "aim",
      ship: { x: 0, y: 0, vx: 0, vy: 0 },
      start: { x: 0, y: 0 },
      target: { x: 0, y: 0, r: 16 },
      bodies: [],
      aimV: null,
      pull: null,
      prevDown: false,
      trail: [],
      score: 0,
      shots: 0,
      level: 1,
      msg: "",
      msgT: 0,
      t: 0,
      flightT: 0,
    };
    setupLevel(s, 1, w, h);
    return s;
  },
  step: (s, dt, input, w, h) => {
    s.t += dt;
    if (s.msgT > 0) s.msgT = Math.max(0, s.msgT - dt);

    if (s.phase === "aim") {
      if (input.down && input.px != null && input.py != null) {
        const dx = input.px - s.ship.x;
        const dy = input.py - s.ship.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 4) {
          const power = (Math.min(dist, MAXPULL) / MAXPULL) * MAXSPEED;
          // slingshot: fire OPPOSITE the pull (drag back, launch forward — finger stays off the target)
          s.aimV = { vx: (-dx / dist) * power, vy: (-dy / dist) * power };
          s.pull = { x: input.px, y: input.py };
        } else {
          s.aimV = null;
          s.pull = null;
        }
      } else {
        if (s.prevDown && s.aimV) {
          s.ship.vx = s.aimV.vx;
          s.ship.vy = s.aimV.vy;
          s.phase = "fly";
          s.flightT = 0;
        }
        s.aimV = null;
        s.pull = null;
      }
    } else {
      s.flightT += dt;
      // flight physics (substepped for stability)
      const SUB = 2;
      const sdt = dt / SUB;
      for (let k = 0; k < SUB; k++) {
        for (const b of s.bodies) {
          const dx = b.x - s.ship.x;
          const dy = b.y - s.ship.y;
          const r2 = Math.max(b.r * b.r, dx * dx + dy * dy);
          const r = Math.sqrt(r2);
          const a = (GRAV * b.mass) / r2;
          s.ship.vx += (dx / r) * a * sdt;
          s.ship.vy += (dy / r) * a * sdt;
        }
        s.ship.x += s.ship.vx * sdt;
        s.ship.y += s.ship.vy * sdt;
      }
      s.trail.push({ x: s.ship.x, y: s.ship.y });
      if (s.trail.length > 130) s.trail.shift();

      // target hit?
      if (Math.hypot(s.target.x - s.ship.x, s.target.y - s.ship.y) < s.target.r + 8) {
        s.score += 500 + s.level * 25;
        s.level += 1;
        s.msg = "Target hit!";
        s.msgT = 1.4;
        setupLevel(s, s.level, w, h);
        s.prevDown = input.down;
        return;
      }
      // fell into a body?
      for (const b of s.bodies) {
        if (Math.hypot(b.x - s.ship.x, b.y - s.ship.y) < b.r + 4) {
          s.shots += 1;
          s.msg = "Lost to gravity";
          s.msgT = 1.4;
          resetShip(s, w, h);
          s.prevDown = input.down;
          return;
        }
      }
      // flew off course?
      const M = 130;
      if (s.ship.x < -M || s.ship.x > w + M || s.ship.y < -M || s.ship.y > h + M) {
        s.shots += 1;
        s.msg = "Flew off course";
        s.msgT = 1.4;
        resetShip(s, w, h);
        s.prevDown = input.down;
        return;
      }
      // orbited too long — fuel's spent (a captured shot would loop forever otherwise)
      if (s.flightT > FLIGHT_MAX) {
        s.shots += 1;
        s.msg = "Fuel spent";
        s.msgT = 1.4;
        resetShip(s, w, h);
      }
    }
    s.prevDown = input.down;
  },
  draw: (ctx, s, w, h) => {
    // backdrop (painted sector) + a scrim so the play layer reads clearly
    if (ready(ART.bg)) {
      drawCover(ctx, ART.bg, w, h);
      const sc = ctx.createLinearGradient(0, 0, 0, h);
      sc.addColorStop(0, "rgba(5,7,15,0.58)");
      sc.addColorStop(0.42, "rgba(5,7,15,0.30)");
      sc.addColorStop(1, "rgba(5,7,15,0.62)");
      ctx.fillStyle = sc;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "#05070f";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(170,184,224,0.5)";
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 97 + 31) % w, (i * 53 + 17) % h, 1, 1);
    }
    // gravity wells — real planet sprites that read as solid hazards (drop shadow +
    // a faint rim at the kill radius), with a soft aura hinting the pull range.
    s.bodies.forEach((b, idx) => {
      const aura = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 3.4);
      aura.addColorStop(0, idx === 0 ? "rgba(124,106,255,0.20)" : "rgba(240,179,64,0.22)");
      aura.addColorStop(1, "rgba(124,106,255,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3.4, 0, Math.PI * 2);
      ctx.fill();
      const art = idx === 0 ? ART.planet0 : ART.planet1;
      if (ready(art)) {
        const pw = b.r * 2.4;
        const ph = spriteH(art, pw);
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 18;
        ctx.drawImage(art, b.x - pw / 2, b.y - ph / 2, pw, ph);
        ctx.restore();
        ctx.strokeStyle = idx === 0 ? "rgba(150,140,255,0.45)" : "rgba(255,170,90,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r - 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // target = a rival ship; keep a pulsing teal reticle so the lock + hit zone stay legible
    const pulse = 1 + Math.sin(s.t * 4) * 0.12;
    const bob = Math.sin(s.t * 2.2) * 3;
    if (ready(ART.rival)) {
      const rw = s.target.r * 2.9;
      const rh = spriteH(ART.rival, rw);
      ctx.save();
      ctx.shadowColor = TEAL;
      ctx.shadowBlur = 14;
      ctx.drawImage(ART.rival, s.target.x - rw / 2, s.target.y - rh / 2 + bob, rw, rh);
      ctx.restore();
    }
    ctx.strokeStyle = TEAL;
    ctx.shadowColor = TEAL;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(s.target.x, s.target.y, (s.target.r + 9) * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // launch pad
    ctx.strokeStyle = "rgba(240,179,64,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.start.x, s.start.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    // slingshot band — two strands from the pad prongs back to your finger (shows the pull)
    if (s.phase === "aim" && s.pull) {
      ctx.strokeStyle = "rgba(240,179,64,0.7)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.start.x - 10, s.start.y);
      ctx.lineTo(s.pull.x, s.pull.y);
      ctx.moveTo(s.start.x + 10, s.start.y);
      ctx.lineTo(s.pull.x, s.pull.y);
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(s.pull.x, s.pull.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // aim prediction — a FIXED-length read of the launch arc (same reach every shot);
    // the tail fades so the cutoff reads as sensor range, and you judge the rest.
    if (s.phase === "aim" && s.aimV) {
      const pts = predict(s, s.aimV.vx, s.aimV.vy, w, h);
      let acc = 0;
      ctx.fillStyle = GOLD;
      for (let i = 0; i < pts.length; i++) {
        if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (acc > PREVIEW_LEN) break;
        const f = acc / PREVIEW_LEN; // fade the last 30%
        ctx.globalAlpha = f < 0.7 ? 0.55 : 0.55 * Math.max(0, 1 - (f - 0.7) / 0.3);
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // trail
    for (let i = 0; i < s.trail.length; i++) {
      ctx.globalAlpha = (i / s.trail.length) * 0.6;
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(s.trail[i].x, s.trail[i].y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // projectile — a missile, nose tracking its velocity (symmetric, so a plain rotate
    // works: no upside-down flip needed)
    const ang = s.phase === "fly" ? Math.atan2(s.ship.vy, s.ship.vx) : s.aimV ? Math.atan2(s.aimV.vy, s.aimV.vx) : -Math.PI / 2;
    ctx.save();
    ctx.translate(s.ship.x, s.ship.y);
    ctx.rotate(ang);
    // exhaust flame (tail, -x), flickering
    const flame = 6 + (Math.sin(s.t * 34) + 1) * 2.4;
    const fg = ctx.createLinearGradient(-9, 0, -9 - flame, 0);
    fg.addColorStop(0, "rgba(255,210,120,0.95)");
    fg.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-9, -2.6);
    ctx.lineTo(-9 - flame, 0);
    ctx.lineTo(-9, 2.6);
    ctx.closePath();
    ctx.fill();
    // tail fins
    ctx.fillStyle = "#b9871f";
    ctx.beginPath();
    ctx.moveTo(-6, -3); ctx.lineTo(-11, -6); ctx.lineTo(-6, -1); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, 3); ctx.lineTo(-11, 6); ctx.lineTo(-6, 1); ctx.closePath(); ctx.fill();
    // body (metallic), pointed nose at +x
    ctx.fillStyle = "#dfe5ee";
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(4, -3.4);
    ctx.lineTo(-9, -3.4);
    ctx.lineTo(-9, 3.4);
    ctx.lineTo(4, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // gold nose cone
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(4, -3.4);
    ctx.lineTo(4, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // HUD
    ctx.fillStyle = "#e8ecf5";
    ctx.font = "700 18px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(s.score)}`, 14, 28);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff8a8a";
    ctx.fillText("♥".repeat(Math.max(0, MAXSHOTS - s.shots)), w - 14, 28);
    ctx.fillStyle = "#8b95ad";
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`Level ${s.level}`, w - 14, 46);
    ctx.textAlign = "left";
    if (s.phase === "aim" && !s.aimV) {
      ctx.fillStyle = "rgba(174,182,200,0.8)";
      ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("pull back to aim, release to fire. the dotted path only reads partway", w / 2, h - 18);
      ctx.textAlign = "left";
    }
    if (s.msgT > 0) {
      ctx.globalAlpha = Math.min(1, s.msgT);
      ctx.textAlign = "center";
      ctx.fillStyle = s.msg.startsWith("Target") ? "#86f0c4" : "#ff8a8a";
      ctx.font = "800 22px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(s.msg, w / 2, h / 2);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
  },
  done: (s) => s.shots >= MAXSHOTS,
  score: (s) => s.score,
};

export default function SlingshotGame() {
  return (
    <GameShell
      game="slingshot"
      title="Gravity Slingshot"
      floorMs={6000}
      instructions="Pull back from the launch pad like a slingshot, then release to fire. The dotted line reads a fixed stretch of the arc, so you judge where gravity takes the rest. Slingshot the missile around a planet into the rival ship. 8 misses and you're out."
      handle={handle}
    />
  );
}
