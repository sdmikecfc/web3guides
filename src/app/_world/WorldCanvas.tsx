"use client";
/**
 * THE ALIVE LAYER — what turns the board from a menu into a place.
 *
 * One rAF canvas sitting INSIDE the transformed world, so everything it draws
 * pans and zooms with the map for free and needs no camera plumbing. It paints,
 * in order: the hour's light, drifting cloud shadows, smoke rising off every
 * stronghold under siege (thicker the closer that wall is to breaking), embers
 * and muzzle flashes on a wall inside its sprint, a warm hearth glow over your
 * own camp, and armour rolling the supply roads.
 *
 * ITS SKELETON IS HqCanvas.tsx, lifted rather than rewritten, because that file
 * already carries every guard this needs and each one was earned:
 * prefers-reduced-motion paints ONE static frame and never arms the loop (with
 * a live change-listener so toggling it mid-session works), document.hidden
 * pauses the loop, DPR is capped at 2, and a ResizeObserver keeps the backing
 * store sized. Only the SOURCES and the WHAT differ.
 *
 * DELIBERATELY SOFT. Living inside the transform means the raster is magnified
 * at high zoom, so everything here is smoke, light, shadow and small moving
 * shapes — subjects where softness reads as atmosphere rather than as blur. The
 * crisp things (buildings, labels, forts) are DOM and stay sharp. That division
 * is the whole reason this is cheap.
 *
 * COST CONTROL: one canvas, one loop, hard caps on every particle array, caps
 * halved under 760px, and spawn rates scaled by the live zoom so zooming IN
 * thins the field instead of packing it. Pure decoration, never a scored path,
 * so Math.random is fine here (the rule the game sims must follow does not
 * apply to a cosmetic overlay).
 */
import { useEffect, useRef } from "react";
import type { DayPhase, Vec2 } from "@/lib/world/types";

export type { DayPhase };

/** A place that smokes. `intensity` 0..1 scales the column; `alert` turns it
 * red and adds flashes (a wall inside its siege sprint). */
export type SmokeSource = { x: number; y: number; intensity: number; alert?: boolean };
/** A place that glows warm from within (your camp). */
export type HearthSource = { x: number; y: number };

export type WorldCanvasProps = {
  phase: DayPhase;
  smoke: SmokeSource[];
  hearths: HearthSource[];
  roads: Vec2[][];
  /** SKY LAYER. Draws ONLY the flights, so it can be stacked ABOVE the
   * buildings while the ground layer stays below them.
   *
   * They cannot share a canvas. Planes must pass in FRONT of a fort or they
   * look like they are flying through it; smoke must pour from BEHIND one or
   * it hides the wall it is coming from - Mike's read on braking.io. One
   * canvas can only be on one side of the sprites, so there are two. */
  sky?: boolean;
  /** Live camera scale, read every frame to thin particles as you zoom in.
   * A ref, never state: this must not re-render anything. */
  zoomRef?: React.RefObject<number>;
  /** Optional TOP-DOWN vehicle images, nose pointing UP (tanks, trucks). One
   * vehicle patrols each road, assigned round-robin from this pool, rotated
   * to the road's heading — a plan view can face any direction, which a side
   * view cannot (the season's own turning-art lesson). Until an image loads,
   * that vehicle draws as the vector hull below, so a 404 costs a sprite,
   * never the traffic. */
  vehicles?: string[];
  className?: string;
};

/** The hour's light. Kept gentle on purpose — Mike's brief is a BRIGHT map, so
 * night reads as a blue evening, never as darkness you cannot play in. */
const LIGHT: Record<DayPhase, { top: string; bottom: string; a: number }> = {
  dawn: { top: "rgba(255,186,132,0.30)", bottom: "rgba(255,214,170,0.10)", a: 1 },
  day: { top: "rgba(255,244,214,0.10)", bottom: "rgba(255,250,232,0.04)", a: 1 },
  dusk: { top: "rgba(255,146,88,0.30)", bottom: "rgba(122,96,150,0.18)", a: 1 },
  night: { top: "rgba(44,68,120,0.34)", bottom: "rgba(26,40,74,0.22)", a: 1 },
};

export function WorldCanvas({ phase, smoke, hearths, roads, sky, zoomRef, vehicles, className }: WorldCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Live inputs ride refs so the season's data can change without tearing down
  // and rebuilding the whole particle system.
  const smokeRef = useRef(smoke);
  smokeRef.current = smoke;
  const hearthRef = useRef(hearths);
  hearthRef.current = hearths;
  const roadsRef = useRef(roads);
  roadsRef.current = roads;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvasEl = ref.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reducedMq.matches;

    // The vehicle pool loads once per mount; each entry flips ready on load.
    const vpool = (vehicles ?? []).map((src) => {
      const im = new Image();
      const slot = { im, ready: false };
      im.onload = () => { slot.ready = im.naturalWidth > 0; };
      im.src = src;
      return slot;
    });

    let W = 1;
    let H = 1;
    let dpr = 1;
    let small = false;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const zoom = () => Math.max(1, zoomRef?.current ?? 1);

    type Puff = { x: number; y: number; r: number; a: number; vy: number; vx: number; alert: boolean };
    type Ember = { x: number; y: number; vx: number; vy: number; a: number; s: number; life: number };
    type Cloud = { x: number; y: number; rx: number; ry: number; sp: number; a: number };
    type Unit = { road: number; d: number; sp: number; dir: number; img: number };
    // FLIGHTS. A plane needs no ground network - just a heading, an altitude
    // and a life - which is why this exists where tank routes had to be traced
    // by hand. It also means the sky stays alive on a plate with no roads at
    // all, so a future season gets this for free.
    type Plane = { x: number; y: number; vx: number; vy: number; alt: number; life: number; wing: number };
    // WEATHER. This was missing entirely: adapting HqCanvas dropped its rain
    // layer and nothing replaced it, so "the map has weather" was true of the
    // day-cycle tint and cloud shadows only, which nobody reads as weather.
    type Drop = { x: number; y: number; len: number; spd: number; a: number };
    type Mist = { x: number; y: number; r: number; a: number; sp: number };
    let rain: Drop[] = [];
    let mist: Mist[] = [];

    let puffs: Puff[] = [];
    let embers: Ember[] = [];
    let clouds: Cloud[] = [];
    let units: Unit[] = [];
    let planes: Plane[] = [];

    const capPuffs = () => (small ? 34 : 70);
    const capEmbers = () => (small ? 20 : 40);

    // ── Road geometry. Sampled by DISTANCE so a unit crawls evenly instead of
    //    sprinting through short segments and crawling through long ones. ──
    function roadLen(pts: Vec2[]): number[] {
      const acc = [0];
      for (let i = 1; i < pts.length; i++) {
        // Normalized space is not square; x carries more world than y. Using
        // raw normalized distance is close enough for a drifting decoration
        // and keeps this branch-free.
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        acc.push(acc[i - 1] + Math.hypot(dx, dy));
      }
      return acc;
    }
    let roadAcc: number[][] = [];

    function sampleRoad(ri: number, d: number): { x: number; y: number; ang: number } | null {
      const pts = roadsRef.current[ri];
      const acc = roadAcc[ri];
      if (!pts || pts.length < 2 || !acc) return null;
      const total = acc[acc.length - 1];
      if (total <= 0) return null;
      const dist = ((d % total) + total) % total;
      let i = 1;
      while (i < acc.length && acc[i] < dist) i++;
      const a = pts[i - 1];
      const b = pts[Math.min(i, pts.length - 1)];
      const segLen = acc[Math.min(i, acc.length - 1)] - acc[i - 1] || 1;
      const t = (dist - acc[i - 1]) / segLen;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        // Screen-space angle: y is scaled by H/W because the world box is wide.
        ang: Math.atan2((b.y - a.y) * (H / W), b.x - a.x),
      };
    }

    function seed() {
      puffs = [];
      embers = [];
      roadAcc = roadsRef.current.map(roadLen);
      clouds = [];
      const nClouds = small ? 2 : 3;
      for (let i = 0; i < nClouds; i++) {
        clouds.push({
          x: rand(-0.2, 1.2),
          y: rand(0.05, 0.9),
          rx: rand(0.18, 0.34),
          ry: rand(0.07, 0.14),
          sp: rand(0.0016, 0.0038),
          a: rand(0.06, 0.12),
        });
      }
      // Drifting mist banks: the quiet half of the weather, and the half that
      // actually reads at a glance on a bright map.
      mist = [];
      const nMist = small ? 3 : 6;
      for (let i = 0; i < nMist; i++) {
        mist.push({
          x: rand(-0.15, 1.15),
          y: rand(0.12, 0.92),
          r: rand(0.10, 0.24),
          a: rand(0.05, 0.11),
          sp: rand(0.0022, 0.0055),
        });
      }
      rain = [];
      const nRain = reduced ? 0 : small ? 50 : 130;
      for (let i = 0; i < nRain; i++) {
        rain.push({
          x: Math.random(),
          y: Math.random(),
          len: rand(0.012, 0.028),
          spd: rand(0.55, 1.05),
          a: rand(0.05, 0.16),
        });
      }

      // One flight at a time on a small screen, up to three otherwise.
      //
      // ONE IS SEEDED IMMEDIATELY, already mid-crossing. Purely lazy spawning
      // made "no planes" ambiguous - a dead render loop and an unlucky random
      // roll look identical - and it also meant the sky was empty for the
      // first several seconds, which is when someone is actually looking.
      planes = [];
      if (!reduced) {
        planes.push({
          x: 0.22, y: 0.18, vx: 0.040, vy: 0.010,
          alt: 0.8, life: 0, wing: 1.1,
        });
      }

      units = [];
      // ONE VEHICLE PER ROAD: every authored patrol path is manned, and the
      // path's index picks its vehicle from the pool round-robin, so path 3
      // always carries the same tank and "give each tank its own path" is
      // literally the data model. Phones man every other road.
      const rc = roadsRef.current.length;
      if (rc > 0) {
        const step = small ? 2 : 1;
        for (let i = 0; i < rc && units.length < 14; i += step) {
          units.push({
            road: i,
            d: Math.random(),
            sp: rand(0.012, 0.026),
            dir: Math.random() < 0.5 ? 1 : -1,
            img: vpool.length ? i % vpool.length : 0,
          });
        }
      }
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth || 1;
      H = canvas.clientHeight || 1;
      small = window.innerWidth < 760;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── THE HOUR. One wash over the whole board. ──
    function drawLight() {
      const L = LIGHT[phaseRef.current] ?? LIGHT.day;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, L.top);
      g.addColorStop(1, L.bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    /** Cloud shadows. Fifteen lines, and the single most convincing "this is a
     * real place under a real sky" cue available on a painted map. */
    function drawClouds(dt: number, move: boolean) {
      for (const c of clouds) {
        if (move) {
          c.x += c.sp * dt * 0.02;
          if (c.x - c.rx > 1.25) c.x = -0.25 - c.rx;
        }
        const x = c.x * W;
        const y = c.y * H;
        const rx = c.rx * W;
        const ry = c.ry * H;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
        g.addColorStop(0, `rgba(18,28,40,${c.a})`);
        g.addColorStop(1, "rgba(18,28,40,0)");
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / Math.max(rx, ry));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function spawnSmoke() {
      const z = zoom();
      for (const s of smokeRef.current) {
        if (puffs.length >= capPuffs()) break;
        // Thicker column the closer the wall is to breaking, thinned as you
        // zoom in so a close-up does not turn into soup.
        const rate = (0.14 + s.intensity * 0.5) / z;
        if (Math.random() < rate) {
          puffs.push({
            x: s.x + rand(-0.006, 0.006),
            y: s.y - 0.012,
            r: rand(0.008, 0.016) * (0.7 + s.intensity),
            a: rand(0.1, 0.22),
            vy: rand(0.03, 0.06),
            vx: rand(-0.004, 0.01),
            alert: !!s.alert,
          });
        }
        if (s.alert && embers.length < capEmbers() && Math.random() < 0.3 / z) {
          embers.push({
            x: s.x + rand(-0.012, 0.012),
            y: s.y - rand(0, 0.016),
            vx: rand(-0.01, 0.014),
            vy: rand(0.05, 0.11),
            a: 1,
            s: rand(0.8, 2.0),
            life: rand(0.5, 1),
          });
        }
      }
    }

    function stepSmoke(dt: number, wind: number) {
      for (const p of puffs) {
        p.y -= p.vy * dt * 0.02;
        p.x += (p.vx + wind * 0.05) * dt * 0.02;
        p.r += 0.00035 * dt;
        p.a -= 0.0013 * dt;
      }
      puffs = puffs.filter((p) => p.a > 0.005 && p.y > -0.1);
    }

    function drawSmoke() {
      for (const p of puffs) {
        const x = p.x * W;
        const y = p.y * H;
        const r = p.r * Math.max(W, H);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const c = p.alert ? "104,58,48" : "92,88,84";
        g.addColorStop(0, `rgba(${c},${p.a})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function stepEmbers(dt: number, wind: number) {
      for (const e of embers) {
        e.y -= e.vy * dt * 0.02;
        e.x += (e.vx + wind * 0.07) * dt * 0.02;
        e.vy *= 0.995;
        e.a -= (0.011 / e.life) * dt;
      }
      embers = embers.filter((e) => e.a > 0.02 && e.y > -0.05);
    }

    function drawEmbers(t: number) {
      ctx.globalCompositeOperation = "lighter";
      for (const e of embers) {
        const x = e.x * W;
        const y = e.y * H;
        const tw = 0.55 + 0.45 * Math.sin(t * 0.03 + x * 0.6);
        ctx.globalAlpha = Math.max(0, e.a) * tw;
        ctx.fillStyle = "rgba(255,124,68,1)";
        ctx.beginPath();
        ctx.arc(x, y, e.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    /** Your camp, lit from within. Warmer and stronger after dark, which is
     * what makes home read as home. */
    function drawHearths(t: number) {
      const ph = phaseRef.current;
      const night = ph === "night" || ph === "dusk";
      const flick = 0.72 + 0.18 * Math.sin(t * 0.006) + 0.1 * Math.sin(t * 0.013 + 1.1);
      ctx.globalCompositeOperation = "lighter";
      for (const h of hearthRef.current) {
        const x = h.x * W;
        const y = h.y * H;
        const r = Math.max(W, H) * (night ? 0.075 : 0.05) * (0.9 + flick * 0.2);
        const a = (night ? 0.3 : 0.16) * flick;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,186,104,${a})`);
        g.addColorStop(0.45, `rgba(240,138,54,${a * 0.45})`);
        g.addColorStop(1, "rgba(255,150,60,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    const maxPlanes = () => (reduced ? 0 : small ? 1 : 3);

    /** A flight crossing the board.
     *
     * Spawned off the edge, flying a straight line to the far side, then
     * retired. Altitude only affects how far its shadow is offset and how
     * small it reads, which is enough to sell height without any 3D.
     *
     * `reduced` gets none at all - prefers-reduced-motion should not have
     * aircraft tracking across the screen.
     */
    function stepPlanes(dt: number, move: boolean) {
      if (move && planes.length < maxPlanes() && Math.random() < 0.02 * dt) {
        // Enter from a random edge, always heading roughly across the board so
        // a flight is a journey rather than a corner-clip.
        const fromLeft = Math.random() < 0.5;
        const ang = (fromLeft ? 0 : Math.PI) + rand(-0.42, 0.42);
        const sp = rand(0.028, 0.052);
        planes.push({
          x: fromLeft ? -0.06 : 1.06,
          y: rand(0.06, 0.72),
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp * 0.35,
          alt: rand(0.55, 1),
          life: 0,
          wing: rand(0.9, 1.25),
        });
      }

      const z = zoom();
      for (const pl of planes) {
        if (move) {
          pl.x += pl.vx * dt * 0.02;
          pl.y += pl.vy * dt * 0.02;
          pl.life += dt;
        }
        const x = pl.x * W;
        const y = pl.y * H;
        const size = Math.max(5, W * 0.009 * pl.wing * (0.7 + pl.alt * 0.5));
        const ang = Math.atan2(pl.vy * 0.35, pl.vx);

        // The shadow runs on the GROUND, offset by altitude and thrown toward
        // the lower right like every other shadow on this map. It is what
        // actually reads as "that thing is in the air".
        const drop = size * (2.2 + pl.alt * 5.5);
        ctx.globalAlpha = 0.20 * (1 - pl.alt * 0.45);
        ctx.fillStyle = "#1d1508";
        ctx.save();
        ctx.translate(x + drop * 0.8, y + drop);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.95, size * 0.30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        // Fuselage, wings, tail. Shapes, not a sprite: it cannot 404 and it
        // stays consistent with the armour drawn the same way.
        ctx.fillStyle = "#5b6350";
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.9, size * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6d7660";
        ctx.fillRect(-size * 0.16, -size * 0.78, size * 0.30, size * 1.56);
        ctx.fillStyle = "#4b5343";
        ctx.fillRect(-size * 0.80, -size * 0.42, size * 0.20, size * 0.84);
        // A glint on the canopy, only when zoomed in enough to see it.
        if (z > 1.6) {
          ctx.fillStyle = "rgba(255,246,214,0.75)";
          ctx.beginPath();
          ctx.ellipse(size * 0.34, 0, size * 0.16, size * 0.11, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      planes = planes.filter((pl) => pl.x > -0.14 && pl.x < 1.14 && pl.y > -0.14 && pl.y < 1.14);
    }

    /** Armour on the roads. Drawn as shapes rather than sprites: it needs no
     * art to exist, it can never 404, and it stays consistent with the vector
     * glyphs while the paintings are still being made. */
    function drawUnits(dt: number, move: boolean) {
      const size = Math.max(6, W * 0.011);
      for (const u of units) {
        if (move) u.d += u.sp * u.dir * dt * 0.02;
        const p = sampleRoad(u.road, u.d);
        if (!p) continue;
        const x = p.x * W;
        const y = p.y * H;
        const ang = p.ang + (u.dir < 0 ? Math.PI : 0);

        // Contact shadow, matching the 10 o'clock sun the art and the glyphs
        // both use (down and to the right).
        ctx.fillStyle = "rgba(30,22,12,0.26)";
        ctx.beginPath();
        ctx.ellipse(x + size * 0.28, y + size * 0.3, size * 0.8, size * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(x, y);
        const slot = vpool[u.img];
        if (slot && slot.ready) {
          // TOP-DOWN sprite, nose-up master: heading 0 (driving +x) needs a
          // +90deg turn. A plan view rotates to any heading without lying,
          // which is the whole reason the moving layer takes top-down art
          // while the standing commander pieces stay side-view.
          ctx.rotate(ang + Math.PI / 2);
          // 3x the unit size: at 2.35x the painted detail muddied into a dark
          // blob on the terrain (caught on the composite, not guessed).
          const h = size * 3.0;
          const w = h * (slot.im.naturalWidth / slot.im.naturalHeight);
          ctx.drawImage(slot.im, -w / 2, -h / 2, w, h);
        } else {
          ctx.rotate(ang);
          // hull
          ctx.fillStyle = "#4a5340";
          ctx.fillRect(-size * 0.7, -size * 0.42, size * 1.4, size * 0.84);
          // lit top edge
          ctx.fillStyle = "#5d6850";
          ctx.fillRect(-size * 0.7, -size * 0.42, size * 1.4, size * 0.3);
          // turret
          ctx.fillStyle = "#39422f";
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
          ctx.fill();
          // barrel
          ctx.strokeStyle = "#39422f";
          ctx.lineWidth = Math.max(1, size * 0.14);
          ctx.beginPath();
          ctx.moveTo(size * 0.2, 0);
          ctx.lineTo(size * 0.95, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    /** Mist banks, then rain. Drawn LAST so weather sits in front of the
     * ground and the traffic, which is where weather is. */
    function drawWeather(dt: number, wind: number, move: boolean) {
      for (const m of mist) {
        if (move) {
          m.x += m.sp * dt * 0.02;
          if (m.x - m.r > 1.25) m.x = -0.25 - m.r;
        }
        const x = m.x * W;
        const y = m.y * H;
        const r = m.r * Math.max(W, H);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(226,238,246,${m.a})`);
        g.addColorStop(1, "rgba(226,238,246,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!rain.length) return;
      ctx.strokeStyle = "rgba(206,224,240,1)";
      ctx.lineWidth = Math.max(1, 0.9 * (W / 1600));
      for (const d of rain) {
        if (move) {
          d.y += d.spd * dt * 0.02;
          d.x += wind * 0.0014 * dt;
          if (d.y > 1.04) {
            d.y = -0.04;
            d.x = Math.random();
          }
          if (d.x > 1.04) d.x = -0.03;
        }
        ctx.globalAlpha = d.a;
        const x = d.x * W;
        const y = d.y * H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - wind * 11, y + d.len * H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function frameStatic() {
      ctx.clearRect(0, 0, W, H);
      if (sky) {
        stepPlanes(0, false);
        return;
      }
      drawLight();
      drawClouds(0, false);
      // A few settled puffs per siege source so the front still reads as busy.
      for (const s of smokeRef.current) {
        for (let i = 0; i < 3; i++) {
          const x = s.x * W;
          const y = (s.y - 0.02 - i * 0.03) * H;
          const r = (0.01 + i * 0.008) * Math.max(W, H) * (0.7 + s.intensity);
          const c = s.alert ? "104,58,48" : "92,88,84";
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(${c},${0.14 - i * 0.035})`);
          g.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      drawHearths(0);
      // Units PARKED on the roads. Arguably the better-looking still frame.
      drawUnits(0, false);
      drawWeather(0, 0.5, false);
    }

    let raf = 0;
    let last = 0;
    let running = false;
    function loop(ts: number) {
      if (!running) return;
      const dt = last ? Math.min(3, (ts - last) / 16.67) : 1;
      last = ts;
      const wind = 0.5 + Math.sin(ts * 0.0003) * 0.3;
      ctx.clearRect(0, 0, W, H);
      if (sky) {
        stepPlanes(dt, true);
        // RE-ARM BEFORE RETURNING. The tail of this function is what schedules
        // the next frame, so an early `return` here ran the sky layer exactly
        // ONCE and then stopped forever - a canvas correctly stacked above the
        // buildings, painting nothing, which read as "the planes are gone".
        raf = requestAnimationFrame(loop);
        return;
      }
      drawLight();
      drawClouds(dt, true);
      stepSmoke(dt, wind);
      spawnSmoke();
      drawSmoke();
      stepEmbers(dt, wind);
      drawEmbers(ts);
      drawHearths(ts);
      drawUnits(dt, true);
      drawWeather(dt, wind, true);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function boot() {
      resize();
      seed();
      if (reduced) {
        frameStatic();
        return;
      }
      start();
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) frameStatic();
    });
    ro.observe(canvas);

    const onVis = () => {
      if (reduced) return;
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVis);

    const onReduce = () => {
      reduced = reducedMq.matches;
      stop();
      seed();
      if (reduced) frameStatic();
      else start();
    };
    reducedMq.addEventListener?.("change", onReduce);

    boot();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      reducedMq.removeEventListener?.("change", onReduce);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="world-canvas"
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
