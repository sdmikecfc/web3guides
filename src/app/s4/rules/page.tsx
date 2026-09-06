/**
 * Launch Wars Season 4, THE RULES (web3guides.com/s4/rules).
 *
 * The one link that answers every "how does this work" question: the game in
 * one line, the pool math, teams, the three Bounty sources, Gold, the agent
 * closet, the daily battle, duels, fair play, and the full FAQ.
 *
 * Server component on the neutral /s4 backbone. Every player-visible theme
 * word (Bounty, Gold, contract, team names) comes from the season snapshot's
 * merged theme (lib/s4/data.ts), same as the board; nothing themed is
 * hardcoded beyond the Discord command names and channel names, which the
 * landing also carries. The live pool line renders through the shared
 * PoolBanner so this page never does its own dollar math.
 *
 * i18n (Phase 1): STATIC copy is looked up from the s4_lang dictionary
 * (lib/s4/i18n + strings) via getLocale(); theme words are threaded through
 * `words()` so Bounty/Gold/contract/team stay live and English. Live/data copy
 * (the pool line, the metadata) is unchanged. No cookie == English, verbatim.
 *
 * Copy rules: no em-dashes, never "win $500", domains celebrated never
 * mocked, short plain sentences, currencies always Bounty and Gold.
 */
import Link from "next/link";
import { getSeasonSnapshot, poolLine } from "@/lib/s4/data";
import { DEFAULT_THEME } from "@/lib/s4/theme";
import {
  GAME_DAILY_POINTS_CAP,
  HOLD_RATE_PER_USD_DAY,
  SOFT_KNEE_USD,
  SOFT_RATE_FACTOR,
  HOLD_CAP_USD,
  HOLD_CAP_PER_DOMAIN,
  HOLD_CAP_MAX,
  holdBaseDaily,
  TIER_NAMES,
  TIER_STEP_PCT,
  TIER_MAX,
} from "@/lib/s4/games";
import { getLocale, dict } from "@/lib/s4/i18n";
import { words } from "@/lib/s4/strings";
import { Eyebrow, PageShell, Panel, PoolBanner, UI } from "../_components/ui";
import { LanguageSwitcher } from "../_components/LanguageSwitcher";

// ISR (see /s4/page.tsx): cached + prefetchable, refreshed every 60s.
export const revalidate = 60;

export const metadata = {
  title: `Rules · ${DEFAULT_THEME.seasonName}`,
  description:
    "Every rule of the season on one page: the pool, Bounty, Gold, teams, the daily battle, and fair play.",
};

const DISCORD_URL = "https://discord.gg/doma";

// The S4 presentation palette (same hexes the landing and arcade use).
const GOLD = "#f0b340";
const VIOLET = "#c44dff";
const ICE = "#4dd8e6";
const CRIMSON = "#e33d4e";
const GREEN = "#3de3a4";

// Sticky table of contents on desktop, a wrap of 44px chips on mobile.
const RULES_CSS = `
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}
.s4rGrid { display: block; }
.s4rBody { min-width: 0; }
.s4rSection { scroll-margin-top: 22px; }
.s4rToc { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 34px; }
.s4rToc a {
  display: inline-flex; align-items: center; min-height: 44px; box-sizing: border-box;
  padding: 10px 14px; border-radius: 9px;
  border: 1px solid ${UI.text}14; background: ${UI.text}0a;
  color: ${UI.muted}; text-decoration: none;
  font-family: ${UI.mono}; font-size: 11px; letter-spacing: 0.13em; text-transform: uppercase;
}
.s4rToc a:hover { color: ${UI.text}; border-color: ${GOLD}55; }
.s4rTocNo { color: ${GOLD}; margin-right: 8px; font-variant-numeric: tabular-nums; }
@media (min-width: 980px) {
  .s4rGrid { display: grid; grid-template-columns: 196px minmax(0, 1fr); gap: 36px; align-items: start; }
  .s4rToc {
    position: sticky; top: 28px; flex-direction: column; flex-wrap: nowrap; gap: 2px;
    margin: 0; border-left: 1px solid ${UI.border}; padding-left: 4px;
  }
  .s4rToc a { min-height: 0; padding: 8px 11px; border: 0; background: transparent; border-radius: 7px; }
  .s4rToc a:hover { background: ${UI.text}0d; }
}
`;

// ── local atoms (server-safe, tokens from ui.tsx) ───────────────────────────

function Kicker({ no, color, children }: { no: string; color: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: UI.mono,
        fontSize: 11,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color,
        marginBottom: 8,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {no} · {children}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "clamp(21px, 4.6vw, 28px)",
        fontWeight: 800,
        color: UI.text,
        margin: "0 0 14px",
        lineHeight: 1.2,
      }}
    >
      {children}
    </h2>
  );
}

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 14.5, color: UI.muted, lineHeight: 1.7, margin: "0 0 12px", ...style }}>
      {children}
    </p>
  );
}

function Bullets({ items, color }: { items: React.ReactNode[]; color: string }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 10, fontSize: 14, color: UI.muted, lineHeight: 1.65 }}>
          <span aria-hidden="true" style={{ color, flexShrink: 0, marginTop: 1 }}>
            ▸
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Cmd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: UI.mono,
        fontSize: 12.5,
        color: UI.text,
        background: `${UI.text}0f`,
        border: `1px solid ${UI.border}`,
        borderRadius: 6,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function RateChip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: UI.mono,
        fontSize: 12.5,
        color,
        background: `${color}12`,
        border: `1px solid ${color}3a`,
        borderRadius: 8,
        padding: "7px 11px",
        display: "inline-block",
        marginBottom: 12,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </div>
  );
}

// The breadth-tier ladder, rendered from the games.ts constants so it stays in
// sync with the engine. Tier names stay English in every locale (per the S4
// translation rules), so this needs no dict entries. Makes tiers unmissable
// (Mike: people did not know tiers existed because nothing said so).
function TierLadder() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
      {TIER_NAMES.map((name, i) => {
        const mult = (1 + (i * TIER_STEP_PCT) / 100).toFixed(2);
        const count = i >= TIER_MAX - 1 ? `${i + 1}+` : `${i + 1}`;
        return (
          <div
            key={name}
            style={{
              flex: "1 1 84px",
              minWidth: 0,
              textAlign: "center",
              background: UI.panel,
              border: `1px solid ${UI.border}`,
              borderTop: `2px solid ${GOLD}`,
              borderRadius: 9,
              padding: "8px 5px",
            }}
          >
            <div
              style={{
                fontFamily: UI.mono,
                fontSize: 10,
                letterSpacing: "0.1em",
                color: UI.faint,
                marginBottom: 3,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: UI.text,
                marginBottom: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
              ×{mult}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Transparent hold-earn table (Mike: players should see exactly what they earn).
// Every Daily-base number comes from holdBaseDaily so it never drifts from the
// engine. It uses the BASE ceiling (domainsEntered = 0, i.e. $100), so the $100
// and $10,000 rows show the capped base; the body explains how spreading raises
// the ceiling to $150. Non-integer results (437.5) show as "~437" to match copy.
function HoldTable({
  heldLabel,
  dailyLabel,
  caption,
  cappedLabel,
}: {
  heldLabel: string;
  dailyLabel: string;
  caption: string;
  cappedLabel: string;
}) {
  const rows = [5, 25, 100, 10000];
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : `~${Math.floor(v)}`);
  return (
    <div style={{ margin: "0 0 14px" }}>
      <div style={{ border: `1px solid ${UI.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            fontFamily: UI.mono,
            fontSize: 10.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: UI.faint,
            background: `${UI.text}08`,
            borderBottom: `1px solid ${UI.border}`,
          }}
        >
          <div style={{ padding: "8px 12px" }}>{heldLabel}</div>
          <div style={{ padding: "8px 12px", textAlign: "right" }}>{dailyLabel}</div>
        </div>
        {rows.map((usd, i) => {
          const capped = usd > HOLD_CAP_USD;
          return (
            <div
              key={usd}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                fontSize: 13.5,
                fontVariantNumeric: "tabular-nums",
                borderTop: i === 0 ? "none" : `1px solid ${UI.border}`,
              }}
            >
              <div style={{ padding: "8px 12px", color: UI.text, fontWeight: 600 }}>
                ${usd.toLocaleString("en-US")}
              </div>
              <div style={{ padding: "8px 12px", textAlign: "right", color: GOLD, fontWeight: 700 }}>
                {fmt(holdBaseDaily(usd))} 💰
                {capped && (
                  <span style={{ color: UI.faint, fontWeight: 400, fontSize: 11 }}> ({cappedLabel})</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: UI.faint, lineHeight: 1.5, margin: "6px 0 0" }}>{caption}</p>
    </div>
  );
}

function Section({
  id,
  no,
  kicker,
  color,
  title,
  children,
}: {
  id: string;
  no: string;
  kicker: React.ReactNode;
  color: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="s4rSection" style={{ marginBottom: 46 }}>
      <Kicker no={no} color={color}>
        {kicker}
      </Kicker>
      <H2>{title}</H2>
      {children}
    </section>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function S4Rules() {
  const snap = await getSeasonSnapshot();
  const t = snap.theme;
  const PLAY_CURRENCY = t.playCurrency; // Gold (theme word, stays English)

  const d = dict(getLocale());
  const R = d.rules;
  const W = words(t, GAME_DAILY_POINTS_CAP);

  const toc: Array<{ id: string; no: string; label: React.ReactNode }> = [
    { id: "the-game", no: "01", label: R.tocGame },
    { id: "the-prize", no: "02", label: R.tocPrize },
    { id: "teams", no: "03", label: t.team.plural },
    { id: "earning", no: "04", label: R.tocEarning(W) },
    { id: "gold", no: "05", label: PLAY_CURRENCY },
    { id: "your-agent", no: "06", label: R.tocAgent(W) },
    { id: "daily-battle", no: "07", label: R.tocDaily },
    { id: "duels", no: "08", label: R.tocDuels },
    { id: "fair-play", no: "09", label: R.tocFair },
    { id: "faq", no: "10", label: R.tocFaq },
  ];

  const faq: Array<{ q: React.ReactNode; a: React.ReactNode }> = [
    { q: R.faq1q(W), a: R.faq1a(W) },
    { q: R.faq2q(W), a: R.faq2a(W) },
    { q: R.faq3q(W), a: R.faq3a(W) },
    {
      q: R.faq4q(W),
      a: (
        <>
          {R.faq4aPre(W)}
          <Cmd>/assassin me</Cmd>
          {R.faq4aPost}
        </>
      ),
    },
    { q: R.faq5q(W), a: R.faq5a(W) },
    {
      q: R.faq6q(W),
      a: (
        <>
          {R.faq6aPre}
          <Cmd>/assassin team</Cmd>
          {R.faq6aPost(W)}
        </>
      ),
    },
    { q: R.faq7q(W), a: R.faq7a(W) },
    {
      q: R.faq8q(W),
      a: (
        <>
          <Cmd>/assassin me</Cmd>
          {R.faq8aSeg2(W)}
          <Link href="/s4/board" style={{ color: ICE }}>
            {d.common.statusBoard}
          </Link>
          {R.faq8aSeg3(W)}
        </>
      ),
    },
  ];

  const inlineLink: React.CSSProperties = {
    color: UI.text,
    fontWeight: 700,
    display: "inline-block",
    padding: "12px 4px",
    margin: "-12px -4px",
  };

  return (
    <PageShell>
      <style dangerouslySetInnerHTML={{ __html: RULES_CSS }} />

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
        <LanguageSwitcher />
      </div>

      <header id="top" style={{ textAlign: "center", marginBottom: 30 }}>
        <Eyebrow>{t.seasonName}</Eyebrow>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 800, margin: "0 0 8px", color: UI.text }}>
          {R.h1}
        </h1>
        <p style={{ fontSize: 14.5, color: UI.muted, margin: "0 auto", maxWidth: 560, lineHeight: 1.65 }}>
          {R.headerIntro}
        </p>
      </header>

      <div className="s4rGrid">
        <nav className="s4rToc" aria-label="On this page">
          {toc.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              <span className="s4rTocNo">{item.no}</span>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="s4rBody">
          {/* ── 01 · The game ──────────────────────────────────────────────── */}
          <Section id="the-game" no="01" kicker={R.s1Kicker} color={GOLD} title={R.s1Title}>
            <Panel style={{ borderLeft: `3px solid ${GOLD}`, marginBottom: 14 }}>
              <p style={{ fontSize: 16.5, color: UI.text, fontWeight: 600, lineHeight: 1.65, margin: 0 }}>
                {R.s1Panel(W)}
              </p>
            </Panel>
            <P>{R.s1P(W)}</P>
            <Panel>
              <div
                style={{
                  fontFamily: UI.mono,
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: UI.faint,
                  marginBottom: 10,
                }}
              >
                {R.s1NewHere}
              </div>
              <Bullets
                color={GOLD}
                items={[
                  <>
                    {R.s1Bullet1Pre}
                    <a href={DISCORD_URL} style={{ ...inlineLink, color: GOLD }}>
                      Discord
                    </a>
                    {R.s1Bullet1Post(W)}
                  </>,
                  <>
                    {R.s1Bullet2Pre(W)}
                    <Link href="/s4/board" style={{ ...inlineLink, color: GOLD }}>
                      {d.common.statusBoard}
                    </Link>
                    {R.s1Bullet2Post(W)}
                  </>,
                  <>
                    {R.s1Bullet3Pre}
                    <Link href="/s4/link" style={{ ...inlineLink, color: GOLD }}>
                      {d.common.linkDiscord}
                    </Link>
                    {R.s1Bullet3Post}
                  </>,
                ]}
              />
            </Panel>
          </Section>

          {/* ── 02 · The prize ─────────────────────────────────────────────── */}
          <Section id="the-prize" no="02" kicker={R.s2Kicker} color={GREEN} title={R.s2Title}>
            {/* Live line only once targets are seeded (board's snap.empty gate):
                the empty-snapshot perBond math reads wrong pre-season. */}
            {!snap.empty && (
              <div style={{ marginBottom: 14 }}>
                <PoolBanner line={poolLine(snap)} />
              </div>
            )}
            <P>
              <b style={{ color: UI.text }}>{R.s2Week1Bold}</b>
              {R.s2Week1Rest(W)}
            </P>
            <P>{R.s2P2(W)}</P>
            <P style={{ marginBottom: 10 }}>{R.s2P3(W)}</P>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[
                { label: "1st", pct: "50%", flex: 5, color: GOLD },
                { label: "2nd", pct: "30%", flex: 3, color: UI.muted },
                { label: "3rd", pct: "20%", flex: 2, color: "#c9855a" },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    flex: s.flex,
                    minWidth: 0,
                    textAlign: "center",
                    background: UI.panel,
                    border: `1px solid ${UI.border}`,
                    borderTop: `2px solid ${s.color}`,
                    borderRadius: 10,
                    padding: "12px 6px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: UI.mono,
                      fontSize: 10,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: UI.faint,
                      marginBottom: 4,
                    }}
                  >
                    {s.label}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>
                    {s.pct}
                  </div>
                </div>
              ))}
            </div>
            <P>{R.s2P4(W)}</P>
            <P style={{ margin: 0 }}>
              {R.s2P5Pre}
              <Cmd>/assassin me</Cmd>
              {R.s2P5Post}
            </P>
          </Section>

          {/* ── 03 · Teams ─────────────────────────────────────────────────── */}
          <Section id="teams" no="03" kicker={R.s3Kicker} color={CRIMSON} title={R.s3Title(W)}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 14 }}>
              {t.teams.map((team) => (
                <Panel
                  key={team.key}
                  style={{
                    borderColor: `${team.accent}44`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 16px",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 10, height: 10, borderRadius: 999, background: team.accent, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 700, color: team.accent }}>{team.name}</span>
                </Panel>
              ))}
            </div>
            <Bullets
              color={CRIMSON}
              items={[
                R.s3Bullet1(W),
                <>
                  {R.s3Bullet2Pre}
                  <Cmd>/assassin team</Cmd>
                  {R.s3Bullet2Post(W)}
                </>,
                R.s3Bullet3(W),
              ]}
            />
          </Section>

          {/* ── 04 · Earning Bounty ────────────────────────────────────────── */}
          <Section id="earning" no="04" kicker={R.s4Kicker} color={GOLD} title={R.s4Title(W)}>
            <P>{R.s4Intro(W)}</P>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
              <Panel style={{ borderTop: `2px solid ${GOLD}66` }}>
                <div style={{ fontFamily: UI.mono, fontSize: 11, letterSpacing: "0.18em", color: GOLD, marginBottom: 10 }}>
                  {R.s4HoldLabel}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: UI.text, marginBottom: 10 }}>
                  {R.s4HoldTitle}
                </div>
                <RateChip color={GOLD}>
                  {HOLD_RATE_PER_USD_DAY * 5} 💰 / $5 up to ${SOFT_KNEE_USD}, then 1/{1 / SOFT_RATE_FACTOR} rate; ceiling ${HOLD_CAP_USD}, +${HOLD_CAP_PER_DOMAIN} per contract to ${HOLD_CAP_MAX}
                </RateChip>
                <P style={{ fontSize: 14, marginBottom: 12 }}>{R.s4HoldBody(W)}</P>
                <HoldTable
                  heldLabel={R.s4HoldTableHeld}
                  dailyLabel={R.s4HoldTableDaily}
                  caption={R.s4HoldTableCaption}
                  cappedLabel={R.s4HoldTableCapped}
                />
                <P style={{ fontSize: 14, marginBottom: 12 }}>{R.s4HoldFresh(W)}</P>
                <div style={{ fontFamily: UI.mono, fontSize: 11, letterSpacing: "0.18em", color: GOLD, margin: "0 0 8px" }}>
                  {R.s4TiersLabel(W)}
                </div>
                <P style={{ fontSize: 14, margin: "0 0 12px" }}>{R.s4TiersBody(W)}</P>
                <TierLadder />
              </Panel>
              <Panel style={{ borderTop: `2px solid ${ICE}66` }}>
                <div style={{ fontFamily: UI.mono, fontSize: 11, letterSpacing: "0.18em", color: ICE, marginBottom: 10 }}>
                  {R.s4PostLabel}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: UI.text, marginBottom: 10 }}>
                  {R.s4PostTitle}
                </div>
                <RateChip color={ICE}>30 to 170 💰 / post · season cap 600</RateChip>
                <Bullets
                  color={ICE}
                  items={[
                    <>
                      {R.s4PostBullet1Pre}
                      <b style={{ color: UI.text }}>#content-share</b>
                      {R.s4PostBullet1Post}
                    </>,
                    R.s4PostBullet2(W),
                    R.s4PostBullet3(W),
                  ]}
                />
              </Panel>
              <Panel style={{ borderTop: `2px solid ${VIOLET}66` }}>
                <div style={{ fontFamily: UI.mono, fontSize: 11, letterSpacing: "0.18em", color: VIOLET, marginBottom: 10 }}>
                  {R.s4PlayLabel}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: UI.text, marginBottom: 10 }}>
                  {R.s4PlayTitle}
                </div>
                <RateChip color={VIOLET}>{GAME_DAILY_POINTS_CAP} 💰 / day cap</RateChip>
                <P style={{ fontSize: 14, marginBottom: 12 }}>{R.s4PlayBody(W)}</P>
                <Link href="/s4/play" style={{ ...inlineLink, color: VIOLET, fontSize: 13.5 }}>
                  {d.common.openArcade} →
                </Link>
              </Panel>
            </div>
          </Section>

          {/* ── 05 · Gold ──────────────────────────────────────────────────── */}
          <Section id="gold" no="05" kicker={R.s5Kicker} color={VIOLET} title={R.s5Title(W)}>
            <P>{R.s5P1(W)}</P>
            <Panel style={{ borderColor: `${VIOLET}44` }}>
              <p style={{ fontSize: 14.5, color: UI.text, fontWeight: 600, lineHeight: 1.65, margin: 0 }}>
                {R.s5Panel(W)}
              </p>
            </Panel>
          </Section>

          {/* ── 06 · Your agent ────────────────────────────────────────────── */}
          <Section id="your-agent" no="06" kicker={R.s6Kicker} color={ICE} title={R.s6Title}>
            <P>{R.s6P(W)}</P>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[GOLD, VIOLET, ICE].map((accent, i) => (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    width: 124,
                    height: 176,
                    borderRadius: 12,
                    border: `1px solid ${UI.border}`,
                    background: `radial-gradient(120% 100% at 50% 100%, ${accent}1c 0%, ${UI.panel} 64%)`,
                    overflow: "hidden",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/s4-art/cast/gallery-${i + 1}.png`}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      objectPosition: "bottom center",
                      display: "block",
                    }}
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* ── 07 · Daily battle ──────────────────────────────────────────── */}
          <Section id="daily-battle" no="07" kicker={R.s7Kicker} color={CRIMSON} title={R.s7Title}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <RateChip color={CRIMSON}>OPENS 09:00 UTC</RateChip>
              <RateChip color={CRIMSON}>RESOLVES 14:00 UTC</RateChip>
              <RateChip color={CRIMSON}>#mini-games</RateChip>
            </div>
            <Bullets
              color={CRIMSON}
              items={[R.s7Bullet1(W), R.s7Bullet2(W), R.s7Bullet3, R.s7Bullet4(W)]}
            />
          </Section>

          {/* ── 08 · Duels and bets ────────────────────────────────────────── */}
          <Section id="duels" no="08" kicker={R.s8Kicker} color={GOLD} title={R.s8Title}>
            <Bullets
              color={GOLD}
              items={[
                <>
                  {R.s8Bullet1Pre(W)}
                  <Cmd>/assassin duel</Cmd>
                  {R.s8Bullet1Post(W)}
                </>,
                <>
                  {R.s8Bullet2Pre}
                  <Cmd>/assassin bet</Cmd>
                  {R.s8Bullet2Post}
                </>,
                R.s8Bullet3(W),
              ]}
            />
          </Section>

          {/* ── 09 · Fair play ─────────────────────────────────────────────── */}
          <Section id="fair-play" no="09" kicker={R.s9Kicker} color={GREEN} title={R.s9Title}>
            <Bullets
              color={GREEN}
              items={[R.s9Bullet1(W), R.s9Bullet2, R.s9Bullet3, R.s9Bullet4]}
            />
            <P style={{ marginTop: 12, marginBottom: 0 }}>{R.s9P}</P>
          </Section>

          {/* ── 10 · FAQ ───────────────────────────────────────────────────── */}
          <Section id="faq" no="10" kicker={R.s10Kicker} color={ICE} title={R.s10Title}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {faq.map((f, i) => (
                <Panel key={i}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: UI.text, marginBottom: 6 }}>{f.q}</div>
                  <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.65 }}>{f.a}</div>
                </Panel>
              ))}
            </div>
          </Section>

          <p style={{ textAlign: "center", fontSize: 13, color: UI.faint, margin: 0 }}>
            <Link href="/s4" style={{ ...inlineLink, color: UI.muted, fontWeight: 400 }}>
              {R.footSeasonHome}
            </Link>
            {" · "}
            <Link href="/s4/board" style={{ ...inlineLink, color: UI.muted, fontWeight: 400 }}>
              {d.common.statusBoard}
            </Link>
            {" · "}
            <Link href="/s4/play" style={{ ...inlineLink, color: UI.muted, fontWeight: 400 }}>
              {R.footArcade}
            </Link>
            {" · "}
            <a href="#top" style={{ ...inlineLink, color: UI.muted, fontWeight: 400 }}>
              {R.footBackToTop}
            </a>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
