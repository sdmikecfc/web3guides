/**
 * Season 4 — the shareable PERSONNEL CARD as a PNG for the web Profile page
 * (Mike 2026-07-15: "Profile page should also load the beautiful and shareable
 * card from /assassin me"). The web twin of the bot's renderS4MeCard: the
 * player's character art FULL-BLEED with the classified dossier overlay + their
 * Bounty / Gold / contracts / standing on top.
 *
 *   POST /api/s4/card  { t }   ->  image/png (1000x1400) for the session's wallet
 *   GET  /api/s4/card?demo=1   ->  a mock card (DEV ONLY) for render-checks
 *
 * Session-gated (game-session token) so it renders the caller's own card; the
 * token stays in the POST body, never a URL. The character art loads by ABSOLUTE
 * URL from this same origin (Vercel serves /s4-art via the CDN; fs reads of
 * public/ are not reliable in a serverless function). next/og (Satori) renders.
 */
import { ImageResponse } from "next/og";
import { s4Db, SEASON_KEY } from "@/lib/s4/server";
import { getSeasonSnapshot } from "@/lib/s4/data";
import { walletForSession } from "@/lib/s4/me";
import { resolveModel } from "@/lib/s4/model";
import { DEFAULT_THEME } from "@/lib/s4/theme";

export const runtime = "nodejs";

const INK = "#080b12";
const GOLD = "#f0b340";
const CRIMSON = "#e33d4e";
const W = 1000;
const H = 1400;

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
function ownName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "Agent";
  if (WALLET_RE.test(s)) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  return s.slice(0, 22);
}
// Strip emoji the render font can't draw (team names carry a leading glyph).
// ES5 target: no `u` flag / `\u{}` escapes, so match astral emoji via surrogate
// pairs plus the common BMP symbol ranges + variation selectors.
function safe(s: string): string {
  return String(s || "")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[←-➿⬀-⯿︀-️‍⃣]/g, "")
    .trim();
}

type CardData = {
  artUrl: string;
  accent: string;
  seasonName: string;
  name: string;
  teamName: string;
  pointsWord: string;
  currencyWord: string;
  targetsWord: string;
  bondedWord: string;
  points: number;
  gold: number;
  rank: number;
  bonded: number;
  totalT: number;
  standing: string;
};

async function renderCard(d: CardData, origin: string) {
  // Give Satori an explicit font (fetched over HTTP from our own /public, works
  // on Vercel's CDN and local dev). This also SIDESTEPS a Windows-dev bug where
  // @vercel/og fails loading its bundled default font via a malformed file:// path.
  let fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] | undefined;
  try {
    const [rg, bd] = await Promise.all([
      fetch(origin + "/s4-art/fonts/AktivGrotesk_Rg.ttf").then((r) => r.arrayBuffer()),
      fetch(origin + "/s4-art/fonts/AktivGrotesk_Bd.ttf").then((r) => r.arrayBuffer()),
    ]);
    fonts = [
      { name: "Aktiv", data: rg, weight: 400, style: "normal" },
      { name: "Aktiv", data: bd, weight: 700, style: "normal" },
    ];
  } catch {
    fonts = undefined; // fall back to the default (works on Vercel)
  }

  const label: React.CSSProperties = { fontSize: 20, letterSpacing: 3, color: "#8b95ad", textTransform: "uppercase" };
  const stat = (l: string, v: string, c: string): React.ReactElement => (
    <div style={{ display: "flex", flexDirection: "column", width: 380 }}>
      <div style={label}>{l}</div>
      <div style={{ fontSize: 58, fontWeight: 700, color: c, marginTop: 2 }}>{v}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: INK, fontFamily: "Aktiv" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={d.artUrl}
          width={W}
          height={H}
          style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", objectPosition: "top center" }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(8,11,18,0.82) 0%, rgba(8,11,18,0) 20%, rgba(8,11,18,0) 42%, rgba(8,11,18,0.82) 60%, rgba(8,11,18,0.97) 100%)",
          }}
        />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", padding: 48 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: GOLD, letterSpacing: 1 }}>{d.seasonName}</div>
              <div style={{ fontSize: 18, letterSpacing: 6, color: "#8b95ad", marginTop: 4 }}>PERSONNEL FILE</div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 4,
                color: CRIMSON,
                border: "3px solid " + CRIMSON,
                borderRadius: 6,
                padding: "6px 16px",
                transform: "rotate(-4deg)",
              }}
            >
              CLASSIFIED
            </div>
          </div>

          <div style={{ display: "flex", flexGrow: 1 }} />

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: W - 96 }}>
            <div style={{ fontSize: 92, fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>{d.name}</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: d.accent, marginTop: 10 }}>{d.teamName}</div>
            <div style={{ fontSize: 22, letterSpacing: 3, color: "#8f97a8", marginTop: 8 }}>LEVEL {d.rank} OF 12</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 38 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
              {stat(d.pointsWord, d.points.toLocaleString("en-US"), GOLD)}
              {stat(d.currencyWord, d.gold.toLocaleString("en-US"), "#e8ecf5")}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {stat(`${d.targetsWord} ${d.bondedWord}`.toUpperCase(), `${d.bonded} OF ${d.totalT}`, "#e8ecf5")}
              {stat("Standing", d.standing, "#e8ecf5")}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
            <div style={{ fontSize: 24, color: GOLD, fontWeight: 700 }}>
              {d.pointsWord} win the cash. Only {d.bondedWord} {d.targetsWord} pay.
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts },
  );
}

async function cardDataForWallet(req: Request, wallet: string): Promise<CardData> {
  const db = s4Db();
  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("skin, team_key, display_name, points, play_currency, rank")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();

  let snap = null;
  try {
    snap = await getSeasonSnapshot();
  } catch {
    snap = null;
  }
  const teams = snap?.teams ?? [];
  const teamKey = typeof player?.team_key === "string" ? player.team_key : null;
  const teamIdx = teamKey ? teams.findIndex((x) => x.key === teamKey) : -1;
  const theme = snap?.theme ?? DEFAULT_THEME;
  const themeTeam = theme.teams.find((x) => x.key === teamKey) || null;
  const origin = new URL(req.url).origin;

  return {
    artUrl: origin + resolveModel(player?.skin, teamKey).art,
    accent: themeTeam?.accent || GOLD,
    seasonName: safe(theme.seasonName).toUpperCase(),
    name: ownName(player?.display_name),
    teamName: themeTeam ? safe(themeTeam.name).toUpperCase() : "NO TEAM ON RECORD",
    pointsWord: theme.points,
    currencyWord: theme.playCurrency,
    targetsWord: safe(theme.target.plural).toUpperCase(),
    bondedWord: safe(theme.bondedWord).toUpperCase(),
    points: Math.round(Number(player?.points) || 0),
    gold: Math.round(Number(player?.play_currency) || 0),
    rank: Math.max(1, Math.min(12, Number(player?.rank) || 1)),
    bonded: snap?.totals?.bonded ?? 0,
    totalT: snap?.totals?.total ?? 5,
    standing: teamIdx >= 0 ? `#${teamIdx + 1} OF ${teams.length || 3}` : "UNASSIGNED",
  };
}

export async function POST(req: Request) {
  let body: { t?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const wallet = await walletForSession(s4Db(), body.t);
  if (!wallet) return new Response("session expired", { status: 401 });
  return renderCard(await cardDataForWallet(req, wallet), new URL(req.url).origin);
}

// Render check: /api/s4/card?demo=1 renders a fixed MOCK card (no session, no
// real player data) so the layout can be eyeballed on the live site — the
// @vercel/og render cannot run on Windows dev (a known Next-on-Windows bug in
// its default-font loader), only on Vercel. Harmless to expose (mock only).
export async function GET(req: Request) {
  if (!new URL(req.url).searchParams.get("demo")) return new Response("POST with a session token", { status: 400 });
  const origin = new URL(req.url).origin;
  const t = DEFAULT_THEME;
  return renderCard({
    artUrl: origin + "/s4-art/cast-grid-b1d0o2.png",
    accent: t.teams[2].accent,
    seasonName: safe(t.seasonName).toUpperCase(),
    name: "Big Mike",
    teamName: safe(t.teams[2].name).toUpperCase(),
    pointsWord: t.points,
    currencyWord: t.playCurrency,
    targetsWord: safe(t.target.plural).toUpperCase(),
    bondedWord: safe(t.bondedWord).toUpperCase(),
    points: 1081,
    gold: 58,
    rank: 3,
    bonded: 0,
    totalT: 5,
    standing: "#2 OF 3",
  }, origin);
}
