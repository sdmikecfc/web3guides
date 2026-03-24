"use client";

import Link from "next/link";
import { useState } from "react";
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

function extractFirstImage(content?: string | null): string | null {
  if (!content) return null;
  const m = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return m ? m[1] : null;
}

// Build a storage thumbnail URL from the known pattern, with cover_image or
// content-extracted image as higher-priority fallbacks.
function buildThumbnailUrl(guide: Guide): string | null {
  if (guide.cover_image) return guide.cover_image;
  const fromContent = extractFirstImage(guide.content);
  if (fromContent) return fromContent;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/guide-images/${guide.subdomain}/${guide.slug}/1.png`;
}

export default function GuideCard({ guide, config, index = 0 }: Props) {
  const articleIsNew = isNew(guide.published_at);
  const ogFallback = `/api/og?sub=${encodeURIComponent(guide.subdomain)}&t=${encodeURIComponent(guide.title)}`;
  const candidateUrl = buildThumbnailUrl(guide);
  const [src, setSrc] = useState(candidateUrl ?? ogFallback);

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
      {/* Full-card click overlay */}
      <Link
        href={`/guides/${guide.slug}`}
        aria-label={guide.title}
        style={{ position: "absolute", inset: 0, zIndex: 1, borderRadius: "inherit" }}
      />

      {/* ── Banner ── */}
      <div style={{
        width: "100%",
        height: 180,
        flexShrink: 0,
        background: "#0d0d1f",
        position: "relative",
        overflow: "hidden",
      }}>
        <img
          src={src}
          alt=""
          onError={() => { if (src !== ogFallback) setSrc(ogFallback); }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
          }}
        />
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

        {/* Title */}
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
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "0.8rem",
            fontWeight: 700,
            color: config.accentHex,
            background: `${config.accentHex}12`,
            border: `1px solid ${config.accentHex}30`,
            borderRadius: 8,
            padding: "5px 14px",
          }}>
            Read →
          </span>
        </div>
      </div>
    </article>
  );
}
