/**
 * BATTLE BOTS KNOCKOUT CARD, the fight's og:image (screens doc 4.3).
 *
 *   GET /api/bots/card/ko?f=<fightId>  ->  image/png 1200x630
 *
 * The money gradient, the WINNER as a full picture of the real robot (one
 * composited portrait from /api/bots/portrait, in all four of its own
 * colours with its face, its sticker, its marks and its hat), the loser
 * behind it, cracked and faded, KNOCKOUT in Baloo 2, both bot names with
 * their wallet names, the finisher line, the chain sentence, two hairline
 * chips and the replay URL. Never a dollar figure, never an address.
 * Sparring and an unknown id FAIL SOFT to a generic "Watch bots fight"
 * card (og scrapers must always get an image).
 *
 * Built exactly like src/app/api/s7/hq-card/route.tsx: next/og (Satori)
 * renders; every multi-child div carries display: flex; fonts are fetched
 * over HTTP (Aktiv from our own /public, Baloo 2 and Syne from Google
 * Fonts as WOFF, which Satori reads) and any failure falls back to what
 * loaded. The two robots are fetched as BYTES and handed to Satori as data
 * URIs, never as urls: a 404 inside Satori fails the whole render
 * mid-stream where a try/catch cannot help, and a fetch whose result we
 * can test is one round trip cheaper than the HEAD-then-GET this route used
 * to do per part. Reading the request URL keeps the route dynamic.
 *
 * ONE difference from hq-card: this route runs on the EDGE runtime. The
 * node build of next/og reads its fallback font at module top level through
 * `join(import.meta.url, ...)`, which a Windows dev box turns into an
 * invalid file URL, so every nodejs ImageResponse there answers 500 (Next
 * 14.2.3; hq-card included, 2026-09-03). The edge build bundles its fonts
 * and wasm as assets and renders on every box. The fight is read through
 * _server/fight-read.ts, the half of fights.ts with no node:crypto in it.
 */
import { ImageResponse } from "next/og";
import { PORTRAIT_ASPECT, bodyCentreInSquare, portraitUrl } from "@/app/bots/_view/pieces";
import { botsDb } from "@/app/bots/_server/db";
import { fightView, loadBattle } from "@/app/bots/_server/fight-read";
import type { FightView } from "@/app/bots/_server/types";
import { STRINGS, fill, starWord, winLossWords } from "@/lib/bots/strings";

export const runtime = "edge";

const W = 1200;
const H = 630;
const TEXT = "#e4e8f5";
const MUTED = "#6272a0";
const LORE = "#a9b1c9";
const CREAM = "#f3e9d2";
const ACCENT = "#7c6aff";
const CORAL = "#ff8a7a";
const GOLD = "#f0b340";
const WORDMARK = "BATTLE BOTS";
const BACKGROUND = "linear-gradient(145deg, #131826 0%, #0d1120 45%, #080b14 100%)";

const FONT_BODY = "Aktiv, sans-serif";
const FONT_TOY = '"Baloo 2", Aktiv, sans-serif';
const FONT_DISPLAY = "Syne, Aktiv, sans-serif";

// ── fonts ───────────────────────────────────────────────────────────────────

type FontSpec = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" };
type Fonts = FontSpec[] | undefined;

const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

/** A Google Fonts face as WOFF (the css2 endpoint hands an old browser a
 * WOFF url, which Satori reads; WOFF2 it cannot). Cached per process. */
function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}`;
  let p = fontCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; rv:8.0) Gecko/20100101 Firefox/8.0" },
        }).then((r) => (r.ok ? r.text() : ""));
        const m = /url\((https:[^)]+\.(?:woff|ttf|otf))\)/.exec(css);
        if (!m) return null;
        const r = await fetch(m[1]);
        return r.ok ? await r.arrayBuffer() : null;
      } catch {
        return null;
      }
    })();
    fontCache.set(key, p);
  }
  return p;
}

async function loadFonts(origin: string): Promise<Fonts> {
  const grab = async (url: string): Promise<ArrayBuffer | null> => {
    try {
      const r = await fetch(url);
      return r.ok ? await r.arrayBuffer() : null;
    } catch {
      return null;
    }
  };
  const [rg, bd, baloo, syne] = await Promise.all([
    grab(origin + "/s4-art/fonts/AktivGrotesk_Rg.ttf"),
    grab(origin + "/s4-art/fonts/AktivGrotesk_Bd.ttf"),
    googleFont("Baloo 2", 800),
    googleFont("Syne", 700),
  ]);
  const out: FontSpec[] = [];
  if (rg) out.push({ name: "Aktiv", data: rg, weight: 400, style: "normal" });
  if (bd) out.push({ name: "Aktiv", data: bd, weight: 700, style: "normal" });
  if (baloo) out.push({ name: "Baloo 2", data: baloo, weight: 800, style: "normal" });
  if (syne) out.push({ name: "Syne", data: syne, weight: 700, style: "normal" });
  return out.length ? out : undefined; // system default (fine on Vercel)
}

// ── the robot: ONE compositor, fetched as a picture ─────────────────────────
/**
 * THE ROBOT ON THIS CARD IS THE PORTRAIT ROUTE'S ROBOT.
 *
 * This file used to compose the figure itself, out of absolute <img> tags at
 * the rig points, and it was the only copy of that knowledge in the repo.
 * Two things were wrong with it. The assembly has moved to
 * src/app/bots/_view/pieces.ts, so there is now exactly one place that knows
 * how a robot is put together, and every small picture reads it.
 *
 * And the robot was GREY. A part's colour is a MULTIPLY of its art by its own
 * mask, and Satori has no blend modes, so a card built out of <img> tags can
 * only ever show unpainted clay: this card was showing a different robot from
 * the one in the garage, for a game whose whole point is that a robot is four
 * colours at once. So the picture is composited by /api/bots/portrait and
 * arrives here as one image.
 *
 * It is fetched as BYTES and handed to Satori as a data URI, not as a URL.
 * A 404 or a 500 inside Satori fails the whole render mid-stream, where a
 * try/catch cannot help, which is why every image on this card was HEAD
 * checked before. One fetch we can test the result of is simpler and one
 * round trip cheaper than a HEAD plus a GET.
 */
async function portraitOnce(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (!b.length) return null;
    return `data:image/png;base64,${b.toString("base64")}`;
  } catch {
    return null; // the card still has its words
  }
}

/**
 * ONE RETRY, and it is not belt and braces. A card whose robot did not
 * arrive is a card with a crack floating in an empty half, and it is the
 * picture that gets posted, cached by the scraper and looked at for a week.
 * The portrait route lives in the same deployment as this one, so a miss is
 * almost always a cold start or a redeploy landing between the two calls
 * (seen on the dev box, 2026-09-05: the card rendered wordless robots twice
 * while the route next door was rebuilding). One more try costs one round
 * trip on the rare bad path and nothing at all on the good one.
 */
async function portrait(origin: string, fight: string, side: 0 | 1, size: number): Promise<string | null> {
  const url = origin + portraitUrl({ fight, side, size });
  return (await portraitOnce(url)) ?? (await portraitOnce(url));
}

/** The composited robot, square (PORTRAIT_ASPECT), at `size` px. */
function Bot({ src, size, opacity, mirror }: { src: string; size: number; opacity?: number; mirror?: boolean }) {
  // Satori refuses a style key whose value is undefined ("Invalid transform
  // value"), so the mirror is added only when asked for
  const style: React.CSSProperties = {
    display: "flex",
    width: size,
    height: Math.round(size / PORTRAIT_ASPECT),
    opacity: opacity ?? 1,
  };
  if (mirror) style.transform = "scaleX(-1)";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={style.width as number} height={style.height as number} style={style} alt="" />;
}

/**
 * The crack over the loser: drawn lines, no image to fetch.
 *
 * IT IS NOT CENTRED ON THE SQUARE, because the robot is not. A weapon hangs
 * off one side, so the body sits at about 0.38 across a portrait and the
 * crack drawn down the middle of the frame landed in the gap between the
 * loser's weapon and its chest (read on the first card, 2026-09-05). The
 * offset comes from pieces.bodyCentreInSquare, which derives it from the
 * figure contract, and it follows the mirror.
 */
function Crack({ size, mirror }: { size: number; mirror?: boolean }) {
  const body = bodyCentreInSquare(size, !!mirror);
  const shift = body.x - size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", left: Math.round(shift), top: 0 }}>
      <path d="M52 8 L46 34 L58 42 L44 62 L54 74 L40 96" stroke={CORAL} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 34 L30 38 M58 42 L72 36 M44 62 L28 70 M54 74 L70 80" stroke={CORAL} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ── the cards ───────────────────────────────────────────────────────────────

function chip(text: string, color: string) {
  return (
    <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color, border: `2px solid ${color}88`, borderRadius: 999, padding: "8px 22px", fontFamily: FONT_BODY }}>
      {text}
    </div>
  );
}

function wordmark(host: string, path: string) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 12, height: 12, background: ACCENT, borderRadius: 3, display: "flex" }} />
        <div style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 8, color: LORE, fontFamily: FONT_DISPLAY }}>{WORDMARK}</div>
      </div>
      <div style={{ fontSize: 20, color: MUTED, display: "flex", fontFamily: FONT_BODY }}>
        {host}
        {path}
      </div>
    </div>
  );
}

async function koCard(v: FightView, fonts: Fonts, origin: string, host: string) {
  const w = v.winner;
  const l = w === 0 ? 1 : 0;
  const winner = v.ids[w];
  const loser = v.ids[l];
  const [artW, artL] = await Promise.all([
    portrait(origin, v.id, w as 0 | 1, 432),
    portrait(origin, v.id, l as 0 | 1, 300),
  ]);
  const points = v.rewards.attackerPoints;
  const pointsChip = w === 0 && points > 0 ? `+${points} fight points` : w === 1 && v.mode === "pvp" ? "The saved copy won" : starWord(winner.tier);
  const title = v.end === "ko" ? "KNOCKOUT" : "TIME RAN OUT";
  /**
   * THE CARD IS A PORTRAIT OF THE ROBOT, NOT A TABLE OF NUMBERS (Mike,
   * 2026-09-05: a player has to feel ownership over how cute it is, and
   * nobody posts a scoreboard of their own toy).
   *
   * So the robot got bigger, and the reader gets ONE warm sentence about
   * what it did instead of a row that read "beat Rusty Beetle (Copper
   * Falcon), head off at 1:22". The name is printed directly above the
   * sentence, so the sentence says "it".
   */
  const didLine = v.end === "ko" ? fill(STRINGS.en.card.beat, { loser: loser.name }) : STRINGS.en.card.stoodUp;
  const loserSize = 260;
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: BACKGROUND, color: TEXT, fontFamily: FONT_BODY }}>
        {/* the lit pit floor under the winner */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
            display: "flex",
            background: "radial-gradient(ellipse 30% 22% at 24% 88%, rgba(217,164,65,0.28) 0%, rgba(207,198,184,0.10) 45%, transparent 75%)",
          }}
        />
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", flexDirection: "column", padding: 44 }}>
          {wordmark(host, `/bots/fight/${v.id}`)}

          <div style={{ display: "flex", flexGrow: 1, alignItems: "center", marginTop: 4 }}>
            {/* LEFT 540: the winner standing, the loser cracked behind. The
                winner is the biggest thing on the card, because the robot is
                what a person would post. */}
            <div style={{ display: "flex", width: 540, height: 470, position: "relative", alignItems: "flex-end", justifyContent: "center" }}>
              <div style={{ position: "absolute", left: 310, top: 168, display: "flex", width: loserSize, height: loserSize }}>
                {artL ? <Bot src={artL} size={loserSize} opacity={0.28} mirror /> : null}
                <Crack size={loserSize} mirror />
              </div>
              <div style={{ display: "flex", marginBottom: 12 }}>
                {artW ? <Bot src={artW} size={470} /> : null}
              </div>
            </div>

            {/* RIGHT: the words. Four lines, and one of them is warm. */}
            {/* 540 + 8 + 560 = 1108, inside the 1112 the 44px padding
                leaves. The columns used to add up to 1132 and were being
                squeezed by yoga to fit. */}
            <div style={{ display: "flex", flexDirection: "column", width: 560, marginLeft: 8 }}>
              <div style={{ display: "flex", fontFamily: FONT_TOY, fontSize: 72, fontWeight: 800, color: CREAM, lineHeight: 1 }}>{title}</div>
              <div style={{ display: "flex", fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 700, color: TEXT, marginTop: 14, lineHeight: 1.1 }}>{winner.name}</div>
              <div style={{ display: "flex", fontFamily: FONT_TOY, fontSize: 30, fontWeight: 800, color: CREAM, marginTop: 12, lineHeight: 1.2 }}>{didLine}</div>
              <div style={{ display: "flex", fontSize: 21, color: MUTED, marginTop: 12 }}>
                {`${winner.wallet}, ${starWord(winner.tier)}, ${winLossWords(winner.wins, winner.losses)}`}
              </div>
              <div style={{ display: "flex", fontSize: 19, color: LORE, marginTop: 10, lineHeight: 1.35 }}>{v.chain}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
                {chip(pointsChip, points > 0 && w === 0 ? GOLD : LORE)}
                {chip("Watch it again", ACCENT)}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts },
  );
}

function genericCard(fonts: Fonts, host: string) {
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: BACKGROUND, color: TEXT, fontFamily: FONT_BODY, padding: 56 }}>
        {wordmark(host, "/bots")}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontFamily: FONT_TOY, fontSize: 64, fontWeight: 800, color: CREAM, lineHeight: 1 }}>Watch robots fight.</div>
          <div style={{ display: "flex", fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 700, marginTop: 18, lineHeight: 1.1 }}>{STRINGS.en.landing.headline}</div>
          <div style={{ display: "flex", fontSize: 26, color: LORE, marginTop: 18 }}>{STRINGS.en.landing.sub}</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {chip("Five robots", LORE)}
          {chip("Two fights a day", ACCENT)}
          {chip("Watch every fight again", GOLD)}
        </div>
      </div>
    ),
    { width: W, height: H, fonts },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const f = String(url.searchParams.get("f") || "").slice(0, 20);
  const fonts = await loadFonts(url.origin);

  let view: FightView | null = null;
  try {
    const row = f ? await loadBattle(botsDb(), f) : null;
    // sparring is private: it gets the generic card like an unknown id
    if (row && row.status === "resolved" && row.result && row.mode !== "spar") view = fightView(row, null);
  } catch {
    view = null; // fail soft: the generic card below
  }

  try {
    const res = view ? await koCard(view, fonts, url.origin, url.host) : genericCard(fonts, url.host);
    res.headers.set("Cache-Control", view ? "public, max-age=3600" : "public, max-age=300");
    return res;
  } catch {
    // Satori itself failed (e.g. the Windows default-font bug with no fonts
    // fetched): a plain 500 beats a hung scrape.
    return new Response("card unavailable", { status: 500 });
  }
}
