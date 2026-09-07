/**
 * Season 5 HOW TO PLAY (/s7/how-to-play): the page that turns a curious
 * visitor into a commander. Round-2 onboarding (Mike, 2026-07-25): the page is
 * now a first-class surface in the top nav, opens with THE WALKTHROUGH (a
 * 6-step interactive rail with deep links and honest done checks, see
 * Walkthrough.tsx), then HOW DOMA WORKS (protocol facts checked against
 * docs.doma.xyz, buy paths from lib/s7/funding.ts), and keeps the full
 * original 8-section reference below as THE FIELD MANUAL accordion.
 *
 * Server component, ISR (revalidate 60), no data fetch: every number is read
 * from the ONE registries (lib/s7/games.ts, lib/s7/tanks.ts) so the page can
 * never drift from the real economy. All copy comes from the s7 dict
 * (cookie locale, en byte-for-byte by default), and the crypto explainers
 * reuse the EDUCATION registry that the HQ field manuals already use, so the
 * facts are stated in exactly one place.
 *
 * Copy rules: no em-dashes, never "win $X", never financial advice.
 */
import Link from "next/link";
import { HELP_LINKS } from "@/lib/s7/help";
import { DEFAULT_THEME } from "@/lib/s7/theme";
import { dict, getLocale } from "@/lib/s7/i18n";
import { fill } from "@/lib/s7/strings";
import {
  GAMES,
  GAME_DAILY_POINTS_CAP,
  GAME_LEADER_PRIZE_USD,
  GAME_LEADER_POOL_MAX_USD,
  POINTS_PER_RUN,
  POOL_FULL_USD,
  SEASON_MONEY_USD,
  SLICE_MAX_USD,
  SLICE_MIN_USD,
} from "@/lib/s7/games";
import { TANK_ROSTER } from "@/lib/s7/tanks";
import { EDUCATION_BY_KEY, type EducationKey } from "@/lib/s7/hq";
import { DOMA_APP_URL } from "@/lib/s7/funding";
import { Eyebrow, PageShell, Panel, UI } from "../_components/ui";
import { Walkthrough } from "./Walkthrough";

export const revalidate = 60;

export const metadata = {
  title: `How to Play · ${DEFAULT_THEME.seasonName}`,
  description:
    "A free hero game played on real domains. Enlist in one signature, pick a hero, play the arcade, and hold a keep from $5 to earn Valor daily. Every keep pays its peak, and a liberation pays in full.",
};

/** Official docs link-outs. The BUY paths (app / bridge) come from
 * lib/s7/funding.ts; these two are documentation, not funding routes. */
const DOMA_DOCS_URL = "https://docs.doma.xyz/";
const DOMA_DOCS_FRACTIONAL_URL = "https://docs.doma.xyz/api-reference/doma-fractionalization";

/** The crypto explainers the manual shows, in teaching order (the two others,
 * breach-pays and siwe-safety, are shown in the money and safety sections). */
const CRYPTO_KEYS: EducationKey[] = [
  "domain-token",
  "bonding",
  "fdv",
  "how-to-buy",
  "why-hold",
];


function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginBottom: 46, scrollMarginTop: 116 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <span
          style={{
            fontFamily: UI.mono,
            fontSize: 12,
            fontWeight: 700,
            color: UI.ember,
            letterSpacing: "0.12em",
          }}
        >
          {String(n).padStart(2, "0")}
        </span>
        <h2
          style={{
            fontSize: "clamp(19px, 4.2vw, 24px)",
            fontWeight: 800,
            color: UI.text,
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {title}
        </h2>
      </div>
      <div
        style={{
          height: 1,
          background: `linear-gradient(90deg, ${UI.ember}66, ${UI.border} 40%, transparent)`,
          marginBottom: 16,
        }}
      />
      {children}
    </section>
  );
}

function Body({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 14.5, color: UI.muted, lineHeight: 1.75, margin: "0 0 12px", ...style }}>
      {children}
    </p>
  );
}

function Card({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent?: string;
}) {
  return (
    <Panel style={{ borderColor: accent ? `${accent}44` : UI.border }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: accent ?? UI.steel, marginBottom: 6 }}>
        {title}
      </div>
      <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.65, margin: 0 }}>{body}</p>
    </Panel>
  );
}

/** A plain <img> band. If the file is ever missing the frame still reads as a
 * deliberate steel plate, so nothing collapses. */
function ArtBand({
  src,
  alt,
  height,
  eager,
}: {
  src: string;
  alt: string;
  height: number;
  /** The hero band is above the fold, so it must not lazy load. */
  eager?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${UI.border}`,
        background: "linear-gradient(160deg, #1a2027 0%, #0e1216 100%)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.86 }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(11,13,16,0.10) 0%, rgba(11,13,16,0.30) 55%, rgba(11,13,16,0.86) 100%)",
        }}
      />
    </div>
  );
}

/** One Field Manual entry: a native details/summary accordion row (zero JS,
 * server-rendered, keyboard and screen-reader friendly). Old section anchors
 * are preserved on the details ids. */
function ManualSection({
  id,
  title,
  children,
  open,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  /** OPEN ON ARRIVAL. All eight sections shipped closed, which meant the
   * complete reference -- including the money rule and the three-envelope
   * breakdown -- was invisible until somebody tapped eight drawers. A page
   * called How to Play must answer the first two questions without being
   * asked; the rest stay closed so the page is still scannable. */
  open?: boolean;
}) {
  return (
    <details
      id={id}
      open={open}
      style={{
        background: UI.panel,
        border: `1px solid ${UI.border}`,
        borderRadius: 14,
        marginBottom: 10,
        scrollMarginTop: 116,
        overflow: "hidden",
      }}
    >
      {/* role/aria-level, not a nested <h3>: an <h3> inside <summary> would
          make the disclosure widget's own name awkward, while this puts the
          eight Field Manual titles into the heading outline so AT users can
          jump between them (2026-07-27 audit, item 25). */}
      <summary
        role="heading"
        aria-level={3}
        style={{
          cursor: "pointer",
          padding: "15px 18px",
          fontSize: 14.5,
          fontWeight: 700,
          color: UI.text,
          lineHeight: 1.3,
        }}
      >
        {title}
      </summary>
      <div style={{ padding: "6px 18px 18px" }}>{children}</div>
    </details>
  );
}

/** External link pill (docs / app link-outs). */
function OutLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-block",
        fontSize: 12.5,
        fontWeight: 700,
        color: UI.steel,
        textDecoration: "none",
        border: `1px solid ${UI.border}`,
        background: "rgba(255,255,255,0.04)",
        borderRadius: 999,
        padding: "8px 14px",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {label} ↗
    </a>
  );
}

export default function S7HowToPlay() {
  const t = DEFAULT_THEME;
  const locale = getLocale();
  const d = dict(locale);
  const h = d.howToPlay;

  const liveGames = GAMES.filter((g) => !g.comingSoon).length;
  const attempts = GAMES[0]?.attempts ?? 3;
  const tankCount = TANK_ROSTER.length;
  const hooks = h.gameHooks as Record<string, string>;

  const stats: Array<{ icon: string; name: string; body: string }> = [
    { icon: "🛡", name: d.statsBoard.statArmor, body: h.statArmorBody },
    { icon: "⚙", name: d.statsBoard.statEngine, body: h.statEngineBody },
    { icon: "💨", name: d.statsBoard.statSmoke, body: h.statSmokeBody },
    { icon: "🎯", name: d.statsBoard.statCaliber, body: h.statCaliberBody },
    { icon: "🔭", name: d.statsBoard.statOptics, body: h.statOpticsBody },
  ];

  const badges = [h.badgeFree, h.badgeTime, h.badgeNoGas];

  /** ONE args bag for every money template on this page, so the envelope
   * numbers and the settlement date come from one place (games.ts + the
   * dict's own date label) rather than from a row index. */
  const moneyArgs = {
    total: `$${SEASON_MONEY_USD.toLocaleString("en-US")}`,
    pool: `$${POOL_FULL_USD.toLocaleString("en-US")}`,
    full: `$${POOL_FULL_USD.toLocaleString("en-US")}`,
    sliceMin: `$${SLICE_MIN_USD.toLocaleString("en-US")}`,
    sliceMax: `$${SLICE_MAX_USD.toLocaleString("en-US")}`,
    leaderPrize: `$${GAME_LEADER_PRIZE_USD.toLocaleString("en-US")}`,
    leaderPool: `$${GAME_LEADER_POOL_MAX_USD.toLocaleString("en-US")}`,
    end: d.common.seasonEnd,
  };

  return (
    <PageShell>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header style={{ marginBottom: 30 }}>
        <Eyebrow>{t.seasonName}</Eyebrow>
        <h1
          style={{
            fontSize: "clamp(30px, 7vw, 48px)",
            fontWeight: 800,
            margin: "0 0 10px",
            color: UI.text,
            lineHeight: 1.1,
          }}
        >
          {h.title}
        </h1>
        <p
          style={{
            fontSize: 15.5,
            color: UI.muted,
            margin: "0 0 14px",
            maxWidth: 620,
            lineHeight: 1.7,
          }}
        >
          {h.subtitle}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {badges.map((b) => (
            <span
              key={b}
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: UI.steel,
                border: `1px solid ${UI.border}`,
                background: "rgba(255,255,255,0.03)",
                borderRadius: 999,
                padding: "5px 11px",
              }}
            >
              {b}
            </span>
          ))}
        </div>

        {/* ON THIS PAGE: 852 lines in one scroll with no way to jump. The
            nav1..nav8 strings were already written and localized in all three
            languages and rendered NOWHERE (2026-07-27 audit, F8). */}
        <nav aria-label={h.navHeading} style={{ marginTop: 22 }}>
          <p
            style={{
              fontFamily: UI.mono,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: UI.steel,
              margin: "0 0 8px",
            }}
          >
            {h.navHeading}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                [h.nav1, "#what"],
                [h.nav2, "#money"],
                [h.nav3, "#start"],
                [h.nav4, "#crypto"],
                [h.nav5, "#hq"],
                [h.nav6, "#arcade"],
                [h.nav7, "#fight"],
                [h.nav8, "#safety"],
              ] as const
            ).map(([label, href]) => (
              <a
                key={href}
                href={href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 34,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: UI.text,
                  textDecoration: "none",
                  border: `1px solid ${UI.border}`,
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 999,
                  padding: "0 13px",
                }}
              >
                {label}
              </a>
            ))}
          </div>
        </nav>
      </header>

      {/* ── 1. THE WALKTHROUGH: the interactive 6-step rail ──────────────── */}
      <Section id="walkthrough" n={1} title={h.guideHeading}>
        <Walkthrough locale={locale} />
      </Section>

      {/* ── 2. HOW DOMA WORKS: protocol facts + official link-outs ───────── */}
      <Section id="doma" n={2} title={h.domaTitle}>
        <Body>{h.domaIntro}</Body>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Card title={h.domaCard1Title} body={h.domaCard1Body} accent={UI.steel} />
          <Card title={h.domaCard2Title} body={h.domaCard2Body} accent={UI.ember} />
          <Card title={h.domaCard3Title} body={h.domaCard3Body} accent={UI.good} />
          <Card title={h.domaCard4Title} body={h.domaCard4Body} />
        </div>
        <Panel>
          <div
            style={{
              fontFamily: UI.mono,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: UI.steel,
              marginBottom: 10,
            }}
          >
            {h.domaLinksHeading}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <OutLink href={DOMA_DOCS_URL} label={h.domaLinkDocs} />
            <OutLink href={DOMA_DOCS_FRACTIONAL_URL} label={h.domaLinkFractional} />
            <OutLink href={DOMA_APP_URL} label={h.domaLinkApp} />
          </div>
          <p style={{ fontSize: 12, color: UI.faint, lineHeight: 1.6, margin: 0 }}>{h.domaNote}</p>
        </Panel>
      </Section>

      {/* ── 3. THE FIELD MANUAL: the full 8-section reference, accordion ─── */}
      <Section id="manual" n={3} title={h.manualHeading}>
        <Body>{h.manualIntro}</Body>

        {/* 3.1 What this is */}
        <ManualSection id="what" title={h.s1Title} open>
          <p style={{ fontSize: 14.5, color: UI.text, lineHeight: 1.8, margin: "0 0 12px" }}>
            {h.s1Body}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            <Card title={h.s1CardATitle} body={h.s1CardABody} accent={UI.good} />
            <Card
              title={h.s1CardBTitle}
              body={fill(h.s1CardBBody, moneyArgs)}
              accent={UI.warn}
            />
            <Card title={h.s1CardCTitle} body={h.s1CardCBody} accent={UI.steel} />
          </div>
        </ManualSection>

        {/* 3.2 The money rule */}
        <ManualSection id="money" title={h.s2Title} open>
          <div
            style={{
              fontFamily: UI.mono,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: UI.good,
              margin: "6px 0 10px",
            }}
          >
            {d.common.onlyBreachedPay}
          </div>
          {/* THE THREE SENTENCES, SHORTENED (ADR-0098). Same order as the
              rules page, so a player who reads both hears one story. */}
          {/* all three go through fill(): sentence 2 carries the envelope and
              the settlement date now, and an unfilled template renders its
              raw {placeholders} straight onto the page */}
          <Body style={{ marginBottom: 10 }}>{fill(h.s2Body1, moneyArgs)}</Body>
          <Body style={{ marginBottom: 10 }}>{fill(h.s2Body2, moneyArgs)}</Body>
          <Body style={{ marginBottom: 12 }}>{fill(h.s2Body3, moneyArgs)}</Body>

          <div style={{ marginBottom: 12 }}>
            <Card title={d.education["breach-pays"].title} body={d.education["breach-pays"].body} />
          </div>

          {/* THE WHOLE PURSE, IN ONE LINE. Since 2026-08-16 the pool IS the
              season's money: one pot, split into a slice per keep, with
              no second envelope to account for. The rows below say what a
              slice is and how it pays. The full catalog (Valor, Gold, cash,
              trophies) lives on /s7/rules. */}
          <Panel style={{ borderColor: `${UI.good}33`, marginBottom: 12 }}>
            <div
              style={{
                fontFamily: UI.mono,
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: UI.good,
                marginBottom: 8,
              }}
            >
              {fill(d.rules.rewardsCashWhat, moneyArgs)}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Mapped, not indexed: this list has changed shape twice now
                  (ADR-0098, then the 2026-08-16 slice rewrite) and a hardcoded
                  row index silently mis-fills. */}
              {d.rules.rewardsCashRows.map((row) => fill(row, moneyArgs)).map((line) => (
                <li key={line} style={{ display: "flex", gap: 8, fontSize: 13.5, color: UI.muted, lineHeight: 1.65 }}>
                  <span aria-hidden style={{ color: UI.good, flex: "0 0 auto" }}>
                    +
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p style={{ margin: "10px 0 0", fontSize: 13 }}>
              <Link href="/s7/rules#rewards" style={{ color: UI.steel }}>
                {d.rules.rewardsHeading}
              </Link>
            </p>
          </Panel>

          <Panel style={{ borderColor: `${UI.warn}55`, background: `${UI.warn}0d` }}>
            <div
              style={{
                fontFamily: UI.mono,
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: UI.warn,
                marginBottom: 8,
              }}
            >
              {h.s2WarnLabel}
            </div>
            <p style={{ fontSize: 14, color: UI.text, lineHeight: 1.7, margin: 0 }}>{h.s2Warn}</p>
          </Panel>
        </ManualSection>

        {/* 3.3 Getting started */}
        <ManualSection id="start" title={h.s3Title}>
          <Body>{h.s3Intro}</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                n: 1,
                title: h.step1Title,
                body: h.step1Body,
                meta: h.step1Meta,
                cost: h.costFree,
                costColor: UI.good,
                action: { label: d.links.enlist, href: "/s7/join" },
              },
              {
                n: 2,
                title: h.step2Title,
                body: fill(h.step2Body, { tanks: tankCount }),
                meta: h.step2Meta,
                cost: h.costFree,
                costColor: UI.good,
                action: { label: d.links.hq, href: "/s7" },
              },
              {
                n: 3,
                title: h.step3Title,
                body: h.step3Body,
                meta: h.step3Meta,
                cost: h.costFree,
                costColor: UI.good,
                action: undefined as { label: string; href: string } | undefined,
              },
              {
                n: 4,
                title: h.step4Title,
                body: fill(h.step4Body, { games: liveGames }),
                meta: h.step4Meta,
                cost: h.costFree,
                costColor: UI.good,
                action: { label: d.links.play, href: "/s7/play" },
              },
              {
                n: 5,
                title: h.step5Title,
                body: h.step5Body,
                meta: h.step5Meta,
                cost: h.costPaid,
                costColor: UI.ember,
                note: h.step5Note,
                action: { label: d.links.map, href: "/s7" },
              },
            ].map((s) => (
              <Panel key={s.n} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  style={{
                    flex: "0 0 auto",
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: `1px solid ${UI.ember}55`,
                    background: `${UI.ember}18`,
                    color: UI.ember,
                    fontFamily: UI.mono,
                    fontWeight: 700,
                    fontSize: 15,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {s.n}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 15.5, fontWeight: 700, color: UI.text }}>{s.title}</span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontFamily: UI.mono,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: s.costColor,
                        border: `1px solid ${s.costColor}44`,
                        background: `${s.costColor}14`,
                        borderRadius: 999,
                        padding: "2px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.cost}
                    </span>
                  </div>
                  <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.7, margin: "0 0 8px" }}>
                    {s.body}
                  </p>
                  {"note" in s && s.note ? (
                    <p style={{ fontSize: 12.5, color: UI.faint, lineHeight: 1.6, margin: "0 0 8px" }}>
                      {s.note}
                    </p>
                  ) : null}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: UI.mono,
                        letterSpacing: "0.08em",
                        color: UI.faint,
                      }}
                    >
                      {s.meta}
                    </span>
                    {s.action ? (
                      <Link
                        href={s.action.href}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: UI.ember,
                          textDecoration: "none",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {s.action.label} →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </ManualSection>

        {/* 3.4 The crypto part */}
        <ManualSection id="crypto" title={h.s4Title}>
          <Body>{h.s4Intro}</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CRYPTO_KEYS.map((k) => {
              const e = EDUCATION_BY_KEY[k];
              if (!e) return null;
              return <Card key={k} title={d.education[k].title} body={d.education[k].body} />;
            })}
          </div>
        </ManualSection>

        {/* 3.5 Your HQ. s5Title/s5Body, NOT s7* (copy audit 2026-08-17): this
            drawer rendered the ARCADE strings, so the "Your HQ" nav chip
            jumped to a section headed "The arcade", the arcade appeared twice
            in the Field Manual, and the written HQ copy never rendered at
            all. The arcade drawer below keeps s6Title/s6Body. */}
        <ManualSection id="hq" title={h.s5Title}>
          <div style={{ marginBottom: 14 }}>
            <ArtBand src="/s7-art/hq/hangar.webp" alt="" height={170} />
          </div>
          <Body>{h.s5Body}</Body>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <Card
              title={h.s7TankTitle}
              body={fill(h.s7TankBody, { tanks: tankCount })}
              accent={UI.ember}
            />
            <Card title={h.s7CmdTitle} body={h.s7CmdBody} accent={UI.steel} />
          </div>

          <Panel style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: UI.text, marginBottom: 4 }}>
              {h.s7StatsTitle}
            </div>
            <p style={{ fontSize: 13, color: UI.faint, lineHeight: 1.6, margin: "0 0 12px" }}>
              {h.s7StatsIntro}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(92px, 128px) 1fr",
                rowGap: 1,
                border: `1px solid ${UI.border}`,
                borderRadius: 10,
                overflow: "hidden",
                background: UI.border,
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  padding: "7px 10px",
                  fontFamily: UI.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: UI.faint,
                }}
              >
                {h.colUpgrade}
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  padding: "7px 10px",
                  fontFamily: UI.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: UI.faint,
                }}
              >
                {h.colDoes}
              </div>
              {stats.map((s) => (
                <div key={s.name} style={{ display: "contents" }}>
                  <div
                    style={{
                      background: "#12161b",
                      padding: "10px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: UI.text,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 14 }}>
                      {s.icon}
                    </span>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{s.name}</span>
                  </div>
                  <div
                    style={{
                      background: "#12161b",
                      padding: "10px",
                      fontSize: 13,
                      color: UI.muted,
                      lineHeight: 1.55,
                    }}
                  >
                    {s.body}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            <Card title={h.s7CamoTitle} body={h.s7CamoBody} />
            <Card title={h.s7TrophyTitle} body={h.s7TrophyBody} />
            <Card title={h.s7GarageTitle} body={h.s7GarageBody} />
          </div>
        </ManualSection>

        {/* 3.6 The arcade */}
        <ManualSection id="arcade" title={h.s6Title}>
          <Body>{h.s6Body}</Body>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 10,
              marginBottom: 12,
            }}
          >
            {GAMES.map((g) => (
              <Panel key={g.key} style={{ borderColor: g.comingSoon ? UI.border : `${UI.ember}33` }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 800, color: UI.text }}>{g.name}</span>
                  {g.comingSoon ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: UI.mono,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: UI.faint,
                        border: `1px solid ${UI.border}`,
                        borderRadius: 999,
                        padding: "2px 7px",
                      }}
                    >
                      {h.s7Soon}
                    </span>
                  ) : null}
                </div>
                <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.65, margin: 0 }}>
                  {hooks[g.key] ?? ""}
                </p>
              </Panel>
            ))}
          </div>
          <Panel>
            <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.7, margin: 0 }}>
              {fill(h.s7Cap, { cap: GAME_DAILY_POINTS_CAP, perRun: POINTS_PER_RUN, attempts })}
            </p>
          </Panel>
        </ManualSection>

        {/* 3.7 The daily fight */}
        <ManualSection id="fight" title={h.s7Title}>
          <div
            style={{
              fontFamily: UI.mono,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: UI.ember,
              margin: "6px 0 10px",
            }}
          >
            {h.s7Free}
          </div>
          <Body style={{ marginBottom: 10 }}>{h.s7Body1}</Body>
          <Body style={{ marginBottom: 10 }}>{h.s7Body2}</Body>
          <Body style={{ margin: 0 }}>{h.s7Body3}</Body>
        </ManualSection>

        {/* 3.8 Safety */}
        <ManualSection id="safety" title={h.s8Title}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Card
              title={d.education["siwe-safety"].title}
              body={d.education["siwe-safety"].body}
              accent={UI.good}
            />
            <Card title={h.s8Point2Title} body={h.s8Point2Body} />
            <Card title={h.s8Point3Title} body={h.s8Point3Body} accent={UI.bad} />
            <Card title={h.s8Point4Title} body={h.s8Point4Body} accent={UI.bad} />
          </div>
        </ManualSection>
      </Section>

      {/* ── Call to action ───────────────────────────────────────────────── */}
      <section
        style={{
          background: `linear-gradient(160deg, ${UI.ember}22 0%, rgba(18,22,27,0.72) 55%)`,
          border: `1px solid ${UI.ember}55`,
          borderRadius: 16,
          padding: "26px 22px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: "clamp(21px, 5vw, 28px)", fontWeight: 800, color: UI.text, margin: "0 0 8px" }}>
          {h.ctaTitle}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: UI.muted,
            lineHeight: 1.7,
            margin: "0 auto 18px",
            maxWidth: 460,
          }}
        >
          {h.ctaBody}
        </p>
        <Link
          href="/s7/join"
          style={{
            display: "inline-block",
            background: UI.ember,
            color: "#0b0d10",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "0.04em",
            padding: "14px 30px",
            borderRadius: 12,
            textDecoration: "none",
            minHeight: 48,
            lineHeight: "20px",
          }}
        >
          {h.ctaButton}
        </Link>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 16,
            marginTop: 18,
          }}
        >
          <Link href="/s7" style={{ color: UI.steel, fontSize: 13.5, textDecoration: "none" }}>
            {h.ctaSecondary}
          </Link>
          <Link href="/s7/rules" style={{ color: UI.steel, fontSize: 13.5, textDecoration: "none" }}>
            {h.ctaTertiary}
          </Link>
        </div>
        <p style={{ fontSize: 12, color: UI.faint, margin: "18px 0 0", lineHeight: 1.6 }}>
          {h.footnote}
        </p>
      </section>

      <p style={{ textAlign: "center", fontSize: 13, color: UI.faint, marginTop: 26 }}>
        <Link href="/s7" style={{ color: UI.muted }}>
          {d.common.back}
        </Link>
        {" · "}
        <Link href="/s7/board" style={{ color: UI.muted }}>
          {d.links.board}
        </Link>
      </p>
      <section style={{ maxWidth: 760, margin: "26px auto 0", padding: "0 16px" }}>
        <h2 style={{ fontSize: 16, color: "#f0f0eb", letterSpacing: "0.08em" }}>DOMA GUIDES</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>
          {HELP_LINKS.map((l) => (
            <li key={l.label} style={{ background: "#12151d", border: "1px solid #242c3e", borderRadius: 10, padding: "10px 14px" }}>
              <a href={l.href} target="_blank" rel="noreferrer" style={{ color: "#7dd3fc", fontSize: 14, fontWeight: 700 }}>
                {l.label}
              </a>
              <div style={{ fontSize: 12, color: "#8a93a2", marginTop: 2 }}>{l.blurb}</div>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
