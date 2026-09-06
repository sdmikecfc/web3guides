"use client";
/**
 * FIELD REPORT, the HQ stats board (Mike, 2026-07-22): a dossier-style panel
 * on the home base. REALMFALL (ADR-0129/0133): the inherited tank + five-stat
 * view is gone. Column 1 is the ACTIVE CLASS summary (name, level, XP bar,
 * armor stage), column 2 is the three GEAR slot pips, column 3 stays the
 * payout projection with the WARNING strip whenever pool money is riding on
 * keeps the player holds that have NOT breached.
 *
 * Class data rides useClassTracks (panels.tsx): session-authed GET
 * /api/s7/class, demo-seeded under ?demo=1, fail-soft. All progression math
 * imports lib/s7/classes (xpForLevel / stageForLevel / classStageArt);
 * nothing here re-derives a level or a stage.
 *
 * Money honesty rules: the number is labelled an estimate, the disclaimer
 * quotes the only-breached-pay line, and nothing here says "win $X". Styling
 * lives in HQ_CSS (HqScene.tsx) under .s7fr-*: military stencil header, steel
 * plate, pips over prose so it reads at a glance in en/ko/zh. New class
 * strings are inline English for now (the strings pass lifts them later).
 */
import Link from "next/link";
import { fill, type S7Dict } from "@/lib/s7/strings";
import { GEAR_MAX_TIER, MAX_LEVEL, classStageArt, stageForLevel, xpForLevel, type ClassTrack } from "@/lib/s7/classes";
import { CLASS_IDS } from "@/app/s7/games/_shared/rules/core";
import { CLASS_ACCENT, CLASS_NAME, STAGE_META, classHeroArt, useClassTracks } from "./panels";

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

/** `max` comes from the slot's real cap, not a hardcoded count: an unlightable
 *  pip reads as "not finished yet" to a player who is. Gear caps at 3. */
function Pips({ level, label, icon, max = GEAR_MAX_TIER }: { level: number; label: string; icon: string; max?: number }) {
  const pips = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="s7fr-stat" role="img" aria-label={`${label}: ${level} of ${max}`}>
      <span className="s7fr-stat-ico" aria-hidden>{icon}</span>
      <span className="s7fr-stat-name">{label}</span>
      <span className="s7fr-pips" aria-hidden>
        {pips.map((i) => (
          <span key={i} className={`s7fr-pip${i <= level ? " s7fr-pip--on" : ""}`} />
        ))}
      </span>
    </div>
  );
}

/** The class column's XP row, on the dossier's own rating-bar chrome. Values
 * come straight from xpForLevel; the class accent paints the fill. */
function XpRow({ tr }: { tr: ClassTrack }) {
  const accent = CLASS_ACCENT[tr.classKey];
  const topLevel = tr.level >= MAX_LEVEL;
  const floor = xpForLevel(tr.level);
  const span = Math.max(1, xpForLevel(Math.min(MAX_LEVEL, tr.level + 1)) - floor);
  const into = Math.max(0, Math.min(span, tr.xp - floor));
  const pct = topLevel ? 100 : Math.min(100, Math.round((into / span) * 100));
  return (
    <div
      className="s7fr-rating"
      role="img"
      aria-label={topLevel ? "Top level reached" : `${into} of ${span} XP to level ${tr.level + 1}`}
      data-testid="fr-class-xp"
    >
      <span className="s7fr-rating-name">XP</span>
      <span className="s7fr-rating-track" aria-hidden>
        <span
          className="s7fr-rating-fill"
          style={{ width: `${Math.max(4, pct)}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})` }}
        />
      </span>
      <span className="s7fr-rating-num" aria-hidden style={{ width: "auto" }}>
        {pct}%
      </span>
    </div>
  );
}

/** Untrained and guest state: the six hero thumbs + the one plain line. */
function ClassTeaser() {
  return (
    <div data-testid="fr-class-teaser">
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", margin: "2px 0 8px" }} aria-hidden>
        {CLASS_IDS.map((c) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={c}
            src={classHeroArt(c)}
            alt=""
            title={CLASS_NAME[c]}
            style={{ height: 40, width: "auto", maxWidth: 36, objectFit: "contain", objectPosition: "bottom center" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#aab4bd", lineHeight: 1.55 }}>
        Pick a class in the Class Hall. Any class is free.
      </p>
    </div>
  );
}

export function StatsBoard({
  dict,
  session,
  token = null,
  payout,
  points,
  shells,
  streakDays,
  sprintNames = "",
  warEffort = [],
  enlistedBy = null,
}: {
  dict: S7Dict;
  session: boolean;
  /** The play-session token (HqScene's me.token) for the class-tracks read. */
  token?: string | null;
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
  const [cls] = useClassTracks(token);
  const active: ClassTrack | undefined = cls.active ? cls.tracks[cls.active] : undefined;
  const stage = active ? stageForLevel(active.level) : null;
  const accent = active ? CLASS_ACCENT[active.classKey] : "#9aa7b4";
  const locked = session && payout !== null && payout.lockedUsd > 0.005;

  return (
    <section className="s7fr" aria-label={t.title}>
      <header className="s7fr-head">
        <span className="s7fr-title">{t.title}</span>
        <span className="s7fr-counters">
          <span title={t.medals}>🛡️ {points.toLocaleString("en-US")}</span>
          <span title={t.shells}>🪙 {shells.toLocaleString("en-US")}</span>
          {streakDays > 0 ? <span title={t.streak}>🔥 {streakDays}</span> : null}
        </span>
      </header>
      {/* Brothers in Arms: the permanent enlistment credit (reuses the tankname
          type ramp, dimmed; no new CSS class — the ADR-0083 grep rule). */}
      {session && enlistedBy ? (
        <p className="s7fr-tankname" style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.72, margin: "2px 0 8px" }}>
          🤝 {fill(t.enlistedBy, { name: enlistedBy })}
        </p>
      ) : null}

      {!session ? (
        <div>
          <p className="s7fr-guest" style={{ paddingBottom: 8 }}>{t.guest}</p>
          <div style={{ padding: "0 18px 18px" }}>
            <ClassTeaser />
          </div>
        </div>
      ) : (
        <div className="s7fr-grid">
          {/* Column 1: the ACTIVE CLASS (name, level, XP, armor stage) */}
          <div className="s7fr-cell" data-testid="fr-class">
            <h3 className="s7fr-h">Your class</h3>
            {active && stage ? (
              <>
                <p className="s7fr-tankname" style={{ color: accent }}>
                  {CLASS_NAME[active.classKey]}
                  <span className="s7fr-tier" style={{ color: "#9aa7b4" }}>
                    {" "}· Level {active.level} of {MAX_LEVEL}
                  </span>
                </p>
                <XpRow tr={active} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }} data-testid="fr-class-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={classStageArt(active.classKey, stage)}
                    alt=""
                    aria-hidden
                    style={{ height: 46, width: 40, objectFit: "contain", objectPosition: "bottom center" }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: accent }}>{STAGE_META[stage].name} armor</div>
                    <div style={{ fontSize: 10.5, color: "#87919b", lineHeight: 1.4 }}>
                      {stage === "mythic" ? "The top stage. Worn by few." : "Level up to wear the next stage."}
                    </div>
                  </div>
                </div>
              </>
            ) : cls.loaded ? (
              <ClassTeaser />
            ) : null}
          </div>

          {/* Column 2: the three gear slots (weapon / armor / trinket) */}
          <div className="s7fr-cell" data-testid="fr-gear">
            <h3 className="s7fr-h">Your gear</h3>
            <Pips level={active ? active.gear.weapon : 0} label="Weapon" icon="🗡" />
            <Pips level={active ? active.gear.armor : 0} label="Armor" icon="🛡" />
            <Pips level={active ? active.gear.trinket : 0} label="Trinket" icon="🧿" />
            <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "#87919b", lineHeight: 1.5 }}>
              Gear sharpens your class in every game. Buy tiers with Gold in the Armory.
            </p>
          </div>

          {/* Column 3: the money, honestly */}
          <div className="s7fr-cell s7fr-cell--pay">
            <h3 className="s7fr-h">{t.payoutHeading}</h3>
            <p className="s7fr-est">{payout ? usd(payout.estNowUsd) : "$0.00"}</p>
            <p className="s7fr-estlabel">{t.estLabel}</p>
            {payout && payout.share > 0 ? (
              <p className="s7fr-share">
                {(payout.share * 100).toFixed(2)}% {t.shareLabel}
              </p>
            ) : null}
            <p className="s7fr-disclaimer">{t.disclaimer}</p>
          </div>
        </div>
      )}

      {/* THE FRONT REACTS: the economic state of the season, on the dossier.
          Shown to guests too: a sprint is season news, not personal data. */}
      {sprintNames ? (
        <div className="s7fr-sprint" role="status" aria-label={dict.sprint.aria} data-testid="fr-sprint">
          <span className="s7fr-sprint-ico" aria-hidden>🚨</span>
          <span className="s7fr-sprint-text">
            <strong>{fill(dict.sprint.frLead, { domain: sprintNames })}</strong>{" "}
            <span className="s7fr-sprint-note">{dict.sprint.frNote}</span>
          </span>
          <Link href="/s7" className="s7fr-sprint-cta">
            {dict.sprint.frCta}
          </Link>
        </div>
      ) : null}

      {/* THE WAR EFFORT: this commander's own commitments. Shells and decals
          only, so it sits BELOW the payout column and never near a dollar. */}
      {session ? (
        <div className="s7fr-warn" role="status" data-testid="fr-war-effort" style={{ borderColor: "#232a32" }}>
          <span className="s7fr-warn-ico" aria-hidden>⚔️</span>
          <span className="s7fr-warn-text">
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
            <span className="s7fr-sprint-note">{dict.warEffort.note}</span>
          </span>
          <Link href="/s7" className="s7fr-warn-cta">
            {dict.warEffort.cta}
          </Link>
        </div>
      ) : null}

      {locked && payout ? (
        <div className="s7fr-warn" role="status">
          <span className="s7fr-warn-ico" aria-hidden>⚠️</span>
          <span className="s7fr-warn-text">
            <strong>{usd(payout.lockedUsd)}</strong>{" "}
            {t.lockedLead.replace("{n}", String(payout.lockedCount))}
            {payout.lockedNames.length ? (
              <span className="s7fr-warn-names"> · {payout.lockedNames.join(" · ")}</span>
            ) : null}
          </span>
          <Link href="/s7" className="s7fr-warn-cta">
            {t.lockedCta}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
