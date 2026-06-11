/**
 * OG Tournament — full bracket visualization.
 *
 * Horizontal 3-column tree: R16 (8 matches) → QF (4) → SF (2).
 * Each match shows competitors with seed + winner highlighted if resolved.
 */

import { ImageResponse } from "next/og";
import { ogTournamentDb } from "@/lib/og-tournament/supabase";
import { loadCjkFonts } from "@/lib/og-tournament/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const C = {
  bgFrom:      "#070b1a",
  bgMid:       "#0a0e27",
  bgTo:        "#1a0b3d",
  violet:      "#7c6aff",
  violetLight: "#a78bfa",
  white:       "#f8fafc",
  muted:       "#7a89b8",
  amber:       "#f0b340",
  green:       "#34d399",
  rowAlt:      "rgba(255,255,255,0.025)",
  cardBg:      "rgba(13,17,32,0.7)",
  cardBorder:  "rgba(124,106,255,0.25)",
};

function shortNameFor(discordId: string, displayName?: string | null): string {
  // NFKC collapses decorative Unicode variants (e.g. Mathematical Bold "𝐊𝐚𝐫𝐓𝐡𝐢𝐤")
  // back to plain ASCII so they render with any font instead of tofu boxes.
  const clean = displayName?.normalize("NFKC");
  if (clean) return clean.length > 16 ? clean.slice(0, 15) + "…" : clean;
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

interface MatchCell {
  position: number;
  a?: { id: string; seed: number | null };
  b?: { id: string; seed: number | null };
  winner_id?: string | null;
}

/**
 * Deterministic shuffle keyed by `seed`. MUST stay byte-equivalent to the
 * bot's `shuffledPairings()` in modules/og-tournament/index.js so that the
 * web preview image matches what the bot's text preview shows. If you change
 * one, change both.
 */
function _fnv1aHash(input: string | number): number {
  const s = String(input);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function _mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffledPairings<T>(ids: T[], seed: number | string): [T, T][] {
  const rand = _mulberry32(_fnv1aHash(seed));
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const pairs: [T, T][] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  return pairs;
}

export async function GET(
  req: Request,
  { params }: { params: { tournamentId: string } }
) {
  const tid = parseInt(params.tournamentId, 10);
  if (!Number.isFinite(tid)) return new Response("Invalid tournament id", { status: 400 });

  const preview = new URL(req.url).searchParams.get("preview") === "1";

  const db = ogTournamentDb();
  const { data: t } = await db
    .from("og_tournaments")
    .select("*")
    .eq("tournament_id", tid)
    .maybeSingle();
  if (!t) return new Response("Tournament not found", { status: 404 });

  // Two data sources:
  //   - Normal mode: pull committed matches from og_bracket_matches (the live bracket)
  //   - Preview mode: synthesize R16 matches from current standings + the same
  //     deterministic shuffle the bot uses, with no DB writes anywhere.
  let matches: any[] = [];
  if (preview) {
    const { data: tally } = await db
      .from("og_recommendation_tally")
      .select("tournament_id, recommended_discord_id, rec_count, first_recommended_at")
      .eq("tournament_id", tid)
      .order("rec_count", { ascending: false })
      .order("first_recommended_at", { ascending: true })
      .limit(16);
    const top16 = tally || [];
    const ids = top16.map((r: any) => r.recommended_discord_id);
    const rankById = new Map<string, number>();
    top16.forEach((r: any, i: number) => rankById.set(r.recommended_discord_id, i + 1));

    // Pad to 16 so the shuffle still produces 8 pairs even if early-preview
    const padded: (string | null)[] = ids.slice();
    while (padded.length < 16) padded.push(null);
    const pairs = shuffledPairings(padded, tid);

    matches = pairs.map(([idA, idB], i) => ({
      tournament_id:   tid,
      round_name:      "ROUND_16",
      position:        i + 1,
      competitor_a_id: idA,
      competitor_b_id: idB,
      seed_a:          idA ? rankById.get(idA) ?? null : null,
      seed_b:          idB ? rankById.get(idB) ?? null : null,
      winner_id:       null,
    }));
  } else {
    const { data } = await db
      .from("og_bracket_matches")
      .select("tournament_id, round_name, position, competitor_a_id, competitor_b_id, seed_a, seed_b, winner_id")
      .eq("tournament_id", tid)
      .order("position", { ascending: true });
    matches = data ?? [];
  }

  const m = matches;
  const r16 = m.filter((x: any) => x.round_name === "ROUND_16");
  const qf = m.filter((x: any) => x.round_name === "QUARTERS");
  const sf = m.filter((x: any) => x.round_name === "SEMIS");

  // Resolve names
  const allIds = new Set<string>();
  for (const match of m) {
    allIds.add(match.competitor_a_id);
    allIds.add(match.competitor_b_id);
  }
  const idArr = Array.from(allIds);
  const { data: userRows } = idArr.length
    ? await db.from("fantasy_users").select("discord_id, display_name").in("discord_id", idArr)
    : { data: [] as any[] };
  const nameById = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.display_name) nameById.set(u.discord_id, u.display_name);
  }

  function toCell(match: any): MatchCell {
    return {
      position: match.position,
      a: match.competitor_a_id ? { id: match.competitor_a_id, seed: match.seed_a } : undefined,
      b: match.competitor_b_id ? { id: match.competitor_b_id, seed: match.seed_b } : undefined,
      winner_id: match.winner_id,
    };
  }

  // Pad arrays so we always render the full bracket structure
  function pad(arr: any[], size: number): MatchCell[] {
    const out = arr.map(toCell);
    while (out.length < size) out.push({ position: out.length + 1 });
    return out;
  }
  const r16Cells = pad(r16, 8);
  const qfCells = pad(qf, 4);
  const sfCells = pad(sf, 2);

  // Compute current "live" round for highlight
  const liveRound = t.status; // ROUND_16, QUARTERS, SEMIS, COMPLETE
  function roundColor(roundName: string): string {
    if (liveRound === roundName) return C.amber;
    return C.violet;
  }

  function MatchBox({ cell, round, columnHeight }: { cell: MatchCell; round: string; columnHeight: number }) {
    const accent = roundColor(round);
    const winnerId = cell.winner_id;
    const aName = cell.a ? shortNameFor(cell.a.id, nameById.get(cell.a.id) || null) : "—";
    const bName = cell.b ? shortNameFor(cell.b.id, nameById.get(cell.b.id) || null) : "—";
    const aWins = winnerId && cell.a && winnerId === cell.a.id;
    const bWins = winnerId && cell.b && winnerId === cell.b.id;

    const cellHeight = (columnHeight - 16) / (round === "ROUND_16" ? 8 : round === "QUARTERS" ? 4 : 2);

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: cellHeight - 6,
          background: C.cardBg,
          border: `1px solid ${accent}33`,
          borderRadius: 6,
          padding: "8px 12px",
          justifyContent: "space-around",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {cell.a?.seed && (
            <span style={{ display: "flex", fontSize: 10, color: C.muted, fontFamily: "monospace", width: 18 }}>
              #{cell.a.seed}
            </span>
          )}
          <span
            style={{
              display: "flex",
              fontSize: 14,
              color: aWins ? C.green : (cell.a ? C.white : C.muted),
              fontWeight: aWins ? 800 : 500,
              flex: 1,
              overflow: "hidden",
            }}
          >
            {aName}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {cell.b?.seed && (
            <span style={{ display: "flex", fontSize: 10, color: C.muted, fontFamily: "monospace", width: 18 }}>
              #{cell.b.seed}
            </span>
          )}
          <span
            style={{
              display: "flex",
              fontSize: 14,
              color: bWins ? C.green : (cell.b ? C.white : C.muted),
              fontWeight: bWins ? 800 : 500,
              flex: 1,
              overflow: "hidden",
            }}
          >
            {bName}
          </span>
        </div>
      </div>
    );
  }

  const columnHeight = 700;

  const fonts = await loadCjkFonts();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
          padding: "32px 40px",
          fontFamily: "NotoSansJP, Inter, system-ui, sans-serif",
          color: C.white,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 12, color: C.amber, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>
              {t.display_name} OG Tournament
            </span>
            <span style={{ fontSize: 32, fontWeight: 900, color: C.white, marginTop: 4 }}>
              {preview ? "Bracket · Preview" : "Bracket"}
            </span>
          </div>
          <span style={{ fontSize: 13, color: preview ? C.amber : C.violetLight, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
            {preview ? "Random matchups · not committed" :
             liveRound === "RECOMMEND" ? "Pending" :
             liveRound === "ROUND_16" ? "Round of 16 · LIVE" :
             liveRound === "QUARTERS" ? "Quarter Finals · LIVE" :
             liveRound === "SEMIS" ? "Semi Finals · LIVE" :
             "Complete"}
          </span>
        </div>

        {/* Bracket columns */}
        <div style={{ display: "flex", gap: 24, height: columnHeight }}>
          {/* R16 */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "center", fontSize: 12, color: roundColor("ROUND_16"), letterSpacing: 3, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
              Round of 16
            </div>
            {r16Cells.map((cell, i) => (
              <MatchBox key={i} cell={cell} round="ROUND_16" columnHeight={columnHeight} />
            ))}
          </div>

          {/* QF */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6, justifyContent: "space-around" }}>
            <div style={{ display: "flex", justifyContent: "center", fontSize: 12, color: roundColor("QUARTERS"), letterSpacing: 3, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
              Quarter Finals
            </div>
            {qfCells.map((cell, i) => (
              <MatchBox key={i} cell={cell} round="QUARTERS" columnHeight={columnHeight} />
            ))}
          </div>

          {/* SF */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6, justifyContent: "space-around" }}>
            <div style={{ display: "flex", justifyContent: "center", fontSize: 12, color: roundColor("SEMIS"), letterSpacing: 3, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
              Semi Finals
            </div>
            {sfCells.map((cell, i) => (
              <MatchBox key={i} cell={cell} round="SEMIS" columnHeight={columnHeight} />
            ))}
          </div>

          {/* Winners column (post-SF) */}
          <div style={{ display: "flex", flexDirection: "column", width: 220, justifyContent: "space-around", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "center", fontSize: 12, color: C.amber, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
              New OGs
            </div>
            {sfCells.map((sfMatch, i) => {
              const winnerId = sfMatch.winner_id;
              const name = winnerId ? shortNameFor(winnerId, nameById.get(winnerId) || null) : "?";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: winnerId ? "rgba(240,179,64,0.10)" : C.cardBg,
                    border: `1px solid ${winnerId ? C.amber : C.muted}44`,
                    borderRadius: 8,
                    padding: "14px 12px",
                    flex: 1,
                  }}
                >
                  <span style={{ display: "flex", fontSize: 22, marginRight: 8 }}>👑</span>
                  <span style={{ display: "flex", fontSize: 16, color: winnerId ? C.amber : C.muted, fontWeight: 800 }}>
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 16, fontSize: 12, color: C.muted, letterSpacing: 1 }}>
          <span style={{ display: "flex" }}>React 🅰️ / 🅱️ on each match card to vote</span>
          <span style={{ display: "flex" }}>Highlighted name = round winner</span>
        </div>
      </div>
    ),
    {
      width: 1600,
      height: 900,
      fonts,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    }
  );
}
