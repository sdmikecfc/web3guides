/**
 * Conquer the Seas. Active Duels board (image).
 *
 *   /api/launch-wars/og/seas-duels   (?test=1 to include sandbox duels)
 *
 * Landscape (1200x630) board the Discord bot posts for "!seas duels": every live
 * duel as challenger-vs-target with each captain's BEST Gunnery score today (the
 * same number the duel settles on), the stake, and the time left. Reads the
 * launch_wars_s2_battles duel rows + launch_wars_s2_duty_runs Gunnery scores.
 *
 * Glyph note: next/og renders EMOJI (⚔️🪙⏳🥇) but NOT symbol glyphs like ★/①, which
 * tofu. Everything here is emoji or plain text on purpose. Times are rendered as
 * literal text ("12m left") since Discord's <t:> only works in message text.
 */

import { ImageResponse } from "next/og";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 40;

const WEB_BASE = (
  process.env.WEB3GUIDES_BASE_URL ||
  (process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : "https://web3guides.com")
).replace(/\/$/, "");

const C = {
  gold: "#f0b45c",
  goldBright: "#ffcf7e",
  fg: "#f8fdff",
  fg2: "rgba(248,253,255,0.82)",
  fg3: "rgba(248,253,255,0.55)",
  ink: "#00080d",
  green: "#3de3a4",
  row: "rgba(248,253,255,0.05)",
};

type Plunder = {
  stake?: number;
  open?: boolean;
  challenger?: string;
  challenger_name?: string;
  target?: string;
  target_name?: string;
};
type Duel = {
  id: number;
  status: string;
  created_at: string;
  resolve_at: string | null;
  join_until: string | null;
  plunder: Plunder | null;
};

const artCache = new Map<string, { data: string | null; at: number }>();
const ART_CACHE_TTL_MS = 10 * 60 * 1000;
async function inlineImage(url: string): Promise<string | null> {
  const hit = artCache.get(url);
  if (hit && Date.now() - hit.at < ART_CACHE_TTL_MS) return hit.data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { artCache.set(url, { data: null, at: Date.now() }); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || "image/png";
    const data = `data:${ct};base64,${buf.toString("base64")}`;
    artCache.set(url, { data, at: Date.now() });
    return data;
  } catch {
    artCache.set(url, { data: null, at: Date.now() });
    return null;
  }
}

const dayStartMs = (iso: string) => Date.parse(`${new Date(iso).toISOString().slice(0, 10)}T00:00:00Z`);
function shortName(n: string | undefined, fallback: string): string {
  const s = String(n || fallback || "Captain").trim();
  return s.length > 16 ? s.slice(0, 15) + "…" : s;
}
function timeLeft(targetIso: string | null): string {
  if (!targetIso) return "—";
  const ms = Date.parse(targetIso) - Date.now();
  if (ms <= 0) return "resolving…";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m left` : `${h}h left`;
}

export async function GET(req: Request) {
  const includeTest = new URL(req.url).searchParams.get("test") === "1";
  const db = launchWarsDb();

  let duels: Duel[] = [];
  try {
    let q = db
      .from("launch_wars_s2_battles")
      .select("id, status, created_at, resolve_at, join_until, plunder")
      .eq("season_key", "s2")
      .eq("kind", "duel")
      .in("status", ["challenged", "joining"])
      .order("resolve_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(40);
    if (!includeTest) q = q.eq("is_test", false);
    const { data } = await q;
    duels = (data as Duel[]) || [];
  } catch {
    /* render the empty state rather than 500 */
  }

  // Best Gunnery score TODAY for every captain in an in-progress (joining) duel —
  // the same number the duel settles on. One query, scored per duel's day.
  const joining = duels.filter((d) => d.status === "joining");
  const ids = Array.from(new Set(joining.flatMap((d) => [d.plunder?.challenger, d.plunder?.target]).filter(Boolean) as string[]));
  let runs: { discord_id: string; score: number; created_at: string }[] = [];
  if (ids.length) {
    try {
      let rq = db
        .from("launch_wars_s2_duty_runs")
        .select("discord_id, score, created_at")
        .eq("season_key", "s2")
        .eq("game", "gunnery")
        .in("discord_id", ids)
        .gte("created_at", new Date(Date.now() - 48 * 3600000).toISOString());
      if (!includeTest) rq = rq.eq("is_test", false);
      const { data } = await rq;
      runs = (data as typeof runs) || [];
    } catch {
      runs = [];
    }
  }
  const bestSince = (id: string | undefined, sinceMs: number): number | null => {
    if (!id) return null;
    let best = 0;
    let has = false;
    for (const r of runs) {
      if (r.discord_id !== id) continue;
      if (Date.parse(r.created_at) < sinceMs) continue;
      has = true;
      best = Math.max(best, Number(r.score) || 0);
    }
    return has ? best : null;
  };

  const bg = await inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`);

  // Grow the canvas to fit every active duel (a fixed 630px only showed ~6, so
  // people reported being "missing"). Compact rows + a height that scales with the
  // count, capped so a huge field still renders; any remainder shows as "+N more".
  const MAX_SHOWN = 18;
  const shown = duels.slice(0, MAX_SHOWN);
  const overflow = Math.max(0, duels.length - shown.length);
  const ROW_H = 50;
  const ROW_GAP = 9;
  const W = 1200;
  const H = shown.length
    ? Math.max(380, 34 + 80 + shown.length * (ROW_H + ROW_GAP) + (overflow ? 30 : 0) + 30 + 34)
    : 630;

  const scoreChip = (val: number | null, leading: boolean) => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minWidth: 64, height: 38, padding: "0 12px", borderRadius: 9,
      background: leading ? "rgba(61,227,164,0.16)" : "rgba(248,253,255,0.06)",
      border: `1px solid ${leading ? "rgba(61,227,164,0.5)" : "rgba(248,253,255,0.12)"}`,
      fontSize: 23, fontWeight: 800, color: leading ? C.green : C.fg2,
    }}>
      {val === null ? "—" : val.toLocaleString("en-US")}
    </div>
  );

  const row = (d: Duel) => {
    const p = d.plunder || {};
    const accepted = d.status === "joining";
    const open = !accepted && (p.open === true || !p.target);
    const sinceMs = dayStartMs(d.created_at);
    const cs = accepted ? bestSince(p.challenger, sinceMs) : null;
    const ts = accepted ? bestSince(p.target, sinceMs) : null;
    const cLead = accepted && cs !== null && (ts === null || cs > ts);
    const tLead = accepted && ts !== null && (cs === null || ts > cs);
    const when = accepted ? timeLeft(d.resolve_at) : `accept ${timeLeft(d.join_until)}`;
    const stake = Math.round(Number(p.stake) || 0);
    return (
      <div
        key={d.id}
        style={{
          display: "flex", flexDirection: "row", alignItems: "center",
          width: 1088, height: ROW_H, padding: "0 20px", marginBottom: ROW_GAP,
          borderRadius: 13, background: C.row,
          border: `1px solid ${accepted ? "rgba(240,180,92,0.32)" : "rgba(248,253,255,0.1)"}`,
        }}
      >
        <span style={{ display: "flex", fontSize: 22, marginRight: 12 }}>⚔️</span>
        <span style={{ display: "flex", width: 220, justifyContent: "flex-end", fontSize: 23, fontWeight: 700, color: cLead ? C.green : C.fg }}>
          {shortName(p.challenger_name, p.challenger || "")}
        </span>
        <div style={{ display: "flex", marginLeft: 12 }}>{scoreChip(cs, cLead)}</div>
        <span style={{ display: "flex", width: 56, justifyContent: "center", fontSize: 16, fontWeight: 800, color: C.fg3 }}>VS</span>
        <div style={{ display: "flex", marginRight: 12 }}>{scoreChip(ts, tLead)}</div>
        <span style={{ display: "flex", width: 220, fontSize: 23, fontWeight: 700, color: open ? C.goldBright : (tLead ? C.green : C.fg) }}>
          {open ? "🔓 OPEN" : shortName(p.target_name, p.target || "")}
        </span>
        <span style={{ display: "flex", flexGrow: 1, justifyContent: "flex-end", fontSize: 19, fontWeight: 800, color: C.gold }}>
          🪙 {stake}
        </span>
        <span style={{ display: "flex", width: 158, justifyContent: "flex-end", fontSize: 18, fontWeight: 700, color: accepted ? C.goldBright : C.fg3 }}>
          ⏳ {when}
        </span>
      </div>
    );
  };

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, background: C.ink, fontFamily: "Georgia, 'Times New Roman', serif", overflow: "hidden" }}>
        {bg ? <img src={bg} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,8,13,0.9) 0%, rgba(0,8,13,0.82) 50%, rgba(0,8,13,0.92) 100%)", display: "flex" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: W, height: H, padding: "34px 50px" }}>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
            <span style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: 8, color: C.gold, textTransform: "uppercase" }}>
              Conquer the Seas
            </span>
            <span style={{ display: "flex", fontSize: 40, fontWeight: 800, color: C.fg, marginTop: 2 }}>
              Active Duels <span style={{ display: "flex", fontSize: 20, fontWeight: 700, color: C.fg3, marginLeft: 14, marginTop: 14 }}>best Gunnery run today wins</span>
            </span>
          </div>

          {shown.length ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {shown.map((d) => row(d))}
              {overflow ? (
                <span style={{ display: "flex", fontSize: 18, fontWeight: 700, color: C.fg3, marginTop: 2 }}>
                  + {overflow} more duel{overflow === 1 ? "" : "s"} afoot
                </span>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", height: 260, fontSize: 26, color: C.fg3 }}>
              No duels afoot. Throw down: !seas duel @captain &lt;stake&gt;.
            </div>
          )}

          <span style={{ display: "flex", marginTop: "auto", paddingTop: 8, fontSize: 16, fontWeight: 700, color: C.goldBright }}>
            🟢 = leading · !seas duel @captain &lt;stake&gt; to challenge · !seas play to bank a Gunnery run
          </span>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "no-store" } },
  );
}
