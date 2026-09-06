/**
 * Season 5 WAR BOARD (/s7/board): top commanders, the War Effort line, the
 * pool line, and dollars paid so far. All from the one season snapshot;
 * this page does no dollar math of its own. Server component, ISR 60.
 *
 * PUBLIC-SAFE: names and Medals only. Personal payouts stay private.
 */
import Link from "next/link";
import { getSeasonSnapshot, poolLine } from "@/lib/s7/data";
import {
  GAME_LEADER_PRIZE_USD,
  GAME_LEADER_POOL_MAX_USD,
  POOL_FULL_USD,
  SLICE_MAX_USD,
  SLICE_MIN_USD,
} from "@/lib/s7/games";
import { DEFAULT_THEME } from "@/lib/s7/theme";
import { dict, getLocale } from "@/lib/s7/i18n";
import { fill } from "@/lib/s7/strings";
import { Eyebrow, PageShell, Panel, PoolBanner, UI } from "../_components/ui";
import { RaidStrip } from "../_components/RaidStrip";
import { ShareLink } from "../_components/ShareLink";

export const revalidate = 60;

const SHARE_TITLE = `War Board · ${DEFAULT_THEME.seasonName}`;
const SHARE_DESC =
  "Who is carrying the crusade, and where the money goes: one pot split among the keeps by difficulty, paid by the percent each reached, and a $25 arcade prize for each game's best score.";

// og/twitter title and description are NOT inherited sensibly: the root layout
// sets the site-wide education copy, so a pasted board link read "Free Crypto &
// Web3 Education" over a picture of the war board. Per-page, both platforms.
export const metadata = {
  title: SHARE_TITLE,
  description: "Top adventurers, the war effort, and the pool.",
  openGraph: { title: SHARE_TITLE, description: SHARE_DESC, type: "website" as const },
  twitter: { card: "summary_large_image" as const, title: SHARE_TITLE, description: SHARE_DESC },
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Vega's plate. Its own "/..." const so the preflight vocab gate's path mask
 * (the PATH LAW: a path is a filesystem fact, not copy) can see it is a path. */
const VEGA_ART = "/s7-art/pilot/vega.png";

/** One money card. Amount, what it is, and how you get it -- the three
 * questions players actually ask, in that order, on one card. */
function MoneyCard({
  amount,
  label,
  body,
  note,
  accent,
}: {
  amount: string;
  label: string;
  body: string;
  note?: string;
  accent: string;
}) {
  return (
    <Panel style={{ flex: "1 1 220px", padding: "14px 16px 15px", borderColor: `${accent}33` }}>
      <div
        style={{
          fontFamily: UI.mono,
          fontSize: 24,
          fontWeight: 800,
          color: accent,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {amount}
      </div>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: UI.faint,
          fontWeight: 700,
          margin: "5px 0 8px",
        }}
      >
        {label}
      </div>
      <p style={{ fontSize: 12.5, color: UI.muted, margin: 0, lineHeight: 1.6 }}>{body}</p>
      {note ? (
        <div style={{ marginTop: 9, fontSize: 11.5, color: UI.good, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {note}
        </div>
      ) : null}
    </Panel>
  );
}

export default async function S7Board() {
  const snap = await getSeasonSnapshot();
  const t = snap.theme;
  const d = dict(getLocale());

  const warEffort = fill(snap.totals.players === 1 ? d.board.effortLineOne : d.board.effortLine, {
    bonded: snap.totals.bonded,
    total: snap.totals.total,
    live: snap.totals.live,
    players: snap.totals.players,
  });

  /** The arcade-prize figures, from the same registry the settlement engine
   * reads: the per-game prize and the season-wide ceiling. Every board string
   * that names either amount fills from this one bag. */
  const leaderArgs = {
    leaderPrize: usd(GAME_LEADER_PRIZE_USD),
    leaderPool: usd(GAME_LEADER_POOL_MAX_USD),
  };

  return (
    // VEGA HOLDS THE BOARD. This page is the one players screenshot, and it was
    // a leaderboard on a bare radial gradient. She sits fixed on the right
    // under a left-heavy scrim: a figure standing beside the standings, never
    // texture behind the text. Through PageShell's backdrop slot, because main
    // paints its own background across the viewport and the first version of
    // this hung her behind it at z-index -1, where nobody could see her.
    <PageShell
      backdrop={{
        backgroundImage: `linear-gradient(100deg, rgba(8,10,13,0.96) 0%, rgba(8,10,13,0.92) 40%, rgba(8,10,13,0.62) 70%, rgba(8,10,13,0.74) 100%), url(${VEGA_ART})`,
        backgroundSize: "cover, auto 88%",
        backgroundPosition: "center, right -40px bottom",
        backgroundRepeat: "no-repeat, no-repeat",
      }}
    >
      {/* On a phone the content column is the whole screen, so Vega stops
          standing beside the board and starts standing underneath the words.
          Faded to a suggestion below 900px rather than removed: the page keeps
          its warmth without anyone reading text off a jacket. */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@media (max-width:900px){.s7-backdrop-art{opacity:.28;background-position:center,right -180px bottom !important;}}",
        }}
      />
      <div style={{ marginBottom: 20 }}>
        <RaidStrip />
      </div>
      <header style={{ textAlign: "center", marginBottom: 28 }}>
        <Eyebrow>{t.seasonName}</Eyebrow>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 800, margin: "0 0 8px", color: UI.text }}>
          {d.board.title}
        </h1>
        <p style={{ fontSize: 14.5, color: UI.muted, margin: 0 }}>
          {d.board.subtitle}
        </p>
        {/* The board has always unfurled as a share card (opengraph-image.tsx
            renders the top five); nothing on screen ever offered you the link.
            Mike, 2026-08-15: "the cards that are shareable". */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <ShareLink label={d.board.shareCta} copiedLabel={d.board.shareCopied} />
        </div>
      </header>

      {/* WHERE ALL THE MONEY IS. ONE envelope since 2026-08-16: the bounties
          are deleted and the whole season is a single pot, split into a slice
          per keep and paid out by the percent each one reached. So the
          headline is the constant itself, with no second number to reconcile,
          and the pair below is "the whole pool" plus "what one keep is
          worth". Honors keep their plain line under the cards, because a $0
          money card reads as a dead number. */}
      <section style={{ marginBottom: 26 }}>
        <h2
          style={{
            fontSize: "clamp(19px, 4vw, 24px)",
            fontWeight: 800,
            color: UI.text,
            margin: "0 0 6px",
            textAlign: "center",
          }}
        >
          {/* ONE number, and it is the envelope. There is no second pot to add
              in any more, so the headline can no longer disagree with the card
              under it. The EARNED-so-far figure is the card's note, never the
              headline: the standing S3 lesson is that a bare "$0" headline
              reads as a dead season, and bars only ever go up. */}
          {fill(d.board.moneyTitle, { total: usd(POOL_FULL_USD) })}
        </h2>
        <p
          style={{
            fontSize: 13.5,
            color: UI.muted,
            margin: "0 auto 14px",
            maxWidth: 520,
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          {/* the model in one line: the only figure it carries is the arcade
              ceiling, filled from the registry so it can never drift */}
          {fill(d.board.moneyLead, leaderArgs)}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <MoneyCard
            amount={usd(POOL_FULL_USD)}
            label={d.board.warChestLabel}
            body={d.board.warChestBody}
            // "$0 earned so far" is honest and reads like a dead number, so the
            // line only appears once there is something to report.
            note={
              snap.empty || snap.pool.secured <= 0
                ? undefined
                : fill(d.board.warChestSecured, {
                    secured: usd(snap.pool.secured),
                    full: usd(POOL_FULL_USD),
                  })
            }
            accent={UI.good}
          />
          {/* NOT a second envelope: the slice BAND, so the player can see what
              one keep is worth without reading a table. The per-keep
              figure and what it has earned live on that keep's own card. */}
          <MoneyCard
            amount={`${usd(SLICE_MIN_USD)}-${usd(SLICE_MAX_USD)}`}
            label={d.board.sliceLabel}
            body={d.board.sliceBody}
            accent="#e0662e"
          />
          {/* THE ARCADE PRIZE: the one cash prize that rides on skill instead
              of holding, paid from money the keeps never earn. Its own card so
              the money row states everywhere a dollar can go. */}
          <MoneyCard
            amount={fill(d.board.gameLeadersAmount, leaderArgs)}
            label={d.board.gameLeadersLabel}
            body={fill(d.board.gameLeadersBody, leaderArgs)}
            accent="#f0b340"
          />
        </div>
        <Panel style={{ marginTop: 10, borderColor: "#f0b34033" }}>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#f0b340",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {d.board.honorsLabel}
          </div>
          <p style={{ fontSize: 12.5, color: UI.muted, margin: 0, lineHeight: 1.6 }}>
            {fill(d.board.honorsBody, { end: d.common.seasonEnd })}
          </p>
        </Panel>
      </section>

      {snap.empty ? (
        <Panel style={{ textAlign: "center", padding: "34px 24px" }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: UI.text, marginBottom: 8 }}>
            {d.common.emptyFrontTitle}
          </div>
          <p style={{ fontSize: 14, color: UI.muted, margin: 0, lineHeight: 1.6 }}>
            {d.board.emptyBody}
          </p>
        </Panel>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <PoolBanner line={poolLine(snap, d)} />
          </div>

          <section style={{ marginBottom: 30 }}>
            <Panel
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: UI.faint, fontWeight: 700, marginBottom: 4 }}>
                  {d.board.effortLabel}
                </div>
                <div style={{ fontSize: 14, color: UI.text, fontWeight: 600 }}>{warEffort}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: UI.faint, fontWeight: 700, marginBottom: 4 }}>
                  {d.board.paidLabel}
                </div>
                <div style={{ fontSize: 18, color: UI.good, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {usd(snap.pool.paidOutUsd)}
                </div>
              </div>
            </Panel>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: UI.text, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {d.board.topHeading}
              </h2>
              <span style={{ fontSize: 13, color: UI.faint }}>{d.board.byPoints}</span>
            </div>
            {snap.topAdventurers.length === 0 ? (
              <Panel style={{ textAlign: "center", padding: "26px 20px" }}>
                <p style={{ fontSize: 13.5, color: UI.muted, margin: 0, lineHeight: 1.6 }}>
                  {d.board.emptyBoard}
                </p>
              </Panel>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {snap.topAdventurers.map((c) => (
                  <Panel
                    key={`${c.rank}-${c.name}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "34px 1fr auto auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 16px",
                    }}
                  >
                    <span style={{ fontSize: 13, color: UI.faint, fontVariantNumeric: "tabular-nums" }}>{c.rank}</span>
                    {c.handle ? (
                      <Link
                        href={`/s7/hq/${c.handle}`}
                        style={{ fontSize: 14.5, fontWeight: 700, color: UI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: UI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </span>
                    )}
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: UI.steel, fontVariantNumeric: "tabular-nums" }}>
                      {c.points.toLocaleString("en-US")}
                    </span>
                    {c.handle ? (
                      <Link
                        data-testid={`visit-${c.rank}`}
                        href={`/s7/hq/${c.handle}`}
                        style={{
                          fontFamily: UI.mono,
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          color: UI.steel,
                          border: `1px solid ${UI.steel}44`,
                          borderRadius: 999,
                          padding: "4px 12px",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.board.visit}
                      </Link>
                    ) : (
                      <span />
                    )}
                  </Panel>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12.5, color: UI.faint, marginTop: 12, lineHeight: 1.6 }}>
              {d.board.footnote}
            </p>
          </section>
        </>
      )}


        {/* ── PER-GAME HIGH SCORES ────────────────────────────────────────
            Rewards are flat (a banked run pays 10 Medals whatever you
            scored, capped at 40 a day), so a SCORE buys nothing and is pure
            standing. That is exactly what makes it worth duelling over, and
            it had no surface until now. */}
        <div style={{ marginTop: 34 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: UI.text, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {d.board.arcadeHeading}
            </h2>
            <span style={{ fontSize: 13, color: UI.faint }}>{fill(d.board.arcadeNote, leaderArgs)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {snap.gameBoards.map((gb) => (
              <Panel key={gb.key} style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <Link
                    href={`/s7/games/${gb.key}`}
                    style={{ fontSize: 13.5, fontWeight: 800, color: UI.text, textDecoration: "none" }}
                  >
                    {gb.name}
                  </Link>
                  <span style={{ fontSize: 10.5, fontFamily: UI.mono, color: UI.faint, letterSpacing: "0.12em" }}>
                    {d.board.arcadeUnit}
                  </span>
                </div>
                {gb.rows.length === 0 ? (
                  <p style={{ fontSize: 12, color: UI.faint, margin: 0 }}>{d.board.arcadeEmpty}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {gb.rows.map((r) => (
                      <div
                        key={`${gb.key}-${r.rank}`}
                        style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 8, alignItems: "baseline" }}
                      >
                        <span style={{ fontSize: 11, color: UI.faint, fontVariantNumeric: "tabular-nums" }}>{r.rank}</span>
                        <span style={{ fontSize: 12.5, color: UI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}
                          {r.practice ? (
                            <span
                              title={d.board.practiceTag}
                              style={{
                                marginLeft: 6,
                                fontSize: 9,
                                fontWeight: 800,
                                letterSpacing: "0.08em",
                                color: UI.faint,
                                border: `1px solid ${UI.faint}`,
                                borderRadius: 4,
                                padding: "1px 4px",
                                verticalAlign: "1px",
                              }}
                            >
                              {d.board.practiceTag.toUpperCase()}
                            </span>
                          ) : null}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: UI.steel, fontVariantNumeric: "tabular-nums" }}>
                          {r.score.toLocaleString("en-US")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            ))}
          </div>
        </div>

      <p style={{ textAlign: "center", fontSize: 13, color: UI.faint, marginTop: 34 }}>
        <Link href="/s7" style={{ color: UI.muted }}>{d.common.back}</Link>
        {" · "}
        <Link href="/s7" style={{ color: UI.muted }}>{d.links.map}</Link>
        {" · "}
        <Link href="/s7/play" style={{ color: UI.muted }}>{d.links.arcade}</Link>
      </p>
    </PageShell>
  );
}
