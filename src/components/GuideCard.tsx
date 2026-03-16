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

export default function GuideCard({ guide, config, index = 0 }: Props) {
  const delay = Math.min(index * 55, 450);

  return (
    <article
      className="card-hover group relative flex flex-col rounded-2xl glass overflow-hidden animate-fade-up"
      style={{
        animationDelay: `${delay}ms`,
        "--subdomain-accent": config.accentHex,
        "--subdomain-glow":   config.glowHex,
      } as React.CSSProperties}
    >
      {/* Top accent bar — glows on hover */}
      <div
        className="h-[2px] w-full shrink-0 transition-opacity duration-300"
        style={{
          background: `linear-gradient(to right, ${config.accentHex}, ${config.accentHex}30, transparent)`,
        }}
      />

      {/* Corner glow on hover */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 0% 0%, ${config.glowHex}, transparent)`,
        }}
      />

      <div className="relative flex flex-1 flex-col p-5">
        {/* Meta row */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <DifficultyBadge difficulty={guide.difficulty} />
          <time
            dateTime={guide.published_at}
            className="shrink-0 font-mono text-[11px]"
            style={{ color: "var(--color-muted,#6272a0)" }}
          >
            {formatDate(guide.published_at)}
          </time>
        </div>

        {/* Title — links to guide detail */}
        <h2 className="mb-2 font-display text-[15px] font-bold leading-snug text-white line-clamp-2 transition-colors duration-200 group-hover:text-[var(--subdomain-accent)]">
          <Link href={`/guides/${guide.slug}`} className="focus:outline-none">
            <span className="absolute inset-0" aria-hidden="true" />
            {guide.title}
          </Link>
        </h2>

        {/* Summary */}
        <p
          className="mb-4 flex-1 text-sm leading-relaxed line-clamp-3"
          style={{ color: "var(--color-muted,#6272a0)" }}
        >
          {truncate(guide.summary, 160)}
        </p>

        {/* Tags */}
        {guide.tags && guide.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {guide.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="tag-pill">#{tag}</span>
            ))}
            {guide.tags.length > 4 && (
              <span className="tag-pill">+{guide.tags.length - 4}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t pt-3 mt-auto"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <span className="font-mono text-[11px]" style={{ color: "var(--color-muted,#6272a0)" }}>
            {guide.read_time_minutes ? `${guide.read_time_minutes} min read` : "Guide"}
          </span>

          <a
            href={guide.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 flex items-center gap-1 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-all duration-200 hover:brightness-110 active:scale-95"
            style={{
              color:   config.accentHex,
              background: config.glowHex,
              border: `1px solid ${config.accentHex}30`,
            }}
            aria-label={`Read "${guide.title}" at source`}
          >
            Read ↗
          </a>
        </div>
      </div>
    </article>
  );
}
