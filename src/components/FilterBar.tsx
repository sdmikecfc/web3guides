"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Difficulty } from "@/types";

const DIFFICULTIES: { value: Difficulty | "all"; label: string }[] = [
  { value: "all",          label: "All levels" },
  { value: "beginner",     label: "Easy" },
  { value: "intermediate", label: "Medium" },
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
    <div style={{ marginBottom: 28, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {DIFFICULTIES.map(({ value, label }) => {
        const active = value === "all" ? !currentDifficulty : currentDifficulty === value;
        return (
          <button
            key={value}
            onClick={() => handleDifficulty(value)}
            style={
              active
                ? { borderRadius: 50, padding: "6px 16px", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", fontWeight: 700, color: "#fff", background: "var(--subdomain-accent)", border: "none", cursor: "pointer" }
                : { borderRadius: 50, padding: "6px 16px", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", cursor: "pointer" }
            }
          >
            {label}
          </button>
        );
      })}

      {currentTag && (
        <button
          onClick={clearTag}
          style={{
            display: "flex", alignItems: "center", gap: 6, borderRadius: 50, padding: "6px 16px",
            fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", fontWeight: 700,
            color: "var(--subdomain-accent)",
            background: "color-mix(in srgb, var(--subdomain-accent) 12%, transparent)",
            border: "1px solid var(--subdomain-accent)",
            cursor: "pointer",
          }}
        >
          #{currentTag} <span style={{ fontSize: "0.6rem", opacity: 0.6 }}>✕</span>
        </button>
      )}

      {hasFilters && (
        <button
          onClick={() => router.push("?", { scroll: false })}
          style={{ marginLeft: "auto", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af", background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
