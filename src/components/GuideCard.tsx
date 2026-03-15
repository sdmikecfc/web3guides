"use client";

import Link from "next/link";
import type { Guide, SubdomainConfig } from "@/types";
import { formatDate, truncate } from "@/lib/utils";
import DifficultyBadge from "./DifficultyBadge";

interface Props {
  guide: Guide;
  config: SubdomainConfig;
  /** Staggered animation index */
  index?: number;
}

export default function GuideCard({ guide, config, index = 0 }: Props) {
  const delay = Math.min(index * 50, 400); // cap at 400ms

  return (
    <article
      className="card-hover group flex flex-col rounded-2xl border border-[#1e1e2e] bg-[#12121a] overflow-hidden animate-fade-up"
      style={
        {
          animationDelay: `${delay}ms`,
          "--subdomain-accent": config.accentHex,
          "--subdomain-glow": config.glowHex,
        } as React.CSSProperties
      }
    >
      {/* Top accent bar */}
      <div
        className="h-0.5 w-full shrink-0"
        style={{
          background: `linear-gradient(to right, ${config.accentHex}, transparent)`,
          opacity: 0.5,
        }}
      />

      <div className="flex flex-1 flex-col p-5">
        {/* Meta row */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <DifficultyBadge difficulty={guide.difficulty} />
          <time
            dateTime={guide.published_at}
            className="shrink-0 font-mono text-[11px] text-[#6b6b8a]"
          >
            {formatDate(guide.published_at)}
          </time>
        </div>

        {/* Title */}
        <h2 className="mb-2 font-display text-base font-bold leading-snug text-white group-hover:text-[var(--subdomain-accent)] transition-colors line-clamp-2">
          <Link href={`/guides/${guide.slug}`} className="focus:outline-none">
            <span className="absolute inset-0" aria-hidden="true" />
            {guide.title}
          </Link>
        </h2>

        {/* Summary */}
        <p className="mb-4 flex-1 text-sm leading-relaxed text-[#6b6b8a] line-clamp-3">
          {truncate(guide.summary, 160)}
        </p>

        {/* Tags */}
        {guide.tags && guide.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {guide.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="tag-pill">
                {tag}
              </span>
            ))}
            {guide.tags.length > 4 && (
              <span className="tag-pill text-[#6b6b8a]">
                +{guide.tags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#1e1e2e] pt-3 mt-auto">
          {/* Read time */}
          <span className="font-mono text-[11px] text-[#6b6b8a]">
            {guide.read_time_minutes
              ? `${guide.read_time_minutes} min read`
              : "Guide"}
          </span>

          {/* Source link */}
          <a
            href={guide.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-xs font-medium transition"
            style={{
              color: config.accentHex,
              background: config.glowHex,
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
