"use client";
/**
 * LivingPortrait: the video-over-poster commander portrait, extracted from the
 * commander panel's preview card so the HUD chip, the preview card, and any
 * future consumer render idles the SAME way.
 *
 * Layering: the static knee-up PNG paints first (poster + fallback), the idle
 * clip mounts over it ONLY when that commander has a landed clip
 * (IDLE_COMMANDER_KEYS, all eight now) AND the visitor does not prefer reduced
 * motion. Under reduced motion NO <video> element mounts at all (the
 * ADR-0074 TODO): the still PNG is the whole portrait.
 *
 * The component fills its parent (position:relative, 100% box): consumers own
 * the frame (border, size, aspect). `fit` styles the STATIC layer only:
 * "contain" bottom-center makes a knee-up read as a figure card over the card
 * gradient; "cover" fills small chips. The clip layer always covers (the clips
 * are bust-framed 3:4 by design, record in ADR-0074).
 */
import { useEffect, useRef, useState } from "react";
import { IDLE_COMMANDER_KEYS } from "@/lib/s5/model";
import { COMMANDERS } from "@/lib/s5/tanks";

/** prefers-reduced-motion, live (re-renders on OS toggle). SSR-safe: false
 * until the client effect reads the real media query. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    // Safari <14 has addListener only; the modern path first.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);
  return reduced;
}

export function LivingPortrait({
  ck,
  showName = false,
  fit = "cover",
}: {
  ck: string;
  /** Render the commander's name label (bottom-left, mono, uppercase). */
  showName?: boolean;
  /** Object-fit of the STATIC layer; the clip always covers. */
  fit?: "cover" | "contain";
}) {
  // Remember WHICH src broke, not a boolean (the TankArt pattern): comparing
  // the broken src to the current one un-breaks on a commander swap for free.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const reduced = useReducedMotion();
  const png = `/s5-art/commander/${ck}.png`;
  const imgBroken = brokenSrc === png;
  const name = COMMANDERS.find((c) => c.key === ck)?.name ?? "";
  const hasIdle = IDLE_COMMANDER_KEYS.has(ck) && !reduced;
  // Some browsers hold muted autoplay until a gesture; nudge it on mount/swap.
  useEffect(() => {
    vidRef.current?.play().catch(() => {});
  }, [ck, hasIdle]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {!imgBroken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={png}
          src={png}
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit,
            objectPosition: "bottom center",
          }}
          onError={() => setBrokenSrc(png)}
        />
      ) : null}
      {hasIdle ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={vidRef}
          key={ck}
          src={`/s5-art/commander/anim/${ck}.mp4`}
          poster={png}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={(e) => {
            const v = e.currentTarget;
            if (v.paused) v.play().catch(() => {});
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      {showName ? (
        <span
          style={{
            position: "absolute",
            left: 8,
            bottom: 6,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#fff",
            textShadow: "0 1px 6px rgba(0,0,0,0.85)",
            pointerEvents: "none",
          }}
        >
          {name}
        </span>
      ) : null}
    </div>
  );
}
