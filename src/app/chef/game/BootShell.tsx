"use client";

/**
 * The Domain Kitchen boot screen: shown while the engine downloads and
 * the preloader counts real assets (ADR-0101 requires a real loading bar).
 * DOM only — it must render before Pixi exists. Player copy: 6th grade, no
 * em-dashes, never "win $X".
 */

/**
 * Loading tips stay focused on restaurant play and collecting.
 */
import { FONT } from "./_ui/tokens";
import { IconChefHat } from "./_ui/icons";
import type { ReactNode } from "react";

export const BOOT_TIPS = [
  "Tip: Your home crew cooks and serves automatically. Keep their paths clear.",
  "Tip: Mix furniture collections, paint the floor, and give your storefront its own personality.",
  "Tip: Finish today's small care jobs to keep your restaurant welcoming.",
  "Tip: Your cookbook keeps its recipes when you change your restaurant's style.",
  "Tip: A fresh ingredient delivery waits each day. Save the right ingredients to upgrade a recipe.",
  "Tip: In your food truck, tap a station to walk over and use it.",
  "Tip: While your truck's pasta boils, take a tomato to the sauce pan.",
  "Tip: Pause a truck shift whenever you like. Back home saves it for another visit.",
  "Tip: A new machine can bring a new dish to your home restaurant. Leave its working side clear.",
];

export function BootShell({
  progress,
  tip,
  error,
  recovery,
}: {
  progress: number;
  tip: string;
  error?: string;
  recovery?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background:
          "radial-gradient(120% 90% at 50% 0%, #fffdf6 0%, #f4eddf 55%, #e0e7cb 100%)",
        color: "#3c392c",
        fontFamily: FONT,
        textAlign: "center",
        padding: 24,
        zIndex: 10,
      }}
    >
      <div style={{ color: "#537752", lineHeight: 1 }}><IconChefHat size={46}/></div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          lineHeight: 1.15,
        }}
      >
        <span style={{display:"block",fontFamily:FONT,fontSize:12,fontWeight:800,letterSpacing:".2em",textTransform:"uppercase",color:"#7a835e",marginBottom:8}}>Welcome home</span>
        Domain Kitchen
      </div>
      {error ? (
        <>
          <div style={{ fontSize: 15, opacity: 0.9, maxWidth: 420 }}>
            {error === "boot" ? "The kitchen could not open. Check your connection and try again." : error}
          </div>
          {recovery ?? <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 6,
              padding: "10px 22px",
              borderRadius: 999,
              border: "1px solid #e8a13d",
              background: "#fffdf6",
              color: "#3c392c",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>}
        </>
      ) : (
        <>
          <div
            style={{
              width: "min(360px, 76vw)",
              height: 14,
              borderRadius: 999,
              background: "#e6dcc8",
              border: "1px solid #dfd4bb",
              overflow: "hidden",
            }}
            role="progressbar"
            aria-label="Opening your kitchen"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct * 100)}
          >
            <div
              style={{
                width: `${Math.round(pct * 100)}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #d97b29, #e8a13d)",
                transition: "width 160ms ease",
              }}
            />
          </div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {Math.round(pct * 100)}%
          </div>
          <div style={{ fontSize: 14, opacity: 0.85, maxWidth: 420 }}>{tip}</div>
        </>
      )}
    </div>
  );
}
