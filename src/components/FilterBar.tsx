"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Difficulty } from "@/types";

const DIFFICULTIES: { value: Difficulty | "all"; label: string }[] = [
  { value: "all",          label: "All levels" },
  { value: "beginner",     label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced" },
];

interface Props { currentDifficulty?: string; currentTag?: string; }

export default function FilterBar({ currentDifficulty, currentTag }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const createQS = useCallback(
    (updates: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (!v || v === "all") p.delete(k); else p.set(k, v);
      });
      p.delete("page");
      return p.toString();
    },
    [searchParams]
  );

  function handleDifficulty(value: Difficulty | "all") {
    router.push(`?${createQS({ difficulty: value })}`, { scroll: false });
  }
  function clearTag() {
    router.push(`?${createQS({ tag: null })}`, { scroll: false });
  }

  const hasFilters = !!currentDifficulty || !!currentTag;

  return (
    <div className="mb-7 flex flex-wrap items-center gap-2">
      {DIFFICULTIES.map(({ value, label }) => {
        const active = value === "all" ? !currentDifficulty : currentDifficulty === value;
        return (
          <button
            key={value}
            onClick={() => handleDifficulty(value)}
            className={`rounded-full px-3.5 py-1.5 font-mono text-xs transition-all duration-200 ${
              active ? "font-semibold text-white" : "hover:text-white"
            }`}
            style={
              active
                ? { background: "var(--subdomain-accent)", boxShadow: "0 0 20px var(--subdomain-glow)" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-muted,#6272a0)" }
            }
          >
            {label}
          </button>
        );
      })}

      {currentTag && (
        <button
          onClick={clearTag}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-xs font-medium transition-all"
          style={{
            color: "var(--subdomain-accent)",
            background: "var(--subdomain-glow)",
            border: "1px solid var(--subdomain-accent)",
          }}
        >
          #{currentTag} <span className="text-[10px] opacity-60">✕</span>
        </button>
      )}

      {hasFilters && (
        <button
          onClick={() => router.push("?", { scroll: false })}
          className="ml-auto font-mono text-xs underline underline-offset-2 transition-colors hover:text-white"
          style={{ color: "var(--color-muted,#6272a0)" }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
