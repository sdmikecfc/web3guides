"use client";
/**
 * S7 RAID ODDS STRIP: the shill layer. One line of truth from /api/s7/raid
 * (which boss rolls at 14:00 UTC, how many adventurers are on the roster, the
 * ESTIMATED odds) plus the CALL FOR REINFORCEMENTS tweet-intent button. An
 * empty roster adds the enlist CTA instead of hiding.
 *
 * The strip line comes from the s7 dict (en/ko/zh, cookie locale); the tweet
 * body + intent URL stay in lib/s7/raid.ts and stay ENGLISH on purpose (a
 * public X broadcast to the global community). Renders nothing until the
 * feed answers (and nothing at all if it never does): the strip must never
 * block or break a page. No money data, no em-dashes, never "win $X".
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { tweetIntentUrl, resultIntentUrl, type RaidBoss } from "@/lib/s7/raid";
import { STRINGS, fill, type S7Dict } from "@/lib/s7/strings";
import { clientLocale } from "@/lib/s7/locale";
import { track } from "@/lib/s7/track";

const STEEL = "#9aa7b4";
const EMBER = "#e0662e";
const TEXT = "#e9edf1";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type RaidFeed = {
  ok?: boolean;
  count?: number;
  boss?: { key?: string; name?: string; difficulty?: number };
  oddsPct?: number;
  /** The latest RESOLVED raid (fresh only): the triumph/loss share layer. */
  last?: { name?: string; won?: boolean; dayKey?: string } | null;
};

export function RaidStrip() {
  const [feed, setFeed] = useState<RaidFeed | null>(null);
  const [dict, setDict] = useState<S7Dict>(STRINGS.en);

  useEffect(() => {
    const loc = clientLocale();
    if (loc !== "en") setDict(STRINGS[loc]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/s7/raid")
      .then((r) => (r.ok ? (r.json() as Promise<RaidFeed>) : null))
      .then((j) => {
        if (!cancelled && j?.ok && j.boss && typeof j.boss.name === "string") setFeed(j);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!feed || !feed.boss) return null;

  const boss: RaidBoss = {
    key: String(feed.boss.key || "boss"),
    name: String(feed.boss.name || ""),
    difficulty: Number(feed.boss.difficulty) || 1,
  };
  const count = Math.max(0, Math.floor(Number(feed.count) || 0));
  const odds = Math.max(0, Math.min(99, Math.round(Number(feed.oddsPct) || 0)));
  // Growth plan B10: yesterday's result rides the strip while fresh. The LOSS
  // share is the built-in call to arms (ADR-0068's loss-card idea): a defeat
  // is the moment the roster most wants reinforcements.
  const last = feed.last && typeof feed.last.name === "string" && feed.last.name ? feed.last : null;

  return (
    <div
      data-testid="raid-strip"
      style={{
        width: "100%",
        borderTop: `1px solid ${EMBER}44`,
        borderBottom: `1px solid ${EMBER}44`,
        background: `linear-gradient(90deg, ${EMBER}14 0%, rgba(18,22,27,0.9) 45%, ${EMBER}0d 100%)`,
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          padding: "10px 16px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px 14px",
        }}
      >
        <span
          data-testid="raid-strip-line"
          style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, lineHeight: 1.5, textAlign: "center" }}
        >
          {/* With an empty roster the odds number is noise (and reads as a dead
              game to a first-time visitor), so the zero state invites instead. */}
          {last ? (
            <>
              <span data-testid="raid-result-line" style={{ color: last.won ? "#8fd18f" : "#e58b8b" }}>
                {fill(last.won ? dict.raid.resultWon : dict.raid.resultLost, { boss: String(last.name) })}
              </span>{" "}
              <a
                data-testid="raid-result-share"
                href={resultIntentUrl(String(last.name), !!last.won)}
                target="_blank"
                rel="noreferrer"
                onClick={() => track("cta_click", { ref: last.won ? "raid-share-win" : "raid-share-loss" })}
                style={{ color: TEXT, textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 800 }}
              >
                {dict.raid.shareResult}
              </a>
              {" · "}
            </>
          ) : null}
          {fill(count === 0 ? dict.raid.lineZero : count === 1 ? dict.raid.lineOne : dict.raid.lineMany, {
            boss: boss.name,
            count,
            odds,
          })}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <a
            data-testid="raid-reinforce"
            href={tweetIntentUrl(boss, count, odds)}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("cta_click", { ref: "raid-reinforce" })}
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: TEXT,
              border: `1px solid ${EMBER}88`,
              background: `${EMBER}26`,
              borderRadius: 999,
              padding: "6px 14px",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {dict.raid.reinforce}
          </a>
          {count === 0 ? (
            <Link
              data-testid="raid-join-cta"
              href="/s7/join"
              onClick={() => track("cta_click", { ref: "raid-join" })}
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: TEXT,
                border: `1px solid ${STEEL}66`,
                background: `${STEEL}1f`,
                borderRadius: 999,
                padding: "6px 14px",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {dict.raid.enlistFree}
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
