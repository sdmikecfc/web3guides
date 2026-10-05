/**
 * Season 5 THE RULES (/s5/rules): the pitch, the honest prize wording, the
 * hold economy numbers, the arcade cap, and the full field manual (the
 * education registry). Server component; copy comes from the s5 dict (cookie
 * locale, en byte-for-byte by default). The economy NUMBERS are threaded into
 * the dict templates from lib/s5/games.ts so all three languages always show
 * the same maths. English keeps the live Theme pitch (operator-overridable);
 * ko/zh read the dict's translation of the same pitch.
 *
 * Copy rules: no em-dashes, never "win $X", plain short sentences.
 */
import Link from "next/link";
import { getSeasonSnapshot, poolLine } from "@/lib/s5/data";
import { DEFAULT_THEME } from "@/lib/s5/theme";
import { dict, getLocale } from "@/lib/s5/i18n";
import { fill } from "@/lib/s5/strings";
import {
  BOUNTY_TOTAL_USD,
  FRESH_WINDOW_DAYS,
  GAME_DAILY_POINTS_CAP,
  HOLD_CAP_PER_DOMAIN,
  HOLD_RATE_PER_USD_DAY,
  POINTS_PER_RUN,
  POOL_FULL_USD,
  SEASON_MONEY_USD,
  SHELLS_PER_RUN,
  SPRINT_RUN_BONUS_POINTS,
  HOLD_CAP_USD,
  HOLD_CAP_MAX,
  TIER_STEP_PCT,
  holdBaseDaily,
  TIER_NAMES,
} from "@/lib/s5/games";
import { EDUCATION } from "@/lib/s5/hq";
import { Eyebrow, PageShell, Panel, PoolBanner, UI } from "../_components/ui";

export const revalidate = 60;

export const metadata = {
  title: `Rules · ${DEFAULT_THEME.seasonName}`,
  description:
    "Every rule of the season on one page: the pool, Medals, Shells, the hull ladder, and fair play.",
};

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} style={{ marginBottom: 26, scrollMarginTop: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: UI.text, margin: "0 0 10px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One currency: what it is, and every way it reaches you. */
function RewardGroup({
  label,
  what,
  rows,
  accent,
}: {
  label: string;
  what: string;
  rows: string[];
  accent: string;
}) {
  return (
    <Panel style={{ borderColor: `${accent}33`, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <span
          style={{
            fontFamily: UI.mono,
            fontSize: 11.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: accent,
            fontWeight: 700,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 13, color: UI.muted, lineHeight: 1.5 }}>{what}</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r) => (
          <li key={r} style={{ display: "flex", gap: 8, fontSize: 13, color: UI.muted, lineHeight: 1.6 }}>
            <span aria-hidden style={{ color: accent, flex: "0 0 auto", lineHeight: 1.6 }}>
              +
            </span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default async function S5Rules() {
  const snap = await getSeasonSnapshot();
  const t = snap.theme;
  const locale = getLocale();
  const d = dict(locale);

  /** ONE args bag for the whole rewards catalog. Every number a player reads
   * on it comes from a constant here, so no translator ever has to carry an
   * economy figure in their head and no locale can drift from the maths.
   * fill() leaves untouched any placeholder a row does not use. */
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  const rewardArgs = {
    rate: HOLD_RATE_PER_USD_DAY,
    cap: HOLD_CAP_USD,
    perDomain: HOLD_CAP_PER_DOMAIN,
    capMax: HOLD_CAP_MAX,
    tierStep: TIER_STEP_PCT,
    freshDays: FRESH_WINDOW_DAYS,
    perRun: POINTS_PER_RUN,
    arcadeCap: GAME_DAILY_POINTS_CAP,
    flatCap: GAME_DAILY_POINTS_CAP,
    sprintBonus: SPRINT_RUN_BONUS_POINTS,
    shellsRun: SHELLS_PER_RUN,
    // What a $5 hold pays a day, computed rather than typed: it is the whole
    // reassurance that holding beats the flat cap, so it must track the maths.
    hold5: Math.round(holdBaseDaily(5)),
    // The War Effort commit window (ADR-0098). Not a web constant: the gate in
    // lib/s5/warEffort.ts still mirrors the bot's sprint tripwire.
    weClose: 70,
    end: d.common.seasonEnd,
    total: money(SEASON_MONEY_USD),
    pool: money(POOL_FULL_USD),
    bounty: money(BOUNTY_TOTAL_USD),
    full: money(POOL_FULL_USD),
  };
  const rewardRows = (rows: readonly string[]) => rows.map((r) => fill(r, rewardArgs));

  /** The season pitch: the live Theme word in English (the one seam, operator
   * overridable), the dict translation elsewhere. */
  const pitch = locale === "en" ? t.pitch : d.rules.pitch;

  return (
    <PageShell>
      <header style={{ textAlign: "center", marginBottom: 28 }}>
        <Eyebrow>{t.seasonName}</Eyebrow>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 800, margin: "0 0 8px", color: UI.text }}>
          {d.rules.title}
        </h1>
        <p style={{ fontSize: 14.5, color: UI.muted, margin: 0 }}>
          {d.rules.subtitle}
        </p>
      </header>

      {/* ── THE THREE SENTENCES (ADR-0098). The page OPENS with the whole
          economy stated three times over, then the ONE plain sentence that
          defines Medals, then the flat list of what every action pays. ── */}
      <Section title={d.rules.moneyHeading}>
        <Panel style={{ borderColor: `${UI.good}33` }}>
          {[d.rules.money1, d.rules.money2, d.rules.money3].map((line) => (
            <p
              key={line}
              style={{ fontSize: 15, color: UI.text, fontWeight: 600, lineHeight: 1.7, margin: "0 0 8px" }}
            >
              {fill(line, rewardArgs)}
            </p>
          ))}
          <div style={{ height: 1, background: UI.border, margin: "12px 0" }} />
          <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.65, margin: 0 }}>
            {d.common.medalsPlain}
          </p>
        </Panel>
      </Section>

      {/* WHAT EACH THING PAYS. One row per way in, in the order a player meets
          them. The floor line under it is the reassurance: holding always leads,
          by construction, and the fine print is the freshness rule. */}
      <Section id="pay" title={d.rules.payHeading}>
        <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.65, margin: "0 0 12px", maxWidth: 620 }}>
          {d.rules.payLead}
        </p>
        <Panel>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {rewardRows(d.rules.payRows).map((r) => (
              <li key={r} style={{ display: "flex", gap: 8, fontSize: 13.5, color: UI.muted, lineHeight: 1.6 }}>
                <span aria-hidden style={{ color: UI.good, flex: "0 0 auto", lineHeight: 1.6 }}>
                  +
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <div style={{ height: 1, background: UI.border, margin: "12px 0" }} />
          <p style={{ fontSize: 13.5, color: UI.text, fontWeight: 600, lineHeight: 1.65, margin: "0 0 8px" }}>
            {fill(d.rules.payFloor, rewardArgs)}
          </p>
          <p style={{ fontSize: 12.5, color: UI.faint, lineHeight: 1.6, margin: 0 }}>
            {fill(d.rules.payFine, rewardArgs)}
          </p>
        </Panel>
      </Section>

      {/* THE CATALOG, HIGH ON THE PAGE. "What are all the rewards, how do you
          get them, how much am I getting" is what players actually ask (Mike,
          2026-08-01), and the answer used to be scattered across four sections
          and a bot comment. Every currency, every route in, one screen. */}
      <Section id="rewards" title={d.rules.rewardsHeading}>
        <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.65, margin: "0 0 12px", maxWidth: 620 }}>
          {d.rules.rewardsLead}
        </p>
        <RewardGroup
          label={d.rules.rewardsMedals}
          what={d.rules.rewardsMedalsWhat}
          rows={rewardRows(d.rules.rewardsMedalsRows)}
          accent={UI.steel}
        />
        <RewardGroup
          label={d.rules.rewardsShells}
          what={d.rules.rewardsShellsWhat}
          rows={rewardRows(d.rules.rewardsShellsRows)}
          accent="#f0b340"
        />
        <RewardGroup
          label={d.rules.rewardsCash}
          what={fill(d.rules.rewardsCashWhat, rewardArgs)}
          rows={rewardRows(d.rules.rewardsCashRows)}
          accent={UI.good}
        />
        <RewardGroup
          label={d.rules.rewardsTrophies}
          what={d.rules.rewardsTrophiesWhat}
          rows={rewardRows(d.rules.rewardsTrophiesRows)}
          accent="#e0662e"
        />
      </Section>

      <Section title={d.rules.pitchHeading}>
        <Panel>
          <p style={{ fontSize: 14.5, color: UI.text, lineHeight: 1.7, margin: 0 }}>{pitch}</p>
        </Panel>
      </Section>

      <Section title={d.rules.payoutHeading}>
        <div style={{ marginBottom: 10 }}>
          <PoolBanner line={snap.empty ? d.pool.preSeason : poolLine(snap, d)} />
        </div>
        <Panel>
          <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.7, margin: 0 }}>
            {fill(d.rules.payoutBody, rewardArgs)}
          </p>
        </Panel>
      </Section>

      <Section title={d.rules.holdHeading}>
        <Panel>
          <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.7, margin: "0 0 10px" }}>
            {fill(d.rules.holdBody1, {
              rate: HOLD_RATE_PER_USD_DAY,
              cap: HOLD_CAP_USD,
              perDomain: HOLD_CAP_PER_DOMAIN,
              capMax: HOLD_CAP_MAX,
              ex: Math.round(holdBaseDaily(25)),
            })}
          </p>
          <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.7, margin: 0 }}>
            {fill(d.rules.holdBody2, {
              first: TIER_NAMES[0],
              last: TIER_NAMES[TIER_NAMES.length - 1],
            })}
          </p>
        </Panel>
      </Section>

      <Section title={d.rules.arcadeHeading}>
        <Panel>
          <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.7, margin: 0 }}>
            {fill(d.rules.arcadeBody, { cap: GAME_DAILY_POINTS_CAP, perRun: POINTS_PER_RUN })}
          </p>
        </Panel>
      </Section>

      {/* THE POST FLOW. It was live in the bot and unexplained on the site, so
          a player had no way to know a post had to carry the game or where to
          drop it (ADR-0098 amends ADR-0068). */}
      <Section id="posting" title={d.rules.postHeading}>
        <Panel>
          <p style={{ fontSize: 13.5, color: UI.text, fontWeight: 600, lineHeight: 1.65, margin: "0 0 10px" }}>
            {d.rules.postLead}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
            {d.rules.postRows.map((r) => (
              <li key={r} style={{ display: "flex", gap: 8, fontSize: 13, color: UI.muted, lineHeight: 1.6 }}>
                <span aria-hidden style={{ color: UI.steel, flex: "0 0 auto", lineHeight: 1.6 }}>
                  +
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </Section>

      {/* THE FIVE FINALE TITLES. Cosmetic, and never rendered beside a dollar
          figure: honors carry no cash this season. */}
      <Section id="titles" title={d.rules.titlesHeading}>
        <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.65, margin: "0 0 12px", maxWidth: 620 }}>
          {fill(d.rules.titlesLead, rewardArgs)}
        </p>
        <Panel>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
            {d.rules.titlesRows.map((r) => (
              <li key={r} style={{ display: "flex", gap: 8, fontSize: 13.5, color: UI.muted, lineHeight: 1.6 }}>
                <span aria-hidden style={{ color: "#f0b340", flex: "0 0 auto", lineHeight: 1.6 }}>
                  ★
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 12.5, color: UI.faint, lineHeight: 1.6, margin: "12px 0 0" }}>
            {d.rules.titlesNote}
          </p>
        </Panel>
      </Section>

      <Section title={d.rules.educationHeading}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {EDUCATION.map((e) => (
            <Panel key={e.key}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: UI.steel, marginBottom: 4 }}>
                {d.education[e.key].title}
              </div>
              <p style={{ fontSize: 13, color: UI.muted, lineHeight: 1.65, margin: 0 }}>
                {d.education[e.key].body}
              </p>
            </Panel>
          ))}
        </div>
      </Section>

      <p style={{ textAlign: "center", fontSize: 13, color: UI.faint, marginTop: 30 }}>
        <Link href="/s5" style={{ color: UI.muted }}>{d.common.back}</Link>
        {" · "}
        <Link href="/s5/join" style={{ color: UI.muted }}>{d.links.enlist}</Link>
        {" · "}
        <Link href="/s5/map" style={{ color: UI.muted }}>{d.links.map}</Link>
      </p>
    </PageShell>
  );
}
