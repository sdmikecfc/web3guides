"use client";
/**
 * FIELD REPORT, the HQ stats board (Mike, 2026-07-22): a dossier-style panel on
 * the home base showing the current tank + its ratings, the five upgrade
 * levels, and the payout projection, with a WARNING strip whenever pool money
 * is riding on strongholds the player holds that have NOT breached.
 *
 * Money honesty rules: the number is labelled an estimate, the disclaimer
 * quotes the only-breached-pay line, and nothing here says "win $X". Styling
 * lives in HQ_CSS (HqScene.tsx) under .s5fr-*: military stencil header, steel
 * plate, pips over prose so it reads at a glance in en/ko/zh.
 */
import Link from "next/link";
import { fill, type S6Dict } from "@/lib/s6/strings";
import { tankByKey, type Tank } from "@/lib/s6/tanks";
import type { ResolvedTank } from "@/lib/s6/model";

export type StatsView = { armor: number; engine: number; smoke: number; caliber: number; optics: number };
/** One of the commander's own War Effort commitments (Shells, never dollars). */
export type WarEffortView = {
  domain: string;
  name: string;
  shells: number;
  status: "committed" | "won" | "lost";
};
export type PayoutBoardView = {
  estNowUsd: number;
  lockedUsd: number;
  lockedCount: number;
  lockedNames: string[];
  share: number;
};

const usd = (n: number) =>
  n >= 100 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`;

/** `max` comes from the stat's real cap, not a hardcoded 5. Four of the five
 *  stats cap at 4, so a fixed five-pip row left a pip that could never light --
 *  which reads as "not finished yet" to a player who is. */
function Pips({ level, label, icon, max = 4 }: { level: number; label: string; icon: string; max?: number }) {
  const pips = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="s5fr-stat" role="img" aria-label={`${label}: ${level} of ${max}`}>
      <span className="s5fr-stat-ico" aria-hidden>{icon}</span>
      <span className="s5fr-stat-name">{label}</span>
      <span className="s5fr-pips" aria-hidden>
        {pips.map((i) => (
          <span key={i} className={`s5fr-pip${i <= level ? " s5fr-pip--on" : ""}`} />
        ))}
      </span>
    </div>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="s5fr-rating" role="img" aria-label={`${label}: ${value} of 10`}>
      <span className="s5fr-rating-name">{label}</span>
      <span className="s5fr-rating-track" aria-hidden>
        <span className="s5fr-rating-fill" style={{ width: `${Math.max(4, value * 10)}%` }} />
      </span>
      <span className="s5fr-rating-num" aria-hidden>{value}</span>
    </div>
  );
}

export function StatsBoard({
  dict,
  session,
  tank,
  stats,
  payout,
  points,
  shells,
  streakDays,
  sprintNames = "",
  warEffort = [],
  enlistedBy = null,
}: {
  dict: S6Dict;
  session: boolean;
  tank: ResolvedTank;
  stats: StatsView | null;
  payout: PayoutBoardView | null;
  points: number;
  shells: number;
  streakDays: number;
  /** THE FRONT REACTS: the stronghold(s) under siege sprint, already joined
   * for display. Empty string = no sprint, and the strip does not render. */
  sprintNames?: string;
  /** THE WAR EFFORT: this commander's OWN Shells commitments. Play currency
   * only, so it never appears near the payout column and never carries a
   * dollar figure. Empty = the strip does not render. */
  warEffort?: WarEffortView[];
  /** Brothers in Arms (ADR-0068 §3): the recruiter's NAME, permanent on this
   * HQ. Null = never referred, and the line does not render. */
  enlistedBy?: string | null;
}) {
  const t = dict.statsBoard;
  const spec: Tank | null = tankByKey(tank.tankKey);
  const s: StatsView = stats || { armor: 0, engine: 0, smoke: 0, caliber: 0, optics: 0 };
  const locked = session && payout !== null && payout.lockedUsd > 0.005;

  return (
    <section className="s5fr" aria-label={t.title}>
      <header className="s5fr-head">
        <span className="s5fr-title">{t.title}</span>
        <span className="s5fr-counters">
          <span title={t.medals}>🎖 {points.toLocaleString("en-US")}</span>
          <span title={t.shells}>🐚 {shells.toLocaleString("en-US")}</span>
          {streakDays > 0 ? <span title={t.streak}>🔥 {streakDays}</span> : null}
        </span>
      </header>
      {/* Brothers in Arms: the permanent enlistment credit (reuses the tankname
          type ramp, dimmed; no new CSS class — the ADR-0083 grep rule). */}
      {session && enlistedBy ? (
        <p className="s5fr-tankname" style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.72, margin: "2px 0 8px" }}>
          🤝 {fill(t.enlistedBy, { name: enlistedBy })}
        </p>
      ) : null}

      {!session ? (
        <p className="s5fr-guest">{t.guest}</p>
      ) : (
        <div className="s5fr-grid">
          {/* Column 1: the tank + its real ratings */}
          <div className="s5fr-cell">
            <h3 className="s5fr-h">{t.tankHeading}</h3>
            <p className="s5fr-tankname">
              {spec ? spec.name : tank.tankName}
              {spec ? <span className="s5fr-tier"> · {t.tierLabel} {spec.tier}</span> : null}
            </p>
            {spec ? (
              <div>
                <RatingBar label={t.ratingFp} value={spec.ratings.fp} />
                <RatingBar label={t.ratingSpd} value={spec.ratings.spd} />
                <RatingBar label={t.ratingMan} value={spec.ratings.man} />
                <RatingBar label={t.ratingArm} value={spec.ratings.arm} />
              </div>
            ) : null}
          </div>

          {/* Column 2: the five upgrade ladders */}
          <div className="s5fr-cell">
            <h3 className="s5fr-h">{t.upgradesHeading}</h3>
            <Pips level={s.armor} label={t.statArmor} icon="🛡" />
            <Pips level={s.engine} label={t.statEngine} icon="⚙" />
            <Pips level={s.smoke} label={t.statSmoke} icon="💨" />
            {/* CALIBER is a 30-step ladder, not a 4-level one. Drawn on the
                same four pips as its neighbours so the board reads as one
                thing, with the level scaled into quarters -- 30 lights all
                four, and a level 5 no longer looks identical to a level 30. */}
            <Pips level={Math.round((s.caliber / 30) * 4)} label={t.statCaliber} icon="🎯" />
            <Pips level={s.optics} label={t.statOptics} icon="🔭" />
          </div>

          {/* Column 3: the money, honestly */}
          <div className="s5fr-cell s5fr-cell--pay">
            <h3 className="s5fr-h">{t.payoutHeading}</h3>
            <p className="s5fr-est">{payout ? usd(payout.estNowUsd) : "$0.00"}</p>
            <p className="s5fr-estlabel">{t.estLabel}</p>
            {payout && payout.share > 0 ? (
              <p className="s5fr-share">
                {(payout.share * 100).toFixed(2)}% {t.shareLabel}
              </p>
            ) : null}
            <p className="s5fr-disclaimer">{t.disclaimer}</p>
          </div>
        </div>
      )}

      {/* THE FRONT REACTS: the economic state of the season, on the dossier.
          Shown to guests too: a sprint is season news, not personal data. */}
      {sprintNames ? (
        <div className="s5fr-sprint" role="status" aria-label={dict.sprint.aria} data-testid="fr-sprint">
          <span className="s5fr-sprint-ico" aria-hidden>🚨</span>
          <span className="s5fr-sprint-text">
            <strong>{fill(dict.sprint.frLead, { domain: sprintNames })}</strong>{" "}
            <span className="s5fr-sprint-note">{dict.sprint.frNote}</span>
          </span>
          <Link href="/s6" className="s5fr-sprint-cta">
            {dict.sprint.frCta}
          </Link>
        </div>
      ) : null}

      {/* THE WAR EFFORT: this commander's own commitments. Shells and decals
          only, so it sits BELOW the payout column and never near a dollar. */}
      {session ? (
        <div className="s5fr-warn" role="status" data-testid="fr-war-effort" style={{ borderColor: "#232a32" }}>
          <span className="s5fr-warn-ico" aria-hidden>⚔️</span>
          <span className="s5fr-warn-text">
            <strong>{dict.warEffort.mineTitle}</strong>{" "}
            {warEffort.length === 0 ? (
              dict.warEffort.mineNone
            ) : (
              warEffort
                .map(
                  (c) =>
                    `${c.name}: ${fill(dict.warEffort.committed, { n: c.shells.toLocaleString("en-US") })} (${
                      c.status === "won"
                        ? dict.warEffort.statusWon
                        : c.status === "lost"
                          ? dict.warEffort.statusLost
                          : dict.warEffort.statusCommitted
                    })`,
                )
                .join(" · ")
            )}{" "}
            <span className="s5fr-sprint-note">{dict.warEffort.note}</span>
          </span>
          <Link href="/s6" className="s5fr-warn-cta">
            {dict.warEffort.cta}
          </Link>
        </div>
      ) : null}

      {locked && payout ? (
        <div className="s5fr-warn" role="status">
          <span className="s5fr-warn-ico" aria-hidden>⚠️</span>
          <span className="s5fr-warn-text">
            <strong>{usd(payout.lockedUsd)}</strong>{" "}
            {t.lockedLead.replace("{n}", String(payout.lockedCount))}
            {payout.lockedNames.length ? (
              <span className="s5fr-warn-names"> · {payout.lockedNames.join(" · ")}</span>
            ) : null}
          </span>
          <Link href="/s6" className="s5fr-warn-cta">
            {t.lockedCta}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
