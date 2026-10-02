/**
 * Season 5 arcade hub (/s5/play): a grid of the four field exercises from the
 * ONE game registry (src/lib/s5/games.ts). Each tile routes to
 * /s5/games/<key>; all four games are live (comingSoon in the registry only
 * marks a future slot that has not shipped yet). Server component, ISR.
 */
import Link from "next/link";
import { GAMES, GAME_DAILY_POINTS_CAP, POINTS_PER_RUN, SHELLS_PER_RUN } from "@/lib/s5/games";
import { getSeasonSnapshot, type GameBoardRow } from "@/lib/s5/data";
import { DEFAULT_THEME } from "@/lib/s5/theme";
import { dict, getLocale } from "@/lib/s5/i18n";
import { fill } from "@/lib/s5/strings";
import { Eyebrow, PageShell, Panel, UI } from "../_components/ui";

export const revalidate = 60;

export const metadata = {
  title: `Arcade · ${DEFAULT_THEME.seasonName}`,
  description: "Four field exercises. Small Medals, big bragging rights.",
};

// Per-game accent colors (display names always come from the registry; the
// one-line blurbs come from the dict). Each value mirrors that game's own
// ACCENT const in its Client, so a tile can never drift from the arena it
// opens: warbirds is sky blue, and descent inherited slot 2's gold (the accent
// stays with the slot across all three retirement waves, see src/lib/s5/games.ts).
const ACCENTS: Record<string, string> = {
  armorclash: "#e0662e",
  warpath: "#34d399",
  warhawks: "#7dd3fc",
  vanguard: "#f0b340",
};

/** Rank colour: gold, silver, bronze, then plain. A three-name list is only
 * worth putting on a card if first place LOOKS like first place. */
const MEDAL = ["#f0b340", "#c9d1d9", "#c98a4b"];

export default async function S5Play() {
  const t = DEFAULT_THEME;
  const d = dict(getLocale());
  const blurbs = d.play.blurbs as Record<string, string>;

  // THE HIGH SCORES, ON THE CARD YOU PRESS. Mike asked for the board to be in
  // the arcade and not only on /s5/board, and it costs nothing: the snapshot is
  // already built, already ISR-60 and already tag-revalidated, so this is a
  // cache read, not a new query. Failing soft matters more than the board: a
  // dead database must not take the four games offline, so an error here
  // renders the arcade exactly as it looked before.
  // The hero spotlights the first LIVE game and the shelf below still lists
  // every game, the hero's included - the way a storefront shows a headline
  // AND the full catalogue.
  const featured = GAMES.find((g) => !g.comingSoon) ?? null;
  const featuredAccent = featured ? (ACCENTS[featured.key] ?? UI.steel) : UI.steel;

  let boards = new Map<string, GameBoardRow[]>();
  try {
    const snap = await getSeasonSnapshot();
    boards = new Map(snap.gameBoards.map((gb) => [gb.key, gb.rows.slice(0, 3)]));
  } catch {
    /* no board today; the tiles still play */
  }
  return (
    // THE BOARD, BEHIND THE ARCADE. Through PageShell's backdrop slot, because
    // main paints its own gradient across the viewport and anything the page
    // hangs behind that is invisible -- which is why the first version of this
    // redesign changed nothing anyone could see. The scrim is a diagonal now
    // and MUCH lighter at the top: the plate has to be legible as terrain or
    // there was no point putting it there.
    <PageShell
      wide
      backdrop={{
        // Desaturated, darkened and blurred: at full strength the world plate
        // is a PICTURE, and a picture behind a page competes with every word on
        // it -- the headline was sitting on a bright green riverbank. Pushed
        // back like this it reads as the war table the arcade is sitting on,
        // which is the whole point of having it there.
        backgroundImage: "url(/s5-art/world/bg-land.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "saturate(0.5) brightness(0.62) blur(2px)",
        transform: "scale(1.03)", // hides the blur's soft edge
      }}
      // Above the plate, below the content. See PageShell's note on why this
      // cannot live in the page body.
      scrim={{
        background:
          "radial-gradient(1200px 700px at 50% -10%, rgba(8,10,13,0.42) 0%, rgba(8,10,13,0.74) 52%, rgba(6,8,10,0.92) 100%)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: SHELF_CSS }} />
      <header style={{ textAlign: "center", marginBottom: 22 }}>
        <Eyebrow>{t.seasonName}</Eyebrow>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 800, margin: "0 0 8px", color: UI.text }}>
          {d.play.title}
        </h1>
        <p style={{ fontSize: 14.5, color: UI.muted, margin: "0 auto", maxWidth: 620, lineHeight: 1.65 }}>
          {fill(d.play.subtitle, { perRun: POINTS_PER_RUN, cap: GAME_DAILY_POINTS_CAP })}
        </p>
      </header>

      {/* WHAT A RUN IS WORTH, before the tiles rather than buried in a rules
          page. "How much am I getting" is the question players actually ask. */}
      <Panel
        style={{
          marginBottom: 18,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          borderColor: `${UI.good}33`,
        }}
      >
        <span
          style={{
            fontFamily: UI.mono,
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: UI.good,
          }}
        >
          {t.points}
        </span>
        <span style={{ fontSize: 14, color: UI.text, lineHeight: 1.55, fontWeight: 600 }}>
          {fill(d.play.payLine, {
            points: POINTS_PER_RUN,
            shells: SHELLS_PER_RUN,
            tries: GAMES[0]?.attempts ?? 3,
            cap: GAME_DAILY_POINTS_CAP,
          })}
        </span>
      </Panel>

      {/* THE FEATURED HERO. One game gets a banner at the top of the shelf,
          which is the single strongest thing S4's arcade did: it turns a grid
          of equal tiles into a storefront with a headline. It is shown at the
          art's own 3:2, where these paintings actually read. */}
      {featured ? (
        <Link
          className="s5lib-hero"
          href={`/s5/games/${featured.key}`}
          aria-label={`${d.play.playNow}: ${featured.name}`}
          style={{
            position: "relative",
            display: "block",
            overflow: "hidden",
            borderRadius: 16,
            border: `1px solid ${featuredAccent}44`,
            background: `linear-gradient(150deg, ${featuredAccent}33, rgba(11,13,16,0.95))`,
            minHeight: "clamp(230px, 34vw, 340px)",
            marginBottom: 26,
            textDecoration: "none",
            boxShadow: `0 20px 56px rgba(0,0,0,0.5), 0 0 0 1px ${featuredAccent}14 inset`,
            ["--s5-accent" as string]: featuredAccent,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="s5lib-cover"
            src={`/s5-art/games/${featured.key}/card.webp`}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 42%",
              color: "transparent",
              filter: "saturate(0.86) contrast(1.04)",
            }}
          />
          {/* Legibility scrim, two axes: dark from the left for the words and
              from the bottom for the button. Without both, a headline over a
              painting is a coin flip. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, rgba(6,8,11,0.95) 0%, rgba(6,8,11,0.6) 42%, rgba(6,8,11,0) 76%)," +
                "linear-gradient(0deg, rgba(6,8,11,0.9) 0%, rgba(6,8,11,0) 58%)",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              minHeight: "inherit",
              padding: "clamp(18px, 3.4vw, 34px)",
              maxWidth: 560,
            }}
          >
            <span
              style={{
                alignSelf: "flex-start",
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${featuredAccent}66`,
                background: `${featuredAccent}1f`,
                color: featuredAccent,
                fontFamily: UI.mono,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              {d.play.featured}
            </span>
            <h2
              style={{
                margin: "13px 0 7px",
                fontSize: "clamp(26px, 5vw, 44px)",
                fontWeight: 900,
                lineHeight: 1.04,
                letterSpacing: "-0.015em",
                color: "#fff",
                textShadow: "0 4px 24px rgba(0,0,0,0.55)",
              }}
            >
              {featured.name}
            </h2>
            <p style={{ margin: "0 0 18px", fontSize: "clamp(13.5px, 1.7vw, 16px)", color: "rgba(232,236,245,0.86)", lineHeight: 1.5, maxWidth: 420 }}>
              {blurbs[featured.key] ?? ""}
            </p>
            <span
              className="s5lib-heroBtn"
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                boxSizing: "border-box",
                padding: "12px 26px",
                borderRadius: 11,
                background: featuredAccent,
                color: "#0b0d10",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              <span aria-hidden>&#9654;</span> {d.play.playNow}
            </span>
          </div>
        </Link>
      ) : null}

      <div
        style={{
          fontFamily: UI.mono,
          fontSize: 10,
          letterSpacing: "0.28em",
          color: UI.faint,
          textTransform: "uppercase",
          fontWeight: 700,
          margin: "0 0 13px",
        }}
      >
        {d.play.allGames}
      </div>

      <div
        style={{
          display: "grid",
          // 240 minimum: four across on a desktop, two on a tablet, one on a
          // phone, and never the four cramped thumbnails a 210px auto-fill
          // produced in a 920px well.
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 18,
        }}
      >
        {GAMES.map((g) => {
          const accent = ACCENTS[g.key] ?? UI.steel;
          const rows = boards.get(g.key) ?? [];
          return (
            <Link
              key={g.key}
              className="s5lib-tile"
              href={`/s5/games/${g.key}`}
              style={{ textDecoration: "none", ["--s5-accent" as string]: accent, borderRadius: 14, display: "block" }}
            >
              <Panel
                style={{
                  borderColor: `${accent}55`,
                  padding: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  // The accent reads as light coming off the card rather than
                  // as a border colour nobody notices.
                  boxShadow: `0 1px 0 ${accent}22 inset, 0 14px 34px rgba(0,0,0,0.45)`,
                }}
              >
                {/* THE COVER. Name and blurb sit ON the art behind a scrim
                    (S4's tile), so the picture is the card rather than a
                    thumbnail stapled above a paragraph. 4:3 rather than S4's
                    3:4: see this patch's header for why. */}
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "4 / 3",
                    background: `linear-gradient(150deg, ${accent}33, rgba(11,13,16,0.9))`,
                  }}
                >
                  {/* NO onError HANDLER HERE. This is a SERVER component, and
                      Next cannot serialize an event handler across that
                      boundary: adding one 500s the whole page (it did, live,
                      2026-07-28). A missing card is handled by CSS instead -
                      the img simply paints nothing over the accent wash behind
                      it, which is the same visual result with no JS at all. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="s5lib-cover"
                    src={`/s5-art/games/${g.key}/card.webp`}
                    alt=""
                    loading="lazy"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      color: "transparent",
                      // ONE VISUAL LANGUAGE. Three of these illustrations are
                      // near-neon and the fourth is a muted top-down town, and
                      // side by side they looked like four different products.
                      // Pulling the saturation back and lifting the contrast
                      // lets them share a shelf without repainting any of them.
                      filter: "saturate(0.84) contrast(1.04)",
                    }}
                  />
                  {/* The accent hairline: at-a-glance identity down the shelf,
                      and it is the only place each game's colour is stated. */}
                  <div
                    aria-hidden="true"
                    style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.92 }}
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(0deg, rgba(7,9,12,0.96) 0%, rgba(7,9,12,0.6) 34%, rgba(7,9,12,0) 66%)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      padding: "13px 14px",
                    }}
                  >
                    <h2 style={{ fontSize: 17.5, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.12, letterSpacing: "-0.01em" }}>
                      {g.name}
                    </h2>
                    <div style={{ fontSize: 12, color: "rgba(232,236,245,0.82)", marginTop: 4, lineHeight: 1.4 }}>
                      {blurbs[g.key] ?? ""}
                    </div>
                  </div>
                </div>

                <div style={{ padding: "12px 14px 13px", display: "flex", flexDirection: "column", flexGrow: 1 }}>
                  <span
                    className="s5lib-play"
                    style={{
                      alignSelf: "flex-start",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 11.5,
                      fontFamily: UI.mono,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: g.comingSoon ? UI.faint : accent,
                      border: `1px solid ${g.comingSoon ? UI.faint : accent}55`,
                      background: g.comingSoon ? "transparent" : `${accent}14`,
                      padding: "7px 13px",
                      borderRadius: 999,
                    }}
                  >
                    {g.comingSoon ? d.common.soon : d.play.playNow}
                    {g.comingSoon ? null : <span aria-hidden>&rsaquo;</span>}
                  </span>

                  {/* THE TOP THREE FOR THIS GAME. A score with nobody above it
                      is a number; a score with three names above it is a
                      target. Plain text, never links: this whole tile is
                      already an anchor and a nested one is invalid markup. */}
                  {g.comingSoon ? null : (
                    <div
                      style={{
                        marginTop: 11,
                        paddingTop: 9,
                        borderTop: `1px solid ${accent}22`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        flexGrow: 1,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: UI.mono,
                          fontSize: 9,
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          color: `${accent}cc`,
                          marginBottom: 1,
                        }}
                      >
                        {d.board.arcadeUnit}
                      </div>
                      {rows.length === 0 ? (
                        <div style={{ fontSize: 11.5, color: UI.faint }}>{d.board.arcadeEmpty}</div>
                      ) : (
                        rows.map((r) => (
                          <div
                            key={`${g.key}-${r.rank}`}
                            style={{ display: "grid", gridTemplateColumns: "12px 1fr auto", gap: 7, alignItems: "baseline" }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: UI.mono,
                                fontWeight: 800,
                                color: MEDAL[r.rank - 1] ?? UI.faint,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {r.rank}
                            </span>
                            <span style={{ fontSize: 11.5, color: UI.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.name}
                            </span>
                            <span style={{ fontSize: 11.5, fontWeight: 800, color: UI.text, fontVariantNumeric: "tabular-nums" }}>
                              {r.score.toLocaleString("en-US")}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* The per-tile contract: everyone plays the same board today,
                      and you get three cracks at it. */}
                  <div
                    style={{
                      marginTop: 9,
                      paddingTop: 8,
                      borderTop: `1px solid ${accent}22`,
                      fontFamily: UI.mono,
                      fontSize: 9.5,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: UI.faint,
                    }}
                  >
                    {fill(d.play.tileMeta, { tries: g.attempts })}
                  </div>
                </div>
              </Panel>
            </Link>
          );
        })}
      </div>


      <p
        style={{
          textAlign: "center",
          fontSize: 12.5,
          color: UI.muted,
          margin: "26px auto 0",
          maxWidth: 520,
          lineHeight: 1.6,
        }}
      >
        {d.play.footNote}
      </p>
      {/* A rail, not two grey words. This is the bottom of the page: the two
          things a player might want next deserve to look tappable. */}
      <nav style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        {[
          { href: "/s5", label: d.common.back },
          { href: "/s5/board", label: d.links.board },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              textDecoration: "none",
              fontSize: 12.5,
              fontFamily: UI.mono,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: UI.muted,
              border: `1px solid ${UI.border}`,
              background: "rgba(255,255,255,0.03)",
              padding: "9px 16px",
              borderRadius: 999,
            }}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </PageShell>
  );
}

/* Hover polish, CSS only. This page is a SERVER component and stays one: none
   of this needs React state, and the one time an event handler was added here
   it 500'd the route. No backticks or quotes inside the string - a <style> text
   child is HTML-escaped on the server and quotes desync hydration (S4's note). */
const SHELF_CSS =
  ".s5lib-tile,.s5lib-hero{transition:transform .2s ease,box-shadow .2s ease,filter .2s ease;}" +
  ".s5lib-tile:hover,.s5lib-tile:focus-visible,.s5lib-hero:hover,.s5lib-hero:focus-visible{" +
  "box-shadow:0 24px 54px rgba(0,0,0,.62),0 0 34px var(--s5-accent);outline:none;}" +
  ".s5lib-cover{transition:transform .45s ease;}" +
  ".s5lib-tile:hover .s5lib-play,.s5lib-tile:focus-visible .s5lib-play{" +
  "background:var(--s5-accent);color:#0b0d10;border-color:var(--s5-accent);}" +
  "@media (prefers-reduced-motion: no-preference){" +
  ".s5lib-tile:hover,.s5lib-tile:focus-visible{transform:translateY(-6px) scale(1.015);}" +
  ".s5lib-hero:hover,.s5lib-hero:focus-visible{transform:translateY(-3px);}" +
  ".s5lib-tile:hover .s5lib-cover,.s5lib-tile:focus-visible .s5lib-cover,.s5lib-hero:hover .s5lib-cover{transform:scale(1.055);}" +
  ".s5lib-hero:hover .s5lib-heroBtn{filter:brightness(1.08);}" +
  "}";
