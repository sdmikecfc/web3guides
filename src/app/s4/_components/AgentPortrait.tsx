"use client";
/**
 * S4 leaderboard portrait: a player's character art in a small rounded frame,
 * with a graceful, hydration-safe fallback to a team-colored agent silhouette
 * (the map's AgentFallback pattern, ADR-0008 readability grammar).
 *
 * Why a client leaf on an otherwise server-rendered board: a missing art file
 * can only be caught at the image layer (onError). resolveModel returns a real
 * per-team base look for launch-day players who never geared up, so this is a
 * safety net, not the common path, but the board must never show a broken-image
 * icon. The Leaderboard itself stays a server component; this is the one leaf
 * that needs the browser. Same hydration-safe onError guard the map ships: a
 * 404 that resolves before hydration never fires onError, so a mount-time ref
 * check catches an already-broken image too.
 */
import { useState } from "react";

// One era-accented silhouette per stable team key, colored by the runtime team
// accent so a theme recolor repaints it. A headcount stand-in, not a portrait:
// alpha wide-brim hat, beta cyber visor and antenna, gamma fedora and trench.
function AgentSilhouette({ teamKey, accent }: { teamKey: string; accent: string }) {
  return (
    <svg
      viewBox="0 0 20 26"
      width="72%"
      height="88%"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path
        d="M10 10 C5.5 10 3.5 14 3.5 19 L3.5 26 L16.5 26 L16.5 19 C16.5 14 14.5 10 10 10 Z"
        fill="#14161f"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="0.6"
      />
      <circle cx="10" cy="6.2" r="3.6" fill="#181b26" />
      {teamKey === "alpha" && (
        <>
          <ellipse cx="10" cy="4.4" rx="6.6" ry="1.7" fill={accent} />
          <path d="M6.8 4.4 Q10 -1.2 13.2 4.4 Z" fill={accent} />
          <rect x="8.2" y="12.5" width="3.6" height="1.4" rx="0.7" fill={accent} opacity="0.8" />
        </>
      )}
      {teamKey === "beta" && (
        <>
          <rect x="6" y="5.2" width="8" height="1.9" rx="0.95" fill={accent} />
          <line x1="12.6" y1="3" x2="14" y2="0.8" stroke={accent} strokeWidth="0.9" strokeLinecap="round" />
          <circle cx="14.2" cy="0.7" r="0.8" fill={accent} />
          <circle cx="10" cy="13.5" r="1.1" fill={accent} opacity="0.85" />
        </>
      )}
      {teamKey === "gamma" && (
        <>
          <rect x="3.6" y="4.2" width="12.8" height="1.7" rx="0.85" fill={accent} />
          <rect x="6.6" y="0.6" width="6.8" height="4" rx="1" fill={accent} />
          <rect x="9.4" y="11" width="1.2" height="7" rx="0.6" fill={accent} opacity="0.8" />
        </>
      )}
      {teamKey !== "alpha" && teamKey !== "beta" && teamKey !== "gamma" && (
        <path d="M5 6 Q10 -2 15 6 L15 9 Q10 6 5 9 Z" fill={accent} />
      )}
    </svg>
  );
}

export function AgentPortrait({
  art,
  teamKey,
  accent,
  size = 46,
}: {
  art: string;
  teamKey: string;
  accent: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showArt = !!art && !failed;
  return (
    <span
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 11,
        overflow: "hidden",
        border: `1px solid ${accent}55`,
        background: `linear-gradient(160deg, ${accent}22, #0c0e15 70%)`,
      }}
    >
      {showArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          width={size}
          height={size}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
            display: "block",
          }}
          // A 404 that resolves BEFORE hydration never fires onError; the ref
          // catches an already-broken image at mount so the silhouette shows.
          ref={(el) => {
            if (el && el.complete && el.naturalWidth === 0) setFailed(true);
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <AgentSilhouette teamKey={teamKey} accent={accent} />
      )}
    </span>
  );
}
