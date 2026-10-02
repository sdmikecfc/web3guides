/**
 * Launch Wars Season 4 — THE HIT LIST landing (web3guides.com/s4).
 *
 * The premium themed landing: the HitListHero (ported from Mike's Claude
 * Design export, see _hero/HitListHero.tsx) over the fold with the LIVE
 * bounty ledger, then the explainer sections in the site's dark chrome.
 * Rendered by src/app/s4/page.tsx when SHOW_FULL_LANDING flips true at
 * go-live (CMO art gate); until then the sealed-dossier teaser serves.
 *
 * Server component. Live numbers come from the one season snapshot
 * (lib/s4/data.ts) and render honestly with zero data: 0 of 5 contracts,
 * $0 of $500 unlocked, countdown hidden when no season dates exist.
 * Every theme word (Bounty, Gold, contract, CLOSED, team names) comes from
 * DEFAULT_THEME — no themed word is hardcoded here (the S3 leakage lesson).
 *
 * i18n (Phase 1): STATIC copy is looked up from the s4_lang dictionary
 * (lib/s4/i18n + strings) via getLocale(); theme words are threaded in through
 * `words()` so Bounty/Gold/contract/team stay live and English. Data-derived
 * copy (THEME.pitch, poolLine) is left exactly as-is. No cookie == English.
 *
 * Copy rules: no em-dashes, never "win $500", domains celebrated never
 * mocked, plain words.
 */
import Link from "next/link";
import { getSeasonSnapshot, poolLine } from "@/lib/s4/data";
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { GAME_DAILY_POINTS_CAP } from "@/lib/s4/games";
import { getLocale, dict } from "@/lib/s4/i18n";
import { words } from "@/lib/s4/strings";
import { LanguageSwitcher } from "./_components/LanguageSwitcher";
import {
  ArtSlot,
  HitListHero,
  CRIMSON,
  TEAM_GOLD,
  TEAM_VIOLET,
  TEAM_ICE,
} from "./_hero/HitListHero";


const THEME = DEFAULT_THEME;
const POINTS = THEME.points; // Bounty
const PLAY_CURRENCY = THEME.playCurrency; // Gold

// ── landing tokens (the S4 dark chrome, matches the board/map surfaces) ─────
const T = {
  bg: "#07080c",
  panel: "rgba(15,16,22,0.72)",
  border: "#1d1f2a",
  text: "#e8ecf5",
  muted: "#aeb6c8",
  faint: "#8b95ad",
  sans: "'Aktiv Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, Menlo, Consolas, monospace",
} as const;

const sectionStyle: React.CSSProperties = { maxWidth: 980, margin: "0 auto", padding: "0 20px 72px" };
const h2Style: React.CSSProperties = {
  fontSize: "clamp(24px, 5vw, 34px)",
  fontWeight: 800,
  color: T.text,
  margin: "0 0 16px",
  lineHeight: 1.15,
};

function Eyebrow({ children, color = TEAM_GOLD }: { children: React.ReactNode; color?: string }) {
  return (
    <p
      style={{
        fontFamily: T.mono,
        letterSpacing: "0.32em",
        fontSize: 11,
        color,
        margin: "0 0 10px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </p>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: "20px 22px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── presentation-only section data (translatable text lives in the dict) ─────

const STEP_ACCENTS = [TEAM_GOLD, TEAM_VIOLET, TEAM_ICE];

// Game tiles: href + English game name (proper noun, kept) + accent. The
// description line for each comes from the dict by index.
const GAME_META: Array<{ href: string; title: string; accent: string }> = [
  { href: "/s4/games/riviera", title: "🤠 Stampede", accent: TEAM_GOLD },
  { href: "/s4/games/highnoon", title: "🌵 High Noon", accent: TEAM_GOLD },
  { href: "/s4/games/getaway", title: "🚗 The Getaway", accent: CRIMSON },
  { href: "/s4/games/extraction", title: "🏍️ Extraction", accent: TEAM_VIOLET },
];

// two per era, interleaved frontier / singularity / agency so the strip reads
// as a spread (gallery-1..6 are placed as those era cells)
const GALLERY_ACCENTS = [TEAM_GOLD, TEAM_VIOLET, TEAM_ICE, TEAM_GOLD, TEAM_VIOLET, TEAM_ICE];

// ── page ─────────────────────────────────────────────────────────────────────

export default async function S4Landing() {
  const snap = await getSeasonSnapshot();
  const d = dict(getLocale());
  const L = d.landing;
  const W = words(THEME, GAME_DAILY_POINTS_CAP);

  // Resolved (plain-string) hero copy for the client HitListHero.
  const heroStrings = {
    tagline1a: d.hero.tagline1a,
    tagline1b: d.hero.tagline1b,
    taglineSub: d.hero.taglineSub(W),
    ledgerPoolLabel: d.hero.ledgerPoolLabel,
    ledgerOf: d.hero.ledgerOf,
    cdBriefingLabel: d.hero.cdBriefingLabel,
    cdEndLabel: d.hero.cdEndLabel,
    cdDoneLabel: d.hero.cdDoneLabel,
    cdDoneValue: d.hero.cdDoneValue,
    ctaJoin: d.hero.ctaJoin,
    ctaPlay: d.hero.ctaPlay,
    ctaView: d.hero.ctaView,
  };

  return (
    <main style={{ background: T.bg, color: T.text, fontFamily: T.sans, minHeight: "100dvh" }}>
      {/* The old sticky sub-bar (logo + Sign up + Arcade + Language) was removed
          2026-07-15: the global S4TopNav (from the /s4 layout) is now the one
          persistent bar; the sub-bar sat behind it and poked a gold button out
          underneath. Sign up lives in the hero CTA below; language moved to the
          footer. The hero bleeds up behind the translucent nav (premium look). */}
      <HitListHero
        bonded={snap.totals.bonded}
        totalTargets={snap.totals.total || 5}
        unlockedUsd={snap.pool.unlocked}
        fullUsd={snap.pool.full}
        launchAt={snap.season.launchAt}
        endAt={snap.season.endAt}
        serverNowMs={snap.nowMs}
        startUrl="/s4/join"
        strings={heroStrings}
      />

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section style={{ ...sectionStyle, paddingTop: 72 }}>
        <Eyebrow>{L.howItWorksEyebrow}</Eyebrow>
        <h2 style={h2Style}>{L.howItWorksTitle}</h2>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
          {L.steps.map((s, i) => (
            <Panel key={i} style={{ borderTop: `2px solid ${STEP_ACCENTS[i]}66` }}>
              <div
                style={{
                  fontFamily: T.mono,
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  color: STEP_ACCENTS[i],
                  marginBottom: 10,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                STEP {i + 1}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 8 }}>{s.title}</div>
              <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.65, margin: 0 }}>{s.body(W)}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* ── The prize ─────────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <Eyebrow color="#3de3a4">{L.prizeEyebrow}</Eyebrow>
        <h2 style={h2Style}>{L.prizeTitle}</h2>
        <Panel style={{ borderColor: "#3de3a433", maxWidth: 760 }}>
          <p style={{ fontSize: 15, color: T.muted, lineHeight: 1.7, margin: 0 }}>{THEME.pitch}</p>
          <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, margin: "10px 0 0" }}>
            <b style={{ color: "#e8ecf5" }}>{L.prizeWeek1Bold}</b>{L.prizeWeek1Rest}
          </p>
          <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, margin: "10px 0 0" }}>
            <b style={{ color: TEAM_GOLD }}>{L.tiersLabel}</b>{L.tiersRest(W)}
          </p>
          <p
            style={{
              fontFamily: T.mono,
              fontSize: 12.5,
              color: "#3de3a4",
              lineHeight: 1.6,
              margin: "12px 0 0",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {poolLine(snap)}
          </p>
        </Panel>
      </section>

      {/* ── The two currencies ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <Eyebrow color={TEAM_GOLD}>{L.currenciesEyebrow}</Eyebrow>
        <h2 style={h2Style}>{L.currenciesTitle(W)}</h2>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", maxWidth: 760 }}>
          <Panel style={{ borderColor: `${TEAM_GOLD}44` }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: TEAM_GOLD, marginBottom: 6 }}>💰 {POINTS}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>{L.bountyCardSub}</div>
            <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.65, margin: 0 }}>{L.bountyCardBody(W)}</p>
          </Panel>
          <Panel style={{ borderColor: `${TEAM_VIOLET}44` }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: TEAM_VIOLET, marginBottom: 6 }}>🔶 {PLAY_CURRENCY}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>{L.goldCardSub}</div>
            <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.65, margin: 0 }}>{L.goldCardBody(W)}</p>
          </Panel>
        </div>
      </section>

      {/* ── The teams ─────────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <Eyebrow color={CRIMSON}>{L.teamsEyebrow}</Eyebrow>
        <h2 style={h2Style}>{L.teamsTitle}</h2>
        <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.7, maxWidth: 760, margin: "-4px 0 22px" }}>
          {L.teamsIntroPre}
          <span style={{ color: T.text, fontWeight: 700 }}>/assassin team</span>
          {L.teamsIntroPost}
        </p>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
          {THEME.teams.map((team, i) => {
            const card = L.teamCards[i];
            return (
              <Panel key={team.key} style={{ borderColor: `${team.accent}44`, padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    position: "relative",
                    height: 240,
                    background: `radial-gradient(120% 90% at 50% 100%, ${team.accent}24 0%, rgba(7,8,12,0) 62%)`,
                  }}
                >
                  <ArtSlot src={`/s4-art/hero/team-${team.key}.png`} accent={team.accent} />
                </div>
                <div style={{ padding: "16px 20px 20px" }}>
                  <div
                    style={{
                      fontFamily: T.mono,
                      fontSize: 9,
                      letterSpacing: "0.2em",
                      color: team.accent,
                      marginBottom: 8,
                    }}
                  >
                    {card.era}
                  </div>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: team.accent, marginBottom: 7 }}>
                    {team.name}
                  </div>
                  <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6, margin: 0 }}>{card.line}</p>
                </div>
              </Panel>
            );
          })}
        </div>
      </section>

      {/* ── Your agent ────────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <Eyebrow color={TEAM_VIOLET}>{L.agentEyebrow(W)}</Eyebrow>
        <h2 style={h2Style}>{L.agentTitle}</h2>
        <p style={{ fontSize: 15, color: T.muted, lineHeight: 1.7, maxWidth: 760, margin: "0 0 22px" }}>
          {L.agentBody(W)}
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 8,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {GALLERY_ACCENTS.map((accent, i) => (
            <div
              key={i}
              style={{
                position: "relative",
                flex: "0 0 auto",
                width: 152,
                height: 214,
                borderRadius: 14,
                border: `1px solid ${T.border}`,
                background: `radial-gradient(120% 100% at 50% 100%, ${accent}1c 0%, ${T.panel} 64%)`,
                overflow: "hidden",
              }}
            >
              <ArtSlot src={`/s4-art/cast/gallery-${i + 1}.png`} accent={accent} />
            </div>
          ))}
        </div>
      </section>

      {/* ── The arcade ────────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <Eyebrow>{L.arcadeEyebrow}</Eyebrow>
        <h2 style={h2Style}>{L.arcadeTitle}</h2>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {GAME_META.map((g, i) => (
            <Link
              key={g.href}
              href={g.href}
              style={{
                display: "block",
                background: T.panel,
                border: `1px solid ${T.border}`,
                borderRadius: 16,
                padding: "18px 20px",
                textDecoration: "none",
                borderBottom: `2px solid ${g.accent}55`,
              }}
            >
              <div style={{ fontSize: 16.5, fontWeight: 700, color: T.text, marginBottom: 8 }}>{g.title}</div>
              <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, margin: "0 0 12px" }}>{L.gameLines[i]}</p>
              <span style={{ fontSize: 13, fontWeight: 700, color: g.accent }}>{L.playNow} →</span>
            </Link>
          ))}
        </div>
        <p style={{ fontSize: 13.5, color: T.faint, lineHeight: 1.65, marginTop: 16, maxWidth: 760 }}>
          {L.arcadeCaption(W)}
        </p>
        {/* In-context funnel to the arcade hub (the game shelf). The tiles above
            deep-link to single games; this opens the whole library. */}
        <div style={{ marginTop: 20 }}>
          <Link
            href="/s4/play"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              background: TEAM_GOLD,
              color: T.bg,
              fontWeight: 800,
              fontSize: 15,
              padding: "13px 26px",
              borderRadius: 12,
              textDecoration: "none",
            }}
          >
            <span aria-hidden="true">▶</span> {d.common.openArcade}
          </Link>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <Eyebrow color={TEAM_ICE}>{L.faqEyebrow}</Eyebrow>
        <h2 style={h2Style}>{L.faqTitle}</h2>
        <p style={{ fontSize: 14.5, margin: "-6px 0 20px" }}>
          {/* inline padding + negative margin: a 44px tap target with zero layout shift */}
          <Link
            href="/s4/rules"
            style={{
              color: TEAM_ICE,
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-block",
              padding: "13px 6px",
              margin: "-13px -6px",
            }}
          >
            {L.fullRules} →
          </Link>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
          {L.faq.map((f, i) => (
            <Panel key={i}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>{f.q(W)}</div>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.65, margin: 0 }}>{f.a(W)}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${T.border}`, padding: "34px 20px 56px", textAlign: "center" }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
          <Link
            href="/s4/map"
            style={{
              background: T.panel,
              color: T.text,
              fontWeight: 600,
              padding: "12px 26px",
              borderRadius: 12,
              textDecoration: "none",
              fontSize: 15,
              border: `1px solid ${T.border}`,
            }}
          >
            {L.footerMap}
          </Link>
          <Link
            href="/s4/board"
            style={{
              background: T.panel,
              color: T.text,
              fontWeight: 600,
              padding: "12px 26px",
              borderRadius: 12,
              textDecoration: "none",
              fontSize: 15,
              border: `1px solid ${T.border}`,
            }}
          >
            {d.common.statusBoard}
          </Link>
        </div>
        <p style={{ fontSize: 13, color: T.faint, margin: 0 }}>
          {L.footerAlreadyPlaying}{" "}
          {/* inline padding + negative margin: a 44px tap target with zero layout shift */}
          <Link
            href="/s4/link"
            style={{ color: T.muted, display: "inline-block", padding: "14px 6px", margin: "-14px -6px" }}
          >
            {d.common.linkDiscord}
          </Link>
          .
        </p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
          <LanguageSwitcher align="center" />
        </div>
      </footer>
    </main>
  );
}
