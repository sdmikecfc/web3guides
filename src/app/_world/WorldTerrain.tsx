"use client";
/**
 * RIVERS AND ROADS — drawn from the same data the game routes on.
 *
 * WHY THIS EXISTS. The first design painted roads and rivers into the ground
 * plate and tried to recover them afterwards by classifying pixel colour. It
 * does not work, and the reason is not a bad threshold: a sandy road and a
 * sandy field are the same material. Measured off the real plate, road pixels
 * sat at h=0.10/s=0.46 while the map's dry ground sat immediately beside them,
 * and the only thing separating a road from a field is its SHAPE. Colour
 * cannot see shape. So the network is authored instead, and this draws it.
 *
 * The payoff is that there is now ONE source of truth. Ambient tanks patrol the
 * exact polylines drawn here, so they are on the road by construction; building
 * placement treats these rivers as impassable, so nothing can stand in water;
 * and a new season swaps the polylines and the art folder with no tuning pass.
 *
 * Painterly, not CAD. Each stroke is laid down in several passes — a soft dark
 * shoulder, the body, then a lighter core — through a smoothed spline, so it
 * reads as part of the painting rather than a route drawn on top of it.
 *
 * Sits UNDER every sprite and label. Repaints only on resize; there is no
 * animation here, so it costs one paint.
 */
import { useEffect, useRef } from "react";
import type { Vec2 } from "@/lib/world/types";

export type WorldTerrainProps = {
  roads: Vec2[][];
  rivers: Vec2[][];
  crossings: Vec2[];
  /** Worn earth each building stands on. See the paint order note below. */
  pads?: Array<Vec2 & { r: number }>;
  /** Short spurs from a building's pad to the nearest road. */
  tracks?: Vec2[][];
  className?: string;
};

/**
 * WHY THESE ARE RIBBONS AND NOT STROKED LINES.
 *
 * The first version drew each road with ctx.stroke() at a fixed lineWidth. The
 * result read as a route drawn ON a painting rather than part of it: perfectly
 * even width for its whole length, perfectly straight between authored points,
 * and a hard mechanical edge. Nothing in a painted landscape has a constant
 * width or a straight edge.
 *
 * So each road and river is built as a POLYGON instead — the centre line is
 * densified, made to wander, and then given a left and right bank that vary
 * independently along its length. Fixed seed, so the wander is identical on
 * every load and for every player; this is scenery, not a roll.
 */

/** Deterministic smooth noise: a few sines at incommensurate frequencies. No
 * lattice, no tables, and continuous by construction, which is what a bank
 * needs. */
function wobbler(seed: number) {
  const a = 12.9898 + seed * 0.017;
  const b = 78.233 + seed * 0.031;
  const c = 43.758 + seed * 0.011;
  return (t: number) =>
    Math.sin(t * a) * 0.5 + Math.sin(t * b * 0.37 + 1.7) * 0.32 + Math.sin(t * c * 0.11 + 3.1) * 0.18;
}

/** Even-spaced points along the authored polyline, with Chaikin rounding first
 * so authored corners flow. */
function densify(pts: Vec2[], n: number): Vec2[] {
  let p = pts.map((q) => [q.x, q.y] as [number, number]);
  for (let r = 0; r < 3; r++) {
    if (p.length < 3) break;
    const out: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  // Resample to n evenly spaced samples so width varies by DISTANCE, not by
  // however densely that stretch happened to be authored.
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const out: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const d = (k / (n - 1)) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    out.push({ x: p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, y: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t });
  }
  return out;
}

/** Push the centre line side to side so it meanders like a real watercourse or
 * a track worn around obstacles. */
function meander(pts: Vec2[], amp: number, seed: number): Vec2[] {
  const w = wobbler(seed);
  return pts.map((p, i, arr) => {
    const a = arr[Math.max(0, i - 1)];
    const b = arr[Math.min(arr.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    // Perpendicular, tapered to zero at both ends so joins stay put.
    const t = i / (arr.length - 1);
    const taper = Math.sin(Math.PI * t);
    const k = w(t * 6) * amp * taper;
    return { x: p.x + (-dy / L) * k, y: p.y + (dx / L) * k };
  });
}

/** Fill a ribbon whose half-width varies along its length. */
function ribbon(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  W: number,
  H: number,
  half: (t: number) => number,
  jitter: (t: number, side: number) => number,
) {
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = (b.x - a.x) * W;
    const dy = (b.y - a.y) * H;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const t = i / (pts.length - 1);
    const x = pts[i].x * W;
    const y = pts[i].y * H;
    const hl = half(t) * (1 + jitter(t, 0));
    const hr = half(t) * (1 + jitter(t, 1));
    L.push([x + nx * hl, y + ny * hl]);
    R.push([x - nx * hr, y - ny * hr]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (const [x, y] of L) ctx.lineTo(x, y);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fill();
}

export function WorldTerrain({ roads, rivers, crossings, pads = [], tracks = [], className }: WorldTerrainProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const data = useRef({ roads, rivers, crossings, pads, tracks });
  data.current = { roads, rivers, crossings, pads, tracks };

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    const paint = () => {
      const parent = cv.parentElement;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      // Roads and rivers are soft-edged, so a half-resolution buffer is
      // invisible here and costs a quarter of the pixels. Same trade the
      // existing MapTerrain makes.
      const dpr = Math.min(2, window.devicePixelRatio || 1) * 0.75;
      const W = Math.round(r.width * dpr);
      const H = Math.round(r.height * dpr);
      cv.width = W;
      cv.height = H;
      cv.style.width = "100%";
      cv.style.height = "100%";
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const unit = W / 1000; // widths authored against a 1000-wide reference

      // ── RIVERS ── laid down first so roads and their crossings sit on top.
      //
      // These arrive ALREADY RESOLVED from map-fit.py: the wander is baked in
      // upstream so the water drawn here is byte-for-byte the water that
      // building placement was tested against. Re-wandering it locally is what
      // previously stood a fort in the river.
      data.current.rivers.forEach((line, ri) => {
        const wob = wobbler(400 + ri);
        // A river is widest in its middle reaches and narrows toward source and
        // mouth, and its banks are ragged and uneven.
        const wide = (t: number) => (6.5 + 4.5 * Math.sin(Math.PI * t) + wob(t * 3) * 1.8) * unit;
        const bankJit = (t: number, side: number) => wob(t * 9 + side * 5.5) * 0.34;

        ctx.fillStyle = "rgba(112,132,78,0.50)"; // damp margin
        ribbon(ctx, line, W, H, (t) => wide(t) * 1.55, bankJit);
        ctx.fillStyle = "rgba(126,190,180,0.92)"; // shallows
        ribbon(ctx, line, W, H, (t) => wide(t) * 1.16, bankJit);
        ctx.fillStyle = "rgba(72,156,178,0.97)"; // body
        ribbon(ctx, line, W, H, wide, bankJit);
        // Sunlit riffle, offset up-left toward the 10 o'clock sun and broken
        // along its length so it glints rather than stripes.
        ctx.save();
        ctx.translate(-1.6 * unit, -1.6 * unit);
        ctx.fillStyle = "rgba(176,230,228,0.55)";
        ribbon(ctx, line, W, H, (t) => wide(t) * (0.18 + 0.16 * Math.max(0, wob(t * 14))), bankJit);
        ctx.restore();
      });

      // ── ROADS ── likewise pre-resolved; see the rivers note above.
      data.current.roads.forEach((line, ri) => {
        const wob = wobbler(200 + ri);
        // Tracks widen where they are used and pinch where they thread past
        // something. Never a constant width.
        const wide = (t: number) => (3.1 + wob(t * 4) * 0.9) * unit;
        const edgeJit = (t: number, side: number) => wob(t * 13 + side * 3.3) * 0.30;

        ctx.save();
        ctx.translate(1.8 * unit, 2.2 * unit);
        ctx.fillStyle = "rgba(84,74,44,0.26)"; // shoulder shadow, sun-consistent
        ribbon(ctx, line, W, H, (t) => wide(t) * 1.12, edgeJit);
        ctx.restore();

        ctx.fillStyle = "rgba(172,146,94,0.94)"; // packed earth verge
        ribbon(ctx, line, W, H, (t) => wide(t) * 1.06, edgeJit);
        ctx.fillStyle = "rgba(224,204,150,0.97)"; // sandy body
        ribbon(ctx, line, W, H, wide, edgeJit);
        // Worn wheel ruts: two thin lighter bands rather than one centre stripe,
        // which is what actually makes a track read as travelled.
        ctx.fillStyle = "rgba(242,228,186,0.62)";
        for (const off of [-0.42, 0.42]) {
          const rut = line.map((p, i, arr) => {
            const a = arr[Math.max(0, i - 1)];
            const b = arr[Math.min(arr.length - 1, i + 1)];
            const dx = (b.x - a.x) * W;
            const dy = (b.y - a.y) * H;
            const L = Math.hypot(dx, dy) || 1;
            const t = i / (arr.length - 1);
            const d = wide(t) * off;
            return { x: p.x + ((-dy / L) * d) / W, y: p.y + ((dx / L) * d) / H };
          });
          ribbon(ctx, rut, W, H, (t) => wide(t) * 0.15, (t) => wob(t * 17) * 0.4);
        }
      });

      // ── PADS AND TRACKS ── the thing that stops a building being a sticker.
      //
      // Painted AFTER the roads so a pad blends into the verge where it meets
      // one, and BEFORE the crossings so a bridge still reads on top. Every
      // structure gets a patch of trodden earth slightly wider than its
      // footprint, plus a worn spur running to the nearest road. Without these
      // a building sits on untouched grass and reads as pasted on, no matter
      // how carefully it was placed - which is what several rounds of moving
      // things around failed to fix.
      for (const t of data.current.tracks) {
        const wob = wobbler(700 + Math.round(t[0].x * 997));
        ctx.fillStyle = "rgba(168,146,102,0.55)";
        ribbon(ctx, densify(t, 40), W, H, () => 2.0 * unit, (u2) => wob(u2 * 11) * 0.4);
        ctx.fillStyle = "rgba(214,196,146,0.62)";
        ribbon(ctx, densify(t, 40), W, H, () => 1.3 * unit, (u2) => wob(u2 * 15) * 0.4);
      }
      for (const pad of data.current.pads) {
        const x = pad.x * W;
        const y = pad.y * H;
        const rx = pad.r * W;
        // Squashed, because the ground is seen at an oblique angle, and offset
        // slightly down so it reads as the earth in FRONT of the building too.
        const ry = rx * 0.46;
        const g = ctx.createRadialGradient(x, y - ry * 0.15, rx * 0.15, x, y - ry * 0.15, rx);
        g.addColorStop(0, "rgba(178,154,108,0.62)");
        g.addColorStop(0.62, "rgba(178,154,108,0.34)");
        g.addColorStop(1, "rgba(178,154,108,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y - ry * 0.15, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── CROSSINGS ── the road itself becomes a bridge.
      //
      // NOT a bridge sprite. A separate plank sprite dropped at the crossing
      // read as a third object stacked on the road on the river, and it never
      // sat at the road's angle. Instead the ROAD grows a heavy parapet either
      // side for a short span, which is what actually says "bridge": you read
      // the barrier, not a texture. It follows the road's own direction for
      // free, because it is built from the road's own points.
      for (const c of data.current.crossings) {
        // Find the stretch of road nearest this crossing.
        let best: { line: Vec2[]; i: number; d: number } | null = null;
        for (const line of data.current.roads) {
          for (let i = 0; i < line.length; i++) {
            const d = Math.hypot((line[i].x - c.x) * W, (line[i].y - c.y) * H);
            if (!best || d < best.d) best = { line, i, d };
          }
        }
        if (!best) continue;
        const SPAN = 9; // points either side of the crossing
        const seg = best.line.slice(Math.max(0, best.i - SPAN), best.i + SPAN + 1);
        if (seg.length < 3) continue;

        // Deck: a wider, firmer band of roadway over the water.
        ctx.fillStyle = "rgba(198,172,120,0.99)";
        ribbon(ctx, seg, W, H, () => 7.4 * unit, () => 0);
        ctx.fillStyle = "rgba(226,206,150,0.99)";
        ribbon(ctx, seg, W, H, () => 6.2 * unit, () => 0);

        // Parapets: two dark timber rails running the length of the deck,
        // offset to either side. This is the part that reads as a bridge.
        for (const side of [-1, 1]) {
          const rail = seg.map((p, i, arr) => {
            const a = arr[Math.max(0, i - 1)];
            const b = arr[Math.min(arr.length - 1, i + 1)];
            const dx = (b.x - a.x) * W;
            const dy = (b.y - a.y) * H;
            const L = Math.hypot(dx, dy) || 1;
            const off = side * 7.0 * unit;
            return { x: p.x + ((-dy / L) * off) / W, y: p.y + ((dx / L) * off) / H };
          });
          ctx.fillStyle = "rgba(74,56,34,0.55)"; // rail shadow on the deck
          ribbon(ctx, rail.map((p) => ({ x: p.x + (0.9 * unit) / W, y: p.y + (1.2 * unit) / H })),
                 W, H, () => 1.9 * unit, () => 0);
          ctx.fillStyle = "rgba(146,106,64,0.99)";
          ribbon(ctx, rail, W, H, () => 1.7 * unit, () => 0);
        }
      }
    };

    paint();
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    });
    if (cv.parentElement) ro.observe(cv.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="world-terrain"
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
