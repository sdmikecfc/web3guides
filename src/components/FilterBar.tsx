"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Difficulty } from "@/types";

const DIFFICULTIES: { value: Difficulty | "all"; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

interface Props {
  currentDifficulty?: string;
  currentTag?: string;
}

export default function FilterBar({ currentDifficulty, currentTag }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      params.delete("page"); // reset to page 1 on filter change
      return params.toString();
    },
    [searchParams]
  );

  function handleDifficulty(value: Difficulty | "all") {
    const qs = createQueryString({ difficulty: value });
    router.push(`?${qs}`, { scroll: false });
  }

  function clearTag() {
    const qs = createQueryString({ tag: null });
    router.push(`?${qs}`, { scroll: false });
  }

  const hasActiveFilters = !!currentDifficulty || !!currentTag;

  return (
    <div className="mb-7 flex flex-wrap items-center gap-2">
      {/* Difficulty pills */}
      {DIFFICULTIES.map(({ value, label }) => {
        const active =
          value === "all" ? !currentDifficulty : currentDifficulty === value;
        return (
          <button
            key={value}
            onClick={() => handleDifficulty(value)}
            className={`rounded-full border px-3 py-1 font-mono text-xs transition ${
              active
                ? "border-[var(--subdomain-accent)] bg-[var(--subdomain-accent)] text-white font-semibold"
                : "border-[#1e1e2e] bg-[#12121a] text-[#6b6b8a] hover:border-[var(--subdomain-accent)] hover:text-[var(--subdomain-accent)]"
            }`}
          >
            {label}
          </button>
        );
      })}

      {/* Active tag chip */}
      {currentTag && (
        <button
          onClick={clearTag}
          className="flex items-center gap-1.5 rounded-full border border-[var(--subdomain-accent)] bg-[var(--subdomain-glow)] px-3 py-1 font-mono text-xs text-[var(--subdomain-accent)] transition hover:bg-opacity-80"
        >
          # {currentTag}
          <span className="text-[10px] opacity-70">✕</span>
        </button>
      )}

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          onClick={() => router.push("?", { scroll: false })}
          className="ml-auto font-mono text-xs text-[#6b6b8a] underline underline-offset-2 transition hover:text-[#e2e2f0]"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
