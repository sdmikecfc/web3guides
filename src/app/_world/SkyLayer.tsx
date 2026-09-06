"use client";
/**
 * THE SKY — flights crossing above the board.
 *
 * WHY THIS IS ITS OWN COMPONENT AND NOT A FLAG ON WorldCanvas.
 * Planes must pass IN FRONT of a fort or they look like they are flying
 * through it; smoke must pour from BEHIND one or it hides the wall it comes
 * from. One canvas can only be on one side of the sprites, so two are needed.
 *
 * The first attempt added a `sky` flag to WorldCanvas and rendered it twice.
 * The second instance never ran: its canvas sized correctly and then nothing
 * cleared it — proven by painting a rectangle into it by hand and watching it
 * survive. No exception, no console error, boot() unconditional. Rather than
 * keep guessing inside a 600-line effect that carries reduced-motion, DPR,
 * visibility and resize handling for a dozen particle systems, the sky gets
 * forty lines it fully owns.
 *
 * It still honours the two guards that matter: prefers-reduced-motion draws
 * nothing at all, and a hidden tab stops the loop.
 */
import { useEffect, useRef } from "react";

type Plane = { x: number; y: number; vx: number; vy: number; alt: number; wing: number };

export function SkyLayer({ className, sprite }: {
  className?: string;
  /** Optional TOP-DOWN plane image, nose pointing UP. Rotated to heading at
   * draw time — a plan view can face any direction without lying, which is
   * why the moving layer takes top-down masters only. Until it loads (or if
   * it 404s) the vector plane below keeps flying: art and code stay
   * independently shippable, same contract as every sprite on the board. */
  sprite?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let img: HTMLImageElement | null = null;
    let imgReady = false;
    if (sprite) {
      img = new Image();
      img.onload = () => { imgReady = img!.naturalWidth > 0; };
      img.src = sprite;
    }

    let W = 1;
    let H = 1;
    let raf = 0;
    let last = 0;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const max = () => (window.innerWidth < 760 ? 1 : 3);

    // One is airborne immediately. Purely lazy spawning made an empty sky and
    // a dead loop look identical, which cost real time to tell apart.
    const planes: Plane[] = [
      { x: 0.18, y: 0.16, vx: 0.042, vy: 0.011, alt: 0.8, wing: 1.1 },
    ];

    function size() {
      const r = cv!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      cv!.width = Math.round(W * dpr);
      cv!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn() {
      const fromLeft = Math.random() < 0.5;
      const ang = (fromLeft ? 0 : Math.PI) + rand(-0.4, 0.4);
      const sp = rand(0.03, 0.055);
      planes.push({
        x: fromLeft ? -0.06 : 1.06,
        y: rand(0.05, 0.7),
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * 0.35,
        alt: rand(0.55, 1),
        wing: rand(0.9, 1.25),
      });
    }

    function frame(ts: number) {
      const dt = last ? Math.min(3, (ts - last) / 16.67) : 1;
      last = ts;
      ctx!.clearRect(0, 0, W, H);

      if (planes.length < max() && Math.random() < 0.012 * dt) spawn();

      for (const p of planes) {
        p.x += p.vx * dt * 0.02;
        p.y += p.vy * dt * 0.02;
        const x = p.x * W;
        const y = p.y * H;
        const s = Math.max(5, W * 0.009 * p.wing * (0.7 + p.alt * 0.5));
        const ang = Math.atan2(p.vy * 0.35, p.vx);

        // The shadow runs on the GROUND, offset by altitude and thrown toward
        // the lower right like every other shadow on this map. It is what
        // actually reads as "that thing is in the air".
        const drop = s * (2.2 + p.alt * 5.5);
        ctx!.save();
        ctx!.globalAlpha = 0.2 * (1 - p.alt * 0.45);
        ctx!.fillStyle = "#1d1508";
        ctx!.translate(x + drop * 0.8, y + drop);
        ctx!.rotate(ang);
        ctx!.beginPath();
        ctx!.ellipse(0, 0, s * 0.95, s * 0.3, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();

        ctx!.save();
        ctx!.translate(x, y);
        if (imgReady && img) {
          // Nose-up master: heading 0 (flying +x) needs a +90deg turn.
          ctx!.rotate(ang + Math.PI / 2);
          const span = s * 3.0;
          ctx!.drawImage(img, -span / 2, -span / 2, span, span);
        } else {
          ctx!.rotate(ang);
          ctx!.fillStyle = "#5b6350";
          ctx!.beginPath();
          ctx!.ellipse(0, 0, s * 0.9, s * 0.22, 0, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = "#6d7660";
          ctx!.fillRect(-s * 0.16, -s * 0.78, s * 0.3, s * 1.56); // wings
          ctx!.fillStyle = "#4b5343";
          ctx!.fillRect(-s * 0.8, -s * 0.42, s * 0.2, s * 0.84); // tailplane
          ctx!.fillStyle = "rgba(255,246,214,0.7)";
          ctx!.beginPath();
          ctx!.ellipse(s * 0.34, 0, s * 0.16, s * 0.11, 0, 0, Math.PI * 2); // canopy
          ctx!.fill();
        }
        ctx!.restore();
      }

      for (let i = planes.length - 1; i >= 0; i--) {
        const p = planes[i];
        if (p.x < -0.16 || p.x > 1.16 || p.y < -0.16 || p.y > 1.16) planes.splice(i, 1);
      }
      raf = requestAnimationFrame(frame);
    }

    size();
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(size);
    ro.observe(cv);
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [sprite]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="sky-layer"
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
