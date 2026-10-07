/**
 * LAUNCH WARS ARCADE - the off-season front door (launchwars.xyz "/").
 *
 * Says plainly that no season is live, lets a visitor connect a wallet and
 * sign once, and lists every season's games (S7's four have never been played
 * by anyone) with a NEW board per game: everyone starts at 0.
 *
 * Server component. The boards are one cached read (60s, tag-revalidated by
 * the score route) and FAIL SOFT: a dead database must not take sixteen games
 * offline, so an error renders the shelves with empty boards.
 *
 * COPY LAW: never a money figure, never "win", no em-dashes, plain words. The
 * arcade pays nothing and the page says so.
 *
 * NO EVENT HANDLERS IN HERE: Next cannot serialize one across the server
 * boundary (an onError on an <img> 500ed the S7 arcade on 2026-07-28). A
 * missing card paints nothing over the accent wash behind it.
 */
import Link from "next/link";
import { getLocale, dict as s7Dict } from "@/lib/s7/i18n";
import { dict as s6Dict } from "@/lib/s6/i18n";
import { dict as s5Dict } from "@/lib/s5/i18n";
import { Eyebrow, Panel, UI } from "@/app/s7/_components/ui";
import { ARCADE_GAMES, ARCADE_SHELVES, arcadeHref, type ArcadeGame } from "@/lib/arcade/games";
import { arcadeDict } from "@/lib/arcade/strings";
import { readArcadeBoards, type ArcadeBoards, type ArcadeBoardRow } from "@/lib/arcade/server";
import { SignInCard } from "./_components/SignInCard";

export const revalidate = 60;

/** Rank colour: gold, silver, bronze, then plain. */
const MEDAL = ["#f0b340", "#c9d1d9", "#c98a4b"];

const PAGE_CSS = `
.arc-tile{transition:transform .14s ease, box-shadow .14s ease;}
.arc-tile:hover,.arc-tile:focus-visible{transform:translateY(-2px);}
.arc-tile:focus-visible{outline:2px solid var(--arc-accent);outline-offset:3px;}
.arc-more>summary{cursor:pointer;list-style:none;}
.arc-more>summary::-webkit-details-marker{display:none;}
.arc-more[open]>summary{display:none;}
@media (prefers-reduced-motion: reduce){.arc-tile{transition:none;}.arc-tile:hover{transform:none;}}
`;

function BoardRows({ rows, from = 0 }: { rows: ArcadeBoardRow[]; from?: number }) {
  return (
    <>
      {rows.map((r) => (
        <div
          key={r.rank}
          style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, lineHeight: 1.75, color: UI.muted }}
        >
          <span
            style={{
              fontFamily: UI.mono,
              fontSize: 11.5,
              width: 20,
              flexShrink: 0,
              color: MEDAL[r.rank - 1] ?? UI.faint,
              fontWeight: 700,
            }}
          >
            {r.rank}
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.name}
          </span>
          <span style={{ fontFamily: UI.mono, fontSize: 12.5, color: from === 0 && r.rank === 1 ? UI.text : UI.muted }}>
            {r.score.toLocaleString("en-US")}
          </span>
        </div>
      ))}
    </>
  );
}

function GameCard({
  game,
  blurb,
  rows,
  labels,
}: {
  game: ArcadeGame;
  blurb: string;
  rows: ArcadeBoardRow[];
  labels: { play: string; boardTitle: string; boardEmpty: string; boardMore: string };
}) {
  const accent = game.accent;
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  return (
    <Panel
      style={{
        borderColor: `${accent}55`,
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxShadow: `0 1px 0 ${accent}22 inset, 0 14px 34px rgba(0,0,0,0.45)`,
      }}
    >
      <Link
        className="arc-tile"
        href={arcadeHref(game.key)}
        aria-label={`${labels.play}: ${game.name}`}
        style={{ textDecoration: "none", display: "block", ["--arc-accent" as string]: accent }}
      >
        <div
          style={{
            position: "relative",
            aspectRatio: "4 / 3",
            background: `linear-gradient(150deg, ${accent}33, rgba(11,13,16,0.9))`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={game.art}
            alt=""
            loading="lazy"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              color: "transparent",
              // Four seasons of cover art, four palettes: pulled toward one shelf.
              filter: "saturate(0.84) contrast(1.04)",
            }}
          />
          <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.92 }} />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(0deg, rgba(7,9,12,0.96) 0%, rgba(7,9,12,0.6) 34%, rgba(7,9,12,0) 66%)",
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
            <h3 style={{ fontSize: 17.5, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.12, letterSpacing: "-0.01em" }}>
              {game.name}
            </h3>
            <div style={{ fontSize: 12, color: "rgba(232,236,245,0.82)", marginTop: 4, lineHeight: 1.4 }}>{blurb}</div>
          </div>
        </div>
        <div style={{ padding: "12px 14px 0" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              minHeight: 40,
              boxSizing: "border-box",
              padding: "9px 20px",
              borderRadius: 10,
              background: accent,
              color: "#0b0d10",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            <span aria-hidden>&#9654;</span> {labels.play}
          </span>
        </div>
      </Link>

      <div style={{ padding: "12px 14px 14px", flexGrow: 1 }}>
        <div
          style={{
            fontFamily: UI.mono,
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: UI.faint,
            fontWeight: 700,
            margin: "2px 0 6px",
          }}
        >
          {labels.boardTitle}
        </div>
        {top.length === 0 ? (
          <div style={{ fontSize: 13, color: UI.faint, lineHeight: 1.6 }}>{labels.boardEmpty}</div>
        ) : (
          <>
            <BoardRows rows={top} />
            {rest.length > 0 ? (
              <details className="arc-more">
                <summary style={{ fontSize: 12.5, color: accent, fontWeight: 700, marginTop: 6, minHeight: 28 }}>
                  {labels.boardMore}
                </summary>
                <BoardRows rows={rest} from={3} />
              </details>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}

export default async function ArcadePage() {
  const locale = getLocale();
  const d = arcadeDict(locale);

  // Blurbs: S5, S6 and S7 carry theirs in all three languages already, and
  // none of them mentions points or money. S4 never localized its own.
  const blurbs: Record<string, string> = {
    ...(s5Dict(locale).play.blurbs as Record<string, string>),
    ...(s6Dict(locale).play.blurbs as Record<string, string>),
    ...(s7Dict(locale).play.blurbs as Record<string, string>),
    ...d.s4Blurbs,
  };

  let boards: ArcadeBoards = {};
  try {
    boards = await readArcadeBoards();
  } catch {
    /* no boards today; the games still play */
  }

  const labels = { play: d.play, boardTitle: d.boardTitle, boardEmpty: d.boardEmpty, boardMore: d.boardMore };
  const steps = [d.step1, d.step2, d.step3];

  return (
    <main
      style={{
        minHeight: "100dvh",
        color: UI.text,
        fontFamily: UI.sans,
        padding: "84px 20px 72px",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <section style={{ maxWidth: 760, margin: "18px 0 26px" }}>
          <Eyebrow>{d.eyebrow}</Eyebrow>
          <h1 style={{ fontSize: "clamp(30px, 5.2vw, 46px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.02em", margin: 0 }}>
            {d.h1}
          </h1>
          <p style={{ fontSize: 16.5, lineHeight: 1.6, color: UI.muted, margin: "16px 0 0" }}>{d.sub}</p>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <Panel>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{d.stepsTitle}</div>
            <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
              {steps.map((s, i) => (
                <li key={i} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.5, color: UI.muted, marginTop: 6 }}>
                  <span style={{ fontFamily: UI.mono, color: UI.ember, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </Panel>
          <SignInCard
            strings={{
              signTitle: d.signTitle,
              signBody: d.signBody,
              signGuest: d.signGuest,
              signButton: d.signButton,
              signBusy: d.signBusy,
              signDone: d.signDone,
              signCancelled: d.signCancelled,
              signFailed: d.signFailed,
              connect: d.connect,
            }}
          />
        </div>

        {ARCADE_SHELVES.map((shelf) => {
          const games = ARCADE_GAMES.filter((g) => g.season === shelf.season);
          if (!games.length) return null;
          return (
            <section key={shelf.season} aria-labelledby={`shelf-${shelf.season}`} style={{ marginBottom: 40 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 12px", margin: "0 0 14px" }}>
                <h2 id={`shelf-${shelf.season}`} style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
                  {shelf.title}
                </h2>
                <span
                  style={{
                    fontFamily: UI.mono,
                    fontSize: 10.5,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: UI.faint,
                    fontWeight: 700,
                  }}
                >
                  {shelf.label}
                </span>
                {shelf.isNew ? (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: `1px solid ${UI.ember}66`,
                      background: `${UI.ember}1a`,
                      color: UI.ember,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {d.newTag}
                  </span>
                ) : null}
                {shelf.isNew ? <span style={{ fontSize: 13.5, color: UI.muted }}>{d.newShelfNote}</span> : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
                {games.map((g) => (
                  <GameCard key={g.key} game={g} blurb={blurbs[g.key] ?? ""} rows={boards[g.key] ?? []} labels={labels} />
                ))}
              </div>
            </section>
          );
        })}

        <footer
          style={{
            marginTop: 8,
            paddingTop: 18,
            borderTop: `1px solid ${UI.border}`,
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 18px",
            fontSize: 12.5,
            color: UI.faint,
          }}
        >
          <span style={{ flex: "1 1 320px", color: UI.muted }}>{d.forFun}</span>
          <a href="/s6/board" style={{ color: UI.faint, textDecoration: "none" }}>
            {d.lastSeason}
          </a>
          <a href="https://domagaming.com" rel="noopener" style={{ color: UI.faint, textDecoration: "none" }}>
            {d.studio}
          </a>
          <a href="/privacy" style={{ color: UI.faint, textDecoration: "none" }}>
            Privacy
          </a>
          <a href="/terms" style={{ color: UI.faint, textDecoration: "none" }}>
            Terms
          </a>
          <a href="/disclaimer" style={{ color: UI.faint, textDecoration: "none" }}>
            Disclaimer
          </a>
        </footer>
      </div>
    </main>
  );
}
