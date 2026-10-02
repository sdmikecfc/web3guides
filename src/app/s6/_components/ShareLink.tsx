"use client";
/**
 * SHARE THIS PAGE - the copy-link affordance the boards never had.
 *
 * Mike, 2026-08-15: "I want the leaderboard, that you can click on. The cards
 * that are shareable." The share CARD already existed (every S6 page renders an
 * OpenGraph image, so a pasted link unfurls), but nothing on screen ever told
 * you that or handed you the link - you had to know to copy the address bar.
 * This is that button, and it is deliberately generic so any surface can wear
 * one.
 *
 * The URL is read from the browser rather than passed in, so it is always the
 * page you are actually looking at, including its locale and query. The prompt
 * fallback matters: navigator.clipboard is absent on http:// origins and older
 * browsers, and a share button that silently does nothing is worse than none
 * (the garage copy button learned this first).
 */
import { useCallback, useEffect, useState } from "react";

export function ShareLink({
  label = "Share",
  copiedLabel = "Link copied",
  /** Optional absolute URL; defaults to the page you are on. */
  url,
  accent = "#f0b340",
}: {
  label?: string;
  copiedLabel?: string;
  url?: string;
  accent?: string;
}) {
  const [href, setHref] = useState(url ?? "");
  const [copied, setCopied] = useState(false);

  // SSR has no location, so resolve on mount; an explicit url always wins.
  useEffect(() => {
    if (!url && typeof window !== "undefined") setHref(window.location.href);
  }, [url]);

  const copy = useCallback(() => {
    const target = href || (typeof window !== "undefined" ? window.location.href : "");
    if (!target) return;
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(target).then(done).catch(() => window.prompt("Copy this link", target));
    } else {
      window.prompt("Copy this link", target);
    }
  }, [href]);

  return (
    <button
      type="button"
      onClick={copy}
      data-testid="share-link"
      aria-live="polite"
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: copied ? "#0b0d10" : accent,
        background: copied ? accent : "rgba(16,19,27,0.9)",
        border: `1px solid ${accent}66`,
        borderRadius: 8,
        padding: "7px 12px",
        cursor: "pointer",
        minHeight: 34,
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
