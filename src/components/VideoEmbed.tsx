"use client";

import { useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   VideoEmbed — premium responsive video player with click-to-play poster

   Supports:
   - YouTube     ("https://youtu.be/abc"  or  "https://youtube.com/watch?v=abc")
   - Loom        ("https://loom.com/share/abc")
   - Direct MP4  ("https://cdn.example.com/file.mp4")

   Features:
   - 16:9 responsive container
   - Custom dark poster frame with title + duration
   - Click-to-play (lazy iframe load — no autoplay tracking until clicked)
   - Animated play button with pulsing glow
   - Optional caption below
════════════════════════════════════════════════════════════════════════ */

interface Props {
  src:        string;       // Full URL — YouTube / Loom / MP4
  title?:     string;       // Shown on poster
  duration?:  string;       // e.g. "12:34" — shown on poster
  poster?:    string;       // Optional poster image URL (otherwise auto-fetched for YouTube)
  caption?:   string;       // Optional caption shown below the player
  accent?:    string;       // Accent colour for play button (default indigo)
}

function detectSource(src: string): { kind: "youtube" | "loom" | "mp4" | "unknown"; embedUrl: string; thumbUrl?: string } {
  // YouTube
  const ytId =
    src.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)?.[1] ??
    src.match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] ??
    src.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)?.[1];
  if (ytId) {
    return {
      kind: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`,
      thumbUrl: `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
    };
  }

  // Loom
  const loomId = src.match(/loom\.com\/share\/([a-z0-9]+)/i)?.[1];
  if (loomId) {
    return {
      kind: "loom",
      embedUrl: `https://www.loom.com/embed/${loomId}?autoplay=1&hide_owner=true&hide_share=true&hide_title=true`,
    };
  }

  // Direct MP4
  if (/\.mp4($|\?)/i.test(src)) {
    return { kind: "mp4", embedUrl: src };
  }

  return { kind: "unknown", embedUrl: src };
}

export default function VideoEmbed({ src, title, duration, poster, caption, accent = "#6366f1" }: Props) {
  const [playing, setPlaying] = useState(false);
  const meta = detectSource(src);
  const posterUrl = poster ?? meta.thumbUrl;

  return (
    <figure style={{ margin: "32px 0", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{
        position: "relative" as const,
        width: "100%",
        aspectRatio: "16 / 9",
        background: "#06060d",
        border: "1px solid rgba(99,102,241,0.18)",
        borderRadius: 16,
        overflow: "hidden" as const,
        boxShadow: "0 12px 48px -16px rgba(0,0,0,0.6)",
      }}>
        {playing ? (
          meta.kind === "mp4" ? (
            <video
              src={meta.embedUrl}
              controls
              autoPlay
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          ) : (
            <iframe
              src={meta.embedUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
              title={title ?? "Video player"}
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${title ?? "video"}`}
            style={{
              position: "absolute" as const,
              inset: 0,
              width: "100%", height: "100%",
              border: 0, padding: 0, margin: 0, cursor: "pointer",
              background: posterUrl
                ? `linear-gradient(180deg, rgba(6,6,13,0.30) 0%, rgba(6,6,13,0.85) 100%), url(${posterUrl}) center/cover no-repeat`
                : `radial-gradient(circle at 30% 20%, rgba(99,102,241,0.18) 0%, transparent 50%),
                   radial-gradient(circle at 70% 80%, rgba(236,72,153,0.14) 0%, transparent 50%),
                   #06060d`,
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            {/* Decorative grid for non-poster fallback */}
            {!posterUrl && (
              <div style={{
                position: "absolute" as const, inset: 0,
                backgroundImage:
                  "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
                maskImage: "radial-gradient(ellipse 60% 80% at 50% 50%, black 0%, transparent 75%)",
                WebkitMaskImage: "radial-gradient(ellipse 60% 80% at 50% 50%, black 0%, transparent 75%)",
                pointerEvents: "none" as const,
              }} />
            )}

            {/* Play button with pulsing halo */}
            <div style={{ position: "relative" as const, zIndex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 18 }}>
              <div style={{ position: "relative" as const, width: 78, height: 78 }}>
                <span style={{
                  position: "absolute" as const, inset: 0, borderRadius: "50%",
                  background: accent, opacity: 0.35,
                  animation: "videoPulse 2s ease-in-out infinite",
                }} />
                <span style={{
                  position: "absolute" as const, inset: 0, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${accent}, #ec4899)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 12px 48px -8px ${accent}80`,
                }}>
                  <span style={{ fontSize: 28, color: "#fff", marginLeft: 4, lineHeight: 1 }}>▶</span>
                </span>
              </div>

              {(title || duration) && (
                <div style={{ textAlign: "center" as const, maxWidth: "75%" }}>
                  {title && (
                    <div style={{
                      fontFamily: "'Bungee', cursive",
                      fontSize: "clamp(16px, 2.2vw, 24px)",
                      color: "#fff",
                      lineHeight: 1.2,
                      marginBottom: 6,
                      textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                    }}>
                      {title}
                    </div>
                  )}
                  {duration && (
                    <div style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.7)",
                      letterSpacing: 1.2,
                    }}>
                      {duration} · CLICK TO PLAY
                    </div>
                  )}
                </div>
              )}
            </div>
          </button>
        )}
      </div>

      {caption && (
        <figcaption style={{
          marginTop: 12,
          fontSize: 13,
          color: "#94a3b8",
          textAlign: "center" as const,
          fontStyle: "italic" as const,
          lineHeight: 1.5,
        }}>
          {caption}
        </figcaption>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes videoPulse {
          0%, 100% { transform: scale(1);   opacity: 0.4; }
          50%      { transform: scale(1.4); opacity: 0;   }
        }
      ` }} />
    </figure>
  );
}
