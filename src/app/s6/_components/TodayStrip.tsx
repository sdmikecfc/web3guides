"use client";
/**
 * TODAY ON THE FRONT (CRO rebuild 2026-08-17): the one-glance "why today
 * matters" band, mounted directly under the Battlefield and above the
 * onboarding strip. Three cells, stacking on mobile:
 *
 *   1. TODAY'S GAUNTLET: the day's rotating game (key/name/href arrive as
 *      props from page.tsx, which already owns the UTC-day rotation), with
 *      the honest hook: the first scored run pays Signal today.
 *   2. The RaidStrip, mounted INSIDE this band. It was built and never
 *      mounted on /s6; it handles its own empty/live states and renders
 *      nothing until /api/s6/raid answers (the :empty CSS collapses the cell).
 *   3. SETTLEMENT COUNTDOWN from the season window's endAt. null endAt
 *      (pre-arming) hides the cell; so does a past endAt. Computed on the
 *      client only, so SSR/hydration can never disagree across an hour tick.
 *
 * No feed teaser here on purpose: the full UPLINK FEED is right above in the
 * Battlefield.
 *
 * Copy: staged in ./stripStrings pending the strings.ts locale pass.
 * Copy laws: never "win $X"; no em-dashes.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

import { clientLocale } from "@/lib/s6/locale";
import { fill , STRINGS, type S6Dict } from "@/lib/s6/strings";
import { track } from "@/lib/s6/track";
import { RaidStrip } from "./RaidStrip";

interface Props {
  gameKey: string;
  gameName: string;
  playHref: string;
  /** ISO timestamp from the s6_season config row; null until the season is armed. */
  endAt: string | null;
}

export function TodayStrip({ gameKey, gameName, playHref, endAt }: Props) {
  // Localized via the RaidStrip clientLocale pattern; en is the SSR default.
  const [dict, setDict] = useState<S6Dict>(STRINGS.en);
  useEffect(() => {
    const loc = clientLocale();
    if (loc !== "en") setDict(STRINGS[loc]);
  }, []);
  const d = dict.today;

  // Client-only countdown (day/hour granularity, re-checked each minute).
  // Starts null so the SSR pass and the first client paint agree.
  const [left, setLeft] = useState<{ d: number; h: number; m: number } | null>(null);
  useEffect(() => {
    if (!endAt) return;
    const compute = () => {
      const ms = Date.parse(endAt) - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) {
        setLeft(null);
        return;
      }
      setLeft({
        d: Math.floor(ms / 86400000),
        h: Math.floor((ms % 86400000) / 3600000),
        m: Math.floor((ms % 3600000) / 60000),
      });
    };
    compute();
    const t = setInterval(compute, 30000); // 30s: the last hour reads live
    return () => clearInterval(t);
  }, [endAt]);

  return (
    <section className="s6td" aria-label={d.aria} data-testid="today-strip">
      <div className="s6td-row">
        <Link
          href={playHref}
          className="s6td-gauntlet"
          data-testid="today-gauntlet"
          onClick={() => track("cta_click", { ref: "today-gauntlet", game: gameKey })}
        >
          <span className="s6td-tag">{d.gauntletTag}</span>
          <b className="s6td-game">{gameName}</b>
          <span className="s6td-line">{d.gauntletLine}</span>
          <span className="s6td-cta">{d.gauntletCta}</span>
        </Link>
        <div className="s6td-raid">
          <RaidStrip />
        </div>
        {left ? (
          <div className="s6td-settle" data-testid="settle-countdown">
            <span className="s6td-tag">{d.settleTag}</span>
            <b className="s6td-count">{fill(d.settleLine, { d: left.d, h: left.h, m: left.m })}</b>
          </div>
        ) : null}
        {/* THE SOCIAL DOOR (Mike, 2026-08-17: "is that setup? Will there be
            something in-game or on the site to make this obvious to web
            players?"). The paid-post loop, raids and drops all live in
            Discord, and until this cell the site never said where Discord
            WAS - a web-first player could not find the community at all. */}
        <a
          className="s6td-discord"
          href="https://discord.gg/doma"
          target="_blank"
          rel="noreferrer"
          onClick={() => track("cta_click", { ref: "today-discord" })}
        >
          <span className="s6td-tag">{d.discordTag}</span>
          <span className="s6td-line">{d.discordLine}</span>
          <span className="s6td-cta">{d.discordCta}</span>
        </a>
      </div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </section>
  );
}

/* Second pass 2026-08-17: the shared page rhythm - 1120 column (20px gutters),
 * 30px to the section above, 16px cell gap, 18px card padding, cards
 * translucent over the page backdrop with a border warm-up + lift on hover. */
const CSS = `
.s6td{max-width:1160px;margin:0 auto;padding:30px 20px 0;}
.s6td-row{display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;}
.s6td-gauntlet{flex:1 1 240px;display:flex;flex-direction:column;gap:6px;padding:18px 20px;
  background:linear-gradient(180deg,rgba(28,21,14,.9),rgba(18,21,29,.85));border:1px solid #e0662e;border-radius:14px;
  color:inherit;text-decoration:none;
  transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;}
.s6td-gauntlet:hover{border-color:#f0b340;transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.4);}
.s6td-raid{flex:2 1 340px;display:flex;align-items:center;min-width:0;
  border-radius:14px;overflow:hidden;}
.s6td-raid>div{width:100%;}
.s6td-raid:empty{display:none;}
.s6td-discord{flex:1 1 220px;display:flex;flex-direction:column;gap:6px;justify-content:center;padding:18px 20px;
  background:rgba(18,22,27,.72);border:1px solid #232a32;border-radius:14px;color:inherit;text-decoration:none;
  transition:transform .15s ease,border-color .15s ease;}
.s6td-discord:hover{border-color:#5865f2;transform:translateY(-2px);}
.s6td-settle{flex:0 1 230px;display:flex;flex-direction:column;gap:6px;justify-content:center;
  padding:18px 20px;background:rgba(18,21,29,.85);border:1px solid #242c3e;border-radius:14px;
  transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;}
.s6td-settle:hover{border-color:#3a4560;transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.35);}
.s6td-tag{font-size:11px;font-weight:800;letter-spacing:.22em;color:#8a93a2;text-transform:uppercase;}
.s6td-game{font-size:20px;color:#f0f0eb;}
.s6td-line{font-size:12.5px;line-height:1.5;color:#aab3c0;}
.s6td-cta{margin-top:auto;align-self:flex-start;background:#e0662e;color:#0b0d10;font-weight:800;
  font-size:12.5px;letter-spacing:.06em;border-radius:8px;padding:7px 13px;}
.s6td-count{font-size:20px;color:#f0b340;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;}
@media (max-width:760px){.s6td-row{flex-direction:column;}.s6td{padding:24px 16px 0;}}
`;
