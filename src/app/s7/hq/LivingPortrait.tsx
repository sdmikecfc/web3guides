"use client";
/**
 * LivingPortrait: the ADVENTURER portrait, extracted from the commander
 * panel's preview card so the HUD chip, the preview card, and any future
 * consumer render the SAME way.
 *
 * STILL ONLY (2026-08-31): the adventurer idle clips were never produced.
 * The adventurer art folder has no anim subfolder on disk; the
 * IDLE_COMMANDER_KEYS claim in model.ts is stale (it now carries its own DEAD
 * PATH WARNING), and the only idle loops that shipped are the CLASS loops
 * (panels.tsx ClassPortrait renders those). So this component mounts no
 * <video> at all: the knee-up PNG is the whole portrait, which is exactly
 * what every visitor already saw, minus the guaranteed 404 request.
 *
 * The component fills its parent (position:relative, 100% box): consumers own
 * the frame (border, size, aspect). `fit` styles the static layer:
 * "contain" bottom-center makes a knee-up read as a figure card over the card
 * gradient; "cover" fills small chips.
 */
import { useEffect, useState } from "react";
import { COMMANDERS } from "@/lib/s7/tanks";

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
  /** Object-fit of the portrait still. */
  fit?: "cover" | "contain";
}) {
  // Remember WHICH src broke, not a boolean (the TankArt pattern): comparing
  // the broken src to the current one un-breaks on a commander swap for free.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const png = `/s7-art/pilot/${ck}.png`;
  const imgBroken = brokenSrc === png;
  const name = COMMANDERS.find((c) => c.key === ck)?.name ?? "";
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
      {/* No idle clip layer: the adventurer clips were never produced (the
          model.ts IDLE_COMMANDER_KEYS claim is stale; no adventurer anim
          folder exists), so mounting a <video> here 404ed for all nine keys. */}
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
