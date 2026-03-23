"use client";

import Link from "next/link";
import type { Guide, SubdomainConfig } from "@/types";
import { formatDate, truncate } from "@/lib/utils";
import DifficultyBadge from "./DifficultyBadge";

interface Props {
  guide: Guide;
  config: SubdomainConfig;
  index?: number;
}

function isNew(publishedAt: string): boolean {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  return new Date(publishedAt) > twoWeeksAgo;
}

export default function GuideCard({ guide, config, index = 0 }: Props) {
  const articleIsNew = isNew(guide.published_at);

  return (
    <article
      className="lp-sub-card animate-fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animationDelay: `${Math.min(index * 55, 450)}ms`,
        position: "relative",
        cursor: "pointer",
      }}
    >
      {/* Full-card click overlay — sits above everything, z-index 0 */}
      <Link
        href={`/guides/${guide.slug}`}
        aria-label={guide.title}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          borderRadius: "inherit",
        }}
      />

      {/* ── Banner: subdomain gradient + article title ── */}
      <div style={{
        width: "100%",
        height: 160,
        flexShrink: 0,
        background: `linear-gradient(135deg, ${config.gradientFrom ?? "#0d1117"} 0%, ${config.gradientTo ?? "#0a0a0f"} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "18px 22px",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Glow blob */}
        <div style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 140, height: 140,
          background: config.accentHex,
          opacity: 0.12,
          borderRadius: "50%",
          filter: "blur(32px)",
          pointerEvents: "none",
        }} />
        {/* Subdomain label */}
        <span style={{
          position: "absolute",
          top: 12, left: 14,
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.6rem",
          fontWeight: 700,
          color: config.accentHex,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          opacity: 0.85,
        }}>
          {config.label}
        </span>
        {/* Article title */}
        <p style={{
          fontFamily: "'Bungee', cursive, system-ui",
          fontWeight: 400,
          fontSize: "0.88rem",
          color: "#fff",
          lineHeight: 1.4,
          textAlign: "center",
          margin: 0,
          position: "relative",
          zIndex: 1,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical" as "vertical",
          overflow: "hidden",
          textShadow: "0 2px 10px rgba(0,0,0,0.5)",
        }}>
          {guide.title}
        </p>
      </div>

      {/* ── Card body ── */}
      <div style={{ padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" as const }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DifficultyBadge difficulty={guide.difficulty} />
            {articleIsNew && (
              <span className="badge-new">✨ NEW</span>
            )}
          </div>
          <time dateTime={guide.published_at} style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af" }}>
            {formatDate(guide.published_at)}
          </time>
        </div>

        {/* Title (display only — click handled by overlay) */}
        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", lineHeight: 1.4, color: "#1a1a1a", marginBottom: 10 }}>
          {guide.title}
        </h2>

        {/* Summary */}
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", color: "#6b7280", lineHeight: 1.6, marginBottom: 16, flex: 1 }}>
          {truncate(guide.summary, 150)}
        </p>

        {/* Tags */}
        {guide.tags && guide.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 16, position: "relative", zIndex: 2 }}>
            {guide.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", background: `${config.accentHex}12`, color: config.accentHex, border: `1px solid ${config.accentHex}30`, borderRadius: 50, padding: "2px 8px" }}>
                #{tag}
              </span>
            ))}
            {guide.tags.length > 4 && (
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "#9ca3af" }}>+{guide.tags.length - 4}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #f3f4f6", paddingTop: 14, marginTop: "auto" }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af" }}>
            {guide.read_time_minutes ? `${guide.read_time_minutes} min read` : "Guide"}
          </span>
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: config.accentHex,
              background: `${config.accentHex}12`,
              border: `1px solid ${config.accentHex}30`,
              borderRadius: 8,
              padding: "5px 14px",
            }}
          >
            Read →
          </span>
        </div>
      </div>
    </article>
  );
}
